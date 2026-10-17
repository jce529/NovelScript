// .env.local의 키 이름과 설정 여부(set/EMPTY)만 출력한다. 값은 절대 출력하지 않는다.
// 사용: node scripts/check-env.mjs [파일경로, 기본 .env.local]
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? ".env.local";
let text;
try {
  text = readFileSync(file, "utf8");
} catch {
  console.log(`${file}: 파일 없음`);
  process.exit(1);
}

for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  console.log(`${m[1]} ${value ? "set" : "EMPTY"}`);
}
