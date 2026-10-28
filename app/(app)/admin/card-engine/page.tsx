import Link from "next/link";
import { Database, ShieldCheck, Workflow } from "lucide-react";

import { AdminCardEngineConsole } from "@/components/admin-card-engine-console";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";
function unavailable(error: unknown) { return /does not exist|schema cache|Could not find/i.test(String(error ?? "")); }

export default async function CardEnginePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = normalizeTouchLineAuthLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang);
  const pt = locale === "pt-BR";
  const t = (en: string, br: string) => pt ? br : en;
  const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale).format(value);
  const languageNavigation = <nav aria-label={t("Language", "Idioma")} className="mb-4 flex flex-wrap gap-3 text-sm font-bold">
    {(["pt-BR", "en-GB"] as const).map(language => <Link key={language} href={touchLineAuthHref("/admin/card-engine", language)} hrefLang={language} aria-current={locale === language ? "page" : undefined} className="text-[#b7ff45] underline underline-offset-4">{language === "pt-BR" ? "Português" : "English"}</Link>)}
    <Link href={touchLineAuthHref("/admin", locale)} className="text-[#b7ff45] underline underline-offset-4">{t("Back to Admin", "Voltar ao Admin")}</Link>
  </nav>;
  const supabase = await createClient(); const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return <div lang={locale}><GamePanel className="p-8">{languageNavigation}<LivePill>{t("Owner area", "Área do proprietário")}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Card Engine</h1><p className="mt-3 text-sm text-slate-400">{t("Sign in as the TouchLine owner to review protected editorial card decisions.", "Entre como proprietário da TouchLine para revisar as decisões editoriais protegidas dos cards.")}</p><Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/card-engine", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">{t("Sign in", "Entrar")}</Link></GamePanel></div>;
  if (!isOwnerEmail(user.email) || !admin) return <div lang={locale}><GamePanel className="p-8">{languageNavigation}<LivePill>{t("Owner-only", "Exclusivo do proprietário")}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">{t("Card Engine unavailable", "Card Engine indisponível")}</h1></GamePanel></div>;
  const playersResult = await admin.from("football_players").select("id,provider_player_id,display_name,name,football_clubs:current_club_id(name)").eq("provider", "sportmonks").not("current_club_id", "is", null).order("display_name").limit(750);
  const batchesResult = await admin.from("touchline_card_editorial_batches").select("id,status,rows_received,matched_rows,review_rows,conflict_rows,unmatched_rows,created_at").order("created_at", { ascending: false }).limit(30);
  const overridesResult = await admin.from("touchline_card_editorial_overrides").select("id,field_key,status,player_id,effective_value,source_batch_id,approved_at,provenance_status,provisional_reason,last_verification_at,next_verification_at,sources_consulted").order("updated_at", { ascending: false }).limit(100);
  const provisionalCountResult = await admin.from("touchline_card_editorial_overrides").select("id", { count: "exact", head: true }).eq("status", "provisional");
  const migrationReady = !batchesResult.error && !overridesResult.error && !provisionalCountResult.error;
  const playersAvailable = !playersResult.error && playersResult.data !== null;
  const playerOptions = (playersAvailable ? playersResult.data ?? [] : []).map((player) => {
    const club = Array.isArray(player.football_clubs) ? player.football_clubs[0] : player.football_clubs;
    return { id: player.id, providerPlayerId: player.provider_player_id, name: player.display_name || player.name || t("Unnamed player", "Jogador sem nome"), club: club?.name || t("Unassigned club", "Clube não atribuído") };
  }).filter((player) => Boolean(player.providerPlayerId));
  const batches = migrationReady ? batchesResult.data ?? [] : [];
  const overrides = migrationReady ? overridesResult.data ?? [] : [];
  const review = migrationReady ? batches.reduce((count, batch) => count + batch.review_rows + batch.conflict_rows + batch.unmatched_rows, 0) : null;
  const published = migrationReady ? batches.filter((batch) => batch.status === "published").length : null;
  const provisional = provisionalCountResult.error ? null : provisionalCountResult.count;
  const missingSchema = [batchesResult.error, overridesResult.error, provisionalCountResult.error].some(error => unavailable(error?.message));
  return <div lang={locale} className="mx-auto max-w-[1500px] space-y-6">
    <GamePanel className="overflow-hidden p-6 sm:p-8">{languageNavigation}<LivePill>{t("QA only · protected editorial source", "Somente QA · fonte editorial protegida")}</LivePill><h1 className="mt-5 max-w-4xl text-5xl font-black italic leading-[.9] text-white md:text-7xl">TouchLine Card Engine</h1><p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">{t("TouchLine verifies football identity, facts and genuine transfers. TouchLine owns approved card presentation, editorial Market Value, tier calculation and audit provenance. Manual decisions require owner approval; permanent provisional defaults remain explicitly labelled and monitored.", "A TouchLine verifica a identidade, os fatos do futebol e as transferências reais. A TouchLine é responsável pela apresentação aprovada dos cards, pelo valor de mercado editorial, pelo cálculo de tier e pela proveniência auditável. Decisões manuais exigem aprovação do proprietário; padrões provisórios permanentes permanecem identificados e monitorados.")}</p><p className="mt-4 text-xs text-slate-500">{t("Official value → TouchLine override → effective value. Stale or provisional fields are surfaced for review; raw football facts are not editable here.", "Valor oficial → ajuste TouchLine → valor efetivo. Campos desatualizados ou provisórios aparecem para revisão; fatos brutos do futebol não podem ser editados aqui.")}</p></GamePanel>
    <div className="grid gap-4 md:grid-cols-4"><StatTile icon={Database} label={t("Canonical candidates", "Candidatos canônicos")} value={number(playersAvailable ? playerOptions.length : null)} delta={playersAvailable ? t("provider-backed, read only", "fonte do provedor, somente leitura") : t("unavailable", "indisponível")} accent="cyan"/><StatTile icon={Workflow} label={t("Review blockers", "Pendências de revisão")} value={number(review)} delta={migrationReady ? t("conflict / unmatched / manual review", "conflito / sem correspondência / revisão manual") : t("unavailable", "indisponível")} accent={review === null || review ? "rose" : "lime"}/><StatTile icon={Workflow} label={t("Provisional queue", "Fila provisória")} value={number(provisional)} delta={provisional === null ? t("unavailable", "indisponível") : t("monitored, not official", "monitorada, não oficial")} accent={provisional === null || provisional ? "gold" : "lime"}/><StatTile icon={ShieldCheck} label={t("Published batches", "Lotes publicados")} value={number(published)} delta={migrationReady ? t("rollback available", "reversão disponível") : t("unavailable", "indisponível")} accent="gold"/></div>
    {!playersAvailable ? <GamePanel className="p-5 text-sm text-rose-100"><p role="alert">{t("Canonical candidates are unavailable. Reload to check again.", "Os candidatos canônicos estão indisponíveis. Recarregue para verificar novamente.")}</p></GamePanel> : null}
    {!migrationReady ? <GamePanel className="p-5 text-sm text-rose-100"><p role="alert">{missingSchema ? t("Card Engine schema is unavailable in this environment.", "O esquema do Card Engine está indisponível neste ambiente.") : t("Card Engine records are unavailable. Reload to check again.", "Os registros do Card Engine estão indisponíveis. Recarregue para verificar novamente.")}</p></GamePanel> : null}
    <AdminCardEngineConsole locale={locale} players={playerOptions} playersAvailable={playersAvailable} batches={batches} overrides={overrides} migrationReady={migrationReady}/>
  </div>;
}
