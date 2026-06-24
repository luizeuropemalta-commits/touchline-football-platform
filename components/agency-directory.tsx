"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Building2, Search, ShieldCheck, UserRoundSearch, Users } from "lucide-react";
import { GamePanel, SectionHeader } from "@/components/game-ui";

export type AgencyDirectoryAgency = {
  name?: string | null;
  slug?: string | null;
  countryCode?: string | null;
  currency?: string | null;
  logoUrl?: string | null;
};

export type AgencyDirectoryMember = {
  id: string;
  fullName?: string | null;
  role?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
};

function initials(value?: string | null) {
  return (value || "AG")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function compactDate(value?: string | null) {
  if (!value) return "Profile active";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

export function AgencyDirectory({ agency, members }: { agency: AgencyDirectoryAgency; members: AgencyDirectoryMember[] }) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!search) return members;
    return members.filter((member) =>
      `${member.fullName ?? ""} ${member.role ?? ""} ${member.jobTitle ?? ""} ${agency.name ?? ""} ${agency.countryCode ?? ""}`.toLowerCase().includes(search),
    );
  }, [agency.countryCode, agency.name, members, search]);

  return (
    <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[420px_minmax(0,1fr)]">
      <GamePanel className="p-5">
        <SectionHeader kicker="Agency profile" title="Identity" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
        <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
          <div className="grid size-20 place-items-center overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-300/[.08] text-2xl font-black text-cyan-100">
            {agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logoUrl} alt={agency.name ?? "Agency"} className="h-full w-full object-cover" />
            ) : (
              initials(agency.name)
            )}
          </div>
          <h2 className="mt-5 text-2xl font-black uppercase italic text-white">{agency.name ?? "Touchline Agency"}</h2>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-600">{agency.slug ?? "agency"} · {agency.countryCode ?? "Global"} · {agency.currency ?? "EUR"}</p>
        </div>
        <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
          <div className="flex items-start gap-3">
            <UserRoundSearch size={16} className="mt-0.5 text-cyan-300" />
            <p className="text-[10px] leading-5 text-slate-500">
              Search below reads real workspace users. As the global agent network grows, this same directory can expand to verified public agent profiles.
            </p>
          </div>
        </div>
      </GamePanel>

      <GamePanel className="overflow-hidden">
        <div className="border-b border-white/[.07] p-5">
          <SectionHeader kicker="People search" title="Agency Team Directory" action={<Users size={15} className="text-cyan-300" />} />
          <div className="relative mt-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents by name, role, title, agency or country..."
              className="h-11 w-full rounded-2xl border border-white/[.07] bg-black/20 pl-9 pr-4 text-xs text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"
            />
          </div>
        </div>
        {filteredMembers.length ? (
          <div className="divide-y divide-white/[.06]">
            {filteredMembers.map((member) => (
              <div key={member.id} className="live-row grid gap-4 p-5 md:grid-cols-[1fr_180px_180px] md:items-center" style={{ "--row-accent": "#22d3ee" } as React.CSSProperties}>
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.07] text-xs font-black text-cyan-100">
                    {member.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatarUrl} alt={member.fullName ?? "Agent"} className="h-full w-full object-cover" />
                    ) : (
                      initials(member.fullName)
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase italic text-white">{member.fullName || "Unnamed agent"}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{member.jobTitle || "Football professional"}</p>
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase text-cyan-200">{member.role ?? "member"}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/verification" className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-wider text-[#caff72]">
                    <BadgeCheck size={12} />
                    Verification
                  </Link>
                  <Link href="/clubs" className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-3 text-[8px] font-black uppercase tracking-wider text-cyan-100">
                    <Building2 size={12} />
                    Clubs
                  </Link>
                </div>
                <p className="md:col-span-3 text-[8px] font-bold uppercase tracking-wider text-slate-700">Created {compactDate(member.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Search size={28} className="text-slate-700" />
            <p className="mt-4 text-sm font-black uppercase italic text-white">No agents found</p>
            <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">Try another name, role, title or country. New invited team members will appear here once added to the workspace.</p>
          </div>
        )}
      </GamePanel>
    </div>
  );
}
