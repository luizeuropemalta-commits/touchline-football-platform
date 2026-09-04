import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  TOUCHLINE_QA_SUPABASE_PROJECT_REF,
  inspectTouchlineQaVercelEnvironment,
} from "@/lib/touchlinePreview/qa-environment-verifier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

type SafeResult = Readonly<{ status: "PASS" | "FAIL"; reason: string }>;

function response(result: SafeResult, status: number) {
  return NextResponse.json(result, { status, headers: HEADERS });
}

/**
 * Owner-only and QA-only. The response deliberately contains exactly a
 * PASS/FAIL state and a non-sensitive reason code.
 */
export async function GET(request: NextRequest) {
  const environment = inspectTouchlineQaVercelEnvironment({
    environment: process.env,
    requestHostname: request.nextUrl.hostname,
  });
  if (environment.status === "FAIL") return response(environment, 404);

  const supabase = await createClient();
  if (!supabase) return response({ status: "FAIL", reason: "OWNER_ACCESS_REQUIRED" }, 401);
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
    return response({ status: "FAIL", reason: "OWNER_ACCESS_REQUIRED" }, 403);
  }

  const admin = createAdminClient();
  if (!admin) return response({ status: "FAIL", reason: "QA_CREDENTIAL_VERIFICATION_FAILED" }, 503);

  try {
    const { error } = await admin.rpc("touchline_assert_qa_fixture_target", {
      p_project_ref: TOUCHLINE_QA_SUPABASE_PROJECT_REF,
    });
    if (error) return response({ status: "FAIL", reason: "QA_CREDENTIAL_VERIFICATION_FAILED" }, 503);
  } catch {
    return response({ status: "FAIL", reason: "QA_CREDENTIAL_VERIFICATION_FAILED" }, 503);
  }

  return response({ status: "PASS", reason: "QA_ENVIRONMENT_AND_CREDENTIALS_VERIFIED" }, 200);
}
