"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  normalizeTouchLineLoginLocale,
  touchLineAuthHref,
} from "@/lib/touchlineArena/auth-i18n";
import { Button, Input } from "./ui";

type RecoveryStatus = "checking" | "ready" | "invalid" | "complete";

// One deadline covers headers and body; cancellation never retries a POST.
async function requestRecovery(init: RequestInit, controller: AbortController) {
  const signal = controller.signal;
  if (signal.aborted) throw new Error("RECOVERY_REQUEST_UNAVAILABLE");
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error("RECOVERY_REQUEST_UNAVAILABLE"));
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await Promise.race([(async () => {
      const response = await fetch("/api/auth/recovery", { ...init, signal });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      return { response, payload };
    })(), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", rejectAbort);
  }
}

export function ResetPasswordForm({ locale = "en-GB", draftLocaleEnabled = false, siteLocalesEnabled = false }: { locale?: string; draftLocaleEnabled?: boolean; siteLocalesEnabled?: boolean }) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale, siteLocalesEnabled);
  const displayLocale = draftLocaleEnabled ? normalizeTouchLineLoginLocale(locale) : normalizedLocale;
  const copy = getTouchLineAuthCopy(displayLocale, draftLocaleEnabled || siteLocalesEnabled).form;
  const retryHref = touchLineAuthHref("/forgot-password", normalizedLocale, siteLocalesEnabled);
  const successHref = touchLineAuthHref("/intro", normalizedLocale, siteLocalesEnabled);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    pendingRequest.current = controller;

    async function verifyRecoverySession() {
      try {
        const { response, payload } = await requestRecovery({
          cache: "no-store",
          headers: { Accept: "application/json" },
        }, controller);
        if (!active || pendingRequest.current !== controller) return;
        if (!response.ok || payload?.ok !== true) {
          const invalid = response.status === 401 || (response.ok && payload?.error === "invalid");
          setMessage(invalid ? copy.recoveryInvalid : copy.authenticationUnavailable);
          setStatus("invalid");
          return;
        }
        setMessage("");
        setStatus("ready");
      } catch {
        if (!active || pendingRequest.current !== controller) return;
        setMessage(copy.authenticationUnavailable);
        setStatus("invalid");
      } finally {
        if (pendingRequest.current === controller) {
          pendingRequest.current = null;
          setLoading(false);
        }
      }
    }

    void verifyRecoverySession();
    return () => {
      active = false;
      controller.abort();
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [copy.authenticationUnavailable, copy.recoveryInvalid]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status !== "ready" || pendingRequest.current) return;
    setMessage("");
    if (password !== confirmation) {
      setMessage(copy.recoveryMismatch);
      return;
    }

    const controller = new AbortController();
    pendingRequest.current = controller;
    setLoading(true);
    try {
      const { response, payload } = await requestRecovery({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      }, controller);
      if (pendingRequest.current !== controller) return;
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
        setMessage(typeof payload?.error === "string" ? payload.error : copy.genericError);
        return;
      }
      if (payload?.ok !== true) {
        setMessage(copy.authenticationUnavailable);
        setStatus("invalid");
        return;
      }

      setPassword("");
      setConfirmation("");
      setMessage(copy.recoveryUpdated);
      setStatus("complete");
    } catch {
      if (pendingRequest.current !== controller) return;
      // A lost/aborted POST may already have committed. Never claim rollback.
      setMessage(copy.authenticationUnavailable);
      setStatus("invalid");
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setLoading(false);
      }
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
        <Link href={retryHref} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 text-[10px] font-black text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[.12]">
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
        <Link href={successHref} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-4 text-xs font-extrabold text-[#071007] transition hover:bg-[#bcff52]">
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
        {loading ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />{copy.updatePassword}</> : <>{copy.updatePassword}<ArrowRight size={15} /></>}
      </Button>
    </form>
  );
}
