export type StudioPlaybackState = { loops: number; time: number | null; now: number | null; watched: number; fromStart: boolean };
export type StudioPlaybackEvent = { kind: "interrupt" } | {
  kind: "sample" | "ended"; time: number; duration: number; now: number;
  visible: boolean; paused: boolean; seeking: boolean; rate: number;
};
export const emptyStudioPlayback = (): StudioPlaybackState => ({ loops: 0, time: null, now: null, watched: 0, fromStart: false });
const interrupted = (state: StudioPlaybackState): StudioPlaybackState => ({ ...emptyStudioPlayback(), loops: state.loops });

/** Conservative playback progress, not a human-attention or persisted Olhos attestation.
 * Native ended events replace wrap heuristics; discontinuities never count as watched time.
 */
export function advanceStudioPlayback(state: StudioPlaybackState, event: StudioPlaybackEvent): StudioPlaybackState {
  if (event.kind === "interrupt") return interrupted(state);
  if (![event.time, event.duration, event.now].every(Number.isFinite) || event.duration < 1 || event.time < 0 || event.time > event.duration + 0.05
    || !event.visible || event.paused || event.seeking || event.rate !== 1) return interrupted(state);
  if (state.time === null || state.now === null) {
    return { ...interrupted(state), time: event.time, now: event.now, fromStart: event.kind !== "ended" && event.time <= 0.05 };
  }
  const delta = event.time - state.time;
  const elapsed = (event.now - state.now) / 1000;
  if (delta < 0 || elapsed < 0 || elapsed > 1.5 || delta > 1.5 || delta > elapsed + 0.15) return interrupted(state);
  const next = { ...state, time: event.time, now: event.now, watched: state.watched + delta };
  if (event.kind !== "ended") return next;
  const complete = next.fromStart && next.watched >= event.duration - 0.1 && event.time >= event.duration - 0.05;
  return { ...interrupted(next), loops: Math.min(2, next.loops + (complete ? 1 : 0)) };
}

export function studioPlaybackMayRepeat(input: { requested: boolean; visible: boolean; reducedMotion: boolean }) {
  return input.requested && input.visible && !input.reducedMotion;
}
