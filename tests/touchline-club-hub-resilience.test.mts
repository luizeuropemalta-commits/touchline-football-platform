import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveTouchlineInternalAppOrigin, touchlineInternalUrl } from "../lib/server/internal-app-origin.ts";
import { fetchTouchlineInternalJson } from "../lib/server/safe-internal-fetch.ts";

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const squadGridSource = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
const officialLineupSource = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
const errorBoundarySource = readFileSync(new URL("../app/error.tsx", import.meta.url), "utf8");
const safeFetchSource = readFileSync(new URL("../lib/server/safe-internal-fetch.ts", import.meta.url), "utf8");
const apiAccessSource = readFileSync(new URL("../lib/touchlineArena/api-access.ts", import.meta.url), "utf8");
const editorRequestSource = readFileSync(new URL("../lib/touchlineArena/editor-request.ts", import.meta.url), "utf8");

test("ClubHub bounds squad loading and distinguishes unavailable data from a normal empty state", () => {
  assert.match(safeFetchSource, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(safeFetchSource, /TOUCHLINE_INTERNAL_FETCH_TIMEOUT_MS = 6_000/);
  assert.match(source, /state: "ready" as const/);
  assert.match(source, /state: "unavailable" as const/);
  assert.match(source, /Não foi possível carregar o elenco agora\./);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /role=\{squadUnavailable \? "status" : undefined\}/);
});

test("ClubHub prioritizes only the first visible squad cards and defers remaining card artwork", () => {
  assert.match(squadGridSource, /imageLoading=\{index < 4 \? "eager" : "lazy"\}/);
  assert.match(squadGridSource, /CARD_BATCH_SIZE = 8/);
  assert.match(officialLineupSource, /imageLoading="lazy"/);
});

test("ClubHub resolves its internal API URL without request-controlled host headers", () => {
  assert.doesNotMatch(source, /x-forwarded-host|x-forwarded-proto|from "next\/headers"/);
  assert.match(source, /fetchTouchlineInternalJson<[\s\S]*?\/api\/football-data\/premier-squad/);
  assert.equal(
    resolveTouchlineInternalAppOrigin({
      NODE_ENV: "production",
      VERCEL_URL: "touchline-preview.vercel.app",
    }),
    "https://touchline-preview.vercel.app",
  );
  assert.equal(
    touchlineInternalUrl("/api/football-data/premier-squad?teamId=19").href,
    "http://127.0.0.1:3000/api/football-data/premier-squad?teamId=19",
  );
});

test("untrusted host-like values cannot become internal destinations", () => {
  assert.throws(
    () => resolveTouchlineInternalAppOrigin({ NODE_ENV: "production" }),
    /No trusted TouchLine internal application origin/,
  );
  assert.throws(() => touchlineInternalUrl("//attacker.invalid/api"), /absolute paths/);
});

test("host and forwarded headers cannot grant local editor access", () => {
  assert.doesNotMatch(apiAccessSource, /request\.headers\.get\(/);
  assert.doesNotMatch(apiAccessSource, /request\.url/);
  assert.match(apiAccessSource, /isLocalTouchlineEditorEnabled\(\)/);
  assert.doesNotMatch(editorRequestSource, /headers\.get|new URL\(/);
  assert.match(editorRequestSource, /TOUCHLINE_ALLOW_LOCAL_EDITOR/);
});

test("unexpected rendering failures use a safe recovery boundary without exposing internal errors", () => {
  assert.match(errorBoundarySource, /function TouchlineErrorBoundary\(\{ error: _error, reset \}/);
  assert.match(errorBoundarySource, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(errorBoundarySource, /Nenhum dado do seu clube foi alterado/);
  assert.doesNotMatch(errorBoundarySource, /error\.message|error\.stack/);
});

test("internal JSON reads preserve a normal response and classify empty, invalid and 500 replies as unavailable", async () => {
  const normal = await fetchTouchlineInternalJson<{ ok: boolean }>("/api/football-data/premier-squad?teamId=19", {
    fetchImplementation: async (url) => {
      assert.equal(url.origin, "http://127.0.0.1:3000");
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  assert.deepEqual(normal, { state: "ready", data: { ok: true }, status: 200 });

  const invalid = await fetchTouchlineInternalJson("/api/test", {
    fetchImplementation: async () => new Response("not json", { status: 200 }),
  });
  assert.deepEqual(invalid, { state: "unavailable", reason: "invalid-json" });

  const empty = await fetchTouchlineInternalJson("/api/test", {
    fetchImplementation: async () => new Response("", { status: 200 }),
  });
  assert.deepEqual(empty, { state: "unavailable", reason: "empty" });

  const serverFailure = await fetchTouchlineInternalJson("/api/test", {
    fetchImplementation: async () => new Response("server failed", { status: 500 }),
  });
  assert.deepEqual(serverFailure, { state: "unavailable", reason: "http" });
});

test("internal failures are bounded and do not retry automatically", async () => {
  let calls = 0;
  const timeout = await fetchTouchlineInternalJson("/api/test", {
    fetchImplementation: async () => {
      calls += 1;
      throw new DOMException("timed out", "TimeoutError");
    },
  });
  assert.deepEqual(timeout, { state: "unavailable", reason: "timeout" });
  assert.equal(calls, 1);
});
