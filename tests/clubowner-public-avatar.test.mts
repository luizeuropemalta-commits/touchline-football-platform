import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as sdk from "@supabase/supabase-js";
import sharp from "sharp";
import { parsePublicOwnerAvatars, publicOwnerAvatarUrls } from "../lib/touchlineArena/clubowner-public-avatar-handler.ts";
import { handlePublicOwners } from "../lib/touchlineArena/clubowner-public-handler.ts";
import { parsePublicOwners } from "../lib/touchlineArena/clubowner-public-contract.ts";

const root = resolve(import.meta.dirname, ".."), native = createRequire(import.meta.url);
const host = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app", origin = `https://${host}`, project = "xgxbwqxjssxxuihuwmgy", database = `https://${project}.supabase.co`;
const actor = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222", operation = "33333333-3333-4333-8333-333333333333";
const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).webp().toBuffer();
const digest = createHash("sha256").update(bytes).digest("hex");
const descriptor = () => ({ publicId: id, consentVersion: "1793366000.123456", email: "customer@example.invalid", customerEligible: true,
  current: { actorId: actor, revision: "1", operationId: operation, digest, avatarUrl: `/api/account/avatar?version=${operation}` } });
const urlFor = (row = descriptor()) => publicOwnerAvatarUrls(parsePublicOwnerAvatars([row], [row.publicId], () => false))[row.publicId];

function fixture(patch: Record<string, string | undefined> = {}) {
  const environment: Record<string, string | undefined> = { TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED: "true", TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED: "true",
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", VERCEL_BRANCH_URL: host, VERCEL_URL: host,
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: project,
    SUPABASE_URL: database, NEXT_PUBLIC_SUPABASE_URL: database, NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: origin,
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-not-a-credential", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-not-a-credential", TOUCHLINE_OWNER_EMAILS: "admin@example.invalid", ...patch };
  const calls: string[] = [], args: unknown[] = [];
  const state = { rows: [descriptor()] as unknown[], storageStatus: 200, failRpc: false, drift: false,
    afterImage: undefined as undefined | (() => void), waitImage: undefined as undefined | Promise<void> };
  const cache = new Map<string, Record<string, unknown>>();
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, database);
    if (url.pathname.startsWith("/rest/")) {
      calls.push("rpc"); args.push(JSON.parse(String(init?.body))); assert.equal(url.pathname, "/rest/v1/rpc/touchline_people_read_public_avatars");
      if (state.drift) environment.TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED = "false";
      if (state.failRpc) return Response.json({ message: "PRIVATE_DATABASE" }, { status: 500 });
      return Response.json(state.rows);
    }
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    if (url.pathname.includes("/bucket/")) { calls.push("bucket"); return Response.json({ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars", public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/webp"] }); }
    calls.push("image"); assert.equal(url.pathname, `/storage/v1/object/authenticated/touchline-club-owner-avatars/${actor}/${operation}/${digest}.webp`);
    await state.waitImage; state.afterImage?.();
    return state.storageStatus === 200 ? new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } }) : new Response(null, { status: state.storageStatus });
  };
  function load(path: string): Record<string, unknown> {
    if (cache.has(path)) return cache.get(path)!;
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const require = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { ...sdk, createClient: (url: string, key: string) => {
        calls.push("client"); assert.equal(url, database); assert.equal(key, environment.SUPABASE_SERVICE_ROLE_KEY);
        return sdk.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport } });
      } };
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        if (!target.endsWith(".ts")) target += ".ts"; return load(target);
      }
      return native(name);
    };
    vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
      { exports, require, process: { env: environment }, fetch: transport, URL, Request, Response, AbortController, AbortSignal, Buffer, Uint8Array, performance, setTimeout, clearTimeout }, { filename: path });
    return exports;
  }
  const route = load(resolve(root, "app/api/touchline/clubowners/[publicId]/avatar/route.ts")) as { GET: (request: Request, context: unknown) => Promise<Response> };
  const service = (load(resolve(root, "lib/touchlineArena/clubowner-public-avatar-server.ts")).publicOwnerAvatarService as () => { enabled: boolean; urls: (ids: string[]) => Promise<Record<string, string>> })();
  const request = (path = urlFor(), signal?: AbortSignal) => new Request(origin + path, { signal });
  return { route, service, state, calls, args, environment, request, serve: (request = new Request(origin + urlFor())) => route.GET(request, { params: Promise.resolve({ publicId: id }) }) };
}

test("public avatar route serves current verified WebP to a guest without exposing private identity or Storage URL", async () => {
  const f = fixture(); assert.equal(f.service.enabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.service.urls([id]))), { [id]: urlFor() });
  f.calls.length = 0;
  const response = await f.serve(); assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("content-type"), "image/webp"); assert.equal(response.headers.get("etag"), null);
  assert.deepEqual(f.calls, ["client", "rpc", "bucket", "image", "rpc"]);
  assert.ok(f.args.every(value => JSON.stringify(value) === JSON.stringify({ p_public_ids: [id] })));
  assert.doesNotMatch(JSON.stringify([...response.headers]), new RegExp(`${actor}|${operation}|${digest}|synthetic|supabase`));
});

test("public image stays OFF for incomplete gates, invalid QA, missing owner config and public secret-name variants", async () => {
  for (const patch of [
    ...["TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED", "TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED", "TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED", "TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY"].flatMap(key => [undefined, "false", "TRUE"].map(value => ({ [key]: value }))),
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { SUPABASE_URL: "https://wrong.invalid" }, { TOUCHLINE_OWNER_EMAILS: "" },
    { NEXT_PUBLIC_TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED: "true" }]) {
    const f = fixture(patch); assert.equal(f.service.enabled, false); assert.equal((await f.serve()).status, 503); assert.deepEqual(f.calls, []);
  }
});

test("route composition and asynchronous parameter failure remain generic and no-store", async () => {
  const f = fixture();
  const response = await f.route.GET(f.request(), { params: Promise.reject(Error("PRIVATE_ROUTING_DETAIL")) });
  assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), '{"error":"unavailable"}'); assert.deepEqual(f.calls, []);
});

test("unknown, revoked, owner targets, legacy and old versions never reach Storage; transport errors stay 503", async () => {
  for (const mode of ["absent", "owner", "old", "legacy", "malformed", "rpc", "drift"] as const) {
    const f = fixture();
    if (mode === "absent") f.state.rows = [];
    if (mode === "owner") f.state.rows = [{ ...descriptor(), email: " ADMIN@example.invalid " }];
    if (mode === "old") f.state.rows = [{ ...descriptor(), consentVersion: "1793366001.000000" }];
    if (mode === "legacy") f.state.rows = [{ ...descriptor(), current: { ...descriptor().current, revision: "0", operationId: null, digest: null } }];
    if (mode === "malformed") f.state.rows = [{ ...descriptor(), customerEligible: false }];
    if (mode === "rpc") f.state.failRpc = true;
    if (mode === "drift") f.state.drift = true;
    const response = await f.serve(); assert.equal(response.status, ["absent", "owner", "old"].includes(mode) ? 404 : 503);
    assert.ok(!f.calls.includes("bucket")); assert.doesNotMatch(await response.text(), /PRIVATE|actor|digest|email|supabase/);
  }
  for (const status of [404, 503]) { const f = fixture(); f.state.storageStatus = status; assert.equal((await f.serve()).status, status); }
});

test("revocation or replacement during bytes prevents stale response; resource admission remains single-flight and abortable", async () => {
  for (const next of [[], [{ ...descriptor(), consentVersion: "1793366001" }]]) {
    const f = fixture(); f.state.afterImage = () => { f.state.rows = next; }; assert.equal((await f.serve()).status, 404);
  }
  const f = fixture(); let finish!: () => void; f.state.waitImage = new Promise(resolve => { finish = resolve; });
  const controller = new AbortController(), pending = f.serve(f.request(undefined, controller.signal));
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.ok(f.calls.includes("image")); const count = f.calls.length;
  assert.equal((await f.serve()).status, 503); assert.equal(f.calls.length, count);
  controller.abort(); assert.equal((await pending).status, 503); finish();
});

test("strict public request and DTO boundaries never accept private UUIDs, arbitrary URL, path, digest or historical selectors", async () => {
  for (const path of [urlFor() + "&actor=" + actor, urlFor() + "&v=" + "a".repeat(64), `/api/touchline/clubowners/${id}/avatar`, urlFor().replace("/avatar?", "/other?")]) {
    const f = fixture(); assert.ok([403, 404].includes((await f.serve(f.request(path))).status)); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); assert.equal((await f.serve(new Request("https://foreign.invalid" + urlFor()))).status, 403); assert.deepEqual(f.calls, []);
  for (const avatarUrl of [`/api/account/avatar?version=${operation}`, `https://example.invalid/${actor}`, urlFor() + "&token=secret"]) {
    assert.throws(() => parsePublicOwners([{ publicId: id, displayName: "Customer", avatarUrl }]));
  }
});

test("bounded metadata projection handles two customers and excludes owner; opaque version changes on consent and publication", async () => {
  const otherId = "44444444-4444-4444-8444-444444444444", otherActor = "55555555-5555-4555-8555-555555555555";
  const f = fixture(); f.state.rows.push({ ...descriptor(), publicId: otherId, current: { ...descriptor().current, actorId: otherActor } });
  const urls = await f.service.urls([id, otherId]); assert.equal(Object.keys(urls).length, 2); assert.equal(f.calls.filter(value => value === "rpc").length, 1);
  assert.doesNotMatch(JSON.stringify(urls), new RegExp(`${actor}|${otherActor}|${operation}|${digest}|email|supabase`));
  assert.notEqual(urlFor({ ...descriptor(), consentVersion: "1793366001" }), urlFor());
  assert.notEqual(urlFor({ ...descriptor(), current: { ...descriptor().current, revision: "2" } }), urlFor());
  assert.throws(() => parsePublicOwnerAvatars([descriptor(), descriptor()], [id], () => false));
});

test("photo consent uses existing authenticated flow, exact QA origin and explicit boolean; legacy cannot opt in", async () => {
  const calls: string[] = [];
  const invoke = (body: unknown, allowed = true, photoEnabled = true, requestOrigin = origin) => handlePublicOwners(new Request(requestOrigin + "/api/account/public-profile", {
    method: "PUT", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(body) }), "own", {
    enabled: true, photoEnabled, currentActor: async () => ({ allowed: true, photoAllowed: allowed }), rpc: async (name, args) => {
      calls.push(name); return { publicId: id, displayName: "Customer", published: true, photoPublished: args?.p_photo_published ?? false, followerCount: 1 };
    } });
  assert.equal((await invoke({ displayName: "Customer", published: true })).status, 200); assert.deepEqual(calls.splice(0), ["touchline_people_save_profile"]);
  assert.equal((await invoke({ displayName: "Customer", published: true, photoPublished: true })).status, 200); assert.deepEqual(calls.splice(0), ["touchline_people_save_profile_v2"]);
  assert.equal((await invoke({ displayName: "Customer", published: true, photoPublished: true }, false)).status, 403);
  assert.equal((await invoke({ displayName: "Customer", published: true, photoPublished: true }, true, false)).status, 503);
  assert.equal((await invoke({ displayName: "Customer", published: true, photoPublished: true }, true, true, "https://foreign.invalid")).status, 503);
  for (const extra of [{ photoPublished: "true" }, { photoPublished: null }, { photoPublished: true, accountId: actor }]) {
    assert.equal((await invoke({ displayName: "Customer", published: true, ...extra })).status, 400);
  }
  assert.equal((await invoke({ displayName: "Customer", published: false, photoPublished: true })).status, 400); assert.deepEqual(calls, []);
});
