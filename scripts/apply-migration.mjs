import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1 });
const migration = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');

try {
  await sql.unsafe(migration);
  console.log('Migration applied successfully');
} finally {
  await sql.end();
}
