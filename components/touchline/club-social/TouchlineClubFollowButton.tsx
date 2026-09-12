"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { setTouchlineClubFollow } from "@/lib/touchlineArena/club-follow-preferences";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { registerTouchlinePushDevice, touchlinePushIsConfigured } from "@/lib/touchlineArena/push-device-registration";

import styles from "./TouchlineClubSocialFeed.module.css";

type NotificationPayload = Readonly<{
  settings?: Readonly<{ scopes?: Readonly<{ clubs?: unknown }> }>;
  channels?: Readonly<{ in_app?: boolean; push?: boolean; email?: boolean }>;
  frequency?: string;
  quietHours?: unknown;
  explicitConsentAt?: string | null;
}>;

type State = "loading" | "ready" | "saving" | "signed-out" | "error";

function hasBrowserNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export default function TouchlineClubFollowButton({
  clubId,
  clubName,
  locale,
}: Readonly<{ clubId: string; clubName: string; locale: TouchLineLocale }>) {
  const pt = locale === "pt-BR";
  const [state, setState] = useState<State>("loading");
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [following, setFollowing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/notifications/preferences", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState("signed-out");
          setMessage(pt ? "Entre na sua conta para receber alertas deste clube." : "Sign in to receive this club's alerts.");
          return;
        }
        if (!response.ok || !body?.ok) throw new Error("notification-preferences-unavailable");
        const nextPayload = body.data as NotificationPayload;
        setPayload(nextPayload);
        setFollowing(Array.isArray(nextPayload.settings?.scopes?.clubs) && nextPayload.settings.scopes.clubs.includes(clubId));
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
        setMessage(pt ? "Os alertas não puderam ser carregados agora." : "Alerts could not be loaded right now.");
      });
    return () => { cancelled = true; };
  }, [clubId, pt]);

  async function toggleFollow() {
    if (!payload || state !== "ready") return;
    const nextFollowing = !following;
    const nextClubs = setTouchlineClubFollow(payload.settings?.scopes?.clubs, clubId, nextFollowing);
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...payload.settings,
            scopes: { ...payload.settings?.scopes, clubs: nextClubs },
          },
          // Browser permission is not delivery. Push is only enabled after a
          // VAPID subscription is accepted by the authenticated device route.
          channels: { ...payload.channels, in_app: true, push: Boolean(payload.channels?.push) },
          frequency: payload.frequency,
          quietHours: payload.quietHours,
          explicitConsent: Boolean(payload.explicitConsentAt),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("notification-preferences-save-failed");
      setPayload(body.data as NotificationPayload);
      setFollowing(nextFollowing);
      setState("ready");
      setMessage(nextFollowing
        ? (pt ? `${clubName}: alertas no aplicativo ativados.` : `${clubName}: in-app alerts enabled.`)
        : (pt ? `${clubName}: alertas desativados.` : `${clubName}: alerts disabled.`));
    } catch {
      setState("error");
      setMessage(pt ? "A alteração não foi salva. Tente novamente." : "The change was not saved. Try again.");
    }
  }

  async function requestPushPermission() {
    if (!hasBrowserNotifications() || state !== "ready") return;
    if (!touchlinePushIsConfigured()) {
      setMessage(pt ? "Push remoto ainda não está configurado. Os alertas no aplicativo continuam ativos." : "Remote push is not configured yet. In-app alerts remain active.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage(pt ? "A central do aplicativo continua ativa; o push não foi permitido." : "The in-app centre remains active; push was not permitted.");
      return;
    }
    try {
      const registration = await registerTouchlinePushDevice();
      if (registration !== "registered") {
        setMessage(pt ? "Push remoto ainda não está disponível neste dispositivo. Os alertas no aplicativo continuam ativos." : "Remote push is not available on this device. In-app alerts remain active.");
        return;
      }
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: payload?.settings,
          channels: { ...payload?.channels, in_app: true, push: true },
          frequency: payload?.frequency,
          quietHours: payload?.quietHours,
          explicitConsent: true,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("notification-push-preference-save-failed");
      setPayload(body.data as NotificationPayload);
      setMessage(pt ? "Push ativado neste dispositivo. Nenhum alerta foi enviado agora." : "Push is active on this device. No alert was sent now.");
    } catch {
      setMessage(pt ? "A permissão foi aceita, mas este dispositivo não pôde ser registrado agora." : "Permission was accepted, but this device could not be registered now.");
    }
  }

  const enabled = following && state !== "loading";
  return (
    <div className={styles.followControl}>
      <button
        aria-pressed={enabled}
        className={enabled ? styles.following : ""}
        disabled={state === "loading" || state === "saving" || state === "signed-out"}
        onClick={toggleFollow}
        type="button"
      >
        {enabled ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        <span>{state === "saving" ? (pt ? "Salvando" : "Saving") : enabled ? (pt ? "Seguindo alertas" : "Following alerts") : (pt ? "Seguir alertas" : "Follow alerts")}</span>
      </button>
      {enabled && hasBrowserNotifications() && Notification.permission === "default" && touchlinePushIsConfigured() ? (
        <button className={styles.pushPermission} onClick={requestPushPermission} type="button">
          <BellRing aria-hidden="true" />
          <span>{pt ? "Permitir push" : "Allow push"}</span>
        </button>
      ) : null}
      {enabled && hasBrowserNotifications() && !touchlinePushIsConfigured() ? (
        <span className={styles.followMessage} role="status">{pt ? "Push remoto indisponível; alertas no aplicativo seguem ativos." : "Remote push unavailable; in-app alerts remain active."}</span>
      ) : null}
      {state === "signed-out" ? <BellOff aria-hidden="true" className={styles.followStateIcon} /> : null}
      {message ? <span className={styles.followMessage} role="status">{message}</span> : null}
    </div>
  );
}
