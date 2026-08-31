import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createTouchlineSocialArtifactStorageCore } from "../../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  checksumTouchlineSocialArtifact,
  createTouchlineSocialPublicationDraft,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  touchlineSocialArtifactObjectKey,
} from "../../lib/touchlineArena/social-publication-contract.ts";
import {
  TOUCHLINE_SOCIAL_FONT_READY_TIMEOUT_MS,
  TOUCHLINE_SOCIAL_RENDER_NAVIGATION_TIMEOUT_MS,
} from "../../lib/touchlineArena/social-lineup-worker-budget.ts";
import {
  discoverTouchlineSocialLineupCandidates,
  touchlineSocialReviewReason as reviewReason,
  type TouchlineSocialLineupCandidate as Candidate,
} from "./touchline-social-lineup-candidates.mts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const TEMPLATE_VERSION = "touchline-lineup-feed-v1";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_SOCIAL_GENERATOR_ENV_MISSING:${name}`);
  return value;
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const projectRef = required("TOUCHLINE_QA_SUPABASE_PROJECT_REF");
const supabaseUrl = process.env.SUPABASE_URL?.trim() || required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const qaBaseUrl = required("TOUCHLINE_QA_BASE_URL");
const urlRef = new URL(supabaseUrl).hostname.split(".", 1)[0];
const base = new URL(qaBaseUrl);
if (process.env.VERCEL_ENV === "production"
  || projectRef !== QA_PROJECT_REF
  || urlRef !== QA_PROJECT_REF
  || base.protocol !== "https:"
  || base.hostname === "touchline.com.br"
  || (base.hostname !== STABLE_QA_HOST && base.hostname !== "localhost")) {
  throw new Error("TL_SOCIAL_GENERATOR_QA_BOUNDARY_MISMATCH");
}
const renderSecret = required("TOUCHLINE_LIVE_SYNC_SECRET");
if (renderSecret.length < 32) throw new Error("TL_SOCIAL_GENERATOR_RENDER_SECRET_INVALID");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = createTouchlineSocialArtifactStorageCore({ supabaseUrl, serviceRoleKey });

async function claimGeneration(candidate: Candidate) {
  const { data, error } = await admin.rpc("touchline_social_claim_generation", {
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_first_observed_at: candidate.firstObservedAt,
    p_input_checksum: candidate.inputChecksum,
    p_source_revision_manifest: candidate.sourceRevisionManifest,
    p_source_revision_checksum: candidate.sourceRevisionChecksum,
  });
  if (error) throw new Error("TL_SOCIAL_GENERATOR_CLAIM_FAILED");
  const result = data as { outcome?: unknown; leaseToken?: unknown; draftId?: unknown; nextEligibleAt?: unknown } | null;
  const outcome = String(result?.outcome ?? "");
  if (["busy", "cooldown", "noop_current"].includes(outcome)) {
    return { outcome, draftId: String(result?.draftId ?? "") || null, nextEligibleAt: result?.nextEligibleAt ?? null } as const;
  }
  const leaseToken = String(result?.leaseToken ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(leaseToken)) throw new Error("TL_SOCIAL_GENERATOR_CLAIM_INVALID");
  return { outcome: "claimed", leaseToken } as const;
}

async function claimGenerationCycle() {
  const { data, error } = await admin.rpc("touchline_social_claim_generation_cycle");
  if (error) throw new Error("TL_SOCIAL_GENERATOR_CYCLE_CLAIM_FAILED");
  const result = data as { outcome?: unknown; leaseToken?: unknown; nextEligibleAt?: unknown } | null;
  const outcome = String(result?.outcome ?? "");
  if (outcome === "busy" || outcome === "cooldown") {
    return { outcome, nextEligibleAt: result?.nextEligibleAt ?? null } as const;
  }
  const leaseToken = String(result?.leaseToken ?? "");
  if (outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(leaseToken)) {
    throw new Error("TL_SOCIAL_GENERATOR_CYCLE_CLAIM_INVALID");
  }
  return { outcome: "claimed", leaseToken } as const;
}

async function completeGenerationCycle(leaseToken: string, outcome: "SUCCESS" | "FAILURE") {
  const { error } = await admin.rpc("touchline_social_complete_generation_cycle", {
    p_lease_token: leaseToken,
    p_outcome: outcome,
  });
  if (error) throw new Error("TL_SOCIAL_GENERATOR_CYCLE_COMPLETE_FAILED");
}

async function renewGenerationCycle(leaseToken: string) {
  const { data, error } = await admin.rpc("touchline_social_renew_generation_cycle", {
    p_lease_token: leaseToken,
  });
  if (error || (data as { outcome?: unknown } | null)?.outcome !== "renewed") {
    throw new Error("TL_SOCIAL_GENERATOR_CYCLE_RENEW_FAILED");
  }
}

async function renewGeneration(candidate: Candidate, leaseToken: string) {
  const { data, error } = await admin.rpc("touchline_social_renew_generation", {
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_lease_token: leaseToken,
  });
  if (error || (data as { outcome?: unknown } | null)?.outcome !== "renewed") {
    throw new Error("TL_SOCIAL_GENERATOR_REVIEW_RENEW_FAILED");
  }
}

async function completeGeneration(
  candidate: Candidate,
  leaseToken: string,
  state: "REVIEW_REQUIRED" | "GENERATED",
  reasonCode: string,
  draftId: string | null,
  sourceVersion: string | null = null,
  sourceChecksum: string | null = null,
) {
  const { error } = await admin.rpc("touchline_social_complete_generation", {
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_lease_token: leaseToken,
    p_review_state: state,
    p_reason_code: reasonCode,
    p_generated_draft_id: draftId,
    p_source_version: sourceVersion,
    p_source_checksum: sourceChecksum,
  });
  if (error) throw new Error("TL_SOCIAL_GENERATOR_REVIEW_WRITE_FAILED");
}

const results: Array<Record<string, unknown>> = [];
const cycleClaim = await claimGenerationCycle();
if (cycleClaim.outcome !== "claimed") {
  process.stdout.write(JSON.stringify({
    projectRef,
    baseHost: base.hostname,
    templateVersion: TEMPLATE_VERSION,
    cycleOutcome: cycleClaim.outcome,
    nextEligibleAt: cycleClaim.nextEligibleAt,
    candidates: 0,
    generated: 0,
    reviewRequired: 0,
    results,
  }, null, 2) + "\n");
} else {
  let cycleOutcome: "SUCCESS" | "FAILURE" = "FAILURE";
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>> | null = null;
  try {
    for (const candidate of await discoverTouchlineSocialLineupCandidates({
      admin,
      base,
      renderSecret,
      explicitFixtureId: argument("fixture-id"),
      explicitTeamId: argument("team-id"),
      expectedInputChecksum: argument("expected-input-checksum"),
      expectedSourceRevisionChecksum: argument("expected-source-revision-checksum"),
    })) {
      await renewGenerationCycle(cycleClaim.leaseToken);
      const claim = await claimGeneration(candidate);
      if (claim.outcome !== "claimed") {
        results.push({
          ...candidate,
          state: claim.outcome === "noop_current" ? "GENERATED" : "SKIPPED",
          outcome: claim.outcome,
          draftId: claim.draftId,
          nextEligibleAt: claim.nextEligibleAt,
        });
        continue;
      }
      const leaseToken = claim.leaseToken;
      if (candidate.sourceReadiness !== "READY") {
        const reason = candidate.sourceReasonCode ?? "SOURCE_NOT_READY";
        await completeGeneration(candidate, leaseToken, "REVIEW_REQUIRED", reason, null);
        results.push({
          fixtureId: candidate.fixtureId,
          teamId: candidate.teamId,
          firstObservedAt: candidate.firstObservedAt,
          inputChecksum: candidate.inputChecksum,
          startsAt: candidate.startsAt,
          state: "REVIEW_REQUIRED",
          reason,
        });
        continue;
      }
      if (!browser) {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
          viewport: { width: 1080, height: 1350 },
          deviceScaleFactor: 1,
        });
        await context.addCookies([{
          name: "tl-social-render",
          value: renderSecret,
          domain: base.hostname,
          path: "/",
          httpOnly: true,
          secure: base.protocol === "https:",
          sameSite: "Strict",
        }]);
      }
      if (!context) throw new Error("TL_SOCIAL_GENERATOR_BROWSER_CONTEXT_UNAVAILABLE");
      const page = await context.newPage();
      try {
        const existing = await admin
          .from("touchline_social_publication_drafts")
          .select("revision")
          .eq("fixture_provider_id", candidate.fixtureId)
          .eq("team_provider_id", candidate.teamId)
          .eq("content_type", "LINEUP")
          .eq("placement", "INSTAGRAM_FEED")
          .eq("locale", "en-GB")
          .eq("template_version", TEMPLATE_VERSION)
          .order("revision", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing.error) throw new Error("DRAFT_READ_FAILED");
        const revision = Number(existing.data?.revision ?? 0) + 1;
        const renderPath = `/visual-qa/social-lineup?fixtureId=${candidate.fixtureId}&teamId=${candidate.teamId}&locale=en-GB&revision=${revision}`;
        const response = await page.goto(new URL(renderPath, base).toString(), {
          waitUntil: "domcontentloaded",
          timeout: TOUCHLINE_SOCIAL_RENDER_NAVIGATION_TIMEOUT_MS,
        });
        if (!response?.ok()) throw new Error(`RENDER_HTTP_${response?.status() ?? 0}`);
        await renewGenerationCycle(cycleClaim.leaseToken);
        await renewGeneration(candidate, leaseToken);
        await page.evaluate(async () => {
          await Promise.race([
            document.fonts.ready,
            new Promise((_, reject) => setTimeout(
              () => reject(new Error("FONT_READY_TIMEOUT")),
              TOUCHLINE_SOCIAL_FONT_READY_TIMEOUT_MS,
            )),
          ]);
        });
        const canvas = page.locator('[data-social-art="touchline-official-lineup"]');
        if (await canvas.count() !== 1) {
          const text = await page.locator("main").innerText().catch(() => "LINEUP_NOT_READY");
          await completeGeneration(candidate, leaseToken, "REVIEW_REQUIRED", reviewReason(text), null);
          results.push({ ...candidate, state: "REVIEW_REQUIRED", reason: reviewReason(text) });
          continue;
        }
        const metadata = await canvas.evaluate((node) => {
          const element = node as HTMLElement;
          const box = element.getBoundingClientRect();
          const players = [...element.querySelectorAll<HTMLElement>("[data-player-id]")];
          const bench = [...element.querySelectorAll<HTMLElement>("[data-bench-player-id]")];
          const images = [...element.querySelectorAll<HTMLImageElement>("img")];
          return {
            fixtureId: element.dataset.fixtureId,
            fixtureKind: element.dataset.fixtureKind,
            teamId: element.dataset.teamId,
            status: element.dataset.lineupStatus,
            firstObservedAt: element.dataset.lineupFirstObservedAt,
            sourceSnapshotAt: element.dataset.sourceSnapshotAt,
            sourceVersion: element.dataset.sourceVersion,
            sourceChecksum: element.dataset.sourceChecksum,
            sourceRevisionChecksum: element.dataset.sourceRevisionChecksum,
            caption: element.dataset.caption,
            templateVersion: element.dataset.templateVersion,
            width: box.width,
            height: box.height,
            playerCount: players.length,
            benchCount: bench.length,
            uniquePlayers: new Set(players.map((item) => item.dataset.playerId)).size,
            uniqueBench: new Set(bench.map((item) => item.dataset.benchPlayerId)).size,
            playerBenchOverlap: players.some((player) => bench.some((item) => item.dataset.benchPlayerId === player.dataset.playerId)),
            allCardsUpright: [...players, ...bench].every((item) => item.dataset.playerCardAxis === "0deg"),
            allImagesReady: images.every((image) => image.complete && image.naturalWidth > 0),
            overflow: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
          };
        });
      if (metadata.fixtureId !== candidate.fixtureId
        || metadata.fixtureKind !== "PERSISTED_OFFICIAL_FIXTURE"
        || metadata.teamId !== candidate.teamId
        || metadata.status !== "confirmed"
        || metadata.firstObservedAt !== candidate.firstObservedAt
        || metadata.templateVersion !== TEMPLATE_VERSION
        || metadata.width !== 1080
        || metadata.height !== 1350
        || metadata.playerCount !== 11
        || metadata.benchCount !== 9
        || metadata.uniquePlayers !== 11
        || metadata.uniqueBench !== 9
        || metadata.playerBenchOverlap
        || !metadata.allCardsUpright
        || !metadata.allImagesReady
        || metadata.overflow
        || !metadata.caption
        || !metadata.sourceVersion
        || !metadata.sourceChecksum?.match(/^sha256:[a-f0-9]{64}$/)
        || metadata.sourceChecksum !== candidate.inputChecksum
        || !metadata.sourceRevisionChecksum?.match(/^sha256:[a-f0-9]{64}$/)
        || metadata.sourceRevisionChecksum !== candidate.sourceRevisionChecksum
        || !Number.isFinite(Date.parse(metadata.sourceSnapshotAt ?? ""))) {
        await completeGeneration(candidate, leaseToken, "REVIEW_REQUIRED", "RENDER_CONTRACT_MISMATCH", null);
        results.push({ ...candidate, state: "REVIEW_REQUIRED", reason: "RENDER_CONTRACT_MISMATCH" });
        continue;
      }
      const artifactBytes = new Uint8Array(await canvas.screenshot({ type: "png", animations: "disabled" }));
      await renewGenerationCycle(cycleClaim.leaseToken);
      await renewGeneration(candidate, leaseToken);
      const artifactChecksum = checksumTouchlineSocialArtifact(artifactBytes);
      const objectKey = touchlineSocialArtifactObjectKey({
        fixtureId: candidate.fixtureId,
        teamId: candidate.teamId,
        contentType: "LINEUP",
        placement: "INSTAGRAM_FEED",
        locale: "en-GB",
        revision,
        templateVersion: TEMPLATE_VERSION,
        sourceVersion: metadata.sourceVersion,
        artifactChecksum,
        artifactMimeType: "image/png",
      });
      let locator;
      try {
        locator = await storage.uploadCreateOnly({
          objectKey,
          contentType: "image/png",
          bytes: artifactBytes,
          artifactChecksum,
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS") throw error;
        const existingLocator = {
          storageProvider: "SUPABASE_STORAGE" as const,
          bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
          objectKey,
          etag: null,
        };
        locator = (await storage.readExact(existingLocator)).locator;
      }
      await renewGenerationCycle(cycleClaim.leaseToken);
      await renewGeneration(candidate, leaseToken);
      const generatedAt = new Date().toISOString();
      const created = await createTouchlineSocialPublicationDraft({
        fixtureId: candidate.fixtureId,
        teamId: candidate.teamId,
        contentType: "LINEUP",
        placement: "INSTAGRAM_FEED",
        locale: "en-GB",
        revision,
        renderPath,
        caption: metadata.caption,
        firstObservedAt: candidate.firstObservedAt,
        sourceSnapshotAt: metadata.sourceSnapshotAt!,
        templateVersion: TEMPLATE_VERSION,
        sourceVersion: metadata.sourceVersion,
        sourceChecksum: metadata.sourceChecksum,
        sourceRevisionManifest: candidate.sourceRevisionManifest,
        sourceRevisionChecksum: candidate.sourceRevisionChecksum,
        inputChecksum: candidate.inputChecksum,
        artifactMimeType: "image/png",
        artifactBytes,
        artifactLocator: locator,
        generatedAt,
      });
      if (!created.ok) throw new Error(`DRAFT_CONTRACT_${created.reason}`);
      const draft = created.draft;
      const inserted = await admin.rpc("touchline_social_create_draft", { p_draft: {
        publication_key: draft.publicationKey,
        fixture_provider_id: draft.fixtureId,
        team_provider_id: draft.teamId,
        content_type: draft.contentType,
        placement: draft.placement,
        locale: draft.locale,
        revision: draft.revision,
        render_path: draft.renderPath,
        width: draft.width,
        height: draft.height,
        caption: draft.caption,
        first_observed_at: draft.firstObservedAt,
        source_snapshot_at: draft.sourceSnapshotAt,
        generated_at: draft.generatedAt,
        template_version: draft.templateVersion,
        source_version: draft.sourceVersion,
        source_checksum: draft.sourceChecksum,
        source_revision_manifest: draft.sourceRevisionManifest,
        source_revision_checksum: draft.sourceRevisionChecksum,
        input_checksum: draft.inputChecksum,
        artifact_content_type: draft.artifactMimeType,
        artifact_byte_length: draft.artifactByteLength,
        artifact_storage_provider: draft.artifactLocator.storageProvider,
        artifact_storage_bucket: draft.artifactLocator.bucket,
        artifact_storage_key: draft.artifactLocator.objectKey,
        artifact_etag: draft.artifactLocator.etag,
        manifest_checksum: draft.manifestChecksum,
        artifact_checksum: draft.artifactChecksum,
        caption_checksum: draft.captionChecksum,
      } });
      const insertedData = inserted.data as { draftId?: unknown } | null;
      const insertedDraftId = String(insertedData?.draftId ?? "");
      if (inserted.error || !insertedDraftId) throw new Error("DRAFT_INSERT_FAILED");
      await renewGenerationCycle(cycleClaim.leaseToken);
      await renewGeneration(candidate, leaseToken);
      await completeGeneration(
        candidate,
        leaseToken,
        "GENERATED",
        "IMMUTABLE_DRAFT_READY",
        insertedDraftId,
        metadata.sourceVersion,
        metadata.sourceChecksum,
      );
      results.push({
        ...candidate,
        state: "GENERATED",
        draftId: insertedDraftId,
        generatedAt,
        generationLatencyMs: draft.generationLatencyMs,
        artifactChecksum: draft.artifactChecksum,
      });
    } catch (error) {
      const reason = reviewReason(error instanceof Error ? error.message : "GENERATION_FAILED");
      try {
        await completeGeneration(candidate, leaseToken, "REVIEW_REQUIRED", reason, null);
      } catch (reviewError) {
        throw new Error(
          `GENERATION_REVIEW_PERSIST_FAILED:${candidate.fixtureId}:${candidate.teamId}:${reviewError instanceof Error ? reviewError.message : "UNKNOWN"}`,
          { cause: error },
        );
      }
      results.push({ ...candidate, state: "REVIEW_REQUIRED", reason });
    } finally {
      await page.close();
    }
    }
    cycleOutcome = "SUCCESS";
  } finally {
    await context?.close();
    await browser?.close();
    await completeGenerationCycle(cycleClaim.leaseToken, cycleOutcome);
  }

  process.stdout.write(JSON.stringify({
    projectRef,
    baseHost: base.hostname,
    templateVersion: TEMPLATE_VERSION,
    cycleOutcome: cycleOutcome.toLowerCase(),
    candidates: results.length,
    generated: results.filter((item) => item.state === "GENERATED").length,
    reviewRequired: results.filter((item) => item.state === "REVIEW_REQUIRED").length,
    results,
  }, null, 2) + "\n");
}
