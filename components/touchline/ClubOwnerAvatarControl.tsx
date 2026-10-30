"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startAccountLocaleIdentityObserver } from "@/lib/touchlineArena/account-locale-identity-observer";
import { createClubOwnerAvatarRecoveryClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { getTouchlineClubOwnerAvatarUiCopy, getTouchlineClubOwnerAvatarSelectionCopy } from "@/lib/touchlineArena/club-owner-avatar-ui-i18n";
import type { projectAvatarRecoveryContext } from "@/lib/touchlineArena/club-owner-avatar-upload-contract";
import type { createClubOwnerAvatarClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { projectClubOwnerAvatarSelectionContext } from "@/lib/touchlineArena/club-owner-avatar-selection-contract";
import ClubOwnerAvatarUploadSelection from "./ClubOwnerAvatarUploadSelection";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "./a11y/TouchlineDialog";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";
import modal from "./ClubOwnerAvatarControl.module.css";

export type ClubOwnerAvatarUiContext = ReturnType<typeof projectAvatarRecoveryContext>;
type Props = { accountId: string; context: ClubOwnerAvatarUiContext | null; locale: string; children: ReactNode; draftLocalesEnabled?: boolean; avatarSelectionEnabled?: boolean; retentionReady?: boolean };
type Recovery = ReturnType<typeof createClubOwnerAvatarRecoveryClient>;
type Snapshot = ReturnType<Recovery["snapshot"]>;
type Lifetime = { accountId: string; live: boolean; valid: boolean; observed: boolean; busy: boolean; engaged: boolean; recovery: Recovery };

/** Recovery remains the default. Selection additionally requires both explicit
 * dormant capabilities; no automatic status/fence/retry or photo update. */
export default function ClubOwnerAvatarControl({ accountId, context, locale, children, draftLocalesEnabled = false, avatarSelectionEnabled = false, retentionReady = false }: Props) {
  const copy = getTouchlineClubOwnerAvatarUiCopy(locale, draftLocalesEnabled), router = useRouter(), id = useId();
  const enabled = context?.accountId === accountId && context.uploadAllowed === true
    && context.canUpload === false && context.readyForSelection === false;
  const current = useRef<Lifetime | null>(null);
  const upload = useRef<ReturnType<typeof createClubOwnerAvatarClient> | null>(null);
  const selection = projectClubOwnerAvatarSelectionContext(context, avatarSelectionEnabled, retentionReady);
  const portrait = useRef<HTMLButtonElement | null>(null), heading = useRef<HTMLHeadingElement | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<{ accountId: string; available: boolean; snapshot: Snapshot | null }>({ accountId, available: false, snapshot: null });
  const [opened, setOpened] = useState(false), [confirming, setConfirming] = useState(false);
  const available = enabled && view.accountId === accountId && view.available;
  const snapshot = view.accountId === accountId ? view.snapshot : null;
  const busy = snapshot?.phase === "checking" || snapshot?.phase === "fencing";
  const isCurrent = (life: Lifetime) => current.current === life && life.live && life.valid && life.observed;
  const photoCopy = getTouchlineClubOwnerAvatarSelectionCopy(locale, draftLocalesEnabled);
  const modalOpen = opened && available && portal !== null;
  const title = selection ? photoCopy.profileTitle : copy.title;
  const { dialogRef, dialogProps } = useTouchlineDialog<HTMLDialogElement>({ open: modalOpen, label: title,
    onDismiss: close, initialFocusRef: heading, returnFocusRef: portrait, containEveryTab: true });
  useTouchlineDialogScrollLock(modalOpen);
  useLayoutEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (modalOpen && !node.open) node.showModal();
    if (!modalOpen && node.open) node.close();
    return () => { if (node.open) node.close(); };
  }, [modalOpen, portal, dialogRef]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const createLifetime = () => {
      const next: Lifetime = { accountId, live: true, valid: true, observed: false, busy: false, engaged: false,
      recovery: createClubOwnerAvatarRecoveryClient({ enabled: true, accountId,
        upload: { snapshot: () => ({ accountId }), invalidate: () => upload.current?.invalidate() },
        isCurrent: () => current.current === next && next.live && next.valid && next.observed,
        request: (input, init) => fetch(input, init) }) };
      return next;
    };
    let life = createLifetime();
    let identityPending = false, terminal = false;
    current.current = life;
    const retire = () => {
      life.valid = false; life.recovery.dispose(); upload.current?.dispose(); upload.current = null;
      if (life.live && current.current === life) { setView({ accountId, available: false, snapshot: null }); setConfirming(false); setOpened(false); }
    };
    const invalidate = () => { terminal = true; retire(); };
    let unsubscribe: (() => void) | undefined;
    try {
      const client = createClient(); if (!client) throw Error();
      unsubscribe = startAccountLocaleIdentityObserver({
        subscribe: observer => {
          const { data } = client.auth.onAuthStateChange(observer);
          return () => data.subscription.unsubscribe();
        },
        readUser: () => client.auth.getUser(),
        onIdentity: identity => {
          if (!life.live || current.current !== life || terminal) return;
          if (identity === undefined) {
            // Retire clients immediately. Only an untouched lifetime may recover;
            // a possibly dispatched operation must never be replayed or rebased.
            identityPending = !life.engaged;
            if (!identityPending) terminal = true;
            retire();
            return;
          }
          if (identity !== accountId) { invalidate(); return; }
          if (identityPending) {
            life.live = false;
            life = createLifetime(); current.current = life; identityPending = false;
          }
          if (!life.valid || life.observed) return;
          life.observed = true;
          setView({ accountId, available: true, snapshot: life.recovery.snapshot() });
        },
      });
    } catch { invalidate(); }
    return () => {
      // Retire the observed identity before a StrictMode/new-account lifetime.
      invalidate(); life.live = false; unsubscribe?.();
      if (current.current === life) current.current = null;
    };
  }, [accountId, enabled]);

  // Closing hides the persistent dialog. It never disposes a dispatched upload
  // or its recovery controller; a lost acknowledgement remains recoverable.
  function close() { setOpened(false); setConfirming(false); }
  async function perform(action: "observe" | "fence" | "retry") {
    const life = current.current;
    if (!life || life.accountId !== accountId || !enabled || !isCurrent(life) || life.busy || action === "fence" && !confirming) return;
    life.engaged = true; life.busy = true; setConfirming(false);
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
      disabled={!available} aria-label={selection ? photoCopy.choose : copy.open} aria-haspopup="dialog" aria-expanded={modalOpen} aria-controls={`${id}-panel`} aria-describedby={`${id}-status`}
      onClick={() => { const life = current.current; if (available && life && isCurrent(life)) { life.engaged = true; setPortal(document.body); setOpened(true); } }}>{children}</button>
    <small id={`${id}-status`} role="status" aria-live="polite">{message}</small>
    {portal ? createPortal(<dialog {...dialogProps} id={`${id}-panel`} className={modal.dialog} aria-modal={modalOpen ? true : undefined}
      aria-labelledby={`${id}-title`} data-avatar-dialog="true" dir={locale === "ar-SA" && draftLocalesEnabled ? "rtl" : "ltr"}
      onCancel={event => { event.preventDefault(); close(); }}>
      <div className={modal.shell}>
        <header className={modal.header}><div><span className={modal.eyebrow}>TouchLine / ClubOwner</span>
          <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2></div>
          <button type="button" className={`${controls.link} ${modal.close}`} data-avatar-action="close" aria-label={copy.close} onClick={close}><X size={20} aria-hidden="true" /></button>
        </header>
        {selection ? <p className={modal.hint}>{photoCopy.profileHint}</p> : null}
        <div className={modal.content}>
    {available && selection ? <ClubOwnerAvatarUploadSelection
      key={`${selection.accountId}:${selection.revision}:${selection.generation}`}
      context={selection} enabled={avatarSelectionEnabled} retentionReady={retentionReady} visible={modalOpen}
      locale={locale} draftLocalesEnabled={draftLocalesEnabled}
      isCurrent={() => { const life = current.current; return !!life && life.accountId === accountId && isCurrent(life); }}
      canSelect={() => { const life = current.current; return !!life && !life.busy && life.recovery.snapshot().phase === "unobserved"; }}
      recoveryActive={busy || phase !== "unobserved"}
      registerUpload={value => {
        const life = current.current;
        if (value && (!life || !isCurrent(life))) { value.dispose(); return; }
        if (value && life) life.engaged = true;
        upload.current = value;
      }} onRefreshRequired={() => router.refresh()} /> : null}
    {available ? <section className={modal.recovery} aria-labelledby={`${id}-recovery-title`} aria-busy={busy}>
      <h3 id={`${id}-recovery-title`}>{copy.title}</h3>{!selection ? <p>{copy.noUpload}</p> : null}
      <p role="status">{message}</p>
      <div className={modal.actions}>
        <button type="button" className={controls.link} data-avatar-action="observe" disabled={busy} onClick={() => void perform("observe")}>{copy.observe}</button>
        {phase === "observed" && !snapshot?.pendingFence && !confirming ? <button type="button" className={controls.link} data-avatar-action="prepare-fence"
          disabled={busy || !snapshot?.context?.uploadAllowed} onClick={() => setConfirming(true)}>{copy.prepareFence}</button> : null}
        {snapshot?.pendingFence && !busy ? <button type="button" className={controls.link} data-avatar-action="retry" onClick={() => void perform("retry")}>{copy.retry}</button> : null}
      </div>
      {confirming ? <div className={modal.confirmation}><h4>{copy.confirmTitle}</h4><p>{copy.confirmBody}</p>
        <button type="button" className={controls.link} data-avatar-action="confirm-fence" disabled={busy} onClick={() => void perform("fence")}>{copy.confirmFence}</button></div> : null}
    </section> : null}
        </div>
      </div>
    </dialog>, portal) : null}
  </>;
}
