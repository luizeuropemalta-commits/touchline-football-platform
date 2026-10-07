import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as admission from "../lib/touchlineArena/club-owner-avatar-resource-admission.ts";
import * as contract from "../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

const load = () => import("../lib/touchlineArena/club-owner-avatar-validation.ts");
const image = (width = 40, height = 20) => sharp({ create: { width, height, channels: 3, background: "#d23040" } });

function controlledValidator() {
  const pool = admission.createClubOwnerAvatarResourceAdmission();
  let clock = 0;
  let metadataDone!: (value: object) => void, pipelineDone!: (value: object) => void;
  let metadataCalls = 0, pipelineCalls = 0;
  const decoder = { metadata: () => { metadataCalls++; return new Promise(resolve => { metadataDone = resolve; }); },
    autoOrient: () => decoder, resize: () => decoder, webp: () => decoder, timeout: () => decoder,
    toBuffer: () => { pipelineCalls++; return new Promise(resolve => { pipelineDone = resolve; }); } };
  const exports: { validateClubOwnerAvatar?: typeof import("../lib/touchlineArena/club-owner-avatar-validation.ts").validateClubOwnerAvatar } = {};
  const source = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-validation.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Buffer, Uint8Array, performance: { now: () => clock }, require: (name: string) => {
      if (name === "sharp") return { default: () => decoder };
      if (name === "./club-owner-avatar-upload-contract.ts") return contract;
      assert.equal(name, "./club-owner-avatar-resource-admission.ts"); return { ...admission, getClubOwnerAvatarResourceAdmission: () => pool };
    } });
  return { pool, validate: exports.validateClubOwnerAvatar!, calls: () => [metadataCalls, pipelineCalls],
    expire: () => { clock = 101; },
    finishMetadata: () => metadataDone({ format: "png", width: 2, height: 2 }),
    finishPipeline: () => pipelineDone({ data: Buffer.from("normalized"), info: { format: "webp", width: 2, height: 2 } }) };
}

test("configuration guard rejects metadata/pipeline drift and preserves capacity until original native settlement", async () => {
  for (const stage of ["metadata", "pipeline"] as const) {
    const h = controlledValidator(), scope = h.pool.tryAcquire()!; let valid = true, failures = 0;
    const pending = h.validate(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { resourceScope: scope,
      assertEnvironment: () => { if (!valid) { valid = true; failures++; throw Error("PRIVATE_CONFIGURATION"); } } });
    if (stage === "pipeline") { h.finishMetadata(); for (let i = 0; i < 12; i++) await Promise.resolve(); }
    valid = false; assert.equal(h.pool.tryAcquire(), null);
    if (stage === "metadata") h.finishMetadata(); else h.finishPipeline();
    let result: unknown; void pending.then(value => { result = value; });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    try { assert.deepEqual(JSON.parse(JSON.stringify(result ?? null)), { ok: false, error: "resource_unavailable" }); assert.deepEqual(h.calls(), stage === "metadata" ? [1, 0] : [1, 1]); assert.equal(failures, 1); }
    finally { if (h.calls()[1]) h.finishPipeline(); await pending; h.pool.close(scope); }
    const next = h.pool.tryAcquire(); assert.ok(next); h.pool.close(next);
  }
});

test("configuration guard native failure remains latched after the caller restores configuration", async () => {
  const h = controlledValidator(); let valid = true, failures = 0;
  const pending = h.validate(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
    assertEnvironment: () => { if (!valid) { valid = true; failures++; throw Error("PRIVATE_CONFIGURATION"); } },
  });
  valid = false; h.finishMetadata();
  // Finite observation: a broken guard would start a pending pipeline.
  let result: unknown; void pending.then(value => { result = value; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  try { assert.deepEqual(JSON.parse(JSON.stringify(result ?? null)), { ok: false, error: "resource_unavailable" }); assert.deepEqual(h.calls(), [1, 0]); assert.equal(failures, 1); }
  finally { if (h.calls()[1]) h.finishPipeline(); await pending; }
});

test("configuration invalid validator hook cannot start a native job", async () => {
  for (const assertion of [null, "true", async () => { throw Error("PRIVATE_ASYNC"); }]) {
    const h = controlledValidator();
    const pending = h.validate(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { assertEnvironment: assertion as never });
    let result: unknown; void pending.then(value => { result = value; });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    try { assert.deepEqual(JSON.parse(JSON.stringify(result ?? null)), { ok: false, error: "resource_unavailable" }); assert.deepEqual(h.calls(), [0, 0]); }
    finally { if (h.calls()[0]) h.finishMetadata(); if (h.calls()[1]) h.finishPipeline(); await pending; }
    const scope = h.pool.tryAcquire(); assert.ok(scope); h.pool.close(scope);
  }
});

test("resource native metadata cannot start processing after monotonic deadline even before abort timer fires", async () => {
  const h = controlledValidator(), scope = h.pool.tryAcquire()!;
  const pending = h.validate(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { resourceScope: scope, expiresAt: 100 });
  h.expire(); h.finishMetadata();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  assert.deepEqual(h.calls(), [1, 0]); assert.deepEqual(JSON.parse(JSON.stringify(await pending)), { ok: false, error: "resource_unavailable" }); h.pool.close(scope);
});

test("resource scope retains original metadata after cancellation, then prevents a late pipeline", async () => {
  const h = controlledValidator(), scope = h.pool.tryAcquire()!, controller = new AbortController();
  const pending = h.validate(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { resourceScope: scope, signal: controller.signal });
  assert.deepEqual(h.calls(), [1, 0]); controller.abort(); h.pool.close(scope);
  assert.equal(h.pool.tryAcquire(), null); h.finishMetadata(); assert.equal((await pending).ok, false); assert.deepEqual(h.calls(), [1, 0]);
  const next = h.pool.tryAcquire(); assert.ok(next); h.pool.close(next);
});

test("resource scope retains an original pipeline until settlement and busy/foreign scopes cannot decode", async () => {
  const h = controlledValidator(), scope = h.pool.tryAcquire()!, controller = new AbortController();
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const pending = h.validate(bytes, { resourceScope: scope, signal: controller.signal }); h.finishMetadata();
  for (let index = 0; index < 5; index++) await Promise.resolve(); assert.deepEqual(h.calls(), [1, 1]);
  let busy: boolean | undefined, foreign: boolean | undefined;
  void h.validate(bytes).then(result => { busy = result.ok; });
  void h.validate(bytes, { resourceScope: {} as typeof scope }).then(result => { foreign = result.ok; });
  for (let index = 0; index < 12; index++) await Promise.resolve();
  assert.equal(busy, false); assert.equal(foreign, false);
  controller.abort(); h.pool.close(scope); assert.equal(h.pool.tryAcquire(), null); h.finishPipeline();
  assert.equal((await pending).ok, false); const next = h.pool.tryAcquire(); assert.ok(next); h.pool.close(next);
  assert.deepEqual(h.calls(), [1, 1]);
});

function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length); body.copy(chunk, 4); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}
function apng() {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const actl = Buffer.alloc(8); actl.writeUInt32BE(2);
  function frame(sequence: number) {
    const data = Buffer.alloc(26); data.writeUInt32BE(sequence); data.writeUInt32BE(1, 4); data.writeUInt32BE(1, 8);
    data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22); return pngChunk("fcTL", data);
  }
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("acTL", actl), frame(0),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))), frame(1),
    pngChunk("fdAT", Buffer.concat([sequence, deflateSync(Buffer.from([0, 0, 0, 255]))])), pngChunk("IEND", Buffer.alloc(0))]);
}

test("real static JPEG, PNG and WebP bytes normalize to decodable WebP without mutating input", async () => {
  const { validateClubOwnerAvatar } = await load();
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await image().toFormat(format).toBuffer(); const before = Buffer.from(bytes);
    const result = await validateClubOwnerAvatar(bytes); assert.ok(result.ok);
    assert.equal(result.contentType, "image/webp"); assert.equal(result.width, 40); assert.equal(result.height, 20);
    assert.ok(Buffer.isBuffer(result.bytes)); assert.ok(result.bytes.length > 0); assert.deepEqual(bytes, before);
    const metadata = await sharp(result.bytes).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.pages ?? 1, 1);
    const decoded = await sharp(result.bytes).raw().toBuffer(); assert.equal(decoded.length, 40 * 20 * 3);
  }
});

test("512 bound fits both orientations, preserves ratio, never enlarges and retains alpha", async () => {
  const { validateClubOwnerAvatar } = await load();
  for (const [width, height, expectedWidth, expectedHeight] of [[1024, 256, 512, 128], [256, 1024, 128, 512], [900, 900, 512, 512], [20, 10, 20, 10]]) {
    const result = await validateClubOwnerAvatar(await image(width, height).png().toBuffer());
    assert.ok(result.ok); assert.deepEqual([result.width, result.height], [expectedWidth, expectedHeight]);
  }
  const transparent = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const result = await validateClubOwnerAvatar(transparent); assert.ok(result.ok);
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
});

test("EXIF orientation is applied once and all identifying metadata is stripped", async () => {
  const { validateClubOwnerAvatar } = await load();
  const bytes = await image(60, 30).withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Artist: "PRIVATE_FIXTURE_ARTIST" } }).jpeg().toBuffer();
  assert.equal((await sharp(bytes).metadata()).orientation, 6);
  const result = await validateClubOwnerAvatar(bytes); assert.ok(result.ok);
  assert.deepEqual([result.width, result.height], [30, 60]);
  const metadata = await sharp(result.bytes).metadata();
  for (const key of ["orientation", "exif", "xmp", "iptc", "icc"] as const) assert.equal(metadata[key], undefined, key);
  assert.equal(result.bytes.includes(Buffer.from("PRIVATE_FIXTURE_ARTIST")), false);
  const again = await validateClubOwnerAvatar(result.bytes); assert.ok(again.ok);
  assert.deepEqual([again.width, again.height], [30, 60]);
});

test("byte and decoded-pixel limits are inclusive and enforced independently", async () => {
  const mod = await load();
  assert.equal(mod.CLUB_OWNER_AVATAR_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(mod.CLUB_OWNER_AVATAR_MAX_PIXELS, 16_000_000);
  const png = await image().png().toBuffer();
  // Trailing bytes cannot survive re-encoding; this also proves inclusive byte admission.
  const atLimit = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)]);
  assert.equal((await mod.validateClubOwnerAvatar(atLimit)).ok, true);
  assert.deepEqual(await mod.validateClubOwnerAvatar(Buffer.alloc(5 * 1024 * 1024 + 1)), { ok: false, error: "too_large" });
  assert.equal((await mod.validateClubOwnerAvatar(await image(4000, 4000).png().toBuffer())).ok, true);
  assert.deepEqual(await mod.validateClubOwnerAvatar(await image(4001, 4000).png().toBuffer()), { ok: false, error: "pixel_limit" });
});

test("animated WebP and APNG are rejected rather than silently reduced to frame one", async () => {
  const { validateClubOwnerAvatar } = await load();
  const pixels = Buffer.alloc(8 * 16 * 3);
  for (let pixel = 0; pixel < 8 * 16; pixel++) pixels[pixel * 3 + (pixel < 64 ? 0 : 2)] = 255;
  const animated = await sharp(pixels, { raw: { width: 8, height: 16, pageHeight: 8, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  assert.deepEqual(await validateClubOwnerAvatar(animated), { ok: false, error: "animated" });
  const png = apng(); assert.equal((await sharp(png).metadata()).format, "png");
  assert.deepEqual(await validateClubOwnerAvatar(png), { ok: false, error: "animated" });
});

test("SVG, other formats, HEIC containers and non-byte URL/path inputs cannot reach acceptance", async () => {
  const { validateClubOwnerAvatar } = await load();
  for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/private"/></svg>'), Buffer.from("not an image"), await image().gif().toBuffer(), await image().tiff().toBuffer()]) {
    assert.deepEqual(await validateClubOwnerAvatar(bytes), { ok: false, error: "unsupported_format" });
  }
  const heicHeader = Buffer.from("000000186674797068656963000000006d69663168656963", "hex");
  assert.deepEqual(await validateClubOwnerAvatar(heicHeader), { ok: false, error: "heic_unsupported" });
  for (const input of ["https://example.invalid/photo.png", "/private/photo.jpg", null, new ArrayBuffer(8)] as unknown[]) {
    assert.deepEqual(await validateClubOwnerAvatar(input as Uint8Array), { ok: false, error: "invalid_image" });
  }
});

test("empty, truncated and corrupt accepted-format payloads return only structured errors", async () => {
  const { validateClubOwnerAvatar } = await load();
  assert.deepEqual(await validateClubOwnerAvatar(new Uint8Array()), { ok: false, error: "empty" });
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await image(100, 100).toFormat(format).toBuffer();
    const result = await validateClubOwnerAvatar(bytes.subarray(0, Math.floor(bytes.length / 2)));
    assert.deepEqual(result, { ok: false, error: "invalid_image" });
  }
  const bytes = await image().png().toBuffer();
  const backing = Buffer.concat([Buffer.from("prefix"), bytes, Buffer.from("suffix")]);
  assert.equal((await validateClubOwnerAvatar(new Uint8Array(backing.buffer, backing.byteOffset + 6, bytes.length))).ok, true);
});

test("mirrored EXIF orientation changes pixels and caller mutation after invocation cannot replace the input", async () => {
  const { validateClubOwnerAvatar } = await load();
  const pixels = Buffer.alloc(40 * 20 * 3);
  for (let pixel = 0; pixel < 40 * 20; pixel++) pixels[pixel * 3 + (pixel % 40 < 20 ? 0 : 2)] = 255;
  const bytes = await sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } }).withMetadata({ orientation: 2 }).png().toBuffer();
  const pending = validateClubOwnerAvatar(bytes); bytes.fill(0);
  const result = await pending; assert.ok(result.ok);
  const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [40, 20]);
  const left = (10 * info.width + 5) * info.channels, right = (10 * info.width + 35) * info.channels;
  assert.ok(data[left + 2] > data[left] + 100, "blue must move to the left");
  assert.ok(data[right] > data[right + 2] + 100, "red must move to the right");
});
