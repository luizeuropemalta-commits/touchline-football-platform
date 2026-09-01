"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileDown, RotateCcw, ShieldAlert, Upload, WandSparkles } from "lucide-react";

type Player = Readonly<{ id: string; providerPlayerId: string; name: string; club: string }>;
type Batch = Readonly<{ id: string; status: string; rows_received: number; matched_rows: number; review_rows: number; conflict_rows: number; unmatched_rows: number; created_at: string }>;
type Override = Readonly<{ id: string; field_key: string; status: string; player_id: string; effective_value: unknown; source_batch_id: string | null; approved_at: string | null; provenance_status?: string | null; provisional_reason?: string | null; last_verification_at?: string | null; next_verification_at?: string | null; sources_consulted?: unknown }>;

function format(value: unknown) { return typeof value === "number" ? new Intl.NumberFormat("en-GB").format(value) : String(value ?? "—"); }

export function AdminCardEngineConsole({ players, batches, overrides, migrationReady }: { players: readonly Player[]; batches: readonly Batch[]; overrides: readonly Override[]; migrationReady: boolean }) {
  const [tab, setTab] = useState("inbox");
  const [text, setText] = useState("provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n");
  const [sourceType, setSourceType] = useState("paste");
  const [season, setSeason] = useState("2026-27");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const options = useMemo(() => players.map((player) => <option key={player.id} value={player.providerPlayerId}>{player.name} · {player.club} · provider {player.providerPlayerId}</option>), [players]);
  const call = async (action: "preview" | "create" | "approve" | "publish" | "rollback", batchId?: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/card-engine", {
        method: action === "preview" || action === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "preview" || action === "create" ? { action, text, sourceType, effectiveSeason: season } : { action, batchId }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error ?? "Card Engine command failed."));
      setResult(payload); if (action !== "preview") window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Card Engine command failed."); }
    finally { setBusy(false); }
  };
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0]; if (!selected) return;
    setError("");
    try {
      if (selected.size > 250_000) throw new Error("File exceeds the 250 KB import limit.");
      setText(await selected.text()); setSourceType("csv");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read import file."); }
  };
  const addSingle = (providerPlayerId: string) => { setText(`provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n${providerPlayerId},,,,`); setSourceType("single_edit"); setTab("single"); };
  const summary = result?.summary as Record<string, unknown> | undefined;
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2">{[
      ["inbox", "Inbox"], ["single", "Single Edit"], ["bulk", "Bulk Import"], ["review", "Review & Publish"], ["overrides", "Overrides"], ["quality", "Data Quality"], ["audit", "Audit History"],
    ].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-xl border px-3 py-2 text-[10px] font-black ${tab === key ? "border-[#a3ff12]/50 bg-[#a3ff12]/10 text-[#caff6d]" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div>
    {!migrationReady ? <section className="rounded-2xl border border-amber-300/30 bg-amber-300/[.04] p-5 text-sm text-amber-100"><ShieldAlert className="mb-3" size={18}/>Card Engine schema is unavailable. The page remains read-only until its QA migration is applied.</section> : null}
    {tab === "inbox" ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{players.slice(0, 10).map((player) => <article key={player.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-black text-white">{player.name}</p><p className="mt-1 text-xs text-slate-500">{player.club} · TouchLine {player.providerPlayerId}</p><p className="mt-3 text-[10px] font-black text-amber-200">PENDING CARD REVIEW</p><button onClick={() => addSingle(player.providerPlayerId)} className="mt-3 rounded-lg border border-cyan-300/30 px-3 py-2 text-[10px] font-black text-cyan-100">Open safely</button></article>)}</section> : null}
    {tab === "single" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><label className="text-xs font-black text-white">Canonical TouchLine player <span className="text-slate-500">(identity is blocked from editing)</span></label><select onChange={(event) => addSingle(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">Choose canonical player</option>{options}</select><p className="mt-4 text-xs text-slate-500">Edit only display name, shirt number, approved manual Market Value, or card template. Football facts and transfers remain TouchLine verified.</p></section> : null}
    {(tab === "bulk" || tab === "single") ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex flex-wrap items-center gap-3"><button onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 px-3 py-2 text-[10px] font-black text-cyan-100"><Upload size={14}/>CSV / TSV</button><input ref={file} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden" onChange={onFile}/><label className="text-xs text-slate-400">Season <input value={season} onChange={(event) => setSeason(event.target.value)} className="ml-2 w-24 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white"/></label></div><p className="mt-3 text-xs text-slate-500">Export spreadsheets as CSV or TSV before importing. Binary XLSX parsing is intentionally not bundled.</p><textarea value={text} onChange={(event) => { setText(event.target.value); setSourceType("paste"); }} className="mt-4 min-h-48 w-full rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-white" spellCheck={false}/><div className="mt-3 flex gap-2"><button disabled={busy || !migrationReady} onClick={() => call("preview")} className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black text-white">Preview only</button><button disabled={busy || !migrationReady} onClick={() => call("create")} className="inline-flex items-center gap-2 rounded-xl bg-[#a3ff12] px-4 py-2 text-[10px] font-black text-black"><WandSparkles size={14}/>Create review batch</button></div></section> : null}
    {summary ? <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).map(([key, value]) => <div key={key} className="rounded-xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{key}</p><p className="mt-1 text-2xl font-black text-white">{format(value)}</p></div>)}</section> : null}
    {tab === "review" ? <section className="space-y-3">{batches.map((batch) => <article key={batch.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-cyan-100">{batch.id}</p><p className="mt-1 text-sm font-black text-white">{batch.status.toUpperCase()} · {batch.rows_received} rows</p><p className="mt-1 text-xs text-slate-500">matched {batch.matched_rows} · review {batch.review_rows} · conflicts {batch.conflict_rows} · unmatched {batch.unmatched_rows}</p></div><div className="flex gap-2">{batch.status === "draft" ? <button disabled={busy} onClick={() => call("approve", batch.id)} className="rounded-lg border border-[#a3ff12]/35 px-3 py-2 text-[10px] font-black text-[#caff6d]">Approve</button> : null}{batch.status === "approved" ? <button disabled={busy} onClick={() => call("publish", batch.id)} className="rounded-lg bg-[#a3ff12] px-3 py-2 text-[10px] font-black text-black">Publish</button> : null}{batch.status === "published" ? <button disabled={busy} onClick={() => call("rollback", batch.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/35 px-3 py-2 text-[10px] font-black text-rose-100"><RotateCcw size={12}/>Rollback</button> : null}</div></div></article>)}</section> : null}
    {tab === "overrides" ? <section className="space-y-2">{overrides.map((override) => <article key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><div><p className="text-sm font-black text-white">{override.field_key}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{override.player_id}</p>{override.provenance_status ? <p className="mt-2 text-[10px] font-black text-amber-200">{override.provenance_status}</p> : null}{override.provisional_reason ? <p className="mt-1 max-w-xl text-xs text-slate-400">{override.provisional_reason}</p> : null}</div><div className="text-right"><p className="text-xs font-bold text-cyan-100">effective {format(override.effective_value)}</p><p className="mt-1 text-[10px] font-black text-slate-500">{override.status}</p>{override.next_verification_at ? <p className="mt-1 text-[10px] text-slate-500">next verification {new Date(override.next_verification_at).toLocaleString("en-GB")}</p> : null}</div></article>)}</section> : null}
    {tab === "quality" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><h2 className="font-black text-white">Data Quality gates</h2><ul className="mt-3 space-y-2 text-sm text-slate-400"><li>• Provider ID and football facts are never editable.</li><li>• Name + club rows are manual-review-only; conflicts/unmatched rows cannot publish.</li><li>• Every override retains provider value, TouchLine override, effective value and stale signal.</li><li>• Missing shirt and Market Value use explicit monitored provisional states (internal 0 / public 00 / €1M); neither is labelled official.</li><li>• Official line-ups replace only shirt 0; approved manual values are never overwritten.</li></ul></section> : null}
    {tab === "audit" ? <section className="rounded-2xl border border-white/10 bg-black/20 p-5"><FileDown size={17} className="text-cyan-100"/><p className="mt-3 text-sm text-slate-400">Each batch and override creates immutable provenance in the protected audit table. A rollback changes the effective status to reverted; no history is deleted.</p></section> : null}
    {error ? <p role="alert" className="rounded-xl border border-rose-300/35 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p> : null}
    {result ? <p className="inline-flex items-center gap-2 text-xs text-[#caff6d]"><CheckCircle2 size={14}/>Preview/result recorded locally. Publishing still requires explicit approve → publish.</p> : null}
  </div>;
}
