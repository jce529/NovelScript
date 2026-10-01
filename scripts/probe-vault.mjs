const SAFE_ERROR_CLASSES = new Set([
  'CONNECTION', 'AUTHENTICATION', 'DNS', 'TIMEOUT', 'CONFIGURATION', 'DATABASE', 'UNKNOWN',
]);

export function classifyProbeError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code.startsWith('28')) return 'AUTHENTICATION';
  if (code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND'].includes(code)) return code === 'ENOTFOUND' ? 'DNS' : 'CONNECTION';
  if (code === 'ETIMEDOUT' || code === 'CONNECT_TIMEOUT' || error?.name === 'TimeoutError') return 'TIMEOUT';
  if (code === '42P01' || code === '42883' || code === '42501') return 'DATABASE';
  return SAFE_ERROR_CLASSES.has(code) ? code : 'UNKNOWN';
}

async function rows(sql, query, params = []) {
  return sql.unsafe(query, params);
}

/** Execute the inspection in one transaction and always roll it back. */
export async function runVaultProbe(sql) {
  await rows(sql, 'select 1');
  const report = { result: 'REACHABLE', extension: null, createSecretSignature: null, objects: {}, currentRole: null, createAllowed: false, deleteAllowed: false, acl: [] };
  let probeName;
  let transactionError;

  try {
    await rows(sql, 'begin');
    const extension = await rows(sql, "select extname, extversion from pg_extension where extname = 'supabase_vault'");
    report.extension = extension[0] ?? null;
    const signatures = await rows(sql, `
      select pg_get_function_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as result
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'vault' and p.proname = 'create_secret'
    `);
    report.createSecretSignature = signatures.map((item) => `vault.create_secret(${item.arguments}) returns ${item.result}`);
    const objectRows = await rows(sql, `
      select to_regclass('vault.secrets') is not null as secrets,
             to_regclass('vault.decrypted_secrets') is not null as decrypted_secrets
    `);
    report.objects = objectRows[0] ?? {};
    const roles = await rows(sql, `
      select current_user as current_role,
             has_schema_privilege(current_user, 'vault', 'usage') as schema_usage
    `);
    report.currentRole = roles[0]?.current_role ?? null;
    const acl = await rows(sql, `
      select role_name,
             coalesce(has_schema_privilege(role_name, n.oid, 'usage'), false) as schema_usage,
             coalesce(has_table_privilege(role_name, to_regclass('vault.decrypted_secrets'), 'select'), false) as decrypted_select,
             coalesce(has_table_privilege(role_name, to_regclass('vault.secrets'), 'delete'), false) as secrets_delete
      from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
      left join pg_namespace n on n.nspname = 'vault'
    `);
    report.acl = acl;

    await rows(sql, 'savepoint probe_create');
    try {
      probeName = `probe-${crypto.randomUUID()}`;
      const probeSecret = `probe-${crypto.randomUUID()}`;
      const created = await rows(sql, 'select vault.create_secret($1, $2) as id', [probeSecret, probeName]);
      const secretId = created[0]?.id;
      report.createAllowed = Boolean(secretId);
      await rows(sql, 'release savepoint probe_create');
      if (secretId) {
        await rows(sql, 'savepoint probe_delete');
        try {
          const deleted = await rows(sql, 'delete from vault.secrets where id = $1 returning id', [secretId]);
          report.deleteAllowed = deleted.length > 0;
          await rows(sql, 'release savepoint probe_delete');
        } catch {
          await rows(sql, 'rollback to savepoint probe_delete');
        }
      }
    } catch {
      await rows(sql, 'rollback to savepoint probe_create');
    }
  } catch (error) {
    transactionError = error;
  } finally {
    try { await rows(sql, 'rollback'); } catch (error) { transactionError ??= error; }
  }

  if (transactionError) throw transactionError;
  if (probeName && report.objects.secrets) {
    const leftovers = await rows(sql, 'select count(*)::int as count from vault.secrets where name = $1', [probeName]);
    report.leftoverProbeSecrets = leftovers[0]?.count ?? null;
  } else report.leftoverProbeSecrets = 0;
  return report;
}

async function main() {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.log('RESULT=UNREACHABLE ERROR=CONFIGURATION');
    return;
  }

  let sql;
  try {
    const { default: postgres } = await import('postgres');
    sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 });
    const report = await runVaultProbe(sql);
    console.log(`RESULT=${report.result}`);
    console.log(JSON.stringify(report));
  } catch (error) {
    console.log(`RESULT=UNREACHABLE ERROR=${classifyProbeError(error)}`);
  } finally {
    if (sql) await sql.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  await main();
}
