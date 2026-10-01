"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createMarketNotificationConsent, type MarketNotificationPreferences } from "@/lib/touchlineArena/market-notification-consent";
import { registerTouchlinePushDevice, touchlinePushIsConfigured } from "@/lib/touchlineArena/push-device-registration";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";

async function preferencesRequest(value?: MarketNotificationPreferences & { explicitConsent: boolean }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/notifications/preferences", {
      method: value ? "PUT" : "GET", cache: "no-store", signal: controller.signal,
      ...(value ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) } : {}),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true || !body.data?.settings || !body.data?.quietHours
      || typeof body.data?.channels?.push !== "boolean" || typeof body.data?.channels?.email !== "boolean"
      || typeof body.data?.channels?.in_app !== "boolean" || typeof body.data?.frequency !== "string") throw new Error("preferences-unavailable");
    return body.data as MarketNotificationPreferences;
  } finally { clearTimeout(timeout); }
}

export default function TouchlineMarketNotifications({ locale }: { locale: string }) {
  const pt = locale === "pt-BR";
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    const lifecycle = mounted, requests = generation;
    lifecycle.current = true;
    return () => { lifecycle.current = false; requests.current++; };
  }, []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<MarketNotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const run = useMemo(() => createMarketNotificationConsent({
    configured: () => Boolean(touchlinePushIsConfigured()),
    permission: () => typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) ? "unsupported" : Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    register: registerTouchlinePushDevice,
    save: preferencesRequest,
  }), []);

  function close() { generation.current++; setOpen(false); trigger.current?.focus(); }
  async function show() {
    if (busyRef.current) return;
    if (open) { close(); return; }
    setOpen(true); setPreferences(null); setMessage(pt ? "Carregando preferências…" : "Loading preferences…");
    const current = ++generation.current;
    requestAnimationFrame(() => title.current?.focus());
    try {
      const value = await preferencesRequest();
      if (current !== generation.current) return;
      setPreferences(value); setMessage("");
    } catch { if (current === generation.current) setMessage(pt ? "Preferências indisponíveis. Feche e tente novamente." : "Preferences unavailable. Close and try again."); }
  }
  async function act(action: "enable" | "pause") {
    if (!preferences || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const current = ++generation.current;
    setMessage(pt ? "Aguardando confirmação…" : "Waiting for confirmation…");
    const result = await run(preferences, action);
    busyRef.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (current !== generation.current) return;
    if (result.preferences) setPreferences(result.preferences);
    else if (result.state === "partial" || result.state === "failed") setPreferences(null);
    const messages = pt ? {
      saved: action === "pause" ? "Todas as notificações pausadas." : "Cadastro e preferências salvos. Nenhum alerta enviado; entrega ainda não verificada.",
      partial: action === "pause" ? "A pausa de todas as notificações não foi confirmada. Feche e reabra para conferir antes de tentar novamente." : "Cadastro pode estar salvo, mas ativação não confirmada. Nenhum cadastro foi cancelado. Feche e reabra para conferir antes de tentar novamente.",
      denied: "Permissão não concedida. Preferências preservadas. Você pode revisar a permissão nas configurações do navegador.",
      unavailable: "Push não disponível ou não configurado neste dispositivo. Nenhuma preferência alterada.",
      failed: "Não foi possível confirmar a alteração. Feche e reabra para conferir o estado.", busy: "Aguarde a operação atual.",
    } : {
      saved: action === "pause" ? "All notifications paused." : "Registration and preferences saved. No alert sent; delivery has not been verified.",
      partial: action === "pause" ? "Pausing all notifications was not confirmed. Close and reopen to check before retrying." : "Registration may be saved, but activation is unconfirmed. Nothing was cancelled. Close and reopen to check before retrying.",
      denied: "Permission not granted. Preferences preserved. Review permission in your browser settings.",
      unavailable: "Push is unavailable or unconfigured on this device. No preference changed.",
      failed: "The change could not be confirmed. Close and reopen to check its state.", busy: "Wait for the current operation.",
    };
    setMessage(messages[result.state]);
  }
  return <section onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" className={controls.link} aria-expanded={open} aria-controls={id} onClick={() => void show()}><Bell size={18} aria-hidden="true" />{pt ? "Notificações do jogo" : "Game notifications"}</button>
    {open && <section id={id} aria-labelledby={`${id}-title`} className="my-3 rounded-xl border border-white/20 bg-black/80 p-4 text-sm text-white">
      <h2 ref={title} tabIndex={-1} id={`${id}-title`}>{pt ? "Notificações do jogo" : "Game notifications"}</h2>
      <p>{pt ? "Preferências: disponibilidade, escalações oficiais, gols e eventos, partidas selecionadas e liderança. Marketing não faz parte desta ação." : "Preferences: availability, official lineups, goals and events, selected matches and leadership. Marketing is not part of this action."}</p>
      <p>{pt ? "Entrega automática ainda pendente. Gol contra, time incompleto, coroas, Chuteira de Ouro e resumo da rodada ainda não estão disponíveis. Abrir este painel não dá consentimento." : "Automatic delivery is still pending. Own goals, incomplete teams, crowns, Golden Boot and round summaries are not available yet. Opening this panel does not grant consent."}</p>
      <div className="my-3 flex flex-wrap gap-2">
        <button type="button" className={controls.link} disabled={busy || !preferences} onClick={() => void act("enable")}>{pt ? "Autorizar todas as notificações do jogo" : "Allow all game notifications"}</button>
        <button type="button" className={controls.link} disabled={busy || !preferences} onClick={() => void act("pause")}>{pt ? "Desligar todas" : "Turn all off"}</button>
        <a className={controls.link} href={`/notifications?lang=${encodeURIComponent(locale)}`}>{pt ? "Categorias e horários" : "Categories and quiet hours"}</a>
        <button type="button" className={controls.link} onClick={close}>{pt ? "Fechar" : "Close"}</button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
    </section>}
  </section>;
}
