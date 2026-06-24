import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function extensionFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{2,8}$/.test(extension)) return extension;
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("wordprocessingml")) return "docx";
  if (file.type.includes("spreadsheetml")) return "xlsx";
  if (file.type === "application/msword") return "doc";
  if (file.type === "application/vnd.ms-excel") return "xls";
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/webm") return "webm";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Upload de documentos disponível somente dentro da sala privada de negociação." },
    { status: 405 },
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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
      return NextResponse.json({ ok: false, error: "Escolhe um documento dentro da sala de negociação." }, { status: 415 });
    }

    const { data: room, error: roomError } = await admin
      .from("negotiation_rooms")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("id", id)
      .maybeSingle();

    if (roomError) throw new Error(roomError.message);
    if (!room) return NextResponse.json({ error: "Deal room not found." }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File must be under 25MB." }, { status: 400 });

    const bucket = "deal-room-files";
    await admin.storage
      .createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: Array.from(ALLOWED_TYPES),
      })
      .catch(() => null);

    const bytes = await file.arrayBuffer();
    const path = `${agencyId}/${id}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await admin
      .from("negotiation_files")
      .insert({
        agency_id: agencyId,
        room_id: id,
        uploaded_by: user.id,
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select("id, name, storage_path, mime_type, size_bytes, created_at")
      .single();

    if (error) throw new Error(error.message);

    await admin.from("negotiation_messages").insert({
      agency_id: agencyId,
      room_id: id,
      sender_id: user.id,
      body: `[SYSTEM] File uploaded: ${file.name}`,
    });

    return NextResponse.json({ ok: true, file: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload deal room document." }, { status: 500 });
  }
}
