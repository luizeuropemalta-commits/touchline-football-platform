import ArenaClient from "./ArenaClient";
import { redirect } from "next/navigation";
import { parseTouchlineArenaPanel } from "@/lib/touchlineArena/arena-navigation";
import { parseTouchlineArenaIntroIntent } from "@/lib/touchlineArena/arena-intro";
import { touchlineClubOwnerProfileHref, touchlineClubOwnerSubstitutionHref } from "@/lib/touchlineArena/club-owner-routes";

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
  }>;
}) {
  const params = await searchParams;
  const firstValue = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const initialPanel = parseTouchlineArenaPanel(params.panel);

  if (initialPanel) {
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
    if (initialPanel === "bench" || initialPanel === "formation") redirect(touchlineClubOwnerSubstitutionHref(lang));
    if (initialPanel === "live" || initialPanel === "watch") redirect(`/live${suffix}`);
    if (initialPanel === "rankings") redirect(`/touchline-tables${suffix}`);
    redirect(touchlineClubOwnerProfileHref(lang));
  }

  return (
    <ArenaClient
      initialPanel={initialPanel}
      initialContractPlayerId={firstValue(params.contractPlayer)}
      initialContractPlayerName={firstValue(params.contractName)}
      initialContractClubId={firstValue(params.contractClub)}
      initialIntroIntent={parseTouchlineArenaIntroIntent({
        intro: firstValue(params.intro),
        skipIntro: firstValue(params.skipIntro),
      })}
    />
  );
}
