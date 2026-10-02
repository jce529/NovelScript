import { describe, expect, it, vi } from 'vitest';
import {
  deleteUatAccounts, hostMatches, parseCleanupArgs, uatBlockers,
} from '../../scripts/lib/uat-account-cleanup.mjs';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const A = 'a@novelscript.test';
const B = 'b@novelscript.test';
const args = (...rest: string[]) => ['--ids', `${ID_A},${ID_B}`, '--emails', `${A},${B}`, '--expect-count', '2', ...rest];

describe('parseCleanupArgs', () => {
  it('defaults to dry-run for a complete, exact target list', () => {
    const parsed = parseCleanupArgs(args());
    expect(parsed.ok).toBe(true);
    expect(parsed.options.execute).toBe(false);
  });

  it.each([
    ['no ids', ['--emails', A, '--expect-count', '1'], 'ids_required'],
    ['bad uuid', ['--ids', 'nope', '--emails', A, '--expect-count', '1'], 'invalid_uuid'],
    ['ids/emails count mismatch', ['--ids', `${ID_A},${ID_B}`, '--emails', A, '--expect-count', '2'], 'ids_emails_mismatch'],
    ['non-test email', ['--ids', ID_A, '--emails', 'real@example.com', '--expect-count', '1'], 'non_test_email'],
    ['missing expected count', ['--ids', ID_A, '--emails', A], 'expect_count_required'],
    ['wrong expected count', ['--ids', ID_A, '--emails', A, '--expect-count', '3'], 'expect_count_mismatch'],
    ['execute without expected db', args('--execute'), 'expect_db_required_for_execute'],
  ])('rejects %s', (_name, argv, error) => {
    expect(parseCleanupArgs(argv).errors).toContain(error);
  });

  it('only matches the operator-supplied host marker', () => {
    expect(hostMatches('aws-0.pooler.supabase.com', 'pooler')).toBe(true);
    expect(hostMatches('aws-0.pooler.supabase.com', 'prod')).toBe(false);
    expect(hostMatches('aws-0.pooler.supabase.com', null)).toBe(false);
  });
});

describe('uatBlockers', () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    ids: [ID_A, ID_B], emails: [A, B],
    users: [{ id: ID_A, email: A }, { id: ID_B, email: B }],
    references: [{ table: 'ledger_entries', column: 'wallet_id', count: 3, cascades: false }],
    ...over,
  });

  it('accepts accounts whose only blocking references are the ones the tool cleans', () => {
    expect(uatBlockers(plan(), { expectCount: 2 })).toEqual([]);
  });

  it('stops when fewer accounts exist than expected', () => {
    expect(uatBlockers(plan({ users: [{ id: ID_A, email: A }] }), { expectCount: 2 })).toContain('found_1_expected_2');
  });

  it('stops when an id belongs to a different email', () => {
    const blockers = uatBlockers(plan({ users: [{ id: ID_A, email: 'other@novelscript.test' }, { id: ID_B, email: B }] }), { expectCount: 2 });
    expect(blockers).toContain(`email_mismatch:${ID_A}`);
  });

  it('stops for non-test accounts', () => {
    const blockers = uatBlockers(plan({ users: [{ id: ID_A, email: 'a@example.com' }, { id: ID_B, email: B }] }), { expectCount: 2 });
    expect(blockers).toContain('non_test_account');
  });

  it('stops on references it does not know how to clean (works, append-only audit rows)', () => {
    const blockers = uatBlockers(plan({
      references: [
        { table: 'works', column: 'owner_id', count: 1, cascades: false },
        { table: 'admin_actions', column: 'target_user_id', count: 2, cascades: false },
        { table: 'wallets', column: 'id', count: 2, cascades: true },
      ],
    }), { expectCount: 2 });
    expect(blockers).toEqual(['unhandled_reference:works.owner_id(1)', 'unhandled_reference:admin_actions.target_user_id(2)']);
  });
});

describe('deleteUatAccounts', () => {
  const basePlan = {
    ids: [ID_A], emails: [A], users: [{ id: ID_A, email: A }],
    references: [{ table: 'ledger_entries', column: 'wallet_id', count: 1, cascades: false }],
  };
  const fakeSql = (remaining = 0) => {
    const calls: string[] = [];
    const sql = Object.assign(
      async () => [{ n: remaining }],
      { begin: async (fn: (tx: unknown) => Promise<void>) => fn({ unsafe: async (text: string) => { calls.push(text); return []; } }), calls },
    );
    return sql;
  };

  it('cleans owned child rows before the Auth users and returns per-account results', async () => {
    const sql = fakeSql();
    const deleteUser = vi.fn(async () => ({ error: null }));
    const results = await deleteUatAccounts(sql as never, { auth: { admin: { deleteUser } } } as never, basePlan, { expectCount: 1 });
    expect(sql.calls[0]).toContain('"ledger_entries"');
    expect(sql.calls[1]).toContain('"reports"');
    expect(deleteUser).toHaveBeenCalledWith(ID_A, false);
    expect(results).toEqual([{ id: ID_A, email: A, deleted: true, error: null }]);
  });

  it('propagates an Auth deletion error with per-account state for a retry', async () => {
    const deleteUser = vi.fn(async () => ({ error: { message: 'database error' } }));
    await expect(deleteUatAccounts(fakeSql() as never, { auth: { admin: { deleteUser } } } as never, basePlan, { expectCount: 1 }))
      .rejects.toMatchObject({ message: `auth_delete_failed:${ID_A}`, results: [{ id: ID_A, deleted: false, error: 'database error' }] });
  });

  it('fails when the account is still present afterwards', async () => {
    const deleteUser = vi.fn(async () => ({ error: null }));
    await expect(deleteUatAccounts(fakeSql(1) as never, { auth: { admin: { deleteUser } } } as never, basePlan, { expectCount: 1 }))
      .rejects.toThrow('accounts_remaining:1');
  });

  it('never touches the database or Auth when a blocker exists', async () => {
    const sql = fakeSql();
    const deleteUser = vi.fn();
    const blocked = { ...basePlan, references: [{ table: 'works', column: 'owner_id', count: 1, cascades: false }] };
    await expect(deleteUatAccounts(sql as never, { auth: { admin: { deleteUser } } } as never, blocked, { expectCount: 1 }))
      .rejects.toThrow('cleanup_refused:unhandled_reference:works.owner_id(1)');
    expect(sql.calls).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
