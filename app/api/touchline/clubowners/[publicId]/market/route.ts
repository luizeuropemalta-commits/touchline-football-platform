import { handlePublicMarket } from '@/lib/touchlineArena/clubowner-public-market-handler';
import { publicMarketDependencies } from '@/lib/touchlineArena/clubowner-public-market-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ publicId: string }> };
export async function GET(request: Request, context: Context) {
  return handlePublicMarket(request, (await context.params).publicId, publicMarketDependencies());
}
export async function POST(request: Request, context: Context) {
  return handlePublicMarket(request, (await context.params).publicId, publicMarketDependencies());
}
