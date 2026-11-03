"use client";

import { Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef, useState, type RefObject } from "react";
import { peopleCopy, type PeopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "../a11y/TouchlineDialog";
import ClubOwnerSearch from "./ClubOwnerSearch";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerSearch.module.css";

export default function ClubOwnerSearchTrigger({ locale, compact = false }: { locale: PeopleLocale; compact?: boolean }) {
  const copy = peopleCopy(locale), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <><div className={styles.triggerArea}>
    {!compact ? <h4>{copy.friends}</h4> : null}
    <button ref={trigger} type="button" className={`${controls.link} ${compact ? "" : styles.searchTrigger}`} aria-label={copy.title} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Search size={20} aria-hidden="true" /><span>{compact ? copy.title : copy.query}</span>
    </button>
  </div>{open ? <ClubOwnerSearchDialog locale={locale} returnFocusRef={trigger} onClose={() => setOpen(false)} /> : null}</>;
}

function ClubOwnerSearchDialog({ locale, returnFocusRef, onClose }: { locale: PeopleLocale; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const copy = peopleCopy(locale), input = useRef<HTMLInputElement>(null);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: copy.title, initialFocusRef: input, returnFocusRef, onDismiss: onClose });
  useTouchlineDialogScrollLock(true);
  return createPortal(<div className={styles.overlay}>
    <div {...dialogProps} className={styles.dialog} lang={locale}>
      <header className={styles.heading}><div><small>TOUCHLINE · CLUBOWNERS</small><h2>{copy.friends}</h2></div><button type="button" className={controls.link} onClick={onClose} aria-label={copy.close}><X size={22} aria-hidden="true" /></button></header>
      <ClubOwnerSearch locale={locale} enabled inputRef={input} />
    </div>
  </div>, document.body);
}
