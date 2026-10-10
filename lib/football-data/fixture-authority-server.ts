import "server-only";
import { createFixtureAuthorityWorkerAuthenticator } from "./fixture-authority-worker-auth-server.ts";
import { createFixtureAuthorityGateway } from "./fixture-authority-gateway-server.ts";
import { createCentralQuotaStore } from "./fixture-authority-store-server.ts";
import { createCentralQuotaRpc } from "./fixture-authority-central-rpc-server.ts";

type AuthorityConfig = Readonly<{ enabled?: false }> | Readonly<{
  enabled: true;
  projectRef: string;
  serviceKey: string;
  accountScope: string;
  workers: readonly Readonly<{ workerId: string; environment: "qa" | "production"; token: string }>[];
}>;

/** Authority-host composition only. Does not expose a route, read environment
 * variables, enable sync or select a database automatically. The ONE scope and
 * destination are operator configuration, never worker/request input. SQL gates
 * and persisted worker registration must pass before an enabled deployment. */
export function createFixtureAuthorityServer(config: AuthorityConfig = {}, fetchImpl: typeof fetch = fetch) {
  if (config.enabled !== true) return createFixtureAuthorityGateway({}, {
    authenticate: () => null,
    execute: async () => { throw new Error("Fixture authority unavailable."); },
  });
  if (!Array.isArray(config.workers) || config.workers.some(worker => worker?.token === config.serviceKey)) {
    throw new Error("Fixture authority configuration unavailable.");
  }
  const authenticate = createFixtureAuthorityWorkerAuthenticator({ enabled: true,
    workers: config.workers.map(worker => ({
      workerId: worker?.workerId, environment: worker?.environment, token: worker?.token,
      accountScope: config.accountScope,
    })),
  });
  const rpc = createCentralQuotaRpc({ enabled: true, projectRef: config.projectRef,
    serviceKey: config.serviceKey, accountScope: config.accountScope, timeoutMs: 1500 }, fetchImpl);
  const execute = createCentralQuotaStore({ enabled: true, accountScope: config.accountScope, timeoutMs: 1800 }, rpc);
  return createFixtureAuthorityGateway({ enabled: true, timeoutMs: 2000 }, { authenticate, execute });
}
