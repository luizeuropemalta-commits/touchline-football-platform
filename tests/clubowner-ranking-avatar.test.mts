import assert from "node:assert/strict";
import test from "node:test";
import { projectClubOwnerPublicPhotos } from "../lib/touchlineArena/club-owner-standings.ts";
import { refreshPublicOwnerAvatar } from "../lib/touchlineArena/clubowner-avatar-refresh.ts";
const account = "10000000-0000-4000-8000-000000000001", id = "20000000-0000-4000-8000-000000000001";
const profile = { publicId: id, displayName: "Public name", followerCount: 0, following: false, viewer: "guest", planKey: "vip" };
const url = `/api/touchline/clubowners/${id}/avatar?v=${"a".repeat(64)}`;
test("identity join preserves tied names and strips private descriptors", () => {
 const rows = [{ rank: 1, name: "Same", touchlinePoints: 7 }, { rank: 1, name: "Same", touchlinePoints: 7 }];
 const result = projectClubOwnerPublicPhotos(rows, [{accountId: account, rank:1}, {accountId: account.replace(/1$/, "2"), rank:1}], [{...profile, accountId: account, email:"secret", storageKey:"private", avatarUrl:url}]);
 assert.deepEqual(result, [{...rows[0], publicPhoto:{publicId:id, displayName:"Public name",planKey:"vip"}}, rows[1]]);
 assert.ok(!JSON.stringify(result).includes(account)); assert.ok(!JSON.stringify(result).includes("secret"));
 assert.deepEqual(projectClubOwnerPublicPhotos(rows, [{accountId:account,rank:1},{accountId:account.replace(/1$/,"2"),rank:1}], []), rows);
 assert.throws(() => projectClubOwnerPublicPhotos(rows, [], []));
 assert.throws(() => projectClubOwnerPublicPhotos([rows[0]], [{accountId:account,rank:1}], [{...profile,accountId:account},{...profile,accountId:account}]));
});
test("refresh follows replacement URL and removes withdrawn or private photos", async () => {
 const request = async (value: unknown, status = 200) => refreshPublicOwnerAvatar(id, new AbortController().signal, (async (path, options) => {
   assert.equal(path, `/api/touchline/clubowners/${id}`); assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect,"error");
   return Response.json(value,{status});
 }) as typeof fetch);
 assert.equal(await request({profile:{...profile,avatarUrl:url}}),url);
 assert.equal(await request({profile:{...profile,avatarUrl:url.replace("a".repeat(64),"b".repeat(64))}}),url.replace("a".repeat(64),"b".repeat(64)));
 assert.equal(await request({profile:{...profile,avatarUrl:null}}),null);
 assert.equal(await request({profile}),null);
 assert.equal(await request({},404),null);
 await assert.rejects(request({profile:{...profile,publicId:account,avatarUrl:null}}), /PUBLIC_PHOTO_METADATA_UNAVAILABLE/);
 await assert.rejects(request({profile:{...profile,avatarUrl:"https://private.invalid/photo"}}));
 await assert.rejects(request({padding:"x".repeat(17000)}));
});
test("metadata refresh rejects aborted work and non JSON transport", async () => {
 const controller = new AbortController();controller.abort();
 await assert.rejects(refreshPublicOwnerAvatar(id,controller.signal));
 await assert.rejects(refreshPublicOwnerAvatar(id,new AbortController().signal,(async()=>new Response("html")) as typeof fetch));
});

test("metadata cannot confirm absence using a missing or mismatched profile receipt", async () => {
 const request = (value: unknown) => refreshPublicOwnerAvatar(id, new AbortController().signal, (async () => Response.json(value)) as typeof fetch);
 for (const value of [{profile:null}, {profile:{...profile,publicId:account}}]) {
  await assert.rejects(request(value), /PUBLIC_PHOTO_METADATA_UNAVAILABLE/);
 }
 await assert.rejects(request({}));
 // UUID case is not a different identity; a confirmed absent photo remains valid.
 assert.equal(await request({profile:{...profile,publicId:id.toUpperCase(),avatarUrl:null}}),null);
 assert.equal(await request({profile:{...profile,avatarUrl:url}}),url);
});
