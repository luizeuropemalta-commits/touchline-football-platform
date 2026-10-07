import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-10-03T07:00:00.000Z", now = Date.parse(stamp) + 1000;
const hash = `sha256:${"a".repeat(64)}`;
const request = { canonicalFixtureId: uuid(1), providerFixtureId: "123" };
const policy = { capturedAt: 5000, fixtureUpdatedAt: 4000, playerSyncedAt: 3000, coachSourceUpdatedAt: 2000 };

function load() {
  const source = readFileSync(new URL("../lib/touchlineArena/fixture-final-push-source-server.ts", import.meta.url), "utf8");
  const value = { ok: true, data: { fixtureId: "123", score: { home: 0, away: 0 }, sourceChecksum: hash, sourceRevisionChecksum: hash, sourceRevisionManifest: { [`fixture:${uuid(1)}`]: 4 }, home: { name: "Home", teamId: "10" }, away: { name: "Away", teamId: "20" } }, evidence: {
    fixtureId: uuid(1), providerFixtureId: "123", competitionId: uuid(2), competitionProviderId: "8", seasonId: uuid(3), seasonProviderId: "99", roundId: uuid(4), homeClubId: uuid(5), awayClubId: uuid(6), homeProviderTeamId: "10", awayProviderTeamId: "20", clockRevision: 4, capturedAt: stamp, fixtureUpdatedAt: stamp,
    players: [{ id: uuid(10), playerId: uuid(11), clubId: uuid(5), sourceSyncedAt: stamp }], coaches: [{ id: uuid(20), contractId: uuid(21), clubId: uuid(5), sourceUpdatedAt: stamp, settledAt: stamp }],
  } };
  let reads = 0, fail = false, clock = now;
  const dependencies = { "server-only": {}, "node:crypto": { createHash }, "./social-final-score-draft-server.ts": { readTouchlineFinalScorePushEvidence: async () => { reads++; if (fail) throw Error("offline"); return structuredClone(value); } } };
  const compiledModule = { exports: {} as { createFixtureFinalPushSource: (options: unknown) => (input: unknown) => Promise<Record<string, unknown>> } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: compiledModule, exports: compiledModule.exports, require: (id: keyof typeof dependencies) => { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; }, Date,
  });
  return { ...compiledModule.exports, value, reads: () => reads, fail() { fail = true; }, clock(n: number) { clock = n; }, options: { enabled: true, maximumAgeMs: policy, maxRows: 10, timeoutMs: 1000, now: () => clock } };
}

test("source factory defaults OFF and requires explicit complete trusted age/read policy before queries", async () => {
  for (const settings of [undefined, {}, { enabled: true }, { enabled: true, maximumAgeMs: policy }, { enabled: true, maximumAgeMs: { ...policy, playerSyncedAt: 0 }, maxRows: 10, timeoutMs: 1000, now: () => now }]) {
    const h = load(); const result = await h.createFixtureFinalPushSource(settings)(request); assert.equal(result.ok, false); assert.equal(h.reads(), 0);
  }
});

test("score-only fingerprint is canonical fixture-final, not editorial checksum/rating/language/sound/revision", async () => {
  const h = load(), read = h.createFixtureFinalPushSource(h.options);
  const first = await read(request) as { ok: boolean; source: { factsFingerprint: string; validUntil: string; kind: string; fixtureId: string } };
  assert.equal(first.ok, true); assert.equal(first.source.kind, "fixture-final"); assert.equal(first.source.fixtureId, uuid(1));
  assert.equal(first.source.validUntil, "2026-10-03T07:00:02.000Z");
  const expected = `sha256:${createHash("sha256").update(JSON.stringify(["touchline-fixture-final-facts-v1", uuid(1), "123", uuid(2), "8", uuid(3), "99", uuid(5), "10", uuid(6), "20", "finished", 0, 0])).digest("hex")}`;
  assert.equal(first.source.factsFingerprint, expected);
  h.value.data.sourceChecksum = `sha256:${"b".repeat(64)}`; h.value.data.home.name = "Translated name"; h.value.evidence.clockRevision++;
  const editorial = await read(request) as typeof first; assert.equal(editorial.source.factsFingerprint, first.source.factsFingerprint);
  h.value.data.score.home = 1; const corrected = await read(request) as typeof first; assert.notEqual(corrected.source.factsFingerprint, first.source.factsFingerprint);
});

test("every constituent has individual explicit age; aggregate MAX/recent settled_at cannot rescue stale source", async () => {
  for (const mutate of [
    (h: ReturnType<typeof load>) => { h.value.evidence.capturedAt = "2026-10-03T06:59:00Z"; },
    (h: ReturnType<typeof load>) => { h.value.evidence.fixtureUpdatedAt = "2026-10-03T06:59:00Z"; },
    (h: ReturnType<typeof load>) => { h.value.evidence.players[0].sourceSyncedAt = "2026-10-03T06:59:00Z"; },
    (h: ReturnType<typeof load>) => { h.value.evidence.coaches[0].sourceUpdatedAt = "2026-10-03T06:59:00Z"; },
    (h: ReturnType<typeof load>) => { h.value.evidence.players[0].sourceSyncedAt = "2027-01-01T00:00:00Z"; },
    (h: ReturnType<typeof load>) => { h.value.evidence.coaches[0].sourceUpdatedAt = ""; },
    (h: ReturnType<typeof load>) => { h.value.evidence.players.length = 0; },
    (h: ReturnType<typeof load>) => { h.value.evidence.coaches.length = 0; },
  ]) { const h = load(); mutate(h); assert.equal((await h.createFixtureFinalPushSource(h.options)(request)).ok, false); }
});

test("binding, strict score/null and revision checks fail closed; reads/errors never imply enqueue or transport", async () => {
  for (const mutate of [
    (h: ReturnType<typeof load>) => { h.value.evidence.fixtureId = uuid(90); },
    (h: ReturnType<typeof load>) => { h.value.evidence.providerFixtureId = "124"; },
    (h: ReturnType<typeof load>) => { h.value.data.fixtureId = "124"; },
    (h: ReturnType<typeof load>) => { h.value.data.score.home = null as unknown as number; },
    (h: ReturnType<typeof load>) => { h.value.data.score.away = -1; },
    (h: ReturnType<typeof load>) => { h.value.data.sourceRevisionChecksum = ""; },
    (h: ReturnType<typeof load>) => { h.value.evidence.clockRevision = NaN; },
    (h: ReturnType<typeof load>) => h.fail(),
  ]) { const h = load(); mutate(h); assert.equal((await h.createFixtureFinalPushSource(h.options)(request)).ok, false); }
  const h = load(), settings = { ...h.options, maximumAgeMs: { ...policy } }, read = h.createFixtureFinalPushSource(settings);
  settings.maximumAgeMs.coachSourceUpdatedAt = 999999; h.clock(now + 1000);
  assert.equal((await read(request)).ok, false, "captured policy and time boundary are immutable");
});
