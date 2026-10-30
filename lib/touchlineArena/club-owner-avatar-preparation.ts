"use client";

import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

// Original-file limits apply only on the device. Neither the request limit nor
// the authoritative server encoder changes. A small lossless PNG is submitted.
export const AVATAR_SOURCE_MAX_BYTES = 20_000_000;
export const AVATAR_SOURCE_MAX_PIXELS = 50_000_000;
export const AVATAR_SOURCE_MAX_EDGE = 16_384;
export const AVATAR_PREPARED_MAX_EDGE = 512;
const PREPARATION_MS = 15_000;
export type AvatarPreparationError = "heic" | "invalid" | "tooLarge" | "pixels" | "animated" | "unavailable" | "cancelled";
type Header = { type: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number; orientation: number };
type HeaderResult = { ok: true; image: Header } | { ok: false; error: AvatarPreparationError };
type SourceInspection = { ok: true; image: Header; omit: [number, number][] } | { ok: false; error: AvatarPreparationError };
type Prepared = { ok: true; bytes: Uint8Array<ArrayBuffer>; contentType: "image/png"; width: number; height: number };
export type AvatarPreparation = Prepared | { ok: false; error: AvatarPreparationError };
const invalid = () => { throw Error("invalid"); };

/** Bounded container inspection BEFORE native decoding. It is not publication
 * validation. The server still decodes and validates the submitted PNG. */
export function inspectAvatarSource(bytes: Uint8Array): HeaderResult {
  const result = inspectSource(bytes);
  return result.ok ? { ok: true, image: result.image } : result;
}

function inspectSource(bytes: Uint8Array): SourceInspection {
  if (!bytes.length) return { ok: false, error: "invalid" };
  if (bytes.length > AVATAR_SOURCE_MAX_BYTES) return { ok: false, error: "tooLarge" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, value: string) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const u16 = (offset: number, little = false) => view.getUint16(offset, little);
  const u32 = (offset: number, little = false) => view.getUint32(offset, little);
  const u24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
  let width = 0, height = 0, orientation = 1, hasExif = false;
  const omit: [number, number][] = [];
  const exif = (start: number, end: number) => {
    if (hasExif) invalid(); hasExif = true;
    if (ascii(start, "Exif\0\0")) start += 6;
    const little = ascii(start, "II");
    if ((!little && !ascii(start, "MM")) || start + 8 > end || u16(start + 2, little) !== 42) invalid();
    const offset = u32(start + 4, little), ifd = start + offset;
    if (offset < 8 || ifd + 2 > end) invalid();
    const count = u16(ifd, little);
    if (count > 512 || ifd + 2 + count * 12 + 4 > end) invalid();
    let found = false;
    for (let i = 0; i < count; i++) {
      const tag = ifd + 2 + i * 12;
      if (u16(tag, little) !== 0x112) continue;
      if (found || u16(tag + 2, little) !== 3 || u32(tag + 4, little) !== 1) invalid();
      found = true; orientation = u16(tag + 8, little);
      if (orientation < 1 || orientation > 8) invalid();
    }
  };
  const dimensions = (w: number, h: number) => {
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) invalid();
    if (w > AVATAR_SOURCE_MAX_EDGE || h > AVATAR_SOURCE_MAX_EDGE || w * h > AVATAR_SOURCE_MAX_PIXELS) throw Error("pixels");
    if (width && (width !== w || height !== h)) invalid();
    width = w; height = h;
  };
  try {
    let type: Header["type"];
    if (ascii(4, "ftyp")) {
      const end = Math.min(bytes.length, u32(0));
      for (let offset = 8; offset + 4 <= end; offset += 4) {
        if (offset !== 12 && ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].some(brand => ascii(offset, brand))) throw Error("heic");
      }
      invalid();
    }
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      type = "image/jpeg";
      let offset = 2, frame = false, scan = false;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) invalid();
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda) { scan = true; break; }
        if (marker === 0xd8 || marker === 0xd9 || marker === 0 || marker === undefined || marker >= 0xd0 && marker <= 0xd7) invalid();
        const length = u16(offset), end = offset + length;
        if (length < 2 || end > bytes.length) invalid();
        if (marker === 0xe1) {
          if (ascii(offset + 2, "Exif\0\0")) exif(offset + 2, end);
          omit.push([offset - 2, end]);
        }
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          if (![0xc0, 0xc1, 0xc2].includes(marker) || frame || length < 11 || bytes[offset + 2] !== 8 || length !== 8 + 3 * bytes[offset + 7]) invalid();
          dimensions(u16(offset + 5), u16(offset + 3)); frame = true;
        }
        offset = end;
      }
      // Decode must not be invoked on a bare/truncated header or absent scan.
      if (!frame || !scan || offset + 6 > bytes.length || u16(offset) < 6 || offset + u16(offset) >= bytes.length || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) invalid();
    } else if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
      type = "image/png";
      let offset = 8, header = false, data = false, ended = false;
      while (offset + 12 <= bytes.length) {
        const length = u32(offset), start = offset + 8, end = start + length;
        if (end + 4 > bytes.length || !header && !ascii(offset + 4, "IHDR")) invalid();
        if (ascii(offset + 4, "IHDR")) {
          if (header || length !== 13) invalid();
          dimensions(u32(start), u32(start + 4)); header = true;
        } else if (ascii(offset + 4, "acTL") || ascii(offset + 4, "fcTL") || ascii(offset + 4, "fdAT")) throw Error("animated");
        else if (ascii(offset + 4, "eXIf")) { exif(start, end); omit.push([offset, end + 4]); }
        else if (ascii(offset + 4, "IDAT")) data = true;
        else if (ascii(offset + 4, "IEND")) { if (length !== 0) invalid(); ended = true; offset = end + 4; break; }
        offset = end + 4;
      }
      if (!header || !data || !ended || offset !== bytes.length) invalid();
    } else if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
      type = "image/webp";
      if (u32(4, true) + 8 !== bytes.length) invalid();
      let offset = 12, data = false, extended = false;
      while (offset + 8 <= bytes.length) {
        const length = u32(offset + 4, true), start = offset + 8, end = start + length;
        if (end > bytes.length) invalid();
        if (ascii(offset, "ANIM") || ascii(offset, "ANMF")) throw Error("animated");
        if (ascii(offset, "VP8X")) {
          if (offset !== 12 || extended || data || length !== 10) invalid();
          if (bytes[start] & 2) throw Error("animated");
          dimensions(1 + u24(start + 4), 1 + u24(start + 7)); extended = true;
        } else if (ascii(offset, "VP8 ")) {
          if (data || length < 10 || (bytes[start] & 1) || !ascii(start + 3, "\x9d\x01\x2a")) invalid();
          dimensions(u16(start + 6, true) & 0x3fff, u16(start + 8, true) & 0x3fff); data = true;
        } else if (ascii(offset, "VP8L")) {
          if (data || length < 5 || bytes[start] !== 0x2f) invalid();
          const bits = u32(start + 1, true);
          if (bits >>> 29) invalid();
          dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)); data = true;
        } else if (ascii(offset, "EXIF")) { exif(start, end); omit.push([offset, end + (length % 2)]); }
        offset = end + (length % 2);
      }
      if (!data || offset !== bytes.length) invalid();
    } else return { ok: false, error: "invalid" };
    return { ok: true, image: { type, width, height, orientation }, omit };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid";
    return { ok: false, error: message === "heic" || message === "pixels" || message === "animated" ? message : "invalid" };
  }
}

// Decode un-oriented pixels, then apply the inspected orientation ourselves.
// Native from-image support differs for JPEG, PNG and WebP across engines.
function withoutExif(source: Uint8Array<ArrayBuffer>, inspection: Extract<SourceInspection, { ok: true }>) {
  if (!inspection.omit.length) return source;
  const bytes = new Uint8Array(source.length - inspection.omit.reduce((sum, [start, end]) => sum + end - start, 0));
  let read = 0, write = 0;
  for (const [start, end] of inspection.omit) { bytes.set(source.subarray(read, start), write); write += start - read; read = end; }
  bytes.set(source.subarray(read), write);
  if (inspection.image.type === "image/webp") {
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    // VP8X is the first chunk in a valid extended container.
    if (bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56 && bytes[15] === 88) bytes[20] &= ~8;
  }
  return bytes;
}

let activePreparation: Promise<unknown> | null = null;
/** One native decode at a time, including a cancelled decode until it settles.
 * Never persist originals; only the prepared bytes enter the upload controller.
 * createImageBitmap may allocate decoder memory internally, hence source caps. */
export async function prepareClubOwnerAvatar(file: File, signal: AbortSignal): Promise<AvatarPreparation> {
  const controller = new AbortController(), cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, PREPARATION_MS);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<AvatarPreparation>(resolve => {
    abortListener = () => resolve({ ok: false, error: signal.aborted ? "cancelled" : "unavailable" });
    controller.signal.addEventListener("abort", abortListener, { once: true });
    if (controller.signal.aborted) abortListener();
  });
  try {
    while (activePreparation) {
      const result = await Promise.race([activePreparation.then(() => null), aborted]);
      if (result) return result;
    }
    if (controller.signal.aborted) return await aborted;
    const task = prepareImage(file, controller.signal);
    activePreparation = task;
    void task.finally(() => { if (activePreparation === task) activePreparation = null; });
    return await Promise.race([task, aborted]);
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
    if (abortListener) controller.signal.removeEventListener("abort", abortListener);
  }
}

async function prepareImage(file: File, signal: AbortSignal): Promise<AvatarPreparation> {
  let bitmap: ImageBitmap | undefined, canvas: HTMLCanvasElement | undefined;
  const guard = () => signal.throwIfAborted();
  try {
    guard();
    if (/^image\/hei[cf]$/i.test(file.type)) return { ok: false, error: "heic" };
    if (!file.size) return { ok: false, error: "invalid" };
    if (file.size > AVATAR_SOURCE_MAX_BYTES) return { ok: false, error: "tooLarge" };
    const source = new Uint8Array(await file.arrayBuffer()); guard();
    const inspection = inspectSource(source); if (!inspection.ok) return inspection;
    if (typeof createImageBitmap !== "function") return { ok: false, error: "unavailable" };
    const image = inspection.image, swap = image.orientation >= 5;
    const scale = Math.min(1, AVATAR_PREPARED_MAX_EDGE / Math.max(image.width, image.height));
    const rawWidth = Math.max(1, Math.round(image.width * scale)), rawHeight = Math.max(1, Math.round(image.height * scale));
    const width = swap ? rawHeight : rawWidth, height = swap ? rawWidth : rawHeight;
    bitmap = await createImageBitmap(new Blob([withoutExif(source, inspection)], { type: image.type }), { imageOrientation: "from-image", resizeWidth: rawWidth, resizeHeight: rawHeight, resizeQuality: "high" }); guard();
    if (bitmap.width !== rawWidth || bitmap.height !== rawHeight) return { ok: false, error: "unavailable" };
    canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) return { ok: false, error: "unavailable" };
    const transforms: Record<number, [number, number, number, number, number, number]> = {
      1: [1, 0, 0, 1, 0, 0], 2: [-1, 0, 0, 1, rawWidth, 0], 3: [-1, 0, 0, -1, rawWidth, rawHeight], 4: [1, 0, 0, -1, 0, rawHeight],
      5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, rawHeight, 0], 7: [0, -1, -1, 0, rawHeight, rawWidth], 8: [0, -1, 1, 0, 0, rawWidth],
    };
    context.setTransform(...transforms[image.orientation]);
    context.drawImage(bitmap, 0, 0); bitmap.close(); bitmap = undefined;
    const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, "image/png")); guard();
    if (!blob || blob.type !== "image/png" || !blob.size || blob.size > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) return { ok: false, error: "unavailable" };
    const bytes = new Uint8Array(await blob.arrayBuffer()); guard();
    return { ok: true, bytes, contentType: "image/png", width, height };
  } catch { return { ok: false, error: signal.aborted ? "cancelled" : "invalid" }; }
  finally { bitmap?.close(); if (canvas) { canvas.width = 1; canvas.height = 1; } }
}
