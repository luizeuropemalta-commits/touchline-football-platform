import Link from "next/link";
import { notFound } from "next/navigation";

import { GamePanel, LivePill } from "@/components/arena-admin-ui";
import TouchlineSocialDraftReviewActions from "@/components/touchline/admin/TouchlineSocialDraftReviewActions";
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
  team_provider_id: string | null;
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
  const draftPage = pageNumber(query.draftPage);
  const reviewPage = pageNumber(query.reviewPage);
  const pageSize = 50;
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return <GamePanel className="p-8"><LivePill>Configuração necessária</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Publicações sociais</h1><p className="mt-3 text-sm text-slate-400">A administração protegida ainda não está configurada.</p></GamePanel>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) notFound();

  const [draftResult, cycleResult, executorCyclesResult, openJobsResult] = await Promise.all([
    admin
      .from("touchline_social_publication_drafts")
      .select("id,fixture_provider_id,team_provider_id,content_type,placement,locale,revision,width,height,caption,artifact_storage_bucket,artifact_storage_key,artifact_checksum,caption_checksum,manifest_checksum,source_revision_checksum,approval_state,artwork_approval_state,caption_approval_state,created_at", { count: "exact" })
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
  const readFailure = error || visibleReviewResult.error || blockedReviewResult.error || cycleResult.error
    || executorCyclesResult.error || openJobsResult.error;
  if (readFailure && !migrationPending && !executorPending) return <GamePanel className="p-8"><LivePill>Leitura indisponível</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Publicações sociais</h1><p className="mt-3 text-sm text-slate-400">Os rascunhos protegidos não puderam ser lidos.</p></GamePanel>;

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
  const draftCount = draftResult.count ?? 0;
  const blockedReviewCount = blockedReviewResult.count ?? 0;
  const blockedReviews = reviewRows.filter((review) => review.review_state === "REVIEW_REQUIRED");
  const openJobs = openJobsResult.data ?? [];

  return <div className="mx-auto max-w-[1300px] space-y-6">
    <GamePanel className="p-6 sm:p-8">
      <LivePill>QA · aprovação humana obrigatória</LivePill>
      <h1 className="mt-5 text-4xl font-black italic text-white sm:text-6xl">Publicações sociais</h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Arte e legenda são aprovadas separadamente. Aprovar as duas apenas torna a revisão elegível para uma outbox futura; esta tela não publica, não despacha e não se conecta ao Instagram.</p>
      <Link href="/admin" className="mt-5 inline-flex rounded-2xl border border-white/10 px-4 py-3 text-xs font-black text-white">Voltar ao Admin</Link>
    </GamePanel>
    {migrationPending ? <GamePanel className="p-6"><LivePill>Migration 039 ausente</LivePill><h2 className="mt-4 text-2xl font-black text-white">Approval-only indisponível</h2><p className="mt-3 text-sm leading-6 text-slate-400">Nenhum rascunho pode ser aprovado enquanto o contrato 039 não estiver presente no ambiente QA verificado.</p></GamePanel> : null}
    {!migrationPending && executorPending ? <GamePanel className="p-6"><LivePill>Executor 040 ausente</LivePill><h2 className="mt-4 text-2xl font-black text-white">Geração automática bloqueada</h2><p className="mt-3 text-sm leading-6 text-slate-400">Arte e legenda permanecem bloqueadas até o scheduler e o runner DRAFT-only receberem auditoria independente e ativação explícita somente em QA.</p></GamePanel> : null}
    {!migrationPending ? <GamePanel className="p-6">
      <LivePill>{health === "healthy" ? "GERADOR · SAUDÁVEL" : health === "running" ? "GERADOR · EM EXECUÇÃO" : "GERADOR · ATENÇÃO"}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">Ciclo automático auditável</h2>
      {cycleResult.data ? <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        <p><span className="block text-[9px] font-black text-slate-500">ÚLTIMA CONCLUSÃO</span>{cycleResult.data.last_completed_at ? new Date(cycleResult.data.last_completed_at).toLocaleString("pt-BR", { timeZone: "Europe/Malta" }) : "Aguardando primeiro ciclo"}</p>
        <p><span className="block text-[9px] font-black text-slate-500">RESULTADO</span>{cycleResult.data.last_outcome ?? "Ainda não executado"}</p>
        <p><span className="block text-[9px] font-black text-slate-500">FALHAS CONSECUTIVAS</span>{cycleResult.data.consecutive_failures}</p>
      </div> : <p className="mt-3 text-sm text-slate-400">Aguardando a primeira execução protegida do gerador.</p>}
      {!approvalsOperational ? <p role="alert" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">Aprovações bloqueadas: o ciclo está {health}. Aguarde uma verificação automática saudável da fonte oficial.</p> : null}
    </GamePanel> : null}
    {!migrationPending && !executorPending ? <GamePanel className="p-6">
      <LivePill>{executorHealth.operational ? "EXECUTOR · SAUDÁVEL" : "EXECUTOR · ATENÇÃO"}</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">Scheduler e runner duráveis</h2>
      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
        {(["SCHEDULER", "RUNNER"] as const).map((component) => {
          const cycle = (executorCyclesResult.data ?? []).find((item) => item.component === component);
          const componentHealth = component === "SCHEDULER" ? executorHealth.scheduler : executorHealth.runner;
          return <div key={component} className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
            <strong className="text-white">{component}</strong>
            <p className="mt-2 font-black text-[#a3ff12]">{componentHealth}</p>
            <p className="mt-2 text-slate-500">Última execução: {cycle?.last_completed_at ? new Date(cycle.last_completed_at).toLocaleString("pt-BR", { timeZone: "Europe/Malta" }) : "nunca"}</p>
            <p className="mt-1 text-slate-500">Falhas: {cycle?.consecutive_failures ?? 0} · retries recuperados: {cycle?.timeout_recovery_count ?? 0}</p>
            {cycle?.last_error_code ? <p className="mt-1 font-mono text-amber-100">{cycle.last_error_code}</p> : null}
          </div>;
        })}
        <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
          <strong className="text-white">FILA ATIVA</strong>
          <p className="mt-2 font-black text-[#a3ff12]">{openJobsResult.count ?? 0}</p>
          <p className="mt-2 text-slate-500">PENDING/RUNNING/RETRY/REVIEW_REQUIRED</p>
        </div>
      </div>
      {openJobs.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">
        {openJobs.slice(0, 10).map((job) => <div key={job.id} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] text-slate-400">
          <strong className="text-white">Fixture {job.fixture_provider_id} · Team {job.team_provider_id}</strong>
          <span className="ml-2 font-black text-amber-100">{job.job_state}</span>
          <p className="mt-1">{job.reason_code} · tentativa {job.attempt_count}/5</p>
        </div>)}
      </div> : <p className="mt-4 text-xs text-slate-500">Nenhum job ativo ou em revisão.</p>}
      {!executorHealth.operational ? <p role="alert" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">Aprovações bloqueadas: scheduler {executorHealth.scheduler}; runner {executorHealth.runner}. Nenhuma publicação externa é executada por este sistema.</p> : null}
    </GamePanel> : null}
    {!migrationPending && blockedReviewCount > 0 ? <GamePanel className="p-6 sm:p-8">
      <LivePill>REVIEW_REQUIRED · fail-closed</LivePill>
      <h2 className="mt-4 text-2xl font-black text-white">Escalações bloqueadas antes da arte</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {blockedReviews.map((review) => <div key={review.id} className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
          <strong className="text-sm text-white">Fixture {review.fixture_provider_id} · Team {review.team_provider_id}</strong>
          <p className="mt-2 text-xs font-black text-amber-100">{review.reason_code}</p>
          <p className="mt-2 text-[10px] text-slate-500">{review.template_version} · observado {new Date(review.first_observed_at).toLocaleString("pt-BR", { timeZone: "Europe/Malta" })}</p>
        </div>)}
      </div>
      {!blockedReviews.length ? <p role="alert" className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs font-bold text-amber-100">Esta página ficou fora do intervalo atual. Existem {blockedReviewCount} revisões bloqueadas. <Link className="underline" href={`/admin/social-publications?draftPage=${draftPage}&reviewPage=0`}>Voltar à primeira página</Link>.</p> : null}
      <nav className="mt-5 flex items-center justify-between gap-3 text-xs font-black" aria-label="Paginação das revisões bloqueadas">
        {reviewPage > 0 ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?draftPage=${draftPage}&reviewPage=${reviewPage - 1}`}>Anteriores</Link> : <span />}
        <span className="text-slate-500">{Math.min(reviewPage * pageSize + 1, blockedReviewCount)}–{Math.min((reviewPage + 1) * pageSize, blockedReviewCount)} de {blockedReviewCount}</span>
        {(reviewPage + 1) * pageSize < blockedReviewCount ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?draftPage=${draftPage}&reviewPage=${reviewPage + 1}`}>Próximas</Link> : <span />}
      </nav>
    </GamePanel> : null}
    {!migrationPending && !drafts.length ? <GamePanel className="p-8"><LivePill>Fila vazia</LivePill><p className="mt-4 text-sm text-slate-400">Nenhum DRAFT imutável aguarda revisão.</p></GamePanel> : null}
    <div className="grid gap-5 xl:grid-cols-2">
      {drafts.map((draft) => <GamePanel key={draft.id} className="overflow-hidden">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black text-[#a3ff12]">{draft.content_type} · {draft.placement}</p><h2 className="mt-1 text-xl font-black text-white">Fixture {draft.fixture_provider_id}{draft.team_provider_id ? ` · Team ${draft.team_provider_id}` : ""}</h2></div><span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-black text-slate-300">r{draft.revision} · {draft.locale}</span></div>
          <p className="whitespace-pre-wrap rounded-2xl border border-white/[.08] bg-black/20 p-4 text-xs leading-5 text-slate-300">{draft.caption}</p>
          <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-500"><span>{draft.width}×{draft.height}</span><span className="text-right">{draft.approval_state}</span></div>
          <TouchlineSocialDraftReviewActions draftId={draft.id} manifestChecksum={draft.manifest_checksum} artifactChecksum={draft.artifact_checksum} captionChecksum={draft.caption_checksum} artworkPreviewUrl={draft.signedUrl} artworkPreviewAlt={`Prévia integral ${draft.content_type} ${draft.fixture_provider_id}`} artworkApproved={draft.artwork_approval_state === "APPROVED"} captionApproved={draft.caption_approval_state === "APPROVED"} generationCurrent={draft.content_type === "LINEUP" && approvalsOperational && currentGeneratedDraftIds.has(draft.id)} />
        </div>
      </GamePanel>)}
    </div>
    {!migrationPending && draftCount > 0 ? <nav className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs font-black" aria-label="Paginação dos rascunhos sociais">
      {draftPage > 0 ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?draftPage=${draftPage - 1}&reviewPage=${reviewPage}`}>Rascunhos anteriores</Link> : <span />}
      <span className="text-slate-500">{Math.min(draftPage * pageSize + 1, draftCount)}–{Math.min((draftPage + 1) * pageSize, draftCount)} de {draftCount}</span>
      {(draftPage + 1) * pageSize < draftCount ? <Link className="rounded-xl border border-white/10 px-3 py-2 text-white" href={`/admin/social-publications?draftPage=${draftPage + 1}&reviewPage=${reviewPage}`}>Próximos rascunhos</Link> : <span />}
    </nav> : null}
  </div>;
}
