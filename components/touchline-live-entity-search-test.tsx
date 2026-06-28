"use client";

import { useMemo, useState } from "react";
import {
  TouchlineAgentAvatar,
  TouchlineAgencyAvatar,
  TouchlineClubAvatar,
  TouchlineIdentityCard,
  type TouchlineIdentityCardModel,
} from "@/components/touchline-card-engine";
import { SportmonksRegisteredPlayerSearchTest } from "@/components/sportmonks-registered-player-search-test";

type EntityKind = "player" | "club" | "agent" | "agency";

const identityExamples: Record<Exclude<EntityKind, "player">, TouchlineIdentityCardModel[]> = {
  club: [
    {
      id: "qa-club-barcelona",
      type: "club",
      name: "Barcelona",
      imageUrl: "https://cdn.sportmonks.com/images/soccer/teams/19/83.png",
      sourceImageUrl: "https://cdn.sportmonks.com/images/soccer/teams/19/83.png",
      sourceImageProvider: "sportmonks",
      sourceImageLicenseStatus: "source_tracked",
      sourceImageFetchedAt: new Date().toISOString(),
      avatarRenderStatus: "rendered",
      avatarRenderVersion: "runtime-css-v1",
      avatarRenderType: "touchline_branded_render",
      country: "Spain",
      league: "LaLiga",
      subtitle: "Sportmonks club identity QA",
      metricLabel: "Data freshness",
      metricValue: "Fresh",
      secondaryMetricLabel: "Sync",
      secondaryMetricValue: "Manual QA",
    },
  ],
  agent: [
    {
      id: "qa-agent-jorge-mendes",
      type: "agent",
      name: "Jorge Mendes",
      sourceImageProvider: "manual_qa",
      sourceImageLicenseStatus: "no_source_image",
      avatarRenderStatus: "fallback",
      avatarRenderVersion: "runtime-css-v1",
      avatarRenderType: "touchline_initials_fallback",
      subtitle: "Agent initials fallback",
      metricLabel: "Data freshness",
      metricValue: "QA fallback",
      secondaryMetricLabel: "Source image",
      secondaryMetricValue: "Unavailable",
    },
  ],
  agency: [
    {
      id: "qa-agency-gestifute",
      type: "agency",
      name: "Gestifute",
      sourceImageProvider: "manual_qa",
      sourceImageLicenseStatus: "no_source_image",
      avatarRenderStatus: "fallback",
      avatarRenderVersion: "runtime-css-v1",
      avatarRenderType: "touchline_initials_fallback",
      subtitle: "Agency monogram fallback",
      metricLabel: "Data freshness",
      metricValue: "QA fallback",
      secondaryMetricLabel: "Source image",
      secondaryMetricValue: "Unavailable",
    },
  ],
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function AvatarPreview({ entity }: { entity: TouchlineIdentityCardModel }) {
  if (entity.type === "club") return <TouchlineClubAvatar club={entity} size="lg" />;
  if (entity.type === "agent") return <TouchlineAgentAvatar agent={entity} size="lg" />;
  return <TouchlineAgencyAvatar agency={entity} size="lg" />;
}

export function TouchlineLiveEntitySearchTest() {
  const [entityType, setEntityType] = useState<EntityKind>("player");
  const [query, setQuery] = useState("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (entityType === "player") return null;
    const entries = identityExamples[entityType];
    const needle = normalize(query);
    return entries.find((entry) => normalize(entry.name).includes(needle)) ?? entries[0];
  }, [entityType, query]);

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-[#f6c84c]/20 bg-[#f6c84c]/[.045] p-4">
        <div className="flex flex-wrap gap-2">
          {(["player", "club", "agent", "agency"] as EntityKind[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntityType(type)}
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[.14em] ${entityType === type ? "border-[#f6c84c]/60 bg-[#f6c84c]/20 text-[#ffe89a]" : "border-white/10 bg-black/25 text-white/55"}`}
            >
              {type}
            </button>
          ))}
        </div>
        {entityType !== "player" ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/65 px-4 text-sm font-bold text-white outline-none transition focus:border-[#f6c84c]/50"
              placeholder={`Search ${entityType} by name`}
            />
            <button
              type="button"
              onClick={() => setSyncedAt(new Date().toISOString())}
              className="h-12 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 text-[9px] font-black uppercase tracking-[.12em] text-cyan-100"
            >
              Sync Now
            </button>
          </div>
        ) : null}
      </div>

      {entityType === "player" ? (
        <SportmonksRegisteredPlayerSearchTest />
      ) : selected ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-100/70">Touchline Rendered Avatar</p>
            <div className="mt-5 flex items-center gap-4">
              <AvatarPreview entity={selected} />
              <div className="min-w-0">
                <p className="truncate text-xl font-black uppercase italic text-white">{selected.name}</p>
                <p className="mt-1 text-xs text-white/50">Touchline Branded Avatar, source metadata kept separate.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 text-xs text-white/60">
              <p>sourceImageProvider: {selected.sourceImageProvider ?? "none"}</p>
              <p>sourceImageLicenseStatus: {selected.sourceImageLicenseStatus ?? "source_tracked"}</p>
              <p>avatarRenderType: {selected.avatarRenderType ?? "touchline_branded_render"}</p>
              <p>avatarRenderStatus: {selected.avatarRenderStatus ?? "fallback"}</p>
              <p>dataFreshnessStatus: {syncedAt ? "fresh_after_manual_sync" : "fresh_for_qa"}</p>
            </div>
          </div>
          <TouchlineIdentityCard entity={selected} />
        </div>
      ) : null}
    </div>
  );
}
