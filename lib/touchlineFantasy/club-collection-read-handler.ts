import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readClubCollectionServer } from "@/lib/touchlineFantasy/club-collection-read-server";

const headers = { "Cache-Control": "private, no-store" };
/** Authenticated read only. Never initializes a collection or changes a wallet. */
export async function GET() {
  const started = performance.now();
  let previous = started;
  const timings: string[] = [];
  const mark = (phase: string) => {
    const now = performance.now();
    timings.push(`${phase};dur=${Math.round(now - previous)}`);
    previous = now;
  };
  const reply = (body: unknown, status = 200, releaseAvailable?: boolean) => {
    const response = NextResponse.json(body, { status, headers });
    if (process.env.NODE_ENV === "development") {
      timings.push(`total;dur=${Math.round(performance.now() - started)}`);
      response.headers.set("Server-Timing", timings.join(", "));
      // Next's development log sink drops object arguments; serialize only
      // fixed phase names, durations and status, never identity or payload.
      console.info(`[ClubOwner] Collection read timing ${JSON.stringify({ status, timing: timings.join(", "), ...(typeof releaseAvailable === "boolean" ? { releaseAvailable } : {}) })}`);
    }
    return response;
  };
  const fail = (error: string, status: number) => reply({ ok: false, error }, status);
  try {
    const client = await createClient();
    const authentication = client ? await client.auth.getUser() : null;
    mark("auth");
    const user = authentication?.error === null ? authentication.data.user : null;
    if (!user) return fail("AUTH_REQUIRED", 401);
    const result = await readClubCollectionServer(user.id, mark);
    if (result.status === "unavailable") return fail(result.error, result.httpStatus);
    return reply({ ok: true, state: result.state, initialBudget: result.initialBudget,
      releaseAvailable: result.releaseAvailable, coachLifecycleAvailable: result.coachLifecycleAvailable === true, accountId: result.accountId, seasonId: result.seasonId }, 200, result.releaseAvailable);
  } catch { return fail("CLUB_STORAGE_UNAVAILABLE", 503); }
}
