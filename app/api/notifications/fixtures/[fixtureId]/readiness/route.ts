import { handleFixtureAlertStatus } from "@/lib/touchlineArena/fixture-alert-status";
import { createFixtureAlertStatusDependencies } from "@/lib/touchlineArena/fixture-alert-status-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only diagnostics. This endpoint does not activate or send alerts. */
export async function GET(request: Request, context: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await context.params;
  return handleFixtureAlertStatus(request, fixtureId, createFixtureAlertStatusDependencies());
}
