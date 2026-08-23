import ArenaClient from "./ArenaClient";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseTouchlineArenaPanel } from "@/lib/touchlineArena/arena-navigation";
import { parseTouchlineArenaIntroIntent } from "@/lib/touchlineArena/arena-intro";
import { touchlineClubOwnerProfileHref, touchlineClubOwnerSubstitutionHref } from "@/lib/touchlineArena/club-owner-routes";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { TOUCHLINE_QA_HOSTNAME } from "@/lib/touchlineArena/public-origin";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";

// This read only controls the protected Card Engine affordance. It must not
// leave the App Router's global loading boundary open if Supabase auth stalls.
const ARENA_SERVER_AUTH_READ_TIMEOUT_MS = 8_000;

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{
    panel?: string | string[];
    contractPlayer?: string | string[];
    contractName?: string | string[];
    contractClub?: string | string[];
    intro?: string | string[];
    skipIntro?: string | string[];
    lang?: string | string[];
    qaEditor?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const firstValue = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const initialPanel = parseTouchlineArenaPanel(params.panel);
  // This route is intentionally reachable only on the exact stable QA host.
  // The client applies a second authenticated-persona check before edits/save.
  const requestHost = (await headers()).get("host")?.split(":")[0]?.toLowerCase();
  const initialQaVisualEditor = firstValue(params.qaEditor) === "1"
    && requestHost === TOUCHLINE_QA_HOSTNAME;
  if (initialPanel && initialPanel !== "bench" && !initialQaVisualEditor) {
    const marketParams = new URLSearchParams();
    const lang = firstValue(params.lang);
    const contractPlayer = firstValue(params.contractPlayer);
    const contractName = firstValue(params.contractName);
    const contractClub = firstValue(params.contractClub);
    if (lang) marketParams.set("lang", lang);
    if (initialPanel === "market") {
      if (contractPlayer) marketParams.set("contractPlayer", contractPlayer);
      if (contractName) marketParams.set("contractName", contractName);
      if (contractClub) marketParams.set("contractClub", contractClub);
      redirect(`/market-transfer${marketParams.size ? `?${marketParams.toString()}` : ""}`);
    }
    const suffix = marketParams.size ? `?${marketParams.toString()}` : "";
    if (initialPanel === "formation") redirect(touchlineClubOwnerSubstitutionHref(lang));
    if (initialPanel === "live" || initialPanel === "watch") redirect(`/live${suffix}`);
    if (initialPanel === "rankings") redirect(`/touchline-tables${suffix}`);
    redirect(touchlineClubOwnerProfileHref(lang));
  }

  const [supabase, initialTwoDimensionalFormationRegistry] = await Promise.all([
    createClient(),
    readTouchlineFormationGeometryRegistry(),
  ]);
  const user = supabase
    ? await resolveServerReadWithin(
      supabase.auth.getUser().then(({ data }) => data.user),
      null,
      ARENA_SERVER_AUTH_READ_TIMEOUT_MS,
    )
    : null;

  return (
    <ArenaClient
      initialPanel={initialPanel}
      initialLocale={normalizeTouchLineLocale(firstValue(params.lang))}
      initialContractPlayerId={firstValue(params.contractPlayer)}
      initialContractPlayerName={firstValue(params.contractName)}
      initialContractClubId={firstValue(params.contractClub)}
      initialIntroIntent={parseTouchlineArenaIntroIntent({
        intro: firstValue(params.intro),
        skipIntro: firstValue(params.skipIntro),
      })}
      initialQaVisualEditor={initialQaVisualEditor}
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      initialTwoDimensionalFormationRegistry={initialTwoDimensionalFormationRegistry}
    />
  );
}
