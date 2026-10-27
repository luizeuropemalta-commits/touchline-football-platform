import { checksumTouchlineSocialArtifact, TOUCHLINE_SOCIAL_ARTIFACT_BUCKET, type TouchlineSocialArtifactLocator, type TouchlineSocialStoredArtifact } from "./social-publication-contract.ts";

export const STUDIO_PNG_COLUMNS = "id,content_type,fixture_provider_id,placement,locale,revision,width,height,caption,approval_state,artifact_storage_provider,artifact_storage_bucket,artifact_storage_key,artifact_etag,artifact_content_type,artifact_byte_length,artifact_checksum,created_at";
export type StudioPngDraft = {
  id: string; content_type: string; fixture_provider_id: string; placement: string; locale: string; revision: number;
  width: number; height: number; caption: string; approval_state: string; created_at: string;
  artifact_storage_provider: string; artifact_storage_bucket: string; artifact_storage_key: string;
  artifact_etag: string | null; artifact_content_type: string; artifact_byte_length: number; artifact_checksum: string;
};
export function studioPngLocator(draft: StudioPngDraft): TouchlineSocialArtifactLocator | null {
  const key = draft.artifact_storage_key;
  if (draft.approval_state === "CANCELLED" || draft.artifact_content_type !== "image/png"
    || draft.artifact_storage_provider !== "SUPABASE_STORAGE" || draft.artifact_storage_bucket !== TOUCHLINE_SOCIAL_ARTIFACT_BUCKET
    || typeof key !== "string" || !key.startsWith("instagram/") || key.includes("..") || key.includes("\\")
    || key.length > 1024 || key.split("/").some(part => !part)
    || !Number.isSafeInteger(draft.artifact_byte_length) || draft.artifact_byte_length < 24 || draft.artifact_byte_length > 20 * 1024 * 1024
    || !Number.isSafeInteger(draft.width) || !Number.isSafeInteger(draft.height) || draft.width < 1 || draft.height < 1) return null;
  const match = key.match(/\/([a-f0-9]{64})\.png$/);
  if (!match || draft.artifact_checksum !== `sha256:${match[1]}`) return null;
  return { storageProvider: "SUPABASE_STORAGE", bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET, objectKey: key, etag: draft.artifact_etag };
}
export function studioPngBytesMatch(draft: StudioPngDraft, stored: TouchlineSocialStoredArtifact) {
  const locator = studioPngLocator(draft), bytes = stored.bytes;
  if (!locator || stored.contentType !== "image/png" || stored.locator.objectKey !== locator.objectKey
    || stored.locator.bucket !== locator.bucket || bytes.byteLength !== draft.artifact_byte_length
    || checksumTouchlineSocialArtifact(bytes) !== draft.artifact_checksum
    || ![137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].every((value, index) => bytes[index] === value)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) === draft.width && view.getUint32(20) === draft.height;
}
export const studioPngCopy = (lang: unknown) => typeof lang === "string" && lang.toLowerCase().startsWith("pt") ? {
  lang: "pt-BR", title: "Studio de publicações", subtitle: "Artes PNG e legendas da fonte oficial. Visualize e baixe os arquivos originais. Baixar não aprova nem publica uma arte.",
  back: "Revisões e histórico", empty: "Nenhuma arte PNG disponível nesta página.", unavailable: "Não foi possível consultar as artes. Nenhuma publicação foi iniciada.",
  preview: "Abrir PNG original", download: "Baixar PNG", revision: "Versão", previous: "Anterior", next: "Próxima", image: "Arte PNG", paused: "Envio externo não disponível neste Studio",
} : {
  lang: "en-GB", title: "Publication studio", subtitle: "PNG artwork and captions from the official source. Preview and download original files. Downloading does not approve or publish artwork.",
  back: "Reviews and history", empty: "No PNG artwork available on this page.", unavailable: "Artwork could not be loaded. No publication was started.",
  preview: "Open original PNG", download: "Download PNG", revision: "Version", previous: "Previous", next: "Next", image: "PNG artwork", paused: "External delivery is not available in this Studio",
};
