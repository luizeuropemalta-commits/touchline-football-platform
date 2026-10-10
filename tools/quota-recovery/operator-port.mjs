// Operator CLI only. No environment lookup, network destination or public RPC.
// makeClient must provide a NEW, dedicated, explicitly TLS-bound pg.Client.
const failure = () => new Error('Recovery operator unavailable.');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const name = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(value);
const identity = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const one = result => {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) throw failure();
  return result.rows[0];
};
const IDENTITY_SQL = `select current_database() database, current_user role, session_user session_role,
  current_setting('fsync') fsync, pg_backend_pid() pid`;
const CASE_SQL = `select c.account_scope from touchline_quota_private.recovery_cases c where c.id=$1`;
const OBSERVE_SQL = `select a.request_id, a.owner_worker_id, a.endpoint, a.token,
  m.case_id, m.account_scope, s.enabled, s.blocked_unknown,
  (a.completed_at is null and a.token=s.active_token and m.lease_until=s.active_until
    and s.active_until>clock_timestamp()+interval '1 second') valid_lease,
  not exists(select 1 from touchline_quota_private.workers w where w.account_scope=m.account_scope and w.enabled) workers_off,
  touchline_quota_private.recovery_matches_expected(m.case_id) expected_state
  from touchline_quota_private.recovery_measurements m
  join public.touchline_fixture_quota_attempts a on a.account_scope=m.account_scope and a.request_id=m.request_id and a.attempt=m.attempt
  join public.touchline_fixture_quota_scopes s on s.account_scope=m.account_scope
  where m.case_id=$1 and m.account_scope=$2 and m.request_id=$3 and m.attempt=1
    and m.owner_worker_id=a.owner_worker_id and m.owner_environment=a.owner_environment`;

export function createRecoveryOperatorPort(config, makeClient) {
  if (!exact(config, ['accountScope', 'expectedRole', 'database', ...(Object.hasOwn(config ?? {}, 'timeoutMs') ? ['timeoutMs'] : [])])
    || !identity(config.accountScope) || !name(config.expectedRole) || !name(config.database)
    || ['anon', 'authenticated', 'service_role'].includes(config.expectedRole) || typeof makeClient !== 'function') throw failure();
  const { accountScope, expectedRole, database } = config;
  const timeoutMs = config.timeoutMs ?? 4000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 5000) throw failure();
  const seen = new WeakSet();
  const validate = (args, completion) => {
    if (!exact(args, ['caseId', 'workerId', 'requestId', 'endpoint', ...(completion ? ['token', 'observation'] : ['budgetMs'])])
      || !uuid(args.caseId) || !uuid(args.requestId) || !identity(args.workerId)
      || typeof args.endpoint !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(args.endpoint)
      || (completion ? !uuid(args.token) : !Number.isSafeInteger(args.budgetMs) || args.budgetMs < 1 || args.budgetMs > 20000)) throw failure();
  };
  async function run(input, signal, completion) {
    const clients = [], closing = new WeakSet();
    let stopped = false, timer, listener;
    const close = client => {
      if (closing.has(client)) return;
      closing.add(client);
      // Dedicated pg 8.16.3 clients only: end() can wait for a stalled TLS
      // handshake until connectionTimeoutMillis. Destroy its current transport
      // first so cancellation/deadline actually releases the socket now. No
      // query or retry is permitted here, including after uncertain COMMIT.
      try { client.connection?.stream?.destroy(); } catch { /* redacted */ }
      try { void Promise.resolve(client.end()).catch(() => {}); } catch { /* no secret-bearing errors */ }
    };
    const check = () => { if (stopped || signal?.aborted) throw failure(); };
    const query = async (client, text, values) => { check(); const answer = await client.query(text, values); check(); return answer; };
    const connect = async () => {
      check(); const client = makeClient();
      if (!client || typeof client !== 'object' || seen.has(client)
        || !['connect', 'query', 'end'].every(key => typeof client[key] === 'function')) throw failure();
      seen.add(client); clients.push(client);
      // pg emits connection errors separately from query rejections.
      client.on?.('error', () => { stopped = true; for (const c of clients) close(c); });
      await client.connect(); check();
      const row = one(await query(client, IDENTITY_SQL));
      if (row.database !== database || row.role !== expectedRole || row.session_role !== expectedRole || row.fsync !== 'on'
        || !Number.isSafeInteger(row.pid) || row.pid < 1) throw failure();
      return { client, pid: row.pid };
    };
    try {
      validate(input, completion);
      // Snapshot all request fields before the first asynchronous boundary.
      const args = { ...input };
      const observation = completion ? JSON.stringify(args.observation) : undefined;
      if (completion && (typeof observation !== 'string' || Buffer.byteLength(observation) > 8192)) throw failure();
      check();
      const stoppedPromise = new Promise((_, reject) => {
        listener = () => { stopped = true; for (const client of clients) close(client); reject(failure()); };
        signal?.addEventListener('abort', listener, { once: true });
        timer = setTimeout(listener, timeoutMs);
      });
      if (signal?.aborted) listener();
      const work = (async () => {
        const primary = await connect(), client = primary.client;
        await query(client, 'BEGIN');
        await query(client, "SET LOCAL statement_timeout='3000ms'; SET LOCAL lock_timeout='2000ms'; SET LOCAL idle_in_transaction_session_timeout='4000ms'; SET LOCAL timezone='UTC'; SET LOCAL synchronous_commit='on'");
        const sync = one(await query(client, "select current_setting('synchronous_commit') sync"));
        if (sync.sync !== 'on') throw failure();
        if (one(await query(client, CASE_SQL, [args.caseId])).account_scope !== accountScope) throw failure();
        const result = one(await query(client, completion
          ? 'select touchline_quota_private.complete_recovery_measurement($1,$2,$3,$4,$5,$6::jsonb) result'
          : 'select touchline_quota_private.admit_recovery_measurement($1,$2,$3,$4,$5) result',
        [args.caseId, args.workerId, args.requestId, args.endpoint, completion ? args.token : args.budgetMs,
          ...(completion ? [observation] : [])])).result;
        if (completion ? !exact(result, ['persisted']) || typeof result.persisted !== 'boolean'
          : !(exact(result, ['allowed']) && result.allowed === false)
            && !(exact(result, ['allowed', 'token']) && result.allowed === true && uuid(result.token))) throw failure();
        const committed = await query(client, 'COMMIT');
        if (committed.command !== 'COMMIT') throw failure();
        if (!completion && result.allowed) {
          const observer = await connect();
          if (observer.pid === primary.pid) throw failure();
          const row = one(await query(observer.client, OBSERVE_SQL, [args.caseId, accountScope, args.requestId]));
          if (row.request_id !== args.requestId || row.owner_worker_id !== args.workerId || row.endpoint !== args.endpoint
            || row.token !== result.token || row.case_id !== args.caseId || row.account_scope !== accountScope
            || row.enabled !== false || row.blocked_unknown !== true || row.workers_off !== true
            || row.valid_lease !== true || row.expected_state !== true) throw failure();
        }
        check();
        return Object.freeze(completion ? { persisted: result.persisted } : result.allowed ? { allowed: true, token: result.token } : { allowed: false });
      })();
      return await Promise.race([work, stoppedPromise]);
    } catch {
      // Closing a dedicated connection rolls back any uncommitted transaction.
      // Never send another query after an uncertain COMMIT or abort.
      throw failure();
    } finally {
      stopped = true; clearTimeout(timer); if (listener) signal?.removeEventListener('abort', listener);
      for (const client of clients) close(client);
    }
  }
  return Object.freeze({ admit: (args, signal) => run(args, signal, false), complete: (args, signal) => run(args, signal, true) });
}
