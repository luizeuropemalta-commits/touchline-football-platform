"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createMarketNotificationConsent, type MarketNotificationPreferences } from "@/lib/touchlineArena/market-notification-consent";
import { registerTouchlinePushDevice, touchlinePushIsConfigured } from "@/lib/touchlineArena/push-device-registration";
import { getTouchlineMarketNotificationsCopy } from "@/lib/touchlineArena/market-notifications-i18n";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function preferencesRequest(value?: (MarketNotificationPreferences & { explicitConsent: boolean }) | { action: "set_push_sound"; silentPush: boolean },
  context?: { expectedAccountId?: string; signal?: AbortSignal }) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  context?.signal?.addEventListener("abort", cancel, { once: true });
  if (context?.signal?.aborted) cancel();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    controller.signal.throwIfAborted();
    if (value && (!context?.expectedAccountId || !ACCOUNT_ID.test(context.expectedAccountId))) throw Error("account-unconfirmed");
    const response = await fetch("/api/notifications/preferences", {
      method: value ? "PUT" : "GET", cache: "no-store", signal: controller.signal,
      ...(value ? { headers: { "Content-Type": "application/json", "X-Touchline-Expected-Account": context!.expectedAccountId! }, body: JSON.stringify(value) } : {}),
    });
    const body = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok || body?.ok !== true || !body.data?.settings || !body.data?.quietHours
      || typeof body.data?.channels?.push !== "boolean" || typeof body.data?.channels?.email !== "boolean"
      || typeof body.data?.channels?.in_app !== "boolean" || typeof body.data?.frequency !== "string") throw new Error("preferences-unavailable");
    if (typeof body.data.accountId !== "string" || !ACCOUNT_ID.test(body.data.accountId)
      || (context?.expectedAccountId && body.data.accountId !== context.expectedAccountId)) throw Error("account-unconfirmed");
    return body.data as MarketNotificationPreferences;
  } finally { clearTimeout(timeout); context?.signal?.removeEventListener("abort", cancel); controller.abort(); }
}

export default function TouchlineMarketNotifications({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const notificationCopy = getTouchlineMarketNotificationsCopy(locale, draftLocalesEnabled);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const actionAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const lifecycle = mounted, requests = generation, pending = actionAbort;
    lifecycle.current = true;
    return () => { lifecycle.current = false; requests.current++; pending.current?.abort(); };
  }, []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<MarketNotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const run = useMemo(() => createMarketNotificationConsent({
    configured: () => Boolean(touchlinePushIsConfigured()),
    permission: () => typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) ? "unsupported" : Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    register: (current, operation) => {
      if (!current.accountId || !ACCOUNT_ID.test(current.accountId) || !operation) throw Error("account-unconfirmed");
      return registerTouchlinePushDevice({ expectedAccountId: current.accountId, signal: operation.signal, isCurrentAccount: operation.isCurrent });
    },
    save: (value, operation) => preferencesRequest(value, { expectedAccountId: value.accountId, signal: operation?.signal }),
  }), []);

  function close() { generation.current++; actionAbort.current?.abort(); setOpen(false); trigger.current?.focus(); }
  async function changeSound(silentPush: boolean) {
    if (!preferences || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const current = ++generation.current;
    const controller = new AbortController(); actionAbort.current = controller;
    setMessage(notificationCopy.savingSound);
    try {
      const saved = await preferencesRequest({ action: "set_push_sound", silentPush }, { expectedAccountId: preferences.accountId, signal: controller.signal });
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
    const controller = new AbortController(); actionAbort.current = controller;
    const result = await run(preferences, action, {
      signal: controller.signal, isCurrent: () => mounted.current && current === generation.current,
    });
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
