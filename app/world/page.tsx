import Link from "next/link";
import { ArrowRight, CalendarDays, Gamepad2, LockKeyhole, Medal, Radio, Sparkles, Trophy, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";
import { createAdminClient } from "@/lib/supabase/admin";

type LiveItem = {
  id: string;
  item_type: string;
  title: string;
  source_url: string | null;
  starts_at: string | null;
  published_at: string;
};

function dateLabel(value?: string | null) {
  if (!value) return "Live center";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default async function PublicWorldPage() {
  const admin = createAdminClient();
  const { data } = admin
    ? await admin
        .from("football_live_items")
        .select("id, item_type, title, source_url, starts_at, published_at")
        .is("agency_id", null)
        .order("published_at", { ascending: false })
        .limit(8)
    : { data: [] };
  const liveItems = (data ?? []) as LiveItem[];
  const fixtures = liveItems.filter((item) => item.item_type === "fixture" || item.item_type === "live_score");
  const news = liveItems.filter((item) => item.item_type !== "fixture" && item.item_type !== "live_score");

  return (
    <main className="arena-bg min-h-screen px-4 py-6 sm:px-8 lg:px-12">
      <div className="stadium-light stadium-light-left" />
      <div className="stadium-light stadium-light-right" />
      <div className="football-orb" />
      <div className="stadium-skyline" />
      <header className="mx-auto flex max-w-[1440px] items-center justify-between">
        <Logo light />
        <div className="flex items-center gap-2">
          <Link href="/pricing" className="hidden rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] text-cyan-100 hover:bg-cyan-300/[.12] sm:inline-flex">Plans</Link>
          <Link href="/login" className="rounded-2xl border border-[#a3ff12]/35 bg-[#a3ff12] px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] text-[#071007]">Sign in</Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] py-14">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr] xl:items-stretch">
          <GamePanel className="career-stage premium-ring status-scan relative overflow-hidden p-7 pitch-grid sm:p-10">
            <div className="stadium-stands" />
            <div className="pitch-lines" />
            <div className="soft-orbit right-[-8%] top-[-22%] size-80" />
            <LivePill>Open football universe</LivePill>
            <h1 className="font-display mt-6 max-w-3xl text-5xl uppercase italic leading-[.92] text-white sm:text-7xl">Enter the Touchline football world.</h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-500">A public football engagement layer for fans, families, scouts and future users — while agents, clubs, contracts and vaults stay private.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-[.12em] text-[#071007]">Start career <ArrowRight size={14} /></Link>
              <Link href="/pricing" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-5 text-[9px] font-black uppercase tracking-[.12em] text-cyan-100">View subscriptions</Link>
            </div>
          </GamePanel>

          <GamePanel className="overflow-hidden">
            <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="No betting. Pure engagement." title="Prediction League" action={<Gamepad2 size={16} className="text-[#a3ff12]" />} /></div>
            <div className="space-y-3 p-5">
              {fixtures.length ? (
                fixtures.map((item) => (
                  <div key={item.id} className="ps-focus rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                    <div className="mb-3 flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-600"><span>{item.item_type.replaceAll("_", " ")}</span><span>{dateLabel(item.starts_at ?? item.published_at)}</span></div>
                    <p className="text-[10px] font-black uppercase">{item.title}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-5">
                  <p className="text-[10px] font-black uppercase text-white">No public fixtures loaded yet</p>
                  <p className="mt-2 text-[8px] leading-4 text-slate-500">Connect a licensed football data provider or add public live-center items to activate the public match layer.</p>
                </div>
              )}
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-4">
                <Medal size={16} className="text-amber-300" />
                <p className="mt-3 text-[9px] font-black uppercase">Points only. No gambling.</p>
                <p className="mt-2 text-[8px] leading-4 text-slate-500">Users predict match results and earn virtual points, badges and leaderboard status. No money risk.</p>
              </div>
            </div>
          </GamePanel>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          <GamePanel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[.07] p-5">
              <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Public live center</p><h2 className="mt-1 text-sm font-black uppercase italic">Football Signals</h2></div>
              <Radio size={17} className="text-[#a3ff12]" />
            </div>
            <div className="divide-y divide-white/[.06]">
              {news.length ? (
                news.map((item) => (
                  <div key={item.id} className="grid items-center gap-3 p-4 sm:grid-cols-[120px_1fr_120px]">
                    <span className="text-[8px] font-black uppercase text-cyan-300">{item.item_type.replaceAll("_", " ")}</span>
                    <p className="text-[10px] font-black uppercase italic">{item.title}</p>
                    <span className="text-[8px] text-slate-600">{dateLabel(item.published_at)}</span>
                  </div>
                ))
              ) : (
                <div className="p-5 text-[10px] leading-5 text-slate-500">No public transfer news, injury reports or ratings have been loaded yet.</div>
              )}
            </div>
          </GamePanel>

          <GamePanel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[.07] p-5">
              <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">Public rankings</p><h2 className="mt-1 text-sm font-black uppercase italic">Verified Boards</h2></div>
              <Trophy size={17} className="text-amber-300" />
            </div>
            <div className="p-5">
              <p className="text-[10px] leading-6 text-slate-500">Public rankings will show only licensed or verified data. Touchline will not invent “most valuable player” or “richest club” boards without a compliant data source.</p>
              <Link href="/pricing" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-amber-300/20 bg-amber-300/[.07] px-4 text-[9px] font-black uppercase text-amber-200">
                Activate professional data
              </Link>
            </div>
          </GamePanel>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [Users, "Public area", "Fans, families and future users can enjoy public live items and points-only challenges."],
            [LockKeyhole, "Private business rooms", "Agents, clubs, contracts, deal rooms and player vaults stay protected."],
            [CalendarDays, "Daily habit loop", "Live center, rankings and prediction points create reasons to return every day."],
          ].map(([Icon, title, text]) => {
            const CardIcon = Icon as typeof Users;
            return <GamePanel key={String(title)} className="p-5"><CardIcon size={18} className="text-cyan-300" /><p className="mt-4 text-[10px] font-black uppercase">{String(title)}</p><p className="mt-2 text-[9px] leading-5 text-slate-500">{String(text)}</p></GamePanel>;
          })}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-[.18em] text-slate-600"><Radio size={12} className="text-[#a3ff12]" /><span>Future modules: predictions, badges, fan leaderboards, live football trivia, weekly challenges</span><Sparkles size={12} className="text-amber-300" /></div>
      </section>
    </main>
  );
}
