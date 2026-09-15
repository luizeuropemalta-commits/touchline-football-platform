export type EventsLiveDecodeReport = {
  artifactSha256: string; decoder: string; codec: string; width: number; height: number;
  durationSeconds: number; decodedFrames: number; distinctFrames: number; decoderCompleted: boolean;
  firstPresentationSeconds: number; lastPresentationSeconds: number;
};

export function compareEventsLivePixels(a: Uint8Array, b: Uint8Array, width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || a.length !== width * height * 3 || b.length !== a.length) throw new Error("RGB_DIMENSIONS_REQUIRED");
  let changedPixels = 0, absoluteError = 0, squaredError = 0, maximumChannelError = 0;
  let left = width, top = height, right = -1, bottom = -1;
  const signedError = [0, 0, 0];
  for (let offset = 0; offset < a.length; offset += 3) {
    let changed = false;
    for (let channel = 0; channel < 3; channel++) {
      const signed = b[offset + channel]! - a[offset + channel]!;
      const error = Math.abs(signed);
      signedError[channel] = signedError[channel]! + signed;
      absoluteError += error; squaredError += error * error;
      maximumChannelError = Math.max(maximumChannelError, error);
      changed ||= error > 0;
    }
    if (changed) {
      changedPixels++;
      const pixel = offset / 3, x = pixel % width, y = Math.floor(pixel / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  const pixelCount = width * height, meanSquaredError = squaredError / a.length;
  return { width, height, pixelCount, changedPixels, changedFraction: changedPixels / pixelCount,
    meanAbsoluteError: absoluteError / a.length, maximumChannelError,
    rootMeanSquaredError: Math.sqrt(meanSquaredError),
    psnrDb: meanSquaredError === 0 ? null : 10 * Math.log10(255 ** 2 / meanSquaredError),
    meanChannelDelta: signedError.map(error => error / pixelCount),
    bounds: changedPixels ? { left, top, right, bottom } : null };
}

export type EventsLivePixelComparison = ReturnType<typeof compareEventsLivePixels>;
export type EventsLiveSeamPixels = Record<"firstSeam" | "secondSeam" | "repeatedMid" | "motion", EventsLivePixelComparison>;

// Source PNGs are lossless: these are NOT H.264 allowances. Chromium can rasterize
// a static rounded clip differently even at the same paused time. All limits must
// pass; a broad low-contrast drift or one high-contrast pixel still fails closed.
export const EVENTS_LIVE_SOURCE_RASTER_LIMITS = {
  maximumChangedPixels: 64, maximumChangedFraction: 0.00005,
  maximumMeanAbsoluteError: 0.00005, maximumChannelError: 10,
} as const;

function safeSourceRaster(delta: EventsLivePixelComparison | undefined) {
  return delta !== undefined && delta.changedPixels <= EVENTS_LIVE_SOURCE_RASTER_LIMITS.maximumChangedPixels
    && delta.changedFraction <= EVENTS_LIVE_SOURCE_RASTER_LIMITS.maximumChangedFraction
    && delta.meanAbsoluteError <= EVENTS_LIVE_SOURCE_RASTER_LIMITS.maximumMeanAbsoluteError
    && delta.maximumChannelError <= EVENTS_LIVE_SOURCE_RASTER_LIMITS.maximumChannelError;
}

export function assessEventsLiveSeam(joins: Record<string, string>, geometry: Record<string, unknown>, pixels?: EventsLiveSeamPixels) {
  const phases = ["start", "mid", "end", "second-mid", "second-loop"];
  const captured = phases.every(phase => typeof joins[phase] === "string" && joins[phase].length > 0 && Array.isArray(geometry[phase]) && (geometry[phase] as unknown[]).length > 0);
  const exactChecks = {
    firstSeamPixelsEqual: captured && joins.start === joins.end,
    secondSeamPixelsEqual: captured && joins.end === joins["second-loop"],
    repeatedMidPixelsEqual: captured && joins.mid === joins["second-mid"],
  };
  const checks = {
    allPhasesCaptured: captured,
    firstSeamPixelsSafe: captured && safeSourceRaster(pixels?.firstSeam),
    secondSeamPixelsSafe: captured && safeSourceRaster(pixels?.secondSeam),
    repeatedMidPixelsSafe: captured && safeSourceRaster(pixels?.repeatedMid),
    motionPresent: captured && pixels !== undefined && pixels.motion.changedFraction >= 0.001
      && pixels.motion.meanAbsoluteError >= 0.01 && pixels.motion.maximumChannelError >= 16,
    firstSeamGeometryEqual: captured && JSON.stringify(geometry.start) === JSON.stringify(geometry.end),
    secondSeamGeometryEqual: captured && JSON.stringify(geometry.end) === JSON.stringify(geometry["second-loop"]),
    repeatedMidGeometryEqual: captured && JSON.stringify(geometry.mid) === JSON.stringify(geometry["second-mid"]),
  };
  return { passed: Object.values(checks).every(Boolean), checks, exactChecks, limits: EVENTS_LIVE_SOURCE_RASTER_LIMITS };
}

/** Actual decoder timestamps/frame count, never the encoder's requested duration. */
export function assertEventsLiveDecode(report: EventsLiveDecodeReport, expected: {
  sha256: string; width: number; height: number; fps: number; seconds: number;
}) {
  const frames = expected.fps * expected.seconds;
  if (report.artifactSha256 !== expected.sha256 || report.decoder !== "avfoundation" || report.codec !== "h264"
    || report.decoderCompleted !== true || report.width !== expected.width || report.height !== expected.height
    || Math.abs(report.durationSeconds - expected.seconds) > 0.02 || report.decodedFrames !== frames
    || report.distinctFrames < expected.fps * 3 || Math.abs(report.firstPresentationSeconds) > 0.001
    || Math.abs(report.lastPresentationSeconds - (frames - 1) / expected.fps) > 0.02) {
    throw new Error("FULL_DECODE_OR_DURATION_FAILED");
  }
  return { decoderCompleted: true, durationSeconds: report.durationSeconds, decodedFrames: report.decodedFrames,
    distinctFrames: report.distinctFrames, loopSeamReviewed: false, humanReviewRequired: true };
}
