"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { getTouchLineDiscoveryRegistrationCopy } from "@/lib/touchlineArena/auth-i18n";
import { parseOwnPublicOwner, peopleCopy, publicOwnerName, type PeopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "../a11y/TouchlineDialog";
import { usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerSearch.module.css";
import profileStyles from "./ClubOwnerPublic.module.css";

/** Mount only after a successful self-scoped read confirmed no profile exists. */
export default function ClubOwnerDiscoveryOnboarding({locale}:{locale:PeopleLocale}) {
  const [open,setOpen]=useState(false);
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)setOpen(true);});return()=>{active=false;};},[]);
  return open ? <FirstAccessDialog locale={locale} onClose={()=>setOpen(false)} /> : null;
}
function FirstAccessDialog({locale,onClose}:{locale:PeopleLocale;onClose:()=>void}) {
  const copy=getTouchLineDiscoveryRegistrationCopy(locale),social=peopleCopy(locale),router=useRouter(),io=usePublicOwnersRequest();
  const input=useRef<HTMLInputElement>(null),lock=useRef(false);
  const [name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<"invalid"|"writeError"|null>(null);
  const title=locale==="pt-BR"?"Como seus amigos vão encontrar você?":"How will your friends find you?";
  const {dialogProps}=useTouchlineDialog<HTMLDivElement>({open:true,label:title,initialFocusRef:input,onDismiss:()=>{if(!lock.current)onClose();}});
  useTouchlineDialogScrollLock(true);
  const finish=()=>{onClose();router.refresh();};
  async function save(event:FormEvent) {
    event.preventDefault();if(lock.current||error==="writeError")return;
    const displayName=name.trim();if(!publicOwnerName(displayName)){setError("invalid");return;}
    lock.current=true;setBusy(true);setError(null);
    try {
      const result=await io.request("/api/account/public-profile/onboarding",{displayName,intentVersion:1});
      if(!parseOwnPublicOwner(result.profile))throw new Error("MISSING_PROFILE");
      if(io.alive())finish();
    } catch {if(io.alive())setError("writeError");}
    finally {lock.current=false;if(io.alive())setBusy(false);}
  }
  async function reconcile() {
    if(lock.current)return;lock.current=true;setBusy(true);
    try {const result=await io.request("/api/account/public-profile");const profile=parseOwnPublicOwner(result.profile);
      if(io.alive()){if(profile)finish();else setError(null);}
    } catch {if(io.alive())setError("writeError");}
    finally {lock.current=false;if(io.alive())setBusy(false);}
  }
  return createPortal(<div className={styles.overlay}><div {...dialogProps} className={styles.dialog} lang={locale}>
    <header className={styles.heading}><div><small>TOUCHLINE · CLUBOWNER</small><h2>{title}</h2></div><button className={controls.link} type="button" onClick={onClose} disabled={busy} aria-label={social.close}><X size={22} aria-hidden="true" /></button></header>
    <form className={profileStyles.form} onSubmit={save}>
      <label htmlFor="first-access-public-name">{copy.label}</label>
      <div className={styles.inputShell}><input ref={input} id="first-access-public-name" value={name} onChange={event=>setName(event.target.value)} required minLength={2} maxLength={60} autoComplete="nickname" aria-describedby="first-access-disclosure" disabled={busy} /></div>
      <p id="first-access-disclosure">{copy.notice}</p>
      <button className={controls.link} type="submit" disabled={busy||error==="writeError"}>{busy?social.saving:locale==="pt-BR"?"Salvar e aparecer na busca":"Save and appear in search"}</button>
      {error?<p role="alert">{error==="invalid"?copy.invalid:social.writeError}</p>:null}
      {error==="writeError"?<button className={controls.link} type="button" onClick={reconcile} disabled={busy}>{social.retry}</button>:null}
    </form>
  </div></div>,document.body);
}
