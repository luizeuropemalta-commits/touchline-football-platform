import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createTouchlineSocialArtifactStorageCore } from "../../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  checksumTouchlineSocialArtifact,
  createTouchlineSocialPublicationDraft,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  touchlineSocialArtifactObjectKey,
  touchlineSocialRenderPath,
} from "../../lib/touchlineArena/social-publication-contract.ts";
import {
  TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES,
  type TouchlineSocialRankingContentType,
} from "../../lib/touchlineArena/social-ranking-family-contract.ts";
import { TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION } from "../../lib/touchlineArena/social-ranking-family-draft-server.ts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_SOCIAL_RANKING_GENERATOR_ENV_MISSING:${name}`);
  return value;
}
function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

const fixtureId = argument("fixture-id");
const scopeId = argument("scope-id") || null;
const playerId = argument("player-id") || null;
const contentType = argument("content-type") as TouchlineSocialRankingContentType;
const expectedInputChecksum = argument("expected-input-checksum");
const expectedSourceRevisionChecksum = argument("expected-source-revision-checksum");
const gameweek = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(contentType);
const player = ["GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(contentType);
if (!NUMERIC_ID.test(fixtureId)
  || !TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES.includes(contentType)
  || gameweek !== Boolean(scopeId) || player !== Boolean(playerId)
  || (scopeId && !NUMERIC_ID.test(scopeId)) || (playerId && !NUMERIC_ID.test(playerId))
  || !SHA256.test(expectedInputChecksum) || !SHA256.test(expectedSourceRevisionChecksum)) {
  throw new Error("TL_SOCIAL_RANKING_GENERATOR_ARGS_INVALID");
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
  throw new Error("TL_SOCIAL_RANKING_GENERATOR_QA_BOUNDARY_MISMATCH");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const storage = createTouchlineSocialArtifactStorageCore({ supabaseUrl, serviceRoleKey });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "tl-social-render", value: renderSecret, domain: base.hostname,
    path: "/", httpOnly: true, secure: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  try {
    let existing = admin.from("touchline_social_publication_drafts").select("revision")
      .eq("fixture_provider_id", fixtureId).eq("content_type", contentType)
      .eq("placement", "INSTAGRAM_FEED").eq("locale", "en-GB")
      .eq("template_version", TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION);
    if (scopeId) existing = existing.eq("scope_provider_id", scopeId); else existing = existing.is("scope_provider_id", null);
    if (playerId) existing = existing.eq("subject_player_provider_id", playerId); else existing = existing.is("subject_player_provider_id", null);
    let queued = admin.from("touchline_social_ranking_generation_jobs")
      .select("first_observed_at,starts_at,job_state")
      .eq("fixture_provider_id", fixtureId).eq("content_type", contentType)
      .eq("template_version", TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION)
      .eq("input_checksum", expectedInputChecksum)
      .eq("source_revision_checksum", expectedSourceRevisionChecksum);
    if (scopeId) queued = queued.eq("scope_provider_id", scopeId); else queued = queued.is("scope_provider_id", null);
    if (playerId) queued = queued.eq("subject_player_provider_id", playerId); else queued = queued.is("subject_player_provider_id", null);
    const [existingResult, queuedResult] = await Promise.all([
      existing.order("revision", { ascending: false }).limit(1).maybeSingle(), queued.maybeSingle(),
    ]);
    const firstObservedAt = String(queuedResult.data?.first_observed_at ?? "");
    if (existingResult.error || queuedResult.error || queuedResult.data?.job_state !== "RUNNING"
      || !Number.isFinite(Date.parse(firstObservedAt))) throw new Error("TL_SOCIAL_RANKING_JOB_IDENTITY_INVALID");
    const revision = Number(existingResult.data?.revision ?? 0) + 1;
    const renderPath = touchlineSocialRenderPath({ fixtureId, teamId: null, scopeId, playerId,
      contentType, locale: "en-GB", revision });
    const response = await page.goto(new URL(renderPath, base).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!response?.ok()) throw new Error(`TL_SOCIAL_RANKING_RENDER_HTTP_${response?.status() ?? 0}`);
    await Promise.race([page.evaluate(() => document.fonts.ready),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TL_SOCIAL_RANKING_FONT_TIMEOUT")), 15_000))]);
    const canvas = page.locator('[data-social-art="touchline-ranking-family"]');
    if (await canvas.count() !== 1) throw new Error("TL_SOCIAL_RANKING_RENDER_NOT_READY");
    await canvas.evaluate((node) => node.setAttribute("data-static-export", "true"));
    const metadata = await canvas.evaluate((node) => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      const images = [...element.querySelectorAll<HTMLImageElement>("img")];
      return {
        contentType: element.dataset.contentType, templateVersion: element.dataset.templateVersion,
        sourceVersion: element.dataset.sourceVersion, sourceChecksum: element.dataset.sourceChecksum,
        sourceRevisionChecksum: element.dataset.sourceRevisionChecksum,
        caption: element.dataset.caption, width: box.width, height: box.height,
        imagesReady: images.length >= 2 && images.every((image) => image.complete && image.naturalWidth > 0),
        overflow: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
        publicText: element.innerText,
      };
    });
    // Caption is carried by the canonical source API, not displayed inside the
    // visual canvas. Read it with the same exact revision fence before capture.
    const sourceUrl = new URL("/api/admin/social-publications/source", base);
    sourceUrl.searchParams.set("contentType", contentType); sourceUrl.searchParams.set("fixtureId", fixtureId);
    if (scopeId) sourceUrl.searchParams.set("scopeId", scopeId);
    if (playerId) sourceUrl.searchParams.set("playerId", playerId);
    const sourceResponse = await fetch(sourceUrl, { headers: { cookie: `tl-social-render=${encodeURIComponent(renderSecret)}` },
      cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const current = await sourceResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!sourceResponse.ok || current?.sourceChecksum !== expectedInputChecksum
      || current?.sourceRevisionChecksum !== expectedSourceRevisionChecksum
      || current?.scopeId !== scopeId || current?.playerId !== playerId) {
      throw new Error("TL_SOCIAL_RANKING_SOURCE_CHANGED_DURING_RENDER");
    }
    const caption = String(current.caption ?? "");
    if (metadata.contentType !== contentType || metadata.templateVersion !== TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION
      || metadata.sourceChecksum !== expectedInputChecksum || metadata.sourceRevisionChecksum !== expectedSourceRevisionChecksum
      || !metadata.sourceVersion || metadata.width !== 1080 || metadata.height !== 1350
      || !metadata.imagesReady || metadata.overflow || !caption
      || /\b(?:sportmonks|api|provider|pipeline|settlement|fixture\s+\d+)\b/i.test(metadata.publicText ?? "")) {
      throw new Error("TL_SOCIAL_RANKING_RENDER_CONTRACT_MISMATCH");
    }
    const artifactBytes = new Uint8Array(await canvas.screenshot({ type: "png", animations: "disabled" }));
    const artifactChecksum = checksumTouchlineSocialArtifact(artifactBytes);
    const objectKey = touchlineSocialArtifactObjectKey({ fixtureId, teamId: null, scopeId, playerId,
      contentType, placement: "INSTAGRAM_FEED", locale: "en-GB", revision,
      templateVersion: TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION, sourceVersion: metadata.sourceVersion,
      artifactChecksum, artifactMimeType: "image/png" });
    let locator;
    try {
      locator = await storage.uploadCreateOnly({ objectKey, contentType: "image/png", bytes: artifactBytes, artifactChecksum });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS") throw error;
      locator = (await storage.readExact({ storageProvider: "SUPABASE_STORAGE",
        bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET, objectKey, etag: null })).locator;
    }
    const generatedAt = new Date().toISOString();
    const draftResult = await createTouchlineSocialPublicationDraft({
      fixtureId, teamId: null, scopeId, playerId, contentType, placement: "INSTAGRAM_FEED", locale: "en-GB",
      revision, renderPath, caption, firstObservedAt,
      sourceSnapshotAt: new Date(String(current.sourceSnapshotAt)).toISOString(),
      templateVersion: TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION, sourceVersion: metadata.sourceVersion,
      sourceChecksum: metadata.sourceChecksum!, sourceRevisionManifest: current.sourceRevisionManifest as Record<string, number>,
      sourceRevisionChecksum: metadata.sourceRevisionChecksum!, inputChecksum: metadata.sourceChecksum!,
      artifactMimeType: "image/png", artifactBytes, artifactLocator: locator, generatedAt,
    });
    if (!draftResult.ok) throw new Error(`TL_SOCIAL_RANKING_DRAFT_CONTRACT_${draftResult.reason}`);
    const draft = draftResult.draft;
    const inserted = await admin.rpc("touchline_social_044_create_draft", { p_draft: {
      publication_key: draft.publicationKey, fixture_provider_id: draft.fixtureId,
      team_provider_id: null, event_provider_id: null, scope_provider_id: draft.scopeId,
      subject_player_provider_id: draft.playerId, content_type: draft.contentType,
      placement: draft.placement, locale: draft.locale, revision: draft.revision,
      render_path: draft.renderPath, width: draft.width, height: draft.height, caption: draft.caption,
      first_observed_at: draft.firstObservedAt, source_snapshot_at: draft.sourceSnapshotAt,
      generated_at: draft.generatedAt, template_version: draft.templateVersion,
      source_version: draft.sourceVersion, source_checksum: draft.sourceChecksum,
      source_revision_manifest: draft.sourceRevisionManifest, source_revision_checksum: draft.sourceRevisionChecksum,
      input_checksum: draft.inputChecksum, artifact_content_type: draft.artifactMimeType,
      artifact_byte_length: draft.artifactByteLength, artifact_storage_provider: draft.artifactLocator.storageProvider,
      artifact_storage_bucket: draft.artifactLocator.bucket, artifact_storage_key: draft.artifactLocator.objectKey,
      artifact_etag: draft.artifactLocator.etag, manifest_checksum: draft.manifestChecksum,
      artifact_checksum: draft.artifactChecksum, caption_checksum: draft.captionChecksum,
    } });
    const draftId = String((inserted.data as Record<string, unknown> | null)?.draftId ?? "");
    if (inserted.error || !UUID.test(draftId)) throw new Error("TL_SOCIAL_RANKING_DRAFT_INSERT_FAILED");
    process.stdout.write(`${JSON.stringify({ outcome: "generated", contentType, fixtureId, scopeId, playerId,
      draftId, sourceChecksum: draft.sourceChecksum, sourceRevisionChecksum: draft.sourceRevisionChecksum,
      artifactChecksum: draft.artifactChecksum, generatedAt })}\n`);
  } finally { await page.close(); await context.close(); }
} finally { await browser.close(); }
