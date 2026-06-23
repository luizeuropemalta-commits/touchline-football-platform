import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const verificationStatuses = new Set([
  "unverified_agent",
  "verified_agent",
  "fifa_licensed_agent",
  "agency_verified",
]);

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanCountry(value: unknown) {
  const country = cleanText(value, 2).toUpperCase();
  return country.length === 2 ? country : null;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cleanStatus(value: unknown) {
  const status = cleanText(value, 40);
  return verificationStatuses.has(status) ? status : "unverified_agent";
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId, profile } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("agent_identity_verifications")
      .select(
        "id, fifa_agent_id, fifa_license_number, legal_name, country_code, agency_name, verification_status, license_expires_on, official_document_path, official_document_name, official_document_uploaded_at, metadata, created_at, updated_at",
      )
      .eq("agency_id", agencyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      verification:
        data ??
        {
          id: null,
          fifa_agent_id: "",
          fifa_license_number: "",
          legal_name: profile.full_name ?? user.email?.split("@")[0] ?? "",
          country_code: "MT",
          agency_name: "",
          verification_status: "unverified_agent",
          license_expires_on: null,
          official_document_path: null,
          official_document_name: null,
          official_document_uploaded_at: null,
          metadata: {},
        },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load agent verification." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { admin, agencyId } = await ensureUserWorkspace(user);

    const payload = {
      agency_id: agencyId,
      user_id: user.id,
      fifa_agent_id: cleanText(body.fifaAgentId || body.fifa_agent_id, 80) || null,
      fifa_license_number: cleanText(body.fifaLicenseNumber || body.fifa_license_number, 80) || null,
      legal_name: cleanText(body.legalName || body.legal_name, 180),
      country_code: cleanCountry(body.countryCode || body.country_code),
      agency_name: cleanText(body.agencyName || body.agency_name, 180) || null,
      verification_status: cleanStatus(body.verificationStatus || body.verification_status),
      license_expires_on: cleanDate(body.licenseExpiresOn || body.license_expires_on),
      metadata: {
        compliance_warning_acknowledged_at: new Date().toISOString(),
        external_integrations_ready: [
          "transfermarkt_link_previews",
          "fifa_agent_registry_future_connector",
          "national_federation_future_connector",
          "licensed_provider_future_connector",
        ],
      },
    };

    if (!payload.legal_name) {
      return NextResponse.json({ error: "Full legal name is required." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("agent_identity_verifications")
      .upsert(payload, { onConflict: "agency_id,user_id" })
      .select(
        "id, fifa_agent_id, fifa_license_number, legal_name, country_code, agency_name, verification_status, license_expires_on, official_document_path, official_document_name, official_document_uploaded_at, metadata, created_at, updated_at",
      )
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, verification: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save agent verification." },
      { status: 500 },
    );
  }
}
