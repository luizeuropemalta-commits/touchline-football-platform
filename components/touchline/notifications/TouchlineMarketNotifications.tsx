"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createMarketNotificationConsent, type MarketNotificationPreferences } from "@/lib/touchlineArena/market-notification-consent";
import { registerTouchlinePushDevice, touchlinePushIsConfigured } from "@/lib/touchlineArena/push-device-registration";
import { getTouchlineMarketNotificationsCopy } from "@/lib/touchlineArena/market-notifications-i18n";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";

async function preferencesRequest(value?: (MarketNotificationPreferences & { explicitConsent: boolean }) | { action: "set_push_sound"; silentPush: boolean }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/notifications/preferences", {
      method: value ? "PUT" : "GET", cache: "no-store", signal: controller.signal,
      ...(value ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) } : {}),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true || !body.data?.settings || !body.data?.quietHours
      || typeof body.data?.channels?.push !== "boolean" || typeof body.data?.channels?.email !== "boolean"
      || typeof body.data?.channels?.in_app !== "boolean" || typeof body.data?.frequency !== "string") throw new Error("preferences-unavailable");
    return body.data as MarketNotificationPreferences;
  } finally { clearTimeout(timeout); }
}

export default function TouchlineMarketNotifications({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const notificationCopy = getTouchlineMarketNotificationsCopy(locale, draftLocalesEnabled);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    const lifecycle = mounted, requests = generation;
    lifecycle.current = true;
    return () => { lifecycle.current = false; requests.current++; };
  }, []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<MarketNotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const run = useMemo(() => createMarketNotificationConsent({
    configured: () => Boolean(touchlinePushIsConfigured()),
    permission: () => typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) ? "unsupported" : Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    register: registerTouchlinePushDevice,
    save: preferencesRequest,
  }), []);

  function close() { generation.current++; setOpen(false); trigger.current?.focus(); }
  async function changeSound(silentPush: boolean) {
    if (!preferences || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const current = ++generation.current;
    setMessage(notificationCopy.savingSound);
    try {
      const saved = await preferencesRequest({ action: "set_push_sound", silentPush });
      if (saved.settings.silentPush !== silentPush) throw new Error("sound-unconfirmed");
      if (!mounted.current || current !== generation.current) return;
      setPreferences(saved);
      setMessage(notificationCopy.soundSaved);
    } catch {
      if (mounted.current && current === generation.current) {
        setPreferences(null);
        setMessage(notificationCopy.soundUnconfirmed);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function show() {
    if (busyRef.current) return;
    if (open) { close(); return; }
    setOpen(true); setPreferences(null); setMessage(notificationCopy.loading);
    const current = ++generation.current;
    requestAnimationFrame(() => title.current?.focus());
    try {
      const value = await preferencesRequest();
      if (current !== generation.current) return;
      setPreferences(value); setMessage("");
    } catch { if (current === generation.current) setMessage(notificationCopy.preferencesUnavailable); }
  }
  async function act(action: "enable" | "pause") {
    if (!preferences || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const current = ++generation.current;
    setMessage(notificationCopy.awaiting);
    const result = await run(preferences, action);
    busyRef.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (current !== generation.current) return;
    if (result.preferences) setPreferences(result.preferences);
    else if (result.state === "partial" || result.state === "failed") setPreferences(null);
    const messages = {
      saved: action === "pause" ? notificationCopy.savedPause : notificationCopy.savedEnable,
      partial: action === "pause" ? notificationCopy.partialPause : notificationCopy.partialEnable,
      denied: notificationCopy.denied,
      unavailable: notificationCopy.unavailable,
      failed: notificationCopy.failed, busy: notificationCopy.busy,
    };
    setMessage(messages[result.state]);
  }
  return <section onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" className={controls.link} aria-expanded={open} aria-controls={id} onClick={() => void show()}><Bell size={18} aria-hidden="true" />{notificationCopy.title}</button>
    {open && <section id={id} aria-labelledby={`${id}-title`} className="my-3 rounded-xl border border-white/20 bg-black/80 p-4 text-sm text-white">
      <h2 ref={title} tabIndex={-1} id={`${id}-title`}>{notificationCopy.title}</h2>
      <p>{notificationCopy.description}</p>
      <p>{notificationCopy.deliveryPending}</p>
      <div className="my-3 flex flex-wrap gap-2">
        <label className={controls.link}>
          <input type="checkbox" checked={preferences?.settings.silentPush === true} disabled={busy || !preferences}
            onChange={event => void changeSound(event.currentTarget.checked)} />
          {notificationCopy.silent}
        </label>
        <button type="button" className={controls.link} disabled={busy || !preferences} onClick={() => void act("enable")}>{notificationCopy.allowAll}</button>
        <button type="button" className={controls.link} disabled={busy || !preferences} onClick={() => void act("pause")}>{notificationCopy.turnOff}</button>
        <a className={controls.link} href={`/notifications?lang=${encodeURIComponent(locale)}`}>{notificationCopy.categories}</a>
        <button type="button" className={controls.link} onClick={close}>{notificationCopy.close}</button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
    </section>}
  </section>;
}
