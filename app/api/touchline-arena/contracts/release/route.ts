import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  parseTouchlineMarketContractReleaseRequest,
  type TouchlineMarketContractReleaseRequestError,
} from "@/lib/touchlineArena/market-contract-release-request";

export const runtime = "nodejs";

const REQUEST_ERROR_STATUS: Record<TouchlineMarketContractReleaseRequestError, number> = {
  "invalid-body": 400,
  "unexpected-field": 400,
  "invalid-card-id": 400,
  "invalid-idempotency-key": 400,
};

const DATABASE_ERROR_STATUS: Record<string, number> = {
  TL_MARKET_AUTH_REQUIRED: 401,
  TL_MARKET_USER_NOT_FOUND: 404,
  TL_MARKET_CARD_NOT_FOUND: 404,
  TL_MARKET_CONTRACT_NOT_FOUND: 404,
  TL_MARKET_CONTRACT_NOT_ACTIVE: 409,
  TL_MARKET_RELEASE_INVALID_CARD_ID: 400,
  TL_MARKET_RELEASE_INVALID_IDEMPOTENCY_KEY: 400,
  TL_MARKET_RELEASE_IDEMPOTENCY_CONFLICT: 409,
};

function databaseErrorCode(message: string) {
  return Object.keys(DATABASE_ERROR_STATUS).find((code) => message.includes(code)) ?? null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return NextResponse.json(
      { error: "TouchLine Market server is not configured." },
      { status: 503 },
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !hasTouchLineArenaAccess(user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = parseTouchlineMarketContractReleaseRequest(
    await request.json().catch(() => null),
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: REQUEST_ERROR_STATUS[parsed.error] },
    );
  }

  const { data, error } = await admin.rpc("release_touchline_card_contract", {
    requested_user_id: user.id,
    requested_card_id: parsed.value.cardId,
    requested_idempotency_key: parsed.value.idempotencyKey,
  });

  if (error) {
    const code = databaseErrorCode(error.message);
    return NextResponse.json(
      { error: code ?? "TL_MARKET_CONTRACT_RELEASE_FAILED" },
      { status: code ? DATABASE_ERROR_STATUS[code] : 500 },
    );
  }

  return NextResponse.json(data, { status: 200 });
}
