"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import TouchlineArenaIntro from "./TouchlineArenaIntro";
import { TOUCHLINE_ARENA_ENTRY_VIDEO, TOUCHLINE_ARENA_INTRO_STORAGE_KEY, resolveTouchlineArenaIntroLaunchMode, type TouchlineArenaIntroIntent, type TouchlineArenaIntroLaunchMode } from "@/lib/touchlineArena/arena-intro";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/touchlineArena/browser-storage";
import { createTouchlineArenaMediaSession, readTouchlineArenaMediaAvailability, subscribeTouchlineArenaMediaAvailability } from "@/lib/touchlineArena/arena-media-playback";
import styles from "./TouchlineGameEntry.module.css";
import introStyles from "./touchline-arena-intro.module.css";

const serverUnavailable = () => false;
export default function TouchlineGameEntry({ locale, initialIntroIntent = null }: {
  locale: string; initialIntroIntent?: TouchlineArenaIntroIntent;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"pending" | "hidden" | TouchlineArenaIntroLaunchMode>("pending");
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [mediaSession] = useState(createTouchlineArenaMediaSession);
  const video = useRef<HTMLVideoElement>(null);
  const finished = useRef(false);
  const available = useSyncExternalStore(subscribeTouchlineArenaMediaAvailability, readTouchlineArenaMediaAvailability, serverUnavailable);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setCompleted(true);
    mediaSession.stop();
    writeBrowserStorage("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1");
    router.replace(`/market-transfer?lang=${encodeURIComponent(locale)}`);
  }, [locale, mediaSession, router]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const launch = resolveTouchlineArenaIntroLaunchMode({ intent: initialIntroIntent, hasCompletedIntro: readBrowserStorage("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY) === "1" });
      if (launch === "skip") finish();
      else setMode(launch);
    });
    return () => { cancelled = true; mediaSession.stop(); };
  }, [initialIntroIntent, finish, mediaSession]);

  useEffect(() => {
    const target = video.current;
    if (!available || !revealed || !target || finished.current) { mediaSession.stop(); return; }
    let cancelled = false;
    void mediaSession.play(target, {
      muted,
      isAllowed: () => !cancelled && !finished.current && readTouchlineArenaMediaAvailability(),
      onMutedFallback: () => { if (!cancelled) setMuted(true); },
    }).then((played) => { if (!cancelled && played === false && readTouchlineArenaMediaAvailability()) finish(); });
    return () => { cancelled = true; mediaSession.stop(); };
  }, [available, revealed, muted, mediaSession, finish]);

  return <main className={styles.root} data-touchline-game-entry="true">
    {revealed && !completed ? <video ref={video} className={styles.video} src={TOUCHLINE_ARENA_ENTRY_VIDEO} playsInline muted={muted} preload="auto" onEnded={finish} onError={finish} /> : null}
    <TouchlineArenaIntro locale={locale} mode={available ? mode : "pending"}
      onSequenceStart={() => {}}
      onReveal={(reduce) => { if (reduce) finish(); else setRevealed(true); }}
      onComplete={() => setMode("hidden")} onSkip={finish}
      onToggleAudio={() => setMuted((value) => !value)} audioMuted={muted} />
    {mode === "hidden" ? <div className={styles.controls}>
      <button className={introStyles.sequenceSkip} type="button" onClick={() => setMuted((value) => !value)}>{muted ? (locale === "pt-BR" ? "Ativar som" : "Enable sound") : (locale === "pt-BR" ? "Silenciar" : "Mute")}</button>
      <button className={introStyles.sequenceSkip} type="button" onClick={finish}>{locale === "pt-BR" ? "Ir ao Mercado" : "Go to Market"}</button>
    </div> : null}
  </main>;
}
