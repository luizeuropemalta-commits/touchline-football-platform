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
  onPickerReady?: (open: (() => void) | null) => void; direct?: boolean;
  onRecoveryRequired?: () => void;
  onRefreshRequired: () => void;
};
type SelectionLife = { live: boolean; expires: number; choice: number; locked: boolean; upload: Upload | null; url: string | null; preparation: AbortController | null; timer: ReturnType<typeof setTimeout> | null };

/** Dormant host seam. Preview is local, confirmation is a separate gesture.
 * A sent operation consumes this context even after rejection: no implicit
 * retry/rebase and no preview promoted to an authoritative account photo. */
export default function ClubOwnerAvatarUploadSelection({ context, enabled = false, retentionReady = false,
  visible, locale, draftLocalesEnabled = false, isCurrent, registerUpload, onRefreshRequired, canSelect, recoveryActive = false,
  onPickerReady, direct = false, onRecoveryRequired }: Props) {
  const copy = getTouchlineClubOwnerAvatarSelectionCopy(locale, draftLocalesEnabled), id = useId();
  const life = useRef<SelectionLife | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pickerReady = useRef(onPickerReady);
  const callbacks = useRef({ isCurrent, registerUpload, onRefreshRequired, canSelect, onRecoveryRequired });
  // Publish only committed callbacks: abandoned/concurrent renders must not
  // retarget a pending operation. This layout effect precedes lifetime effects.
  useLayoutEffect(() => {
    callbacks.current = { isCurrent, registerUpload, onRefreshRequired, canSelect, onRecoveryRequired };
  }, [isCurrent, registerUpload, onRefreshRequired, canSelect, onRecoveryRequired]);
  useLayoutEffect(() => { pickerReady.current = onPickerReady; }, [onPickerReady]);
  const [view, setView] = useState<{ url: string | null; phase: "idle" | "preparing" | "preview" | "sending" | "recovery" | "expired" | Exclude<AvatarPreparationError, "cancelled"> }>({ url: null, phase: "idle" });
  const allowed = enabled && retentionReady && context.selectionEnabled && context.retentionReady;
  const current = (value: SelectionLife) => value.live && life.current === value && callbacks.current.isCurrent();
  const fresh = (value: SelectionLife) => current(value) && callbacks.current.canSelect?.() !== false && performance.now() < value.expires;
  function discard(value: SelectionLife) {
    if (value.timer !== null) clearTimeout(value.timer); value.timer = null;
    value.preparation?.abort(); value.preparation = null;
    value.choice += 1; value.upload?.dispose(); value.upload = null;
    callbacks.current.registerUpload(null);
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
  }
  useLayoutEffect(() => {
    if (!allowed) return;
    // The deadline belongs to selected bytes, not time spent browsing the site
    // or in the native file picker. Identity/revision checks remain independent.
    const value: SelectionLife = { live: true, expires: Infinity, choice: 0, locked: false, upload: null, url: null, preparation: null, timer: null };
    life.current = value;
    return () => { value.live = false; discard(value); if (life.current === value) life.current = null; };
  }, [allowed, context.accountId, context.revision, context.generation]);

  useLayoutEffect(() => {
    const value = life.current;
    if (visible || !value || value.locked) return;
    discard(value);
    value.expires = Infinity;
    setView({ url: null, phase: "idle" });
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
    value.expires = performance.now() + CLUB_OWNER_AVATAR_SELECTION_TTL_MS;
    value.timer = setTimeout(() => {
      if (!current(value) || value.choice !== choice) return;
      if (value.locked) {
        if (value.url) URL.revokeObjectURL(value.url); value.url = null;
        setView({ url: null, phase: "recovery" }); return;
      }
      discard(value); value.expires = Infinity; setView({ url: null, phase: "expired" });
    }, CLUB_OWNER_AVATAR_SELECTION_TTL_MS);
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
      // The file choice is the ClubOwner's confirmation; don't ask twice.
      if (direct) void confirm();
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
    else callbacks.current.onRecoveryRequired?.();
  }
  const blocked = recoveryActive || view.phase === "sending" || view.phase === "recovery";
  useLayoutEffect(() => {
    pickerReady.current?.(allowed && !blocked ? () => fileInput.current?.click() : null);
    return () => pickerReady.current?.(null);
  }, [allowed, blocked]);
  if (!allowed) return null;
  const message = view.phase === "idle" ? copy.guidance : view.phase === "preview" ? copy.prepared : copy[view.phase];
  return <section className={styles.selection} hidden={!visible} aria-busy={view.phase === "sending" || view.phase === "preparing"}>
    {onPickerReady ? null : <button type="button" className={controls.link} data-avatar-selection="choose" disabled={blocked} onClick={() => fileInput.current?.click()}>{copy.choose}</button>}
    <input ref={fileInput} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} hidden tabIndex={-1} aria-label={copy.choose}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void choose(file); }} />
    {onPickerReady && !recoveryActive && view.phase !== "idle" && view.phase !== "preview" ? <p role={view.phase === "preparing" || view.phase === "sending" ? "status" : "alert"}>{message}</p> : null}
    {onPickerReady ? null : <><p role="status">{message}</p>
    {view.url ? <img src={view.url} alt={copy.preview} className={styles.preview} /> : null}
    {view.phase === "preview" || view.phase === "preparing" ? <div className={styles.actions}>
      {view.phase === "preview" ? <button className={controls.link} type="button" data-avatar-selection="confirm" onClick={() => void confirm()}>{copy.confirm}</button> : null}
      <button className={controls.link} type="button" data-avatar-selection="cancel" onClick={() => { const value = life.current; if (value && !value.locked) { discard(value); value.expires = Infinity; setView({ url: null, phase: "idle" }); } }}>{copy.cancel}</button>
    </div> : null}</>}
  </section>;
}
