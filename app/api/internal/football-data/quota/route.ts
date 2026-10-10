import { serveConfiguredFixtureAuthority } from '@/lib/football-data/configured-fixture-authority-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return serveConfiguredFixtureAuthority(request);
}
