// 일회용 DB에 선행 마이그레이션(0037/0038/0039/0040/0050)이 실제로 적용됐는지 read-only로 확인한다.
// 사용: node --env-file=.env.disposable scripts/check-disposable-migrations.mjs [--expect-ref <ref>]
// 공유 프로젝트(ymudwg...)는 어떤 경우에도 거부한다. SELECT만 실행한다.
import postgres from 'postgres';

const SHARED_REF_PREFIX = 'ymudwg';
const argv = process.argv.slice(2);
const i = argv.indexOf('--expect-ref');
const expectRef = i >= 0 ? argv[i + 1] : (process.env.MCP_DISPOSABLE_PROJECT_REF || process.env.TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF || '').trim();

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbUrl = process.env.SUPABASE_DB_URL;
if (!expectRef || !apiUrl || !dbUrl) {
  console.error('일회용 ref 또는 접속 환경값이 없습니다.');
  process.exit(2);
}
if (expectRef.startsWith(SHARED_REF_PREFIX) || dbUrl.includes(SHARED_REF_PREFIX) || apiUrl.includes(SHARED_REF_PREFIX)) {
  console.error('공유 프로젝트입니다. 거부합니다.');
  process.exit(3);
}
const apiRef = new URL(apiUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
const pg = new URL(dbUrl);
if (apiRef !== expectRef || !`${pg.hostname} ${decodeURIComponent(pg.username)}`.includes(expectRef)) {
  console.error('ref가 API URL/DB URL과 일치하지 않습니다. 중단합니다.');
  process.exit(3);
}

const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5 });

const checks = [
  ['0037', 'mcp_connections 테이블', `select to_regclass('public.mcp_connections') is not null as ok`],
  ['0037', 'mcp_connect/mcp_disconnect/mcp_authorize_call 함수', `select count(*) = 3 as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mcp_connect','mcp_disconnect','mcp_authorize_call')`],
  ['0038', 'oauth_browser_only 정책(민감 테이블)', `select count(*) > 0 as ok from pg_policies where schemaname='public' and policyname='oauth_browser_only'`],
  ['0039', 'mcp_grant_is_live 함수', `select to_regprocedure('public.mcp_grant_is_live()') is not null as ok`],
  ['0039', 'mcp_oauth_owner_select 정책(works)', `select count(*) > 0 as ok from pg_policies where schemaname='public' and tablename='works' and policyname='mcp_oauth_owner_select'`],
  ['0040', 'soft_delete_kb_node write_access_denied 가드', `select coalesce(strpos(pg_get_functiondef(to_regprocedure('public.soft_delete_kb_node(uuid,uuid)')), 'write_access_denied') > 0, false) as ok`],
  ['0050', 'world_work_public_meta_visible 함수', `select to_regprocedure('public.world_work_public_meta_visible(uuid)') is not null as ok`],
  ['0050', 'chapters_work_published_idx 인덱스', `select to_regclass('public.chapters_work_published_idx') is not null as ok`],
];

let bad = 0;
try {
  for (const [mig, label, q] of checks) {
    let ok = false;
    try {
      const [row] = await sql.unsafe(q);
      ok = row?.ok === true;
    } catch (e) {
      console.log(`${mig} ERR  ${label}: ${e.message}`);
      bad += 1;
      continue;
    }
    console.log(`${mig} ${ok ? 'OK  ' : 'MISS'} ${label}`);
    if (!ok) bad += 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}

if (bad) {
  console.error(`\n누락/불일치 ${bad}건. 누락 파일을 번호순으로 일회용 DB에만 적용하세요:`);
  console.error(`node scripts/apply-pending-migrations.mjs --env-file .env.disposable --expect-ref ${expectRef} --from <번호> --to <번호> --execute`);
  process.exit(1);
}
console.log('\n선행 마이그레이션 0037/0038/0039/0040/0050 모두 일회용 DB에 적용됨.');
