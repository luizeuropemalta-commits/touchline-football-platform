import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Clock3, MonitorSmartphone, Radio, Trophy, Users } from "lucide-react";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type SessionRow = { user_id: string; active_seconds: number; started_at: string; last_seen_at: string; current_area: string; device_class: string };
type GrantRow = { user_id: string; slot_number: number; amount_tc: number; granted_at: string };

function minutes(seconds: number) { return Math.round(seconds / 60); }

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const pt = locale === "pt-BR";
  const t = { pill: pt ? "Telemetria própria" : "First-party telemetry", title: pt ? "Atividade dos ClubOwners" : "ClubOwner Activity", intro: pt ? "Tempo de jogo ativo e áreas de recurso. A TouchLine não registra senhas, mensagens, texto digitado ou conteúdo da tela." : "Active gameplay time and feature areas only. TouchLine does not record passwords, messages, typed text or screen contents.", admin: pt ? "Admin do proprietário" : "Owner Admin", active: pt ? "Ativos agora" : "Active now", daily: pt ? "Ativos no dia" : "Daily active", activeTime: pt ? "Tempo ativo" : "Active time", sessions: pt ? "Sessões" : "Sessions", grants: pt ? "Concessões antigas" : "Legacy grants", devices: pt ? "Dispositivos" : "Devices", engagement: pt ? "Ranking de envolvimento" : "Engagement ranking", mostActive: pt ? "ClubOwners mais ativos" : "Most active ClubOwners", authOnly: pt ? "Somente jogo autenticado" : "Authenticated gameplay only", noLeaders: pt ? "A atividade aparecerá após jogadores autenticados usarem a Beta." : "Activity will appear after authenticated players use the Beta.", interest: pt ? "Interesse por recurso" : "Feature interest", areas: pt ? "Onde os jogadores passam tempo" : "Where players spend time", noAreas: pt ? "Nenhuma atividade coletada ainda." : "No activity collected yet.", retired: pt ? "Campanha de acesso encerrada" : "Retired access campaign", retiredCopy: pt ? "Concessões históricas ficam visíveis apenas para auditoria. Novos ClubOwners recebem acesso à Arena com 0 TC automático." : "Historical grants remain visible for audit only. New ClubOwners receive Arena access with 0 automatic TC." };
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return <GamePanel className="p-8 text-white">{locale === "pt-BR" ? "A análise exige configuração do Supabase." : "Analytics requires Supabase configuration."}</GamePanel>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isOwnerEmail(user.email)) notFound();

  // Server dashboard timestamps intentionally represent the request instant.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const since = new Date(requestTime - 30 * 86400_000).toISOString();
  let queryFailure = false;
  let sessionsData: SessionRow[] | null = null;
  let grantsData: GrantRow[] | null = null;
  let authResult: { data: { users: Array<{ id: string; email?: string | null }> } } = { data: { users: [] } };
  try {
    const [sessionsResult, grantsResult, usersResult] = await Promise.all([
      admin.from("touchline_analytics_sessions").select("user_id,active_seconds,started_at,last_seen_at,current_area,device_class").gte("last_seen_at", since).order("last_seen_at", { ascending: false }).limit(10000),
      admin.from("touchline_beta_tc_grants").select("user_id,slot_number,amount_tc,granted_at").order("slot_number").limit(20),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    queryFailure = Boolean(sessionsResult.error || grantsResult.error || usersResult.error);
    sessionsData = (sessionsResult.data ?? null) as SessionRow[] | null;
    grantsData = (grantsResult.data ?? null) as GrantRow[] | null;
    authResult = usersResult as typeof authResult;
  } catch {
    queryFailure = true;
  }
  if (queryFailure) return <GamePanel className="p-8 text-white">{pt ? "A análise está temporariamente indisponível. Tente novamente mais tarde; nenhuma alteração foi feita." : "Analytics is temporarily unavailable. Try again later; no changes were made."}</GamePanel>;
  const sessions = (sessionsData ?? []) as SessionRow[];
  const grants = (grantsData ?? []) as GrantRow[];
  const emails = new Map((authResult.data.users ?? []).map((item) => [item.id, item.email ?? "ClubOwner"]));
  const now = requestTime;
  const online = new Set(sessions.filter((item) => now - new Date(item.last_seen_at).getTime() <= 120_000).map((item) => item.user_id)).size;
  const daily = new Set(sessions.filter((item) => now - new Date(item.last_seen_at).getTime() <= 86400_000).map((item) => item.user_id)).size;
  const totalSeconds = sessions.reduce((sum, item) => sum + Number(item.active_seconds || 0), 0);
  const userTotals = new Map<string, number>();
  const areaTotals = new Map<string, { seconds: number; visits: number }>();
  const deviceTotals = new Map<string, number>();
  sessions.forEach((item) => {
    userTotals.set(item.user_id, (userTotals.get(item.user_id) ?? 0) + Number(item.active_seconds || 0));
    const area = areaTotals.get(item.current_area) ?? { seconds: 0, visits: 0 };
    area.seconds += Number(item.active_seconds || 0); area.visits += 1; areaTotals.set(item.current_area, area);
    deviceTotals.set(item.device_class, (deviceTotals.get(item.device_class) ?? 0) + 1);
  });
  const leaders = [...userTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const areas = [...areaTotals.entries()].sort((a, b) => b[1].seconds - a[1].seconds);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><LivePill>{t.pill}</LivePill><h1 className="font-display mt-3 text-4xl italic text-white sm:text-5xl">{t.title}</h1><p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">{t.intro}</p></div>
        <Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 py-3 text-[9px] font-black text-cyan-100">{t.admin}</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile icon={Radio} label={t.active} value={String(online)} delta={pt ? "últimos 2 min" : "last 2 min"} accent="lime" />
        <StatTile icon={Users} label={t.daily} value={String(daily)} delta={pt ? "últimas 24h" : "last 24h"} accent="cyan" />
        <StatTile icon={Clock3} label={t.activeTime} value={`${Math.round(totalSeconds / 3600)}h`} delta={pt ? "últimos 30 dias" : "last 30 days"} accent="gold" />
        <StatTile icon={Activity} label={t.sessions} value={String(sessions.length)} delta={pt ? "últimos 30 dias" : "last 30 days"} accent="cyan" />
        <StatTile icon={Trophy} label={t.grants} value={String(grants.length)} delta={pt ? "somente histórico" : "historical only"} accent="gold" />
        <StatTile icon={MonitorSmartphone} label={t.devices} value={String(deviceTotals.size)} delta={pt ? "classes detectadas" : "classes detected"} accent="lime" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5"><p className="text-[9px] font-black text-[#a3ff12]">{t.engagement}</p><h2 className="mt-1 text-xl font-black italic text-white">{t.mostActive}</h2></div>
          <div className="divide-y divide-white/[.06]">{leaders.map(([id, seconds], index) => <div key={id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 p-4"><span className="font-display text-xl text-[#a3ff12]">#{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-black text-white">{emails.get(id) ?? "ClubOwner"}</p><p className="mt-1 text-[8px] text-slate-600">{t.authOnly}</p></div><strong className="text-sm text-cyan-100">{minutes(seconds)} min</strong></div>)}{!leaders.length && <p className="p-8 text-center text-xs text-slate-500">{t.noLeaders}</p>}</div>
        </GamePanel>
        <GamePanel className="p-5"><p className="text-[9px] font-black text-cyan-300">{t.interest}</p><h2 className="mt-1 text-xl font-black italic text-white">{t.areas}</h2><div className="mt-5 space-y-3">{areas.map(([area, value]) => { const width = totalSeconds ? Math.max(4, Math.round(value.seconds / totalSeconds * 100)) : 0; return <div key={area}><div className="flex justify-between text-[10px]"><span className="font-black text-white">{area}</span><span className="text-slate-500">{minutes(value.seconds)} min · {value.visits} {pt ? "sessões" : "sessions"}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#a3ff12]" style={{ width: `${width}%` }} /></div></div>; })}{!areas.length && <p className="text-xs text-slate-500">{t.noAreas}</p>}</div><div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[.05] p-4"><p className="text-[9px] font-black text-amber-200">{t.retired}</p><p className="mt-2 text-[10px] leading-5 text-slate-500">{t.retiredCopy}</p></div></GamePanel>
      </div>
    </div>
  );
}
