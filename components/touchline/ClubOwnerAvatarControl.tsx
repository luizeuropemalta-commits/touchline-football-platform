"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createClubOwnerAvatarRecoveryClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { getTouchlineClubOwnerAvatarUiCopy, getTouchlineClubOwnerAvatarSelectionCopy } from "@/lib/touchlineArena/club-owner-avatar-ui-i18n";
import type { projectAvatarRecoveryContext } from "@/lib/touchlineArena/club-owner-avatar-upload-contract";
import type { createClubOwnerAvatarClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { projectClubOwnerAvatarSelectionContext } from "@/lib/touchlineArena/club-owner-avatar-selection-contract";
import ClubOwnerAvatarUploadSelection from "./ClubOwnerAvatarUploadSelection";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";

export type ClubOwnerAvatarUiContext = ReturnType<typeof projectAvatarRecoveryContext>;
type Props = { accountId: string; context: ClubOwnerAvatarUiContext | null; locale: string; children: ReactNode; draftLocalesEnabled?: boolean; avatarSelectionEnabled?: boolean; retentionReady?: boolean };
type Recovery = ReturnType<typeof createClubOwnerAvatarRecoveryClient>;
type Snapshot = ReturnType<Recovery["snapshot"]>;
type Lifetime = { accountId: string; live: boolean; valid: boolean; observed: boolean; busy: boolean; recovery: Recovery };

/** Recovery remains the default. Selection additionally requires both explicit
 * dormant capabilities; no automatic status/fence/retry or photo update. */
export default function ClubOwnerAvatarControl({ accountId, context, locale, children, draftLocalesEnabled = false, avatarSelectionEnabled = false, retentionReady = false }: Props) {
  const copy = getTouchlineClubOwnerAvatarUiCopy(locale, draftLocalesEnabled), router = useRouter(), id = useId();
  const enabled = context?.accountId === accountId && context.uploadAllowed === true
    && context.canUpload === false && context.readyForSelection === false;
  const current = useRef<Lifetime | null>(null);
  const upload = useRef<ReturnType<typeof createClubOwnerAvatarClient> | null>(null);
  const selection = projectClubOwnerAvatarSelectionContext(context, avatarSelectionEnabled, retentionReady);
  const portrait = useRef<HTMLButtonElement | null>(null), panel = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<{ accountId: string; available: boolean; snapshot: Snapshot | null }>({ accountId, available: false, snapshot: null });
  const [opened, setOpened] = useState(false), [confirming, setConfirming] = useState(false);
  const available = enabled && view.accountId === accountId && view.available;
  const snapshot = view.accountId === accountId ? view.snapshot : null;
  const busy = snapshot?.phase === "checking" || snapshot?.phase === "fencing";
  const isCurrent = (life: Lifetime) => current.current === life && life.live && life.valid && life.observed;

  useLayoutEffect(() => {
    if (!enabled) return;
    const life: Lifetime = { accountId, live: true, valid: true, observed: false, busy: false,
      recovery: createClubOwnerAvatarRecoveryClient({ enabled: true, accountId,
        upload: { snapshot: () => ({ accountId }), invalidate: () => upload.current?.invalidate() },
        isCurrent: () => current.current === life && life.live && life.valid && life.observed,
        request: (input, init) => fetch(input, init) }) };
    current.current = life;
    const invalidate = () => {
      life.valid = false; life.recovery.dispose(); upload.current?.dispose(); upload.current = null;
      if (life.live && current.current === life) { setView({ accountId, available: false, snapshot: null }); setConfirming(false); }
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const client = createClient(); if (!client) throw Error();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!life.live || current.current !== life) return;
        if (session?.user?.id !== accountId) { invalidate(); return; }
        if (!life.valid || life.observed) return;
        life.observed = true;
        setView({ accountId, available: true, snapshot: life.recovery.snapshot() });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { invalidate(); }
    return () => {
      // Retire the observed identity before a StrictMode/new-account lifetime.
      invalidate(); life.live = false; unsubscribe?.();
      if (current.current === life) current.current = null;
    };
  }, [accountId, enabled]);

  useLayoutEffect(() => { if (opened) panel.current?.focus(); }, [opened]);

  function close() { setOpened(false); setConfirming(false); portrait.current?.focus(); }
  async function perform(action: "observe" | "fence" | "retry") {
    const life = current.current;
    if (!life || life.accountId !== accountId || !enabled || !isCurrent(life) || life.busy || action === "fence" && !confirming) return;
    life.busy = true; setConfirming(false);
    try {
      const pending = action === "observe" ? life.recovery.observe() : action === "fence" ? life.recovery.fence(true) : life.recovery.retryFence(true);
      if (!isCurrent(life)) return;
      setView({ accountId, available: true, snapshot: life.recovery.snapshot() });
      const result = await pending;
      if (!isCurrent(life)) return;
      setView({ accountId, available: true, snapshot: life.recovery.snapshot() });
      if (result === "refresh_required" && isCurrent(life)) router.refresh();
    } finally { if (isCurrent(life)) life.busy = false; }
  }
  const phase = snapshot?.phase;
  const message = selection && phase === "refresh_required" ? getTouchlineClubOwnerAvatarSelectionCopy(locale, draftLocalesEnabled).recovery : !enabled ? copy.off : !available ? copy.blocked : phase === "checking" ? copy.observing
    : phase === "fencing" ? copy.fencing : phase === "unknown" ? copy.unknown : phase === "refresh_required" ? copy.refreshRequired
    : phase === "observed" ? copy.observed : copy.unobserved;
  return <>
    <button ref={portrait} type="button" data-avatar-action="open" className={`${controls.link} ${styles.photoButton}`}
      disabled={!available} aria-label={copy.open} aria-expanded={opened && available} aria-controls={`${id}-panel`} aria-describedby={`${id}-status`}
      onClick={() => { if (available) setOpened(true); }}>{children}</button>
    <small id={`${id}-status`} role="status" aria-live="polite">{message}</small>
    {opened && available ? <section ref={panel} tabIndex={-1} id={`${id}-panel`} className={styles.recoveryPanel} aria-labelledby={`${id}-title`} aria-busy={busy}>
      <h3 id={`${id}-title`}>{copy.title}</h3>{!selection ? <p>{copy.noUpload}</p> : null}
      <div className={styles.recoveryActions}>
        <button type="button" className={controls.link} data-avatar-action="observe" disabled={busy} onClick={() => void perform("observe")}>{copy.observe}</button>
        {phase === "observed" && !snapshot?.pendingFence && !confirming ? <button type="button" className={controls.link} data-avatar-action="prepare-fence"
          disabled={busy || !snapshot?.context?.uploadAllowed} onClick={() => setConfirming(true)}>{copy.prepareFence}</button> : null}
        {snapshot?.pendingFence && !busy ? <button type="button" className={controls.link} data-avatar-action="retry" onClick={() => void perform("retry")}>{copy.retry}</button> : null}
      </div>
      {confirming ? <div className={styles.recoveryConfirmation}><h4>{copy.confirmTitle}</h4><p>{copy.confirmBody}</p>
        <button type="button" className={controls.link} data-avatar-action="confirm-fence" disabled={busy} onClick={() => void perform("fence")}>{copy.confirmFence}</button></div> : null}
      <button type="button" className={controls.link} data-avatar-action="close" onClick={close}>{copy.close}</button>
    </section> : null}
    {available && selection ? <ClubOwnerAvatarUploadSelection
      key={`${selection.accountId}:${selection.revision}:${selection.generation}`}
      context={selection} enabled={avatarSelectionEnabled} retentionReady={retentionReady} visible={opened}
      locale={locale} draftLocalesEnabled={draftLocalesEnabled}
      isCurrent={() => { const life = current.current; return !!life && life.accountId === accountId && isCurrent(life); }}
      canSelect={() => { const life = current.current; return !!life && !life.busy && life.recovery.snapshot().phase === "unobserved"; }}
      recoveryActive={busy || phase !== "unobserved"}
      registerUpload={value => { upload.current = value; }} onRefreshRequired={() => router.refresh()} /> : null}
  </>;
}
