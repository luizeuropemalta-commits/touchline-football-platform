import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { inspectAvatarSource, prepareClubOwnerAvatar, AVATAR_SOURCE_MAX_BYTES } from "../lib/touchlineArena/club-owner-avatar-preparation.ts";

const photo = () => sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } });
test("bounded source headers admit real static JPEG/PNG/WebP and all EXIF orientations", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) for (let orientation = 1; orientation <= 8; orientation++) {
    const result = inspectAvatarSource(await photo().withMetadata({ orientation }).toFormat(format).toBuffer());
    assert.equal(result.ok, true, `${format}/${orientation}`);
    if (result.ok) assert.deepEqual(result.image, { type: `image/${format}`, width: 40, height: 20, orientation });
  }
});

test("predecode admission rejects unknown HEIC animation bombs and truncated structures", async () => {
  assert.deepEqual(inspectAvatarSource(Buffer.from("000000186674797068656963000000006d69663168656963", "hex")), { ok: false, error: "heic" });
  assert.deepEqual(inspectAvatarSource(new Uint8Array(AVATAR_SOURCE_MAX_BYTES + 1)), { ok: false, error: "tooLarge" });
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await photo().toFormat(format).toBuffer();
    assert.deepEqual(inspectAvatarSource(bytes.subarray(0, 20)), { ok: false, error: "invalid" });
  }
  const png = await photo().png().toBuffer();
  for (const [width, height] of [[100_000, 1], [8000, 8000], [0, 20]]) {
    const bomb = Buffer.from(png); bomb.writeUInt32BE(width, 16); bomb.writeUInt32BE(height, 20);
    assert.deepEqual(inspectAvatarSource(bomb), { ok: false, error: width === 0 ? "invalid" : "pixels" });
  }
  const accepted = Buffer.from(png); accepted.writeUInt32BE(8000, 16); accepted.writeUInt32BE(6000, 20);
  assert.equal(inspectAvatarSource(accepted).ok, true, "48MP header admitted, not a decode/physical-device proof");
  const animation = Buffer.concat([png.subarray(0, 33), Buffer.from("000000086163544c000000020000000000000000", "hex"), png.subarray(33)]);
  assert.deepEqual(inspectAvatarSource(animation), { ok: false, error: "animated" });
  const frames = Buffer.alloc(8 * 16 * 3); frames.fill(255, 8 * 8 * 3);
  const animated = await sharp(frames, { raw: { width: 8, height: 16, pageHeight: 8, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.deepEqual(inspectAvatarSource(animated), { ok: false, error: "animated" });
  const jpeg = await photo().jpeg().toBuffer();
  const sof = jpeg.indexOf(Buffer.from([255, 192])); assert.ok(sof > 0);
  const jpegBomb = Buffer.from(jpeg); jpegBomb.writeUInt16BE(60_000, sof + 5);
  assert.deepEqual(inspectAvatarSource(jpegBomb), { ok: false, error: "pixels" });
  const broken = Buffer.from(jpeg); broken.writeUInt16BE(65_535, sof + 2);
  assert.deepEqual(inspectAvatarSource(broken), { ok: false, error: "invalid" });
});

test("invalid originals never invoke browser decoding; existing abort never reads a file", async () => {
  let decoded = 0, read = 0;
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (() => { decoded++; throw Error("unexpected decode"); }) as typeof createImageBitmap;
  try {
    for (const bytes of [new Uint8Array([1, 2]), new Uint8Array(AVATAR_SOURCE_MAX_BYTES + 1)]) {
      const result = await prepareClubOwnerAvatar(new File([bytes], "photo.png", { type: "image/png" }), new AbortController().signal);
      assert.equal(result.ok, false);
    }
    const controller = new AbortController(); controller.abort();
    assert.deepEqual(await prepareClubOwnerAvatar({ get size() { read++; return 0; } } as File, controller.signal), { ok: false, error: "cancelled" });
    assert.equal(decoded, 0); assert.equal(read, 0);
  } finally { globalThis.createImageBitmap = original; }
});

test("cancelled native work keeps the single decode slot until settlement and closes its bitmap", async () => {
  const original = globalThis.createImageBitmap; let decoded = 0, closed = 0;
  const releases: ((bitmap: ImageBitmap) => void)[] = [];
  globalThis.createImageBitmap = (() => { decoded++; return new Promise<ImageBitmap>(resolve => releases.push(resolve)); }) as typeof createImageBitmap;
  const bytes = new Uint8Array(await photo().png().toBuffer());
  const file = new File([bytes], "photo.png", { type: "image/png" });
  const firstAbort = new AbortController(), secondAbort = new AbortController();
  try {
    const first = prepareClubOwnerAvatar(file, firstAbort.signal);
    for (let i = 0; i < 20 && !decoded; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(decoded, 1); firstAbort.abort(); assert.equal((await first).ok, false);
    const second = prepareClubOwnerAvatar(file, secondAbort.signal);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(decoded, 1);
    secondAbort.abort(); assert.equal((await second).ok, false);
    releases[0]({ close: () => { closed++; }, width: 40, height: 20 } as ImageBitmap);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, 1); assert.equal(decoded, 1);
  } finally { globalThis.createImageBitmap = original; }
});
