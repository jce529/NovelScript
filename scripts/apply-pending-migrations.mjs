// 마이그레이션을 번호 순서로 한 파일씩 적용한다. 기본은 dry-run(접속 안 함).
//   node scripts/apply-pending-migrations.mjs --from 0022 --to 0039 --skip 0028,0031
//   node scripts/apply-pending-migrations.mjs --env-file .env.rehearsal --expect-ref <ref 일부> --from 0022 --to 0039 --skip 0028,0031 --stop-after 0023,0030,0036 --execute
// 공유 프로젝트(ymudwgso)는 --allow-shared 없이는 어떤 경우에도 거부한다.
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHARED_REF = 'ymudwgso';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

function parseArgs(argv) {
  const o = { envFile: null, expectRef: null, from: null, to: null, skip: [], stopAfter: [], execute: false, allowShared: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--execute') o.execute = true;
    else if (a === '--allow-shared') o.allowShared = true;
    else if (a === '--env-file') o.envFile = next();
    else if (a === '--expect-ref') o.expectRef = next();
    else if (a === '--from') o.from = next();
    else if (a === '--to') o.to = next();
    else if (a === '--skip') o.skip = (next() ?? '').split(',').filter(Boolean);
    else if (a === '--stop-after') o.stopAfter = (next() ?? '').split(',').filter(Boolean);
    else if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 5).join('\n')); process.exit(0); }
    else { console.error(`알 수 없는 인자: ${a}`); process.exit(2); }
  }
  return o;
}

const o = parseArgs(process.argv.slice(2));
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .filter((f) => (!o.from || f.slice(0, 4) >= o.from) && (!o.to || f.slice(0, 4) <= o.to) && !o.skip.includes(f.slice(0, 4)));

// 같은 번호가 두 파일이면 순서를 사람이 정해야 하므로 중단한다.
const nums = files.map((f) => f.slice(0, 4));
const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
if (dup.length) { console.error(`번호 중복: ${[...new Set(dup)].join(', ')} — --skip으로 하나를 제외하세요.`); process.exit(2); }
if (!files.length) { console.error('적용할 파일이 없습니다.'); process.exit(2); }

console.log(`${o.execute ? '[EXECUTE]' : '[DRY-RUN]'} ${files.length}개 파일`);
for (const f of files) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const tx = /^\s*begin\s*;/im.test(text) ? '트랜잭션' : '트랜잭션 아님';
  const data = (text.match(/^\s*(insert into|update [a-z_.]+ set|delete from)/gim) ?? []).length;
  console.log(`  ${f.padEnd(52)} ${String(text.split('\n').length).padStart(4)}줄  ${tx}${data ? `  데이터 문 ${data}` : ''}${o.stopAfter.includes(f.slice(0, 4)) ? '  ← 이후 정지' : ''}`);
}
if (!o.execute) { console.log('\ndry-run입니다. 적용하려면 --env-file, --expect-ref, --execute가 필요합니다.'); process.exit(0); }

if (!o.envFile || !o.expectRef) { console.error('--execute에는 --env-file과 --expect-ref가 필요합니다.'); process.exit(2); }
process.loadEnvFile(o.envFile);
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL이 없습니다.'); process.exit(2); }
if (!url.includes(o.expectRef)) { console.error('접속 대상이 --expect-ref와 다릅니다. 중단합니다.'); process.exit(2); }
if (url.includes(SHARED_REF) && !o.allowShared) { console.error('공유 프로젝트입니다. --allow-shared 없이는 적용하지 않습니다.'); process.exit(3); }
if (o.allowShared && !o.expectRef.includes(SHARED_REF)) { console.error('--allow-shared에는 --expect-ref에 공유 ref가 있어야 합니다.'); process.exit(3); }
console.log(`\n대상 확인: ref 일치(${o.expectRef.slice(0, 8)}…), 공유=${url.includes(SHARED_REF)}`);

const sql = postgres(url, { max: 1, connect_timeout: 15 });
try {
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '');
    const t0 = Date.now();
    try {
      await sql.unsafe(text);
    } catch (e) {
      console.error(`\n✗ ${f} 실패: ${e.message}`);
      console.error('이 파일이 트랜잭션이면 자동으로 되돌려졌습니다. 원인 확인 전에는 재시도하지 마세요.');
      process.exitCode = 1;
      break;
    }
    const [{ t, fn }] = await sql`select (select count(*)::int from pg_tables where schemaname = 'public') t,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') fn`;
    console.log(`✓ ${f} (${Date.now() - t0}ms)  public 테이블 ${t}, 함수 ${fn}`);
    if (o.stopAfter.includes(f.slice(0, 4))) {
      console.log(`\n정지: ${f.slice(0, 4)} 이후. 확인 후 --from ${String(Number(f.slice(0, 4)) + 1).padStart(4, '0')}부터 이어서 실행하세요.`);
      break;
    }
  }
} finally {
  await sql.end();
}
