import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createTouchlineSocialArtifactStorageCore } from "../../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  checksumTouchlineSocialArtifact,
  createTouchlineSocialPublicationDraft,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  touchlineSocialArtifactObjectKey,
  touchlineSocialRenderPath,
  type TouchlineSocialContentType,
} from "../../lib/touchlineArena/social-publication-contract.ts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIG = Object.freeze({
  GOAL_CONFIRMED: { templateVersion: "touchline-goal-confirmed-story-v1" },
  RED_CARD_CONFIRMED: { templateVersion: "touchline-red-card-confirmed-story-v1" },
});

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_CONFIRMED_EVENT_GENERATOR_ENV_MISSING:${name}`);
  return value;
}
function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

const fixtureId = argument("fixture-id");
const eventId = argument("event-id");
const contentType = argument("content-type") as keyof typeof CONFIG;
const expectedInputChecksum = argument("expected-input-checksum");
const expectedSourceRevisionChecksum = argument("expected-source-revision-checksum");
const config = CONFIG[contentType];
if (!/^[1-9]\d{0,19}$/.test(fixtureId) || !/^[1-9]\d{0,19}$/.test(eventId)
  || !config || !SHA256.test(expectedInputChecksum) || !SHA256.test(expectedSourceRevisionChecksum)) {
  throw new Error("TL_CONFIRMED_EVENT_GENERATOR_ARGS_INVALID");
}

const projectRef = required("TOUCHLINE_QA_SUPABASE_PROJECT_REF");
const supabaseUrl = process.env.SUPABASE_URL?.trim() || required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const base = new URL(required("TOUCHLINE_QA_BASE_URL"));
const renderSecret = required("TOUCHLINE_LIVE_SYNC_SECRET");
if (process.env.VERCEL_ENV === "production" || projectRef !== QA_PROJECT_REF
  || new URL(supabaseUrl).hostname.split(".", 1)[0] !== QA_PROJECT_REF
  || base.protocol !== "https:" || (base.hostname !== STABLE_QA_HOST && base.hostname !== "localhost")
  || serviceRoleKey.length < 32 || renderSecret.length < 32) {
  throw new Error("TL_CONFIRMED_EVENT_GENERATOR_QA_BOUNDARY_MISMATCH");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const storage = createTouchlineSocialArtifactStorageCore({ supabaseUrl, serviceRoleKey });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "tl-social-render", value: renderSecret, domain: base.hostname,
    path: "/", httpOnly: true, secure: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  try {
    const [existing, queuedJob] = await Promise.all([
      admin.from("touchline_social_publication_drafts").select("revision")
        .eq("fixture_provider_id", fixtureId).eq("event_provider_id", eventId)
        .eq("content_type", contentType).eq("placement", "INSTAGRAM_STORY")
        .eq("locale", "en-GB").eq("template_version", config.templateVersion)
        .order("revision", { ascending: false }).limit(1).maybeSingle(),
      admin.from("touchline_social_confirmed_event_generation_jobs")
        .select("first_observed_at,starts_at,job_state")
        .eq("fixture_provider_id", fixtureId).eq("event_provider_id", eventId)
        .eq("content_type", contentType).eq("template_version", config.templateVersion)
        .eq("input_checksum", expectedInputChecksum)
        .eq("source_revision_checksum", expectedSourceRevisionChecksum).maybeSingle(),
    ]);
    const firstObservedAt = String(queuedJob.data?.first_observed_at ?? "");
    const startsAt = String(queuedJob.data?.starts_at ?? "");
    if (existing.error || queuedJob.error || queuedJob.data?.job_state !== "RUNNING"
      || !Number.isFinite(Date.parse(firstObservedAt)) || !Number.isFinite(Date.parse(startsAt))) {
      throw new Error("TL_CONFIRMED_EVENT_GENERATION_JOB_IDENTITY_INVALID");
    }
    const revision = Number(existing.data?.revision ?? 0) + 1;
    const renderPath = touchlineSocialRenderPath({ fixtureId, eventId, teamId: null,
      contentType, locale: "en-GB", revision });
    const response = await page.goto(new URL(renderPath, base).toString(), {
      waitUntil: "domcontentloaded", timeout: 45_000,
    });
    if (!response?.ok()) throw new Error(`TL_CONFIRMED_EVENT_RENDER_HTTP_${response?.status() ?? 0}`);
    await Promise.race([page.evaluate(() => document.fonts.ready),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TL_CONFIRMED_EVENT_FONT_TIMEOUT")), 15_000))]);
    const canvas = page.locator('[data-social-art="touchline-confirmed-event"]');
    if (await canvas.count() !== 1) throw new Error("TL_CONFIRMED_EVENT_RENDER_NOT_READY");
    await canvas.evaluate((node) => node.setAttribute("data-static-export", "true"));
    const metadata = await canvas.evaluate((node) => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      const images = [...element.querySelectorAll<HTMLImageElement>("img")];
      return {
        contentType: element.dataset.contentType, eventId: element.dataset.eventId,
        placement: element.dataset.socialPlacement, templateVersion: element.dataset.templateVersion,
        sourceVersion: element.dataset.sourceVersion, sourceChecksum: element.dataset.sourceChecksum,
        sourceRevisionChecksum: element.dataset.sourceRevisionChecksum,
        sourceSnapshotAt: element.dataset.sourceSnapshotAt, startsAt: element.dataset.startsAt,
        caption: element.dataset.caption, width: box.width, height: box.height,
        imagesReady: images.length >= 3 && images.every((image) => image.complete && image.naturalWidth > 0),
        overflow: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
        publicText: element.innerText,
      };
    });
    if (metadata.contentType !== contentType || metadata.eventId !== eventId || metadata.placement !== "story"
      || metadata.templateVersion !== config.templateVersion || metadata.sourceChecksum !== expectedInputChecksum
      || metadata.sourceRevisionChecksum !== expectedSourceRevisionChecksum || !metadata.sourceVersion || !metadata.caption
      || metadata.startsAt !== startsAt || !Number.isFinite(Date.parse(metadata.sourceSnapshotAt ?? ""))
      || metadata.width !== 1080 || metadata.height !== 1920 || !metadata.imagesReady || metadata.overflow
      || /\b(?:sportmonks|api|provider|pipeline|settlement|fixture\s+\d+)\b/i.test(metadata.publicText ?? "")) {
      throw new Error("TL_CONFIRMED_EVENT_RENDER_CONTRACT_MISMATCH");
    }
    const artifactBytes = new Uint8Array(await canvas.screenshot({ type: "png", animations: "disabled" }));
    const artifactChecksum = checksumTouchlineSocialArtifact(artifactBytes);
    const objectKey = touchlineSocialArtifactObjectKey({ fixtureId, eventId, teamId: null,
      contentType: contentType as TouchlineSocialContentType, placement: "INSTAGRAM_STORY", locale: "en-GB", revision,
      templateVersion: config.templateVersion, sourceVersion: metadata.sourceVersion,
      artifactChecksum, artifactMimeType: "image/png" });
    let locator;
    try {
      locator = await storage.uploadCreateOnly({ objectKey, contentType: "image/png", bytes: artifactBytes, artifactChecksum });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS") throw error;
      locator = (await storage.readExact({ storageProvider: "SUPABASE_STORAGE",
        bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET, objectKey, etag: null })).locator;
    }
    const sourceUrl = new URL("/api/admin/social-publications/source", base);
    sourceUrl.searchParams.set("contentType", contentType);
    sourceUrl.searchParams.set("fixtureId", fixtureId);
    sourceUrl.searchParams.set("eventId", eventId);
    const sourceResponse = await fetch(sourceUrl, { headers: {
      cookie: `tl-social-render=${encodeURIComponent(renderSecret)}`,
    }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const current = await sourceResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!sourceResponse.ok || current?.sourceChecksum !== expectedInputChecksum
      || current?.sourceRevisionChecksum !== expectedSourceRevisionChecksum
      || current?.eventId !== eventId) throw new Error("TL_CONFIRMED_EVENT_SOURCE_CHANGED_DURING_RENDER");
    const generatedAt = new Date().toISOString();
    const draftResult = await createTouchlineSocialPublicationDraft({
      fixtureId, eventId, teamId: null, contentType, placement: "INSTAGRAM_STORY", locale: "en-GB",
      revision, renderPath, caption: metadata.caption, firstObservedAt,
      sourceSnapshotAt: new Date(metadata.sourceSnapshotAt!).toISOString(),
      templateVersion: config.templateVersion, sourceVersion: metadata.sourceVersion,
      sourceChecksum: metadata.sourceChecksum,
      sourceRevisionManifest: current.sourceRevisionManifest as Record<string, number>,
      sourceRevisionChecksum: metadata.sourceRevisionChecksum, inputChecksum: metadata.sourceChecksum,
      artifactMimeType: "image/png", artifactBytes, artifactLocator: locator, generatedAt,
    });
    if (!draftResult.ok) throw new Error(`TL_CONFIRMED_EVENT_DRAFT_CONTRACT_${draftResult.reason}`);
    const draft = draftResult.draft;
    const inserted = await admin.rpc("touchline_social_043_create_draft", { p_draft: {
      publication_key: draft.publicationKey, fixture_provider_id: draft.fixtureId,
      team_provider_id: null, event_provider_id: draft.eventId, content_type: draft.contentType,
      placement: draft.placement, locale: draft.locale, revision: draft.revision,
      render_path: draft.renderPath, width: draft.width, height: draft.height, caption: draft.caption,
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
    if (inserted.error || !UUID.test(draftId)) throw new Error("TL_CONFIRMED_EVENT_DRAFT_INSERT_FAILED");
    process.stdout.write(`${JSON.stringify({ outcome: "generated", contentType, fixtureId, eventId,
      draftId, sourceChecksum: draft.sourceChecksum, sourceRevisionChecksum: draft.sourceRevisionChecksum,
      artifactChecksum: draft.artifactChecksum, generatedAt })}\n`);
  } finally {
    await page.close(); await context.close();
  }
} finally {
  await browser.close();
}
