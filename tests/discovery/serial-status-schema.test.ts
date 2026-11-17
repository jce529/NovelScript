/**
 * Static SQL source verification for `supabase/migrations/0056_works_serial_status.sql` (21-02 Task 1 & Task 3).
 *
 * [Task 3 — 일회용 DB 이중 적용 및 RLS/권한 검증 절차 메모]
 * 이 PLAN 작성/단위 검증 세션에서는 어떤 DB에도 연결하거나 SQL을 실행하지 않는다.
 * 실제 DB 검증 단계(21-04-SUMMARY.md에 실행 결과 또는 미실행 사유·미검증 상태를 필수 기록)에서는
 * tests/helpers/db.ts의 트랜잭션 격리(withTestTransaction / setLocalRole) 관례를 따라 다음 순서로 확인한다:
 *   1. 일회용 Supabase 프로젝트 ref가 팀 공유 프로젝트 ref와 다른지 먼저 대조·확인한다(공유 DB 자동 적용 금지, 공유 DB 적용은 사용자가 직접 수행).
 *   2. 번호가 확정된 단일 파일 `supabase/migrations/0056_works_serial_status.sql`을 일회용 DB에 연속 두 번 적용해 멱등성을 검증한다:
 *      - 1차 적용 후 작품 A를 `serial_status = 'completed'`로 갱신한다.
 *      - 2차 재적용 후에도 오류 없이 통과하며 작품 A의 `serial_status`가 `'completed'`로 유지되는지(`'ongoing'`으로 덮어써지지 않는지) 확인한다.
 *   3. 스키마 기본값 및 CHECK 제약 검증:
 *      - `serial_status` 미지정 INSERT 시 기본값 `'ongoing'`이 저장된다.
 *      - `'ongoing'`, `'completed'` 외 임의 문자열(`'paused'`, `''` 등)은 `works_serial_status_check` 제약으로 거부된다.
 *   4. RLS 및 컬럼 권한 격리 검증(트랜잭션 롤백 격리):
 *      - Author A(`authenticated`, `auth.uid() = owner_id`, 미삭제·비제재): 본인 작품 `ongoing → completed` 및 `completed → ongoing` UPDATE 성공.
 *      - Author B(`authenticated`, `auth.uid() <> owner_id`): Author A 작품 UPDATE 시 `works_owner_all`에 의해 0건 갱신(거부).
 *      - 비로그인(`anon`): `serial_status` 컬럼 UPDATE 권한 없음(42501 insufficient_privilege 거부).
 *      - 공개 조회(`anon` / `authenticated` SELECT): 미삭제·비초안 작품의 `serial_status`가 `works_public_read`로 정상 조회된다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = 'supabase/migrations';
const MIGRATION_FILE = `${MIGRATIONS_DIR}/0056_works_serial_status.sql`;
const STUDIO_MIGRATION_FILE = `${MIGRATIONS_DIR}/0002_studio.sql`;
const READER_MIGRATION_FILE = `${MIGRATIONS_DIR}/0003_reader.sql`;
const ADMIN_MIGRATION_FILE = `${MIGRATIONS_DIR}/0006_admin_foundation.sql`;
const SANCTION_MIGRATION_FILE = `${MIGRATIONS_DIR}/0008_sanction_enforcement.sql`;

const raw = readFileSync(MIGRATION_FILE, 'utf8');

/** Strip `--` line comments, collapse whitespace, and lowercase for structural SQL assertions. */
function normalizeSql(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const sql = normalizeSql(raw);

describe('0056_works_serial_status.sql migration numbering and canonical ownership (Task 1)', () => {
  it('uses migration number 0056 and does not collide with reserved phase numbers (0053~0055, 0057~0060)', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain('0056_works_serial_status.sql');

    const serialStatusMigrations = files.filter((file) => file.includes('serial_status'));
    expect(serialStatusMigrations).toEqual(['0056_works_serial_status.sql']);

    for (const reservedPrefix of ['0053_', '0054_', '0055_', '0057_', '0058_', '0059_', '0060_']) {
      const colliding = files.filter(
        (file) => file.startsWith(reservedPrefix) && file.includes('serial_status'),
      );
      expect(colliding).toEqual([]);
    }
  });

  it('documents that 21-02 is the canonical source for works.serial_status and Phase 28 only reuses it', () => {
    expect(raw).toContain('21-02');
    expect(raw).toContain('정본');
    expect(raw).toContain('Phase 28');
    expect(raw).toContain('재사용');
    expect(raw).toContain('26=0053~0055');
    expect(raw).toContain('28=0057');
    expect(raw).toContain('27=0058');
    expect(raw).toContain('29=0059~0060');
  });

  it('is wrapped in a transaction and reloads PostgREST schema cache', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });
});

describe('0056_works_serial_status.sql idempotent column and constraint definition (Task 1)', () => {
  it("adds works.serial_status idempotently with text NOT NULL DEFAULT 'ongoing'", () => {
    expect(sql).toContain(
      "alter table works add column if not exists serial_status text not null default 'ongoing';",
    );
    expect(sql).toContain("alter table works alter column serial_status set default 'ongoing';");
    expect(sql).toContain('alter table works alter column serial_status set not null;');
  });

  it("backfills only NULL rows to 'ongoing' so re-applying never overwrites existing 'completed' rows", () => {
    expect(sql).toContain("update works set serial_status = 'ongoing' where serial_status is null;");
    expect(sql).not.toMatch(/update works set serial_status = 'ongoing'\s*;/);
  });

  it("adds the ongoing|completed CHECK constraint idempotently via pg_constraint lookup", () => {
    expect(sql).toContain("conname = 'works_serial_status_check'");
    expect(sql).toContain("conrelid = 'public.works'::regclass");
    expect(sql).toContain(
      "alter table works add constraint works_serial_status_check check (serial_status in ('ongoing', 'completed'));",
    );
  });
});

describe('0056_works_serial_status.sql RLS and privilege preservation (Task 1 & Task 3)', () => {
  it('preserves works_owner_all, works_public_read, and works_write_access_update without dropping them', () => {
    const studioSql = normalizeSql(readFileSync(STUDIO_MIGRATION_FILE, 'utf8'));
    const readerSql = normalizeSql(readFileSync(READER_MIGRATION_FILE, 'utf8'));
    const sanctionSql = normalizeSql(readFileSync(SANCTION_MIGRATION_FILE, 'utf8'));

    // 0002_studio.sql requires owner_id = auth.uid() and deleted_at is null on works_owner_all
    expect(studioSql).toContain(
      'create policy "works_owner_all" on works for all using (owner_id = auth.uid() and deleted_at is null) with check (owner_id = auth.uid())',
    );
    // 0003_reader.sql defines works_public_read as SELECT-only
    expect(readerSql).toContain('create policy "works_public_read" on works for select');
    // 0008_sanction_enforcement.sql enforces current_user_can_write() on UPDATE
    // (0008 generates the policy per table through format(%i), so assert the template pieces)
    expect(sanctionSql).toContain("'works'");
    expect(sanctionSql).toContain("'_write_access_update'");
    expect(sanctionSql).toContain('as restrictive for update using (current_user_can_write()) with check (current_user_can_write())');

    // 0056 must not drop or weaken any existing works policy
    expect(sql).not.toContain('drop policy');
    expect(sql).toContain('alter table works enable row level security;');
  });

  it('creates no public/anon UPDATE policy and no SECURITY DEFINER bypass function', () => {
    expect(sql).not.toContain('create policy');
    expect(sql).not.toContain('security definer');
  });

  it('grants serial_status column write access only to authenticated and revokes it from public and anon', () => {
    const adminSql = normalizeSql(readFileSync(ADMIN_MIGRATION_FILE, 'utf8'));
    expect(adminSql).toContain(
      'revoke insert, update, delete, truncate, references, trigger on works from anon, authenticated;',
    );

    expect(sql).toContain(
      'revoke insert (serial_status), update (serial_status) on works from public, anon;',
    );
    expect(sql).toContain(
      'grant insert (serial_status), update (serial_status) on works to authenticated;',
    );
    expect(sql).not.toMatch(/grant\s+[^;]*serial_status[^;]*to\s+[^;]*anon/);
  });

  it('includes the disposable DB verification runbook in source comments without auto-push commands (Task 3)', () => {
    const fileSource = readFileSync('tests/discovery/serial-status-schema.test.ts', 'utf8');
    expect(fileSource).toContain('일회용 Supabase 프로젝트 ref');
    expect(fileSource).toContain('연속 두 번 적용');
    expect(fileSource).toContain('tests/helpers/db.ts');
    expect(fileSource).toContain('21-04-SUMMARY.md');
    expect(raw).not.toContain('supabase db push');
  });
});
