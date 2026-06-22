import Link from "next/link";
import { ArrowRight, CalendarDays, Gamepad2, LockKeyhole, Medal, Radio, Sparkles, Trophy, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";
import { rankingBoards } from "@/lib/rankings";

const fixtures = [
  ["Friday", "Portugal U21", "Spain U21", "20:45"],
  ["Saturday", "England", "Germany", "18:00"],
  ["Sunday", "Brazil", "Argentina", "21:00"],
];

export default function PublicWorldPage() {
  const topPlayers = rankingBoards.find((board) => board.key === "players")!;
  const topClubs = rankingBoards.find((board) => board.key === "clubs")!;

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
            <div className="soft-orbit right-[-8%] top-[-22%] size-80"/>
            <LivePill>Open football universe</LivePill>
            <h1 className="font-display mt-6 max-w-3xl text-5xl uppercase italic leading-[.92] text-white sm:text-7xl">Enter the AF football world.</h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-500">A public football entertainment layer for fans, families, scouts and future users — while agent, club and deal rooms stay private for subscribers.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-[.12em] text-[#071007]">Start career <ArrowRight size={14}/></Link>
              <Link href="/pricing" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-5 text-[9px] font-black uppercase tracking-[.12em] text-cyan-100">View subscriptions</Link>
            </div>
          </GamePanel>

          <GamePanel className="overflow-hidden">
            <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="No betting. Pure engagement." title="Weekly Prediction League" action={<Gamepad2 size={16} className="text-[#a3ff12]"/>}/></div>
            <div className="space-y-3 p-5">
              {fixtures.map(([day, home, away, time]) => (
                <div key={`${home}-${away}`} className="ps-focus rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div className="mb-3 flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-600"><span>{day}</span><span>{time}</span></div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><p className="text-[10px] font-black uppercase">{home}</p><span className="text-[8px] text-cyan-300">VS</span><p className="text-[10px] font-black uppercase">{away}</p></div>
                </div>
              ))}
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-4">
                <Medal size={16} className="text-amber-300"/>
                <p className="mt-3 text-[9px] font-black uppercase">Points only. No gambling.</p>
                <p className="mt-2 text-[8px] leading-4 text-slate-500">Users predict match results, earn XP, badges and leaderboard status. No money risk, just football engagement.</p>
              </div>
            </div>
          </GamePanel>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {[topPlayers, topClubs].map((board) => (
            <GamePanel key={board.key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[.07] p-5">
                <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Public preview</p><h2 className="mt-1 text-sm font-black uppercase italic">{board.title}</h2></div>
                <Trophy size={17} className="text-amber-300"/>
              </div>
              <div className="divide-y divide-white/[.06]">
                {board.items.slice(0, 4).map((item) => (
                  <div key={item.name} className="grid items-center gap-3 p-4 sm:grid-cols-[56px_1fr_100px]">
                    <span className="font-display text-2xl text-amber-300">#{item.rank}</span>
                    <div><p className="text-[10px] font-black uppercase italic">{item.name}</p><p className="mt-1 text-[8px] text-slate-600">{item.meta}</p></div>
                    <p className="number-glow text-sm font-black">{item.value}</p>
                  </div>
                ))}
              </div>
            </GamePanel>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [Users, "Public area", "Fans, families and future users can enjoy rankings and game-week content."],
            [LockKeyhole, "Private business rooms", "Agents, clubs, contracts, deal rooms and player vault stay protected."],
            [CalendarDays, "Daily habit loop", "Rankings, predictions, XP and badges create reasons to return every day."],
          ].map(([Icon, title, text]) => {
            const CardIcon = Icon as typeof Users;
            return <GamePanel key={String(title)} className="p-5"><CardIcon size={18} className="text-cyan-300"/><p className="mt-4 text-[10px] font-black uppercase">{String(title)}</p><p className="mt-2 text-[9px] leading-5 text-slate-500">{String(text)}</p></GamePanel>;
          })}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-[.18em] text-slate-600"><Radio size={12} className="text-[#a3ff12]"/><span>Future modules: predictions, badges, fan leaderboards, live football trivia, weekly challenges</span><Sparkles size={12} className="text-amber-300"/></div>
      </section>
    </main>
  );
}
