import { NextResponse } from "next/server";

import { persistProviderCapabilities } from "@/lib/football-data/fantasy-store";
import { footballDataErrorHttpStatus } from "@/lib/football-data/http";
import { publicFootballDataFailure } from "@/lib/football-data/public-error";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineProviderCapability } from "@/lib/football-data/types";
import { requireOwnerOrLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

function stripCapabilityRaw(capability: TouchlineProviderCapability): TouchlineProviderCapability {
  const clean = { ...capability };
  delete clean.raw;
  return clean;
}

export async function GET(request: Request) {
  const accessError = await requireOwnerOrLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const provider = createFootballDataProvider("sportmonks");
  const result = await provider.getSubscriptionCapabilities();

  if (!result.ok) {
    return NextResponse.json(
      publicFootballDataFailure(result.error.code),
      { status: footballDataErrorHttpStatus(result.error.status) },
    );
  }

  const persistence = await persistProviderCapabilities(result.data);

  return NextResponse.json({
    ok: true,
    data: {
      provider: result.data.provider,
      fetchedAt: result.data.fetchedAt,
      resources: result.data.resources.map(stripCapabilityRaw),
      enrichments: result.data.enrichments.map(stripCapabilityRaw),
    },
    cached: result.cached ?? false,
    fetchedAt: result.fetchedAt,
    persistence,
  });
}
