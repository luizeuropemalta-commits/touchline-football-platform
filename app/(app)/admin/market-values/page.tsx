import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, Database, Search, ShieldCheck } from "lucide-react";

import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref, type TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";

export const dynamic = "force-dynamic";

const MARKET_VALUE_ADMIN_READ_TIMEOUT_MS = 8_000;
const MARKET_VALUE_ADMIN_READ_UNAVAILABLE = Symbol("market-value-admin-read-unavailable");

type ValueRow = {
  player_id: string;
  market_value_eur: number | null;
  status: "pending" | "ready" | "verified" | "rejected" | "unavailable";
  confidence: string;
  last_verified: string | null;
  verified_season: string | null;
  football_players: { display_name: string | null; provider_player_id: string | null } | null;
};

function euro(value: number | null, locale: TouchLineAuthLocale) {
  const t = (pt: string, en: string) => locale === "pt-BR" ? pt : en;
  if (value === null) return t("Valor de mercado pendente", "Market Value Pending");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function date(value: string | null, locale: TouchLineAuthLocale) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(locale);
}

export default async function MarketValueAdminPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const t = (pt: string, en: string) => locale === "pt-BR" ? pt : en;
  const statuses: Record<string, string> = { pending: t("Pendente", "Pending"), ready: t("Pronto", "Ready"), verified: t("Verificado", "Verified"), rejected: t("Rejeitado", "Rejected"), unavailable: t("Indisponível", "Unavailable") };
  const confidenceLabels: Record<string, string> = { pending: t("Confiança pendente", "Confidence pending"), reviewed: t("Confiança revisada", "Confidence reviewed"), verified: t("Confiança verificada", "Confidence verified") };
  const term = typeof params.q === "string" ? params.q.trim() : "";
  const supabase = await createClient();
  const admin = createAdminClient();
  const user = supabase
    ? await resolveServerReadWithin(
      supabase.auth.getUser().then(({ data }) => data.user),
      null,
      MARKET_VALUE_ADMIN_READ_TIMEOUT_MS,
    )
    : null;

  if (!user) return <GamePanel className="p-8"><LivePill>{t("Área do proprietário", "Owner area")}</LivePill><h1 className="mt-4 text-4xl font-black italic text-white">{t("Administração de valores de mercado", "Market Value Admin")}</h1><p className="mt-3 text-sm text-slate-400">{t("Entre como proprietário da TouchLine para revisar importações de valores licenciados.", "Sign in as the TouchLine owner to review licensed value imports.")}</p><Link className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black" href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/market-values", locale))}>{t("Entrar", "Sign in")}</Link></GamePanel>;
  if (!isOwnerEmail(user.email)) notFound();
  if (!admin) return <GamePanel className="p-8"><LivePill>{t("Configuração necessária", "Configuration required")}</LivePill><h1 className="mt-4 text-4xl font-black italic text-white">{t("Administração de valores de mercado", "Market Value Admin")}</h1><p className="mt-3 text-sm text-slate-400">{t("O acesso protegido do servidor é necessário para revisar valores.", "The protected server client is required for value review.")}</p></GamePanel>;

  let query = admin
    .from("football_player_market_values")
    .select("player_id,market_value_eur,status,confidence,last_verified,verified_season,football_players!inner(display_name,provider_player_id)")
    .order("last_verified", { ascending: false, nullsFirst: false })
    .limit(100);
  if (term) query = query.ilike("football_players.display_name", `%${term.replace(/[%_]/g, "")}%`);
  const [{ data, error }, { count: pendingCount, error: pendingError }, { count: verifiedCount, error: verifiedError }, { count: itemCount, error: itemError }] = await Promise.all([
    resolveServerReadWithin(
      query.returns<ValueRow[]>().then(({ data, error }): { data: ValueRow[] | null; error: unknown } => ({ data, error })),
      { data: null, error: MARKET_VALUE_ADMIN_READ_UNAVAILABLE },
      MARKET_VALUE_ADMIN_READ_TIMEOUT_MS,
    ),
    resolveServerReadWithin(
      admin.from("football_player_market_values").select("player_id", { count: "exact", head: true }).eq("status", "pending").then(({ count, error }): { count: number | null; error: unknown } => ({ count, error })),
      { count: null, error: MARKET_VALUE_ADMIN_READ_UNAVAILABLE },
      MARKET_VALUE_ADMIN_READ_TIMEOUT_MS,
    ),
    resolveServerReadWithin(
      admin.from("football_player_market_values").select("player_id", { count: "exact", head: true }).eq("status", "verified").then(({ count, error }): { count: number | null; error: unknown } => ({ count, error })),
      { count: null, error: MARKET_VALUE_ADMIN_READ_UNAVAILABLE },
      MARKET_VALUE_ADMIN_READ_TIMEOUT_MS,
    ),
    resolveServerReadWithin(
      admin.from("football_market_value_import_items").select("id", { count: "exact", head: true }).in("status", ["pending", "rejected"]).then(({ count, error }): { count: number | null; error: unknown } => ({ count, error })),
      { count: null, error: MARKET_VALUE_ADMIN_READ_UNAVAILABLE },
      MARKET_VALUE_ADMIN_READ_TIMEOUT_MS,
    ),
  ]);
  const rows = data ?? [];
  const dataReadUnavailable = error === MARKET_VALUE_ADMIN_READ_UNAVAILABLE;

  return <div className="mx-auto max-w-[1400px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><LivePill>{t("Dados administrados pela TouchLine", "TouchLine-owned data")}</LivePill><h1 className="mt-3 text-4xl font-black italic text-white">{t("Administração de valores de mercado", "Market Value Admin")}</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">{t("Consulta de importações licenciadas. Os valores não alteram categorias, borduras, preços nominais dos cards nem contratos ativos durante a temporada.", "Review-only workflow for licensed imports. Values never change card tiers, borders, nominal prices or active contracts during the season.")}</p></div><Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 px-4 py-3 text-xs font-black text-cyan-100">{t("Administração", "Owner Admin")}</Link></div>
    <div className="grid gap-3 md:grid-cols-3"><StatTile icon={CheckCircle2} label={t("Verificados", "Verified")} value={verifiedError ? "—" : String(verifiedCount ?? 0)} delta={t("valores aprovados pela TouchLine", "approved TouchLine values")} accent="lime"/><StatTile icon={Clock3} label={t("Pendentes", "Pending")} value={pendingError ? "—" : String(pendingCount ?? 0)} delta={t("aguardam verificação", "requires verification")} accent="gold"/><StatTile icon={ShieldCheck} label={t("Fila de revisão", "Review queue")} value={itemError ? "—" : String(itemCount ?? 0)} delta={t("pendência de identificação ou importação", "mapping or import issue")} accent="rose"/></div>
    <GamePanel className="p-5"><form className="flex gap-3"><input type="hidden" name="lang" value={locale}/><label className="sr-only" htmlFor="market-search">{t("Buscar jogador", "Search player")}</label><input id="market-search" name="q" defaultValue={term} placeholder={t("Buscar jogador", "Search player")} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"/><button className="inline-flex items-center gap-2 rounded-xl bg-[#a3ff12] px-4 py-3 text-xs font-black text-black"><Search size={14}/>{t("Buscar", "Search")}</button></form><p className="mt-3 text-xs text-slate-400">{t("A importação CSV usa a rota protegida", "CSV import is served by the protected")}<code>/api/admin/market-values/import</code> {t("Para XLSX, é necessário o adaptador de planilhas aprovado e configurado. Esta página não consulta o fornecedor.", "route. XLSX requires the configured approved spreadsheet adapter. No provider is called from this page.")}</p></GamePanel>
    <GamePanel className="overflow-hidden"><div className="border-b border-white/10 p-5"><div className="flex items-center gap-3"><Database className="text-cyan-300" size={18}/><div><h2 className="text-lg font-black italic text-white">{t("Valores aprovados atuais", "Current approved values")}</h2><p className="text-xs text-slate-400">{t("Os perfis públicos usam apenas registros verificados.", "Public profiles consume only records marked verified.")}</p></div></div></div><div className="divide-y divide-white/5">{dataReadUnavailable ? <p className="p-6 text-sm text-amber-100">{t("Os valores estão temporariamente indisponíveis. Nenhum valor editorial ou estado de publicação foi alterado; tente consultar novamente.", "Market values are temporarily unavailable. No editorial value or publication state was changed; retry this protected view.")}</p> : error ? <p className="p-6 text-sm text-rose-200">{t("Não foi possível consultar os valores de mercado. Verifique a configuração e a disponibilidade da base antes de usar esta área.", "Market values could not be read. Check data configuration and availability before using this area.")}</p> : rows.map((row) => <div key={row.player_id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"><div><p className="font-black text-white">{row.football_players?.display_name ?? t("Jogador não identificado", "Unmapped player")}</p><p className="text-xs text-slate-400">{t("Temporada", "Season")} {row.verified_season ?? "—"} · {t("atualizado", "updated")} {date(row.last_verified, locale)}</p></div><p className="text-sm font-black text-white">{row.status === "verified" ? euro(row.market_value_eur, locale) : t("Valor de mercado pendente", "Market Value Pending")}</p><span className={`rounded-lg border px-2 py-1 text-xs font-black ${row.status === "verified" ? "border-[#a3ff12]/30 text-[#caff6d]" : "border-amber-300/30 text-amber-200"}`}>{Object.hasOwn(statuses, row.status) ? statuses[row.status] : row.status}</span><span className="text-xs text-slate-400">{Object.hasOwn(confidenceLabels, row.confidence) ? confidenceLabels[row.confidence] : row.confidence}</span></div>)}{!error && !rows.length ? <p className="p-8 text-center text-sm text-slate-400">{t("Nenhum valor de mercado da TouchLine corresponde à busca.", "No matching TouchLine market values.")}</p> : null}</div></GamePanel>
  </div>;
}
