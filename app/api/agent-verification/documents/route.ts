import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const documentTypes = new Set([
  "representation_agreement",
  "authorization_letter",
  "agency_contract",
  "supporting_document",
]);

function extensionFromFile(file: File) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension && /^[a-z0-9]{2,8}$/.test(nameExtension)) return nameExtension;
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("wordprocessingml")) return "docx";
  if (file.type === "application/msword") return "doc";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function cleanType(value: FormDataEntryValue | null) {
  const type = typeof value === "string" ? value : "";
  return documentTypes.has(type) ? type : "supporting_document";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const formData = await request.formData();
    const file = formData.get("file");
    const uploadScope = formData.get("scope");
    const associationId = formData.get("associationId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use PDF, DOC, DOCX, JPG, PNG or WEBP." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Document must be under 10MB." }, { status: 400 });
    }

    const bucket = "agent-verification";
    await admin.storage
      .createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: Array.from(ALLOWED_TYPES),
      })
      .catch(() => null);

    const bytes = await file.arrayBuffer();
    const extension = extensionFromFile(file);

    if (uploadScope === "identity") {
      const path = `${agencyId}/${user.id}/identity/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) throw new Error(uploadError.message);

      const { data, error } = await admin
        .from("agent_identity_verifications")
        .upsert(
          {
            agency_id: agencyId,
            user_id: user.id,
            legal_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Touchline Agent",
            official_document_path: path,
            official_document_name: file.name,
            official_document_uploaded_at: new Date().toISOString(),
          },
          { onConflict: "agency_id,user_id" },
        )
        .select("official_document_path, official_document_name, official_document_uploaded_at")
        .single();

      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true, identityDocument: data });
    }

    if (typeof associationId !== "string" || !associationId) {
      return NextResponse.json({ error: "Association ID is required for representation documents." }, { status: 400 });
    }

    const { data: association, error: associationError } = await admin
      .from("agent_player_associations")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id)
      .eq("id", associationId)
      .maybeSingle();

    if (associationError) throw new Error(associationError.message);
    if (!association) return NextResponse.json({ error: "Player association not found." }, { status: 404 });

    const documentType = cleanType(formData.get("documentType"));
    const path = `${agencyId}/${user.id}/representations/${associationId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await admin
      .from("representation_documents")
      .insert({
        agency_id: agencyId,
        association_id: associationId,
        uploaded_by: user.id,
        document_type: documentType,
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        ai_validation_status: "manual_review",
        ai_validation_notes:
          "Document uploaded successfully. Full AI document consistency validation can be connected to Touchline AI in the next integration phase.",
      })
      .select("id, document_type, name, storage_path, mime_type, size_bytes, ai_validation_status, ai_validation_notes, created_at")
      .single();

    if (error) throw new Error(error.message);

    await admin
      .from("agent_player_associations")
      .update({
        ai_validation_status: "needs_review",
        compliance_flags: {
          has_uploaded_supporting_document: true,
          document_review_required: true,
        },
      })
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id)
      .eq("id", associationId);

    return NextResponse.json({ ok: true, document: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload verification document." },
      { status: 500 },
    );
  }
}
