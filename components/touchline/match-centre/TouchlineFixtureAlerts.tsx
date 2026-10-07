"use client";

import { Bell } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getTouchlineFixtureAlertCopy } from "@/lib/touchlineArena/fixture-alert-i18n";
import shared from "../social/TouchlineSocial.module.css";
import styles from "./TouchlineFixtureAlerts.module.css";

export default function TouchlineFixtureAlerts({ fixtureId, label, locale, draftLocalesEnabled = false }: { fixtureId: string; label: string; locale: string; draftLocalesEnabled?: boolean }) {
  const copy = getTouchlineFixtureAlertCopy(locale, draftLocalesEnabled);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error" | "signed-out" | "disabled">("loading");
  const pending = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const url = `/api/notifications/fixtures/${encodeURIComponent(fixtureId)}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let disposed = false;
    void fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (disposed) return;
        if (controller.signal.aborted) throw new Error("timeout");
        if (response.status === 401) { setSubscribed(null); setPhase("signed-out"); return; }
        if (response.status === 503 && body?.error === "ALERTS_NOT_ENABLED") { setSubscribed(null); setPhase("disabled"); return; }
        if (!response.ok || body?.ok !== true || body.delivery !== "unavailable" || typeof body.data?.subscribed !== "boolean") throw new Error("unavailable");
        setSubscribed(body.data.subscribed); setPhase("ready");
      }).catch(() => { if (!disposed) { setSubscribed(null); setPhase("error"); } })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; generation.current += 1; busy.current = false; clearTimeout(timeout); pending.current?.abort(); };
  }, [open, revision, url]);

  async function save() {
    if (busy.current || phase !== "ready" || subscribed === null) return;
    busy.current = true; setPhase("saving");
    const requestGeneration = generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { method: "PUT", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !subscribed }) });
      const body = await response.json().catch(() => null);
      if (requestGeneration !== generation.current) return;
      if (controller.signal.aborted) throw new Error("timeout");
      if (response.status === 401) { setSubscribed(null); setPhase("signed-out"); return; }
      if (response.status === 503 && body?.error === "ALERTS_NOT_ENABLED") { setSubscribed(null); setPhase("disabled"); return; }
      if (!response.ok || body?.ok !== true || body.delivery !== "unavailable" || typeof body.data?.subscribed !== "boolean") throw new Error("unavailable");
      setSubscribed(body.data.subscribed); setPhase("ready");
    } catch {
      // Outcome may be uncertain. A fresh GET is required before another write.
      if (requestGeneration !== generation.current) return;
      setSubscribed(null); setPhase("error");
    } finally { clearTimeout(timeout); if (requestGeneration === generation.current) busy.current = false; }
  }

  return <>
    <div className={`${shared.profileActions} ${styles.trigger}`}>
      <button type="button" aria-expanded={open} aria-controls={panelId} aria-label={`${copy.alerts}: ${label}`}
        onClick={() => { setOpen((value) => !value); setSubscribed(null); setPhase("loading"); }}>
        {/* Saved interest is not an active push channel. Keep the bell neutral
            until the delivery contract can explicitly confirm mobile alerts. */}
        <Bell size={18} aria-hidden="true" />
      </button>
    </div>
    {open ? <section id={panelId} className={styles.panel} aria-label={`${copy.alerts}: ${label}`}>
      <strong>{label}</strong>
      <p role="status">{phase === "loading" ? copy.loading
        : phase === "saving" ? copy.saving
        : phase === "signed-out" ? copy.signedOut
        : phase === "disabled" ? copy.disabled
        : phase === "error" ? copy.error
        : subscribed ? copy.saved
        : copy.notSaved}</p>
      <p>{copy.deliveryUnavailable}</p>
      <div className={shared.profileActions}>
        {phase === "ready" || phase === "saving" ? <button type="button" disabled={phase === "saving"} onClick={() => void save()}>{subscribed ? copy.removeMatch : copy.saveMatch}</button> : null}
        {phase === "error" ? <button type="button" onClick={() => { setPhase("loading"); setRevision((value) => value + 1); }}>{copy.checkAgain}</button> : null}
        {phase === "signed-out" ? <a href={`/login?lang=${encodeURIComponent(locale)}`}>{copy.signIn}</a> : null}
      </div>
    </section> : null}
  </>;
}
