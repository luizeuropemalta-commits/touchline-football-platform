import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const allowedActions = new Set([
  "confirm",
  "save_contract",
  "reject",
  "verify",
  "expire",
  "dispute",
  "former",
  "remove",
  "restore_active",
  "request_documents",
  "prospect",
  "suggested",
]);

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

function actionPatch(action: string) {
  const now = new Date().toISOString();
  if (action === "confirm") {
    return {
      status: "active_representation",
      public_visible: true,
      confirmed_at: now,
      ai_validation_status: "needs_review",
      source_priority: 2,
      compliance_flags: {
        agent_declared_current_authorization: true,
        requires_documentation_review: true,
        public_until_verified: true,
        legal_warning_acknowledged_at: now,
      },
    };
  }

  if (action === "save_contract") {
    return {
      ai_validation_status: "needs_review",
      compliance_flags: {
        contract_dates_updated: true,
        contract_review_recommended: true,
      },
    };
  }

  if (action === "verify") {
    return {
      status: "verified_representation",
      public_visible: true,
      verified_at: now,
      ai_validation_status: "consistent",
      admin_review_status: "approved",
      source_priority: 1,
      compliance_flags: {
        verified_by_platform_admin: true,
        public_until_verified: true,
      },
    };
  }

  if (action === "reject") {
    return {
      status: "rejected",
      public_visible: false,
      rejected_at: now,
      inactive_reason: "Rejected by agent or admin.",
    };
  }

  if (action === "expire") {
    return {
      status: "expired_representation",
      public_visible: false,
      ai_validation_status: "needs_review",
      inactive_reason: "Representation contract expired.",
      source_priority: 5,
    };
  }

  if (action === "former") {
    return {
      status: "former_client",
      public_visible: false,
      inactive_reason: "Historical representation retained as former player.",
      source_priority: 5,
      external_conflict_notice: {
        message: "If an external source still lists this player as represented, Touchline will not restore active status automatically.",
      },
    };
  }

  if (action === "remove") {
    return {
      status: "removed_by_agent",
      public_visible: false,
      inactive_reason: "Agent marked this relationship as no longer represented.",
      source_priority: 5,
      external_conflict_notice: {
        message: "Transfermarkt or another source may still list this relationship. Review manually before restoring.",
        options: ["keep_as_former", "restore_to_active", "upload_proof", "ignore_update"],
      },
    };
  }

  if (action === "dispute") {
    return {
      status: "disputed_representation",
      public_visible: false,
      admin_review_status: "disputed",
      ai_validation_status: "needs_review",
      inactive_reason: "Representation is under review or contested.",
      source_priority: 5,
    };
  }

  if (action === "request_documents") {
    return {
      status: "pending_verification",
      public_visible: false,
      admin_review_status: "documents_requested",
      ai_validation_status: "needs_review",
      compliance_flags: {
        documents_requested: true,
        requested_at: now,
      },
    };
  }

  if (action === "restore_active") {
    return {
      status: "active_representation",
      public_visible: true,
      confirmed_at: now,
      ai_validation_status: "needs_review",
      source_priority: 2,
      inactive_reason: null,
      external_conflict_notice: {},
      compliance_flags: {
        agent_restored_active_after_review: true,
        legal_warning_acknowledged_at: now,
      },
    };
  }

  if (action === "prospect") {
    return {
      status: "prospect",
      public_visible: false,
    };
  }

  return {
    status: "suggested",
    public_visible: false,
    ai_validation_status: "not_reviewed",
    source_priority: 4,
  };
}

function cleanContractType(value?: string) {
  const contractType = value?.trim().slice(0, 80);
  return contractType || null;
}

function renewalReminderDate(expiration?: string) {
  if (!expiration || !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
  const date = new Date(`${expiration}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("agent_player_associations")
      .select(
        `
        id,
        player_id,
        suggested_name,
        suggested_position,
        suggested_nationality,
        suggested_club,
        suggested_photo_url,
        source,
        external_source,
        external_reference_url,
        confidence_score,
        status,
        contract_type,
        representation_starts_on,
        representation_expires_on,
        renewal_reminder_on,
        admin_review_status,
        admin_review_notes,
        inactive_reason,
        source_priority,
        last_external_sync_at,
        external_conflict_notice,
        public_visible,
        notes,
        compliance_flags,
        ai_validation_status,
        player_snapshot,
        confirmed_at,
        verified_at,
        rejected_at,
        created_at,
        updated_at,
        players:player_id(id, first_name, last_name, position, nationality, photo_url, market_value, currency, external_market_url, clubs:current_club_id(name)),
        representation_documents(id, document_type, name, storage_path, mime_type, size_bytes, ai_validation_status, ai_validation_notes, created_at)
      `,
      )
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id)
      .neq("status", "rejected")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ associations: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load player associations." },
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
    const json = await readJsonObject(request);
    if (!json.ok) return json.response;
    const body = json.data as {
      associationId?: string;
      playerId?: string;
      action?: string;
      notes?: string;
      representationStartsOn?: string;
      representationExpiresOn?: string;
      contractType?: string;
    };

    const action = body.action || "confirm";
    if (!allowedActions.has(action)) {
      return NextResponse.json({ error: "Unsupported association action." }, { status: 400 });
    }

    const { admin, agencyId } = await ensureUserWorkspace(user);

    if (!body.associationId && body.playerId) {
      const { data: player, error: playerError } = await admin
        .from("players")
        .select("id, first_name, last_name, position, nationality, photo_url, external_market_url, clubs:current_club_id(name)")
        .eq("agency_id", agencyId)
        .eq("id", body.playerId)
        .maybeSingle();

      if (playerError) throw new Error(playerError.message);
      if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

      const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
      const { data, error } = await admin
        .from("agent_player_associations")
        .insert({
          agency_id: agencyId,
          agent_user_id: user.id,
          player_id: player.id,
          suggested_name: name,
          suggested_position: player.position,
          suggested_nationality: player.nationality,
          suggested_club: clubName(player.clubs),
          suggested_photo_url: player.photo_url,
          source: "manual",
          external_source: "manual_player_vault",
          external_reference_url: player.external_market_url,
          confidence_score: 80,
          status: "suggested",
          public_visible: false,
          source_priority: 5,
          notes: body.notes?.trim() || null,
          compliance_flags: {
            requires_agent_confirmation: true,
            public_until_verified: false,
          },
        })
        .select("id, status")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, association: data });
    }

    if (!body.associationId) {
      return NextResponse.json({ error: "Association ID or player ID is required." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      ...actionPatch(action),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : undefined,
    };

    if (typeof body.contractType === "string") {
      patch.contract_type = cleanContractType(body.contractType);
    }

    if (body.representationStartsOn && /^\d{4}-\d{2}-\d{2}$/.test(body.representationStartsOn)) {
      patch.representation_starts_on = body.representationStartsOn;
    }

    if (body.representationExpiresOn && /^\d{4}-\d{2}-\d{2}$/.test(body.representationExpiresOn)) {
      patch.representation_expires_on = body.representationExpiresOn;
      patch.renewal_reminder_on = renewalReminderDate(body.representationExpiresOn);
    }

    Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

    const { data, error } = await admin
      .from("agent_player_associations")
      .update(patch)
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id)
      .eq("id", body.associationId)
      .select("id, status, public_visible, ai_validation_status, contract_type, representation_starts_on, representation_expires_on, renewal_reminder_on, updated_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, association: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update player association." },
      { status: 500 },
    );
  }
}
