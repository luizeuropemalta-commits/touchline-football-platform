"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, FileSignature, MessageSquare, Search, ShieldCheck } from "lucide-react";
import { GamePanel, SectionHeader } from "@/components/game-ui";

export type InboxItem = {
  id: string;
  kind: string;
  from: string;
  title: string;
  preview: string;
  status: string;
  time: string;
  urgent: boolean;
  type: "interest" | "message";
};

function iconFor(type: InboxItem["type"]) {
  return type === "interest" ? Building2 : MessageSquare;
}

export function InboxCenter({ items }: { items: InboxItem[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const search = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter((item) => `${item.kind} ${item.from} ${item.title} ${item.preview} ${item.status}`.toLowerCase().includes(search));
  }, [items, search]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  return (
    <GamePanel className="grid min-h-[650px] overflow-hidden lg:grid-cols-[380px_1fr]">
      <aside className="border-b border-white/[.07] bg-black/[.08] lg:border-b-0 lg:border-r">
        <div className="border-b border-white/[.07] p-4">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search club, player, message or status..."
              className="h-9 w-full rounded-lg border border-white/[.07] bg-black/20 pl-9 pr-3 text-[9px] text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-300/25"
            />
          </div>
          <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-slate-700">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="max-h-[540px] overflow-y-auto">
          {filtered.length ? (
            filtered.map((item) => {
              const Icon = iconFor(item.type);
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`live-row flex w-full gap-3 border-b border-white/[.05] p-4 text-left transition hover:bg-white/[.02] ${active ? "bg-cyan-300/[.045]" : ""}`}
                  style={{ "--row-accent": item.urgent ? "#fb7185" : "#22d3ee" } as React.CSSProperties}
                >
                  <span className={`interactive-icon grid size-9 shrink-0 place-items-center rounded-lg border ${item.urgent ? "border-rose-300/20 bg-rose-300/[.07] text-rose-300" : "border-white/[.07] bg-white/[.03] text-slate-500"}`}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-[9px] font-black uppercase">{item.from}</p>
                      <span className="text-[7px] text-slate-700">{item.time}</span>
                    </div>
                    <p className="mt-1 truncate text-[9px] font-bold text-slate-300">{item.title}</p>
                    <p className="mt-1 truncate text-[8px] text-slate-600">{item.preview}</p>
                  </div>
                  {item.urgent && <span className="pulse-live mt-1 size-1.5 rounded-full bg-rose-400" />}
                </button>
              );
            })
          ) : (
            <div className="p-6 text-sm text-slate-500">
              {items.length ? "No messages match this search." : "Your inbox is empty. Create club interest from the Club Hub or start a negotiation to generate real messages."}
            </div>
          )}
        </div>
      </aside>

      <article className="p-5 sm:p-8">
        <SectionHeader kicker="Private football communications" title="Live message room" action={<ShieldCheck size={17} className="text-[#a3ff12]" />} />
        {selected ? (
          <div className="max-w-3xl py-8">
            <div className="flex gap-4">
              <span className="premium-ring grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300">
                <FileSignature size={18} />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">{selected.kind}</p>
                <h2 className="mt-2 text-lg font-black uppercase italic">{selected.title}</h2>
                <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">{selected.from} · {selected.status} · {selected.time}</p>
                <p className="mt-4 text-[11px] leading-7 text-slate-400">{selected.preview}</p>
                <Link href="/deals" className="mt-6 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">
                  Open negotiation center
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-8">
            <p className="text-sm font-black uppercase italic text-white">No communications yet</p>
            <p className="mt-2 max-w-xl text-xs leading-6 text-slate-500">When clubs click interest, request contact, or negotiate with your players, Touchline creates the inbox feed automatically.</p>
            <Link href="/clubs" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">
              Go to Club Hub
            </Link>
          </div>
        )}
      </article>
    </GamePanel>
  );
}

