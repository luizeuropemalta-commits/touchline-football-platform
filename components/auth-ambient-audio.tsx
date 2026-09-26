"use client";

import { Volume2, VolumeX } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TOUCHLINE_ARENA_ENTRY_VIDEO, TOUCHLINE_ARENA_LOOP_VIDEO } from "@/lib/touchlineArena/arena-intro";
import { touchlineAmbientAudioRoute } from "@/lib/touchlineArena/ambient-audio-policy";
import { createQuietAudio } from "@/lib/touchlineArena/quiet-audio";
import { readTouchlineArenaMediaAvailability, subscribeTouchlineArenaMediaAvailability } from "@/lib/touchlineArena/arena-media-playback";
import shared from "./touchline/social/TouchlineSocial.module.css";

type AudioState = "off" | "starting" | "on" | "error";
const AmbientAudioContext = createContext<{
  state: AudioState; available: boolean; toggle: () => Promise<void>;
  claimIntro: (active: boolean) => void; enable: () => Promise<void>;
} | null>(null);

export function useTouchlineAmbientAudio() { return useContext(AmbientAudioContext); }

/** One root owner; route/camera rendering cannot recreate its media graph.
 * The approved intro has exclusive ownership until Arena releases its claim. */
export function TouchlineAmbientAudioProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const pathname = usePathname();
  const route = touchlineAmbientAudioRoute(pathname);
  const allowed = enabled && route !== "silent";
  const source = route === "entry" ? TOUCHLINE_ARENA_ENTRY_VIDEO : TOUCHLINE_ARENA_LOOP_VIDEO;
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createQuietAudio> | null>(null);
  const mounted = useRef(false);
  const intent = useRef(0);
  const wanted = useRef(false);
  const introClaim = useRef(false);
  const policy = useRef({ allowed, source });
  const [state, setState] = useState<AudioState>("off");
  const [audioRevision, setAudioRevision] = useState(0);
  const stop = useCallback(() => {
    intent.current++; controller.current?.stop();
    if (mounted.current) setState("off");
  }, []);

  const play = useCallback(async () => {
    const element = audio.current;
    if (!policy.current.allowed || introClaim.current || !wanted.current || !element || !readTouchlineArenaMediaAvailability()) return;
    const request = ++intent.current;
    if (element.getAttribute("src") !== policy.current.source) {
      controller.current?.stop();
      element.src = policy.current.source;
    }
    controller.current ??= createQuietAudio(element, (gain) => {
      const context = new AudioContext();
      try {
        const attenuation = context.createGain(); attenuation.gain.value = gain;
        const source = context.createMediaElementSource(element);
        source.connect(attenuation); attenuation.connect(context.destination);
        return { resume: () => context.resume(), close: () => context.close() };
      } catch (error) { void context.close().catch(() => {}); throw error; }
    });
    setState("starting");
    const playing = await controller.current.start();
    if (mounted.current && request === intent.current) {
      if (!playing) {
        controller.current.dispose(); controller.current = null;
        wanted.current = false;
        setAudioRevision((value) => value + 1);
      }
      setState(playing ? "on" : "error");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const suspend = () => { wanted.current = false; stop(); };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => { if (reducedMotion.matches) suspend(); };
    reducedMotion.addEventListener("change", onMotionChange);
    const unsubscribe = subscribeTouchlineArenaMediaAvailability(() => { if (!readTouchlineArenaMediaAvailability()) suspend(); });
    window.addEventListener("pagehide", suspend);
    document.addEventListener("freeze", suspend);
    return () => {
      mounted.current = false;
      controller.current?.dispose(); controller.current = null;
      unsubscribe();
      reducedMotion.removeEventListener("change", onMotionChange);
      window.removeEventListener("pagehide", suspend);
      document.removeEventListener("freeze", suspend);
    };
  }, [stop]);

  useLayoutEffect(() => {
    policy.current = { allowed, source };
    if (!allowed) wanted.current = false;
    if (!allowed || introClaim.current) { stop(); return; }
    // Same track = no pause, no src assignment, no currentTime reset.
    if (audio.current?.getAttribute("src") === source && !audio.current.paused) return;
    if (wanted.current) void play();
  }, [allowed, source, play, stop]);

  const enable = useCallback(async () => { wanted.current = true; await play(); }, [play]);
  const toggle = useCallback(async () => {
    if (wanted.current) { wanted.current = false; stop(); }
    else await enable();
  }, [enable, stop]);
  const claimIntro = useCallback((active: boolean) => {
    introClaim.current = active;
    if (active) { wanted.current = false; stop(); }
    // Releasing the claim does not auto-start a second sound underneath
    // navigation. Arena explicitly hands off after its entry video ends.
  }, [stop]);

  return <AmbientAudioContext.Provider value={{ state, available: allowed, toggle, claimIntro, enable }}>
    <audio key={audioRevision} ref={audio} loop preload="none"
      onPause={() => {
        if (audio.current?.paused && state === "on") { wanted.current = false; setState("off"); }
      }}
      onError={() => { wanted.current = false; stop(); setState("error"); }} />
    {children}
  </AmbientAudioContext.Provider>;
}

export function AuthAmbientAudio({ locale, className, buttonClassName }: { locale: string; className?: string; buttonClassName?: string }) {
  const pt = locale === "pt-BR";
  const ambient = useContext(AmbientAudioContext);
  if (!ambient?.available) return null;
  const { state, toggle } = ambient;
  return <div className={className ?? shared.profileActions} style={{ "--social-accent": "#b7ff46" } as CSSProperties}>
    <button className={buttonClassName} type="button" aria-pressed={state === "on"} onClick={() => void toggle()}
      aria-label={state === "on" || state === "starting" ? (pt ? "Silenciar som ambiente" : "Mute ambient sound") : (pt ? "Ativar som ambiente suave" : "Enable quiet ambient sound")}>
      {state === "on" ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
      {pt ? "Som" : "Sound"}
    </button>
    {state === "error" ? <span role="status" className="text-xs text-slate-300">{pt ? "Som indisponível. Tente novamente." : "Sound unavailable. Try again."}</span> : null}
  </div>;
}
