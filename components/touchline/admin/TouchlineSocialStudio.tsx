"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { STUDIO_CATALOG, STUDIO_SURFACES, studioRecordKey, studioSurfacesForArt, type StudioArt } from "@/lib/touchlineArena/social-studio-catalog";
import { defaultStudioAutomation, emptyStudioDocument, studioCaption, studioProvenanceCurrent, studioStatus, validateStudioRetry, type StudioAction, type StudioAutomation, type StudioDeliveryAttempt, type StudioDocument, type StudioRecord } from "@/lib/touchlineArena/social-studio-contract";
import { studioActionLabel } from "@/lib/touchlineArena/social-studio-desk";
import { advanceStudioPlayback, emptyStudioPlayback, studioPlaybackMayRepeat } from "@/lib/touchlineArena/social-studio-playback";
import type { StudioMediaView, StudioSnapshot } from "@/lib/touchlineArena/social-studio-server";

const stateLabel = { EM_PRODUCAO: "Em produção", EM_REVISAO: "Em revisão", APROVADO: "Aprovado", BLOQUEADO: "Bloqueado" };
const fieldClass = "w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm text-white";
const blockLabels = ["Todas", "1 · Prévia", "2 · Eventos", "3 · Rankings", "4 · Tabela", "5 · Candidatos"];
const eyesLabel = { PASS: "Aprovado", FAIL: "Reprovado", PENDING: "Pendente" };
const decisionLabel = { APPROVED: "Aprovada", REJECTED: "Reprovada", CHANGES_REQUESTED: "Revisão solicitada" };

function studioRetryUiState(input: { sourceIntegrationError: string | null; mediaError: string | null; videoError: boolean; mediaCurrent: boolean; mediaAvailable: boolean }) {
  const reason = input.sourceIntegrationError || input.mediaError
    || (input.videoError ? "O vídeo atual não carregou ou não corresponde ao formato registrado." : null)
    || (!input.mediaAvailable ? "O vídeo atual ainda não está disponível e verificado para conferência." : null)
    || (!input.mediaCurrent ? "Os dados atuais da amostra precisam ser revalidados." : null);
  return { disabled: !!reason, reason };
}

function Clock({ document, serverTime }: { document: StudioDocument; serverTime: string }) {
  if (!document.schedule) return <p className="text-sm text-slate-400">Nenhuma data reservada.</p>;
  const remaining = Math.max(0, Date.parse(document.schedule.utc) - Date.parse(serverTime));
  const minutes = Math.floor(remaining / 60000);
  return <div className="space-y-1 text-sm text-slate-300">
    <p>{document.schedule.localDateTime.replace("T", " · ")} · {document.schedule.timeZone}</p>
    <p>{remaining > 0 ? `Faltam ${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}min` : "Horário alcançado · publicação bloqueada"}</p>
    <p className="text-xs text-slate-400">UTC: {document.schedule.utc} · plano pausado</p>
  </div>;
}

function HistoryDocument({ document }: { document: StudioDocument }) {
  return <div className="mt-3 space-y-3 rounded-xl bg-black/20 p-4 text-xs leading-6 text-slate-400"><p>{document.selected ? "Destino incluído no plano" : "Destino não selecionado"} · publicação pausada</p><p>{document.schedule ? `${document.schedule.localDateTime.replace("T", " · ")} · ${document.schedule.timeZone} · UTC ${document.schedule.utc}` : "Sem horário reservado"}</p><p>Regra: {document.automation?.mode === "OFFICIAL_EVENT" ? "evento oficial" : document.automation?.mode === "SCHEDULED" ? "horário escolhido" : "sem automação"} · {document.automation?.maxAttempts ?? 3} tentativas propostas</p>{Object.entries(document.reviews).map(([identity, review]) => <div key={identity}><p className="text-slate-200">Versão {review.version} · {review.decision ? decisionLabel[review.decision] : "Em revisão"}</p><p>Modelo: {review.artworkApprovedAt ?? "pendente"} · legenda: {review.captionApprovedAt ?? "pendente"}</p>{review.reason ? <p>Motivo registrado: {review.reason}</p> : null}<p className="break-all">Identidade: {identity}</p></div>)}{Object.entries(document.retryRequests ?? {}).map(([id, retry]) => <div key={id}><p className="break-all">Retentativa pausada · {id} · {retry.requestedAt}</p><p>Motivo: {retry.reason}</p></div>)}</div>;
}

function VariantReview({ art, surface, media, mediaError, sourceIntegrationError, record, writable, serverTime, deliveries }: {
  art: StudioArt; surface: typeof STUDIO_SURFACES[number]; media: StudioMediaView | null; mediaError: string | null;
  sourceIntegrationError: string | null; record?: StudioRecord; writable: boolean; serverTime: string; deliveries: StudioDeliveryAttempt[];
}) {
  const router = useRouter();
  const document = record?.document ?? emptyStudioDocument();
  const [selected, setSelected] = useState(document.selected);
  const [localDateTime, setLocalDateTime] = useState(document.schedule?.localDateTime ?? "");
  const [timeZone, setTimeZone] = useState(document.schedule?.timeZone ?? "Europe/Malta");
  const [occurrence, setOccurrence] = useState<"earlier" | "later">(document.schedule?.occurrence ?? "earlier");
  const [automation, setAutomation] = useState<StudioAutomation>(document.automation ?? defaultStudioAutomation());
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [loops, setLoops] = useState(0);
  const [serverLoops, setServerLoops] = useState(0);
  const [serverReviewSessionId, setServerReviewSessionId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoVisible = useRef(false);
  const playback = useRef(emptyStudioPlayback());
  const playRequested = useRef(false);
  const reducedMotion = useRef(true);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const reviewSession = useRef<string | null>(null);
  const reviewTickAt = useRef(0);
  const reviewQueue = useRef<Promise<void>>(Promise.resolve());
  const reviewEpoch = useRef(0);
  const reviewHandshakePause = useRef(false);
  const internalLoopSeek = useRef(false);
  const review = media ? document.reviews[media.identity] : undefined;
  const internalPending = surface.platform === "CLUB" && art.internal === "PENDING";
  const mediaCurrent = media !== null && studioProvenanceCurrent(media.provenance, Date.parse(serverTime));
  const expired = media !== null && !mediaCurrent;
  const retryUi = studioRetryUiState({ sourceIntegrationError, mediaError, videoError, mediaCurrent, mediaAvailable: !!media?.previewAvailable && !!media.reviewReady });
  const canApprove = writable && mediaCurrent && media?.reviewReady && !mediaError && videoReady && !videoError && loops >= 2 && serverLoops >= 2 && !!serverReviewSessionId && (!reason.trim() || reason.trim().length >= 10);
  const status = studioStatus(media?.identity ?? null, document, mediaError || (expired ? "FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID" : videoError ? "VIDEO_ERROR" : null));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !media?.previewAvailable) return;
    let intersecting = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = motion.matches;
    const stop = () => {
      playRequested.current = false;
      playback.current = advanceStudioPlayback(playback.current, { kind: "interrupt" });
      video.pause();
    };
    const updatePlayback = () => {
      videoVisible.current = intersecting && window.document.visibilityState === "visible";
      if (!videoVisible.current) { stop(); return; }
      // Loading a visible candidate never starts playback or reverses a deliberate pause.
      if (!video.getAttribute("src")) video.src = media.url;
    };
    const updateMotion = () => {
      reducedMotion.current = motion.matches;
      if (motion.matches) stop();
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = !!entry?.isIntersecting && entry.intersectionRatio >= 0.5;
      updatePlayback();
    }, { threshold: [0, 0.5] });
    observer.observe(video);
    window.document.addEventListener("visibilitychange", updatePlayback);
    motion.addEventListener("change", updateMotion);
    return () => {
      observer.disconnect();
      window.document.removeEventListener("visibilitychange", updatePlayback);
      motion.removeEventListener("change", updateMotion);
      videoVisible.current = false;
      stop();
    };
  }, [media, previewRevision]);

  function renewPreview() {
    interruptPlayback();
    setVideoReady(false);
    setVideoError(false);
    setPlaying(false);
    playback.current = emptyStudioPlayback();
    setLoops(0);
    setPreviewRevision((revision) => revision + 1);
  }

  function trackPlayback(video: HTMLVideoElement, kind: "sample" | "ended") {
    playback.current = advanceStudioPlayback(playback.current, {
      kind, time: video.currentTime, duration: media?.durationSeconds ?? 0, now: performance.now(),
      visible: videoVisible.current && window.document.visibilityState === "visible", paused: kind !== "ended" && video.paused && !video.ended,
      seeking: video.seeking, rate: video.playbackRate,
    });
    if (playback.current.loops !== loops) setLoops(playback.current.loops);
  }

  function interruptPlayback() {
    playback.current = advanceStudioPlayback(playback.current, { kind: "interrupt" });
    const sessionId = reviewSession.current;
    reviewEpoch.current += 1;
    reviewSession.current = null;
    setServerReviewSessionId(null);
    setServerLoops(0);
    if (sessionId) reviewQueue.current = reviewQueue.current.then(async () => {
      await fetch("/api/admin/social-publications/studio/review", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalidate", sessionId }),
      });
    }).catch(() => undefined);
  }

  function rewindReviewLoop(video: HTMLVideoElement) {
    internalLoopSeek.current = true;
    video.currentTime = 0;
  }

  function recordServerReview(action: "start" | "tick", force = false) {
    if (!media) return Promise.resolve();
    if (!reviewSession.current) reviewSession.current = crypto.randomUUID();
    if (action === "tick" && !force && performance.now() - reviewTickAt.current < 900) return reviewQueue.current;
    const sessionId = reviewSession.current;
    const epoch = reviewEpoch.current;
    reviewTickAt.current = performance.now();
    const run = async () => {
      const response = await fetch("/api/admin/social-publications/studio/review", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId, artId: art.id, platform: surface.platform, placement: surface.placement, mediaIdentity: media.identity, expectedRevision: record?.revision ?? 0 }),
      });
      const result = await response.json() as { ok?: boolean; completedLoops?: number };
      if (!response.ok || !result.ok) throw new Error("REVIEW_SESSION_UNAVAILABLE");
      if (reviewEpoch.current !== epoch || reviewSession.current !== sessionId) return;
      setServerReviewSessionId(sessionId);
      setServerLoops(Math.min(2, Math.max(0, result.completedLoops ?? 0)));
    };
    reviewQueue.current = reviewQueue.current.then(run, run).catch(() => {
      if (reviewEpoch.current !== epoch) return;
      reviewSession.current = null;
      setServerReviewSessionId(null);
      setServerLoops(0);
      setMessage("A medição segura da reprodução foi interrompida. Reinicie o vídeo para revisar novamente.");
    });
    return reviewQueue.current;
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !media?.previewAvailable) return;
    if (!video.paused) { playRequested.current = false; video.pause(); return; }
    if (!videoVisible.current || window.document.visibilityState !== "visible") return;
    if (!video.getAttribute("src")) video.src = media.url;
    if (video.ended) rewindReviewLoop(video);
    try { await video.play(); } catch { setMessage("A reprodução não iniciou. Use os controles do vídeo para tentar novamente."); }
  }

  async function save(action: StudioAction["action"], delivery?: StudioDeliveryAttempt) {
    if (pending || !writable || ((action === "approve-artwork" || action === "approve-caption") && !canApprove)) return;
    if (action === "request-retry" && retryUi.disabled) return;
    if ((action === "reject-artwork" || action === "request-revision" || action === "request-retry") && reason.trim().length < 10) return;
    setPending(true);
    setMessage(null);
    const payload = {
      action, artId: art.id, platform: surface.platform, placement: surface.placement, expectedRevision: record?.revision ?? 0,
      ...(action === "save-plan" ? { selected, automation, schedule: art.trigger === "OWNER_SCHEDULE" && localDateTime ? { localDateTime, timeZone, occurrence } : null }
        : action === "request-retry" ? { deliveryId: delivery?.id, expectedDeliveryRevision: delivery?.revision, reason }
        : action === "reject-artwork" || action === "request-revision" ? { mediaIdentity: media?.identity, reason }
        : { mediaIdentity: media?.identity, reviewSessionId: serverReviewSessionId, ...(reason.trim() ? { reason } : {}) }),
    };
    const serialized = JSON.stringify(payload);
    if (request.current?.payload !== serialized) request.current = { payload: serialized, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/social-publications/studio", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: request.current.id }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "A alteração não foi confirmada. Atualize para conferir o histórico antes de tentar novamente.");
      request.current = null;
      setMessage(`${studioActionLabel[action]}. Publicação continua pausada.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Resposta incerta. Atualize para conferir o histórico."); }
    finally { setPending(false); }
  }

  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="min-w-0 space-y-4" aria-label={`Vídeo de ${art.title}`}>
      <p className="text-sm font-bold text-[#b7ff45]">{stateLabel[status]} · {surface.label}</p>
      {media ? <>
        {media.previewAvailable ? <><video ref={videoRef} key={`${media.identity}:${previewRevision}`} controls muted playsInline preload="none" aria-label={`${art.title}, versão ${media.version}, vídeo com reprodução manual`}
          className="max-h-[600px] w-full rounded-2xl bg-black object-contain" style={{ aspectRatio: `${media.width} / ${media.height}` }}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth !== media.width || video.videoHeight !== media.height || Math.abs(video.duration - media.durationSeconds) > 0.2) { setVideoError(true); interruptPlayback(); }
          }}
          onPlay={(event) => {
            if (!videoVisible.current || window.document.visibilityState !== "visible") { event.currentTarget.pause(); return; }
            if (!reviewSession.current) {
              const video = event.currentTarget;
              reviewHandshakePause.current = true;
              video.pause();
              void recordServerReview("start").then(() => {
                if (reviewSession.current && videoVisible.current && window.document.visibilityState === "visible") void video.play();
              });
              return;
            }
            playRequested.current = true;
            trackPlayback(event.currentTarget, "sample");
          }}
          onPlaying={(event) => { setVideoReady(true); setPlaying(true); trackPlayback(event.currentTarget, "sample"); void recordServerReview("tick"); }}
          onPause={(event) => {
            setPlaying(false);
            if (reviewHandshakePause.current) { reviewHandshakePause.current = false; return; }
            if (!event.currentTarget.ended) { playRequested.current = false; interruptPlayback(); }
          }}
          onError={() => { setVideoError(true); interruptPlayback(); }}
          onSeeking={() => {
            if (internalLoopSeek.current) { internalLoopSeek.current = false; return; }
            interruptPlayback();
          }} onRateChange={interruptPlayback} onWaiting={interruptPlayback} onStalled={interruptPlayback}
          onTimeUpdate={(event) => { trackPlayback(event.currentTarget, "sample"); void recordServerReview(reviewSession.current ? "tick" : "start"); }}
          onEnded={(event) => {
            const video = event.currentTarget;
            trackPlayback(video, "ended");
            void recordServerReview(reviewSession.current ? "tick" : "start", true);
            setPlaying(false);
            if (playback.current.loops < 2 && video.playbackRate === 1 && studioPlaybackMayRepeat({ requested: playRequested.current, visible: videoVisible.current && window.document.visibilityState === "visible", reducedMotion: reducedMotion.current })) {
              rewindReviewLoop(video);
              void video.play().catch(() => { playRequested.current = false; });
            } else playRequested.current = false;
          }} />
          <Button variant="secondary" onClick={() => void togglePlayback()} disabled={videoError}>{playing ? "Pausar vídeo" : "Reproduzir vídeo"}</Button>
          {videoError ? <Button variant="secondary" onClick={renewPreview}>Renovar acesso ao vídeo</Button> : null}
          <p className="text-xs leading-5 text-slate-400">Reprodução manual, com pausa ao sair da tela ou da aba. Use velocidade normal (1×). Com movimento reduzido, inicie cada volta pelos controles. Saltos e trechos interrompidos não contam; duas voltas não substituem o selo Olhos.</p>
        </> : <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-amber-200">Candidato registrado, mas nenhum vídeo íntegro está disponível para reprodução. Não é uma arte pronta.</p>}
        <p className="text-xs text-slate-400">{media.version} · {media.width} × {media.height} · {media.durationSeconds}s · {serverLoops}/2 voltas confirmadas pelo servidor</p>
        <p className="break-all font-mono text-xs text-slate-500">{media.sha256}</p>
        <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-200"><p className="mb-2 font-bold">Legenda · {surface.platform === "CLUB" ? "Feed dos clubes" : surface.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}</p><p className="whitespace-pre-wrap">{studioCaption(media, surface.platform)}</p></div>
        <div className="rounded-xl border border-white/10 p-4 text-sm leading-6 text-slate-300" aria-label={`Selo Olhos ${surface.placement}`}><p className="font-bold text-white">Olhos · {surface.placement} · versão {media.version}</p><p>Composição: {eyesLabel[media.eyes.composition]} · Loop: {eyesLabel[media.eyes.loop]}</p><p>{media.eyes.reason}</p>{media.eyes.reviewer ? <p className="text-xs text-slate-400">{media.eyes.reviewer} · {media.eyes.reviewedAt}</p> : null}<p className="text-xs text-slate-400">O selo não passa do Feed para Stories nem para outra versão. Duas emendas precisam ser assistidas nesta tela.</p></div>
        <details className="text-xs leading-6 text-slate-400"><summary className="cursor-pointer text-slate-200">Origem e validade da amostra</summary>
          <p>{media.provenance.source} · competição {media.provenance.competitionId} · temporada {media.provenance.seasonId}</p>
          <p>Dados em {media.provenance.asOf}; consulta em {media.provenance.fetchedAt}; válidos até {media.provenance.validUntil}.</p>
          <p>Partidas: {media.provenance.fixtureIds.join(", ") || "Não se aplica"}. Clubes: {media.provenance.teamIds.join(", ") || "Não se aplica"}. Atletas: {media.provenance.playerIds.join(", ") || "Não se aplica"}.</p>
          <p className="break-all">Retrato: {media.provenance.snapshotSha256}</p>
        </details>
        {media.previewAvailable && !videoReady && !videoError ? <p role="status" className="text-sm text-amber-200">Aguardando reprodução do vídeo. A aprovação exige duas passagens pela emenda.</p> : null}
      </> : <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm leading-6 text-slate-400">{mediaError ?? "Vídeo final desta apresentação ainda em produção. Nenhuma arte completa foi entregue nesta ficha."}</div>}
      {videoError ? <p role="alert" className="text-sm text-amber-200">O vídeo não carregou ou não corresponde ao formato registrado. Aprovação bloqueada.</p> : null}
      {expired ? <p role="status" className="text-sm text-amber-200">A validade dos dados terminou. Aprovação bloqueada; atualize para carregar uma amostra revalidada. Aprovações antigas ficam apenas no histórico.</p> : null}
      {mediaError ? <p role="status" className="text-sm text-amber-200">{mediaError}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button disabled={!canApprove || pending || !!review?.artworkApprovedAt} onClick={() => void save("approve-artwork")}>{review?.artworkApprovedAt ? "Modelo aprovado" : "Aprovar modelo em vídeo"}</Button>
        <Button variant="secondary" disabled={!canApprove || pending || !!review?.captionApprovedAt} onClick={() => void save("approve-caption")}>{review?.captionApprovedAt ? "Legenda aprovada" : "Aprovar legenda-base"}</Button>
      </div>
      <label className="block space-y-2 text-sm text-slate-300"><span>Motivo da decisão ou retentativa · 10 a 1.000 caracteres</span><textarea className={fieldClass} rows={3} maxLength={1000} value={reason} disabled={!writable || pending} onChange={(event) => setReason(event.target.value)} placeholder="Descreva sua decisão sobre esta versão…" /><span className="block text-xs text-slate-400">Obrigatório para reprovar, pedir revisão ou retentar; opcional na aprovação.</span></label>
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={!writable || pending || !media || reason.trim().length < 10} onClick={() => void save("reject-artwork")}>Reprovar arte</Button><Button variant="secondary" disabled={!writable || pending || !media || reason.trim().length < 10} onClick={() => void save("request-revision")}>Pedir revisão</Button></div>
      {review?.decision ? <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-300"><p>{decisionLabel[review.decision]} · {review.version} · {review.decidedAt}</p>{review.reason ? <p>Motivo registrado: {review.reason}</p> : null}</div> : null}
      <p className="text-xs leading-5 text-slate-400">Aprovação do modelo e da legenda nesta versão e apresentação. Novos fatos usarão o modelo aprovado após validar dados e destinos; mudança de layout, movimento ou texto-base exige nova revisão.</p>
    </section>
    <section className="min-w-0 space-y-4" aria-label={`Plano de ${art.title}`}>
      <h3 className="text-lg font-bold text-white">Planejar publicação</h3>
      <p className="text-sm font-semibold text-amber-200">Pausado · integração de publicação pendente</p>
      <p className="text-xs text-slate-400">As configurações são deste tipo e desta apresentação. Nenhuma escolha abaixo habilita postagem.</p>
      <label className="flex items-center gap-3 text-sm text-slate-200"><input type="checkbox" checked={selected} disabled={!writable || pending || internalPending} onChange={(event) => setSelected(event.target.checked)} />Incluir {surface.label} no plano</label>
      <p className="text-xs leading-5 text-slate-400">{surface.platform === "CLUB" ? art.internal === "BOTH_CLUBS" ? "Dois recibos independentes: clube mandante e visitante. ClubOwner não recebe." : art.internal === "SUBJECT_CLUB" ? "Destino: clube canônico do atleta mencionado. ClubOwner não recebe." : "Destino interno aguardando escolha. Não há distribuição automática para todos os clubes." : "Conta social e compatibilidade técnica ainda precisam de integração verificada."}</p>
      {art.trigger === "OFFICIAL_EVENT" ? <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-200">{art.suggestion}. O evento oficial mantém o gatilho automático após aprovação e habilitação operacional.</p> : <>
        <p className="text-sm text-slate-400">{art.suggestion}. A data abaixo será escolhida por você.</p>
        <label className="block space-y-2 text-sm text-slate-300"><span>Dia e hora</span><input className={fieldClass} type="datetime-local" value={localDateTime} disabled={!writable || pending} onChange={(event) => setLocalDateTime(event.target.value)} /></label>
        <label className="block space-y-2 text-sm text-slate-300"><span>Fuso horário</span><input className={fieldClass} value={timeZone} disabled={!writable || pending} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/Malta" list="studio-time-zones" /></label>
        <label className="block space-y-2 text-sm text-slate-300"><span>Se a hora ocorrer duas vezes na mudança de horário</span><select className={fieldClass} value={occurrence} disabled={!writable || pending} onChange={(event) => setOccurrence(event.target.value as "earlier" | "later")}><option value="earlier">Primeira ocorrência</option><option value="later">Segunda ocorrência</option></select></label>
        <p className="text-xs text-slate-400">Hora inexistente ou passada será recusada. Deixe a data vazia para remover a reserva. A reserva não ativa um agendador.</p>
        <Clock document={document} serverTime={serverTime} />
      </>}
      <div className="space-y-3 rounded-xl border border-white/10 p-4"><h4 className="font-bold text-white">Regra de automação proposta</h4><label className="block space-y-2 text-sm text-slate-300"><span>Quando usar o modelo aprovado</span><select className={fieldClass} value={automation.mode} disabled={!writable || pending} onChange={(event) => setAutomation({ ...automation, mode: event.target.value as StudioAutomation["mode"] })}><option value="PAUSED">Sem automação</option>{art.trigger === "OFFICIAL_EVENT" ? <option value="OFFICIAL_EVENT">Evento oficial confirmado</option> : <option value="SCHEDULED">Dia, hora e fuso escolhidos</option>}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2 text-sm text-slate-300"><span>Máximo de tentativas</span><input className={fieldClass} type="number" min={1} max={10} value={automation.maxAttempts} disabled={!writable || pending} onChange={(event) => setAutomation({ ...automation, maxAttempts: Number(event.target.value) })} /></label><label className="block space-y-2 text-sm text-slate-300"><span>Intervalo · minutos</span><input className={fieldClass} type="number" min={1} max={1440} value={automation.retryDelayMinutes} disabled={!writable || pending} onChange={(event) => setAutomation({ ...automation, retryDelayMinutes: Number(event.target.value) })} /></label></div><p className="text-xs leading-5 text-slate-400">Preferência salva, sem agendador ativo. Cada fato futuro exige origem atual e destino verificado. Resposta incerta exige reconciliação; recibo confirmado nunca se repete.</p></div>
      <Button variant="secondary" disabled={!writable || pending} aria-busy={pending} onClick={() => void save("save-plan")}>{pending ? "Salvando…" : "Salvar plano pausado"}</Button>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-slate-200">{message}</p>
      <div className="space-y-3 rounded-xl border border-white/10 p-4 text-sm leading-6 text-slate-400"><p className="font-bold text-slate-200">Entregas e erros · {surface.label}</p>{retryUi.reason ? <p role="status" className="text-amber-200">Retentativa bloqueada: {retryUi.reason}</p> : null}{deliveries.length ? deliveries.map((delivery) => {
        let retryAllowed = true;
        try { validateStudioRetry(delivery, { action: "request-retry", requestId: "", artId: art.id, platform: surface.platform, placement: surface.placement, expectedRevision: record?.revision ?? 0, deliveryId: delivery.id, expectedDeliveryRevision: delivery.revision, reason }, document, Date.parse(serverTime)); } catch { retryAllowed = false; }
        return <div key={delivery.id} className="space-y-2 border-t border-white/10 pt-3"><p className="break-all text-slate-200">{delivery.platform} · {delivery.account_id} · {delivery.placement}</p><p>{delivery.state} · {delivery.attempt_count} tentativa(s) · revisão {delivery.revision}</p>{delivery.receipt_id ? <p className="break-all">Recibo: {delivery.receipt_id} · não repetir</p> : null}{delivery.error ? <p role="status" className="text-amber-200">Erro: {delivery.error}</p> : null}{delivery.state === "UNKNOWN" ? <p>Resposta incerta. Reconcilie antes de qualquer repetição.</p> : null}{delivery.retry_requested_at ? <p>Retentativa solicitada em {delivery.retry_requested_at} · aguardando integração, pausada.</p> : null}<Button variant="secondary" disabled={!writable || pending || retryUi.disabled || !retryAllowed || reason.trim().length < 10} onClick={() => void save("request-retry", delivery)}>Solicitar retentativa deste destino · pausada</Button></div>;
      }) : <p>Nenhuma tentativa registrada para este destino. Não há envios de teste. Falha em Stories nunca repete Feed confirmado.</p>}</div>
      {Object.keys(document.reviews).length ? <details className="text-xs text-slate-400"><summary className="cursor-pointer text-slate-200">Histórico de versões desta apresentação</summary><ul className="mt-3 space-y-3">{Object.entries(document.reviews).map(([identity, item]) => <li key={identity}><p>{item.version} · {item.decision ? decisionLabel[item.decision] : "Em revisão"}</p><p>Modelo: {item.artworkApprovedAt ?? "pendente"} · legenda: {item.captionApprovedAt ?? "pendente"}</p>{item.reason ? <p>Motivo: {item.reason}</p> : null}<p className="break-all">{identity}</p></li>)}</ul></details> : null}
    </section>
  </div>;
}

function ArtPanel({ art, snapshot, serverTime }: { art: StudioArt; snapshot: StudioSnapshot; serverTime: string }) {
  const [surfaceIndex, setSurfaceIndex] = useState(0);
  const surfaces = studioSurfacesForArt(art);
  const surface = surfaces[surfaceIndex] ?? surfaces[0];
  if (!surface) return <article className="glass rounded-3xl p-5"><h2 className="text-xl font-bold text-white">{art.title}</h2><p className="mt-3 text-sm text-amber-200">Apresentações aguardando decisão do proprietário.</p></article>;
  const key = studioRecordKey(art.id, surface.platform, surface.placement);
  const record = snapshot.records.find((item) => item.record_key === key);
  const { current: media, error } = snapshot.media[`${art.id}:${surface.placement}`] ?? { current: null, error: null };
  return <article className="glass console-panel min-w-0 rounded-3xl p-5 sm:p-7">
    <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Bloco {art.block} · {art.id}</p><h2 className="text-2xl font-black text-white">{art.title}</h2><p className="text-sm text-slate-300">{art.metric}</p><p className="text-xs leading-6 text-slate-400">{art.dependencies}</p></div>
    <p className="mt-3 text-xs leading-6 text-slate-400">Feed e Stories são escolhas independentes deste tipo de arte em cada rede. Disponibilidade no catálogo não seleciona nem publica uma apresentação.{art.internal === "PENDING" ? " Feed interno indisponível: destino aguardando decisão do proprietário." : ""}</p>
    <div className="my-6 flex flex-wrap gap-2" aria-label={`Apresentações de ${art.title}`}>{surfaces.map((item, index) => <Button key={item.label} variant={index === surfaceIndex ? "primary" : "secondary"} aria-pressed={index === surfaceIndex} onClick={() => setSurfaceIndex(index)}>{item.label}</Button>)}</div>
    <VariantReview key={`${key}:${record?.revision ?? 0}:${media?.identity ?? "pending"}`} art={art} surface={surface} media={media} mediaError={error} sourceIntegrationError={snapshot.sourceIntegrationError} record={record} writable={snapshot.writable} serverTime={serverTime} deliveries={snapshot.deliveries.filter((delivery) => delivery.record_key === key)} />
  </article>;
}

export default function TouchlineSocialStudio({ snapshot }: { snapshot: StudioSnapshot }) {
  const [block, setBlock] = useState(0);
  const [search, setSearch] = useState("");
  const [activeArtId, setActiveArtId] = useState("MATCH_PREVIEW");
  const [clock, setClock] = useState({ base: snapshot.serverTime, elapsed: 0 });
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setClock({ base: snapshot.serverTime, elapsed: performance.now() - start }), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.serverTime]);
  const serverTime = new Date(Date.parse(snapshot.serverTime) + (clock.base === snapshot.serverTime ? clock.elapsed : 0)).toISOString();
  const readyMedia = Object.values(snapshot.media).filter((item) => item.current?.reviewReady && !item.error && studioProvenanceCurrent(item.current.provenance, Date.parse(serverTime))).length;
  const inventory = STUDIO_CATALOG.filter((art) => (block === 0 || art.block === block) && `${art.title} ${art.id} ${art.metric}`.toLocaleLowerCase("pt").includes(search.toLocaleLowerCase("pt")));
  const activeArt = inventory.find((art) => art.id === activeArtId) ?? inventory[0];
  return <div className="space-y-6">
    {snapshot.sourceIntegrationError ? <p role="status" className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-5 text-sm leading-6 text-amber-100">{snapshot.sourceIntegrationError}</p> : null}
    {snapshot.persistenceError ? <p role="alert" className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-5 text-sm leading-6 text-amber-100">{snapshot.persistenceError}</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">{[["Tipos no catálogo", STUDIO_CATALOG.length], ["Vídeos verificados disponíveis", readyMedia], ["Publicações habilitadas", 0]].map(([label, value]) => <div key={label} className="glass rounded-2xl p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p></div>)}</div>
    <nav className="flex flex-wrap gap-2" aria-label="Blocos das artes">{blockLabels.map((label, index) => <Button key={label} variant={block === index ? "primary" : "secondary"} aria-pressed={block === index} onClick={() => setBlock(index)}>{label}</Button>)}</nav>
    <label className="block space-y-2 text-sm text-slate-300"><span>Buscar no inventário</span><input className={fieldClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Arte, rodada, placar, ranking…" /></label>
    <datalist id="studio-time-zones"><option value="Europe/Malta" /><option value="Europe/London" /><option value="America/Sao_Paulo" /><option value="UTC" /></datalist>
    <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]"><nav aria-label="Inventário de artes" className="max-h-80 space-y-2 overflow-y-auto xl:max-h-[900px]">{inventory.map((art) => <div key={art.id} className="rounded-2xl border border-white/10 p-3"><Button className="w-full justify-start whitespace-normal text-left" variant={activeArt?.id === art.id ? "primary" : "secondary"} aria-pressed={activeArt?.id === art.id} onClick={() => setActiveArtId(art.id)}>{art.title}</Button><div className="mt-2 space-y-1 text-xs text-slate-400">{studioSurfacesForArt(art).filter((surface) => surface.platform === "INSTAGRAM").map((surface) => { const entry = snapshot.media[`${art.id}:${surface.placement}`]; return <p key={surface.placement}>{surface.placement === "FEED" ? "Feed" : "Story"}: {!entry?.current ? "Em produção · ausente" : entry.error || !entry.current.reviewReady || !studioProvenanceCurrent(entry.current.provenance, Date.parse(serverTime)) ? "Bloqueado" : "Vídeo para revisão"}</p>; })}</div></div>)}</nav>{activeArt ? <ArtPanel key={activeArt.id} art={activeArt} snapshot={snapshot} serverTime={serverTime} /> : <p className="p-6 text-slate-400">Nenhuma arte encontrada neste filtro.</p>}</div>
    <section className="glass rounded-3xl p-5 sm:p-7"><h2 className="text-lg font-bold text-white">Histórico persistente</h2><p className="mt-2 text-xs text-slate-400">Últimas 100 alterações. Cada registro preserva versão, motivo, revisão e autor no banco protegido.</p>{snapshot.history.length ? <ul className="mt-4 space-y-3 text-sm text-slate-300">{snapshot.history.map((item) => <li key={`${item.record_key}:${item.revision}`} className="break-words"><details><summary className="cursor-pointer">{item.record_key} · revisão {item.revision} · {studioActionLabel[item.action] ?? item.action} · {item.created_at}</summary><HistoryDocument document={item.document} /></details></li>)}</ul> : <p className="mt-4 text-sm text-slate-400">{snapshot.writable ? "Nenhuma decisão ou reserva registrada." : "Histórico indisponível até a persistência estar configurada."}</p>}</section>
  </div>;
}
