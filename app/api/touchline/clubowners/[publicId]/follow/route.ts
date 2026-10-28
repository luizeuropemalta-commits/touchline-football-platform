import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ publicId: string }> }) {
  return handlePublicOwners(request, "follow", publicOwnerDependencies(), (await context.params).publicId);
}
