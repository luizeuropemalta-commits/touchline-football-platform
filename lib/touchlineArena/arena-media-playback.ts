import { TOUCHLINE_PORTRAIT_QUERY } from "./orientation-gate.ts";

export function readTouchlineArenaMediaAvailability() {
  return typeof window !== "undefined"
    && document.visibilityState !== "hidden"
    && !window.matchMedia(TOUCHLINE_PORTRAIT_QUERY).matches;
}

export function subscribeTouchlineArenaMediaAvailability(notify: () => void) {
  const portrait = window.matchMedia(TOUCHLINE_PORTRAIT_QUERY);
  portrait.addEventListener("change", notify);
  document.addEventListener("visibilitychange", notify);
  return () => {
    portrait.removeEventListener("change", notify);
    document.removeEventListener("visibilitychange", notify);
  };
}

type ArenaVideo = Pick<HTMLVideoElement, "muted" | "play" | "pause">;

/** Use existing official media only. A denied audible autoplay must never
 * strand the intro; fall back to muted playback and expose the real state. */
export async function playTouchlineArenaMedia(video: ArenaVideo, {
  muted,
  isAllowed,
  onMutedFallback,
  shouldPause = () => true,
}: {
  muted: boolean;
  isAllowed: () => boolean;
  onMutedFallback: () => void;
  shouldPause?: () => boolean;
}): Promise<boolean> {
  if (!isAllowed()) {
    if (shouldPause()) video.pause();
    return false;
  }
  video.muted = muted;
  try {
    await video.play();
  } catch (error) {
    if (muted || !(error instanceof Error) || error.name !== "NotAllowedError" || !isAllowed()) {
      if (shouldPause()) video.pause();
      return false;
    }
    video.muted = true;
    onMutedFallback();
    try {
      await video.play();
    } catch {
      if (shouldPause()) video.pause();
      return false;
    }
  }
  // The page can rotate, become hidden or unmount while play() is pending.
  if (!isAllowed()) {
    if (shouldPause()) video.pause();
    return false;
  }
  return true;
}

/** A newer play/pause intent owns the result. Stale promises cannot revive an
 * old video, change the UI, or pause a newer request for the same video. */
export function createTouchlineArenaMediaSession() {
  let generation = 0;
  let target: ArenaVideo | null = null;
  return {
    owns(video: ArenaVideo) { return target === video; },
    stop() {
      generation++;
      target?.pause();
      target = null;
    },
    async play(video: ArenaVideo, options: Parameters<typeof playTouchlineArenaMedia>[1]): Promise<boolean | null> {
      const request = ++generation;
      if (target !== video) target?.pause();
      target = video;
      const played = await playTouchlineArenaMedia(video, {
        ...options,
        isAllowed: () => request === generation && options.isAllowed(),
        shouldPause: () => request === generation || target !== video,
      });
      return request === generation ? played : null;
    },
  };
}
