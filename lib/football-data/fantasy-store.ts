import { createAdminClient } from "@/lib/supabase/admin";
import type { TouchlineFantasyFixtureFeed, TouchlineProviderCapabilities } from "@/lib/football-data/types";
import { sanitizeProviderPayloadForPersistence } from "@/lib/football-data/provider-payload-sanitize";
import { reconcileTouchlineProvisionalShirtsFromOfficialLineup } from "@/lib/football-data/card-engine-provisional-lineup-sync";

import { coachEditorialEvidenceEnabled, parseCoachFeedReceipt, stageObservedCoachEvidence } from "./coach-editorial-evidence.ts";

export type FantasyPersistenceResult = {
  persisted: boolean;
  reason?: string;
  editorialError?: string;
};

export async function persistFantasyFixtureFeed(feed: TouchlineFantasyFixtureFeed): Promise<FantasyPersistenceResult> {
  const supabase = createAdminClient();
  if (!supabase) return { persisted: false, reason: "supabase_admin_not_configured" };
  const sanitizedFeed = sanitizeProviderPayloadForPersistence(feed);
  const persistedAt = new Date().toISOString();

  const editorial = coachEditorialEvidenceEnabled();
  const write = supabase.from("football_fantasy_fixture_feeds").upsert(
    {
      provider: sanitizedFeed.fixture.provider,
      provider_fixture_id: sanitizedFeed.fixture.providerId,
      fixture_payload: sanitizedFeed.fixture,
      lineups_payload: sanitizedFeed.lineups,
      formations_payload: sanitizedFeed.formations,
      sidelined_payload: sanitizedFeed.sidelined,
      events_payload: sanitizedFeed.events,
      last_synced_at: persistedAt,
    },
    { onConflict: "provider,provider_fixture_id" },
  );

  const { data, error } = editorial ? await write.select("id,last_synced_at").single() : await write;
  if (error) return { persisted: false, reason: error.message };
  const editorialError = await stageObservedCoachEvidence(supabase, feed, sanitizedFeed,
    parseCoachFeedReceipt(data && { id: data.id, persistedAt: data.last_synced_at }));
  const provisionalReconciliation = await reconcileTouchlineProvisionalShirtsFromOfficialLineup({
    admin: supabase,
    feed: sanitizedFeed,
    persistedAt,
  });
  if (
    !provisionalReconciliation.reconciled
    && provisionalReconciliation.reason !== "official-lineup-not-ready"
    && provisionalReconciliation.reason !== "provisional-schema-unavailable"
  ) {
    return { persisted: false, reason: `card_engine_provisional_reconciliation:${provisionalReconciliation.reason}` };
  }
  return { persisted: true, ...(editorialError ? { editorialError } : {}) };
}

export async function persistProviderCapabilities(capabilities: TouchlineProviderCapabilities): Promise<FantasyPersistenceResult> {
  const supabase = createAdminClient();
  if (!supabase) return { persisted: false, reason: "supabase_admin_not_configured" };
  const sanitizedCapabilities = sanitizeProviderPayloadForPersistence(capabilities);

  const { error } = await supabase.from("football_provider_capabilities").upsert(
    {
      provider: sanitizedCapabilities.provider,
      resources_payload: sanitizedCapabilities.resources,
      enrichments_payload: sanitizedCapabilities.enrichments,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );

  if (error) return { persisted: false, reason: error.message };
  return { persisted: true };
}
