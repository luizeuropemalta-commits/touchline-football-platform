import { handleCoachEditorial } from "@/lib/touchlineArena/coach-editorial-handler";
import { coachEditorialDependencies } from "@/lib/touchlineArena/coach-editorial-server";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handleCoachEditorial(request, coachEditorialDependencies()); }
export function POST(request: Request) { return handleCoachEditorial(request, coachEditorialDependencies()); }
