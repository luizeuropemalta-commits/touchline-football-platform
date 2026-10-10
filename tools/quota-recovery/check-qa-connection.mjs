// Read-only QA probe. Password is inherited transiently, never logged or saved.
import pg from 'pg';
import { readFileSync } from 'node:fs';
// Exact Session pooler endpoint verified in the QA dashboard; no automatic fallback.
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const password = process.env.TOUCHLINE_RECOVERY_DB_PASSWORD;
delete process.env.TOUCHLINE_RECOVERY_DB_PASSWORD;
if (!password) { console.error('Senha nao informada.'); process.exit(1); }
const client = new pg.Client({host, port:5432, database:'postgres', user:'postgres.xgxbwqxjssxxuihuwmgy', password,
  ssl:{rejectUnauthorized:true, servername:host, ca:readFileSync(new URL('./supabase-root-2021.pem', import.meta.url),'utf8')}, connectionTimeoutMillis:5000,
  query_timeout:5000, application_name:'touchline-qa-readonly-probe'});
let stage = 'autenticacao';
try {
  await client.connect();
  stage = 'consulta';
  await client.query('BEGIN READ ONLY');
  const result = await client.query("SELECT current_database() AS db, current_user AS role, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
  await client.query('ROLLBACK');
  stage = 'verificacao';
  if(result.rows[0]?.db !== 'postgres' || result.rows[0]?.role !== 'postgres') throw Object.assign(new Error('identity'), {code:'IDENTITY_MISMATCH'});
  if(result.rows[0]?.tls !== true) throw Object.assign(new Error('backend TLS not confirmed'), {code:'BACKEND_TLS_NOT_CONFIRMED'});
  console.log('QA: autenticacao e TLS confirmados. Nenhum dado alterado. Credencial nao salva.');
} catch(error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : /timeout|timed out/i.test(error?.message ?? '') ? 'TIMEOUT' : 'CONNECTION_FAILED';
  console.error('QA: conexao nao validada (' + code + '), etapa: ' + stage + '. Nenhuma ativacao.');
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
