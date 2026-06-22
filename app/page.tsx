import Link from "next/link";
import {
  ArrowRight,
  BadgeEuro,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileSignature,
  Globe2,
  Languages,
  MessageSquare,
  Network,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";

const audiences = [
  ["Agents", "Manage player portfolios, club contacts, negotiations, contracts and AI documents.", Users],
  ["Clubs", "Search players and agents, publish squad needs, build shortlists and recruitment pipelines.", Building2],
  ["Scouts", "Create scouting reports, track regions, follow talents and collaborate with clubs.", Search],
  ["Players", "Build professional profiles, career records, videos and representation documents.", Trophy],
];

const systems = [
  ["Football Database", "Players, clubs, leagues, coaches, agents, scouts, transfers, match stats and market updates.", Globe2],
  ["AI Matching Engine", "Clubs receive recommended players; agents receive alerts when clubs need profiles they represent.", BrainCircuit],
  ["AI Assistant", "Contracts, representation agreements, emails, scouting reports, translations and summaries.", Bot],
  ["Agent CRM", "Players, clubs, contacts, tasks, meetings, negotiations, contracts and commission tracking.", FileSignature],
  ["Club CRM", "Recruitment pipelines, scout reports, transfer budgets, target lists and agent relationships.", BarChart3],
  ["Communication Center", "Messaging, file sharing, contract sharing, group discussions, voice and video calls.", MessageSquare],
  ["Live Football Center", "Fixtures, results, lineups, ratings, statistics, tables, transfer news and market signals.", Radio],
  ["Community", "Predictions, points, professional rankings, insights, follows and achievements without gambling.", Trophy],
];

const matching = [
  "Club searches for U23 left-back in Portugal",
  "Touchline detects matching agent portfolios",
  "Agents receive opportunity alerts",
  "Club receives ranked recommendations",
  "Conversation opens inside a secure deal room",
];

const languages = ["English", "Portuguese", "Spanish", "French", "Italian", "German", "Arabic", "Russian", "Chinese"];

export default function Home() {
  return (
    <main className="arena-bg console-shell min-h-screen overflow-hidden bg-[#02050a] text-white">
      <div className="stadium-light stadium-light-left" />
      <div className="stadium-light stadium-light-right" />
      <div className="football-orb" />
      <div className="stadium-skyline" />

      <header className="relative z-10 mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo light />
        <nav className="hidden items-center gap-2 md:flex">
          <Link href="#ecosystem" className="rounded-2xl px-4 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400 hover:text-cyan-200">Ecosystem</Link>
          <Link href="#ai" className="rounded-2xl px-4 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400 hover:text-cyan-200">AI</Link>
          <Link href="#community" className="rounded-2xl px-4 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400 hover:text-cyan-200">Community</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] text-cyan-100 sm:inline-flex">Sign in</Link>
          <Link href="/register" className="rounded-2xl border border-[#a3ff12]/35 bg-[#a3ff12] px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] text-[#071007]">Join beta</Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1500px] px-5 pb-12 pt-8 sm:px-8 lg:pt-16">
        <div className="af-mode-screen p-6 sm:p-8 xl:p-10" style={{ "--mode-aura": "rgba(34,211,238,.32)" } as React.CSSProperties}>
          <div className="relative z-10 grid gap-10 xl:grid-cols-[1.1fr_.9fr] xl:items-end">
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                  <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Global football business ecosystem
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                  Agents · Clubs · Scouts · Players
                </span>
              </div>
              <p className="af-mode-kicker">Touchline / Football Operating System</p>
              <h1 className="af-mode-title font-display mt-4 max-w-5xl text-white">
                The football industry in one platform.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300/85">
                Touchline connects agents, clubs, coaches, scouts, players and football professionals to recruit,
                negotiate, manage careers, communicate, analyze data and grow football business globally.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/register" className="continue-career-button inline-flex min-h-[58px] items-center gap-3 px-6 text-[10px] font-black uppercase tracking-[.16em] text-[#071007]">
                  Start beta access <ArrowRight size={17} />
                </Link>
                <Link href="/world" className="console-mini-card inline-flex min-h-[58px] items-center gap-3 px-6 text-[10px] font-black uppercase tracking-[.16em] text-cyan-100">
                  Open public football world <Globe2 size={17} />
                </Link>
              </div>
            </div>

            <div className="stadium-scoreboard p-5">
              <div className="relative z-10 grid gap-3 sm:grid-cols-2">
                {[
                  ["Professionals", "Agents, clubs, scouts, coaches", Users],
                  ["Database", "Players, clubs, matches, transfers", Globe2],
                  ["AI", "Contracts, reports, proposals", Sparkles],
                  ["Deals", "Messages, files, negotiations", BadgeEuro],
                ].map(([title, text, Icon]) => {
                  const CardIcon = Icon as typeof Users;
                  return (
                    <div key={String(title)} className="rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
                      <CardIcon size={18} className="text-cyan-300" />
                      <p className="mt-4 text-[9px] font-black uppercase tracking-wider text-white">{String(title)}</p>
                      <p className="mt-2 text-[9px] leading-5 text-slate-500">{String(text)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="ecosystem" className="relative z-10 mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="af-mode-kicker">User types</p>
            <h2 className="mt-2 text-3xl font-black uppercase italic tracking-[-.06em] sm:text-5xl">Built for football professionals</h2>
          </div>
          <Network className="hidden text-cyan-300 sm:block" size={32} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {audiences.map(([title, text, Icon]) => {
            const CardIcon = Icon as typeof Users;
            return (
              <div key={String(title)} className="af-stat-card p-5">
                <div className="relative z-10">
                  <CardIcon size={22} className="text-[#a3ff12]" />
                  <h3 className="mt-8 text-2xl font-black uppercase italic tracking-[-.06em]">{String(title)}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{String(text)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="ai" className="relative z-10 mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="console-mini-card p-6 sm:p-8">
            <p className="af-mode-kicker">Core systems</p>
            <h2 className="mt-2 text-3xl font-black uppercase italic tracking-[-.06em] sm:text-5xl">One ecosystem, many engines</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {systems.map(([title, text, Icon]) => {
                const CardIcon = Icon as typeof Users;
                return (
                  <div key={String(title)} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                    <CardIcon size={18} className="text-cyan-300" />
                    <p className="mt-4 text-[10px] font-black uppercase tracking-wider">{String(title)}</p>
                    <p className="mt-2 text-[10px] leading-5 text-slate-500">{String(text)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="af-mode-screen p-6 sm:p-8" style={{ "--mode-aura": "rgba(163,255,18,.20)" } as React.CSSProperties}>
            <div className="relative z-10">
              <p className="af-mode-kicker">AI matching flow</p>
              <h2 className="mt-2 text-3xl font-black uppercase italic tracking-[-.06em] sm:text-5xl">Clubs and agents find each other automatically</h2>
              <div className="mt-8 space-y-3">
                {matching.map((item, index) => (
                  <div key={item} className="flex items-center gap-4 rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[10px] font-black text-[#a3ff12]">{index + 1}</span>
                    <p className="text-sm font-bold text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="community" className="relative z-10 mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <div className="console-mini-card p-6">
            <Languages className="text-cyan-300" size={24} />
            <h2 className="mt-5 text-3xl font-black uppercase italic tracking-[-.06em]">Multi-language by design</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Users can change language instantly across the platform.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {languages.map((language) => (
                <span key={language} className="rounded-full border border-white/[.08] bg-white/[.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">{language}</span>
              ))}
            </div>
          </div>
          <div className="console-mini-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="af-mode-kicker">Business model</p>
                <h2 className="mt-2 text-3xl font-black uppercase italic tracking-[-.06em]">Subscription SaaS with premium football tools</h2>
              </div>
              <ShieldCheck className="text-[#a3ff12]" size={28} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {["Free", "Professional Agent", "Agency", "Club Professional", "Club Enterprise", "Premium Database"].map((plan) => (
                <div key={plan} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                  <CheckCircle2 size={16} className="text-[#a3ff12]" />
                  <p className="mt-3 text-[10px] font-black uppercase tracking-wider">{plan}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-[1500px] flex-col gap-4 border-t border-white/[.08] px-5 py-8 text-[9px] text-slate-600 sm:px-8 md:flex-row md:items-center md:justify-between">
        <p>© 2026 Touchline. Global football business ecosystem.</p>
        <div className="flex gap-4">
          <Link href="/pricing" className="hover:text-cyan-300">Pricing</Link>
          <Link href="/login" className="hover:text-cyan-300">Login</Link>
          <Link href="/register" className="hover:text-cyan-300">Join beta</Link>
        </div>
      </footer>
    </main>
  );
}
