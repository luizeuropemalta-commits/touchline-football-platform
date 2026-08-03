"use client";

import { Camera, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024;
const AVATAR_EDGE = 512;

async function compressedAvatarDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("invalid_type");
  if (file.size > MAX_AVATAR_SOURCE_BYTES) throw new Error("file_too_large");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AVATAR_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function ClubOwnerAvatarUpload({ locale }: { locale: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const isPortuguese = locale === "pt-BR";

  async function selectAvatar(file: File | undefined) {
    if (!file) return;
    setStatus("saving");
    try {
      const avatarUrl = await compressedAvatarDataUrl(file);
      const supabase = createClient();
      if (!supabase) throw new Error("auth_unavailable");
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (error) throw error;
      window.location.reload();
    } catch {
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="club-owner-avatar-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => void selectAvatar(event.currentTarget.files?.[0])}
        aria-label={isPortuguese ? "Escolher foto de perfil" : "Choose profile photo"}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={status === "saving"}>
        {status === "saving" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Camera aria-hidden="true" />}
        {status === "saving"
          ? (isPortuguese ? "Salvando…" : "Saving…")
          : (isPortuguese ? "Alterar foto" : "Change photo")}
      </button>
      {status === "error" ? (
        <small role="alert">{isPortuguese ? "Não foi possível salvar esta foto." : "This photo could not be saved."}</small>
      ) : null}
      <style jsx>{`
        .club-owner-avatar-upload { display:grid; justify-items:center; gap:6px; }
        input { position:fixed; width:1px; height:1px; opacity:0; pointer-events:none; }
        button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:34px; border:1px solid rgba(163,255,18,.42); border-radius:999px; padding:0 13px; color:#f7ffe9; background:rgba(4,12,10,.86); font:900 10px/1 inherit; cursor:pointer; }
        button:hover { border-color:#a3ff12; box-shadow:0 0 18px rgba(163,255,18,.14); }
        button:disabled { opacity:.62; cursor:wait; }
        svg { width:14px; height:14px; color:#a3ff12; }
        small { max-width:190px; color:#ff8d8d; font:800 9px/1.35 inherit; text-align:center; }
        .is-spinning { animation:spin .8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
