import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? '0001_init.sql';
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1 });
const migration = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');

try {
  await sql.unsafe(migration);
  console.log(`Migration ${file} applied successfully`);
} finally {
  await sql.end();
}
