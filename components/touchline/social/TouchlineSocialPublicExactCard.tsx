"use client";

import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";

type TouchlineSocialPublicPlayer = Omit<
  TouchlineEliteExactPlayer,
  "sportmonksPlayerId" | "canonicalPlayerId" | "formationPlayerId"
>;

export default function TouchlineSocialPublicExactCard({
  player,
  renderScale,
}: Readonly<{
  player: TouchlineSocialPublicPlayer;
  renderScale: number;
}>) {
  // This presentation-only identity is created after hydration. Provider and
  // canonical identities therefore never cross the server/client RSC boundary.
  const presentationPlayer: TouchlineEliteExactPlayer = {
    ...player,
    sportmonksPlayerId: `public:${player.clubName}:${player.name}`,
  };

  return (
    <TouchlineEliteExactCard
      player={presentationPlayer}
      staticRenderScale={renderScale}
      ensureStaticNameFit
      runtimeLocaleOverride="en-GB"
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showSocialMetrics={false}
      rankingMode="preview"
      forceNeonActive
      imageLoading="eager"
    />
  );
}
