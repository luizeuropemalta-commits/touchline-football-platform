import 'server-only';
import { createFixtureAuthorityServer } from './fixture-authority-server.ts';

/** Authority host only: explicit central credentials, never content DB defaults.
 * Reconstruct per request so OFF and worker rotation affect subsequent requests.
 * In-flight work still requires an operator drain before cutover. */
export async function serveConfiguredFixtureAuthority(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  try {
    if (environment.TOUCHLINE_QUOTA_AUTHORITY_ENABLED !== 'true') {
      return createFixtureAuthorityServer({}, fetchImpl)(request);
    }
    const encoded = environment.TOUCHLINE_QUOTA_AUTHORITY_WORKERS_JSON;
    if (!encoded || new TextEncoder().encode(encoded).byteLength > 16384) throw Error('Invalid binding');
    const workers: unknown = JSON.parse(encoded);
    if (!Array.isArray(workers) || workers.length < 1 || workers.length > 32
      || workers.some(worker => !worker || typeof worker !== 'object' || Array.isArray(worker)
        || Object.keys(worker).sort().join(',') !== 'environment,token,workerId')) throw Error('Invalid workers');
    // Deep schema, duplicate identities/tokens and credential separation are
    // checked by the canonical composition before constructing any RPC client.
    return createFixtureAuthorityServer({ enabled: true,
      projectRef: environment.TOUCHLINE_QUOTA_AUTHORITY_PROJECT_REF ?? '',
      serviceKey: environment.TOUCHLINE_QUOTA_AUTHORITY_SERVICE_KEY ?? '',
      accountScope: environment.TOUCHLINE_QUOTA_AUTHORITY_ACCOUNT_SCOPE ?? '',
      workers,
    }, fetchImpl)(request);
  } catch {
    // No config fragments or secrets in logs/responses; same closed handler.
    return createFixtureAuthorityServer({}, fetchImpl)(request);
  }
}
