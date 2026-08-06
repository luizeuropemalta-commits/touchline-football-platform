import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  TOUCHLINE_PASSWORD_RECOVERY_COOKIE,
  touchLinePasswordRecoveryCookieOptions,
  verifyTouchLinePasswordRecoveryGrant,
} from "@/lib/server/password-recovery";
import { createClient } from "@/lib/supabase/server";

async function authenticatedRecovery() {
  const supabase = await createClient();
  if (!supabase) return { error: "unavailable" as const };

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "invalid" as const };

  const recoveryGrant = (await cookies()).get(TOUCHLINE_PASSWORD_RECOVERY_COOKIE)?.value;
  if (!verifyTouchLinePasswordRecoveryGrant(recoveryGrant, user.id)) {
    return { error: "invalid" as const };
  }

  return { supabase, user };
}

function clearRecoveryGrant(response: NextResponse, requestUrl: string) {
  response.cookies.set(TOUCHLINE_PASSWORD_RECOVERY_COOKIE, "", {
    ...touchLinePasswordRecoveryCookieOptions(requestUrl),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const recovery = await authenticatedRecovery();
  if ("error" in recovery) {
    // Session probing is a read-only UI check. An expired or absent recovery
    // grant is an expected state, not a failed protected operation, so return a
    // safe 200 payload and let the form render the localized expired-link UI.
    // Service unavailability remains a genuine 503.
    const status = recovery.error === "unavailable" ? 503 : 200;
    return clearRecoveryGrant(
      NextResponse.json({ ok: false, error: recovery.error }, { status }),
      request.url,
    );
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const recovery = await authenticatedRecovery();
  if ("error" in recovery) {
    const status = recovery.error === "unavailable" ? 503 : 401;
    return clearRecoveryGrant(
      NextResponse.json({ ok: false, error: recovery.error }, { status }),
      request.url,
    );
  }

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 400 });
  }

  const { error } = await recovery.supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return clearRecoveryGrant(NextResponse.json({ ok: true }), request.url);
}
