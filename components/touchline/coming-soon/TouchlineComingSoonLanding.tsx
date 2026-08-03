"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import {
  TOUCHLINE_ARENA_ENTRY_VIDEO,
  TOUCHLINE_ARENA_INTRO_SLOGAN,
  TOUCHLINE_ARENA_LOOP_VIDEO,
  TOUCHLINE_ARENA_OFFICIAL_LOGO,
  TOUCHLINE_ARENA_VIDEO_POSTER,
  touchlineArenaIntroTimeline,
  type TouchlineArenaIntroPhase,
} from "@/lib/touchlineArena/arena-intro";

import styles from "../arena/touchline-arena-intro.module.css";

type TouchlineAudioContextConstructor = typeof AudioContext;
type TouchlineCrowdAudio = {
  context: AudioContext;
  gain: GainNode;
  lowPass: BiquadFilterNode;
  firework: (strength?: number) => void;
  stop: () => void;
};
type TouchlineComingSoonLocale = "pt" | "en";
type ComingSoonCopy = {
  aria: string;
  soundOn: string;
  soundOff: string;
  privateBuild: string;
  headline: string;
  body: string;
};

const LOOP_VISIBLE_MS = 10_000;
const CYCLE_MS = touchlineArenaIntroTimeline(false).completeAt + LOOP_VISIBLE_MS + 1_500;

const copyByLocale: Record<TouchlineComingSoonLocale, ComingSoonCopy> = {
  pt: {
    aria: "TouchLine Arena em breve",
    soundOn: "Som ligado",
    soundOff: "Som da torcida",
    privateBuild: "Private build",
    headline: "Em breve",
    body: "TouchLine Arena está sendo preparada para entrar em campo.",
  },
  en: {
    aria: "TouchLine Arena coming soon",
    soundOn: "Sound on",
    soundOff: "Crowd sound",
    privateBuild: "Private build",
    headline: "Coming soon",
    body: "TouchLine Arena is being prepared to enter the pitch.",
  },
};

function resolveComingSoonLocale(value: string | null | undefined): TouchlineComingSoonLocale {
  return value?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

type TouchlineComingSoonLandingProps = {
  locale?: string;
};

export function TouchlineComingSoonLanding({ locale: requestedLocale = "pt-BR" }: TouchlineComingSoonLandingProps) {
  const [phase, setPhase] = useState<TouchlineArenaIntroPhase>("suspense");
  const [cycle, setCycle] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const entryVideoRef = useRef<HTMLVideoElement | null>(null);
  const loopVideoRef = useRef<HTMLVideoElement | null>(null);
  const crowdAudioRef = useRef<TouchlineCrowdAudio | null>(null);
  const fireworkCueRef = useRef("");
  const locale = resolveComingSoonLocale(requestedLocale);
  const copy = copyByLocale[locale];
  const isLoopVisible = phase === "reveal";
  const isEntryVisible = phase === "stadium";

  const syncCrowdAudioToPicture = useCallback(() => {
    const audio = crowdAudioRef.current;
    if (!audio) return;
    const now = audio.context.currentTime;
    let targetVolume = 0.004;
    let targetFrequency = 520;

    if (phase === "energy") {
      targetVolume = 0.032;
      targetFrequency = 720;
    } else if (phase === "slogan") {
      targetVolume = 0.16;
      targetFrequency = 1_020;
    } else if (phase === "stadium") {
      const videoTime = entryVideoRef.current?.currentTime ?? 0;
      const closeToCrowd = Math.min(1, Math.max(0, (videoTime - 0.55) / 1.55));
      const droneRisingAway = Math.min(1, Math.max(0, (videoTime - 2.55) / 0.9));
      targetVolume = 0.12 + closeToCrowd * 0.42 - droneRisingAway * 0.18;
      targetFrequency = 820 + closeToCrowd * 700 - droneRisingAway * 280;

      const firstCue = `${cycle}:first-firework`;
      const secondCue = `${cycle}:second-firework`;
      if (videoTime > 0.75 && !fireworkCueRef.current.includes(firstCue)) {
        audio.firework(0.62);
        fireworkCueRef.current = `${fireworkCueRef.current}|${firstCue}`;
      }
      if (videoTime > 1.95 && !fireworkCueRef.current.includes(secondCue)) {
        audio.firework(0.86);
        fireworkCueRef.current = `${fireworkCueRef.current}|${secondCue}`;
      }
    } else if (phase === "reveal") {
      const videoTime = loopVideoRef.current?.currentTime ?? 0;
      targetVolume = 0.19 + Math.sin(videoTime * 0.7) * 0.025;
      targetFrequency = 880 + Math.sin(videoTime * 0.38) * 90;
    }

    audio.gain.gain.cancelScheduledValues(now);
    audio.lowPass.frequency.cancelScheduledValues(now);
    audio.gain.gain.setTargetAtTime(Math.max(0.001, targetVolume), now, phase === "stadium" ? 0.18 : 0.75);
    audio.lowPass.frequency.setTargetAtTime(Math.max(420, targetFrequency), now, 0.28);
  }, [cycle, phase]);

  useEffect(() => {
    const timeline = touchlineArenaIntroTimeline(false);
    const timers = [
      window.setTimeout(() => setPhase("suspense"), 0),
      window.setTimeout(() => setPhase("outline"), timeline.outlineAt),
      window.setTimeout(() => setPhase("energy"), timeline.energyAt),
      window.setTimeout(() => setPhase("slogan"), timeline.sloganAt),
      window.setTimeout(() => setPhase("stadium"), timeline.stadiumAt),
      window.setTimeout(() => setPhase("reveal"), timeline.completeAt),
      window.setTimeout(() => setCycle((value) => value + 1), CYCLE_MS),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [cycle]);

  useEffect(() => {
    if (phase === "stadium") {
      const video = entryVideoRef.current;
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    }
    if (phase === "reveal") {
      const video = loopVideoRef.current;
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    }
  }, [phase, cycle]);

  useEffect(() => {
    if (!soundEnabled) return;
    let frame = 0;
    const syncAudio = () => {
      syncCrowdAudioToPicture();
      frame = window.requestAnimationFrame(syncAudio);
    };
    syncAudio();
    return () => window.cancelAnimationFrame(frame);
  }, [soundEnabled, syncCrowdAudioToPicture]);

  useEffect(() => {
    const stopAudio = () => {
      crowdAudioRef.current?.stop();
      crowdAudioRef.current = null;
      setSoundEnabled(false);
    };
    const stopAudioWhenHidden = () => {
      if (document.visibilityState === "hidden") stopAudio();
    };
    window.addEventListener("pagehide", stopAudio);
    document.addEventListener("visibilitychange", stopAudioWhenHidden);
    return () => {
      window.removeEventListener("pagehide", stopAudio);
      document.removeEventListener("visibilitychange", stopAudioWhenHidden);
      stopAudio();
    };
  }, []);

  function startCrowdAudio() {
    const AudioContextConstructor = (window.AudioContext ||
      ("webkitAudioContext" in window ? window.webkitAudioContext : undefined)) as
      | TouchlineAudioContextConstructor
      | undefined;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    const seconds = 2.4;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.36;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowPass = context.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 760;
    lowPass.Q.value = 0.68;

    const highPass = context.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 115;

    const gain = context.createGain();
    gain.gain.value = 0.001;

    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(gain);
    gain.connect(context.destination);
    source.start();

    return {
      context,
      gain,
      lowPass,
      firework: (strength = 0.7) => {
        const fireworkBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.55), context.sampleRate);
        const fireworkChannel = fireworkBuffer.getChannelData(0);
        for (let index = 0; index < fireworkChannel.length; index += 1) {
          const decay = 1 - index / fireworkChannel.length;
          fireworkChannel[index] = (Math.random() * 2 - 1) * decay * strength;
        }
        const burst = context.createBufferSource();
        burst.buffer = fireworkBuffer;
        const burstFilter = context.createBiquadFilter();
        burstFilter.type = "bandpass";
        burstFilter.frequency.value = 1_260 + Math.random() * 520;
        burstFilter.Q.value = 0.9;
        const burstGain = context.createGain();
        const burstTime = context.currentTime;
        burstGain.gain.setValueAtTime(0.001, burstTime);
        burstGain.gain.exponentialRampToValueAtTime(0.2 * strength, burstTime + 0.035);
        burstGain.gain.exponentialRampToValueAtTime(0.001, burstTime + 0.55);
        burst.connect(burstFilter);
        burstFilter.connect(burstGain);
        burstGain.connect(context.destination);
        burst.start(burstTime);
        burst.stop(burstTime + 0.58);
      },
      stop: () => {
        try {
          source.stop();
        } catch {
          // Audio may already be stopped by the browser page lifecycle.
        }
        void context.close().catch(() => undefined);
      },
    };
  }

  async function toggleSound() {
    if (soundEnabled) {
      crowdAudioRef.current?.stop();
      crowdAudioRef.current = null;
      setSoundEnabled(false);
      return;
    }
    const audio = startCrowdAudio();
    if (!audio) return;
    crowdAudioRef.current = audio;
    await audio.context.resume().catch(() => undefined);
    const now = audio.context.currentTime;
    audio.gain.gain.cancelScheduledValues(now);
    audio.gain.gain.setValueAtTime(0.001, now);
    audio.gain.gain.linearRampToValueAtTime(0.012, now + 1.2);
    setSoundEnabled(true);
  }

  return (
    <main
      className={styles.root}
      data-testid="touchline-coming-soon"
      data-mode="first"
      data-phase={phase}
      aria-label={copy.aria}
      style={{ "--touchline-arena-intro-poster": `url(${TOUCHLINE_ARENA_VIDEO_POSTER})` } as CSSProperties}
    >
      <video
        ref={entryVideoRef}
        key={`entry-${cycle}`}
        src={TOUCHLINE_ARENA_ENTRY_VIDEO}
        muted
        playsInline
        preload="auto"
        poster={TOUCHLINE_ARENA_VIDEO_POSTER}
        aria-hidden="true"
        style={cinematicVideoStyle(isEntryVisible, 0.88)}
      />
      <video
        ref={loopVideoRef}
        key={`loop-${cycle}`}
        src={TOUCHLINE_ARENA_LOOP_VIDEO}
        muted
        playsInline
        loop
        preload="auto"
        poster={TOUCHLINE_ARENA_VIDEO_POSTER}
        aria-hidden="true"
        style={cinematicVideoStyle(isLoopVisible, 0.58)}
      />
      <div className={styles.arenaPreview} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.scan} aria-hidden="true" />

      <button
        type="button"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? copy.soundOn : copy.soundOff}
        onClick={toggleSound}
        style={soundButtonStyle}
      >
        <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
        {soundEnabled ? copy.soundOn : copy.soundOff}
      </button>

      <div className={styles.brandStage}>
        <div className={styles.logoStage} aria-hidden="true">
          <span className={styles.logoHalo} />
          <Image
            className={styles.logoOutline}
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            fill
            sizes="(max-width: 980px) 132px, 190px"
            priority
            unoptimized
          />
          <Image
            className={styles.logo}
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            fill
            sizes="(max-width: 980px) 132px, 190px"
            priority
            unoptimized
          />
          <span className={styles.logoSweep} />
        </div>

        <p className={styles.slogan} aria-hidden="true">
          <span>THIS IS NOT A FANTASY.</span>
          <strong>THIS IS REALITY.</strong>
        </p>
        <span className={styles.srOnly} role="status" aria-live="polite">
          {phase === "slogan" ? TOUCHLINE_ARENA_INTRO_SLOGAN : ""}
        </span>
      </div>

      <section aria-label={copy.aria} style={comingSoonPanelStyle(isLoopVisible)}>
        <Image src={TOUCHLINE_ARENA_OFFICIAL_LOGO} alt="TouchLine" width={54} height={54} priority unoptimized />
        <span style={panelKickerStyle}>{copy.privateBuild}</span>
        <h1 style={panelTitleStyle}>{copy.headline}</h1>
        <p style={panelBodyStyle}>{copy.body}</p>
      </section>
    </main>
  );
}

function cinematicVideoStyle(isVisible: boolean, opacity: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: -4,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: isVisible ? opacity : 0,
    filter: "saturate(1.08) contrast(1.08) brightness(0.62)",
    transition: "opacity 900ms ease, filter 900ms ease",
  };
}

const soundButtonStyle: CSSProperties = {
  position: "fixed",
  top: "max(18px, env(safe-area-inset-top))",
  right: "max(18px, env(safe-area-inset-right))",
  zIndex: 5,
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  minHeight: 42,
  border: "1px solid rgba(156, 255, 46, 0.3)",
  borderRadius: 999,
  padding: "0 15px",
  color: "rgba(246, 255, 240, 0.86)",
  background: "rgba(2, 9, 6, 0.68)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 14px 42px rgba(0,0,0,.42)",
  backdropFilter: "blur(14px)",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

function comingSoonPanelStyle(isVisible: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    bottom: "max(34px, env(safe-area-inset-bottom))",
    zIndex: 4,
    display: "grid",
    justifyItems: "center",
    gap: 10,
    width: "min(520px, calc(100vw - 36px))",
    padding: "24px clamp(18px, 4vw, 36px)",
    border: "1px solid rgba(156, 255, 46, 0.24)",
    borderRadius: 28,
    background:
      "radial-gradient(circle at 50% 0%, rgba(156,255,46,.15), transparent 34%), linear-gradient(140deg, rgba(2,9,6,.82), rgba(0,0,0,.55))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 28px 80px rgba(0,0,0,.58), 0 0 46px rgba(156,255,46,.08)",
    backdropFilter: "blur(18px)",
    opacity: isVisible ? 1 : 0,
    transform: `translate(-50%, ${isVisible ? "0" : "26px"})`,
    transition: "opacity 900ms ease, transform 900ms cubic-bezier(.2,.9,.2,1)",
    pointerEvents: isVisible ? "auto" : "none",
    textAlign: "center",
  };
}

const panelKickerStyle: CSSProperties = {
  color: "#a3ff12",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: ".2em",
  textTransform: "uppercase",
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fff1",
  fontSize: "clamp(42px, 8vw, 86px)",
  lineHeight: 0.86,
  letterSpacing: "-.055em",
};

const panelBodyStyle: CSSProperties = {
  maxWidth: 390,
  margin: 0,
  color: "rgba(255,255,255,.74)",
  fontSize: "clamp(13px, 2vw, 17px)",
  fontWeight: 800,
  lineHeight: 1.5,
};
