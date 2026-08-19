import { persistProviderCapabilities, type FantasyPersistenceResult } from "@/lib/football-data/fantasy-store";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type {
  FootballDataProvider,
  TouchlineProviderCapabilities,
  TouchlineProviderCapability,
} from "@/lib/football-data/types";

type CapabilityProvider = Pick<FootballDataProvider, "getSubscriptionCapabilities">;
type CapabilityPersister = (capabilities: TouchlineProviderCapabilities) => Promise<FantasyPersistenceResult>;

export type ProviderCapabilitySyncResult = {
  ok: boolean;
  status: "success" | "error";
  resourceCount: number;
  enrichmentCount: number;
  availableResources: string[];
  availableEnrichments: string[];
  errors: string[];
};

function capabilityLabel(capability: TouchlineProviderCapability) {
  return capability.name?.trim() || capability.endpoint?.trim() || capability.id.trim();
}

function availableCapabilityLabels(capabilities: TouchlineProviderCapability[]) {
  return [...new Set(
    capabilities
      .filter((capability) => capability.available !== false)
      .map(capabilityLabel)
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

/**
 * Reads the Sportmonks account entitlement from the server, stores the raw
 * provider response behind the existing server-only boundary, and returns
 * only a small owner-safe summary. This makes feature rollout depend on the
 * subscribed capability instead of the public component catalogue.
 */
export async function syncSportmonksProviderCapabilities(
  dependencies: {
    provider?: CapabilityProvider;
    persist?: CapabilityPersister;
  } = {},
): Promise<ProviderCapabilitySyncResult> {
  const provider = dependencies.provider ?? createFootballDataProvider("sportmonks");
  const persist = dependencies.persist ?? persistProviderCapabilities;
  const response = await provider.getSubscriptionCapabilities();

  if (!response.ok) {
    return {
      ok: false,
      status: "error",
      resourceCount: 0,
      enrichmentCount: 0,
      availableResources: [],
      availableEnrichments: [],
      errors: [response.error.message],
    };
  }

  const persisted = await persist(response.data);
  if (!persisted.persisted) {
    return {
      ok: false,
      status: "error",
      resourceCount: response.data.resources.length,
      enrichmentCount: response.data.enrichments.length,
      availableResources: availableCapabilityLabels(response.data.resources),
      availableEnrichments: availableCapabilityLabels(response.data.enrichments),
      errors: [persisted.reason ?? "Provider capabilities could not be stored."],
    };
  }

  return {
    ok: true,
    status: "success",
    resourceCount: response.data.resources.length,
    enrichmentCount: response.data.enrichments.length,
    availableResources: availableCapabilityLabels(response.data.resources),
    availableEnrichments: availableCapabilityLabels(response.data.enrichments),
    errors: [],
  };
}
