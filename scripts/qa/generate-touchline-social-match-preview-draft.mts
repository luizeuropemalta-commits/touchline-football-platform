import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createTouchlineSocialArtifactStorageCore } from "../../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  checksumTouchlineSocialArtifact,
  createTouchlineSocialPublicationDraft,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  touchlineSocialArtifactObjectKey,
} from "../../lib/touchlineArena/social-publication-contract.ts";
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION = "touchline-match-preview-feed-v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_MATCH_PREVIEW_GENERATOR_ENV_MISSING:${name}`);
  return value;
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

const fixtureId = argument("fixture-id");
const expectedInputChecksum = argument("expected-input-checksum");
const expectedSourceRevisionChecksum = argument("expected-source-revision-checksum");
if (!/^[1-9]\d{0,19}$/.test(fixtureId) || !SHA256.test(expectedInputChecksum)
  || !SHA256.test(expectedSourceRevisionChecksum)) {
  throw new Error("TL_MATCH_PREVIEW_GENERATOR_ARGS_INVALID");
}

const projectRef = required("TOUCHLINE_QA_SUPABASE_PROJECT_REF");
const supabaseUrl = process.env.SUPABASE_URL?.trim() || required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const qaBaseUrl = required("TOUCHLINE_QA_BASE_URL");
const renderSecret = required("TOUCHLINE_LIVE_SYNC_SECRET");
const base = new URL(qaBaseUrl);
if (process.env.VERCEL_ENV === "production" || projectRef !== QA_PROJECT_REF
  || new URL(supabaseUrl).hostname.split(".", 1)[0] !== QA_PROJECT_REF
  || base.protocol !== "https:"
  || (base.hostname !== STABLE_QA_HOST && base.hostname !== "localhost")
  || serviceRoleKey.length < 32 || renderSecret.length < 32) {
  throw new Error("TL_MATCH_PREVIEW_GENERATOR_QA_BOUNDARY_MISMATCH");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = createTouchlineSocialArtifactStorageCore({ supabaseUrl, serviceRoleKey });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await context.addCookies([{
    name: "tl-social-render", value: renderSecret, domain: base.hostname, path: "/",
    httpOnly: true, secure: base.protocol === "https:", sameSite: "Strict",
  }]);
  const page = await context.newPage();
  try {
    const existing = await admin.from("touchline_social_publication_drafts")
      .select("revision")
      .eq("fixture_provider_id", fixtureId)
      .eq("content_type", "MATCH_PREVIEW")
      .eq("placement", "INSTAGRAM_FEED")
      .eq("locale", "en-GB")
      .eq("template_version", TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION)
      .order("revision", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw new Error("TL_MATCH_PREVIEW_DRAFT_READ_FAILED");
    const queuedJob = await admin.from("touchline_social_match_preview_generation_jobs")
      .select("first_observed_at,starts_at,job_state")
      .eq("fixture_provider_id", fixtureId)
      .eq("content_type", "MATCH_PREVIEW")
      .eq("template_version", TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION)
      .eq("input_checksum", expectedInputChecksum)
      .eq("source_revision_checksum", expectedSourceRevisionChecksum)
      .maybeSingle();
    const firstObservedAt = String(queuedJob.data?.first_observed_at ?? "");
    const queuedStartsAt = String(queuedJob.data?.starts_at ?? "");
    if (queuedJob.error || queuedJob.data?.job_state !== "RUNNING"
      || !Number.isFinite(Date.parse(firstObservedAt))
      || !Number.isFinite(Date.parse(queuedStartsAt))) {
      throw new Error("TL_MATCH_PREVIEW_GENERATION_JOB_IDENTITY_INVALID");
    }
    const revision = Number(existing.data?.revision ?? 0) + 1;
    const renderPath = `/visual-qa/social-match-preview?fixtureId=${fixtureId}&locale=en-GB&revision=${revision}`;
    const response = await page.goto(new URL(renderPath, base).toString(), {
      waitUntil: "domcontentloaded", timeout: 45_000,
    });
    if (!response?.ok()) throw new Error(`TL_MATCH_PREVIEW_RENDER_HTTP_${response?.status() ?? 0}`);
    await Promise.race([
      page.evaluate(() => document.fonts.ready),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TL_MATCH_PREVIEW_FONT_TIMEOUT")), 15_000)),
    ]);
    const canvas = page.locator('[data-social-art="touchline-match-preview"]');
    if (await canvas.count() !== 1) throw new Error("TL_MATCH_PREVIEW_RENDER_NOT_READY");
    const metadata = await canvas.evaluate((node) => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      const contenders = [...element.querySelectorAll<HTMLElement>("[data-preview-player-id]")];
      const images = [...element.querySelectorAll<HTMLImageElement>("img")];
      const shirtNames = [...element.querySelectorAll<HTMLElement>("[data-shirt-name]")];
      return {
        fixtureId: element.dataset.fixtureId,
        contentType: element.dataset.contentType,
        templateVersion: element.dataset.templateVersion,
        sourceVersion: element.dataset.sourceVersion,
        sourceChecksum: element.dataset.sourceChecksum,
        sourceRevisionChecksum: element.dataset.sourceRevisionChecksum,
        sourceSnapshotAt: element.dataset.sourceSnapshotAt,
        startsAt: element.dataset.startsAt,
        caption: element.dataset.caption,
        homeTeamId: element.dataset.homeTeamId,
        awayTeamId: element.dataset.awayTeamId,
        lineupFields: element.dataset.lineupFields,
        width: box.width,
        height: box.height,
        contenderCount: contenders.length,
        uniquePlayers: new Set(contenders.map((item) => item.dataset.previewCanonicalPlayerId)).size,
        upright: contenders.every((item) => item.dataset.previewCardAxis === "0deg"),
        namesComplete: shirtNames.length === 2 && shirtNames.every((item) => {
          const mask = item.parentElement;
          const fullName = item.dataset.fullPlayerName?.trim() ?? "";
          if (!mask || item.dataset.staticNameFit !== "true" || !fullName
            || item.textContent?.trim() !== fullName) return false;
          const nameBox = item.getBoundingClientRect();
          const maskBox = mask.getBoundingClientRect();
          return nameBox.left >= maskBox.left - 1 && nameBox.right <= maskBox.right + 1
            && nameBox.top >= maskBox.top - 1 && nameBox.bottom <= maskBox.bottom + 1;
        }),
        imagesReady: images.every((image) => image.complete && image.naturalWidth > 0),
        overflow: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
      };
    });
    if (metadata.fixtureId !== fixtureId || metadata.contentType !== "MATCH_PREVIEW"
      || metadata.templateVersion !== TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION
      || metadata.sourceChecksum !== expectedInputChecksum
      || metadata.sourceRevisionChecksum !== expectedSourceRevisionChecksum
      || !metadata.sourceVersion || !metadata.caption
      || !Number.isFinite(Date.parse(metadata.sourceSnapshotAt ?? ""))
      || !Number.isFinite(Date.parse(metadata.startsAt ?? ""))
      || metadata.startsAt !== queuedStartsAt
      || metadata.homeTeamId === metadata.awayTeamId
      || !/^[1-9]\d{0,19}$/.test(metadata.homeTeamId ?? "")
      || !/^[1-9]\d{0,19}$/.test(metadata.awayTeamId ?? "")
      || metadata.lineupFields !== "absent" || metadata.width !== 1080 || metadata.height !== 1350
      || metadata.contenderCount !== 2 || metadata.uniquePlayers !== 2 || !metadata.upright
      || !metadata.namesComplete || !metadata.imagesReady || metadata.overflow) {
      throw new Error("TL_MATCH_PREVIEW_RENDER_CONTRACT_MISMATCH");
    }
    const artifactBytes = new Uint8Array(await canvas.screenshot({ type: "png", animations: "disabled" }));
    const artifactChecksum = checksumTouchlineSocialArtifact(artifactBytes);
    const objectKey = touchlineSocialArtifactObjectKey({
      fixtureId, teamId: null, contentType: "MATCH_PREVIEW", placement: "INSTAGRAM_FEED",
      locale: "en-GB", revision, templateVersion: TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION,
      sourceVersion: metadata.sourceVersion, artifactChecksum, artifactMimeType: "image/png",
    });
    let locator;
    try {
      locator = await storage.uploadCreateOnly({ objectKey, contentType: "image/png", bytes: artifactBytes, artifactChecksum });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS") throw error;
      locator = (await storage.readExact({
        storageProvider: "SUPABASE_STORAGE", bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
        objectKey, etag: null,
      })).locator;
    }
    const source = new URL("/api/admin/social-publications/source", base);
    source.searchParams.set("contentType", "MATCH_PREVIEW");
    source.searchParams.set("fixtureId", fixtureId);
    const sourceResponse = await fetch(source, {
      headers: { cookie: `tl-social-render=${encodeURIComponent(renderSecret)}` }, cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const current = await sourceResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!sourceResponse.ok || current?.sourceChecksum !== expectedInputChecksum
      || current?.sourceRevisionChecksum !== expectedSourceRevisionChecksum) {
      throw new Error("TL_MATCH_PREVIEW_SOURCE_CHANGED_DURING_RENDER");
    }
    const sourceSnapshotAt = new Date(Math.max(
      Date.parse(metadata.sourceSnapshotAt!),
      Date.parse(firstObservedAt),
    )).toISOString();
    const generatedAt = new Date().toISOString();
    const draftResult = await createTouchlineSocialPublicationDraft({
      fixtureId, teamId: null, contentType: "MATCH_PREVIEW", placement: "INSTAGRAM_FEED",
      locale: "en-GB", revision, renderPath, caption: metadata.caption,
      firstObservedAt, sourceSnapshotAt,
      templateVersion: TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION,
      sourceVersion: metadata.sourceVersion, sourceChecksum: metadata.sourceChecksum,
      sourceRevisionManifest: current.sourceRevisionManifest as Record<string, number>,
      sourceRevisionChecksum: metadata.sourceRevisionChecksum,
      inputChecksum: metadata.sourceChecksum, artifactMimeType: "image/png",
      artifactBytes, artifactLocator: locator, generatedAt,
    });
    if (!draftResult.ok) throw new Error(`TL_MATCH_PREVIEW_DRAFT_CONTRACT_${draftResult.reason}`);
    const draft = draftResult.draft;
    const inserted = await admin.rpc("touchline_social_create_draft", { p_draft: {
      publication_key: draft.publicationKey, fixture_provider_id: draft.fixtureId,
      team_provider_id: null, content_type: draft.contentType, placement: draft.placement,
      locale: draft.locale, revision: draft.revision, render_path: draft.renderPath,
      width: draft.width, height: draft.height, caption: draft.caption,
      first_observed_at: draft.firstObservedAt, source_snapshot_at: draft.sourceSnapshotAt,
      generated_at: draft.generatedAt, template_version: draft.templateVersion,
      source_version: draft.sourceVersion, source_checksum: draft.sourceChecksum,
      source_revision_manifest: draft.sourceRevisionManifest,
      source_revision_checksum: draft.sourceRevisionChecksum, input_checksum: draft.inputChecksum,
      artifact_content_type: draft.artifactMimeType, artifact_byte_length: draft.artifactByteLength,
      artifact_storage_provider: draft.artifactLocator.storageProvider,
      artifact_storage_bucket: draft.artifactLocator.bucket,
      artifact_storage_key: draft.artifactLocator.objectKey, artifact_etag: draft.artifactLocator.etag,
      manifest_checksum: draft.manifestChecksum, artifact_checksum: draft.artifactChecksum,
      caption_checksum: draft.captionChecksum,
    } });
    const draftId = String((inserted.data as Record<string, unknown> | null)?.draftId ?? "");
    if (inserted.error || !/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("TL_MATCH_PREVIEW_DRAFT_INSERT_FAILED");
    process.stdout.write(`${JSON.stringify({ outcome: "generated", fixtureId, draftId,
      sourceChecksum: draft.sourceChecksum, sourceRevisionChecksum: draft.sourceRevisionChecksum,
      artifactChecksum: draft.artifactChecksum, generatedAt })}\n`);
  } finally {
    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
}
