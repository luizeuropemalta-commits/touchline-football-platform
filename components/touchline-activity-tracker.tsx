"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { touchlineActivityArea } from "@/lib/touchlineArena/activity-analytics";
import {
  getOrCreateIdentityBoundBrowserSessionId,
  readBrowserStorage,
  writeBrowserStorage,
} from "@/lib/touchlineArena/browser-storage";
import {
  canSendTouchlineAnalyticsObservation,
  parseTouchlineAnalyticsNextSendAt,
  TOUCHLINE_ANALYTICS_MIN_CADENCE_MS,
} from "@/lib/touchlineArena/analytics-cadence";
import { canStartTouchlineAnalyticsTracking } from "@/lib/touchlinePreview/isolation";

const TOUCHLINE_ANALYTICS_NEXT_SEND_STORAGE_KEY = "touchline-analytics-next-send-at";

export function TouchlineActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const area = touchlineActivityArea(pathname, searchParams.get("panel"));
  const lastInteraction = useRef(0);

  useEffect(() => {
    if (!area || !canStartTouchlineAnalyticsTracking(
      process.env.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE,
    )) return;

    let active = true;
    let timer: number | undefined;
    lastInteraction.current = Date.now();
    const mark = () => { lastInteraction.current = Date.now(); };

    async function start() {
      const supabase = createClient();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;

      const key = "touchline-analytics-session";
      const sessionId = await getOrCreateIdentityBoundBrowserSessionId(key, user.id);

      const send = () => {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        const nextSendAt = parseTouchlineAnalyticsNextSendAt(
          readBrowserStorage("sessionStorage", TOUCHLINE_ANALYTICS_NEXT_SEND_STORAGE_KEY),
        );
        if (!canSendTouchlineAnalyticsObservation(nextSendAt, now)) return;
        writeBrowserStorage(
          "sessionStorage",
          TOUCHLINE_ANALYTICS_NEXT_SEND_STORAGE_KEY,
          String(now + TOUCHLINE_ANALYTICS_MIN_CADENCE_MS),
        );
        fetch("/api/touchline-analytics", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ sessionId }),
        }).catch(() => {});
      };

      send();
      timer = window.setInterval(() => {
        if (Date.now() - lastInteraction.current < 60_000) send();
      }, 15_000);
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) => window.addEventListener(event, mark, { passive: true }));
    }

    void start().catch(() => {
      // Analytics must never interrupt navigation when auth or browser APIs fail.
    });
    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) => window.removeEventListener(event, mark));
    };
  }, [area]);
  return null;
}
