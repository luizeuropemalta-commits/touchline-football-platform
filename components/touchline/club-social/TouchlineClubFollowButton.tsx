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
        ? (pt ? `${clubName}: preferência salva. Isso não confirma a entrega de alertas.` : `${clubName}: preference saved. This does not confirm alert delivery.`)
        : (pt ? `${clubName}: preferência removida.` : `${clubName}: preference removed.`));
    } catch {
      setState("error");
      setMessage(pt ? "A alteração não foi salva. Tente novamente." : "The change was not saved. Try again.");
    }
  }

  async function requestPushPermission() {
    if (!hasBrowserNotifications() || !payload || state !== "ready") return;
    if (!touchlinePushIsConfigured()) {
      setMessage(pt ? "O envio ao celular ainda não está configurado. Sua preferência está preservada." : "Phone delivery is not configured yet. Your preference is preserved.");
      return;
    }
    setState("saving");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(pt ? "Notificações não permitidas. Sua preferência está preservada." : "Notifications were not permitted. Your preference is preserved.");
        return;
      }
      const registration = await registerTouchlinePushDevice();
      if (registration !== "registered") {
        setMessage(pt ? "O cadastro de notificações não está disponível neste dispositivo." : "Notification registration is unavailable on this device.");
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
      if (!response.ok || body?.ok !== true || typeof body.data?.channels?.push !== "boolean") throw new Error("notification-push-preference-save-failed");
      setPayload(body.data as NotificationPayload);
      setMessage(body.data.channels.push
        ? (pt ? "Dispositivo cadastrado e preferência de push salva. Nenhum alerta foi enviado; a entrega ainda não foi verificada." : "Device registered and push preference saved. No alert was sent; delivery has not been verified.")
        : (pt ? "Dispositivo cadastrado, mas o envio ao celular continua indisponível." : "Device registered, but phone delivery remains unavailable."));
    } catch {
      setMessage(pt ? "Não foi possível confirmar o cadastro e a preferência de notificações. Tente novamente." : "Notification registration and preferences could not be confirmed. Try again.");
    } finally {
      setState("ready");
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
      {enabled && hasBrowserNotifications() && Notification.permission !== "denied" && touchlinePushIsConfigured() ? (
        <button className={styles.pushPermission} disabled={state !== "ready"} onClick={requestPushPermission} type="button">
          <BellRing aria-hidden="true" />
          <span>{pt ? "Cadastrar notificações neste dispositivo" : "Register notifications on this device"}</span>
        </button>
      ) : null}
      {enabled && hasBrowserNotifications() && !touchlinePushIsConfigured() ? (
        <span className={styles.followMessage} role="status">{pt ? "Envio ao celular indisponível. Salvar a preferência não confirma entrega." : "Phone delivery unavailable. Saving a preference does not confirm delivery."}</span>
      ) : null}
      {state === "signed-out" ? <BellOff aria-hidden="true" className={styles.followStateIcon} /> : null}
      {message ? <span className={styles.followMessage} role="status">{message}</span> : null}
    </div>
  );
}
