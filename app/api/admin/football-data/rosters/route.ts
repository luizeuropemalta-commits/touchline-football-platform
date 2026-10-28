import { NextRequest, NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/admin/owner';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { hasTouchLineArenaAccess } from '@/lib/touchlineArena/auth-access';
import { parseRosterCommand } from '@/lib/football-data/roster-reconciliation-contract';
import { readRosterStatus, runRosterCommand } from '@/lib/football-data/roster-reconciliation-server';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
async function owner() { const session = await createClient(); if (!session)
    return null; const { data: { user }, error } = await session.auth.getUser(); return !error && hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email) ? user : null; }
export async function GET() { try {
    if (!await owner())
        return reply({ ok: false, error: 'FORBIDDEN' }, 403);
    const admin = createAdminClient();
    if (!admin)
        return reply({ ok: false, error: 'ROSTER_UNAVAILABLE' }, 503);
    return reply({ ok: true, status: await readRosterStatus(admin) });
}
catch {
    return reply({ ok: false, error: 'ROSTER_UNAVAILABLE' }, 503);
} }
/** Enforce the byte budget while reading; Content-Length is only a hint and
 * cannot authorize a larger chunked body. No privileged client exists yet. */
async function readRosterCommand(request: NextRequest) {
    const contentType = request.headers.get('content-type')?.trim() ?? '';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType))
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
    const length = request.headers.get('content-length');
    if (length !== null && !/^\d{1,12}$/.test(length)) throw new Error('INVALID_COMMAND');
    if (length !== null && Number(length) > 4096) throw new Error('BODY_TOO_LARGE');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('INVALID_COMMAND');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, text = '', complete = false;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) { complete = true; break; }
            bytes += value.byteLength;
            if (bytes > 4096) throw new Error('BODY_TOO_LARGE');
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        if (length !== null && bytes !== Number(length)) throw new Error('INVALID_COMMAND');
        return parseRosterCommand(JSON.parse(text));
    } catch (error) {
        if (error instanceof Error && error.message === 'BODY_TOO_LARGE') throw error;
        throw new Error('INVALID_COMMAND');
    } finally {
        if (!complete) void reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
export async function POST(request: NextRequest) {
    if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site')
        return reply({ ok: false, error: 'INVALID_ORIGIN' }, 403);
    try {
        const user = await owner();
        if (!user)
            return reply({ ok: false, error: 'FORBIDDEN' }, 403);
        let command;
        try { command = await readRosterCommand(request); }
        catch (error) {
            const code = error instanceof Error ? error.message : 'INVALID_COMMAND';
            const status = code === 'BODY_TOO_LARGE' ? 413 : code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : 400;
            return reply({ ok: false, error: status === 400 ? 'INVALID_COMMAND' : code }, status);
        }
        const admin = createAdminClient();
        if (!admin)
            return reply({ ok: false, error: 'ROSTER_UNAVAILABLE' }, 503);
        const result = await runRosterCommand(admin, `owner:${user!.id}`, command);
        return reply({ ok: true, result });
    }
    catch (error) {
        const allowed = ['ROSTER_PAUSED', 'ROSTER_APPLICATION_PAUSED', 'ROSTER_REQUEST_CONFLICT', 'ROSTER_REVISION_CONFLICT', 'ROSTER_SOURCE_EXPIRED', 'ROSTER_CAPTURE_BUSY', 'ROSTER_BASELINE_CHANGED', 'ROSTER_NO_APPROVED_CHANGES', 'ROSTER_OPERATION_NOT_ACTIONABLE'];
        const code = error instanceof Error && allowed.includes(error.message) ? error.message : 'ROSTER_NOT_CONFIRMED';
        return reply({ ok: false, error: code }, code === 'ROSTER_NOT_CONFIRMED' ? 503 : 409);
    }
}
