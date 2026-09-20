import {
  normalizeTouchLineAuthReturnTo,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "./auth-i18n.ts";

const ONBOARDING_PLAYBACK_MS = 3_000;

export function touchlineRegistrationEntryHref(returnTo: string | null | undefined, locale: string) {
  const normalizedReturnTo = normalizeTouchLineAuthReturnTo(returnTo);
  const pathname = normalizedReturnTo?.split(/[?#]/, 1)[0];
  // Administrative/QA entry keeps its established destination. Password
  // recovery uses its own callback and never calls this registration helper.
  if (pathname && ["/admin", "/visual-qa"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return touchLinePostAuthHref(normalizedReturnTo, locale);
  }
  return touchLineAuthHref("/arena?intro=first&onboarding=market", locale);
}

export function touchlineArenaOnboardingHref(search: string, locale: string) {
  return new URLSearchParams(search).get("onboarding") === "market"
    ? touchLineAuthHref("/my-club", locale)
    : null;
}

type OnboardingVideo = Pick<HTMLVideoElement,
  "currentTime" | "paused" | "ended" | "seeking" | "readyState" | "playbackRate"
  | "addEventListener" | "removeEventListener"
>;

/** Observe, but never control, the existing loop/audio lifecycle. */
export function observeTouchlineArenaOnboardingPlayback({
  video,
  isAllowed,
  subscribeAvailability,
  requestFrame,
  cancelFrame,
  onComplete,
}: {
  video: OnboardingVideo;
  isAllowed: () => boolean;
  subscribeAvailability: (notify: () => void) => () => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (request: number) => void;
  onComplete: () => void;
}) {
  let disposed = false;
  let frameRequest: number | null = null;
  let playedMs = 0;
  let previous: { wallTime: number; mediaTime: number; rate: number } | null = null;
  const resetObservation = () => { previous = null; };
  const discontinuities = ["pause", "waiting", "stalled", "seeking", "seeked", "emptied", "ended", "playing", "ratechange"];
  for (const event of discontinuities) video.addEventListener(event, resetObservation);
  const unsubscribeAvailability = subscribeAvailability(resetObservation);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frameRequest !== null) cancelFrame(frameRequest);
    frameRequest = null;
    for (const event of discontinuities) video.removeEventListener(event, resetObservation);
    unsubscribeAvailability();
  };

  const sample: FrameRequestCallback = (wallTime) => {
    if (disposed) return;
    frameRequest = null;
    const mediaTime = video.currentTime;
    const rate = video.playbackRate;
    if (!isAllowed() || video.paused || video.ended || video.seeking || video.readyState < 2
      || !Number.isFinite(mediaTime) || !Number.isFinite(rate) || rate <= 0) {
      resetObservation();
    } else {
      if (previous && previous.rate === rate) {
        const mediaDelta = mediaTime - previous.mediaTime;
        const wallDelta = wallTime - previous.wallTime;
        if (mediaDelta > 0 && wallDelta > 0) {
          // Neither a wall-clock timeout, a stalled frame, nor accelerated
          // playback can stand in for three real seconds of visible playback.
          playedMs += Math.min(wallDelta, mediaDelta / rate * 1_000);
        }
      }
      previous = { wallTime, mediaTime, rate };
    }
    if (playedMs >= ONBOARDING_PLAYBACK_MS) {
      dispose();
      onComplete();
      return;
    }
    frameRequest = requestFrame(sample);
  };
  frameRequest = requestFrame(sample);
  return dispose;
}
