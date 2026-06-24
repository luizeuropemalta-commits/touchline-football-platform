import Link from "next/link";
import { notFound } from "next/navigation";
import type { ElementType } from "react";
import { ArrowLeft, BadgeCheck, DatabaseZap, ExternalLink, Globe2, Send, ShieldAlert, ShieldCheck, UserRoundSearch, UsersRound } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { enrichTransfermarktAgentProfile, loadAgentLinkedPlayers, loadAgentRelationshipCounts, syncAgentPlayersOnProfileOpen } from "@/lib/agent-database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PageParams = { id: string };

type AgentRow = {
  id: string;
  transfermarkt_id: string;
  name: string;
  canonical_url: string;
  profile_url: string;
  photo_url: string | null;
  status: string;
  last_checked_at: string | null;
  updated_at: string | null;
  source_payload: Record<string, unknown> | null;
};

type InsightCard = {
  icon: ElementType;
  title: string;
  body: string;
};

function compactDate(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en", { month: "long", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function initialBadge(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function completeness(values: unknown[]) {
  return Math.min(100, values.filter(Boolean).length * 16);
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/g, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://touchline-football-platform.vercel.app";
}

export default async function AgentDatabaseProfile({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Login required</h1>
        <p className="mt-3 text-slate-400">Login to open agent and agency profiles.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: row, error } = await admin
    .from("transfermarkt_entities")
    .select("id, transfermarkt_id, name, canonical_url, profile_url, photo_url, status, last_checked_at, updated_at, source_payload")
    .eq("id", id)
    .eq("entity_type", "agent")
    .maybeSingle();

  if (error || !row) notFound();

  await syncAgentPlayersOnProfileOpen(admin, row as AgentRow, user.id);
  const counts = await loadAgentRelationshipCounts(admin, id);
  const agentBase = await enrichTransfermarktAgentProfile(admin, row as AgentRow);
  const agent = { ...agentBase, publicLinkedPlayersCount: counts.total, suggestedPlayersCount: counts.suggested, verifiedPlayersCount: counts.verified };
  const linkedPlayers = await loadAgentLinkedPlayers(admin, agent.id);
  const profileCompleteness = completeness([
    agent.photoUrl,
    agent.agencyName,
    agent.country,
    agent.publicLinkedPlayersCount,
    agent.profileUrl,
    agent.transfermarktId,
  ]);
  const internalProfileUrl = `${siteUrl()}/agents/database/${agent.id}`;
  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(`Touchline agent/agency profile: ${agent.name}\n${internalProfileUrl}`)}`;

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <Link href="/football-search" className="mb-4 inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} />
        Return to football search
      </Link>

      <GamePanel className="relative overflow-hidden pitch-grid">
        <div className="absolute right-[-8%] top-[-60%] size-[500px] rounded-full border border-[#a3ff12]/[.08]" />
        <div className="relative grid min-h-[360px] min-w-0 lg:grid-cols-[330px_1fr]">
          <div className="relative overflow-hidden border-b border-white/[.07] bg-cyan-300/[.035] lg:border-b-0 lg:border-r">
            {agent.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agent.photoUrl} alt={agent.name} className="h-full min-h-[360px] w-full object-cover object-top contrast-[1.06]" />
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center text-6xl font-black text-cyan-300/25">{initialBadge(agent.name)}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-cyan-400/[.05]" />
            <div className="absolute bottom-5 left-5"><LivePill>Agent / agency profile</LivePill></div>
          </div>

          <div className="relative min-w-0 p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                  {agent.agencyName ?? "Agency pending"} · {agent.country ?? "Country pending"}
                </p>
                <h1 className="font-display mt-2 break-words text-4xl uppercase italic sm:text-6xl">{agent.name}</h1>
                <p className="mt-2 break-words text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Transfermarkt Agent ID {agent.transfermarktId} · {agent.status}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <a href={agent.profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007] sm:w-auto">
                  Transfermarkt <ExternalLink size={13} />
                </a>
                <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-cyan-100 sm:w-auto">
                  Share WhatsApp <Send size={13} />
                </a>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["PUBLIC PLAYERS", String(agent.publicLinkedPlayersCount), "text-[#a3ff12]"],
                ["SUGGESTED", String(agent.suggestedPlayersCount), "text-amber-300"],
                ["VERIFIED", String(agent.verifiedPlayersCount), "text-cyan-300"],
                ["UPDATED", compactDate(agent.lastCheckedAt ?? agent.updatedAt), "text-white"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                  <p className={`mt-2 truncate text-xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>PROFILE COMPLETENESS</span><span>{profileCompleteness}%</span></div>
                <Meter value={profileCompleteness} color="lime" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>SEARCH READINESS</span><span>100%</span></div>
                <Meter value={100} color="cyan" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[8px] font-bold text-slate-500"><span>LEGAL STATUS</span><span>Suggested</span></div>
                <Meter value={55} color="gold" />
              </div>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Agent network" title="Public linked players" action={<UsersRound size={15} className="text-[#a3ff12]" />} />
          <div className="grid gap-2 md:grid-cols-2">
            {linkedPlayers.length ? linkedPlayers.map((player) => {
              const href = player.internalProfileUrl ?? player.profileUrl;
              const external = !player.internalProfileUrl;
              return (
                <Link
                  key={player.id}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.05]"
                >
                  <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[.08] bg-black/30">
                    {player.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <span className="text-[10px] font-black text-cyan-300/60">{initialBadge(player.name)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-black uppercase italic text-white">{player.name}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                      TM ID {player.transfermarktId} · {player.status} · {player.internalProfileUrl ? "Touchline profile" : "External profile"}
                    </p>
                  </div>
                  <ExternalLink size={13} className="text-slate-600" />
                </Link>
              );
            }) : (
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 md:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Player links pending</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">
                  Touchline has the agent/agency profile now. Public player references appear here after safe registry discovery.
                </p>
              </div>
            )}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <SectionHeader kicker="Compliance" title="Representation rule" action={<ShieldAlert size={15} className="text-amber-300" />} />
          <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[.06] p-5">
            <p className="text-xs font-black uppercase italic text-amber-100">Public links are suggestions only</p>
            <p className="mt-3 text-[10px] leading-5 text-slate-400">
              Touchline can discover player links from public agent or agency pages, but this does not automatically claim representation.
              Players become verified only after agent confirmation and valid documentation.
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            {[
              ["Transfermarkt ID", agent.transfermarktId],
              ["Profile URL", agent.profileUrl],
              ["Agency", agent.agencyName ?? "Pending"],
              ["Country", agent.country ?? "Pending"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</p>
                <p className="mt-2 overflow-wrap-anywhere text-xs font-bold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </GamePanel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {([
          { icon: BadgeCheck, title: "Verification ready", body: "Suggested player links can later move into confirmed representation after documents are uploaded and approved." },
          { icon: ShieldCheck, title: "Legal-first workflow", body: "Touchline never treats public links as confirmed representation automatically." },
          { icon: Globe2, title: "Network discovery", body: "Agents, agencies, clubs and players are now connected through the same Football Search workflow." },
          { icon: DatabaseZap, title: "Database-first", body: "The profile uses saved Touchline links first and only enriches selected profiles when needed." },
          { icon: UserRoundSearch, title: "Agent search", body: "Users can search an agent or agency and open this internal profile without leaving Touchline." },
          { icon: UsersRound, title: "Player pipeline", body: "Public linked players are automatically prepared as internal Touchline player profiles." },
        ] satisfies InsightCard[]).map(({ icon: Icon, title, body }) => (
          <GamePanel key={title} className="p-5">
            <div className="grid size-10 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-300">
              <Icon size={16} />
            </div>
            <p className="mt-4 text-xs font-black uppercase italic text-white">{title}</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">{body}</p>
          </GamePanel>
        ))}
      </div>
    </div>
  );
}
