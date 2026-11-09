// vitest를 --reporter=json으로 실행해 "실제로 통과한 테스트가 있고, 건너뛴/실패한 테스트가 없음"을 단정한다.
// 사용: node scripts/assert-vitest-json.mjs -- node node_modules/vitest/vitest.mjs run <파일> --project db
// 자식 프로세스 실패, JSON 파싱 실패, passed==0, pending>0, failed>0 이면 비영 종료한다.
import { spawnSync } from 'node:child_process';

const sep = process.argv.indexOf('--');
if (sep === -1 || sep === process.argv.length - 1) {
  console.error('사용: node scripts/assert-vitest-json.mjs -- <명령> [인자...]');
  process.exit(2);
}
const [cmd, ...args] = process.argv.slice(sep + 1);

const res = spawnSync(cmd, [...args, '--reporter=json'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: process.env,
});

if (res.error) {
  console.error(`자식 프로세스 실행 실패: ${res.error.message}`);
  process.exit(1);
}

const out = res.stdout ?? '';
const start = out.indexOf('{');
const end = out.lastIndexOf('}');
let json;
try {
  if (start === -1 || end <= start) throw new Error('JSON 출력 없음');
  json = JSON.parse(out.slice(start, end + 1));
} catch (e) {
  console.error(`vitest JSON 파싱 실패: ${e.message}`);
  if (res.stderr) console.error(res.stderr.slice(-2000));
  process.exit(1);
}

const passed = json.numPassedTests ?? 0;
const pending = json.numPendingTests ?? 0;
const failed = json.numFailedTests ?? 0;
console.log(`vitest: passed=${passed} pending=${pending} failed=${failed}`);

if (res.status !== 0) {
  console.error(`vitest 종료 코드 ${res.status}`);
  process.exit(1);
}
if (!(passed > 0)) {
  console.error('통과한 테스트가 0개입니다 (조용한 건너뜀 의심).');
  process.exit(1);
}
if (pending !== 0) {
  console.error(`건너뛴 테스트 ${pending}개 — 허용하지 않습니다.`);
  process.exit(1);
}
if (failed !== 0) {
  console.error(`실패한 테스트 ${failed}개.`);
  process.exit(1);
}
