import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  prepareTouchlineManualMarketValueEditorialDecision,
} from "@/lib/touchlineArena/manual-market-value-editorial";
import {
  previewTouchlineManualMarketValueBulk,
  type TouchlineManualMarketValueBulkCandidate,
} from "@/lib/touchlineArena/manual-market-value-bulk";
import { touchlineCountryCode3FromName } from "@/lib/touchlineArena/country-flags";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { loadTouchlineCardEditorialOverrides } from "@/lib/touchlineArena/card-editorial-overrides";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CanonicalPlayer = {
  id: string;
  provider_player_id: string;
  current_club_id: string | null;
  source_updated_at: string | null;
};
type CanonicalMembership = {
  id: string;
  club_id: string;
  competition_id: string;
  status: string;
  provider: string;
  source_updated_at: string | null;
};
type CanonicalClub = {
  id: string;
  competition_id: string;
  provider: string;
  source_updated_at: string | null;
  logo_url: string | null;
};
type CanonicalCompetition = {
  id: string;
  provider: string;
  provider_competition_id: string;
  source_updated_at: string | null;
};
type AtomicPublicationResult = {
  publication_id: string;
  publication_status: string;
  calculated_tier: string;
  nominal_price_gbp: number;
  player_id: string;
};
type AtomicPublicationRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: AtomicPublicationResult[] | null;
    error: { message: string } | null;
  }>;
};

type ReviewProviderRow = {
  id: string;
  display_name: string | null;
  name: string | null;
  nationality: string | null;
  country_id: string | null;
  position: string | null;
};
type ReviewCommandResult = {
  card_state: "COMPLETE" | "REVIEW_REQUIRED";
  missing_fields: string[];
  publication_id: string | null;
  publication_status: string | null;
  calculated_tier: string | null;
  nominal_price_gbp: number | null;
  overrides_changed: boolean;
  publication_synced: boolean;
};
type ReviewCommandRpc = {
  rpc: (name: "touchline_apply_card_editorial_review", args: Record<string, unknown>) => Promise<{
    data: ReviewCommandResult[] | null;
    error: { message: string } | null;
  }>;
};

function text(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function validTimestamp(value: string | null | undefined) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nullableText(value: unknown, max = 200) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = text(value, max);
  return normalized || null;
}

function validCountryCode(value: string | null) {
  return value === null || /^[A-Z]{3}$/.test(value);
}

function reviewFieldValues(value: unknown) {
  const fields = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!fields) return null;
  const unexpected = Object.keys(fields).filter((key) => !["displayName", "shirtNumber", "countryCode3", "position"].includes(key));
  if (unexpected.length) return null;
  const displayName = Object.hasOwn(fields, "displayName") ? nullableText(fields.displayName) : undefined;
  const position = Object.hasOwn(fields, "position") ? nullableText(fields.position, 80) : undefined;
  const countryCode3 = Object.hasOwn(fields, "countryCode3")
    ? nullableText(fields.countryCode3, 3)?.toUpperCase() ?? null
    : undefined;
  const shirtNumber = Object.hasOwn(fields, "shirtNumber")
    ? fields.shirtNumber === null || fields.shirtNumber === "" ? null : Number(fields.shirtNumber)
    : undefined;
  if (
    (displayName !== undefined && displayName !== null && !displayName)
    || (position !== undefined && position !== null && !position)
    || (countryCode3 !== undefined && !validCountryCode(countryCode3))
    || (shirtNumber !== undefined && shirtNumber !== null && (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 999))
  ) return null;
  return { displayName, shirtNumber, countryCode3, position };
}

function atomicPublicationRpc(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  return admin as unknown as AtomicPublicationRpc;
}

function reviewCommandRpc(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  return admin as unknown as ReviewCommandRpc;
}

function canonicalAge(dateOfBirth: string | null, fallbackAge: number | null) {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return Number.isSafeInteger(fallbackAge) ? fallbackAge : null;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) return Number.isSafeInteger(fallbackAge) ? fallbackAge : null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = today.getUTCMonth() > birth.getUTCMonth()
    || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

async function ownerContext() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return { error: NextResponse.json({ error: "Protected editorial administration is not configured." }, { status: 503 }) };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email) || !user?.id) {
    return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  }
  return { admin, user };
}

/** Resolves the exact current player → club → active PL membership chain.
 * A manual entry must not become publishable for a transferred or ambiguous
 * player merely because an editor typed a valid UUID. */
async function canonicalPlayerReady(admin: NonNullable<ReturnType<typeof createAdminClient>>, playerId: string) {
  const { data: player, error: playerError } = await admin
    .from("football_players")
    .select("id,provider_player_id,current_club_id,source_updated_at")
    .eq("id", playerId)
    .maybeSingle<CanonicalPlayer>();
  if (playerError || !player || !validUuid(player.id) || !validUuid(player.current_club_id ?? "") || !validTimestamp(player.source_updated_at)) return null;

  const { data: memberships, error: membershipError } = await admin
    .from("football_squad_members")
    .select("id,club_id,competition_id,status,provider,source_updated_at")
    .eq("player_id", player.id)
    .eq("provider", "sportmonks")
    .eq("status", "active")
    .returns<CanonicalMembership[]>();
  if (membershipError || !memberships || memberships.length !== 1) return null;
  const membership = memberships[0]!;
  if (
    !validUuid(membership.id)
    || membership.club_id !== player.current_club_id
    || !validUuid(membership.competition_id)
    || !validTimestamp(membership.source_updated_at)
  ) return null;

  const { data: club, error: clubError } = await admin
    .from("football_clubs")
    .select("id,competition_id,provider,source_updated_at,logo_url")
    .eq("id", player.current_club_id)
    .maybeSingle<CanonicalClub>();
  if (
    clubError || !club || club.provider !== "sportmonks" || club.competition_id !== membership.competition_id
    || !validTimestamp(club.source_updated_at)
  ) return null;

  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select("id,provider,provider_competition_id,source_updated_at")
    .eq("id", club.competition_id)
    .maybeSingle<CanonicalCompetition>();
  if (
    competitionError || !competition || competition.provider !== "sportmonks"
    || competition.provider_competition_id !== "8" || !validTimestamp(competition.source_updated_at)
  ) return null;

  return { player, membership, club, competition };
}

async function previewBulk(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const selectedClubId = text(body?.selectedClubId, 64).toLowerCase();
  const inputText = typeof body?.text === "string" ? body.text.slice(0, 16_000) : "";
  const effectiveSeason = text(body?.effectiveSeason, 32);
  if (!validUuid(selectedClubId) || !inputText.trim() || !effectiveSeason) {
    return NextResponse.json({ error: "Club, season and bulk rows are required." }, { status: 400 });
  }
  const { data: club, error: clubError } = await context.admin
    .from("football_clubs")
    .select("id,name,competition_id,provider")
    .eq("id", selectedClubId)
    .maybeSingle<{ id: string; name: string; competition_id: string; provider: string }>();
  if (clubError || !club || club.provider !== "sportmonks") return NextResponse.json({ error: "Selected club is not canonical." }, { status: 409 });
  const { data: competition, error: competitionError } = await context.admin
    .from("football_competitions")
    .select("id,provider,provider_competition_id")
    .eq("id", club.competition_id)
    .maybeSingle<{ id: string; provider: string; provider_competition_id: string }>();
  if (competitionError || !competition || competition.provider !== "sportmonks" || competition.provider_competition_id !== "8") {
    return NextResponse.json({ error: "Selected club is outside the canonical Premier League scope." }, { status: 409 });
  }
  const { data: players, error: playerError } = await context.admin
    .from("football_players")
    .select("id,display_name,name,current_club_id,date_of_birth,age")
    .eq("current_club_id", selectedClubId)
    .limit(100)
    .returns<Array<{ id: string; display_name: string | null; name: string | null; current_club_id: string | null; date_of_birth: string | null; age: number | null }>>();
  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });
  const playerIds = (players ?? []).map((player) => player.id).filter(validUuid);
  const { data: memberships, error: membershipError } = playerIds.length
    ? await context.admin.from("football_squad_members")
      .select("player_id,club_id,competition_id,status,provider,position")
      .eq("provider", "sportmonks")
      .eq("status", "active")
      .in("player_id", playerIds)
      .returns<Array<{ player_id: string; club_id: string; competition_id: string; status: string; provider: string; position: string | null }>>()
    : { data: [], error: null };
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  const membershipsByPlayer = new Map<string, typeof memberships>();
  for (const membership of memberships ?? []) {
    membershipsByPlayer.set(membership.player_id, [...(membershipsByPlayer.get(membership.player_id) ?? []), membership]);
  }
  const candidates: TouchlineManualMarketValueBulkCandidate[] = (players ?? []).map((player) => {
    const playerMemberships = membershipsByPlayer.get(player.id) ?? [];
    const exactMembership = playerMemberships.length === 1 && playerMemberships[0]!.club_id === selectedClubId && playerMemberships[0]!.competition_id === club.competition_id;
    return {
      playerId: player.id,
      canonicalName: player.display_name?.trim() || player.name?.trim() || "Unnamed player",
      clubId: selectedClubId,
      clubName: club.name,
      position: exactMembership ? playerMemberships[0]!.position : null,
      canonicalAge: canonicalAge(player.date_of_birth, player.age),
      hasOneActiveMembership: exactMembership,
    };
  });
  return NextResponse.json({ ok: true, preview: previewTouchlineManualMarketValueBulk({
    text: inputText,
    selectedClubId,
    canonicalClubCandidates: candidates,
    effectiveSeason,
    publicationState: "ready_for_review",
    lastReviewedAt: new Date().toISOString(),
  }) });
}

/** Saves protected editorial overrides and, once input completeness is real,
 * derives the canonical publication inside the same database transaction. */
async function saveReviewOverrides(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = text(body?.playerId, 64).toLowerCase();
  const requested = reviewFieldValues(body?.fields);
  if (!validUuid(playerId) || !requested || !Object.values(requested).some((value) => value !== undefined)) {
    return NextResponse.json({ error: "A canonical player and one valid editorial field are required." }, { status: 400 });
  }
  const canonical = await canonicalPlayerReady(context.admin, playerId);
  if (!canonical) return NextResponse.json({ error: "The player is not uniquely bound to an active canonical Premier League membership." }, { status: 409 });

  const { data: provider, error: providerError } = await context.admin
    .from("football_players")
    .select("id,display_name,name,nationality,country_id,position")
    .eq("id", playerId)
    .maybeSingle<ReviewProviderRow>();
  if (providerError || !provider) return NextResponse.json({ error: providerError?.message ?? "Canonical provider data is unavailable." }, { status: 500 });

  const providerCountryCode3 = touchlineCountryCode3FromName(provider.nationality);
  const fields = Object.fromEntries(Object.entries({
    displayName: requested.displayName,
    shirtNumber: requested.shirtNumber,
    countryCode3: requested.countryCode3,
    position: requested.position,
  }).filter(([, value]) => value !== undefined));
  const { data: commandResult, error: commandError } = await reviewCommandRpc(context.admin)
    .rpc("touchline_apply_card_editorial_review", {
      p_player_id: playerId,
      p_field_overrides: fields,
      p_provider_country_code3: providerCountryCode3,
      p_has_club_asset: Boolean(canonical.club.logo_url?.trim()),
      p_actor_id: context.user.id,
    });
  if (commandError || !commandResult?.[0]) {
    const migrationMissing = /function|schema cache|does not exist|Could not find/i.test(commandError?.message ?? "");
    return NextResponse.json({ error: migrationMissing ? "The Card Engine auto-publication migration is not applied yet." : commandError?.message ?? "The Card Engine command returned no result." }, { status: migrationMissing ? 503 : 500 });
  }
  const result = commandResult[0];
  return NextResponse.json({
    ok: true,
    cardReview: { state: result.card_state, missingFields: result.missing_fields },
    effective: null,
    changedFields: result.overrides_changed,
    publication: result.publication_id ? {
      id: result.publication_id, status: result.publication_status,
      tier: result.calculated_tier, nominalPriceGbp: result.nominal_price_gbp,
      synchronized: result.publication_synced,
    } : null,
  });
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("action") === "bulk-preview") return previewBulk(request);
  if (request.nextUrl.searchParams.get("action") === "save-review") return saveReviewOverrides(request);
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid editorial request." }, { status: 400 });

  const playerId = text(body.playerId, 64).toLowerCase();
  const effectiveSeason = text(body.effectiveSeason, 32);
  const marketValueEur = body.marketValueEur;
  const lastReviewedAt = text(body.lastReviewedAt, 64) || new Date().toISOString();
  const internalNote = text(body.internalNote, 4_000) || undefined;
  const internalSource = text(body.internalSource, 2_000) || undefined;
  if (
    !validUuid(playerId)
    || typeof marketValueEur !== "number"
    || !Number.isSafeInteger(marketValueEur)
    || marketValueEur < 0
  ) {
    return NextResponse.json({ error: "A canonical player and whole EUR value are required." }, { status: 400 });
  }

  const canonical = await canonicalPlayerReady(context.admin, playerId);
  if (!canonical) {
    return NextResponse.json({ error: "The player is not uniquely bound to an active canonical Premier League membership." }, { status: 409 });
  }

  const [{ data: provider, error: providerError }, { data: membership }, { data: club }, overrides] = await Promise.all([
    context.admin.from("football_players").select("display_name,name,nationality,position").eq("id", playerId).maybeSingle<Pick<ReviewProviderRow, "display_name" | "name" | "nationality" | "position">>(),
    context.admin.from("football_squad_members").select("jersey_number,position").eq("id", canonical.membership.id).maybeSingle<{ jersey_number: number | null; position: string | null }>(),
    context.admin.from("football_clubs").select("logo_url").eq("id", canonical.club.id).maybeSingle<{ logo_url: string | null }>(),
    loadTouchlineCardEditorialOverrides([playerId], context.admin),
  ]);
  if (providerError || !provider || !membership) {
    return NextResponse.json({ error: providerError?.message ?? "Canonical provider data is unavailable." }, { status: 500 });
  }
  const override = overrides.get(playerId);
  const cardReview = evaluateTouchlineCardCompleteness({
    displayName: override?.displayName ?? provider.display_name ?? provider.name,
    shirtNumber: override?.shirtNumber ?? membership.jersey_number,
    countryCode3: override?.countryCode3 ?? touchlineCountryCode3FromName(provider.nationality),
    position: override?.position ?? membership.position ?? provider.position,
    hasVerifiedMarketValue: true,
    hasClubAsset: Boolean(club?.logo_url?.trim()),
  });
  // A publication is an output, never a user-selected review step. Incomplete
  // inputs retain the protected market-value record only; final completeness
  // publishes automatically through the atomic command below.
  const publicationState = cardReview.state === "COMPLETE" ? "published" : "market_value_required";

  const { data: existing, error: existingError } = await context.admin
    .from("touchline_card_publications")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (existingError && !/does not exist|schema cache|Could not find the table/i.test(existingError.message)) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (existingError) {
    return NextResponse.json({ error: "The manual card-publication migration is not applied yet." }, { status: 503 });
  }

  const decision = prepareTouchlineManualMarketValueEditorialDecision({
    playerId,
    effectiveSeason,
    marketValueEur,
    publicationState: publicationState as "detected" | "market_value_required" | "ready_for_review" | "ready_to_publish" | "published" | "inactive_in_competition" | "archived",
    lastReviewedAt,
    ...(internalNote ? { internalNote } : {}),
    ...(internalSource ? { internalSource } : {}),
  }, existing && existing.effective_season === effectiveSeason ? {
    tierKey: existing.calculated_tier,
    nominalPrice: existing.calculated_nominal_price_gbp ?? existing.calculated_price_tc,
    effectiveSeason: existing.effective_season,
    policyVersion: existing.policy_version,
  } : null);
  if (!decision) return NextResponse.json({ error: "The editorial card classification could not be prepared." }, { status: 400 });

  const { data: commandResult, error: commandError } = await atomicPublicationRpc(context.admin)
    .rpc("touchline_apply_manual_card_publication", {
      p_player_id: playerId,
      p_membership_id: canonical.membership.id,
      p_competition_id: canonical.competition.id,
      p_effective_season: effectiveSeason,
      p_market_value_eur: marketValueEur,
      p_calculated_tier: decision.classification.tierKey,
      p_nominal_price_gbp: decision.classification.nominalPrice,
      p_policy_version: decision.classification.policyVersion,
      p_publication_status: publicationState,
      p_last_reviewed_at: lastReviewedAt,
      p_internal_note: internalNote ?? null,
      p_internal_source: internalSource ?? null,
      p_actor_id: context.user.id,
    });
  if (commandError || !commandResult?.[0]) {
    const migrationMissing = /function|schema cache|does not exist|Could not find/i.test(commandError?.message ?? "");
    return NextResponse.json(
      { error: migrationMissing ? "The atomic card-publication migration is not applied yet." : commandError?.message ?? "The atomic publication command returned no result." },
      { status: migrationMissing ? 503 : 500 },
    );
  }
  const publication = commandResult[0];

  return NextResponse.json({
    ok: true,
    playerId,
    publicationStatus: publication.publication_status,
    calculatedTier: publication.calculated_tier,
    nominalPriceGbp: publication.nominal_price_gbp,
    cardReview,
    publishedPresentation: publicationState === "published" ? decision.editorialCard : null,
  });
}

export async function PATCH(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = text(body?.action, 32);
  const historyId = text(body?.historyId, 64).toLowerCase();
  if (action !== "revert" || !validUuid(historyId)) return NextResponse.json({ error: "A valid immutable history record is required." }, { status: 400 });

  const { data: commandResult, error: commandError } = await atomicPublicationRpc(context.admin)
    .rpc("touchline_revert_manual_card_publication", {
      p_history_id: historyId,
      p_actor_id: context.user.id,
    });
  if (commandError || !commandResult?.[0]) {
    const migrationMissing = /function|schema cache|does not exist|Could not find/i.test(commandError?.message ?? "");
    return NextResponse.json(
      { error: migrationMissing ? "The atomic card-publication migration is not applied yet." : commandError?.message ?? "The atomic revert command returned no result." },
      { status: migrationMissing ? 503 : 500 },
    );
  }
  const publication = commandResult[0];
  return NextResponse.json({
    ok: true,
    restoredPublicationId: publication.publication_id,
    publicationStatus: publication.publication_status,
    calculatedTier: publication.calculated_tier,
    nominalPriceGbp: publication.nominal_price_gbp,
  });
}
