"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTouchlineArenaShellCopy } from "@/lib/touchlineArena/arena-shell-i18n";
import { touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import styles from "./TouchlineGlobalNavigation.module.css";

export default function TouchlineSignOutButton({ locale, draftLocalesEnabled = false }: {
  locale: string;
  draftLocalesEnabled?: boolean;
}) {
  const copy = getTouchlineArenaShellCopy(locale, draftLocalesEnabled);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const client = createClient();
      if (!client) throw new Error("Authentication unavailable");
      // Only this browser session: preserve the independent Admin session.
      const result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      window.location.replace(touchLineAuthHref("/login", locale, draftLocalesEnabled));
    } catch {
      // Do not leak provider errors or claim that sign-out succeeded.
      setFailed(true);
      setPending(false);
      busy.current = false;
    }
  }

  return <div>
    <button type="button" className={styles.link} onClick={signOut} disabled={pending} aria-busy={pending}>
      <LogOut size={14} aria-hidden="true" />
      {pending ? copy.signingOut : locale === "pt-BR" ? "Sair da conta" : copy.signOut}
    </button>
    {failed ? <p role="alert">{copy.authUnavailable}</p> : null}
  </div>;
}
