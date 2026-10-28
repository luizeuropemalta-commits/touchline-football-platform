import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rosterCronCommand, runRosterCommand } from '@/lib/football-data/roster-reconciliation-server';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: NextRequest) {
    const secret = process.env.TOUCHLINE_ROSTER_CRON_SECRET, token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!secret || secret.length < 32 || !token || Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret)))
        return reply({ ok: false, error: 'FORBIDDEN' }, 403);
    try {
        const admin = createAdminClient();
        if (!admin)
            return reply({ ok: false, error: 'UNAVAILABLE' }, 503);
        const result = await runRosterCommand(admin, 'cron:roster-v1', rosterCronCommand());
        return reply({ ok: true, result }, 200);
    }
    catch (error) {
        return reply({ ok: false, error: error instanceof Error && error.message === 'ROSTER_PAUSED' ? 'ROSTER_PAUSED' : 'ROSTER_NOT_CONFIRMED' }, 503);
    }
}
export async function GET() { return NextResponse.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } }); }
