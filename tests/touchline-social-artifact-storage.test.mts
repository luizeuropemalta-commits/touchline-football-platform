import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";

import sharp from "sharp";

import { createTouchlineSocialArtifactStorageCore } from "../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  checksumTouchlineSocialArtifact,
  touchlineSocialArtifactObjectKey,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
} from "../lib/touchlineArena/social-publication-contract.ts";

const SERVICE_ROLE = "shadow-service-role-only";

type StoredObject = {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg";
  etag: string;
};

function requestBytes(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function respond(response: ServerResponse, status: number, body = "") {
  response.statusCode = status;
  response.end(body);
}

test("server-only Storage adapter is create-only, content-addressed and fail-closed", async (t) => {
  const objects = new Map<string, StoredObject>();
  let authorizedRequests = 0;
  const writePrefix = `/storage/v1/object/${TOUCHLINE_SOCIAL_ARTIFACT_BUCKET}/`;
  const readPrefix = `/storage/v1/object/authenticated/${TOUCHLINE_SOCIAL_ARTIFACT_BUCKET}/`;
  const server = createServer(async (request, response) => {
    const token = request.headers.authorization;
    const apiKey = request.headers.apikey;
    if (token !== `Bearer ${SERVICE_ROLE}` || apiKey !== SERVICE_ROLE) {
      respond(response, 403, "service role required");
      return;
    }
    authorizedRequests += 1;
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const prefix = pathname.startsWith(readPrefix) ? readPrefix
      : pathname.startsWith(writePrefix) ? writePrefix : null;
    if (!prefix) {
      respond(response, 404);
      return;
    }
    const key = pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const existing = objects.get(key);
    if (request.method === "POST") {
      if (prefix !== writePrefix) return respond(response, 405);
      if (request.headers["x-upsert"] !== "false") return respond(response, 412, "upsert forbidden");
      if (existing) return respond(response, 400, "The resource already exists");
      const contentType = request.headers["content-type"];
      if (contentType !== "image/png" && contentType !== "image/jpeg") {
        return respond(response, 415);
      }
      const bytes = await requestBytes(request);
      const etag = `"shadow-${checksumTouchlineSocialArtifact(bytes).slice(7, 23)}"`;
      objects.set(key, { bytes, contentType, etag });
      response.setHeader("etag", etag);
      return respond(response, 200, JSON.stringify({ Key: key }));
    }
    if (request.method === "GET") {
      if (prefix !== readPrefix) return respond(response, 405);
      if (!existing) return respond(response, 400, JSON.stringify({
        statusCode: "404", error: "not_found", message: "Object not found",
      }));
      if (request.headers["if-match"] && request.headers["if-match"] !== existing.etag) {
        return respond(response, 412, "etag changed");
      }
      response.setHeader("etag", existing.etag);
      response.setHeader("content-type", existing.contentType);
      if (request.headers.range === "bytes=0-0") {
        response.setHeader("content-range", `bytes 0-0/${existing.bytes.byteLength}`);
        response.setHeader("content-length", "1");
        response.statusCode = 206;
        response.end(existing.bytes.subarray(0, 1));
        return;
      }
      response.setHeader("content-length", String(existing.bytes.byteLength));
      response.statusCode = 200;
      response.end(existing.bytes);
      return;
    }
    respond(response, 405);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const bytes = new Uint8Array(await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: "#071711" },
  }).png().toBuffer());
  const artifactChecksum = checksumTouchlineSocialArtifact(bytes);
  const objectKey = touchlineSocialArtifactObjectKey({
    fixtureId: "19722189",
    teamId: "9",
    contentType: "LINEUP",
    placement: "INSTAGRAM_FEED",
    locale: "en-GB",
    revision: 1,
    templateVersion: "touchline-lineup-feed-v1",
    sourceVersion: "fixture-feed-v1",
    artifactChecksum,
    artifactMimeType: "image/png",
  });
  const storage = createTouchlineSocialArtifactStorageCore({
    supabaseUrl: baseUrl,
    serviceRoleKey: SERVICE_ROLE,
  });

  const locator = await storage.uploadCreateOnly({
    objectKey,
    contentType: "image/png",
    bytes,
    artifactChecksum,
  });
  assert.equal(locator.objectKey, objectKey);
  assert.match(locator.etag ?? "", /^"shadow-[a-f0-9]{16}"$/);
  const exact = await storage.readExact(locator);
  assert.equal(checksumTouchlineSocialArtifact(exact.bytes), artifactChecksum);
  assert.equal(exact.contentType, "image/png");
  assert.deepEqual(exact.locator, locator);
  await assert.rejects(
    storage.uploadCreateOnly({ objectKey, contentType: "image/png", bytes, artifactChecksum }),
    /TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS/,
  );

  const directAnon = await fetch(`${baseUrl}${readPrefix}${objectKey}`, {
    headers: { apikey: "anon", authorization: "Bearer anon" },
  });
  assert.equal(directAnon.status, 403);
  assert.ok(authorizedRequests >= 5);

  const stored = objects.get(objectKey);
  assert.ok(stored);
  const changedBytes = Buffer.from(bytes);
  changedBytes[changedBytes.length - 20] ^= 0xff;
  objects.set(objectKey, { ...stored, bytes: changedBytes, etag: '"shadow-changed"' });
  await assert.rejects(storage.readExact(locator), /TL_SOCIAL_STORAGE_ETAG_CHANGED/);
  await assert.rejects(
    storage.readExact({ ...locator, etag: null }),
    /TL_SOCIAL_STORAGE_CONTENT_ADDRESS_MISMATCH/,
  );
  objects.delete(objectKey);
  await assert.rejects(storage.readExact(locator), /TL_SOCIAL_STORAGE_OBJECT_MISSING/);
});

test("product Storage facade is server-only and contains no caller-controlled version locator", () => {
  const facade = readFileSync(
    new URL("../lib/touchlineArena/social-artifact-storage-server.ts", import.meta.url),
    "utf8",
  );
  const core = readFileSync(
    new URL("../lib/touchlineArena/social-artifact-storage-core.ts", import.meta.url),
    "utf8",
  );
  assert.match(facade, /^import "server-only";/m);
  assert.doesNotMatch(facade + core, /objectVersion|object[_-]?version/i);
  assert.match(core, /"x-upsert": "false"/);
  assert.match(core, /"if-match"/);
  assert.match(core, /checksumTouchlineSocialArtifact\(bytes\)/);
  assert.doesNotMatch(core, /NEXT_PUBLIC|localStorage|sessionStorage/);
});
