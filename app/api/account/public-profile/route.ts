import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handlePublicOwners(request, "own", publicOwnerDependencies()); }
export async function PUT(request: Request) { return handlePublicOwners(request, "own", publicOwnerDependencies()); }
