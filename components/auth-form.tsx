"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  normalizeTouchLineAuthReturnTo,
  touchLineAuthEntryHref,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "@/lib/touchlineArena/auth-i18n";
import { resolveTouchLineAuthOrigin } from "@/lib/touchlineArena/public-origin";
import { Button, Input } from "./ui";

type Mode = "login" | "register" | "forgot";
type SocialAuthProvider = "google" | "apple" | "facebook";
type AuthEntryError =
  | "auth_callback"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_disabled"
  | "profile_setup_failed"
  | "session_cookie_failure"
  | "auth_unavailable"
  | null;

function buildTouchLineAuthCallbackUrl(nextHref: string) {
  const callbackUrl = new URL("/auth/callback", resolveTouchLineAuthOrigin({
    currentOrigin: window.location.origin,
    hostname: window.location.hostname,
    configuredOrigin: process.env.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN,
  }));
  callbackUrl.searchParams.set("next", nextHref);
  return callbackUrl.toString();
}

async function finishTouchlineArenaAccess(fallbackError: string) {
  const response = await fetch("/api/touchline-arena/access", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || fallbackError);
  }
}

async function finishTouchlineArenaAccessOrSignOut(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  fallbackError: string,
) {
  try {
    await finishTouchlineArenaAccess(fallbackError);
  } catch (error) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) throw new Error(`${fallbackError} ${signOutError.message}`);
    throw error;
  }
}

export function AuthForm({
  mode,
  locale = "en-GB",
  returnTo,
  initialError = null,
}: {
  mode: Mode;
  locale?: string;
  returnTo?: string;
  initialError?: AuthEntryError;
}) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale);
  const copy = getTouchLineAuthCopy(normalizedLocale).form;
  const normalizedReturnTo = normalizeTouchLineAuthReturnTo(returnTo);
  const arenaHref = touchLinePostAuthHref(normalizedReturnTo, normalizedLocale);
  const publicClubHref = touchLineAuthHref("/touchline-clubs", normalizedLocale);
  const loginHref = touchLineAuthEntryHref("/login", normalizedLocale, normalizedReturnTo);
  const registerHref = touchLineAuthEntryHref("/register", normalizedLocale, normalizedReturnTo);
  const forgotPasswordHref = touchLineAuthEntryHref("/forgot-password", normalizedLocale, normalizedReturnTo);
  const firstEntryHref = normalizedReturnTo
    ? touchLinePostAuthHref(normalizedReturnTo, normalizedLocale)
    // New ClubOwners briefly see the clean Arena, then continue to the
    // acquisition journey. Returning users keep their normal destination.
    : touchLineAuthHref("/arena?skipIntro=1&onboarding=market", normalizedLocale);
  const resetPasswordHref = touchLineAuthHref("/reset-password", normalizedLocale);
  const socialProviders: Array<{
    provider: SocialAuthProvider;
    enabled: boolean;
    label: string;
    mark: string;
    markClassName: string;
  }> = [
    {
      provider: "google",
      enabled: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true",
      label: copy.continueWithGoogle,
      mark: "G",
      markClassName: "text-[#4285f4]",
    },
    {
      provider: "apple",
      enabled: process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true",
      label: copy.continueWithApple,
      mark: "",
      markClassName: "text-white",
    },
    {
      provider: "facebook",
      enabled: process.env.NEXT_PUBLIC_ENABLE_FACEBOOK_AUTH === "true",
      label: copy.continueWithFacebook,
      mark: "f",
      markClassName: "text-[#1877f2]",
    },
  ];
  const enabledSocialProviders = socialProviders.filter(({ enabled }) => enabled);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(null);
  const [isArenaTransitioning, setIsArenaTransitioning] = useState(false);
  const initialMessage = initialError === "auth_callback"
    ? copy.confirmationLinkError
    : initialError === "invalid_credentials"
      ? copy.invalidCredentials
      : initialError === "email_not_confirmed"
        ? copy.emailNotConfirmed
        : initialError === "account_disabled"
          ? copy.accountDisabled
          : initialError === "profile_setup_failed"
            ? copy.profileSetupFailed
            : initialError === "session_cookie_failure"
              ? copy.sessionCookieFailure
              : initialError === "auth_unavailable"
                ? copy.authenticationUnavailable
                : "";
  const [message, setMessage] = useState(initialMessage);
  const [messageTone, setMessageTone] = useState<"success" | "error" | null>(
    initialMessage ? "error" : null,
  );
  const [registrationConfirmationEmail, setRegistrationConfirmationEmail] = useState("");
  const [confirmationResendLoading, setConfirmationResendLoading] = useState(false);
  const [confirmationResendMessage, setConfirmationResendMessage] = useState("");

  async function enterArena(href: string) {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setIsArenaTransitioning(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, reducedMotion ? 40 : 280);
    });
    // A full same-origin navigation is intentional here. It makes the new
    // server-issued Supabase session available before Arena guards run and is
    // more reliable than a client-router transition after Safari AutoFill.
    window.location.assign(href);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Safari Password AutoFill can populate the native inputs without
    // dispatching React's change event. Read the submitted form directly so
    // the authenticated request always uses what the person can see.
    const submittedFields = new FormData(e.currentTarget);
    const submittedEmail = submittedFields.get("email");
    const submittedPassword = submittedFields.get("password");
    const submittedName = submittedFields.get("full_name");
    const normalizedEmail = typeof submittedEmail === "string"
      ? submittedEmail.trim().toLowerCase()
      : email.trim().toLowerCase();
    const effectivePassword = typeof submittedPassword === "string" ? submittedPassword : password;
    const effectiveName = typeof submittedName === "string" ? submittedName : name;
    setLoading(true); setMessage(""); setMessageTone(null);
    const supabase = createClient();
    if (!supabase) {
      setMessage(copy.authenticationUnavailable);
      setMessageTone("error");
      setLoading(false);
      return;
    }
    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: effectivePassword,
          options: {
            data: { full_name: effectiveName },
            emailRedirectTo: buildTouchLineAuthCallbackUrl(firstEntryHref),
          },
        });
        if (error) throw error;
        if (data.session) {
          await finishTouchlineArenaAccessOrSignOut(supabase, copy.welcomeUnavailable);
          await enterArena(firstEntryHref);
        } else {
          setRegistrationConfirmationEmail(normalizedEmail);
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: buildTouchLineAuthCallbackUrl(resetPasswordHref),
        });
        if (error) throw error;
        setMessage(copy.resetSent);
        setMessageTone("success");
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setMessage(
        code === "invalid_credentials"
          ? copy.invalidCredentials
          : code === "email_not_confirmed"
            ? copy.emailNotConfirmed
            : code === "account_disabled"
              ? copy.accountDisabled
              : code === "session_cookie_failure"
                ? copy.sessionCookieFailure
                : code === "profile_setup_failed"
                  ? copy.profileSetupFailed
          : code === "arena_access_unavailable"
            ? copy.welcomeUnavailable
            : code === "auth_unavailable"
              ? copy.authenticationUnavailable
              : copy.genericError,
      );
      setMessageTone("error");
    }
    finally {
      setLoading(false);
    }
  }

  function submitNativeLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setMessageTone(null);
    setLoading(true);
    const form = e.currentTarget;
    // Give React a paint opportunity and a short acknowledgement window so
    // Safari visibly shows "Entrando…" before the document navigation starts.
    window.requestAnimationFrame(() => {
      window.setTimeout(() => form.submit(), 140);
    });
  }

  async function socialLogin(provider: SocialAuthProvider) {
    setMessage("");
    setMessageTone(null);
    setSocialLoading(provider);
    const supabase = createClient();
    if (!supabase) {
      setMessage(copy.authenticationUnavailable);
      setMessageTone("error");
      setSocialLoading(null);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: buildTouchLineAuthCallbackUrl(mode === "register" ? firstEntryHref : arenaHref),
      },
    });
    if (error) {
      setMessage(error.message);
      setMessageTone("error");
    }
    setSocialLoading(null);
  }

  async function resendRegistrationConfirmation() {
    setConfirmationResendLoading(true);
    setConfirmationResendMessage("");
    const supabase = createClient();
    if (!supabase) {
      setConfirmationResendMessage(copy.authenticationUnavailable);
      setConfirmationResendLoading(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: registrationConfirmationEmail,
      options: {
        emailRedirectTo: buildTouchLineAuthCallbackUrl(firstEntryHref),
      },
    });
    setConfirmationResendMessage(error ? copy.confirmationResendFailed : copy.confirmationResent);
    setConfirmationResendLoading(false);
  }

  if (mode === "register" && registrationConfirmationEmail) {
    return (
      <section className="auth-registration-confirmation" aria-live="polite">
        <div className="auth-registration-confirmation__icon" aria-hidden="true">
          <Mail size={26} />
          <span><Check size={12} strokeWidth={3} /></span>
        </div>
        <p className="auth-registration-confirmation__eyebrow">{copy.registrationCompleteEyebrow}</p>
        <h2>{copy.registrationCompleteTitle}</h2>
        <p>{copy.registrationCompleteDescription}</p>
        <strong>{registrationConfirmationEmail}</strong>
        <p className="auth-registration-confirmation__hint">{copy.registrationCompleteHint}</p>
        <Link href={loginHref} className="auth-registration-confirmation__primary">
          {copy.accessAccount} <ArrowRight size={15} />
        </Link>
        <button
          type="button"
          className="auth-registration-confirmation__resend"
          disabled={confirmationResendLoading}
          onClick={resendRegistrationConfirmation}
        >
          {confirmationResendLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Mail size={15} />
          )}
          {copy.resendConfirmation}
        </button>
        {confirmationResendMessage ? (
          <p className="auth-registration-confirmation__resend-message" role="status">
            {confirmationResendMessage}
          </p>
        ) : null}
        <div className="auth-registration-confirmation__alternatives">
          <button
            type="button"
            className="auth-registration-confirmation__secondary"
            onClick={() => {
              setRegistrationConfirmationEmail("");
              setConfirmationResendMessage("");
              setPassword("");
            }}
          >
            {copy.useAnotherEmail}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
    {/* Password login is deliberately a same-origin native POST. Safari follows
        the handler's 303 to a real page with the session cookies intact; it
        never has to render a JSON/API response. Registration and recovery
        remain client-side Supabase flows after hydration. */}
    <form
      action={mode === "login" ? "/login/submit" : undefined}
      method="post"
      onSubmit={mode === "login" ? submitNativeLogin : submit}
      className={mode === "register" ? "mt-5 space-y-3" : "mt-8 space-y-4"}
    >
      {mode === "login" ? <input type="hidden" name="return_to" value={arenaHref} /> : null}
      {mode === "login" ? <input type="hidden" name="locale" value={normalizedLocale} /> : null}
      {mode === "register" && <label className="block"><span className="mb-2 block text-xs font-semibold">{copy.fullName}</span><Input required name="full_name" value={name} onChange={e=>setName(e.target.value)} placeholder={copy.fullNamePlaceholder} autoComplete="name"/></label>}
      <label className="block"><span className="mb-2 block text-xs font-semibold">{copy.email}</span><Input required name="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={copy.emailPlaceholder} autoComplete="email"/></label>
      {mode !== "forgot" && (
        <div className="block">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="touchline-auth-password" className="text-xs font-semibold">{copy.password}</label>
            {mode === "login" && <Link href={forgotPasswordHref} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#8fc7b8] transition hover:text-cyan-100">{copy.forgotPassword}</Link>}
          </div>
          <div className="relative">
            <Input id="touchline-auth-password" required name="password" minLength={8} type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={copy.passwordPlaceholder} autoComplete={mode === "login" ? "current-password" : "new-password"} className="pr-11" />
            <button type="button" aria-controls="touchline-auth-password" aria-label={show ? copy.hidePassword : copy.showPassword} onClick={() => setShow(!show)} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-[#8b9592] transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3ff12]">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
      )}
      {mode === "register" && <label className="flex items-start gap-2 pt-1 text-[10px] leading-4 text-[#73807c]"><input required type="checkbox" className="mt-1 accent-[#153f36]"/><span>{copy.terms}</span></label>}
      {message && <div className={`rounded-xl px-4 py-3 text-xs ${messageTone === "success" ? "bg-[#e7f4df] text-[#2a633b]" : "bg-[#fee8e4] text-[#a5463a]"}`}>{message}</div>}
      <Button type="submit" disabled={loading || isArenaTransitioning} className="w-full">
        {loading || isArenaTransitioning ? (
          <><Loader2 size={16} className="animate-spin"/>{mode === "login" ? copy.signingIn : null}</>
        ) : (
          <>{mode==="login"?copy.signIn:mode==="register"?copy.createAccount:copy.sendReset}<ArrowRight size={15}/></>
        )}
      </Button>
      {mode === "login" && (
        <p className="auth-account-switch">
          <span>{copy.newToTouchLine}</span>
          <Link href={registerHref}>{copy.createAccess}</Link>
        </p>
      )}
      {mode === "register" && (
        <p className="auth-account-switch">
          <span>{copy.alreadyRegistered}</span>
          <Link href={loginHref}>{copy.accessAccount}</Link>
        </p>
      )}
      {mode === "login" && (
        <Link href={publicClubHref} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 text-xs font-black text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[.12]">
          {copy.watchWithoutLogin} <ArrowRight size={15} />
        </Link>
      )}
      {mode !== "forgot" && enabledSocialProviders.length > 0 && (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-[#e3e7e4]"/>
            <span className="text-[10px] text-[#98a19e]">{copy.continueWith}</span>
            <span className="h-px flex-1 bg-[#e3e7e4]"/>
          </div>
          <div className="grid gap-2">
            {enabledSocialProviders.map(({ provider, label, mark, markClassName }) => (
              <Button
                key={provider}
                type="button"
                variant="secondary"
                disabled={socialLoading !== null}
                onClick={() => socialLogin(provider)}
                className="w-full"
              >
                {socialLoading === provider ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <span aria-hidden="true" className={`text-base font-black ${markClassName}`}>{mark}</span>
                )}
                {label}
              </Button>
            ))}
          </div>
        </>
      )}
    </form>
    <div className={`auth-route-transition${isArenaTransitioning ? " is-active" : ""}`} aria-hidden="true" />
    </>
  );
}
