"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  touchLineAuthHref,
} from "@/lib/touchlineArena/auth-i18n";
import { Button, Input } from "./ui";

type RecoveryStatus = "checking" | "ready" | "invalid" | "complete";

export function ResetPasswordForm({ locale = "en-GB" }: { locale?: string }) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale);
  const copy = getTouchLineAuthCopy(normalizedLocale).form;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyRecoverySession() {
      const response = await fetch("/api/auth/recovery", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).catch(() => null);
      const payload = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!active) return;
      if (!response?.ok || payload?.ok !== true) {
        setMessage(response?.status === 503 ? copy.authenticationUnavailable : copy.recoveryInvalid);
        setStatus("invalid");
        return;
      }
      setStatus("ready");
    }

    void verifyRecoverySession();
    return () => {
      active = false;
    };
  }, [copy.authenticationUnavailable, copy.recoveryInvalid]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setMessage(copy.recoveryMismatch);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 401) {
          setMessage(copy.recoveryInvalid);
          setStatus("invalid");
          return;
        }
        if (response.status === 503) {
          setMessage(copy.authenticationUnavailable);
          setStatus("invalid");
          return;
        }
        throw new Error(payload?.error || copy.genericError);
      }

      setPassword("");
      setConfirmation("");
      setMessage(copy.recoveryUpdated);
      setStatus("complete");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="mt-8 flex min-h-24 items-center justify-center gap-3 rounded-2xl border border-cyan-200/15 bg-cyan-300/[.05] px-4 text-xs text-slate-300" role="status">
        <Loader2 size={16} className="animate-spin text-[#a3ff12]" />
        {copy.recoveryChecking}
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="mt-8 space-y-4">
        <div className="rounded-xl bg-[#fee8e4] px-4 py-3 text-xs text-[#a5463a]" role="alert">
          {message || copy.recoveryInvalid}
        </div>
        <Link href={touchLineAuthHref("/forgot-password", normalizedLocale)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 text-[10px] font-black text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[.12]">
          {copy.requestNewReset} <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className="mt-8 space-y-4">
        <div className="rounded-xl bg-[#e7f4df] px-4 py-3 text-xs text-[#2a633b]" role="status">
          {message || copy.recoveryUpdated}
        </div>
        <Link href={touchLineAuthHref("/arena", normalizedLocale)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-4 text-xs font-extrabold text-[#071007] transition hover:bg-[#bcff52]">
          {copy.enterArena} <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div className="block">
        <label htmlFor="touchline-reset-password" className="mb-2 block text-xs font-semibold">{copy.newPassword}</label>
        <div className="relative">
          <Input id="touchline-reset-password" required minLength={8} type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={copy.passwordPlaceholder} autoComplete="new-password" className="pr-11" />
          <button type="button" aria-controls="touchline-reset-password" aria-label={show ? copy.hidePassword : copy.showPassword} onClick={() => setShow(!show)} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-[#8b9592] transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3ff12]">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="block">
        <label htmlFor="touchline-reset-password-confirmation" className="mb-2 block text-xs font-semibold">{copy.confirmPassword}</label>
        <Input id="touchline-reset-password-confirmation" required minLength={8} type={show ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={copy.passwordPlaceholder} autoComplete="new-password" />
      </div>
      {message ? <div className="rounded-xl bg-[#fee8e4] px-4 py-3 text-xs text-[#a5463a]" role="alert">{message}</div> : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <>{copy.updatePassword}<ArrowRight size={15} /></>}
      </Button>
    </form>
  );
}
