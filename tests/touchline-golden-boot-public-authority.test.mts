import assert from "node:assert/strict";
import test from "node:test";
import { advanceGoldenBootAuthority, createGoldenBootAuthorityState, expireGoldenBootAuthority,
  hasGoldenBoot, parseGoldenBootPublicAuthority } from "../lib/touchlineArena/golden-boot-public-authority.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const now = Date.parse("2026-10-01T12:00:00Z");
const empty = () => createGoldenBootAuthorityState(id(1),id(2));
const ready = (revision = "90071992547409930") => ({ status: "ready", snapshotId: id(3), revision,
  competitionId: id(1), seasonId: id(2), playerIds: [id(4),id(5)],
  expiresAt: new Date(now+60_000).toISOString(), freshnessAuthority: "fetch-age-only" });

test("all tied UUIDs get the boot independently of rating/crown fields", () => {
  const state = advanceGoldenBootAuthority(empty(),ready(),now);
  assert.equal(hasGoldenBoot(state,id(4),now),true);
  assert.equal(hasGoldenBoot(state,id(5),now),true);
  assert.equal(hasGoldenBoot(state,id(6),now),false);
  assert.equal(hasGoldenBoot(state,"Haaland",now),false);
});

test("expiry survives offline replay and wall-clock regression", () => {
  const state = advanceGoldenBootAuthority(empty(),ready(),now);
  assert.equal(hasGoldenBoot(state,id(4),now+60_000),false);
  const expired = expireGoldenBootAuthority(state,now+60_000);
  assert.equal(expired.current,null);
  assert.ok(expired.watermark);
  assert.equal(advanceGoldenBootAuthority(expired,ready(),now).current,null);
});

test("explicit revocation beats old seeds with revisions beyond JS safe integers", () => {
  const state = advanceGoldenBootAuthority(empty(),ready(),now);
  const revoked = advanceGoldenBootAuthority(state,{ ...ready("90071992547409931"),
    status: "unavailable", snapshotId: null, playerIds: [], expiresAt: null },now);
  assert.equal(revoked.current,null);
  assert.equal(advanceGoldenBootAuthority(revoked,ready(),now).current,null);
  assert.ok(advanceGoldenBootAuthority(revoked,ready("90071992547409932"),now).current);
});

test("equal revision conflict and transport failure cannot resurrect on replay", () => {
  for (const payload of [null, {}, { ...ready(), playerIds: [id(6)] }]) {
    const state = advanceGoldenBootAuthority(empty(),ready(),now);
    const revoked = advanceGoldenBootAuthority(state,payload,now);
    assert.equal(revoked.current,null);
    assert.equal(advanceGoldenBootAuthority(revoked,ready(),now).current,null);
  }
});

test("old and foreign-scope results never replace a newer valid award", () => {
  const state = advanceGoldenBootAuthority(empty(),ready(),now);
  assert.equal(advanceGoldenBootAuthority(state,ready("90071992547409929"),now),state);
  assert.equal(advanceGoldenBootAuthority(state,{ ...ready("90071992547409932"),seasonId: id(9) },now),state);
});

test("parsing rejects invalid scope, partial ties and ambiguous revisions", () => {
  for (const patch of [ { competitionId: "8" }, { seasonId: "2026/27" }, { revision: 1 },
    { revision: "01" }, { revision: "-1" }, { playerIds: [] }, { playerIds: [id(4),id(4)] },
    { playerIds: [id(4),"unknown"] }, { expiresAt: "invalid" }, { snapshotId: null },
    { status: "unavailable" }, { freshnessAuthority: "assumed" } ]) {
    assert.equal(parseGoldenBootPublicAuthority({ ...ready(),...patch }),null);
  }
});

test("caller mutation cannot change the stored leader set", () => {
  const payload = ready();
  const state = advanceGoldenBootAuthority(empty(),payload,now);
  payload.playerIds[0] = id(6);
  payload.expiresAt = new Date(now+600_000).toISOString();
  assert.equal(hasGoldenBoot(state,id(4),now),true);
  assert.equal(hasGoldenBoot(state,id(6),now),false);
  assert.equal(hasGoldenBoot(state,id(4),now+60_000),false);
});

test("expiry requires a real UTC timestamp rather than permissive Date.parse normalization", () => {
  for (const expiresAt of ["2099", "2099-02-30T00:00:00Z", "2099-13-01T00:00:00Z", "2099-01-01T24:00:00Z"]) {
    assert.equal(parseGoldenBootPublicAuthority({ ...ready(), expiresAt }), null);
  }
  assert.ok(parseGoldenBootPublicAuthority({ ...ready(), expiresAt: "2026-10-01T12:01:00.123456+00:00" }));
});
