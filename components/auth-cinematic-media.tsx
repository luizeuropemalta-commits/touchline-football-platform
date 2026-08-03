"use client";

import { useEffect, useState, type CSSProperties } from "react";

import {
  TOUCHLINE_ARENA_ENTRY_VIDEO,
  TOUCHLINE_ARENA_VIDEO_POSTER,
} from "@/lib/touchlineArena/arena-intro";

export function AuthCinematicMedia() {
  const [motionPreference, setMotionPreference] = useState<"pending" | "normal" | "reduce">("pending");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setMotionPreference(media.matches ? "reduce" : "normal");
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  return (
    <div
      className="auth-cinematic-media"
      aria-hidden="true"
      style={{ "--auth-cinematic-poster": `url(${TOUCHLINE_ARENA_VIDEO_POSTER})` } as CSSProperties}
    >
      {motionPreference === "normal" ? (
        <video
          className="auth-cinematic-video auth-cinematic-original"
          src={TOUCHLINE_ARENA_ENTRY_VIDEO}
          poster={TOUCHLINE_ARENA_VIDEO_POSTER}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
        />
      ) : null}
      <div className="auth-cinematic-shade" />
    </div>
  );
}
