export const TOUCHLINE_ENTRY_AUDIO_GAIN = 0.12;
const AUDIO_START_TIMEOUT_MS = 15_000;

type Media = Pick<HTMLAudioElement, "play" | "pause" | "muted">;
type Attenuator = { resume(): Promise<void>; close(): Promise<void> };

/** The gain graph must be connected before unmuting. Never fall back to
 * unattenuated playback when Web Audio is unavailable or blocked. */
export function createQuietAudio(media: Media, connect: (gain: number) => Attenuator) {
  let graph: Attenuator | null = null;
  let generation = 0;
  let disposed = false;
  const stop = () => { generation++; media.muted = true; media.pause(); };
  return {
    stop,
    async start() {
      if (disposed) return false;
      const request = ++generation;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        graph ??= connect(TOUCHLINE_ENTRY_AUDIO_GAIN);
        // Both calls happen in the user's gesture, before the first await.
        const resumed = graph.resume();
        media.muted = false;
        const played = media.play();
        await Promise.race([
          Promise.all([resumed, played]),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Audio activation timed out")), AUDIO_START_TIMEOUT_MS);
          }),
        ]);
        return request === generation && !disposed;
      } catch {
        if (request === generation) stop();
        return false;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    dispose() {
      disposed = true;
      stop();
      void graph?.close().catch(() => {});
    },
  };
}
