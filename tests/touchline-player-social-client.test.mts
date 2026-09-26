import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { playerSocialIdFromProfileHref, requestPlayerSocial, resolvePlayerSocialSubject } from "../lib/touchlineArena/player-social-client.ts";

const summary = { followerCount: 2, likeCount: 3, following: true, liked: false };
test("already aborted social request never starts transport", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(requestPlayerSocial("123", { signal: controller.signal, fetcher: async () => {
    calls++;
    return Response.json({ ok: true, data: summary, canReact: true });
  } }), { name: "AbortError" });
  assert.equal(calls, 0);
});
test("abort while consuming social response rejects late success for GET and PUT", async () => {
  for (const mutation of [undefined, { kind: "like" as const, active: true }]) {
    const controller = new AbortController();
    await assert.rejects(requestPlayerSocial("123", { signal: controller.signal, mutation, fetcher: async () => {
      const response = Response.json({ ok: true, data: summary, canReact: true });
      const read = response.json.bind(response);
      response.json = async () => { const body = await read(); controller.abort(); return body; };
      return response;
    } }), { name: "AbortError" });
  }
});
test("explicit social identity is validated and conflicting identities fail closed", () => {
  assert.equal(resolvePlayerSocialSubject("sportmonks:123", "/touchline-players/cherki"), "123");
  assert.equal(resolvePlayerSocialSubject(undefined, "/touchline-players/cherki?playerId=123"), "123");
  assert.equal(resolvePlayerSocialSubject("123", "/touchline-players/cherki?playerId=123"), "123");
  assert.equal(resolvePlayerSocialSubject("123", "/touchline-players/cherki?playerId=456"), null);
  for (const invalid of ["", "demo-player", "0", "-1", "dbb09c72-9854-4dd0-96c1-66e2eca54103"]) {
    assert.equal(resolvePlayerSocialSubject(invalid, "/touchline-players/cherki?playerId=123"), null);
  }
});
test("Gameweek zoom supplies a social subject without changing public profile links", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
  assert.match(source, /socialProviderId=\{String\(exact\.sportmonksPlayerId \?\? ""\)\}/);
  const linkInput = source.slice(source.indexOf("const profileHref"), source.indexOf("const resolvedDisplayWidth"));
  assert.doesNotMatch(linkInput, /sportmonksPlayerId/);
});
test("only canonical player profile links select the social subject", () => {
  assert.equal(playerSocialIdFromProfileHref("/touchline-players/cherki?playerId=123&lang=pt-BR"), "123");
  assert.equal(playerSocialIdFromProfileHref("/touchline-players/cherki?playerId=sportmonks%3A123"), "123");
  for (const href of [undefined, "/touchline-coaches/coach?playerId=123", "/touchline-players/demo?playerId=demo", "/touchline-players/cherki", "https://other.test/touchline-players/cherki?playerId=123"]) assert.equal(playerSocialIdFromProfileHref(href), null);
});
test("client sends desired state and displays only a complete acknowledged server result", async () => {
  const signal = new AbortController().signal;
  const result = await requestPlayerSocial("123", { signal, mutation: { kind: "follow", active: false }, fetcher: async (url, init) => {
    assert.equal(url, "/api/touchline/players/123/social");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.method, "PUT"); assert.equal(init?.signal, signal);
    assert.deepEqual(JSON.parse(init?.body as string), { kind: "follow", active: false });
    return Response.json({ ok: true, data: summary, canReact: true });
  } });
  assert.deepEqual(result, { summary, canReact: true });
});
test("unauthorised, unavailable, malformed and network failures never become success", async () => {
  for (const response of [
    Response.json({}, { status: 401 }), Response.json({}, { status: 503 }),
    Response.json({ ok: true, data: { ...summary, likeCount: "3" }, canReact: true }),
    Response.json({ ok: true, data: summary }),
  ]) await assert.rejects(requestPlayerSocial("123", { signal: new AbortController().signal, fetcher: async () => response }));
  await assert.rejects(requestPlayerSocial("123", { signal: new AbortController().signal, fetcher: async () => { throw new Error("offline"); } }));
});
test("refresh reads persistent state without issuing another mutation", async () => {
  await requestPlayerSocial("123", { signal: new AbortController().signal, fetcher: async (_url, init) => {
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    return Response.json({ ok: true, data: summary, canReact: false });
  } });
});
test("runtime social controls are outside artwork and preserve field-card dimensions", () => {
  const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(source("components/touchline/cards/TouchlineEliteExactCard.tsx"), /showSocialMetrics && isEditable \?/);
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  assert.match(zoom, /data-card-zoom="expanded">\{expandedContent \?\? children\}<\/div>\s*\{socialPlayerId && details \? <TouchlinePlayerSocialActions/);
  const client = source("components/touchline/social/TouchlinePlayerSocialActions.tsx");
  assert.doesNotMatch(client, /localStorage|setIsLiked|setIsFollowing/);
  assert.match(client, /key=\{id\}/);
  assert.match(client, /mutationBusy\.current/);
  assert.match(client, /setPhase\("loading"\); setRevision/);
});

test("same-player instances invalidate through GET only after a confirmed mutation", () => {
  const client = readFileSync(new URL("../components/touchline/social/TouchlinePlayerSocialActions.tsx", import.meta.url), "utf8");
  const mutationStart = client.indexOf("async function mutate");
  assert.equal(client.slice(0, mutationStart).includes(".publish("), false);
  assert.match(client.slice(mutationStart), /playerSocialInvalidation\.publish\(providerId\)/);
  assert.match(client, /playerSocialInvalidation\.subscribe\(providerId, refresh\)/);
  assert.match(client, /unsubscribe\(\)/);
  assert.match(client, /window\.removeEventListener\("focus", refresh\)/);
});

test("narrow card columns wrap whole social buttons instead of crushing their icons", () => {
  const css = readFileSync(new URL("../components/touchline/social/TouchlinePlayerSocialActions.module.css", import.meta.url), "utf8");
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 140px\), 1fr\)\)/);
  assert.match(css, /svg \{ flex: 0 0 18px;/);
});
