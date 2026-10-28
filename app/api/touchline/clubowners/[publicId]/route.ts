import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  return handlePublicOwners(request, "profile", publicOwnerDependencies(), (await context.params).publicId);
}
