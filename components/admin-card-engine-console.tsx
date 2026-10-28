"use client";

import { useRef, useState } from "react";
import { normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import { CheckCircle2, FileDown, RotateCcw, ShieldAlert, Upload, WandSparkles } from "lucide-react";

type Player = Readonly<{ id: string; providerPlayerId: string; name: string; club: string }>;
type Batch = Readonly<{ id: string; status: string; rows_received: number; matched_rows: number; review_rows: number; conflict_rows: number; unmatched_rows: number; created_at: string }>;
type Override = Readonly<{ id: string; field_key: string; status: string; player_id: string; effective_value: unknown; source_batch_id: string | null; approved_at: string | null; provenance_status?: string | null; provisional_reason?: string | null; last_verification_at?: string | null; next_verification_at?: string | null; sources_consulted?: unknown }>;

const portuguese: Readonly<Record<string, string>> = {
  "Inbox": "Entrada",
  "Single Edit": "Edição individual",
  "Bulk Import": "Importação em lote",
  "Review & Publish": "Revisar e publicar",
  "Overrides": "Ajustes editoriais",
  "Data Quality": "Qualidade dos dados",
  "Audit History": "Histórico de auditoria",
  "· provider": "· provedor",
  "· TouchLine": "· TouchLine",
  "Card Engine records are unavailable. Actions remain blocked until reading is restored.": "Os dados do Card Engine estão indisponíveis. As ações permanecem bloqueadas até que a leitura seja restabelecida.",
  "PENDING CARD REVIEW": "REVISÃO DO CARD PENDENTE",
  "Open safely": "Abrir para revisão",
  "Canonical TouchLine player": "Jogador canônico da TouchLine",
  "(identity is blocked from editing)": "(identidade protegida contra edição)",
  "Choose canonical player": "Escolha o jogador canônico",
  "Edit only display name, shirt number, approved manual Market Value, or card template. Football facts and transfers remain TouchLine verified.": "Edite somente o nome de exibição, o número da camisa, o valor de mercado manual aprovado ou o modelo do card. Fatos do futebol e transferências permanecem verificados pela TouchLine.",
  "CSV / TSV": "CSV / TSV",
  "Season": "Temporada",
  "Export spreadsheets as CSV or TSV before importing. Binary XLSX parsing is intentionally not bundled.": "Exporte planilhas como CSV ou TSV antes de importar. Arquivos binários XLSX não são aceitos neste importador.",
  "Import content": "Conteúdo da importação",
  "Preview only": "Somente prévia",
  "Create review batch": "Criar lote para revisão",
  "rows": "linhas",
  "matched": "com correspondência",
  "· review": "· revisão",
  "· conflicts": "· conflitos",
  "· unmatched": "· sem correspondência",
  "Approve": "Aprovar",
  "Publish": "Publicar",
  "Rollback": "Reverter",
  "effective": "efetivo",
  "next verification": "próxima verificação",
  "Created": "Criado em",
  "Data Quality gates": "Critérios de qualidade dos dados",
  "• Provider ID and football facts are never editable.": "• O ID do provedor e os fatos do futebol não podem ser editados.",
  "• Name + club rows are manual-review-only; conflicts/unmatched rows cannot publish.": "• Linhas com nome + clube exigem revisão manual; conflitos ou linhas sem correspondência impedem a publicação.",
  "• Every override retains provider value, TouchLine override, effective value and stale signal.": "• Cada ajuste mantém o valor do provedor, o ajuste TouchLine, o valor efetivo e a indicação de desatualização.",
  "• Missing shirt and Market Value use explicit monitored provisional states (internal 0 / public 00 / €1M); neither is labelled official.": "• Camisa e valor de mercado ausentes usam estados provisórios identificados e monitorados (interno 0 / público 00 / €1M); nenhum é identificado como oficial.",
  "• Official line-ups replace only shirt 0; approved manual values are never overwritten.": "• Escalações oficiais substituem somente a camisa 0; valores manuais aprovados nunca são sobrescritos.",
  "Each batch and override creates immutable provenance in the protected audit table. A rollback changes the effective status to reverted; no history is deleted.": "Cada lote e ajuste cria proveniência imutável na tabela protegida de auditoria. Uma reversão muda o estado efetivo para revertido; nenhum histórico é apagado.",
  "Preview/result recorded locally. Publishing still requires explicit approve → publish.": "Prévia/resultado exibido nesta tela. A publicação ainda exige aprovação → publicação explícitas.",
  "No candidates available for review.": "Nenhum candidato disponível para revisão.",
  "Candidates are unavailable.": "Os candidatos estão indisponíveis.",
  "No review batches.": "Nenhum lote para revisão.",
  "No editorial overrides.": "Nenhum ajuste editorial.",
  "Processing…": "Processando…"
};
const publicErrors: Readonly<Record<string, string>> = {
  "Protected Card Engine administration is not configured.": "A administração protegida do Card Engine não está configurada.",
  "Owner access required.": "Acesso do proprietário necessário.",
  "Cross-origin Card Engine write blocked.": "A alteração do Card Engine foi bloqueada por origem inválida.",
  "Import exceeds the 250 KB limit.": "A importação excede o limite de 250 KB.",
  "Invalid Card Engine request.": "Solicitação do Card Engine inválida.",
  "A bounded CSV/TSV/paste import, source type and season are required.": "Informe uma importação CSV/TSV/texto dentro do limite, o tipo de origem e a temporada.",
  "No valid header/data rows were found. Use provider_player_id, player_id, name, club, date_of_birth, display_name, shirt_number, market_value_eur or card_template_key.": "Nenhuma linha válida de cabeçalho/dados foi encontrada. Use provider_player_id, player_id, name, club, date_of_birth, display_name, shirt_number, market_value_eur ou card_template_key.",
  "Card Engine request exceeds the size limit.": "A solicitação do Card Engine excede o limite de tamanho.",
  "A valid batch and action are required.": "Informe um lote e uma ação válidos.",
  "File exceeds the 250 KB import limit.": "O arquivo excede o limite de importação de 250 KB.",
  "Unable to read import file.": "Não foi possível ler o arquivo de importação.",
  "Card Engine command failed. Check the audit history before retrying.": "Não foi possível confirmar a ação do Card Engine. Confira o histórico de auditoria antes de tentar novamente."
};
const labels: Readonly<Record<string, readonly [string, string]>> = {
  LICENSED_MARKET_VALUE_RESOLVED: ["Verified licensed Market Value", "Valor de mercado licenciado verificado"],
  CANONICAL_LINEUP_RESOLVED: ["Verified canonical lineup", "Escalação canônica verificada"],
  "draft": [
    "Draft",
    "Rascunho"
  ],
  "approved": [
    "Approved",
    "Aprovado"
  ],
  "published": [
    "Published",
    "Publicado"
  ],
  "reverted": [
    "Reverted",
    "Revertido"
  ],
  "rejected": [
    "Rejected",
    "Rejeitado"
  ],
  "provisional": [
    "Provisional",
    "Provisório"
  ],
  "stale": [
    "Stale",
    "Desatualizado"
  ],
  "official": [
    "Official",
    "Oficial"
  ],
  "matched": [
    "Matched",
    "Com correspondência"
  ],
  "review": [
    "Review",
    "Revisão"
  ],
  "conflict": [
    "Conflicts",
    "Conflitos"
  ],
  "unmatched": [
    "Unmatched",
    "Sem correspondência"
  ],
  "PROVISIONAL_MISSING_SHIRT": [
    "Provisional · missing shirt number",
    "Provisório · número da camisa ausente"
  ],
  "PROVISIONAL_MISSING_MARKET_VALUE": [
    "Provisional · missing Market Value",
    "Provisório · valor de mercado ausente"
  ],
  "displayName": [
    "Display name",
    "Nome de exibição"
  ],
  "display_name": [
    "Display name",
    "Nome de exibição"
  ],
  "shirtNumber": [
    "Shirt number",
    "Número da camisa"
  ],
  "shirt_number": [
    "Shirt number",
    "Número da camisa"
  ],
  "marketValueEur": [
    "Market Value (€)",
    "Valor de mercado (€)"
  ],
  "market_value_eur": [
    "Market Value (€)",
    "Valor de mercado (€)"
  ],
  "cardTemplateKey": [
    "Card template",
    "Modelo do card"
  ],
  "card_template_key": [
    "Card template",
    "Modelo do card"
  ],
  "countryCode3": [
    "Country code",
    "Código do país"
  ],
  "position": [
    "Position",
    "Posição"
  ]
};
const commandFailure = "Card Engine command failed. Check the audit history before retrying.";
function safeError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : "";
  return Object.hasOwn(publicErrors, message) ? message : fallback;
}

export function AdminCardEngineConsole({ locale: localeInput, players, playersAvailable = true, batches, overrides, migrationReady }: { locale?: string; players: readonly Player[]; playersAvailable?: boolean; batches: readonly Batch[]; overrides: readonly Override[]; migrationReady: boolean }) {
  const locale = normalizeTouchLineAuthLocale(localeInput);
  const t = (text: string) => locale === "pt-BR" ? portuguese[text] ?? publicErrors[text] ?? text : text;
  const label = (value: string) => labels[value]?.[locale === "pt-BR" ? 1 : 0] ?? `${locale === "pt-BR" ? "Código" : "Code"}: ${value}`;
  const format = (value: unknown) => typeof value === "number" ? Number.isFinite(value) ? new Intl.NumberFormat(locale).format(value) : "—" : String(value ?? "—");
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Malta" }).format(new Date(value)) : "—";
  const [tab, setTab] = useState("inbox");
  const [text, setText] = useState("provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n");
  const [sourceType, setSourceType] = useState("paste");
  const [season, setSeason] = useState("2026-27");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const options = players.map((player) => <option key={player.id} value={player.providerPlayerId}>{player.name} · {player.club} {t("· provider")} {player.providerPlayerId}</option>);
  const call = async (action: "preview" | "create" | "approve" | "publish" | "rollback", batchId?: string) => {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/admin/card-engine", {
        method: action === "preview" || action === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "preview" || action === "create" ? { action, text, sourceType, effectiveSeason: season } : { action, batchId }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error ?? commandFailure));
      setResult(payload); if (action !== "preview") window.location.reload();
    } catch (cause) { setError(safeError(cause, commandFailure)); }
    finally { setBusy(false); }
  };
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0]; if (!selected) return;
    setError("");
    try {
      if (selected.size > 250_000) throw new Error("File exceeds the 250 KB import limit.");
      setText(await selected.text()); setSourceType("csv");
    } catch (cause) { setError(safeError(cause, "Unable to read import file.")); }
  };
  const addSingle = (providerPlayerId: string) => { setText(`provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n${providerPlayerId},,,,`); setSourceType("single_edit"); setTab("single"); };
  const summary = result?.summary as Record<string, unknown> | undefined;
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2">{[
      ["inbox", "Inbox"], ["single", "Single Edit"], ["bulk", "Bulk Import"], ["review", "Review & Publish"], ["overrides", "Overrides"], ["quality", "Data Quality"], ["audit", "Audit History"],
    ].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-xl border px-3 py-2 text-[10px] font-black ${tab === key ? "border-[#a3ff12]/50 bg-[#a3ff12]/10 text-[#caff6d]" : "border-white/10 text-slate-400"}`}>{t(label)}</button>)}</div>
    {!migrationReady ? <section className="rounded-2xl border border-amber-300/30 bg-amber-300/[.04] p-5 text-sm text-amber-100"><ShieldAlert className="mb-3" size={18}/>{t("Card Engine records are unavailable. Actions remain blocked until reading is restored.")}</section> : null}
    {tab === "inbox" ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!playersAvailable ? <p role="status">{t("Candidates are unavailable.")}</p> : !players.length ? <p role="status">{t("No candidates available for review.")}</p> : null}{players.slice(0, 10).map((player) => <article key={player.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-black text-white">{player.name}</p><p className="mt-1 text-xs text-slate-500">{player.club} · TouchLine {player.providerPlayerId}</p><p className="mt-3 text-[10px] font-black text-amber-200">{t("PENDING CARD REVIEW")}</p><button onClick={() => addSingle(player.providerPlayerId)} className="mt-3 rounded-lg border border-cyan-300/30 px-3 py-2 text-[10px] font-black text-cyan-100">{t("Open safely")}</button></article>)}</section> : null}
    {tab === "single" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><label htmlFor="card-engine-player" className="text-xs font-black text-white">{t("Canonical TouchLine player")} <span className="text-slate-500">{t("(identity is blocked from editing)")}</span></label><select id="card-engine-player" onChange={(event) => addSingle(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">{t("Choose canonical player")}</option>{options}</select><p className="mt-4 text-xs text-slate-500">{t("Edit only display name, shirt number, approved manual Market Value, or card template. Football facts and transfers remain TouchLine verified.")}</p></section> : null}
    {(tab === "bulk" || tab === "single") ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex flex-wrap items-center gap-3"><button onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 px-3 py-2 text-[10px] font-black text-cyan-100"><Upload size={14}/>{t("CSV / TSV")}</button><input ref={file} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden" onChange={onFile}/><label className="text-xs text-slate-400">{t("Season")} <input value={season} onChange={(event) => setSeason(event.target.value)} className="ml-2 w-24 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"/></label></div><p className="mt-3 text-xs text-slate-500">{t("Export spreadsheets as CSV or TSV before importing. Binary XLSX parsing is intentionally not bundled.")}</p><label htmlFor="card-engine-import" className="sr-only">{t("Import content")}</label><textarea id="card-engine-import" value={text} onChange={(event) => { setText(event.target.value); setSourceType("paste"); }} className="mt-4 min-h-48 w-full rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-white" spellCheck={false}/><div className="mt-3 flex gap-2"><button disabled={busy || !migrationReady} aria-busy={busy} onClick={() => call("preview")} className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black text-white">{t("Preview only")}</button><button disabled={busy || !migrationReady} aria-busy={busy} onClick={() => call("create")} className="inline-flex items-center gap-2 rounded-xl bg-[#a3ff12] px-4 py-2 text-[10px] font-black text-black"><WandSparkles size={14}/>{t("Create review batch")}</button></div></section> : null}
    {summary ? <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).filter(([key]) => ["matched", "review", "conflict", "unmatched"].includes(key)).map(([key, value]) => <div key={key} className="rounded-xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{label(key)}</p><p className="mt-1 text-2xl font-black text-white">{typeof value === "number" ? format(value) : "—"}</p></div>)}</section> : null}
    {tab === "review" ? <section className="space-y-3">{migrationReady && !batches.length ? <p role="status">{t("No review batches.")}</p> : null}{batches.map((batch) => <article key={batch.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-cyan-100">{batch.id}</p><p className="mt-1 text-sm font-black text-white">{label(batch.status)} · {format(batch.rows_received)} {t("rows")}</p><p className="mt-1 text-xs text-slate-500">{t("matched")} {format(batch.matched_rows)} {t("· review")} {format(batch.review_rows)} {t("· conflicts")} {format(batch.conflict_rows)} {t("· unmatched")} {format(batch.unmatched_rows)}</p><p className="mt-1 text-xs text-slate-500">{t("Created")} {date(batch.created_at)}</p></div><div className="flex flex-wrap gap-2">{batch.status === "draft" ? <button disabled={busy} aria-busy={busy} onClick={() => call("approve", batch.id)} className="rounded-lg border border-[#a3ff12]/35 px-3 py-2 text-[10px] font-black text-[#caff6d]">{t("Approve")}</button> : null}{batch.status === "approved" ? <button disabled={busy} aria-busy={busy} onClick={() => call("publish", batch.id)} className="rounded-lg bg-[#a3ff12] px-3 py-2 text-[10px] font-black text-black">{t("Publish")}</button> : null}{batch.status === "published" ? <button disabled={busy} aria-busy={busy} onClick={() => call("rollback", batch.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/35 px-3 py-2 text-[10px] font-black text-rose-100"><RotateCcw size={12}/>{t("Rollback")}</button> : null}</div></div></article>)}</section> : null}
    {tab === "overrides" ? <section className="space-y-2">{migrationReady && !overrides.length ? <p role="status">{t("No editorial overrides.")}</p> : null}{overrides.map((override) => <article key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div><p className="text-sm font-black text-white">{label(override.field_key)}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{override.player_id}</p>{override.provenance_status ? <p className="mt-2 text-[10px] font-black text-amber-200">{label(override.provenance_status)}</p> : null}{override.provisional_reason ? <p className="mt-1 max-w-xl text-xs text-slate-400">{override.provisional_reason}</p> : null}</div><div className="text-right"><p className="text-xs font-bold text-cyan-100">{t("effective")} {format(override.effective_value)}</p><p className="mt-1 text-[10px] font-black text-slate-500">{label(override.status)}</p>{override.next_verification_at ? <p className="mt-1 text-[10px] text-slate-500">{t("next verification")} {date(override.next_verification_at)}</p> : null}</div></article>)}</section> : null}
    {tab === "quality" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><h2 className="font-black text-white">{t("Data Quality gates")}</h2><ul className="mt-3 space-y-2 text-sm text-slate-400"><li>{t("• Provider ID and football facts are never editable.")}</li><li>{t("• Name + club rows are manual-review-only; conflicts/unmatched rows cannot publish.")}</li><li>{t("• Every override retains provider value, TouchLine override, effective value and stale signal.")}</li><li>{t("• Missing shirt and Market Value use explicit monitored provisional states (internal 0 / public 00 / €1M); neither is labelled official.")}</li><li>{t("• Official line-ups replace only shirt 0; approved manual values are never overwritten.")}</li></ul></section> : null}
    {tab === "audit" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><FileDown size={17} className="text-cyan-100"/><p className="mt-3 text-sm text-slate-400">{t("Each batch and override creates immutable provenance in the protected audit table. A rollback changes the effective status to reverted; no history is deleted.")}</p></section> : null}
    {busy ? <p role="status" aria-live="polite">{t("Processing…")}</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-rose-300/35 bg-rose-300/10 p-3 text-sm text-rose-100">{t(error)}</p> : null}
    {result ? <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-[#caff6d]"><CheckCircle2 size={14}/>{t("Preview/result recorded locally. Publishing still requires explicit approve → publish.")}</p> : null}
  </div>;
}
