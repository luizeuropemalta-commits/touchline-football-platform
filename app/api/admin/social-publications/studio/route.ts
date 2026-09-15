import { studioRequestHandler } from "@/lib/touchlineArena/social-studio-request";
import { authorizeStudio, saveStudioAction } from "@/lib/touchlineArena/social-studio-server";

export const runtime = "nodejs";

export const POST = studioRequestHandler({ authorize: authorizeStudio, save: saveStudioAction });
