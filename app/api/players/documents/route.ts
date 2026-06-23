import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

const folders = new Set([
  "passport",
  "fifa_documents",
  "contracts",
  "medical_reports",
  "work_permits",
  "residence_documents",
  "agency_agreements",
  "performance_reports",
  "other",
]);

function extensionFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{2,8}$/.test(extension)) return extension;
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("wordprocessingml")) return "docx";
  if (file.type === "application/msword") return "doc";
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/webm") return "webm";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function cleanText(value: FormDataEntryValue | null, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Upload de documentos disponível somente pelo cofre do jogador dentro da plataforma." },
    { status: 405 },
  );
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
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "Upload inválido. Escolhe um documento no formulário do Player Vault." },
        { status: 415 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const playerId = cleanText(formData.get("playerId"), 80);
    const folderValue = cleanText(formData.get("category"), 80).toLowerCase() || "other";
    const category = folders.has(folderValue) ? folderValue : "other";

    if (!playerId) return NextResponse.json({ error: "Player ID is required." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File must be under 20MB." }, { status: 400 });

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw new Error(playerError.message);
    if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

    const bucket = "player-vault";
    await admin.storage
      .createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: Array.from(ALLOWED_TYPES),
      })
      .catch(() => null);

    const bytes = await file.arrayBuffer();
    const path = `${agencyId}/${playerId}/${category}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await admin
      .from("player_documents")
      .insert({
        agency_id: agencyId,
        player_id: playerId,
        uploaded_by: user.id,
        name: file.name,
        category,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select("id, name, category, storage_path, mime_type, size_bytes, created_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, document: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload document." }, { status: 500 });
  }
}
