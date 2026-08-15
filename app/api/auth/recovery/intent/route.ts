import { NextResponse } from "next/server";

import {
  createTouchLinePasswordRecoveryIntent,
  TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE,
  touchLinePasswordRecoveryIntentCookieOptions,
} from "@/lib/server/password-recovery";

function clearRecoveryIntent(response: NextResponse, requestUrl: string) {
  response.cookies.set(TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE, "", {
    ...touchLinePasswordRecoveryIntentCookieOptions(requestUrl),
    maxAge: 0,
  });
  return response;
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return clearRecoveryIntent(
      NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 }),
      request.url,
    );
  }

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 320) {
    return clearRecoveryIntent(
      NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 }),
      request.url,
    );
  }

  try {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE,
      createTouchLinePasswordRecoveryIntent(email),
      touchLinePasswordRecoveryIntentCookieOptions(request.url),
    );
    return response;
  } catch {
    return clearRecoveryIntent(
      NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }),
      request.url,
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  return clearRecoveryIntent(NextResponse.json({ ok: true }), request.url);
}
