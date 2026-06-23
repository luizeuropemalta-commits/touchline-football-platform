"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, Binoculars, Bot, Building2, ChevronDown, CircleDollarSign, Crosshair,
  FileSignature, Globe2, Goal, GraduationCap, Inbox, Landmark, LayoutDashboard,
  LockKeyhole, Menu, Newspaper, Radar, Search, Settings, Shield, Sparkles, Trophy, Users, WalletCards, X, Zap,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";
import { canAccess, featureForPath, planMap, type PlanKey } from "@/lib/billing/plans";

const nav = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/players", label: "Player Portfolio", icon: Users },
  { href: "/deals", label: "Deal Rooms", icon: Zap, count: 7 },
  { href: "/scouting", label: "Scouting Center", icon: Binoculars },
  { href: "/inbox", label: "Messages", icon: Inbox, count: 5 },
];

const ecosystem = [
  { href: "/clubs", label: "Club Network", icon: Building2 },
  { href: "/rankings", label: "Market Intelligence", icon: BarChart3 },
  { href: "/radar", label: "Market Radar", icon: Radar, count: 9 },
  { href: "/competition", label: "Agent League", icon: Trophy },
  { href: "/investors", label: "Investor Hub", icon: Landmark },
  { href: "/academies", label: "Academies", icon: GraduationCap },
  { href: "/feed", label: "Football Feed", icon: Newspaper, count: 12 },
  { href: "/ai", label: "Touchline AI", icon: Bot },
];

const operations = [
  { href: "/objectives", label: "Objectives", icon: Goal },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/contracts", label: "Contracts", icon: FileSignature },
  { href: "/invoices", label: "Finance", icon: CircleDollarSign },
];

const consoleModes = [
  { href: "/dashboard", label: "Command Center", eyebrow: "HQ", icon: Globe2 },
  { href: "/players", label: "Player Portfolio", eyebrow: "Talent", icon: Users },
  { href: "/deals", label: "Deal Rooms", eyebrow: "Negotiations", icon: Zap },
  { href: "/scouting", label: "Scouting Center", eyebrow: "Discovery", icon: Binoculars },
  { href: "/clubs", label: "Club Network", eyebrow: "Recruitment", icon: Building2 },
  { href: "/rankings", label: "Market Intel", eyebrow: "Rankings", icon: BarChart3 },
  { href: "/radar", label: "Market Radar", eyebrow: "Rumors", icon: Radar },
  { href: "/inbox", label: "Messages", eyebrow: "Comms", icon: Inbox },
];

export function AppShell({ children, planKey, subscriptionStatus }: { children: React.ReactNode; planKey: PlanKey | null; subscriptionStatus: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navLink = ({ href, label, icon: Icon, count }: (typeof nav)[number]) => {
    const active = pathname === href || (href === "/players" && pathname.startsWith("/players/"));
    const feature = featureForPath(href);
    const locked = Boolean(feature && !canAccess(planKey, feature));
    const destination = locked ? `/upgrade?feature=${feature}&from=${encodeURIComponent(href)}` : href;
    return (
      <Link key={href} href={destination} onClick={() => setOpen(false)} className={cn(
        "group relative flex h-11 items-center gap-3 overflow-hidden rounded-xl px-3 text-[11px] font-bold uppercase tracking-[.08em] transition duration-300",
        active ? "nav-glow bg-gradient-to-r from-cyan-300/[.16] via-blue-400/[.07] to-transparent text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]" : "text-slate-500 hover:bg-white/[.045] hover:text-slate-100",
      )}>
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[.055] to-transparent transition-transform duration-700 group-hover:translate-x-full"/>
        {active && <span className="absolute -left-4 h-7 w-[2px] bg-cyan-300 shadow-[0_0_16px_#22d3ee]" />}
        <Icon size={15} className={cn("relative transition duration-300 group-hover:scale-110", active ? "text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,.82)]" : "group-hover:text-cyan-300")} />
        <span className="relative">{label}</span>
        {locked && <LockKeyhole size={11} className="ml-auto text-amber-300/60"/>}
        {count && <span className="console-chip ml-auto rounded-md border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-1.5 py-0.5 text-[8px] text-[#b9ff50]">{count}</span>}
      </Link>
    );
  };

  const sidebar = (
    <aside className="console-sidebar relative flex h-full w-[268px] shrink-0 flex-col overflow-y-auto border-r border-cyan-100/10 bg-[#03080f]/95 px-4 py-5 text-white backdrop-blur-2xl scrollbar-none">
      <div className="relative px-2"><Logo light /></div>
      <div className="premium-ring status-scan console-hud mx-2 mt-6 rounded-2xl border border-[#a3ff12]/15 bg-gradient-to-br from-[#a3ff12]/[.12] via-cyan-400/[.06] to-white/[.025] p-3.5">
        <div className="flex items-center justify-between"><span className="text-[8px] font-black uppercase tracking-[.18em] text-[#a3ff12]">Season 26</span><span className="text-[9px] font-bold text-white/45">LVL 38</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[72%] bg-gradient-to-r from-cyan-400 to-[#a3ff12] shadow-[0_0_12px_#a3ff12]" /></div>
        <p className="mt-2 text-[9px] text-slate-500">7,240 XP <span className="float-right">10,000</span></p>
      </div>
      <nav className="mt-5 space-y-0.5">
        <p className="mb-2 px-3 text-[8px] font-black uppercase tracking-[.22em] text-slate-700">Core</p>
        {nav.map(navLink)}
      </nav>
      <nav className="mt-4 space-y-0.5 border-t border-white/[.06] pt-4">
        <p className="mb-2 px-3 text-[8px] font-black uppercase tracking-[.22em] text-slate-700">Ecosystem</p>
        {ecosystem.map(item => navLink(item as (typeof nav)[number]))}
      </nav>
      <nav className="mt-4 space-y-0.5 border-t border-white/[.06] pt-4">
        <p className="mb-2 px-3 text-[8px] font-black uppercase tracking-[.22em] text-slate-700">Operations</p>
        {operations.map(item => navLink(item as (typeof nav)[number]))}
      </nav>
      <div className="mt-5">
        <Link href="/billing" className="ps-focus mb-3 flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-3 transition hover:border-cyan-300/30 hover:bg-cyan-300/[.08]">
          <WalletCards size={15} className="text-cyan-300"/>
          <div className="min-w-0 flex-1"><p className="text-[8px] font-black uppercase tracking-[.15em] text-cyan-100">{planKey ? planMap[planKey].name : "Choose your plan"}</p><p className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">{subscriptionStatus || "No subscription"}</p></div>
          <ChevronDown size={11} className="-rotate-90 text-slate-600"/>
        </Link>
        <div className="console-chip mb-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-3">
          <div className="flex items-center gap-2 text-cyan-300"><Shield size={13}/><span className="text-[8px] font-black uppercase tracking-[.16em]">Vault encrypted</span><span className="pulse-live ml-auto size-1.5 rounded-full bg-[#a3ff12]"/></div>
        </div>
        <Link href="/settings" className="flex h-9 items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:text-white"><Settings size={14}/>Settings</Link>
        <div className="mt-3 flex items-center gap-3 border-t border-white/[.07] px-2 pt-4">
          <div className="relative grid size-9 place-items-center rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/20 to-blue-700/20 text-[10px] font-black text-cyan-100">AO<span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-[#050b12] bg-[#a3ff12]"/></div>
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">Alex Oliveira</p><p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-cyan-300/50">Elite Agent · Rank 184</p></div>
          <ChevronDown size={12} className="text-slate-700"/>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="arena-bg console-shell flex min-h-screen bg-transparent">
      <div className="stadium-light stadium-light-left" />
      <div className="stadium-light stadium-light-right" />
      <div className="football-orb" />
      <div className="stadium-skyline" />
      <div className="fixed inset-y-0 left-0 z-40 hidden">{sidebar}</div>
      {open && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setOpen(false)}/><div className="relative">{sidebar}<button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-4 top-4 text-white/60"><X/></button></div></div>}
      <div className="min-w-0 flex-1">
        <header className="console-topbar sticky top-0 z-30 flex h-[72px] items-center border-b border-cyan-100/[.08] bg-[#03080f]/70 px-5 backdrop-blur-2xl sm:px-7">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="mr-4 text-slate-300 lg:hidden"><Menu size={21}/></button>
          <div className="hidden lg:block"><Logo light /></div>
        <div className="ml-5 hidden items-center gap-2 text-[9px] font-bold uppercase tracking-[.16em] text-slate-600 md:flex"><Globe2 size={14} className="text-cyan-400"/><span>Global Football Network</span><span className="mx-2 h-3 w-px bg-white/10"/><span className="text-slate-400">Beta HQ</span></div>
          <div className="relative ml-auto hidden w-full max-w-[330px] md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/>
            <input placeholder="Search the football world..." className="console-chip h-10 w-full rounded-xl border border-white/[.08] bg-white/[.035] pl-9 pr-3 text-[10px] text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-300/30"/>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-3">
            <div className="console-chip hidden items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[.06] px-3 py-2 sm:flex"><Sparkles size={12} className="text-amber-300"/><span className="text-[9px] font-black text-amber-200">12,450</span></div>
            <button aria-label="Notifications" className="interactive-icon relative grid size-10 place-items-center rounded-xl border border-white/[.08] bg-white/[.035] text-slate-400 hover:border-cyan-300/25 hover:text-cyan-300"><Bell size={15}/><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#a3ff12] shadow-[0_0_7px_#a3ff12]"/></button>
            <button className="console-chip hidden h-10 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[.08] px-3 text-[9px] font-black uppercase tracking-[.1em] text-cyan-200 hover:bg-cyan-300/[.14] sm:flex"><Crosshair size={13}/> Quick Action</button>
          </div>
        </header>
        <nav className="console-mode-dock">
          {consoleModes.map(({ href, label, eyebrow, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const feature = featureForPath(href);
            const locked = Boolean(feature && !canAccess(planKey, feature));
            const destination = locked ? `/upgrade?feature=${feature}&from=${encodeURIComponent(href)}` : href;
            return (
              <Link key={href} href={destination} className="console-mode-button" data-active={active}>
                <span className="console-mode-icon"><Icon size={20}/></span>
                <span className="relative min-w-0">
                  <span className="block text-[7px] font-black uppercase tracking-[.22em] text-cyan-200/55">{eyebrow}</span>
                  <span className="mt-1 block truncate text-[12px] font-black uppercase italic tracking-[-.03em] text-white">{label}</span>
                </span>
                {locked && <LockKeyhole size={12} className="relative ml-auto text-amber-300"/>}
              </Link>
            );
          })}
        </nav>
        <main className="p-4 pb-24 sm:p-6 sm:pb-24 xl:p-8 xl:pb-24">{children}</main>
        <Link href="/ai" aria-label="Open Touchline AI" className="premium-ring fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-2xl border border-cyan-300/30 bg-[#0a1a27]/90 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,.2)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:scale-105 hover:border-[#a3ff12]/40 hover:text-[#a3ff12]">
          <Bot size={22}/><span className="pulse-live absolute right-1.5 top-1.5 size-2 rounded-full bg-[#a3ff12]"/>
        </Link>
      </div>
    </div>
  );
}
