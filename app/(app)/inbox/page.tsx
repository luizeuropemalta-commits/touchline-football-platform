import Link from "next/link";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TouchlineInboxList } from "@/components/touchline/TouchlineInboxList";
import TouchlineNavigationRail from "@/components/touchline/TouchlineNavigationRail";
import navigationStyles from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "./InboxContent.module.css";
import {
  resolveTouchlineCentralInbox,
  type TouchlineCentralMessage,
} from "@/lib/touchlineArena/central-inbox";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";

type InboxPageProps = { searchParams: Promise<{ lang?: string | string[] }> };
type Row = Record<string, unknown>;

const validCategory = new Set(["MAINTENANCE", "PAYMENT", "CONTRACT", "FUTURE_LEAGUE", "ADMINISTRATIVE"]);
const validPriority = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const validLifecycle = new Set(["COMING_SOON", "PRE_REGISTRATION", "OPEN", "ACTIVE"]);

type TouchlineInboxCopy = Readonly<{
  title: string; subtitle: string; empty: string; unavailable: string; unavailableCopy: string;
  read: string; unread: string; open: string; markRead: string; loading: string; readFailed: string; back: string;
}>;

/** Private Inbox frame only. Message title/body and persisted enums remain server-owned values. */
const TOUCHLINE_INBOX_CATALOGUES = {
  "en-GB": {
    title: "ClubOwner Inbox", subtitle: "Official TouchLine Central notices for your competition.",
    empty: "There are no notices for you right now.", unavailable: "Inbox is unavailable in this environment.",
    unavailableCopy: "The message source has not been prepared in this environment. No notice is simulated.",
    read: "Read", unread: "Unread", open: "Open destination", markRead: "Mark as read", loading: "Loading…", readFailed: "Read status could not be confirmed.", back: "Back to ClubOwner",
  },
  "pt-BR": {
    title: "Inbox do ClubOwner", subtitle: "Comunicados oficiais da TouchLine Central para a sua competição.",
    empty: "Nenhum comunicado para você agora.", unavailable: "O Inbox está indisponível neste ambiente.",
    unavailableCopy: "A fonte de mensagens ainda não foi preparada neste ambiente. Nenhum comunicado é simulado.",
    read: "Lida", unread: "Não lida", open: "Abrir destino", markRead: "Marcar como lida", loading: "Carregando…", readFailed: "Não foi possível confirmar o status de leitura.", back: "Voltar ao ClubOwner",
  },
  "es-ES": {
    title: "Bandeja de entrada de ClubOwner", subtitle: "Avisos oficiales de TouchLine Central para tu competición.",
    empty: "No tienes avisos por ahora.", unavailable: "La bandeja de entrada no está disponible en este entorno.",
    unavailableCopy: "La fuente de mensajes aún no está preparada en este entorno. No se simula ningún aviso.",
    read: "Leído", unread: "Sin leer", open: "Abrir destino", markRead: "Marcar como leído", loading: "Cargando…", readFailed: "No se pudo confirmar el estado de lectura.", back: "Volver a ClubOwner",
  },
  "it-IT": {
    title: "Posta in arrivo di ClubOwner", subtitle: "Avvisi ufficiali di TouchLine Central per la tua competizione.",
    empty: "Non ci sono avvisi per te al momento.", unavailable: "La posta in arrivo non è disponibile in questo ambiente.",
    unavailableCopy: "La fonte dei messaggi non è ancora pronta in questo ambiente. Nessun avviso viene simulato.",
    read: "Letto", unread: "Non letto", open: "Apri destinazione", markRead: "Segna come letto", loading: "Caricamento…", readFailed: "Impossibile confermare lo stato di lettura.", back: "Torna a ClubOwner",
  },
  "fr-FR": {
    title: "Boîte de réception ClubOwner", subtitle: "Messages officiels de TouchLine Central pour votre compétition.",
    empty: "Vous n’avez aucun message pour le moment.", unavailable: "La boîte de réception n’est pas disponible dans cet environnement.",
    unavailableCopy: "La source des messages n’est pas encore prête dans cet environnement. Aucun message n’est simulé.",
    read: "Lu", unread: "Non lu", open: "Ouvrir la destination", markRead: "Marquer comme lu", loading: "Chargement…", readFailed: "Impossible de confirmer l’état de lecture.", back: "Retour à ClubOwner",
  },
  "ar-SA": {
    title: "صندوق وارد ClubOwner", subtitle: "إشعارات TouchLine Central الرسمية لمسابقتك.",
    empty: "لا توجد إشعارات لك الآن.", unavailable: "صندوق الوارد غير متاح في هذه البيئة.",
    unavailableCopy: "مصدر الرسائل غير مهيأ بعد في هذه البيئة. لا تتم محاكاة أي إشعار.",
    read: "مقروء", unread: "غير مقروء", open: "فتح الوجهة", markRead: "وضع علامة مقروء", loading: "جارٍ التحميل…", readFailed: "تعذر تأكيد حالة القراءة.", back: "العودة إلى ClubOwner",
  },
  "tr-TR": {
    title: "ClubOwner Gelen Kutusu", subtitle: "Yarışmanız için resmî TouchLine Central bildirimleri.",
    empty: "Şu anda sizin için bildirim yok.", unavailable: "Gelen kutusu bu ortamda kullanılamıyor.",
    unavailableCopy: "Mesaj kaynağı bu ortamda henüz hazırlanmadı. Hiçbir bildirim taklit edilmez.",
    read: "Okundu", unread: "Okunmadı", open: "Hedefi aç", markRead: "Okundu olarak işaretle", loading: "Yükleniyor…", readFailed: "Okuma durumu doğrulanamadı.", back: "ClubOwner’a dön",
  },
  "de-DE": {
    title: "ClubOwner-Posteingang", subtitle: "Offizielle TouchLine-Central-Mitteilungen für deinen Wettbewerb.",
    empty: "Zurzeit gibt es keine Mitteilungen für dich.", unavailable: "Der Posteingang ist in dieser Umgebung nicht verfügbar.",
    unavailableCopy: "Die Nachrichtenquelle ist in dieser Umgebung noch nicht eingerichtet. Es wird keine Mitteilung simuliert.",
    read: "Gelesen", unread: "Ungelesen", open: "Ziel öffnen", markRead: "Als gelesen markieren", loading: "Wird geladen…", readFailed: "Lesestatus konnte nicht bestätigt werden.", back: "Zurück zu ClubOwner",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineInboxCopy>>;

function getTouchlineInboxCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineInboxCopy {
  return TOUCHLINE_INBOX_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function parseMessage(row: Row): TouchlineCentralMessage | null {
  const id = text(row.id);
  const publication = text(row.publication_status);
  const category = text(row.category);
  const priority = text(row.priority);
  const lifecycleState = text(row.lifecycle_state);
  const scope = text(row.audience_scope);
  const localizations = Array.isArray(row.touchline_central_message_localizations)
    ? row.touchline_central_message_localizations.map((entry) => entry as Row).map((entry) => ({
        locale: text(entry.locale), title: text(entry.title), body: text(entry.body),
        deepLink: text(entry.deep_link) || null,
      })).filter((entry) => entry.locale && entry.title && entry.body)
    : [];
  if (!id || text(row.origin) !== "ADMIN" || !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(publication)
    || !validCategory.has(category) || !validPriority.has(priority) || !validLifecycle.has(lifecycleState)) return null;
  const audience = scope === "GLOBAL"
    ? { kind: "GLOBAL" as const }
    : scope === "COMPETITION" && text(row.competition_key) === "england"
      ? { kind: "COMPETITION" as const, competition: "england" as const }
      : scope === "USER" && text(row.target_user_id)
        ? { kind: "USER" as const, userId: text(row.target_user_id), competition: text(row.competition_key) === "england" ? "england" as const : null }
        : null;
  return audience ? {
    id, origin: "ADMIN", publication: publication as TouchlineCentralMessage["publication"],
    lifecycleState: lifecycleState as TouchlineCentralMessage["lifecycleState"],
    category: category as TouchlineCentralMessage["category"], priority: priority as TouchlineCentralMessage["priority"],
    audience, publishedAt: text(row.published_at) || null, localizations,
  } : null;
}

export default async function TouchlineInboxPage(props: InboxPageProps) {
  return renderTouchlineInboxPage(props, isTouchLineSiteLocalesEnabled("/inbox"));
}

async function renderTouchlineInboxPage({ searchParams }: InboxPageProps, draftLocalesEnabled = false) {
  const query = await searchParams;
  const locale = resolveTouchlineCatalogueLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang, draftLocalesEnabled);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const copy = getTouchlineInboxCopy(locale, draftLocalesEnabled);
  let unavailable = !user || !admin;
  let items: ReturnType<typeof resolveTouchlineCentralInbox> = [];
  if (user && admin) {
    const [messagesResult, receiptsResult] = await Promise.all([
      admin.from("touchline_central_messages").select("id,origin,publication_status,lifecycle_state,category,priority,audience_scope,competition_key,target_user_id,published_at,touchline_central_message_localizations(locale,title,body,deep_link)"),
      admin.from("touchline_central_inbox_receipts").select("message_id,read_at").eq("user_id", user.id),
    ]);
    if (messagesResult.error || receiptsResult.error) unavailable = true;
    else {
      const readAtByMessageId = Object.fromEntries((receiptsResult.data ?? []).map((row) => [String(row.message_id), typeof row.read_at === "string" ? row.read_at : null]));
      items = resolveTouchlineCentralInbox({
        userId: user.id, competition: "england", locale,
        messages: (messagesResult.data ?? []).map((row) => parseMessage(row as Row)).filter((row): row is TouchlineCentralMessage => row !== null),
        readAtByMessageId,
      });
    }
  }
  return <main dir={locale === "ar-SA" ? "rtl" : "ltr"} className={styles.inbox}>
    <header><span>TOUCHLINE CENTRAL</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></header>
    {unavailable ? <section className={styles.state}><h2>{copy.unavailable}</h2><p>{copy.unavailableCopy}</p></section>
      : items.length ? <TouchlineNavigationRail className={styles.listRail}>
        <div className={styles.canvas}>
          <TouchlineInboxList draftLocalesEnabled={draftLocalesEnabled} initialItems={items} locale={locale} labels={copy} />
        </div>
      </TouchlineNavigationRail>
        : <section className={styles.state}><h2>{copy.empty}</h2></section>}
    <Link className={`${navigationStyles.link} ${styles.back}`} href={`/clubowner?lang=${encodeURIComponent(locale)}`}>{locale === "ar-SA" ? "→" : "←"} {copy.back}</Link>
  </main>;
}
