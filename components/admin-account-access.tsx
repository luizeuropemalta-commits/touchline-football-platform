"use client";

import Link from "next/link";
import { ArrowRight, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  normalizeTouchLineAuthLocale,
  touchLineAuthEntryHref,
  touchLinePostAuthHref,
} from "@/lib/touchlineArena/auth-i18n";

export function AdminAccountAccess({
  authorized,
  email,
  locale,
  returnTo,
}: {
  authorized: boolean;
  email: string;
  locale: string;
  returnTo: string;
}) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale);
  const pt = normalizedLocale === "pt-BR";
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function useAnotherAccount() {
    setSigningOut(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError(pt ? "O serviço de autenticação está indisponível." : "Authentication service is unavailable.");
      setSigningOut(false);
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }
    window.location.replace(touchLineAuthEntryHref("/admin/login", normalizedLocale, returnTo));
  }

  return (
    <section className="mt-8 space-y-4" aria-label={pt ? "Conta atual" : "Current account"}>
      <div className={`rounded-2xl border p-4 ${authorized ? "border-[#a3ff12]/20 bg-[#a3ff12]/[.06]" : "border-amber-300/25 bg-amber-300/[.07]"}`}>
        <span className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] ${authorized ? "text-[#baff55]" : "text-amber-200"}`}>
          <ShieldCheck size={15} aria-hidden="true" />
          {authorized
            ? (pt ? "Sessão administrativa ativa" : "Active administrator session")
            : (pt ? "Conta sem permissão administrativa" : "Account without administrator permission")}
        </span>
        <strong className="mt-3 block truncate text-sm text-white">{email}</strong>
      </div>
      {authorized ? (
        <Link
          href={touchLinePostAuthHref(returnTo, normalizedLocale, "/admin")}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-xs font-black text-[#061006] transition hover:bg-[#b8ff45]"
        >
          {pt ? "Continuar para o Admin" : "Continue to Admin"} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      ) : (
        <p className="rounded-xl border border-amber-300/15 bg-black/20 px-4 py-3 text-xs leading-5 text-amber-100">
          {pt
            ? "Esta sessão está autenticada, mas não pode acessar o painel administrativo. Use a conta OWNER autorizada."
            : "This session is authenticated but cannot access the administrator panel. Use the authorised OWNER account."}
        </p>
      )}
      <button
        type="button"
        onClick={useAnotherAccount}
        disabled={signingOut}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.035] px-4 text-xs font-black text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-300/[.08] disabled:cursor-wait disabled:opacity-60"
      >
        {signingOut ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <LogOut size={15} aria-hidden="true" />}
        {signingOut
          ? (pt ? "Encerrando sessão…" : "Signing out…")
          : (pt ? "Sair e usar outra conta" : "Sign out and use another account")}
      </button>
      {error ? <p className="rounded-xl bg-rose-300/10 px-4 py-3 text-xs text-rose-100" role="alert">{error}</p> : null}
    </section>
  );
}
