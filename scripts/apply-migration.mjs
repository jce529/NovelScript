import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? '0001_init.sql';
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1 });
// 일부 마이그레이션(예: 0011)은 UTF-8 BOM으로 시작해 첫 구문이 구문 오류가 되므로 제거한다.
const migration = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8').replace(/^﻿/, '');

try {
  await sql.unsafe(migration);
  console.log(`Migration ${file} applied successfully`);
} finally {
  await sql.end();
}
