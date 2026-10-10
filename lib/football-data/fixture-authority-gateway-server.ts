import "server-only";
import { parseFixtureAuthorityCommand, type FixtureAuthorityCommand } from "./fixture-authority-command-server.ts";
import type { FixtureAuthorityPrincipal } from "./fixture-authority-worker-auth-server.ts";
import type { CentralQuotaResult } from "./fixture-authority-store-server.ts";

const LIMIT = 8_192;
const PATH = "/api/internal/football-data/quota";
class Rejected extends Error {
  readonly status: number;
  constructor(status: number) { super("Fixture authority unavailable."); this.status = status; }
}
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(status === 405 ? { Allow: "POST" } : {}) },
});

/** Prepared handler factory, NOT an exposed route. Activation requires the
 * central store/ownership gate and authenticated secret configuration. */
export function createFixtureAuthorityGateway(config: Readonly<{ enabled?: boolean; timeoutMs?: number }>, dependencies: Readonly<{
  authenticate: (authorization: string | null) => FixtureAuthorityPrincipal | null;
  execute: (command: FixtureAuthorityCommand, signal: AbortSignal) => Promise<CentralQuotaResult>;
}>) {
  const enabled = config.enabled === true;
  const timeoutMs = config.timeoutMs ?? 2_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw new Error("Fixture authority configuration unavailable.");
  return async (request: Request): Promise<Response> => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let rejectStopped: (reason: Error) => void = () => {};
    const stop = () => {
      controller.abort(); rejectStopped(new Rejected(503));
      void reader?.cancel().catch(() => {});
    };
    try {
      if (!enabled || request.signal.aborted) throw new Rejected(503);
      const url = new URL(request.url);
      if (url.pathname !== PATH || url.search) throw new Rejected(404);
      if (request.method !== "POST") throw new Rejected(405);
      const principal = dependencies.authenticate(request.headers.get("authorization"));
      if (!principal) throw new Rejected(401);
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type")?.trim() ?? "")
        || ![null, "identity"].includes(request.headers.get("content-encoding"))) throw new Rejected(415);
      const length = request.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new Rejected(400);
      if (length !== null && Number(length) > LIMIT) throw new Rejected(413);
      if (!request.body) throw new Rejected(400);
      const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) stop();
      timer = setTimeout(stop, timeoutMs);
      const work = (async () => {
        if (controller.signal.aborted) throw new Rejected(503);
        reader = request.body!.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw new Rejected(503);
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > LIMIT) throw new Rejected(413);
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let command: FixtureAuthorityCommand;
        try {
          command = parseFixtureAuthorityCommand(principal, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
        } catch { throw new Rejected(400); }
        if (controller.signal.aborted) throw new Rejected(503);
        const result = await dependencies.execute(command, controller.signal);
        if (controller.signal.aborted) throw new Rejected(503);
        // Project only the public receipt fields, never an RPC envelope/error.
        const keys = Object.keys(result).sort().join(",");
        if (command.operation === "admit" && "allowed" in result) {
          if (result.allowed === false && keys === "allowed") return reply(200, { allowed: false });
          if (result.allowed === true && keys === "allowed,token" && typeof result.token === "string"
            && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result.token)) return reply(200, { allowed: true, token: result.token });
        }
        if (command.operation === "complete" && keys === "persisted" && "persisted" in result && typeof result.persisted === "boolean") return reply(200, { persisted: result.persisted });
        throw new Rejected(503);
      })();
      return await Promise.race([work, stopped]);
    } catch (error) {
      controller.abort();
      return reply(error instanceof Rejected ? error.status : 503, { error: "Fixture authority unavailable." });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      request.signal.removeEventListener("abort", stop);
      // Do not await an uncooperative stream's cancel hook.
      void (reader ? reader.cancel() : request.body?.cancel())?.catch(() => {});
    }
  };
}
