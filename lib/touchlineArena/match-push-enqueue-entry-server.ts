import "server-only";
import { enqueueVerifiedMatchPush } from "./match-push-enqueue-server";
import { normalizeMatchPushSourceAgePolicy } from "./match-push-source-freshness";

type Input = { deviceId: string; fixtureProviderId: string; eventProviderId: string };
type Options = {
  enabled: boolean;
  maximumAgeMs: unknown;
  expiresAt: string;
  locale: "pt-BR" | "en-GB";
  signal: AbortSignal;
};

/** Dormant internal entry: trusted server configuration, never a request DTO.
 * No environment lookup, default ages, scheduler or delivery activation.
 * Unknown history is always false: SQL may dedupe or classify a revision from
 * retained history, but this entry cannot attest permission for an initial row.
 */
export async function enqueueMatchPushFromServer(input: Input, options?: Options) {
  if (options?.enabled !== true) return { status: "not-enqueued" as const };
  const policy = normalizeMatchPushSourceAgePolicy(options.maximumAgeMs);
  if (!policy) return { status: "not-enqueued" as const };
  return enqueueVerifiedMatchPush({
    deviceId: input.deviceId,
    fixtureProviderId: input.fixtureProviderId,
    eventProviderId: input.eventProviderId,
  }, {
    enabled: true,
    historyComplete: false,
    maximumAgeMs: policy,
    expiresAt: options.expiresAt,
    locale: options.locale,
    signal: options.signal,
    now: () => new Date(),
  });
}
