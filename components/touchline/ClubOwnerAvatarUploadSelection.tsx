"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createClubOwnerAvatarClient } from "@/lib/touchlineArena/club-owner-avatar-client";
import { CLUB_OWNER_AVATAR_SELECTION_TTL_MS, inspectClubOwnerAvatarSelection, type ClubOwnerAvatarSelectionContext } from "@/lib/touchlineArena/club-owner-avatar-selection-contract";
import { getTouchlineClubOwnerAvatarSelectionCopy } from "@/lib/touchlineArena/club-owner-avatar-ui-i18n";
import controls from "./TouchlineGlobalNavigation.module.css";

type Upload = ReturnType<typeof createClubOwnerAvatarClient>;
type Props = {
  context: ClubOwnerAvatarSelectionContext; enabled?: boolean; retentionReady?: boolean;
  visible: boolean; locale: string; draftLocalesEnabled?: boolean;
  isCurrent: () => boolean; registerUpload: (upload: Upload | null) => void;
  canSelect?: () => boolean; recoveryActive?: boolean;
  onRefreshRequired: () => void;
};
type SelectionLife = { live: boolean; expires: number; choice: number; locked: boolean; upload: Upload | null; url: string | null };

/** Dormant host seam. Preview is local, confirmation is a separate gesture.
 * A sent operation consumes this context even after rejection: no implicit
 * retry/rebase and no preview promoted to an authoritative account photo. */
export default function ClubOwnerAvatarUploadSelection({ context, enabled = false, retentionReady = false,
  visible, locale, draftLocalesEnabled = false, isCurrent, registerUpload, onRefreshRequired, canSelect, recoveryActive = false }: Props) {
  const copy = getTouchlineClubOwnerAvatarSelectionCopy(locale, draftLocalesEnabled), id = useId();
  const life = useRef<SelectionLife | null>(null);
  const callbacks = useRef({ isCurrent, registerUpload, onRefreshRequired, canSelect });
  // Publish only committed callbacks: abandoned/concurrent renders must not
  // retarget a pending operation. This layout effect precedes lifetime effects.
  useLayoutEffect(() => {
    callbacks.current = { isCurrent, registerUpload, onRefreshRequired, canSelect };
  }, [isCurrent, registerUpload, onRefreshRequired, canSelect]);
  const [view, setView] = useState<{ url: string | null; phase: "idle" | "preview" | "sending" | "recovery" | "expired" | "heic" | "invalid" }>({ url: null, phase: "idle" });
  const allowed = enabled && retentionReady && context.selectionEnabled && context.retentionReady;
  const current = (value: SelectionLife) => value.live && life.current === value && callbacks.current.isCurrent();
  const fresh = (value: SelectionLife) => current(value) && callbacks.current.canSelect?.() !== false && performance.now() < value.expires;
  function discard(value: SelectionLife) {
    value.choice += 1; value.upload?.dispose(); value.upload = null;
    callbacks.current.registerUpload(null);
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
  }
  useLayoutEffect(() => {
    if (!allowed) return;
    const value: SelectionLife = { live: true, expires: performance.now() + CLUB_OWNER_AVATAR_SELECTION_TTL_MS, choice: 0, locked: false, upload: null, url: null };
    life.current = value;
    const retireChoice = () => {
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
    value.choice += 1; value.upload?.dispose(); value.upload = null; callbacks.current.registerUpload(null);
    if (value.url) URL.revokeObjectURL(value.url); value.url = null;
    setView({ url: null, phase: performance.now() >= value.expires ? "expired" : "idle" });
  }, [visible]);

  useLayoutEffect(() => {
    const value = life.current;
    if (!recoveryActive || !value) return;
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
    setView({ url: null, phase: "idle" });
    if (file.size > 4_000_000 || !file.size) { setView({ url: null, phase: "invalid" }); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!fresh(value) || value.choice !== choice || value.locked) return;
      const error = inspectClubOwnerAvatarSelection(bytes, file.type);
      if (error) { setView({ url: null, phase: error }); return; }
      value.upload = createClubOwnerAvatarClient({ enabled: true,
        current: { actorId: context.accountId, revision: context.revision, avatarUrl: context.avatarUrl }, baseGeneration: context.generation,
        bytes, contentType: file.type, isCurrent: () => current(value), randomUUID: () => crypto.randomUUID(), request: (input, init) => fetch(input, init) });
      if (value.upload.snapshot().phase !== "ready") { discard(value); setView({ url: null, phase: "invalid" }); return; }
      value.url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
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
  return <section hidden={!visible} aria-busy={view.phase === "sending"}>
    <label htmlFor={id}>{copy.choose}</label>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void choose(file); }} />
    <p role="status">{view.phase === "heic" ? copy.heic : view.phase === "recovery" ? copy.recovery : view.phase === "sending" ? copy.sending : view.phase === "expired" ? copy.expired : copy.guidance}</p>
    {view.url ? <img src={view.url} alt={copy.preview} width={128} height={128} /> : null}
    {view.phase === "preview" ? <>
      <button className={controls.link} type="button" onClick={() => void confirm()}>{copy.confirm}</button>
      <button className={controls.link} type="button" onClick={() => { const value = life.current; if (value && !value.locked) { discard(value); setView({ url: null, phase: "idle" }); } }}>{copy.cancel}</button>
    </> : null}
  </section>;
}
