import "server-only";

import type { StudioMedia } from "./social-studio-contract";
import { inspectStudioArtifact } from "./social-studio-artifact";
import { readStudioPublishedFullTimeSource } from "./social-studio-published-source-reader-server";
import { validateStudioOfficialDeclaration, verifyStudioPublishedSource } from "./social-studio-source-gate";

export const STUDIO_OFFICIAL_SOURCE_BLOCK = "Integração de fonte oficial publicada ainda não verificada. Vídeos, aprovações e retentativas ficam bloqueados; planos continuam pausados.";

export async function verifyStudioOfficialSource(media: StudioMedia, snapshot: Record<string, unknown>, now: number) {
  const reader = media.artId === "FULL_TIME" ? readStudioPublishedFullTimeSource : null;
  return verifyStudioPublishedSource(media, snapshot, reader, now, Date.now);
}

export async function inspectOfficialStudioArtifact(media: StudioMedia, now = Date.now()) {
  validateStudioOfficialDeclaration(media);
  const artifact = await inspectStudioArtifact(media, process.cwd(), now);
  await verifyStudioOfficialSource(media, artifact.snapshot, now);
  return artifact;
}
