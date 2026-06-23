import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
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

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Escolhe uma foto do atleta." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Usa JPG, PNG ou WEBP." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "A foto precisa ter menos de 5MB." }, { status: 400 });
    }

    const bucket = "player-photos";
    await admin.storage.createBucket(bucket, { public: true }).catch(() => null);

    const bytes = await file.arrayBuffer();
    const path = `${agencyId}/${crypto.randomUUID()}.${extensionFromType(file.type)}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, photoUrl: data.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não consegui enviar a foto." }, { status: 500 });
  }
}
