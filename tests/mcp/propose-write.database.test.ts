import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  cleanupMcpOAuth, createWriter, issueMcpToken, type IssuedToken, type Writer,
} from '../helpers/mcp-oauth';

/**
 * 14-03 proposal RPCs (0051) on a disposable Supabase project.
 * mcp_save_draft / mcp_propose_kb_create / mcp_propose_kb_edit are the only OAuth write paths:
 * they insert pending rows into mcp_drafts / mcp_kb_proposals and never touch chapters or
 * kb_nodes. Every call goes through real PostgREST with a real OAuth access token.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project. The suite never applies
 * migrations and never prints tokens or response bodies.
 */
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(process.env.MCP_DISPOSABLE_PROJECT_REF?.trim() && dbUrl && apiUrl && anonKey
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const CAP = 30;
const DRAFT_MAX = 30_000;
const KB_MAX = 50_000;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

type RpcResult = { status: number; raw: string; json: unknown };
type Row = { out_id: string; out_duplicate: boolean };

describe.skipIf(!ready)('MCP proposal RPCs on disposable Supabase (0051)', () => {
  let sql: ReturnType<typeof postgres>;
  let writerA: Writer;
  let writerB: Writer;
  let aTok: IssuedToken;
  let bTok: IssuedToken;
  let aBrowser: string;
  const clientIds: string[] = [];
  const f = {} as Record<
    'wA' | 'wA2' | 'wAdel' | 'wCap' | 'wB' | 'cA' | 'cA2' | 'cAdel' | 'cInDel' | 'cCap' | 'cB'
    | 'kFolder' | 'kFile' | 'kOther' | 'kLocked' | 'kTplFolder' | 'kTpl' | 'kAcct' | 'kDeleted' | 'kBig' | 'kB' | 'kBFolder',
    string>;
  let originals: unknown;
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  async function rpc(fn: string, bearer: string, body: Record<string, unknown>): Promise<RpcResult> {
    const response = await fetch(`${apiUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey!, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let json: unknown = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
    return { status: response.status, raw, json };
  }
  const saveDraft = (bearer: string, work: string, chapter: string, body: string) =>
    rpc('mcp_save_draft', bearer, { p_work_id: work, p_chapter_id: chapter, p_body: body });
  const kbCreate = (bearer: string, work: string, category: string, name: string, body: string) =>
    rpc('mcp_propose_kb_create', bearer, { p_work_id: work, p_category: category, p_name: name, p_body: body });
  const kbEdit = (bearer: string, work: string, node: string, body: string) =>
    rpc('mcp_propose_kb_edit', bearer, { p_work_id: work, p_node_id: node, p_body: body });

  const ok = (result: RpcResult): Row => {
    expect(result.status, result.status === 200 ? '' : String((result.json as { message?: string })?.message)).toBe(200);
    const rows = result.json as Row[];
    expect(rows).toHaveLength(1);
    return rows[0];
  };
  const marker = (result: RpcResult, expected: string) => {
    expect(result.status).toBe(400);
    expect((result.json as { message?: string }).message).toBe(expected);
  };
  const forbidden = (result: RpcResult) => {
    expect(result.status).toBe(403);
    expect((result.json as { code?: string }).code).toBe('42501');
  };
  const pendingCount = async (work: string) => Number((await query(`select
      (select count(*) from public.mcp_drafts where work_id = $1 and status = 'pending')
    + (select count(*) from public.mcp_kb_proposals where work_id = $1 and status = 'pending') as n`, [work]))[0].n);
  const snapshotOriginals = async () => ({
    chapters: await query('select id, content, updated_at, title from public.chapters where work_id = any($1::uuid[]) order by id',
      [[f.wA, f.wA2, f.wAdel, f.wCap, f.wB]]),
    kb: await query('select id, content, updated_at, name, is_locked, deleted_at from public.kb_nodes where owner_id = any($1::uuid[]) order by id',
      [[writerA.id, writerB.id]]),
  });
  /** Writes the sanction cache the way the admin RPCs do (guarded by app.sanction_cache_writer). */
  async function setSanction(userId: string, kind: 'none' | 'suspension' | 'permanent_suspension', until: string | null) {
    await sql.begin(async (tx) => {
      await tx.unsafe("select set_config('app.sanction_cache_writer', 'on', true)");
      await tx.unsafe('update public.profiles set sanction_kind = $2, sanctioned_until = $3::timestamptz where id = $1',
        [userId, kind, until]);
    });
  }

  beforeAll(async () => {
    assertDisposableRef();
    process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
    sql = postgres(dbUrl!, { max: 2, prepare: false });
    writerA = await createWriter();
    writerB = await createWriter();
    aTok = await issueMcpToken(writerA, { clientName: 'mcp-test-propose-A' });
    bTok = await issueMcpToken(writerB, { clientName: 'mcp-test-propose-B' });
    clientIds.push(aTok.clientId, bTok.clientId);
    const session = (await writerA.browser.auth.getSession()).data.session;
    if (!session) throw new Error('Expected a live browser session for writer A');
    aBrowser = session.access_token;

    for (const key of ['wA', 'wA2', 'wAdel', 'wCap', 'wB', 'cA', 'cA2', 'cAdel', 'cInDel', 'cCap', 'cB',
      'kFolder', 'kFile', 'kOther', 'kLocked', 'kTplFolder', 'kTpl', 'kAcct', 'kDeleted', 'kBig', 'kB', 'kBFolder'] as const) {
      f[key] = randomUUID();
    }
    // Fixtures are inserted directly (superuser connection) so RLS does not shape them.
    await query(`insert into public.works (id, owner_id, title, deleted_at) values
      ($1, $6, 'propose A', null), ($2, $6, 'propose A2', null), ($3, $6, 'propose A deleted', now()),
      ($4, $6, 'propose A cap', null), ($5, $7, 'propose B', null)`,
    [f.wA, f.wA2, f.wAdel, f.wCap, f.wB, writerA.id, writerB.id]);
    await query(`insert into public.chapters (id, work_id, title, content, order_index, deleted_at) values
      ($1, $7, 'A1', 'original A secret', 1, null),
      ($2, $8, 'A2', 'original A2', 1, null),
      ($3, $7, 'A deleted', 'deleted body', 2, now()),
      ($4, $9, 'in deleted work', 'x', 1, null),
      ($5, $10, 'cap', 'cap body', 1, null),
      ($6, $11, 'B1', 'original B', 1, null)`,
    [f.cA, f.cA2, f.cAdel, f.cInDel, f.cCap, f.cB, f.wA, f.wA2, f.wAdel, f.wCap, f.wB]);
    await query(`insert into public.kb_nodes
      (id, owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content, deleted_at) values
      ($1, $11, $13, 'work', null, 'folder', '인물', false, 'P people', null, null),
      ($2, $11, $13, 'work', $1, 'file', '인물', false, 'Hero', E'line1\\nline2', null),
      ($3, $11, $14, 'work', null, 'file', '인물', false, 'Other work doc', 'other', null),
      ($4, $11, $13, 'work', $1, 'file', '인물', true, 'Locked doc', 'locked', null),
      ($5, $11, $13, 'work', null, 'folder', 'template', false, 'P templates', null, null),
      ($6, $11, $13, 'work', $5, 'file', 'template', false, 'My template', 'tpl', null),
      ($7, $11, null, 'account_template', null, 'file', '인물', false, 'Account doc', 'acct', null),
      ($8, $11, $13, 'work', $1, 'file', '인물', false, 'Deleted doc', 'gone', now()),
      ($9, $11, $13, 'work', $1, 'file', '인물', false, 'Big doc', repeat('b', 50001), null),
      ($10, $12, $15, 'work', null, 'folder', '인물', false, 'B people', null, null)`,
    [f.kFolder, f.kFile, f.kOther, f.kLocked, f.kTplFolder, f.kTpl, f.kAcct, f.kDeleted, f.kBig, f.kBFolder,
      writerA.id, writerB.id, f.wA, f.wA2, f.wB]);
    await query(`insert into public.kb_nodes (id, owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      values ($1, $2, $3, 'work', $4, 'file', '인물', false, 'B secret doc', 'B secret')`, [f.kB, writerB.id, f.wB, f.kBFolder]);
    originals = await snapshotOriginals();
  }, 180_000);

  afterAll(async () => {
    try {
      if (sql) {
        const owners = [writerA?.id, writerB?.id].filter(Boolean);
        const works = [f.wA, f.wA2, f.wAdel, f.wCap, f.wB].filter(Boolean);
        await query('delete from public.mcp_drafts where owner_id = any($1::uuid[]) or work_id = any($2::uuid[])', [owners, works]);
        await query('delete from public.mcp_kb_proposals where owner_id = any($1::uuid[]) or work_id = any($2::uuid[])', [owners, works]);
        await query('delete from public.chapters where work_id = any($1::uuid[])', [works]);
        // The locked fixture cannot be deleted while its guards fire; best effort with triggers off.
        try {
          await sql.begin(async (tx) => {
            await tx.unsafe("set local session_replication_role = 'replica'");
            await tx.unsafe('delete from public.kb_nodes where owner_id = any($1::uuid[])', [owners]);
          });
        } catch {
          await query('delete from public.kb_nodes where owner_id = any($1::uuid[]) and not is_locked and parent_id is not null', [owners]);
        }
        await query('delete from public.works where id = any($1::uuid[]) and not exists (select 1 from public.kb_nodes k where k.work_id = works.id)', [works]);
        await sql.end();
      }
    } finally {
      await cleanupMcpOAuth(clientIds, [writerA, writerB].filter(Boolean));
    }
  }, 180_000);

  describe('mcp_save_draft', () => {
    it('stores a pending draft with origin from mcp_connections and leaves the chapter untouched', async () => {
      const row = ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'AI draft one'));
      expect(row.out_duplicate).toBe(false);
      const [draft] = await query(`select owner_id, work_id, chapter_id, oauth_client_id, client_name, redirect_host, body, body_hash,
          status, decided_at, import_count from public.mcp_drafts where id = $1`, [row.out_id]);
      expect(draft).toMatchObject({
        owner_id: writerA.id, work_id: f.wA, chapter_id: f.cA, oauth_client_id: aTok.clientId,
        client_name: aTok.clientName, redirect_host: 'claude.ai', body: 'AI draft one', body_hash: sha256('AI draft one'),
        status: 'pending', decided_at: null, import_count: 0,
      });
      const [chapter] = await query('select content from public.chapters where id = $1', [f.cA]);
      expect(chapter.content).toBe('original A secret');
    });

    it('dedupes identical pending content (after normalization) and allows several different drafts per chapter', async () => {
      const first = ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'same text\r\nsecond line'));
      const again = ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'same text\nsecond line\n'));
      expect(again).toEqual({ out_id: first.out_id, out_duplicate: true });
      const other = ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'a different draft'));
      expect(other.out_duplicate).toBe(false);
      expect(other.out_id).not.toBe(first.out_id);
      expect(await query("select 1 from public.mcp_drafts where chapter_id = $1 and body_hash = $2 and status = 'pending'",
        [f.cA, sha256('same text\nsecond line')])).toHaveLength(1);

      // Dedupe is pending-only (A8): once decided, the same content may be proposed again.
      await query("update public.mcp_drafts set status = 'rejected', decided_at = now() where id = $1", [first.out_id]);
      const reproposed = ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'same text\nsecond line'));
      expect(reproposed.out_duplicate).toBe(false);
      expect(reproposed.out_id).not.toBe(first.out_id);
    });

    it('normalizes the body: CRLF, control, BOM and bidi characters, long blank runs and trailing whitespace', async () => {
      const input = 'a\r\nb‮c﻿\u0007\u0085 \n\n\n\n\nd\tx  \r\n\n';
      const expected = 'a\nbc \n\nd\tx';
      const row = ok(await saveDraft(aTok.accessToken, f.wA2, f.cA2, input));
      const [draft] = await query('select body, body_hash from public.mcp_drafts where id = $1', [row.out_id]);
      expect(draft).toEqual({ body: expected, body_hash: sha256(expected) });
      // Three newlines in a row are kept; HTML is stored as text (escaped at render time).
      const kept = 'p\n\n\nq <b>tag</b>';
      const keptRow = ok(await saveDraft(aTok.accessToken, f.wA2, f.cA2, kept));
      expect((await query('select body from public.mcp_drafts where id = $1', [keptRow.out_id]))[0].body).toBe(kept);
      const [norm] = await query('select public.mcp_normalize_proposal_text($1) as v, public.mcp_normalize_label($2) as l',
        [input, ' Claude\n\tDesktop‮ ']);
      expect(norm).toEqual({ v: expected, l: 'Claude Desktop' });
    });

    it(`accepts ${DRAFT_MAX} characters, rejects ${DRAFT_MAX + 1} and blank bodies`, async () => {
      ok(await saveDraft(aTok.accessToken, f.wA2, f.cA2, 'a'.repeat(DRAFT_MAX)));
      ok(await saveDraft(aTok.accessToken, f.wA2, f.cA2, `${'c'.repeat(DRAFT_MAX)}\n\n  `)); // length counted after normalization
      marker(await saveDraft(aTok.accessToken, f.wA2, f.cA2, 'z'.repeat(DRAFT_MAX + 1)), 'mcp_invalid_input');
      marker(await saveDraft(aTok.accessToken, f.wA2, f.cA2, ' \n\t‮\r\n '), 'mcp_invalid_input');
    });

    it('answers mcp_not_found for cross-user, mismatched, deleted and unknown targets without echoing anything', async () => {
      const before = await query('select count(*)::int as n from public.mcp_drafts');
      for (const [bearer, work, chapter] of [
        [bTok.accessToken, f.wA, f.cA], // B injected with A's ids
        [bTok.accessToken, f.wB, f.cA], // B's work + A's chapter
        [aTok.accessToken, f.wB, f.cB], // A with B's ids
        [aTok.accessToken, f.wA, f.cA2], // A's work + A's chapter of another work
        [aTok.accessToken, f.wA, f.cAdel], // deleted chapter
        [aTok.accessToken, f.wAdel, f.cInDel], // chapter of a deleted work
        [aTok.accessToken, randomUUID(), randomUUID()],
      ] as const) {
        const result = await saveDraft(bearer, work, chapter, 'injected draft');
        marker(result, 'mcp_not_found');
        expect(result.raw).not.toContain(chapter);
        expect(result.raw).not.toContain(work);
        expect(result.raw).not.toContain('original');
      }
      expect(await query('select count(*)::int as n from public.mcp_drafts')).toEqual(before);
      expect(await query('select 1 from public.mcp_drafts where owner_id = $1', [writerB.id])).toHaveLength(0);
    });

    it('refuses browser sessions and anon callers (OAuth only)', async () => {
      forbidden(await saveDraft(aBrowser, f.wA, f.cA, 'from the browser'));
      const anon = await saveDraft(anonKey!, f.wA, f.cA, 'anonymous');
      expect([401, 403, 404]).toContain(anon.status);
      expect(await query("select 1 from public.mcp_drafts where body in ('from the browser', 'anonymous')")).toHaveLength(0);
    });
  });

  describe('mcp_propose_kb_create / mcp_propose_kb_edit', () => {
    it('creates a pending new-document proposal with a normalized name and no kb_nodes row', async () => {
      const nodesBefore = await query('select count(*)::int as n from public.kb_nodes where owner_id = $1', [writerA.id]);
      const row = ok(await kbCreate(aTok.accessToken, f.wA, '장소', '  Old\ncastle  ', 'A ruined castle.\r\n'));
      expect(row.out_duplicate).toBe(false);
      const [proposal] = await query(`select owner_id, work_id, kind, target_node_id, category, name, body, body_hash,
          base_content, base_hash, status, oauth_client_id, client_name, redirect_host
        from public.mcp_kb_proposals where id = $1`, [row.out_id]);
      expect(proposal).toEqual({
        owner_id: writerA.id, work_id: f.wA, kind: 'create', target_node_id: null, category: '장소', name: 'Old castle',
        body: 'A ruined castle.', body_hash: sha256('A ruined castle.'), base_content: null, base_hash: null,
        status: 'pending', oauth_client_id: aTok.clientId, client_name: aTok.clientName, redirect_host: 'claude.ai',
      });
      expect(ok(await kbCreate(aTok.accessToken, f.wA, '장소', 'Old castle', 'A ruined castle.'))).toEqual({ out_id: row.out_id, out_duplicate: true });
      expect(await query('select count(*)::int as n from public.kb_nodes where owner_id = $1', [writerA.id])).toEqual(nodesBefore);
    });

    it('rejects template/chapter/custom categories, bad names and oversize bodies', async () => {
      for (const category of ['template', '회차', 'custom', '']) {
        marker(await kbCreate(aTok.accessToken, f.wA, category, 'Name', 'body'), 'mcp_invalid_input');
      }
      for (const name of ['a/b', ' ', 'n'.repeat(81)]) {
        marker(await kbCreate(aTok.accessToken, f.wA, '인물', name, 'body'), 'mcp_invalid_input');
      }
      ok(await kbCreate(aTok.accessToken, f.wA, '인물', 'n'.repeat(80), 'k'.repeat(KB_MAX)));
      marker(await kbCreate(aTok.accessToken, f.wA, '인물', 'Too big', 'k'.repeat(KB_MAX + 1)), 'mcp_invalid_input');
    });

    it('records the base snapshot of an edit proposal and leaves the document untouched', async () => {
      const row = ok(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'line1\nline2 changed\nline3'));
      const [proposal] = await query(`select kind, target_node_id, category, name, body, base_content, base_hash, status
        from public.mcp_kb_proposals where id = $1`, [row.out_id]);
      expect(proposal).toEqual({
        kind: 'edit', target_node_id: f.kFile, category: null, name: 'Hero', body: 'line1\nline2 changed\nline3',
        base_content: 'line1\nline2', base_hash: sha256('line1\nline2'), status: 'pending',
      });
      expect(ok(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'line1\r\nline2 changed\r\nline3\n')))
        .toEqual({ out_id: row.out_id, out_duplicate: true });
      expect((await query('select content from public.kb_nodes where id = $1', [f.kFile]))[0].content).toBe('line1\nline2');
      // Identical to the current original after normalization -> nothing to propose.
      marker(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'line1\r\nline2\n'), 'mcp_no_change');
      marker(await kbEdit(aTok.accessToken, f.wA, f.kBig, 'shorter'), 'mcp_too_large');
      marker(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'e'.repeat(KB_MAX + 1)), 'mcp_invalid_input');
    });

    it('answers mcp_not_found for locked, template, account, folder, deleted, other-work and other-writer documents', async () => {
      const before = await query('select count(*)::int as n from public.mcp_kb_proposals');
      for (const [bearer, work, node] of [
        [aTok.accessToken, f.wA, f.kLocked],
        [aTok.accessToken, f.wA, f.kTpl],
        [aTok.accessToken, f.wA, f.kAcct],
        [aTok.accessToken, f.wA, f.kFolder],
        [aTok.accessToken, f.wA, f.kDeleted],
        [aTok.accessToken, f.wA, f.kOther], // A's document of another work
        [aTok.accessToken, f.wB, f.kB], // B's document
        [bTok.accessToken, f.wA, f.kFile], // B injected with A's ids
        [bTok.accessToken, f.wB, f.kFile], // B's work + A's document
        [aTok.accessToken, f.wA, randomUUID()],
      ] as const) {
        const result = await kbEdit(bearer, work, node, 'injected edit');
        marker(result, 'mcp_not_found');
        expect(result.raw).not.toContain(node);
        expect(result.raw).not.toMatch(/secret|line1/);
      }
      marker(await kbCreate(bTok.accessToken, f.wA, '인물', 'Injected', 'injected'), 'mcp_not_found');
      marker(await kbCreate(aTok.accessToken, f.wAdel, '인물', 'Deleted work', 'x'), 'mcp_not_found');
      expect(await query('select count(*)::int as n from public.mcp_kb_proposals')).toEqual(before);
      expect(await query('select 1 from public.mcp_kb_proposals where owner_id = $1', [writerB.id])).toHaveLength(0);
    });
  });

  describe('per-work pending cap (30) under concurrency', () => {
    it('lets exactly one of 5 parallel calls take the last slot, then refuses new content but still dedupes', async () => {
      await query(`insert into public.mcp_drafts
          (owner_id, work_id, chapter_id, oauth_client_id, client_name, redirect_host, body, body_hash)
        select $1, $2, $3, $4, 'seed', 'claude.ai', 'seed ' || g, encode(sha256(convert_to('seed ' || g, 'UTF8')), 'hex')
          from generate_series(1, $5::int) as g`, [writerA.id, f.wCap, f.cCap, aTok.clientId, CAP - 1]);
      expect(await pendingCount(f.wCap)).toBe(CAP - 1);

      const results = await Promise.all([0, 1, 2, 3, 4].map((i) => saveDraft(aTok.accessToken, f.wCap, f.cCap, `parallel ${i}`)));
      const winners = results.filter((r) => r.status === 200);
      expect(winners).toHaveLength(1);
      for (const loser of results.filter((r) => r.status !== 200)) marker(loser, 'mcp_pending_limit');
      expect(await pendingCount(f.wCap)).toBe(CAP);

      marker(await saveDraft(aTok.accessToken, f.wCap, f.cCap, 'one too many'), 'mcp_pending_limit');
      marker(await kbCreate(aTok.accessToken, f.wCap, '인물', 'Over cap', 'kb over cap'), 'mcp_pending_limit');
      // A retry of already-pending content is a duplicate, not a cap error.
      expect(ok(await saveDraft(aTok.accessToken, f.wCap, f.cCap, 'seed 1')).out_duplicate).toBe(true);
      expect(await pendingCount(f.wCap)).toBe(CAP);

      // Deciding one frees one slot; the cap counts pending rows only.
      await query(`update public.mcp_drafts set status = 'rejected', decided_at = now()
        where id = (select id from public.mcp_drafts where work_id = $1 and status = 'pending' order by created_at limit 1)`, [f.wCap]);
      ok(await kbCreate(aTok.accessToken, f.wCap, '인물', 'After reject', 'fits again'));
      expect(await pendingCount(f.wCap)).toBe(CAP);
      // Other works are unaffected by wCap's cap.
      ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'other work still fine'));
    }, 120_000);
  });

  describe('account and grant state', () => {
    it('refuses suspended (active and permanent) writers with mcp_write_denied and allows expired suspensions', async () => {
      try {
        await setSanction(writerA.id, 'suspension', new Date(Date.now() + 86_400_000).toISOString());
        marker(await saveDraft(aTok.accessToken, f.wA, f.cA, 'while suspended'), 'mcp_write_denied');
        marker(await kbCreate(aTok.accessToken, f.wA, '인물', 'Suspended', 'x'), 'mcp_write_denied');
        marker(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'suspended edit'), 'mcp_write_denied');
        // Reading what is already queued stays allowed (D-P14-15).
        const own = await fetch(`${apiUrl}/rest/v1/mcp_drafts?select=id&work_id=eq.${f.wA}`, {
          headers: { apikey: anonKey!, Authorization: `Bearer ${aBrowser}` },
        });
        expect(own.status).toBe(200);
        expect(((await own.json()) as unknown[]).length).toBeGreaterThan(0);

        await setSanction(writerA.id, 'permanent_suspension', null);
        marker(await saveDraft(aTok.accessToken, f.wA, f.cA, 'while banned'), 'mcp_write_denied');

        await setSanction(writerA.id, 'suspension', new Date(Date.now() - 60_000).toISOString());
        ok(await saveDraft(aTok.accessToken, f.wA, f.cA, 'after expiry'));
      } finally {
        await setSanction(writerA.id, 'none', null);
      }
      expect(await query("select 1 from public.mcp_drafts where body in ('while suspended', 'while banned')")).toHaveLength(0);
    });

    it('refuses withdrawn writers (grant no longer live) with 42501', async () => {
      try {
        await query('update public.profiles set deleted_at = now() where id = $1', [writerA.id]);
        forbidden(await saveDraft(aTok.accessToken, f.wA, f.cA, 'after withdrawal'));
        forbidden(await kbEdit(aTok.accessToken, f.wA, f.kFile, 'after withdrawal'));
      } finally {
        await query('update public.profiles set deleted_at = null where id = $1', [writerA.id]);
      }
      expect(await query("select 1 from public.mcp_drafts where body = 'after withdrawal'")).toHaveLength(0);
    });

    it('refuses an unexpired token right after its grant is disconnected', async () => {
      const token = await issueMcpToken(writerA, { clientName: 'mcp-test-propose-A-disc' });
      clientIds.push(token.clientId);
      ok(await saveDraft(token.accessToken, f.wA, f.cA, 'before disconnect'));
      expect((await writerA.browser.rpc('mcp_disconnect', { p_client_id: token.clientId })).error).toBeNull();
      forbidden(await saveDraft(token.accessToken, f.wA, f.cA, 'after disconnect'));
      forbidden(await kbCreate(token.accessToken, f.wA, '인물', 'After disconnect', 'x'));
      expect(await query("select 1 from public.mcp_drafts where body = 'after disconnect'")).toHaveLength(0);
    }, 120_000);
  });

  it('never changed any chapter or setting document (bodies, names, timestamps)', async () => {
    expect(await snapshotOriginals()).toEqual(originals);
  });
});
