import "server-only";
import { handlePushRehearsalServer } from "@/lib/touchlineArena/push-rehearsal-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePushRehearsalServer(request);
}
