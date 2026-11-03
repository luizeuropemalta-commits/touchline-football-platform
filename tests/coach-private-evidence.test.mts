import assert from "node:assert/strict";
import test from "node:test";
import { mapSportmonksFixtureCoaches } from "../lib/football-data/fixture-coach-attribution.ts";
import { sanitizeProviderPayloadForPersistence } from "../lib/football-data/provider-payload-sanitize.ts";
import { projectPrivateFixtureCoachNames } from "../lib/football-data/coach-editorial-evidence.ts";

const fixture = () => ({
  id: 901, league_id: 8, season_id: 701, starting_at: "2026-08-01 15:00:00",
  participants: [{ id: 10, meta: { location: "home" } }, { id: 11, meta: { location: "away" } }],
  coaches: [
    { id: 101, display_name: "Synthetic Coach A", name: "Synthetic full name A", team_id: 999,
      image_path: "https://media.invalid/synthetic.png", date_of_birth: "1980-01-01", token: "synthetic-private",
      meta: { fixture_id: 901, coach_id: 101, participant_id: 10 } },
    { id: 102, display_name: "Synthetic Coach B", name: "Synthetic full name B", team_id: 998,
      image_path: "https://media.invalid/synthetic.png", date_of_birth: "1980-01-02", token: "synthetic-private",
      meta: { fixture_id: 901, coach_id: 102, participant_id: 11 } },
  ],
});

test("private allowlist keeps only officially linked display names and does not mutate attribution", () => {
  const raw = fixture();
  const before = structuredClone(raw);
  const attribution = mapSportmonksFixtureCoaches(raw);
  const projection = projectPrivateFixtureCoachNames(raw);
  assert.ok(projection);
  assert.deepEqual(projection.identities, [
    { coachProviderId: "101", clubProviderId: "10", location: "home", displayName: "Synthetic Coach A" },
    { coachProviderId: "102", clubProviderId: "11", location: "away", displayName: "Synthetic Coach B" },
  ]);
  assert.deepEqual(mapSportmonksFixtureCoaches(raw), attribution);
  assert.deepEqual(raw, before);
  const json = JSON.stringify(projection);
  for (const forbidden of ["team_id", "999", "998", "image_path", "date_of_birth", "token", "synthetic-private", "starting_at", "current", "approved"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});

test("the existing sanitizer keeps the bounded private projection and still discards raw", () => {
  const raw = fixture();
  const projection = projectPrivateFixtureCoachNames(raw);
  const sanitized = sanitizeProviderPayloadForPersistence({ projection, source: { raw }, token: "synthetic" });
  assert.deepEqual(sanitized.projection, projection);
  assert.deepEqual(sanitized.source, {});
  assert.equal(Object.hasOwn(sanitized, "token"), false);
});

test("only an absent display name falls back to the official name field", () => {
  for (const missing of [undefined, null, "", "   "]) {
    const raw = fixture();
    Object.assign(raw.coaches[0], { display_name: missing, name: "  Synthetic   Name  " });
    assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, "Synthetic Name");
  }
  const raw = fixture();
  Object.assign(raw.coaches[0], { display_name: "<invalid>", name: "Valid fallback must not mask invalid field" });
  assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, null);
});

test("missing name remains a private pending identity, never a generated Coach ID label", () => {
  const raw = fixture();
  Object.assign(raw.coaches[0], { display_name: undefined, name: undefined });
  assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, null);
});

for (const value of ["<script>", "mail@example.invalid", "https://example.invalid", "www.example.invalid", "Coach 101", "123", "Synthetic\nCoach", "Synthetic\u202eCoach", "x".repeat(121), { name: "injected" }, "api_token=synthetic", "sportmonks.com"]) {
  test(`invalid or sensitive name is rejected (${typeof value === "object" ? "object" : JSON.stringify(value).slice(0, 40)})`, () => {
    const raw = fixture();
    Object.assign(raw.coaches[0], { display_name: value });
    assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, null);
  });
}

test("legitimate Unicode and apostrophes remain intact", () => {
  const raw = fixture();
  raw.coaches[0].display_name = "Synthétique O’Example";
  assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, "Synthétique O’Example");
});

test("the configured provider token is never retained as a name", () => {
  const prior = process.env.SPORTMONKS_API_TOKEN;
  try {
    process.env.SPORTMONKS_API_TOKEN = "synthetic-provider-credential";
    const raw = fixture();
    raw.coaches[0].display_name = "synthetic-provider-credential";
    assert.equal(projectPrivateFixtureCoachNames(raw)?.identities[0].displayName, null);
  } finally {
    if (prior === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = prior;
  }
});

test("foreign fixture, coach, participant, duplicates or extra records never form evidence", () => {
  const mutations = [
    (raw: ReturnType<typeof fixture>) => { raw.coaches[0].meta.fixture_id = 902; },
    (raw: ReturnType<typeof fixture>) => { raw.coaches[0].meta.coach_id = 102; },
    (raw: ReturnType<typeof fixture>) => { raw.coaches[0].meta.participant_id = 999; },
    (raw: ReturnType<typeof fixture>) => { raw.coaches[1].id = 101; raw.coaches[1].meta.coach_id = 101; },
    (raw: ReturnType<typeof fixture>) => { raw.coaches.push(structuredClone(raw.coaches[0])); },
    (raw: ReturnType<typeof fixture>) => { raw.participants[1].meta.location = "home"; },
  ];
  for (const mutate of mutations) {
    const raw = fixture();
    mutate(raw);
    assert.equal(projectPrivateFixtureCoachNames(raw), null);
  }
});
