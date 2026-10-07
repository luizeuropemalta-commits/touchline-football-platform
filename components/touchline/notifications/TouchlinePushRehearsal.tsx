"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerTouchlinePushDeviceForRehearsal, touchlinePushIsConfigured } from "@/lib/touchlineArena/push-device-registration";
import { createPushRehearsalAttempt } from "@/lib/touchlineArena/push-rehearsal-attempt";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import { getTouchlinePushRehearsalCopy } from "@/lib/touchlineArena/push-rehearsal-i18n";

type Props = { accountId: string; configuredInstallationId: string | null; locale: string; draftLocalesEnabled?: boolean };
type Phase = "idle" | "preparing" | "ready" | "registered-disabled" | "sending" | "accepted" | "unconfirmed" | "blocked" | "permission" | "unsupported" | "unconfigured" | "storage" | "previous";
type Generation = {
  key: string; active: boolean; invalidated: boolean; busy: boolean; phase: Phase; consent: boolean;
  registration?: AbortController; attempt?: ReturnType<typeof createPushRehearsalAttempt>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function waitPermission(operation: Promise<NotificationPermission>, controller: AbortController) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      const abort = () => reject(Error("permission-unconfirmed"));
      controller.signal.addEventListener("abort", abort, { once: true });
      removeAbort = () => controller.signal.removeEventListener("abort", abort);
      if (controller.signal.aborted) abort();
      timer = setTimeout(() => controller.abort(), 15_000);
    })]);
  } finally { clearTimeout(timer); removeAbort(); }
}

/** Server renders this only for the explicitly allowed rehearsal account.
 * Identity observation invalidates that context; it never authorizes a send.
 * All permission/registration/send effects require separate user gestures.
 */
export default function TouchlinePushRehearsal({ accountId, configuredInstallationId, locale, draftLocalesEnabled = false }: Props) {
  const id = useId();
  const copy = getTouchlinePushRehearsalCopy(locale, draftLocalesEnabled);
  const key = `${accountId.toLowerCase()}:${configuredInstallationId?.toLowerCase() ?? ""}`;
  const current = useRef<Generation | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; phase: Phase; consent: boolean }>({ key, phase: "blocked", consent: false });
  const phase = snapshot.key === key ? snapshot.phase : "blocked";
  const consent = snapshot.key === key && snapshot.consent;
  const isCurrent = (generation: Generation) => current.current === generation && generation.active && !generation.invalidated;
  const publish = (generation: Generation, next: Phase) => {
    if (!isCurrent(generation)) return;
    generation.phase = next;
    setSnapshot({ key: generation.key, phase: next, consent: generation.consent });
  };

  useLayoutEffect(() => {
    const generation: Generation = { key, active: true, invalidated: false, busy: false, phase: "blocked", consent: false };
    current.current = generation;
    const invalidate = () => {
      generation.invalidated = true;
      generation.registration?.abort(); generation.attempt?.dispose();
      if (generation.active && current.current === generation) setSnapshot({ key, phase: "blocked", consent: false });
    };
    let unsubscribe: (() => void) | undefined;
    let observed = false;
    try {
      if (!UUID.test(accountId) || configuredInstallationId !== null && !UUID.test(configuredInstallationId)) throw Error("invalid-context");
      const client = createClient();
      if (!client) throw Error("identity-unavailable");
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const observedId = session?.user?.id;
        if (typeof observedId !== "string" || observedId.toLowerCase() !== accountId.toLowerCase()) { invalidate(); return; }
        if (!observed && !generation.invalidated && generation.active) {
          observed = true; generation.phase = "idle";
          setSnapshot({ key, phase: "idle", consent: false });
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { invalidate(); }
    return () => {
      generation.active = false;
      generation.registration?.abort(); generation.attempt?.dispose(); unsubscribe?.();
      if (current.current === generation) current.current = null;
    };
  }, [accountId, configuredInstallationId, key]);

  async function prepare() {
    const generation = current.current;
    if (!generation || generation.key !== key || !isCurrent(generation) || generation.busy || generation.phase !== "idle") return;
    generation.busy = true; generation.consent = false;
    const controller = new AbortController(); generation.registration = controller;
    publish(generation, "preparing");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { publish(generation, "unsupported"); return; }
      if (!touchlinePushIsConfigured()) { publish(generation, "unconfigured"); return; }
      const storage = window.localStorage;
      if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") { publish(generation, "storage"); return; }
      if (Notification.permission === "default") {
        // DIRECT gesture call: no awaited identity/browser work before this.
        const permission = await waitPermission(Notification.requestPermission(), controller);
        if (!isCurrent(generation) || controller.signal.aborted) return;
        if (permission !== "granted") { publish(generation, "permission"); return; }
      }
      if (Notification.permission !== "granted") { publish(generation, "permission"); return; }
      const registration = await registerTouchlinePushDeviceForRehearsal({ expectedAccountId: accountId, signal: controller.signal,
        isCurrentAccount: () => isCurrent(generation) });
      if (!isCurrent(generation) || controller.signal.aborted) return;
      if (registration.status !== "registered") {
        publish(generation, registration.status === "permission-required" ? "permission" : registration.status === "unsupported" ? "unsupported" : "unconfigured");
        return;
      }
      if (!UUID.test(registration.accountId) || registration.accountId.toLowerCase() !== accountId.toLowerCase()
        || !UUID.test(registration.installationId)) { publish(generation, "unconfirmed"); return; }
      if (!configuredInstallationId || registration.installationId.toLowerCase() !== configuredInstallationId.toLowerCase()) {
        publish(generation, "registered-disabled"); return;
      }
      generation.attempt = createPushRehearsalAttempt({ accountId: registration.accountId, installationId: registration.installationId,
        isCurrent: () => isCurrent(generation), storage, randomUUID: () => crypto.randomUUID(), request: (input, init) => fetch(input, init) });
      publish(generation, "ready");
    } catch { publish(generation, "unconfirmed"); }
    finally { controller.abort(); if (isCurrent(generation)) generation.busy = false; }
  }

  function changeConsent(value: boolean) {
    const generation = current.current;
    if (!generation || generation.key !== key || !isCurrent(generation) || generation.phase !== "ready" || generation.busy) return;
    generation.consent = value === true;
    publish(generation, "ready");
  }

  async function send() {
    const generation = current.current;
    if (!generation || generation.key !== key || !isCurrent(generation) || generation.busy || generation.phase !== "ready"
      || !generation.consent || !generation.attempt) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") { generation.attempt.dispose(); publish(generation, "permission"); return; }
    generation.busy = true; publish(generation, "sending");
    try {
      const result = await generation.attempt.send(true);
      if (!isCurrent(generation)) return;
      generation.consent = false;
      publish(generation, result === "provider_accepted" ? "accepted" : result === "blocked" ? "previous" : "unconfirmed");
    } catch { publish(generation, "unconfirmed"); }
    finally { if (isCurrent(generation)) generation.busy = false; }
  }

  const showConsent = ["ready", "sending", "accepted", "previous"].includes(phase);
  return <section aria-labelledby={`${id}-title`} aria-busy={phase === "preparing" || phase === "sending"} className="space-y-3 rounded-xl border border-white/20 p-4 text-sm">
    <h2 id={`${id}-title`}>{copy.title}</h2>
    <p>{copy.description}</p>
    <button type="button" className={controls.link} disabled={phase !== "idle"} onClick={() => void prepare()}>{copy.prepare}</button>
    {showConsent ? <>
      <label className={controls.link}>
        <input type="checkbox" checked={consent} disabled={phase !== "ready"} onChange={event => changeConsent(event.target.checked)} />
        {copy.consent}
      </label>
      <button type="button" className={controls.link} disabled={phase !== "ready" || !consent} onClick={() => void send()}>{copy.send}</button>
    </> : null}
    <p role="status" aria-live="polite">{copy[phase]}</p>
  </section>;
}
