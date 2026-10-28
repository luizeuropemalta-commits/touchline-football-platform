import Link from "next/link";
import { socialAdminLanguage, socialAdminDate, socialAdminState } from "@/lib/touchlineArena/social-admin-language";
import { notFound } from "next/navigation";

import { GamePanel, LivePill } from "@/components/arena-admin-ui";
import TouchlineSocialDeliveryControlActions from "@/components/touchline/admin/TouchlineSocialDeliveryControlActions";
import TouchlineSocialDraftReviewActions from "@/components/touchline/admin/TouchlineSocialDraftReviewActions";
import TouchlineSocialTemplatePolicyActions from "@/components/touchline/admin/TouchlineSocialTemplatePolicyActions";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  touchlineSocialExecutorHealth,
  type TouchlineSocialExecutorCycleRow,
} from "@/lib/touchlineArena/social-draft-executor-health";

export const dynamic = "force-dynamic";

type DraftRow = {
  id: string;
  fixture_provider_id: string;
  event_provider_id: string | null;
  team_provider_id: string | null;
  scope_provider_id: string | null;
  subject_player_provider_id: string | null;
  content_type: string;
  placement: string;
  locale: string;
  revision: number;
  width: number;
  height: number;
  caption: string;
  artifact_storage_bucket: string;
  artifact_storage_key: string;
  artifact_checksum: string;
  caption_checksum: string;
  manifest_checksum: string;
  source_revision_checksum: string;
  approval_state: string;
  artwork_approval_state: string;
  caption_approval_state: string;
  created_at: string;
};

type GenerationReviewRow = {
  id: string;
  fixture_provider_id: string;
  team_provider_id: string;
  template_version: string;
  review_state: "REVIEW_REQUIRED" | "GENERATING" | "GENERATED";
  reason_code: string;
  first_observed_at: string;
  last_checked_at: string;
  generated_draft_id: string | null;
};

type GenerationCycleRow = {
  lease_name: string;
  lease_expires_at: string | null;
  next_eligible_at: string;
  consecutive_failures: number;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_outcome: "SUCCESS" | "FAILURE" | null;
};

type GenerationHealth = "healthy" | "running" | "backoff" | "stalled" | "stale" | "never-run";

type GenerationJobRow = {
  id: string;
  fixture_provider_id: string;
  team_provider_id: string;
  job_state: "PENDING" | "RUNNING" | "RETRY_WAIT" | "REVIEW_REQUIRED";
  reason_code: string;
  attempt_count: number;
  next_eligible_at: string | null;
  last_started_at: string | null;
  completed_at: string | null;
};

type MatchPreviewJobRow = {
  id: string;
  fixture_provider_id: string;
  job_state: "PENDING" | "RUNNING" | "RETRY_WAIT" | "COMPLETED" | "REVIEW_REQUIRED" | "SUPERSEDED";
  reason_code: string;
  attempt_count: number;
  next_eligible_at: string | null;
  last_started_at: string | null;
  completed_at: string | null;
  generated_draft_id: string | null;
};

type ConfirmedEventJobRow = MatchPreviewJobRow & {
  event_provider_id: string;
};

type RankingJobRow = MatchPreviewJobRow & {
  scope_provider_id: string | null;
  subject_player_provider_id: string | null;
};

type ClubFeedJobRow = {
  id: string;
  source_draft_id: string;
  target_provider_team_ids: string[];
  job_state: "PENDING" | "RUNNING" | "RETRY_WAIT" | "COMPLETED" | "REVIEW_REQUIRED" | "ARCHIVED";
  reason_code: string;
  attempt_count: number;
  next_eligible_at: string | null;
  completed_at: string | null;
};

type ClubFeedPostRow = {
  id: string;
  content_type: string;
  published_at: string;
  expires_at: string;
};

type ClubFeedAdminStatus = {
  cycles: TouchlineSocialExecutorCycleRow[];
  jobs: ClubFeedJobRow[];
  jobCount: number;
  posts: ClubFeedPostRow[];
  postCount: number;
  tombstoneCount: number;
};

type TemplatePolicyCycleRow = {
  component: "REGISTRY" | "EVALUATOR";
  lease_state: "active" | null;
  lease_expires_at: string | null;
  next_eligible_at: string;
  consecutive_failures: number;
  run_count: number;
  completed_count: number;
  timeout_recovery_count: number;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_outcome: string | null;
  last_error_code: string | null;
  last_items_processed: number;
};

type TemplatePolicyTemplateRow = {
  id: string;
  content_type: string;
  placement: string;
  locale: string;
  width: number;
  height: number;
  template_version: string;
  template_identity_checksum: string;
  visual_template_checksum: string;
  base_copy_checksum: string;
  lexicon_checksum: string;
  state: string;
  artwork_template_approval_state: string;
  caption_template_approval_state: string;
  updated_at: string;
};

type TemplatePolicyControlRow = {
  scope_key: string;
  content_type: string | null;
  kill_switch_engaged: boolean;
  daily_quota: number | null;
  minimum_gap_seconds: number | null;
  outbound_mode: "DISABLED";
  reason_code: string;
  updated_at: string;
};

type TemplatePolicyCandidateRow = {
  id: string;
  state: string;
  reason_code: string;
  approved_template_version: string;
  created_at: string;
};

type TemplatePolicyAdminStatus = {
  cycles: TemplatePolicyCycleRow[];
  templates: TemplatePolicyTemplateRow[];
  controls: TemplatePolicyControlRow[];
  candidates: TemplatePolicyCandidateRow[];
  templateCount: number;
  readyCount: number;
  deliveryUnknownCount: number;
  outboundMode: "DISABLED";
};

function generationHealth(cycle: GenerationCycleRow | null, now = Date.now()): GenerationHealth {
  if (!cycle?.last_started_at) return "never-run";
  const leaseExpiresAt = cycle.lease_expires_at ? Date.parse(cycle.lease_expires_at) : NaN;
  const lastStartedAt = Date.parse(cycle.last_started_at);
  const lastCompletedAt = cycle.last_completed_at ? Date.parse(cycle.last_completed_at) : NaN;
  const nextEligibleAt = Date.parse(cycle.next_eligible_at);
  if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now) return "running";
  if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= now
    && (!Number.isFinite(lastCompletedAt) || lastStartedAt > lastCompletedAt)) return "stalled";
  if (cycle.last_outcome === "FAILURE" && Number.isFinite(nextEligibleAt) && nextEligibleAt > now) return "backoff";
  if (cycle.last_outcome !== "SUCCESS" || !Number.isFinite(lastCompletedAt)) return "stale";
  return now - lastCompletedAt <= 120_000 ? "healthy" : "stale";
}

function missingMigration(message: string) {
  return /does not exist|schema cache|Could not find the table/i.test(message);
}

function pageNumber(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : 0;
}

export default async function TouchlineSocialPublicationsAdmin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { locale, t } = socialAdminLanguage(Array.isArray(query.lang) ? query.lang[0] : query.lang);
  const label = (value: string) => socialAdminState(value, locale);
  const date = (value: string | null | undefined) => socialAdminDate(value, locale);
  const draftPage = pageNumber(query.draftPage);
  const reviewPage = pageNumber(query.reviewPage);
  const pageSize = 50;
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return <GamePanel className="p-8"><LivePill>{t("Configuração necessária")}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">{t("Publicações sociais")}</h1><p className="mt-3 text-sm text-slate-400">{t("A administração protegida ainda não está configurada.")}</p></GamePanel>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) notFound();

  const [draftResult, cycleResult, executorCyclesResult, openJobsResult,
    matchPreviewCyclesResult, matchPreviewJobsResult,
    finalResultCyclesResult, finalResultJobsResult,
    confirmedEventCyclesResult, confirmedEventJobsResult,
    rankingCyclesResult, rankingJobsResult,
    clubFeedStatusResult, templatePolicyStatusResult] = await Promise.all([
    admin
      .from("touchline_social_publication_drafts")
      .select("id,fixture_provider_id,event_provider_id,team_provider_id,scope_provider_id,subject_player_provider_id,content_type,placement,locale,revision,width,height,caption,artifact_storage_bucket,artifact_storage_key,artifact_checksum,caption_checksum,manifest_checksum,source_revision_checksum,approval_state,artwork_approval_state,caption_approval_state,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(draftPage * pageSize, draftPage * pageSize + pageSize - 1)
      .returns<DraftRow[]>(),
    admin
      .from("touchline_social_generation_cycles")
      .select("lease_name,lease_expires_at,next_eligible_at,consecutive_failures,last_started_at,last_completed_at,last_outcome")
      .eq("lease_name", "lineup-draft-watcher")
      .maybeSingle<GenerationCycleRow>(),
    admin
      .from("touchline_social_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"])
      .returns<TouchlineSocialExecutorCycleRow[]>(),
    admin
      .from("touchline_social_generation_jobs")
      .select("id,fixture_provider_id,team_provider_id,job_state,reason_code,attempt_count,next_eligible_at,last_started_at,completed_at", { count: "exact" })
      .in("job_state", ["PENDING", "RUNNING", "RETRY_WAIT", "REVIEW_REQUIRED"])
      .order("last_scheduled_at", { ascending: false })
      .range(0, 24)
      .returns<GenerationJobRow[]>(),
    admin
      .from("touchline_social_match_preview_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"])
      .returns<TouchlineSocialExecutorCycleRow[]>(),
    admin
      .from("touchline_social_match_preview_generation_jobs")
      .select("id,fixture_provider_id,job_state,reason_code,attempt_count,next_eligible_at,last_started_at,completed_at,generated_draft_id", { count: "exact" })
      .order("last_scheduled_at", { ascending: false })
      .range(0, 49)
      .returns<MatchPreviewJobRow[]>(),
    admin
      .from("touchline_social_final_result_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"])
      .returns<TouchlineSocialExecutorCycleRow[]>(),
    admin
      .from("touchline_social_final_result_generation_jobs")
      .select("id,fixture_provider_id,job_state,reason_code,attempt_count,next_eligible_at,last_started_at,completed_at,generated_draft_id", { count: "exact" })
      .order("last_scheduled_at", { ascending: false })
      .range(0, 49)
      .returns<MatchPreviewJobRow[]>(),
    admin
      .from("touchline_social_confirmed_event_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"])
      .returns<TouchlineSocialExecutorCycleRow[]>(),
    admin
      .from("touchline_social_confirmed_event_generation_jobs")
      .select("id,fixture_provider_id,event_provider_id,job_state,reason_code,attempt_count,next_eligible_at,last_started_at,completed_at,generated_draft_id", { count: "exact" })
      .order("last_scheduled_at", { ascending: false })
      .range(0, 49)
      .returns<ConfirmedEventJobRow[]>(),
    admin
      .from("touchline_social_ranking_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"])
      .returns<TouchlineSocialExecutorCycleRow[]>(),
    admin
      .from("touchline_social_ranking_generation_jobs")
      .select("id,fixture_provider_id,scope_provider_id,subject_player_provider_id,job_state,reason_code,attempt_count,next_eligible_at,last_started_at,completed_at,generated_draft_id", { count: "exact" })
      .order("last_scheduled_at", { ascending: false })
      .range(0, 49)
      .returns<RankingJobRow[]>(),
    admin.rpc("touchline_social_045_admin_status"),
    admin.rpc("touchline_social_046_admin_status"),
  ]);
  const data = draftResult.data;
  const error = draftResult.error;
  const draftIds = (data ?? []).map((draft) => draft.id);
  const reviewSelect = "id,fixture_provider_id,team_provider_id,template_version,review_state,reason_code,first_observed_at,last_checked_at,generated_draft_id";
  const [visibleReviewResult, blockedReviewResult] = await Promise.all([
    draftIds.length
      ? admin.from("touchline_social_generation_reviews")
        .select(reviewSelect)
        .in("generated_draft_id", draftIds)
        .returns<GenerationReviewRow[]>()
      : Promise.resolve({ data: [] as GenerationReviewRow[], error: null }),
    admin.from("touchline_social_generation_reviews")
      .select(reviewSelect, { count: "exact" })
      .eq("review_state", "REVIEW_REQUIRED")
      .order("last_checked_at", { ascending: false })
      .range(reviewPage * pageSize, reviewPage * pageSize + pageSize - 1)
      .returns<GenerationReviewRow[]>(),
  ]);
  const reviewRows = [...new Map([
    ...(visibleReviewResult.data ?? []),
    ...(blockedReviewResult.data ?? []),
  ].map((review) => [review.id, review] as const)).values()];
  const migrationPending = Boolean(
    (error && missingMigration(error.message))
    || (visibleReviewResult.error && missingMigration(visibleReviewResult.error.message))
    || (blockedReviewResult.error && missingMigration(blockedReviewResult.error.message))
    || (cycleResult.error && missingMigration(cycleResult.error.message))
  );
  const executorPending = Boolean(
    (executorCyclesResult.error && missingMigration(executorCyclesResult.error.message))
    || (openJobsResult.error && missingMigration(openJobsResult.error.message))
  );
  const matchPreviewPending = Boolean(
    (matchPreviewCyclesResult.error && missingMigration(matchPreviewCyclesResult.error.message))
    || (matchPreviewJobsResult.error && missingMigration(matchPreviewJobsResult.error.message))
  );
  const finalResultPending = Boolean(
    (finalResultCyclesResult.error && missingMigration(finalResultCyclesResult.error.message))
    || (finalResultJobsResult.error && missingMigration(finalResultJobsResult.error.message))
  );
  const confirmedEventPending = Boolean(
    (confirmedEventCyclesResult.error && missingMigration(confirmedEventCyclesResult.error.message))
    || (confirmedEventJobsResult.error && missingMigration(confirmedEventJobsResult.error.message))
  );
  const rankingPending = Boolean(
    (rankingCyclesResult.error && missingMigration(rankingCyclesResult.error.message))
    || (rankingJobsResult.error && missingMigration(rankingJobsResult.error.message))
  );
  const clubFeedPending = Boolean(
    clubFeedStatusResult.error && missingMigration(clubFeedStatusResult.error.message)
  );
  const templatePolicyPending = Boolean(
    templatePolicyStatusResult.error && missingMigration(templatePolicyStatusResult.error.message)
  );
  const readFailure = error || visibleReviewResult.error || blockedReviewResult.error || cycleResult.error
    || executorCyclesResult.error || openJobsResult.error
    || matchPreviewCyclesResult.error || matchPreviewJobsResult.error
    || finalResultCyclesResult.error || finalResultJobsResult.error
    || confirmedEventCyclesResult.error || confirmedEventJobsResult.error
    || rankingCyclesResult.error || rankingJobsResult.error
    || clubFeedStatusResult.error || templatePolicyStatusResult.error;
  if (readFailure && !migrationPending && !executorPending && !matchPreviewPending
    && !finalResultPending && !confirmedEventPending && !rankingPending && !clubFeedPending
    && !templatePolicyPending) return <GamePanel className="p-8"><LivePill>{t("Leitura indisponível")}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">{t("Publicações sociais")}</h1><p className="mt-3 text-sm text-slate-400">{t("Os rascunhos protegidos não puderam ser lidos.")}</p></GamePanel>;

  const drafts = await Promise.all((data ?? []).map(async (draft) => {
    const { data: signed } = await admin.storage
      .from(draft.artifact_storage_bucket)
      .createSignedUrl(draft.artifact_storage_key, 300);
    return { ...draft, signedUrl: signed?.signedUrl ?? null };
  }));
  const currentGeneratedDraftIds = new Set(reviewRows.flatMap((review) => (
    review.review_state === "GENERATED" && review.generated_draft_id ? [review.generated_draft_id] : []
  )));
  const health = generationHealth(cycleResult.data ?? null);
  const executorHealth = touchlineSocialExecutorHealth(executorCyclesResult.data ?? []);
  const approvalsOperational = health === "healthy" && !executorPending && executorHealth.operational;
  const matchPreviewExecutorHealth = touchlineSocialExecutorHealth(matchPreviewCyclesResult.data ?? []);
  const matchPreviewApprovalsOperational = !matchPreviewPending && matchPreviewExecutorHealth.operational;
  const currentMatchPreviewDraftIds = new Set((matchPreviewJobsResult.data ?? []).flatMap((job) => (
    job.job_state === "COMPLETED" && job.generated_draft_id ? [job.generated_draft_id] : []
  )));
  const finalResultExecutorHealth = touchlineSocialExecutorHealth(finalResultCyclesResult.data ?? []);
  const finalResultApprovalsOperational = !finalResultPending && finalResultExecutorHealth.operational;
  const currentFinalResultDraftIds = new Set((finalResultJobsResult.data ?? []).flatMap((job) => (
    job.job_state === "COMPLETED" && job.generated_draft_id ? [job.generated_draft_id] : []
  )));
  const confirmedEventExecutorHealth = touchlineSocialExecutorHealth(confirmedEventCyclesResult.data ?? []);
  const confirmedEventApprovalsOperational = !confirmedEventPending && confirmedEventExecutorHealth.operational;
  const currentConfirmedEventDraftIds = new Set((confirmedEventJobsResult.data ?? []).flatMap((job) => (
    job.job_state === "COMPLETED" && job.generated_draft_id ? [job.generated_draft_id] : []
  )));
  const rankingExecutorHealth = touchlineSocialExecutorHealth(rankingCyclesResult.data ?? []);
  const rankingApprovalsOperational = !rankingPending && rankingExecutorHealth.operational;
  const currentRankingDraftIds = new Set((rankingJobsResult.data ?? []).flatMap((job) => (
    job.job_state === "COMPLETED" && job.generated_draft_id ? [job.generated_draft_id] : []
  )));
  const clubFeedStatus = (clubFeedStatusResult.data ?? null) as ClubFeedAdminStatus | null;
  const clubFeedCycles = clubFeedStatus?.cycles ?? [];
  const clubFeedExecutorHealth = touchlineSocialExecutorHealth(clubFeedCycles);
  const clubFeedJobs = clubFeedStatus?.jobs ?? [];
  const clubFeedPosts = clubFeedStatus?.posts ?? [];
  const templatePolicyStatus = (templatePolicyStatusResult.data ?? null) as TemplatePolicyAdminStatus | null;
  const templatePolicyTemplates = templatePolicyStatus?.templates ?? [];
  const templatePolicyControls = templatePolicyStatus?.controls ?? [];
  const draftCount = draftResult.count ?? 0;
  const blockedReviewCount = blockedReviewResult.count ?? 0;
  const blockedReviews = reviewRows.filter((review) => review.review_state === "REVIEW_REQUIRED");
  const openJobs = openJobsResult.data ?? [];

  return <div lang={locale} className="mx-auto max-w-[1300px] space-y-6">
    <GamePanel className="p-6 sm:p-8">
      <nav aria-label={t("Idioma")} className="mb-4 flex gap-3 text-sm font-bold">
        {(["pt-BR", "en-GB"] as const).map((language) => <Link key={language} href={`/admin/social-publications?lang=${language}&draftPage=${draftPage}&reviewPage=${reviewPage}`} aria-current={locale === language ? "page" : undefined} hrefLang={language} className="text-[#b7ff45] underline underline-offset-4">{language === "pt-BR" ? "Português" : "English"}</Link>)}
      </nav>
      <LivePill>{t("QA · aprovação humana obrigatória")}</LivePill>
      <h1 className="mt-5 text-4xl font-black italic text-white sm:text-6xl">{t("Publicações sociais")}</h1>
      <Link href={`/admin/social-publications/studio?lang=${locale}`} className="mt-5 inline-flex text-sm font-bold text-[#b7ff45] underline underline-offset-4">{t("Abrir Studio · artes PNG e download")}</Link>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">{t("Arte e legenda são aprovadas separadamente. Aprovar as duas apenas torna a revisão elegível para uma outbox futura; esta tela não publica, não despacha e não se conecta ao Instagram.")}</p>
      <Link href={`/admin?lang=${locale}`} className="mt-5 inline-flex rounded-2xl border border-white/10 px-4 py-3 text-xs font-black text-white">{t("Voltar ao Admin")}</Link>
    </GamePanel>
    {migrationPending ? <GamePanel className="p-6"><LivePill>{t("Migration 039 ausente")}</LivePill><h2 className="mt-4 text-2xl font-black text-white">{t("Approval-only indisponível")}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{t("Nenhum rascunho pode ser aprovado enquanto o contrato 039 não estiver presente no ambiente QA verificado.")}</p></GamePanel> : null}
    {!migrationPending && executorPending ? <GamePanel className="p-6"><LivePill>{t("Executor 040 ausente")}</LivePill><h2 className="mt-4 text-2xl font-black text-white">{t("Geração automática bloqueada")}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{t("Arte e legenda permanecem bloqueadas até o scheduler e o runner DRAFT-only receberem auditoria independente e ativação explícita somente em QA.")}</p></GamePanel> : null}
    {!migrationPending ? <GamePanel className="p-6">
      <LivePill>{health === "healthy" ? t("GERADOR · SAUDÁVEL") : health === "running" ? t("GERADOR · EM EXECUÇÃO") : t("GERADOR · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Ciclo automático auditável")}</h2>
      {cycleResult.data ? <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        <p><span className="block text-[9px] font-black text-slate-500">{t("ÚLTIMA CONCLUSÃO")}</span>{cycleResult.data.last_completed_at ? date(cycleResult.data.last_completed_at) : t("Aguardando primeiro ciclo")}</p>
        <p><span className="block text-[9px] font-black text-slate-500">{t("RESULTADO")}</span>{cycleResult.data.last_outcome ? label(cycleResult.data.last_outcome) : t("Ainda não executado")}</p>
        <p><span className="block text-[9px] font-black text-slate-500">{t("FALHAS CONSECUTIVAS")}</span>{cycleResult.data.consecutive_failures}</p>
      </div> : <p className="mt-3 text-sm text-slate-400">{t("Aguardando a primeira execução protegida do gerador.")}</p>}
      {!approvalsOperational ? <p role="alert" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">{t("Aprovações bloqueadas: o ciclo está")}{" "}{label(health)}{t(". Aguarde uma verificação automática saudável da fonte oficial.")}</p> : null}
    </GamePanel> : null}
    {!migrationPending && !executorPending ? <GamePanel className="p-6">
      <LivePill>{executorHealth.operational ? t("EXECUTOR · SAUDÁVEL") : t("EXECUTOR · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Scheduler e runner duráveis")}</h2>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (executorCyclesResult.data ?? []).find((item) => item.component === component);
          const componentHealth = component === "SCHEDULER" ? executorHealth.scheduler : executorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
            <strong className="text-white">{label(component)}</strong>
            <p className="mt-2 font-black text-[#a3ff12]">{label(componentHealth)}</p>
            <p className="mt-2 text-slate-500">{t("Última execução:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p>
            <p className="mt-1 text-slate-500">{t("Falhas:")}{" "}{cycle?.consecutive_failures ?? 0}{" "}{t("· retries recuperados:")}{" "}{cycle?.timeout_recovery_count ?? 0}</p>
            {cycle?.last_error_code ? <p className="mt-1 font-mono text-amber-100">{cycle.last_error_code}</p> : null}
          </div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
          <strong className="text-white">{t("FILA ATIVA")}</strong>
          <p className="mt-2 font-black text-[#a3ff12]">{openJobsResult.count ?? 0}</p>
          <p className="mt-2 text-slate-500">{t("PENDING/RUNNING/RETRY/REVIEW_REQUIRED")}</p>
        </div>
      </div>
      {openJobs.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">
        {openJobs.slice(0, 10).map((job) => <div key={job.id} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] text-slate-400">
          <strong className="text-white">{t("Fixture")}{" "}{job.fixture_provider_id}{" "}{t("· Team")}{" "}{job.team_provider_id}</strong>
          <span className="ml-2 font-black text-amber-100">{label(job.job_state)}</span>
          <p className="mt-1">{t("Código de motivo:")} {job.reason_code}{" "}{t("· tentativa")}{" "}{job.attempt_count}/5</p>
        </div>)}
      </div> : <p className="mt-4 text-xs text-slate-500">{t("Nenhum job ativo ou em revisão.")}</p>}
      {!executorHealth.operational ? <p role="alert" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">{t("Aprovações bloqueadas: scheduler")}{" "}{label(executorHealth.scheduler)}{t("; runner")}{" "}{label(executorHealth.runner)}{t(". Nenhuma publicação externa é executada por este sistema.")}</p> : null}
    </GamePanel> : null}
    {!migrationPending && !matchPreviewPending ? <GamePanel className="p-6">
      <LivePill>{matchPreviewExecutorHealth.operational ? t("MATCH PREVIEW 041 · SAUDÁVEL") : t("MATCH PREVIEW 041 · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Preview pré-jogo automático")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("Confronto, posições e líderes dos clubes vêm de uma única revisão canônica. Nenhuma escalação é inferida e nenhuma ação externa é executada.")}</p>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (matchPreviewCyclesResult.data ?? []).find((item) => item.component === component);
          const state = component === "SCHEDULER" ? matchPreviewExecutorHealth.scheduler : matchPreviewExecutorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{label(component)}</strong><p className="mt-2 font-black text-[#a3ff12]">{label(state)}</p><p className="mt-2 text-slate-500">{t("Última conclusão:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p></div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("JOBS 041")}</strong><p className="mt-2 font-black text-[#a3ff12]">{matchPreviewJobsResult.count ?? 0}</p><p className="mt-2 text-slate-500">{t("Todas as revisões observáveis")}</p></div>
      </div>
    </GamePanel> : null}
    {!migrationPending && !finalResultPending ? <GamePanel className="p-6">
      <LivePill>{finalResultExecutorHealth.operational ? t("FINAL RESULT 042 · SAUDÁVEL") : t("FINAL RESULT 042 · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Full Time Feed e Final Score Story")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("Placar, golos, pontuação final e Top Match Card compartilham uma revisão factual. Arte e legenda continuam com aprovações separadas e sem outbound.")}</p>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (finalResultCyclesResult.data ?? []).find((item) => item.component === component);
          const state = component === "SCHEDULER" ? finalResultExecutorHealth.scheduler : finalResultExecutorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{label(component)}</strong><p className="mt-2 font-black text-[#a3ff12]">{label(state)}</p><p className="mt-2 text-slate-500">{t("Última conclusão:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p></div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("JOBS 042")}</strong><p className="mt-2 font-black text-[#a3ff12]">{finalResultJobsResult.count ?? 0}</p><p className="mt-2 text-slate-500">{t("Feed e Story observáveis")}</p></div>
      </div>
    </GamePanel> : null}
    {!migrationPending && !confirmedEventPending ? <GamePanel className="p-6">
      <LivePill>{confirmedEventExecutorHealth.operational ? t("MATCH EVENTS 043 · SAUDÁVEL") : t("MATCH EVENTS 043 · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Goal e Red Card Stories confirmados")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("Somente eventos confirmados e estáveis geram DRAFT. VAR, evento pendente ou dado contraditório permanecem bloqueados; nenhuma ação externa é executada.")}</p>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (confirmedEventCyclesResult.data ?? []).find((item) => item.component === component);
          const state = component === "SCHEDULER" ? confirmedEventExecutorHealth.scheduler : confirmedEventExecutorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{label(component)}</strong><p className="mt-2 font-black text-[#a3ff12]">{label(state)}</p><p className="mt-2 text-slate-500">{t("Última conclusão:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p></div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("JOBS 043")}</strong><p className="mt-2 font-black text-[#a3ff12]">{confirmedEventJobsResult.count ?? 0}</p><p className="mt-2 text-slate-500">{t("Eventos confirmados observáveis")}</p></div>
      </div>
    </GamePanel> : null}
    {!migrationPending && !rankingPending ? <GamePanel className="p-6">
      <LivePill>{rankingExecutorHealth.operational ? t("RANKING FAMILY 044 · SAUDÁVEL") : t("RANKING FAMILY 044 · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Rankings, duelos e heróis verificados")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("Top 3, Player Duel, Gameweek Hero, Top Performer e Hat-trick Hero usam a mesma revisão canônica. Total Rating e Match Rating permanecem distintos; nenhuma ação externa é executada.")}</p>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (rankingCyclesResult.data ?? []).find((item) => item.component === component);
          const state = component === "SCHEDULER" ? rankingExecutorHealth.scheduler : rankingExecutorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{label(component)}</strong><p className="mt-2 font-black text-[#a3ff12]">{label(state)}</p><p className="mt-2 text-slate-500">{t("Última conclusão:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p></div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("JOBS 044")}</strong><p className="mt-2 font-black text-[#a3ff12]">{rankingJobsResult.count ?? 0}</p><p className="mt-2 text-slate-500">{t("Feed approval-only observável")}</p></div>
      </div>
    </GamePanel> : null}
    {!migrationPending && !clubFeedPending ? <GamePanel className="p-6">
      <LivePill>{clubFeedExecutorHealth.operational ? t("CLUB SOCIAL FEED 045 · SAUDÁVEL") : t("CLUB SOCIAL FEED 045 · ATENÇÃO")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Canal oficial dos clubes")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("Um único post canônico referencia a mídia já aprovada e é distribuído aos clubes elegíveis sem duplicar os bytes. Conteúdo ativo expira em 14 dias; o tombstone mínimo preserva a auditoria.")}</p>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-4">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = clubFeedCycles.find((item) => item.component === component);
          const state = component === "SCHEDULER" ? clubFeedExecutorHealth.scheduler : clubFeedExecutorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{label(component)}</strong><p className="mt-2 font-black text-[#a3ff12]">{label(state)}</p><p className="mt-2 text-slate-500">{t("Última conclusão:")}{" "}{cycle?.last_completed_at ? date(cycle.last_completed_at) : t("nunca")}</p></div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("POSTS ATIVOS")}</strong><p className="mt-2 font-black text-[#a3ff12]">{clubFeedStatus?.postCount ?? 0}</p><p className="mt-2 text-slate-500">{t("Somente referências, sem cópia de mídia")}</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("TOMBSTONES")}</strong><p className="mt-2 font-black text-[#a3ff12]">{clubFeedStatus?.tombstoneCount ?? 0}</p><p className="mt-2 text-slate-500">{t("Auditoria mínima após retenção")}</p></div>
      </div>
      {clubFeedJobs.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">
        {clubFeedJobs.slice(0, 8).map((job) => <div key={job.id} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] text-slate-400"><strong className="text-white">{job.target_provider_team_ids.length}{" "}{t("clube(s)")}</strong><span className="ml-2 font-black text-amber-100">{label(job.job_state)}</span><p className="mt-1">{t("Código de motivo:")} {job.reason_code}{" "}{t("· tentativa")}{" "}{job.attempt_count}/5</p></div>)}
      </div> : <p className="mt-4 text-xs text-slate-500">{t("Nenhum fan-out aguardando execução.")}</p>}
      {clubFeedPosts.length ? <p className="mt-4 text-[10px] text-slate-500">{t("Post mais recente:")}{" "}{label(clubFeedPosts[0]!.content_type)}{" "}{t("· expira")}{" "}{date(clubFeedPosts[0]!.expires_at)}</p> : null}
    </GamePanel> : null}
    {!migrationPending && templatePolicyPending ? <GamePanel className="p-6">
      <LivePill>{t("TEMPLATE POLICY 046 · AUSENTE")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Auto-publicação permanece bloqueada")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{t("A política por versão de template ainda não está disponível neste ambiente. Nenhum destino externo pode receber conteúdo.")}</p>
    </GamePanel> : null}
    {!migrationPending && !templatePolicyPending ? <GamePanel className="p-6 sm:p-8">
      <LivePill>{t("TEMPLATE POLICY 046 · OUTBOUND")}{" "}{label(templatePolicyStatus?.outboundMode ?? "DISABLED")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Aprovação por versão e controles de emergência")}</h2>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">{t("O OWNER aprova uma identidade exata de template visual e copy. Dados dinâmicos continuam revalidados em cada item. READY significa apenas elegibilidade interna: Meta, Instagram e qualquer outbound permanecem desativados.")}</p>
      <div className="mt-5 grid gap-3 text-xs text-slate-300 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("VERSÕES")}</strong><p className="mt-2 font-black text-[#a3ff12]">{templatePolicyStatus?.templateCount ?? 0}</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("READY INTERNO")}</strong><p className="mt-2 font-black text-[#a3ff12]">{templatePolicyStatus?.readyCount ?? 0}</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><strong className="text-white">{t("DELIVERY_UNKNOWN")}</strong><p className="mt-2 font-black text-amber-100">{templatePolicyStatus?.deliveryUnknownCount ?? 0}</p></div>
        <div className="rounded-2xl border border-red-300/20 bg-red-300/[.06] p-4"><strong className="text-red-100">{t("OUTBOUND")}</strong><p className="mt-2 font-black text-red-100">{t("DESATIVADO")}</p></div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {templatePolicyControls.map((control) => <div key={control.scope_key} className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-white">{control.scope_key}</strong><span className={control.kill_switch_engaged ? "text-[10px] font-black text-red-100" : "text-[10px] font-black text-emerald-100"}>{control.kill_switch_engaged ? t("PAUSADO") : t("POLÍTICA LIBERADA")}</span></div>
          <p className="mt-2 text-[10px] text-slate-500">{t("Quota:")}{" "}{control.daily_quota ?? t("não configurada")}{" "}{t("· gap:")}{" "}{control.minimum_gap_seconds ?? t("não configurado")}{t("s · outbound")}{" "}{label(control.outbound_mode)}</p>
          <TouchlineSocialDeliveryControlActions locale={locale} scopeKey={control.scope_key} killSwitchEngaged={control.kill_switch_engaged} dailyQuota={control.daily_quota} minimumGapSeconds={control.minimum_gap_seconds} />
        </div>)}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {templatePolicyTemplates.map((template) => <div key={template.id} className="rounded-2xl border border-white/[.08] bg-black/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black text-[#a3ff12]">{label(template.content_type)} · {label(template.placement)}</p><h3 className="mt-1 text-base font-black text-white">{template.template_version}</h3></div><span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-black text-slate-300">{label(template.state)}</span></div>
          <p className="mt-3 text-[10px] text-slate-500">{template.width}×{template.height} · {template.locale}{" "}{t("· atualizado")}{" "}{date(template.updated_at)}</p>
          <p className="mt-2 break-all font-mono text-[9px] text-slate-600">{t("identity")}{" "}{template.template_identity_checksum}</p>
          <TouchlineSocialTemplatePolicyActions locale={locale} templateId={template.id} templateIdentityChecksum={template.template_identity_checksum} visualTemplateChecksum={template.visual_template_checksum} baseCopyChecksum={template.base_copy_checksum} state={template.state} artworkApproved={template.artwork_template_approval_state === "TEMPLATE_APPROVED"} captionApproved={template.caption_template_approval_state === "TEMPLATE_APPROVED"} />
        </div>)}
      </div>
      {!templatePolicyTemplates.length ? <p className="mt-5 text-xs text-slate-500">{t("Nenhuma versão foi registrada pelo executor local DRAFT-only.")}</p> : null}
    </GamePanel> : null}
    {!migrationPending && blockedReviewCount > 0 ? <GamePanel className="p-6 sm:p-8">
      <LivePill>{t("REVIEW_REQUIRED · fail-closed")}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">{t("Escalações bloqueadas antes da arte")}</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {blockedReviews.map((review) => <div key={review.id} className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
          <strong className="text-sm text-white">{t("Fixture")}{" "}{review.fixture_provider_id}{" "}{t("· Team")}{" "}{review.team_provider_id}</strong>
          <p className="mt-2 text-xs font-black text-amber-100">{t("Código de motivo:")} {review.reason_code}</p>
          <p className="mt-2 text-[10px] text-slate-500">{review.template_version}{" "}{t("· observado")}{" "}{date(review.first_observed_at)}</p>
        </div>)}
      </div>
      {!blockedReviews.length ? <p role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">{t("Esta página ficou fora do intervalo atual. Existem")}{" "}{blockedReviewCount}{" "}{t("revisões bloqueadas.")}{" "}<Link className="underline" href={`/admin/social-publications?lang=${locale}&draftPage=${draftPage}&reviewPage=0`}>{t("Voltar à primeira página")}</Link>.</p> : null}
      <nav className="mt-5 flex items-center justify-between gap-3 text-xs font-black" aria-label={t("Paginação das revisões bloqueadas")}>
        {reviewPage > 0 ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?lang=${locale}&draftPage=${draftPage}&reviewPage=${reviewPage - 1}`}>{t("Anteriores")}</Link> : <span />}
        <span className="text-slate-500">{Math.min(reviewPage * pageSize + 1, blockedReviewCount)}–{Math.min((reviewPage + 1) * pageSize, blockedReviewCount)}{" "}{t("de")}{" "}{blockedReviewCount}</span>
        {(reviewPage + 1) * pageSize < blockedReviewCount ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?lang=${locale}&draftPage=${draftPage}&reviewPage=${reviewPage + 1}`}>{t("Próximas")}</Link> : <span />}
      </nav>
    </GamePanel> : null}
    {!migrationPending && !drafts.length ? <GamePanel className="p-8"><LivePill>{t("Fila vazia")}</LivePill><p className="mt-4 text-sm text-slate-400">{t("Nenhum DRAFT imutável aguarda revisão.")}</p></GamePanel> : null}
    <div className="grid gap-5 xl:grid-cols-2">
      {drafts.map((draft) => <GamePanel key={draft.id} className="overflow-hidden">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black text-[#a3ff12]">{label(draft.content_type)} · {label(draft.placement)}</p><h2 className="mt-1 text-xl font-black text-white">{t("Fixture")}{" "}{draft.fixture_provider_id}{draft.event_provider_id ? ` · ${locale === "pt-BR" ? "Evento" : "Event"} ${draft.event_provider_id}` : ""}{draft.team_provider_id ? ` · ${locale === "pt-BR" ? "Clube" : "Team"} ${draft.team_provider_id}` : ""}{draft.scope_provider_id ? ` · ${locale === "pt-BR" ? "Rodada" : "Gameweek"} ${draft.scope_provider_id}` : ""}{draft.subject_player_provider_id ? ` · ${locale === "pt-BR" ? "Jogador" : "Player"} ${draft.subject_player_provider_id}` : ""}</h2></div><span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-black text-slate-300">{t("r")}{draft.revision} · {draft.locale}</span></div>
          <p className="whitespace-pre-wrap rounded-2xl border border-white/[.08] bg-black/20 p-4 text-xs leading-5 text-slate-300">{draft.caption}</p>
          <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-500"><span>{draft.width}×{draft.height}</span><span className="text-right">{label(draft.approval_state)}</span></div>
          <TouchlineSocialDraftReviewActions locale={locale} draftId={draft.id} manifestChecksum={draft.manifest_checksum} artifactChecksum={draft.artifact_checksum} captionChecksum={draft.caption_checksum} artworkPreviewUrl={draft.signedUrl} artworkPreviewAlt={`${t("Prévia integral")} ${label(draft.content_type)} ${draft.fixture_provider_id}`} artworkApproved={draft.artwork_approval_state === "APPROVED"} captionApproved={draft.caption_approval_state === "APPROVED"} generationCurrent={(draft.content_type === "LINEUP" && approvalsOperational && currentGeneratedDraftIds.has(draft.id)) || (draft.content_type === "MATCH_PREVIEW" && matchPreviewApprovalsOperational && currentMatchPreviewDraftIds.has(draft.id)) || (["FULL_TIME", "FINAL_SCORE"].includes(draft.content_type) && finalResultApprovalsOperational && currentFinalResultDraftIds.has(draft.id)) || (["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(draft.content_type) && confirmedEventApprovalsOperational && currentConfirmedEventDraftIds.has(draft.id)) || (["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL", "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(draft.content_type) && rankingApprovalsOperational && currentRankingDraftIds.has(draft.id))} />
        </div>
      </GamePanel>)}
    </div>
    {!migrationPending && draftCount > 0 ? <nav className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs font-black" aria-label={t("Paginação dos rascunhos sociais")}>
      {draftPage > 0 ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?lang=${locale}&draftPage=${draftPage - 1}&reviewPage=${reviewPage}`}>{t("Rascunhos anteriores")}</Link> : <span />}
      <span className="text-slate-500">{Math.min(draftPage * pageSize + 1, draftCount)}–{Math.min((draftPage + 1) * pageSize, draftCount)}{" "}{t("de")}{" "}{draftCount}</span>
      {(draftPage + 1) * pageSize < draftCount ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?lang=${locale}&draftPage=${draftPage + 1}&reviewPage=${reviewPage}`}>{t("Próximos rascunhos")}</Link> : <span />}
    </nav> : null}
  </div>;
}
