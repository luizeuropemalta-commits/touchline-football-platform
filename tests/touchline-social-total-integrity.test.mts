import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("player profiles never manufacture follower totals from a player identity", () => {
  const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /playerFollowerCount|940_000|24_000/);
  assert.match(source, /<TouchlinePlayerSocialActions/);
  assert.doesNotMatch(source, /<TouchlineSocialProfileActions/);
  assert.doesNotMatch(source, /Sincronização oficial em andamento|Official sync in progress/);
  assert.match(source, /Dados oficiais adicionais indisponíveis/);
});

test("an unknown social total stays unknown rather than becoming a local synthetic count", () => {
  const source = readFileSync(new URL("../components/touchline/social/TouchlineSocial.tsx", import.meta.url), "utf8");
  assert.match(source, /followerCount: number \| null/);
  assert.match(source, /followerCount === null \? "—" : compact\(followerCount, locale\)/);
  assert.doesNotMatch(source, /followerCount \+ \(isFollowing \? 1 : 0\)/);
});

test("public feed reactions cannot fabricate acknowledgement or a total from browser storage", () => {
  const source = readFileSync(new URL("../components/touchline/social/TouchlineSocial.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /likedPosts|toggleLike|touchline:social:likes:|\+ \(liked \? 1 : 0\)/);
  assert.match(source, /Curtidas indisponíveis/);
  assert.match(source, /<button type="button" disabled title=\{isPortuguese \? "Curtidas indisponíveis/);
});
