import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  parseTouchlineMarketCheckoutRequest,
  type TouchlineMarketCheckoutRequestError,
} from "@/lib/touchlineArena/market-checkout-request";

export const runtime = "nodejs";

const REQUEST_ERROR_STATUS: Record<TouchlineMarketCheckoutRequestError, number> = {
  "invalid-body": 400,
  "empty-cart": 400,
  "too-many-items": 400,
  "duplicate-card": 409,
  "invalid-card-id": 400,
  "invalid-idempotency-key": 400,
};

const DATABASE_ERROR_STATUS: Record<string, number> = {
  TL_MARKET_AUTH_REQUIRED: 401,
  TL_MARKET_USER_NOT_FOUND: 404,
  TL_MARKET_CARD_NOT_FOUND: 404,
  TL_MARKET_EMPTY_CART: 400,
  TL_MARKET_INVALID_IDEMPOTENCY_KEY: 400,
  TL_MARKET_DUPLICATE_CARD: 409,
  TL_MARKET_IDEMPOTENCY_CONFLICT: 409,
  TL_MARKET_ALREADY_OWNED: 409,
  TL_MARKET_CARD_UNAVAILABLE: 409,
  TL_MARKET_SOLD_OUT: 409,
  TL_MARKET_ROSTER_CAPACITY: 409,
  TL_MARKET_INSUFFICIENT_BALANCE: 409,
};

function databaseErrorCode(message: string) {
  return Object.keys(DATABASE_ERROR_STATUS).find((code) => message.includes(code)) ?? null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "TouchLine Market server is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !hasTouchLineArenaAccess(user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = parseTouchlineMarketCheckoutRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: REQUEST_ERROR_STATUS[parsed.error] },
    );
  }

  const { data, error } = await admin.rpc("checkout_touchline_market_cart", {
    requested_user_id: user.id,
    requested_card_ids: parsed.value.cardIds,
    requested_idempotency_key: parsed.value.idempotencyKey,
  });

  if (error) {
    const code = databaseErrorCode(error.message);
    return NextResponse.json(
      { error: code ?? "TL_MARKET_CHECKOUT_FAILED" },
      { status: code ? DATABASE_ERROR_STATUS[code] : 500 },
    );
  }

  return NextResponse.json(data, { status: 200 });
}
