"use client";

/* Signed private Storage previews are intentionally rendered without the public image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReviewKind = "artwork" | "caption";

type Props = {
  draftId: string;
  manifestChecksum: string;
  artifactChecksum: string;
  captionChecksum: string;
  artworkPreviewUrl: string | null;
  artworkPreviewAlt: string;
  artworkApproved: boolean;
  captionApproved: boolean;
  generationCurrent: boolean;
};

export default function TouchlineSocialDraftReviewActions({
  draftId,
  manifestChecksum,
  artifactChecksum,
  captionChecksum,
  artworkPreviewUrl,
  artworkPreviewAlt,
  artworkApproved,
  captionApproved,
  generationCurrent,
}: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<{
    url: string | null;
    state: "loading" | "ready" | "failed";
  }>(() => ({
    url: artworkPreviewUrl,
    state: artworkPreviewUrl ? "loading" : "failed",
  }));
  const [pending, setPending] = useState<ReviewKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const previewState = preview.url === artworkPreviewUrl
    ? preview.state
    : artworkPreviewUrl ? "loading" : "failed";

  const artworkAvailable = previewState === "ready" && generationCurrent;

  async function approve(review: ReviewKind) {
    if (pending) return;
    setPending(review);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/social-publications/review", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: review === "artwork" ? "approve-artwork" : "approve-caption",
          draftId,
          expectedChecksum: review === "artwork" ? artifactChecksum : captionChecksum,
          expectedManifestChecksum: manifestChecksum,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A revisão não pôde ser registrada.");
      setMessage(review === "artwork" ? "Arte aprovada nesta revisão." : "Legenda aprovada nesta revisão.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A revisão não pôde ser registrada.");
    } finally {
      setPending(null);
    }
  }

  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="sm:col-span-2">
      {artworkPreviewUrl ? <img
        key={artworkPreviewUrl}
        src={artworkPreviewUrl}
        alt={artworkPreviewAlt}
        onLoad={() => setPreview({ url: artworkPreviewUrl, state: "ready" })}
        onError={() => setPreview({ url: artworkPreviewUrl, state: "failed" })}
        className="aspect-[4/5] w-full bg-black/30 object-contain"
      /> : <div className="grid aspect-[4/5] place-items-center bg-black/30 text-sm text-slate-500">Arte imutável indisponível</div>}
      {previewState === "failed" ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3 py-2 text-[10px] font-bold text-amber-100" role="alert">A prévia privada não carregou. A aprovação da arte está bloqueada.</p> : null}
      {previewState === "loading" ? <p className="mt-3 text-[10px] font-bold text-slate-400" role="status">Carregando a prévia integral antes de liberar a revisão…</p> : null}
      {!generationCurrent ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3 py-2 text-[10px] font-bold text-amber-100" role="alert">Esta revisão não corresponde a uma fonte oficial atualmente habilitada para aprovação. Arte e legenda estão bloqueadas.</p> : null}
    </div>
    <button
      type="button"
      disabled={!artworkAvailable || artworkApproved || pending !== null}
      aria-busy={pending === "artwork"}
      onClick={() => void approve("artwork")}
      className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-4 py-3 text-xs font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {artworkApproved
        ? "Arte aprovada"
        : !artworkAvailable
          ? "Arte indisponível · aprovação bloqueada"
          : pending === "artwork" ? "Aprovando arte…" : "Aprovar somente a arte"}
    </button>
    <button
      type="button"
      disabled={!generationCurrent || captionApproved || pending !== null}
      aria-busy={pending === "caption"}
      onClick={() => void approve("caption")}
      className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-4 py-3 text-xs font-black text-[#caff6d] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {captionApproved ? "Legenda aprovada" : !generationCurrent ? "Legenda desatualizada · aprovação bloqueada" : pending === "caption" ? "Aprovando legenda…" : "Aprovar somente a legenda"}
    </button>
    <p className="sm:col-span-2 min-h-5 text-[10px] font-bold text-slate-400" role="status" aria-live="polite">{message}</p>
  </div>;
}
