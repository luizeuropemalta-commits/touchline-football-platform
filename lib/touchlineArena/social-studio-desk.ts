import type { StudioMedia } from "./social-studio-contract.ts";

export type StudioEyesSeal = {
  composition: "PASS" | "FAIL" | "PENDING"; loop: "PASS" | "FAIL" | "PENDING";
  reviewer: string | null; reviewedAt: string | null; reason: string;
};

export function studioEyesSeal(value: unknown, media: Pick<StudioMedia, "sha256" | "placement">, now: number): StudioEyesSeal {
  const pending: StudioEyesSeal = { composition: "PENDING", loop: "PENDING", reviewer: null, reviewedAt: null, reason: "Aguardando selo Olhos para esta versão e apresentação." };
  if (value === undefined || value === null) return pending;
  if (typeof value !== "object" || Array.isArray(value)) return { ...pending, composition: "FAIL", loop: "FAIL", reason: "Selo Olhos inválido." };
  const seal = value as Record<string, unknown>;
  if (!Number.isFinite(now) || seal.artifactSha256 !== media.sha256 || seal.placement !== media.placement
    || !["PASS", "FAIL", "PENDING"].includes(String(seal.composition)) || !["PASS", "FAIL", "PENDING"].includes(String(seal.loop))
    || typeof seal.reviewer !== "string" || !seal.reviewer.trim()
    || typeof seal.reviewedAt !== "string" || !Number.isFinite(Date.parse(seal.reviewedAt)) || Date.parse(seal.reviewedAt) > now
    || typeof seal.reason !== "string" || !seal.reason.trim()) return { ...pending, composition: "FAIL", loop: "FAIL", reason: "Selo Olhos não corresponde ao SHA, apresentação ou revisão válida deste vídeo." };
  return { composition: seal.composition as StudioEyesSeal["composition"], loop: seal.loop as StudioEyesSeal["loop"], reviewer: seal.reviewer, reviewedAt: seal.reviewedAt, reason: seal.reason };
}

export function studioEyesApproved(seal: StudioEyesSeal) { return seal.composition === "PASS" && seal.loop === "PASS"; }

export const studioActionLabel: Record<string, string> = {
  "approve-artwork": "Modelo aprovado", "approve-caption": "Legenda aprovada", "reject-artwork": "Arte reprovada",
  "request-revision": "Revisão solicitada", "save-plan": "Configuração salva", "request-retry": "Retentativa solicitada (pausada)",
};
