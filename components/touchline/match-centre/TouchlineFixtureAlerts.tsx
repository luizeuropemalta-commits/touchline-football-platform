"use client";

import { Bell } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getTouchlineFixtureAlertCopy } from "@/lib/touchlineArena/fixture-alert-i18n";
import { parseFixtureAlertSavedInterest } from "@/lib/touchlineArena/fixture-alert-readiness";
import { parseFixtureAlertStatus } from "@/lib/touchlineArena/fixture-alert-status-client";
import { readTouchlinePushInstallationId } from "@/lib/touchlineArena/push-device-registration";
import { createClient } from "@/lib/supabase/client";
import { startAccountLocaleIdentityObserver } from "@/lib/touchlineArena/account-locale-identity-observer";
import shared from "../social/TouchlineSocial.module.css";
import styles from "./TouchlineFixtureAlerts.module.css";

export default function TouchlineFixtureAlerts({ fixtureId, label, locale, expectedAccountId = null, draftLocalesEnabled = false }: { fixtureId: string; label: string; locale: string; expectedAccountId?: string | null; draftLocalesEnabled?: boolean }) {
  const copy = getTouchlineFixtureAlertCopy(locale, draftLocalesEnabled);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error" | "signed-out" | "disabled">("loading");
  const [observedUrl, setObservedUrl] = useState<{ key: string; epoch: number } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const accountInvalid = useRef(false);
  const identityConfirmed = useRef(false);
  const previousAccount = useRef(expectedAccountId);
  const statusGeneration = useRef(0);
  const [readiness, setReadiness] = useState<{ key: string; epoch: number; phase: "loading" | "observed" | "unconfirmed" }>({ key: "", epoch: -1, phase: "unconfirmed" });
  const [identityRetry, setIdentityRetry] = useState(0);
  // A GET can precede a delayed PUT commit. Automatic readback is observation,
  // not completion. Explicit reread permits a new CAS command, never a replay.
  const uncertainCommands = useRef(new Set<string>());
  const [uncertainContexts, setUncertainContexts] = useState<ReadonlySet<string>>(new Set());
  const url = `/api/notifications/fixtures/${encodeURIComponent(fixtureId)}`;
  const contextKey = `${url}:${expectedAccountId ?? ""}`;
  // Rendering owns an immutable projection, not the imperative race fences.
  // A guarded same-component reset prevents even an A -> B -> A render from
  // reusing a prior opening's identity. It performs no subscription or I/O.
  const [identityView, setIdentityView] = useState({ key: contextKey, accountId: expectedAccountId,
    open, retry: identityRetry, epoch: 0, confirmed: false, invalid: false });
  const [savedRevision, setSavedRevision] = useState<{ key: string; epoch: number; value: string } | null>(null);
  let visibleIdentity = identityView;
  if (identityView.key !== contextKey || identityView.open !== open || identityView.retry !== identityRetry) {
    visibleIdentity = { key: contextKey, accountId: expectedAccountId, open, retry: identityRetry,
      epoch: identityView.epoch + 1, confirmed: false,
      invalid: identityView.accountId === expectedAccountId && identityView.invalid };
    setIdentityView(visibleIdentity);
  }
  const viewEpoch = visibleIdentity.epoch;
  function markUncertain(value: boolean) {
    if (value) uncertainCommands.current.add(contextKey);
    else uncertainCommands.current.delete(contextKey);
    setUncertainContexts(previous => {
      const next = new Set(previous);
      if (value) next.add(contextKey); else next.delete(contextKey);
      return next;
    });
  }
  const visiblePhase = !expectedAccountId ? "signed-out"
    : observedUrl?.key !== contextKey || observedUrl.epoch !== viewEpoch || (phase === "ready" && !visibleIdentity.confirmed)
      ? "loading" : (phase === "ready" || phase === "error") && !visibleIdentity.invalid && uncertainContexts.has(contextKey) ? "uncertain" : phase;

  // Commit-time invalidation precedes passive effects and user interaction.
  // A previous fixture's pending response must never populate the new panel.
  useLayoutEffect(() => {
    statusGeneration.current += 1;
    identityConfirmed.current = false;
    if (previousAccount.current !== expectedAccountId) { accountInvalid.current = false; previousAccount.current = expectedAccountId; }
    generation.current += 1;
    pending.current?.abort();
    busy.current = false;
    return () => { statusGeneration.current += 1; generation.current += 1; pending.current?.abort(); busy.current = false; };
  }, [url, open, expectedAccountId, identityRetry]);

  useEffect(() => {
    if (!open || !expectedAccountId) return;
    const controller = new AbortController();
    const observationGeneration = statusGeneration.current;
    const expected = { accountId: expectedAccountId, fixtureId, installationId: readTouchlinePushInstallationId() };
    let disposed = false;
    let invalidated = false;
    let observedSameAccount = false;
    let scopedReceipt = false;
    const recovering = accountInvalid.current;
    let unsubscribe: (() => void) | undefined;
    const publishIdentity = (confirmed: boolean, invalid: boolean) => {
      setIdentityView(previous => previous.epoch === viewEpoch && previous.key === contextKey
        ? { ...previous, confirmed, invalid } : previous);
    };
    const publishReadiness = (nextPhase: "observed" | "unconfirmed") => {
      setReadiness({ key: contextKey, epoch: viewEpoch, phase: nextPhase });
    };
    const current = () => !disposed && observationGeneration === statusGeneration.current && !controller.signal.aborted && !invalidated;
    const settleRecovery = () => {
      if (!current() || !scopedReceipt || !observedSameAccount) return;
      if (accountInvalid.current) {
        // A retry reads only. Never unlock a write on a local session event or
        // a server receipt alone: both must describe this unchanged context.
        if (!observedSameAccount) return;
        accountInvalid.current = false;
        publishIdentity(true, false);
        setObservedUrl(null); setSubscribed(null); setPhase("loading");
        setRevision(value => value + 1);
      }
      publishReadiness("observed");
      clearTimeout(timer);
    };
    const invalidate = (nextPhase: "signed-out" | "error" = "signed-out") => {
      if (disposed || observationGeneration !== statusGeneration.current) return;
      invalidated = true;
      accountInvalid.current = true;
      identityConfirmed.current = false;
      publishIdentity(false, true);
      controller.abort(); pending.current?.abort(); generation.current += 1; busy.current = false;
      setSubscribed(null); setObservedUrl({ key: contextKey, epoch: viewEpoch }); setPhase(nextPhase);
      publishReadiness("unconfirmed");
    };
    try {
      const client = createClient();
      if (!client) throw Error("identity-observation-unavailable");
      // The shared observer catches SDK user proxies and verifies unknown
      // sessions outside the auth callback. Unknown never means signed out.
      unsubscribe = startAccountLocaleIdentityObserver({
        readUser: () => client.auth.getUser(),
        subscribe: observer => {
          const { data } = client.auth.onAuthStateChange(observer);
          return () => data.subscription.unsubscribe();
        },
        onIdentity: identity => {
          if (identity === null) { invalidate("signed-out"); return; }
          if (identity === undefined && recovering && accountInvalid.current && current()) {
            identityConfirmed.current = false; observedSameAccount = false;
            publishIdentity(false, true);
            pending.current?.abort(); generation.current += 1; busy.current = false;
            setSubscribed(null); setPhase("loading"); return;
          }
          if (identity === undefined || identity.toLowerCase() !== expectedAccountId.toLowerCase()) { invalidate("error"); return; }
          if (current()) {
            identityConfirmed.current = true; observedSameAccount = true;
            publishIdentity(true, accountInvalid.current);
            settleRecovery();
          }
        },
      });
    } catch { invalidate("error"); }
    const timer = setTimeout(() => {
      if (!disposed && !invalidated && observationGeneration === statusGeneration.current) {
        if (!observedSameAccount || accountInvalid.current) { invalidate("error"); return; }
        controller.abort();
        publishReadiness("unconfirmed");
      }
    }, 10_000);
    if (invalidated) clearTimeout(timer);
    if (current()) void fetch(`${url}/readiness`, { cache: "no-store", credentials: "same-origin", signal: controller.signal,
      headers: { "X-Touchline-Expected-Account": expected.accountId, ...(expected.installationId ? { "X-Touchline-Installation": expected.installationId } : {}) } })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!current()) return;
        if (response.status === 401 || response.status === 409) { invalidate(response.status === 401 ? "signed-out" : "error"); return; }
        const receipt = response.ok ? parseFixtureAlertStatus(body, expected) : null;
        scopedReceipt = receipt !== null;
        if (receipt) settleRecovery();
        else { publishReadiness("unconfirmed"); if (accountInvalid.current) setPhase("error"); }
      }).catch(() => { if (current()) publishReadiness("unconfirmed"); })
      .finally(() => { if ((observedSameAccount && !accountInvalid.current) || invalidated) clearTimeout(timer); });
    return () => { disposed = true; clearTimeout(timer); controller.abort(); unsubscribe?.(); };
  }, [open, expectedAccountId, fixtureId, url, contextKey, identityRetry, viewEpoch]);

  useEffect(() => {
    if (!open || accountInvalid.current) return;
    if (!expectedAccountId) return;
    const controller = new AbortController(); pending.current = controller;
    let disposed = false;
    const requestGeneration = generation.current;
    const current = () => !disposed && requestGeneration === generation.current;
    const timeout = setTimeout(() => {
      controller.abort();
      if (current()) { setObservedUrl({ key: contextKey, epoch: viewEpoch }); setSubscribed(null); setPhase("error"); }
    }, 15_000);
    void fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal, headers: { "X-Touchline-Expected-Account": expectedAccountId } })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!current()) return;
        if (controller.signal.aborted) throw new Error("timeout");
        setObservedUrl({ key: contextKey, epoch: viewEpoch });
        if (response.status === 401) { setSubscribed(null); setPhase("signed-out"); return; }
        if (response.status === 409) { statusGeneration.current += 1; generation.current += 1; accountInvalid.current = true; identityConfirmed.current = false;
          setIdentityView(previous => previous.epoch === viewEpoch && previous.key === contextKey ? { ...previous, confirmed: false, invalid: true } : previous);
          setSubscribed(null); setPhase("error"); return; }
        if (response.status === 503 && body?.error === "ALERTS_NOT_ENABLED") { setSubscribed(null); setPhase("disabled"); return; }
        const receipt = parseFixtureAlertSavedInterest(body, { accountId: expectedAccountId, fixtureId });
        if (!response.ok || !receipt) throw new Error("unavailable");
        setSavedRevision({ key: contextKey, epoch: viewEpoch, value: receipt.revision });
        setSubscribed(receipt.subscribed); setPhase(receipt.revision === "9223372036854775807" ? "error" : "ready");
      }).catch(() => { if (current()) { setObservedUrl({ key: contextKey, epoch: viewEpoch }); setSubscribed(null); setPhase("error"); } })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; generation.current += 1; busy.current = false; clearTimeout(timeout); pending.current?.abort(); };
  }, [open, revision, url, contextKey, expectedAccountId, fixtureId, viewEpoch]);

  async function save() {
    if (!expectedAccountId || !identityConfirmed.current || accountInvalid.current || uncertainCommands.current.has(contextKey) || busy.current || observedUrl?.key !== contextKey || observedUrl.epoch !== viewEpoch || phase !== "ready" || subscribed === null) return;
    if (savedRevision?.key !== contextKey || savedRevision.epoch !== viewEpoch || savedRevision.value === "9223372036854775807") return;
    const expectedRevision = savedRevision.value;
    const nextRevision = (BigInt(expectedRevision) + BigInt(1)).toString();
    busy.current = true; setPhase("saving");
    markUncertain(true);
    const requestGeneration = generation.current;
    const controller = new AbortController(); pending.current = controller;
    const requestedActive = !subscribed;
    let readingBack = false;
    const readBack = () => {
      if (readingBack || requestGeneration !== generation.current) return;
      readingBack = true;
      controller.abort();
      setObservedUrl(null);
      setSubscribed(null); setPhase("loading");
      setRevision((value) => value + 1);
    };
    const timeout = setTimeout(readBack, 15_000);
    try {
      const response = await fetch(url, { method: "PUT", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Touchline-Expected-Account": expectedAccountId }, body: JSON.stringify({ active: requestedActive, expectedRevision }) });
      const body = await response.json().catch(() => null);
      if (requestGeneration !== generation.current || readingBack) return;
      if (controller.signal.aborted) throw new Error("timeout");
      if (response.status === 401) { markUncertain(false); setSubscribed(null); setPhase("signed-out"); return; }
      if (response.status === 409 && body?.error === "REVISION_CONFLICT") {
        markUncertain(false); setSavedRevision(null); setSubscribed(null); setPhase("error");
        return; // Explicit Check again only. Never retry an intention automatically.
      }
      if (response.status === 409) { markUncertain(false); statusGeneration.current += 1; generation.current += 1; busy.current = false; accountInvalid.current = true; identityConfirmed.current = false;
        setIdentityView(previous => previous.epoch === viewEpoch && previous.key === contextKey ? { ...previous, confirmed: false, invalid: true } : previous);
        setSubscribed(null); setPhase("error"); return; }
      if (response.status === 503 && body?.error === "ALERTS_NOT_ENABLED") { markUncertain(false); setSubscribed(null); setPhase("disabled"); return; }
      const receipt = parseFixtureAlertSavedInterest(body, { accountId: expectedAccountId, fixtureId }, requestedActive, nextRevision);
      if (!response.ok || !receipt) throw new Error("unavailable");
      markUncertain(false);
      setSavedRevision({ key: contextKey, epoch: viewEpoch, value: receipt.revision });
      setSubscribed(receipt.subscribed); setPhase(receipt.revision === "9223372036854775807" ? "error" : "ready");
    } catch {
      // Readback is observation, not proof that this command has completed.
      // Keep the uncertainty visible until an explicit read; server CAS also
      // prevents a late command overwriting a newer confirmation after remount.
      readBack();
    } finally { clearTimeout(timeout); if (requestGeneration === generation.current) busy.current = false; }
  }

  return <>
    <div className={`${shared.profileActions} ${styles.trigger}`}>
      <button type="button" aria-expanded={open} aria-controls={panelId} aria-label={`${copy.alerts}: ${label}`}
        onClick={() => { generation.current += 1; pending.current?.abort(); busy.current = false; setOpen((value) => !value); setSubscribed(null); setPhase("loading"); }}>
        {/* Saved interest is not an active push channel. Keep the bell neutral
            until the delivery contract can explicitly confirm mobile alerts. */}
        <Bell size={18} aria-hidden="true" />
      </button>
    </div>
    {open ? <section id={panelId} className={styles.panel} aria-label={`${copy.alerts}: ${label}`}>
      <strong>{label}</strong>
      <p role="status">{visiblePhase === "loading" ? copy.loading
        : visiblePhase === "saving" ? copy.saving
        : visiblePhase === "signed-out" ? copy.signedOut
        : visiblePhase === "disabled" ? copy.disabled
        : visiblePhase === "error" ? copy.error
        : visiblePhase === "uncertain" ? copy.uncertain
        : subscribed ? copy.saved
        : copy.notSaved}</p>
      <p data-readiness={readiness.key === contextKey && readiness.epoch === viewEpoch ? readiness.phase : "loading"}>{copy.deliveryUnavailable}</p>
      <div className={shared.profileActions}>
        {visiblePhase === "ready" || visiblePhase === "saving" ? <button type="button" disabled={visiblePhase === "saving"} onClick={() => void save()}>{subscribed ? copy.removeMatch : copy.saveMatch}</button> : null}
        {visiblePhase === "error" || visiblePhase === "uncertain" ? <button type="button" onClick={() => {
          markUncertain(false); setSavedRevision(null);
          setPhase("loading");
          if (accountInvalid.current) setIdentityRetry(value => value + 1);
          else setRevision(value => value + 1);
        }}>{copy.checkAgain}</button> : null}
        {visiblePhase === "signed-out" ? <a href={`/login?lang=${encodeURIComponent(locale)}`}>{copy.signIn}</a> : null}
      </div>
    </section> : null}
  </>;
}
