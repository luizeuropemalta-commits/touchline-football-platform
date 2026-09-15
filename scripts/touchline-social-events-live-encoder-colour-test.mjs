import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

// One tiny deterministic technical fixture, never football data or an artwork.
// Example: node scripts/touchline-social-events-live-encoder-colour-test.mjs --label=before
const label = process.argv.find(value => value.startsWith("--label="))?.slice(8);
if (!label || !/^[a-z0-9-]{1,40}$/.test(label)) throw new Error("SAFE_UNIQUE_LABEL_REQUIRED");
const root = process.cwd();
const fixture = resolve(root, "artifacts/social-studio/events/encoder-rgb-fixture-20260915");
const frames = join(fixture, "frames");
const output = join(fixture, label);
const width = 96, height = 64, fps = 12, frameCount = 72;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const run = promisify(execFile);
await mkdir(frames, { recursive: true });
await mkdir(output, { recursive: false });
const pixelsAt = index => {
  const bytes = Buffer.alloc(width * height * 3);
  for (let y = 0; y < 48; y++) for (let x = 0; x < width; x++) bytes[(y * width + x) * 3 + Math.floor(x / 32)] = 255;
  const phase = (index % frameCount) / frameCount * 2 * Math.PI;
  const markerX = Math.round(46 + 24 * Math.cos(phase)), markerY = Math.round(55 + 4 * Math.sin(phase));
  for (let y = markerY; y < markerY + 2; y++) for (let x = markerX; x < markerX + 2; x++) bytes.fill(255, (y * width + x) * 3, (y * width + x) * 3 + 3);
  return bytes;
};
assert.deepEqual(pixelsAt(0), pixelsAt(frameCount), "fixture itself must be periodic");
const frameHashes = [];
for (let index = 0; index < frameCount; index++) {
  const png = await sharp(pixelsAt(index), { raw: { width, height, channels: 3 } }).png().toBuffer();
  const path = join(frames, `${String(index).padStart(4, "0")}.png`);
  try { await writeFile(path, png, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; assert.equal(hash(await readFile(path)), hash(png), "existing fixture bytes changed"); }
  frameHashes.push(hash(png));
}
assert.equal((await readdir(frames)).length, frameCount, "no extra endpoint or unrelated frames");
const encoder = resolve(root, "scripts/local/encode-png-sequence-to-mp4.swift");
const decoder = resolve(root, "scripts/local/probe-social-studio-video.swift");
const video = join(output, "rgb-loop.mp4");
await run("/usr/bin/swift", [encoder, frames, video, String(width), String(height), String(fps)], { timeout: 45000, maxBuffer: 1000000 });
const decode = join(output, "decode");
await run("/usr/bin/swift", [decoder, video, decode], { timeout: 45000, maxBuffer: 1000000 });
const probe = JSON.parse(await readFile(join(decode, "probe.json"), "utf8"));
const sentinels = [
  { name: "red", x: 16, y: 12, rgb: [255, 0, 0] },
  { name: "green", x: 48, y: 12, rgb: [0, 255, 0] },
  { name: "blue", x: 80, y: 12, rgb: [0, 0, 255] },
];
const samples = [];
for (const name of ["decoded-first.png", "decoded-middle.png", "decoded-last.png"]) {
  const { data, info } = await sharp(join(decode, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width); assert.equal(info.height, height); assert.equal(info.channels, 3);
  for (const sentinel of sentinels) {
    const sums = [0, 0, 0];
    for (let y = sentinel.y - 2; y <= sentinel.y + 2; y++) for (let x = sentinel.x - 2; x <= sentinel.x + 2; x++) {
      const offset = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) sums[channel] += data[offset + channel];
    }
    const rgb = sums.map(sum => sum / 25);
    const maximumChannelError = Math.max(...rgb.map((value, channel) => Math.abs(value - sentinel.rgb[channel])));
    samples.push({ frame: name, sentinel: sentinel.name, expectedRGB: sentinel.rgb, decodedRGB: rgb, maximumChannelError, passed: maximumChannelError <= 20 });
  }
}
const checks = {
  rgbSentinels: samples.every(sample => sample.passed),
  codec: probe.codec === "h264", dimensions: probe.width === width && probe.height === height,
  duration: Math.abs(probe.durationSeconds - 6) <= 0.02,
  frameCount: probe.decodedFrames === frameCount && probe.decoderCompleted === true,
  timestamps: Math.abs(probe.firstPresentationSeconds) <= 0.001 && Math.abs(probe.lastPresentationSeconds - 71 / fps) <= 0.02,
  motion: probe.distinctFrames > 1, fixturePeriodicity: hash(pixelsAt(0)) === hash(pixelsAt(frameCount)),
};
const report = { label, passed: Object.values(checks).every(Boolean), checks, samples, probe,
  fixture: { width, height, fps, frameCount, sourceFramesChecksum: hash(JSON.stringify(frameHashes)), kind: "TECHNICAL_RGB_SENTINELS_NOT_AN_ARTWORK" },
  encoderChecksum: hash(await readFile(encoder)), decoderChecksum: hash(await readFile(decoder)),
  artifactChecksum: hash(await readFile(video)), generatedAt: new Date().toISOString(), publishable: false };
await writeFile(join(output, "colour-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ ...report, output }));
if (!report.passed) process.exitCode = 1;
