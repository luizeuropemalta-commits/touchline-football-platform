"use client";

import { useState } from "react";

import type { TouchlineCentralInboxItem } from "@/lib/touchlineArena/central-inbox";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";

type InboxEnumLabels = Readonly<Record<"LOW" | "NORMAL" | "HIGH" | "CRITICAL" | "MAINTENANCE" | "PAYMENT" | "CONTRACT" | "FUTURE_LEAGUE" | "ADMINISTRATIVE" | "COMING_SOON" | "PRE_REGISTRATION" | "OPEN" | "ACTIVE", string>>;

const INBOX_ENUM_LABELS = {
  "en-GB": { LOW: "Low", NORMAL: "Normal", HIGH: "High", CRITICAL: "Critical", MAINTENANCE: "Maintenance", PAYMENT: "Payment", CONTRACT: "Contract", FUTURE_LEAGUE: "Future league", ADMINISTRATIVE: "Administrative", COMING_SOON: "Coming soon", PRE_REGISTRATION: "Pre-registration", OPEN: "Open", ACTIVE: "Active" },
  "pt-BR": { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", CRITICAL: "Crítica", MAINTENANCE: "Manutenção", PAYMENT: "Pagamento", CONTRACT: "Contrato", FUTURE_LEAGUE: "Liga futura", ADMINISTRATIVE: "Administrativo", COMING_SOON: "Em breve", PRE_REGISTRATION: "Pré-inscrição", OPEN: "Aberta", ACTIVE: "Ativa" },
  "es-ES": { LOW: "Baja", NORMAL: "Normal", HIGH: "Alta", CRITICAL: "Crítica", MAINTENANCE: "Mantenimiento", PAYMENT: "Pago", CONTRACT: "Contrato", FUTURE_LEAGUE: "Liga futura", ADMINISTRATIVE: "Administrativo", COMING_SOON: "Próximamente", PRE_REGISTRATION: "Preinscripción", OPEN: "Abierta", ACTIVE: "Activa" },
  "it-IT": { LOW: "Bassa", NORMAL: "Normale", HIGH: "Alta", CRITICAL: "Critica", MAINTENANCE: "Manutenzione", PAYMENT: "Pagamento", CONTRACT: "Contratto", FUTURE_LEAGUE: "Lega futura", ADMINISTRATIVE: "Amministrativo", COMING_SOON: "Prossimamente", PRE_REGISTRATION: "Pre-registrazione", OPEN: "Aperta", ACTIVE: "Attiva" },
  "fr-FR": { LOW: "Faible", NORMAL: "Normale", HIGH: "Élevée", CRITICAL: "Critique", MAINTENANCE: "Maintenance", PAYMENT: "Paiement", CONTRACT: "Contrat", FUTURE_LEAGUE: "Ligue à venir", ADMINISTRATIVE: "Administratif", COMING_SOON: "Bientôt", PRE_REGISTRATION: "Préinscription", OPEN: "Ouverte", ACTIVE: "Active" },
  "ar-SA": { LOW: "منخفضة", NORMAL: "عادية", HIGH: "عالية", CRITICAL: "حرجة", MAINTENANCE: "صيانة", PAYMENT: "دفع", CONTRACT: "عقد", FUTURE_LEAGUE: "دوري قادم", ADMINISTRATIVE: "إداري", COMING_SOON: "قريبًا", PRE_REGISTRATION: "تسجيل مسبق", OPEN: "مفتوحة", ACTIVE: "نشطة" },
  "tr-TR": { LOW: "Düşük", NORMAL: "Normal", HIGH: "Yüksek", CRITICAL: "Kritik", MAINTENANCE: "Bakım", PAYMENT: "Ödeme", CONTRACT: "Sözleşme", FUTURE_LEAGUE: "Gelecek lig", ADMINISTRATIVE: "İdari", COMING_SOON: "Yakında", PRE_REGISTRATION: "Ön kayıt", OPEN: "Açık", ACTIVE: "Etkin" },
  "de-DE": { LOW: "Niedrig", NORMAL: "Normal", HIGH: "Hoch", CRITICAL: "Kritisch", MAINTENANCE: "Wartung", PAYMENT: "Zahlung", CONTRACT: "Vertrag", FUTURE_LEAGUE: "Künftige Liga", ADMINISTRATIVE: "Verwaltung", COMING_SOON: "Demnächst", PRE_REGISTRATION: "Vorregistrierung", OPEN: "Offen", ACTIVE: "Aktiv" },
} as const satisfies Readonly<Record<TouchLineLocale, InboxEnumLabels>>;

function visibleInboxEnum(value: string, locale: string, draftLocalesEnabled = false) {
  const labels: InboxEnumLabels = INBOX_ENUM_LABELS[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  return Object.hasOwn(labels, value) ? labels[value as keyof InboxEnumLabels] : value;
}

export function TouchlineInboxList({
  initialItems,
  locale,
  labels,
  draftLocalesEnabled = false,
}: {
  initialItems: readonly TouchlineCentralInboxItem[];
  locale: string;
  draftLocalesEnabled?: boolean;
  labels: { read: string; unread: string; open: string; markRead: string; loading: string; readFailed: string };
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [readFailure, setReadFailure] = useState(false);

  async function markRead(messageId: string): Promise<boolean> {
    const item = items.find((candidate) => candidate.id === messageId);
    if (!item || item.readAt) return true;
    setPendingMessageId(messageId); setReadFailure(false);
    const response = await fetch("/api/touchline-central/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
    setPendingMessageId((current) => current === messageId ? null : current);
    if (!response?.ok) { setReadFailure(true); return false; }
    const readAt = new Date().toISOString();
    setItems((current) => current.map((candidate) => candidate.id === messageId ? { ...candidate, readAt } : candidate));
    return true;
  }

  async function openDestination(item: TouchlineCentralInboxItem) {
    if (!item.deepLink) return;
    // Wait for the server-owned receipt before leaving this page. A Link click
    // can cancel an in-flight POST during navigation and lose the durable read.
    await markRead(item.id);
    const destination = new URL(item.deepLink, window.location.origin);
    destination.searchParams.set("lang", locale);
    window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
  }

  return <><p aria-live="polite" role="status">{readFailure ? labels.readFailed : ""}</p><ol>{items.map((item) => <li key={item.id}><div><span>{visibleInboxEnum(item.priority, locale, draftLocalesEnabled)} · {visibleInboxEnum(item.category, locale, draftLocalesEnabled)}</span><h2>{item.title}</h2><p>{item.body}</p></div><aside><b>{item.readAt ? labels.read : labels.unread}</b><small>{visibleInboxEnum(item.lifecycleState, locale, draftLocalesEnabled)}</small>{item.deepLink ? <button type="button" disabled={pendingMessageId === item.id} onClick={() => void openDestination(item)}>{pendingMessageId === item.id ? labels.loading : labels.open}</button> : !item.readAt ? <button type="button" disabled={pendingMessageId === item.id} onClick={() => void markRead(item.id)}>{pendingMessageId === item.id ? labels.loading : labels.markRead}</button> : null}</aside></li>)}</ol></>;
}
