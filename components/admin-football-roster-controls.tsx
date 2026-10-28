'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { normalizeTouchLineAuthLocale } from '@/lib/touchlineArena/auth-i18n';
import { ROSTER_CLUB_LABELS, rosterSourceFresh, type RosterCommand, type RosterStatus } from '@/lib/football-data/roster-reconciliation-contract';
const endpoint = '/api/admin/football-data/rosters';
export function FootballRosterControls({ locale: inputLocale = 'en-GB' }: {
    locale?: string;
}) {
    const locale = normalizeTouchLineAuthLocale(inputLocale), pt = locale === 'pt-BR';
    const t = (ptText: string, enText: string) => pt ? ptText : enText;
    const [status, setStatus] = useState<RosterStatus | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [confirmed, setConfirmed] = useState(false), [reason, setReason] = useState(''), [pagination, setPagination] = useState<{snapshotId:string|null;page:number}>({snapshotId:null,page:0});
    const busy = useRef(false), alive = useRef(true), readRevision = useRef(0);
    const [unconfirmed, setUnconfirmed] = useState<RosterCommand | null>(null);
    const refresh = useCallback(async () => {
        const revision = ++readRevision.current;
        setLoading(true);
        try {
            const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
            const body = await response.json();
            if (!response.ok || body.ok !== true || !body.status || !Array.isArray(body.status.snapshots) || !Array.isArray(body.status.jobs) || typeof body.status.enabled !== 'boolean' || typeof body.status.applyEnabled !== 'boolean')
                throw new Error('ROSTER_UNAVAILABLE');
            if (alive.current && revision === readRevision.current) {
                setStatus(body.status);
                const snapshotId = body.status.snapshots[0]?.id ?? null;
                setPagination(previous => previous.snapshotId === snapshotId ? previous : { snapshotId, page: 0 });
                setError(null);
            }
        }
        catch {
            if (alive.current && revision === readRevision.current) {
                setStatus(null);
                setError('ROSTER_UNAVAILABLE');
            }
        }
        finally {
            if (alive.current && revision === readRevision.current)
                setLoading(false);
        }
    }, []);
    useEffect(() => { alive.current = true; void Promise.resolve().then(() => { if (alive.current)
        return refresh(); }); return () => { alive.current = false; }; }, [refresh]);
    async function run(command: RosterCommand) {
        if (busy.current)
            return;
        busy.current = true;
        setPending(true);
        setConfirmed(false);
        setError(null);
        setUnconfirmed(command);
        let failure: string | null = null;
        try {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(310000), body: JSON.stringify(command) });
            const body = await response.json();
            if (!response.ok || body.ok !== true) {
                if ([400, 403, 409].includes(response.status))
                    setUnconfirmed(null);
                throw new Error(typeof body.error === 'string' ? body.error : 'ROSTER_NOT_CONFIRMED');
            }
            if (body.result?.status === 'failed') {
                setUnconfirmed(null);
                throw new Error('ROSTER_CAPTURE_FAILED');
            }
            if (body.result?.status === 'collecting')
                throw new Error('ROSTER_NOT_CONFIRMED');
            setUnconfirmed(null);
            if (alive.current)
                setConfirmed(true);
        }
        catch (e) {
            failure = e instanceof Error ? e.message : 'ROSTER_NOT_CONFIRMED';
        }
        finally {
            await refresh();
            busy.current = false;
            if (alive.current) {
                setPending(false);
                if (failure)
                    setError(failure);
            }
        }
    }
    const current = status?.snapshots[0];
    // A new capture starts on its first page; shrinking an existing capture
    // also clamps its page without a stale render or a state-setting effect.
    const lastPage = Math.max(0, Math.ceil((current?.operations.length ?? 0) / 20) - 1);
    const page = pagination.snapshotId === current?.id ? Math.min(pagination.page, lastPage) : 0;

    const fresh = current ? rosterSourceFresh(current.fetchedAt) : false;
    const actionable = Boolean(status?.enabled && current?.status === 'review' && fresh && !loading && !pending && !unconfirmed);
    const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : t('Data indisponível', 'Date unavailable');
    const clubLabel = (id:string|null) => id ? (ROSTER_CLUB_LABELS[id] ? `${ROSTER_CLUB_LABELS[id]} (${id})` : `Sportmonks ${id}`) : '—';
    const kind = (value: string) => ({ ADD_REVIEW_REQUIRED: t('Inclusão', 'Addition'), TRANSFER_REVIEW_REQUIRED: t('Transferência', 'Transfer'), UPDATE_REVIEW_REQUIRED: t('Atualização de dados', 'Data update'), PRESERVE_UNSEEN_REVIEW_REQUIRED: t('Ausente na fonte — vínculo preservado', 'Absent from source — membership preserved') }[value] ?? t('Revisão pendente', 'Review pending'));
    const feedback = error === 'FORBIDDEN' ? t('Acesso negado. Verifique a sessão do proprietário antes de repetir.', 'Access denied. Verify the owner session before retrying.') : error === 'ROSTER_UNAVAILABLE' ? t('Histórico indisponível. Os controles permanecem bloqueados.', 'History unavailable. Controls remain blocked.') :
        error === 'ROSTER_BASELINE_CHANGED' || error === 'ROSTER_REVISION_CONFLICT' ? t('Os dados ou a revisão mudaram. Recarregue o histórico e capture uma nova observação se necessário.', 'Data or revision changed. Reload history and capture a new observation if needed.') :
            error === 'ROSTER_SOURCE_EXPIRED' ? t('Observação expirada. Capture dados atuais antes de decidir.', 'Observation expired. Capture current data before deciding.') :
                error === 'ROSTER_CAPTURE_FAILED' ? t('A captura falhou. O histórico foi preservado; verifique a causa antes de iniciar uma nova captura.', 'Capture failed. History was preserved; check the cause before starting a new capture.') :
                    error?.includes('PAUSED') ? t('Execução pausada pela configuração do servidor.', 'Execution paused by server configuration.') :
                        error ? t('Operação não confirmada. Confira o histórico e reconcilie o mesmo pedido antes de iniciar outro.', 'Operation unconfirmed. Check history and reconcile the same request before starting another.') :
                            confirmed ? t('Operação confirmada no histórico persistido.', 'Operation confirmed in persistent history.') : '';
    return <section className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/[.045] p-5" aria-labelledby="roster-title">
  <h2 id="roster-title" className="text-xl font-black text-white">{t('Reconciliação contínua de elencos', 'Continuous roster reconciliation')}</h2>
  <p className="mt-2 text-sm leading-6 text-slate-300">{t('A captura compara os 20 clubes. O cron apenas cria observações para revisão. O proprietário decide cada mudança; jogadores ausentes são preservados. Valores manuais e arquivos históricos permanecem protegidos.', 'Capture compares all 20 clubs. Cron only creates observations for review. The owner decides each change; absent players are preserved. Manual values and historical archives remain protected.')}</p>
  <p className="mt-3 text-sm font-bold text-amber-200">{loading ? t('Carregando histórico…', 'Loading history…') : !status ? t('Integração indisponível', 'Integration unavailable') : status.enabled ? t('Captura disponível · aplicação exige aprovação e permissão QA', 'Capture available · application requires approval and QA permission') : t('PAUSADO — captura e aplicação desativadas', 'PAUSED — capture and application disabled')}</p>
  <div className="mt-4 flex flex-wrap gap-3">
   <Button variant="secondary" disabled={loading || pending} onClick={() => void refresh()}>{t('Recarregar histórico', 'Reload history')}</Button>
   <Button disabled={loading || !status?.enabled || pending || Boolean(unconfirmed)} onClick={() => void run({ action: 'capture', requestId: crypto.randomUUID() })}>{t('Capturar observação', 'Capture observation')}</Button>
   {unconfirmed && <Button variant="secondary" disabled={pending} onClick={() => void run(unconfirmed!)}>{t('Reconciliar mesmo pedido', 'Reconcile same request')}</Button>}
  </div>
  <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm text-amber-100">{pending ? t('Processando… aguarde a confirmação.', 'Processing… wait for confirmation.') : feedback}</p>
  {status && !current && <p className="text-sm text-slate-400">{t('Nenhuma observação persistida.', 'No persisted observation.')}</p>}
  {current && <div className="mt-4 space-y-4">
   <p className="text-sm font-bold text-slate-200">{current.status === 'applied' ? t('Observação aplicada — histórico preservado', 'Observation applied — history preserved') : t('Observação em revisão', 'Observation under review')}</p>
   <p className="break-words text-xs text-slate-400">{t('Observação', 'Observation')} {current.id} · {date(current.fetchedAt)} · {t('Temporada', 'Season')} {current.seasonId} · {t('Revisão', 'Revision')} {current.revision}<br />SHA-256: {current.checksum}</p>
   {!fresh && <p className="text-sm text-amber-200">{t('Fonte expirada; decisões e aplicação bloqueadas.', 'Source expired; decisions and application blocked.')}</p>}
   <label className="block text-sm text-slate-200">{t('Motivo da decisão (3 a 500 caracteres)', 'Decision reason (3 to 500 characters)')}<textarea className="mt-2 block min-h-20 w-full rounded-xl border border-white/20 bg-black/30 p-3 text-white" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={!actionable}/></label>
   {current.operations.length === 0 && <p className="text-sm text-slate-300">{t('Elencos coincidem com a observação. Nenhuma mudança para aprovar.', 'Rosters match the observation. No changes to approve.')}</p>}
   <ul className="space-y-3">{current.operations.slice(page * 20, page * 20 + 20).map(op => <li key={op.providerId} className="rounded-xl border border-white/10 p-3">
    <p className="font-bold text-white">{op.name}</p><p className="text-sm text-slate-300">{kind(op.kind)} · {t('Clube', 'Club')} {clubLabel(op.fromTeamId)} → {clubLabel(op.teamId)}</p>
    <p className="break-words text-xs text-slate-400">Sportmonks {op.providerId} · {op.canonicalPlayerId ?? t('UUID pendente de inclusão', 'UUID pending addition')}</p>
    <p className="mt-1 text-sm text-slate-300">{op.decision === 'approve' ? t('Aprovado', 'Approved') : op.decision === 'reject' ? t('Rejeitado', 'Rejected') : t('Pendente', 'Pending')}{op.reason ? ` · ${op.reason}` : ''}</p>
    {op.kind !== 'PRESERVE_UNSEEN_REVIEW_REQUIRED' && <div className="mt-3 flex flex-wrap gap-2">{(['approve', 'reject'] as const).map(decision => <Button key={decision} variant="secondary" disabled={!actionable || reason.trim().length < 3} onClick={() => void run({ action: 'decide', requestId: crypto.randomUUID(), snapshotId: current.id, revision: current.revision, providerId: op.providerId, decision, reason })}>{decision === 'approve' ? t('Aprovar', 'Approve') : t('Rejeitar', 'Reject')}</Button>)}</div>}
   </li>)}</ul>
   {current.operations.length > 20 && <div className="flex gap-3"><Button variant="secondary" disabled={page === 0 || pending} onClick={() => setPagination({snapshotId:current.id,page:Math.max(0,page-1)})}>{t('Anterior', 'Previous')}</Button><span className="self-center text-sm text-slate-300">{page + 1} / {Math.ceil(current.operations.length / 20)}</span><Button variant="secondary" disabled={(page + 1) * 20 >= current.operations.length || pending} onClick={() => setPagination({snapshotId:current.id,page:Math.min(lastPage,page+1)})}>{t('Próxima', 'Next')}</Button></div>}
   <Button disabled={!actionable || !status?.applyEnabled || !current.operations.some(op => op.decision === 'approve')} onClick={() => void run({ action: 'apply', requestId: crypto.randomUUID(), snapshotId: current.id, revision: current.revision })}>{t('Aplicar mudanças aprovadas em QA', 'Apply approved changes in QA')}</Button>
   {!status?.applyEnabled && <p className="text-sm text-amber-200">{t('Aplicação pausada no servidor. Aprovação não publica cards nem altera valores.', 'Application paused on the server. Approval does not publish cards or change values.')}</p>}
  </div>}
  {Boolean(status?.jobs.length) && <details className="mt-5 border-t border-white/10 pt-3"><summary className="cursor-pointer py-2 text-sm font-bold text-slate-300">{t('Últimas capturas e falhas', 'Recent captures and failures')}</summary><ul className="space-y-2">{status!.jobs.map(job => <li key={job.id} className="break-words text-xs text-slate-400">{date(job.createdAt)} · {job.id} · {job.status === 'review' ? t('Em revisão', 'In review') : job.status === 'collecting' ? t('Capturando', 'Capturing') : t('Falha de captura', 'Capture failed')}{job.error ? ` · ${t('Requer nova captura após verificar a causa', 'Requires a new capture after checking the cause')}` : ''}</li>)}</ul></details>}
 </section>;
}
