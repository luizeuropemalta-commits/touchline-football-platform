// Explicit operator configuration only. No content database/env fallback.
const unavailable = () => new Error('Recovery operator configuration unavailable.');
const id = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
export function readRecoveryOperatorConfig(env) {
  const projectRef = env.TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF;
  const host = env.TOUCHLINE_RECOVERY_DB_HOST;
  const user = env.TOUCHLINE_RECOVERY_DB_USER;
  const mode = env.TOUCHLINE_RECOVERY_DB_MODE;
  const password = env.TOUCHLINE_RECOVERY_DB_PASSWORD;
  const scope = env.TOUCHLINE_RECOVERY_ACCOUNT_SCOPE;
  const apiToken = env.TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN;
  const ca = env.TOUCHLINE_RECOVERY_DB_CA_PEM;
  if (env.TOUCHLINE_RECOVERY_OPERATOR_ENABLED !== 'true'
    || typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(projectRef)
    || typeof password !== 'string' || password.length < 12 || password.length > 512 || /[\r\n\0]/.test(password)
    || !id(scope) || typeof apiToken !== 'string' || !/^[A-Za-z0-9._~-]{16,512}$/.test(apiToken)
    || password === apiToken || env.TOUCHLINE_RECOVERY_DB_PORT !== '5432') throw unavailable();
  const direct = mode === 'direct' && host === `db.${projectRef}.supabase.co` && user === 'postgres';
  // Obtain this host from Dashboard Connect; never infer a pooler or fail over.
  const session = mode === 'session' && typeof host === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(host)
    && user === `postgres.${projectRef}`;
  if (!direct && !session) throw unavailable();
  if (ca !== undefined && (typeof ca !== 'string' || ca.length > 32768
    || !ca.startsWith('-----BEGIN CERTIFICATE-----\n') || !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))) throw unavailable();
  return Object.freeze({ projectRef, scope, apiToken,
    database: Object.freeze({ host, port: 5432, user, password, database: 'postgres',
      ssl: Object.freeze({ rejectUnauthorized: true, servername: host, ...(ca ? { ca } : {}) }),
      application_name: 'touchline-quota-recovery', connectionTimeoutMillis: 2500,
      options: '-c timezone=UTC', query_timeout: 2500, keepAlive: false }),
    operator: Object.freeze({ accountScope: scope, expectedRole: 'postgres', database: 'postgres', timeoutMs: 2500 }) });
}

export function readRecoveryArguments(args) {
  if (args.length === 1 && args[0] === '--check') return Object.freeze({ mode: 'check' });
  if (args.length !== 7 || args[0] !== '--measure-single' || args[1] !== '--case'
    || args[3] !== '--worker' || args[5] !== '--path'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args[2])
    || !id(args[4]) || typeof args[6] !== 'string' || !/^\/[a-zA-Z0-9/_-]{1,180}$/.test(args[6])) throw unavailable();
  return Object.freeze({ mode: 'measure', caseId: args[2], workerId: args[4], relativePath: args[6] });
}
