"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  CircleDollarSign,
  Database,
  Inbox,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeTouchLineAuthLocale,
  touchLineAuthHref,
} from "@/lib/touchlineArena/auth-i18n";
import { TOUCHLINE_LOCALE_STORAGE_KEY } from "@/lib/touchlineArena/i18n";

type ShellLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const PRIMARY_LINKS: ShellLink[] = [
  {
    href: "/arena",
    label: "TouchLine Arena",
    description: "Return to matchday",
    icon: Trophy,
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Your delivery preferences",
    icon: Bell,
  },
  {
    href: "/inbox",
    label: "Inbox",
    description: "Official Central notices",
    icon: Inbox,
  },
  {
    href: "/football-search",
    label: "Football Search",
    description: "Official football data",
    icon: Search,
  },
];

const OWNER_LINKS: ShellLink[] = [
  {
    href: "/admin",
    label: "Arena Admin",
    description: "Official owner controls",
    icon: ShieldCheck,
  },
  {
    href: "/admin/analytics",
    label: "Activity",
    description: "First-party Arena telemetry",
    icon: Activity,
  },
  {
    href: "/admin/cards",
    label: "Card Inventory",
    description: "Official card operations",
    icon: WalletCards,
  },
  {
    href: "/admin/promotions",
    label: "Promotions",
    description: "Arena campaign controls",
    icon: Sparkles,
  },
  {
    href: "/admin/finance",
    label: "Finance Control",
    description: "Protected financial overview",
    icon: CircleDollarSign,
  },
  {
    href: "/admin/football-data",
    label: "Football Data",
    description: "TouchLine data health",
    icon: Database,
  },
];

function pathIsActive(pathname: string, href: string) {
  if (href === "/arena") return pathname === "/arena";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({
  item,
  pathname,
  locale,
  onNavigate,
}: {
  item: ShellLink;
  pathname: string;
  locale: string;
  onNavigate: () => void;
}) {
  const active = pathIsActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={touchLineAuthHref(item.href, locale)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "group flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
        active
          ? "border-[#a3ff12]/35 bg-[#a3ff12]/10 text-white shadow-[0_0_24px_rgba(163,255,18,.08)]"
          : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[.04] hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "grid size-9 shrink-0 place-items-center rounded-xl border transition",
          active
            ? "border-[#a3ff12]/35 bg-[#a3ff12]/10 text-[#b9ff50]"
            : "border-white/10 bg-white/[.035] text-cyan-200 group-hover:border-cyan-300/25",
        ].join(" ")}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-black">{item.label}</span>
        <span className="mt-0.5 block truncate text-[8px] text-slate-600 group-hover:text-slate-500">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

export function ArenaAdminShell({
  children,
  profileName,
  profileEmail,
  isOwner,
}: {
  children: ReactNode;
  profileName: string;
  profileEmail: string;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = normalizeTouchLineAuthLocale(searchParams.get("lang"));
  const pt = locale === "pt-BR";
  const shellCopy = pt ? {
    arenaOperations: "Operações da Arena", touchline: "TouchLine", owner: "Administração",
    ownerIdentity: "Administrador TouchLine", clubOwnerIdentity: "Conta ClubOwner",
    officialAdmin: "Administração oficial da Arena", account: "Conta ClubOwner",
    openSearch: "Abrir pesquisa de futebol", openNotifications: "Abrir preferências de notificações",
    openMenu: "Abrir menu", closeMenu: "Fechar menu", closeNavigation: "Fechar navegação",
    signingOut: "Saindo…", signOut: "Sair", authUnavailable: "O serviço de autenticação está indisponível.",
  } : {
    arenaOperations: "Arena operations", touchline: "TouchLine", owner: "Owner",
    ownerIdentity: "TouchLine Owner", clubOwnerIdentity: "Authenticated ClubOwner",
    officialAdmin: "Official Arena administration", account: "ClubOwner account",
    openSearch: "Open football search", openNotifications: "Open notification preferences",
    openMenu: "Open menu", closeMenu: "Close menu", closeNavigation: "Close navigation",
    signingOut: "Signing out…", signOut: "Sign out", authUnavailable: "Authentication service is unavailable.",
  };
  const primaryLinks = pt ? [
    { href: "/arena", label: "TouchLine Arena", description: "Voltar ao dia de jogo", icon: Trophy },
    { href: "/notifications", label: "Notificações", description: "Suas preferências de entrega", icon: Bell },
    { href: "/inbox", label: "Caixa de entrada", description: "Avisos oficiais da Central", icon: Inbox },
    { href: "/football-search", label: "Pesquisa de Futebol", description: "Dados oficiais de futebol", icon: Search },
  ] : PRIMARY_LINKS;
  const ownerLinks = pt ? [
    { href: "/admin", label: "Admin da Arena", description: "Controles oficiais", icon: ShieldCheck },
    { href: "/admin/analytics", label: "Atividade", description: "Telemetria própria da Arena", icon: Activity },
    { href: "/admin/cards", label: "Inventário de Cards", description: "Operações oficiais de cards", icon: WalletCards },
    { href: "/admin/promotions", label: "Promoções", description: "Controles de campanhas", icon: Sparkles },
    { href: "/admin/finance", label: "Controle Financeiro", description: "Visão financeira protegida", icon: CircleDollarSign },
    { href: "/admin/football-data", label: "Dados de Futebol", description: "Saúde dos dados TouchLine", icon: Database },
  ] : OWNER_LINKS;
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    const supabase = createClient();
    if (!supabase) {
      setSignOutError(shellCopy.authUnavailable);
      setSigningOut(false);
      return;
    }

    const urlLocale = new URLSearchParams(window.location.search).get("lang");
    let storedLocale: string | null = null;
    try {
      storedLocale = window.localStorage.getItem(TOUCHLINE_LOCALE_STORAGE_KEY);
    } catch {
      storedLocale = null;
    }
    const locale = normalizeTouchLineAuthLocale(urlLocale || storedLocale || document.documentElement.lang);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setSignOutError(error.message);
      setSigningOut(false);
      return;
    }
    window.location.assign(touchLineAuthHref("/login", locale));
  }

  const navigation = (
    <aside className="flex h-full w-[272px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overscroll-contain border-r border-white/[.08] bg-[#030a0d]/95 px-4 py-5 text-white backdrop-blur-2xl">
      <div className="px-2">
        <Logo light />
        <p className="mt-3 text-[8px] font-black uppercase tracking-[.24em] text-[#a3ff12]">
          {shellCopy.arenaOperations}
        </p>
      </div>

      <nav aria-label="TouchLine Arena" className="mt-7 space-y-1">
        <p className="mb-2 px-3 text-[8px] font-black uppercase tracking-[.18em] text-slate-700">
          {shellCopy.touchline}
        </p>
        {primaryLinks.map((item) => (
          <NavigationLink
            key={item.href}
            item={item}
            pathname={pathname}
            locale={locale}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      </nav>

      {isOwner ? (
        <nav aria-label="Arena administration" className="mt-6 space-y-1 border-t border-white/[.07] pt-5">
          <p className="mb-2 px-3 text-[8px] font-black uppercase tracking-[.18em] text-slate-700">
            {shellCopy.owner}
          </p>
          {ownerLinks.map((item) => (
            <NavigationLink
              key={item.href}
              item={item}
              pathname={pathname}
              locale={locale}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      ) : null}

      <div className="mt-auto border-t border-white/[.07] px-2 pt-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] text-xs font-black text-[#caff72]">
            {profileName.trim().slice(0, 1).toUpperCase() || "T"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold">{profileName}</span>
            <span className="mt-0.5 block truncate text-[8px] text-slate-600">
              {isOwner ? shellCopy.ownerIdentity : profileEmail || shellCopy.clubOwnerIdentity}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[.08] bg-white/[.025] px-3 text-[9px] font-black text-slate-400 transition hover:border-rose-300/25 hover:bg-rose-300/[.06] hover:text-rose-100 disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut size={14} aria-hidden="true" />
          {signingOut ? shellCopy.signingOut : shellCopy.signOut}
        </button>
        {signOutError ? <p className="mt-2 text-[8px] leading-4 text-rose-200" role="alert">{signOutError}</p> : null}
      </div>
    </aside>
  );

  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-[#02080a] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_0%,rgba(30,167,111,.15),transparent_34%),radial-gradient(circle_at_18%_78%,rgba(19,141,179,.09),transparent_32%),linear-gradient(180deg,#061014_0%,#020709_100%)]"
      />

      <div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{navigation}</div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <button
            type="button"
            aria-label={shellCopy.closeNavigation}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative">
            {navigation}
            <button
              type="button"
              aria-label={shellCopy.closeMenu}
              onClick={() => setMenuOpen(false)}
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-xl border border-white/10 bg-black/30 text-slate-300"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative min-w-0 xl:ml-[272px]">
        <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#030a0d]/80 backdrop-blur-2xl">
          <div className="mx-auto flex h-[68px] w-full max-w-[1500px] items-center gap-3 px-4 sm:px-6 xl:px-8">
            <button
              type="button"
              aria-label={shellCopy.openMenu}
              onClick={() => setMenuOpen(true)}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-slate-300 xl:hidden"
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-black uppercase tracking-[.2em] text-[#a3ff12]">
                TouchLine England
              </p>
              <p className="mt-1 truncate text-[10px] text-slate-500">
                {isOwner ? shellCopy.officialAdmin : shellCopy.account}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href={touchLineAuthHref("/football-search", locale)}
                aria-label={shellCopy.openSearch}
                className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200"
              >
                <Search size={16} />
              </Link>
              <Link
                href={touchLineAuthHref("/notifications", locale)}
                aria-label={shellCopy.openNotifications}
                className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-slate-400 transition hover:border-[#a3ff12]/30 hover:text-[#caff72]"
              >
                <Bell size={16} />
              </Link>
              <Link
                href={touchLineAuthHref("/arena", locale)}
                className="hidden h-10 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 text-[9px] font-black text-[#caff72] transition hover:bg-[#a3ff12]/[.13] sm:flex"
              >
                <Trophy size={14} />
                Arena
              </Link>
            </div>
          </div>
        </header>

        <main className="w-full px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
          <div className="mx-auto w-full max-w-[1500px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
