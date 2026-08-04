import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TouchlineInboxList } from "@/components/touchline/TouchlineInboxList";
import {
  resolveTouchlineCentralInbox,
  type TouchlineCentralMessage,
} from "@/lib/touchlineArena/central-inbox";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

type InboxPageProps = { searchParams: Promise<{ lang?: string | string[] }> };
type Row = Record<string, unknown>;

const validCategory = new Set(["MAINTENANCE", "PAYMENT", "CONTRACT", "FUTURE_LEAGUE", "ADMINISTRATIVE"]);
const validPriority = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const validLifecycle = new Set(["COMING_SOON", "PRE_REGISTRATION", "OPEN", "ACTIVE"]);

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

export default async function TouchlineInboxPage({ searchParams }: InboxPageProps) {
  const query = await searchParams;
  const locale = normalizeTouchLineLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang);
  const pt = locale === "pt-BR";
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const copy = pt ? {
    title: "Inbox do ClubOwner", subtitle: "Comunicados oficiais da TouchLine Central para a sua competição.",
    empty: "Nenhum comunicado para você agora.", unavailable: "O Inbox está indisponível neste ambiente.",
    unavailableCopy: "A fonte de mensagens ainda não foi preparada neste ambiente. Nenhum comunicado é simulado.",
    read: "Lida", unread: "Não lida", open: "Abrir destino", markRead: "Marcar como lida", back: "Voltar à Arena",
  } : {
    title: "ClubOwner Inbox", subtitle: "Official TouchLine Central notices for your competition.",
    empty: "There are no notices for you right now.", unavailable: "Inbox is unavailable in this environment.",
    unavailableCopy: "The message source has not been prepared in this environment. No notice is simulated.",
    read: "Read", unread: "Unread", open: "Open destination", markRead: "Mark as read", back: "Back to Arena",
  };
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
  return <main className="inbox"><header><span>TOUCHLINE CENTRAL</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></header>{unavailable ? <section className="state"><h2>{copy.unavailable}</h2><p>{copy.unavailableCopy}</p></section> : items.length ? <TouchlineInboxList initialItems={items} locale={locale} labels={copy} /> : <section className="state"><h2>{copy.empty}</h2></section>}<Link className="back" href={`/arena?lang=${encodeURIComponent(locale)}`}>← {copy.back}</Link><style>{`.inbox{min-height:100%;max-width:980px;margin:auto;padding:28px;color:#efffd5}.inbox header span,.inbox li>div>span{color:#b5ff4b;font-size:10px;font-weight:900;letter-spacing:.12em}.inbox h1{margin:7px 0;font-size:clamp(32px,5vw,58px);letter-spacing:-.055em}.inbox header p,.inbox li p,.state p{color:#b8c9bc;line-height:1.55}.inbox ol{display:grid;gap:12px;padding:0;list-style:none}.inbox li,.state{display:flex;justify-content:space-between;gap:20px;border:1px solid rgba(181,255,75,.19);border-radius:20px;padding:20px;background:#07120e}.inbox li h2{margin:8px 0;font-size:21px}.inbox aside{display:grid;align-content:start;gap:8px;text-align:right}.inbox aside b{color:#b5ff4b;font-size:11px}.inbox aside small{color:#b8c9bc}.inbox a,.inbox button{color:#efffd5;font-weight:800}.inbox button{border:0;background:transparent;padding:0;text-decoration:underline;cursor:pointer}.back{display:inline-block;margin-top:24px}@media(max-width:620px){.inbox li{display:grid}.inbox aside{text-align:left}}`}</style></main>;
}
