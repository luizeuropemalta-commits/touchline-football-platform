"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createClubOwnerAvatarClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { CLUB_OWNER_AVATAR_SELECTION_TTL_MS, inspectClubOwnerAvatarSelection, type ClubOwnerAvatarSelectionContext } from "@/lib/touchlineArena/club-owner-avatar-selection-contract";
import { prepareClubOwnerAvatar, type AvatarPreparationError } from "@/lib/touchlineArena/club-owner-avatar-preparation";
import { getTouchlineClubOwnerAvatarSelectionCopy } from "@/lib/touchlineArena/club-owner-avatar-ui-i18n";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerAvatarControl.module.css";

type Upload = ReturnType<typeof createClubOwnerAvatarClient>;
type Props = {
  context: ClubOwnerAvatarSelectionContext; enabled?: boolean; retentionReady?: boolean;
  visible: boolean; locale: string; draftLocalesEnabled?: boolean;
  isCurrent: () => boolean; registerUpload: (upload: Upload | null) => void;
  canSelect?: () => boolean; recoveryActive?: boolean;
  onRefreshRequired: () => void;
};
type SelectionLife = { live: boolean; expires: number; choice: number; locked: boolean; upload: Upload | null; url: string | null; preparation: AbortController | null };

/** Dormant host seam. Preview is local, confirmation is a separate gesture.
 * A sent operation consumes this context even after rejection: no implicit
 * retry/rebase and no preview promoted to an authoritative account photo. */
export default function ClubOwnerAvatarUploadSelection({ context, enabled = false, retentionReady = false,
  visible, locale, draftLocalesEnabled = false, isCurrent, registerUpload, onRefreshRequired, canSelect, recoveryActive = false }: Props) {
  const copy = getTouchlineClubOwnerAvatarSelectionCopy(locale, draftLocalesEnabled), id = useId();
  const life = useRef<SelectionLife | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const callbacks = useRef({ isCurrent, registerUpload, onRefreshRequired, canSelect });
  // Publish only committed callbacks: abandoned/concurrent renders must not
  // retarget a pending operation. This layout effect precedes lifetime effects.
  useLayoutEffect(() => {
    callbacks.current = { isCurrent, registerUpload, onRefreshRequired, canSelect };
  }, [isCurrent, registerUpload, onRefreshRequired, canSelect]);
  const [view, setView] = useState<{ url: string | null; phase: "idle" | "preparing" | "preview" | "sending" | "recovery" | "expired" | Exclude<AvatarPreparationError, "cancelled"> }>({ url: null, phase: "idle" });
  const allowed = enabled && retentionReady && context.selectionEnabled && context.retentionReady;
  const current = (value: SelectionLife) => value.live && life.current === value && callbacks.current.isCurrent();
  const fresh = (value: SelectionLife) => current(value) && callbacks.current.canSelect?.() !== false && performance.now() < value.expires;
  function discard(value: SelectionLife) {
    value.preparation?.abort(); value.preparation = null;
    value.choice += 1; value.upload?.dispose(); value.upload = null;
    callbacks.current.registerUpload(null);
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
  }
  useLayoutEffect(() => {
    if (!allowed) return;
    const value: SelectionLife = { live: true, expires: performance.now() + CLUB_OWNER_AVATAR_SELECTION_TTL_MS, choice: 0, locked: false, upload: null, url: null, preparation: null };
    life.current = value;
    const retireChoice = () => {
      value.preparation?.abort(); value.preparation = null;
      value.choice += 1; value.upload?.dispose(); value.upload = null; callbacks.current.registerUpload(null);
      if (value.url) URL.revokeObjectURL(value.url); value.url = null;
    };
    const timer = setTimeout(() => {
      if (!value.live || life.current !== value) return;
      // Expiry retires local pixels even if recovery is active or an upload is
      // unresolved. It does not prove rollback or abort a possibly committed send.
      if (value.locked) {
        if (value.url) URL.revokeObjectURL(value.url); value.url = null;
        setView({ url: null, phase: "recovery" }); return;
      }
      retireChoice(); setView({ url: null, phase: "expired" });
    }, CLUB_OWNER_AVATAR_SELECTION_TTL_MS);
    return () => { value.live = false; retireChoice(); clearTimeout(timer); if (life.current === value) life.current = null; };
  }, [allowed, context.accountId, context.revision, context.generation]);

  useLayoutEffect(() => {
    const value = life.current;
    if (visible || !value || value.locked) return;
    value.preparation?.abort(); value.preparation = null;
    value.choice += 1; value.upload?.dispose(); value.upload = null; callbacks.current.registerUpload(null);
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
    setView({ url: null, phase: performance.now() >= value.expires ? "expired" : "idle" });
  }, [visible]);

  useLayoutEffect(() => {
    const value = life.current;
    if (!recoveryActive || !value) return;
    value.preparation?.abort(); value.preparation = null;
    value.choice += 1;
    if (!value.locked) { value.upload?.dispose(); value.upload = null; callbacks.current.registerUpload(null); }
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
    // Retiring selection does not retire the session or lose a pending receipt.
    setView({ url: null, phase: "recovery" });
  }, [recoveryActive]);

  async function choose(file?: File) {
    const value = life.current;
    if (!allowed || !value || !fresh(value) || value.locked || !file) return;
    discard(value); const choice = value.choice;
    const preparation = new AbortController(); value.preparation = preparation;
    setView({ url: null, phase: "preparing" });
    try {
      const prepared = await prepareClubOwnerAvatar(file, preparation.signal);
      if (!fresh(value) || value.choice !== choice || value.locked) return;
      value.preparation = null;
      if (!prepared.ok) { setView({ url: null, phase: prepared.error === "cancelled" ? "idle" : prepared.error }); return; }
      const { bytes, contentType } = prepared;
      const error = inspectClubOwnerAvatarSelection(bytes, contentType);
      if (error) { setView({ url: null, phase: error }); return; }
      value.upload = createClubOwnerAvatarClient({ enabled: true,
        current: { actorId: context.accountId, revision: context.revision, avatarUrl: context.avatarUrl }, baseGeneration: context.generation,
        bytes, contentType, isCurrent: () => current(value), randomUUID: () => crypto.randomUUID(), request: (input, init) => fetch(input, init) });
      if (value.upload.snapshot().phase !== "ready") { discard(value); setView({ url: null, phase: "invalid" }); return; }
      value.url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      callbacks.current.registerUpload(value.upload);
      setView({ url: value.url, phase: "preview" });
    } catch { if (current(value) && value.choice === choice) { discard(value); setView({ url: null, phase: "invalid" }); } }
  }
  async function confirm() {
    const value = life.current;
    if (!allowed || !value || !fresh(value) || value.locked || !value.upload || value.upload.snapshot().phase !== "ready") return;
    value.locked = true; setView({ url: value.url, phase: "sending" });
    const result = await value.upload.send(true);
    if (!current(value)) return;
    setView({ url: value.url, phase: "recovery" });
    if (result === "refresh_required") callbacks.current.onRefreshRequired();
  }
  if (!allowed) return null;
  const blocked = recoveryActive || view.phase === "sending" || view.phase === "recovery" || view.phase === "expired";
  const message = view.phase === "idle" ? copy.guidance : view.phase === "preview" ? copy.prepared : copy[view.phase];
  return <section className={styles.selection} hidden={!visible} aria-busy={view.phase === "sending" || view.phase === "preparing"}>
    <button type="button" className={controls.link} data-avatar-selection="choose" disabled={blocked} onClick={() => fileInput.current?.click()}>{copy.choose}</button>
    <input ref={fileInput} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} hidden tabIndex={-1} aria-label={copy.choose}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void choose(file); }} />
    <p role="status">{message}</p>
    {view.url ? <img src={view.url} alt={copy.preview} className={styles.preview} /> : null}
    {view.phase === "preview" || view.phase === "preparing" ? <div className={styles.actions}>
      {view.phase === "preview" ? <button className={controls.link} type="button" data-avatar-selection="confirm" onClick={() => void confirm()}>{copy.confirm}</button> : null}
      <button className={controls.link} type="button" data-avatar-selection="cancel" onClick={() => { const value = life.current; if (value && !value.locked) { discard(value); setView({ url: null, phase: "idle" }); } }}>{copy.cancel}</button>
    </div> : null}
  </section>;
}
