"use client";

import { useMemo, useState } from "react";
import { Check, Eye, Search, X } from "lucide-react";

import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import type { TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import type { TouchlineCardReviewPresentation } from "@/lib/touchlineArena/card-review-state";

type PlayerOption = Readonly<{
  id: string;
  name: string;
  clubName: string;
}>;

type ClubOption = Readonly<{ id: string; name: string }>;

type ManualEditorialLocale = "en-GB" | "pt-BR";

type ManualCardPreview = Readonly<{
  authority: "TouchLine";
  providerConflict: Readonly<{
    providerMarketValue: number;
    providerMarketValueCurrency: string;
    touchlineMarketValueEur: number;
    resolution: "TOUCHLINE_AUTHORITY";
  }> | null;
  player: Readonly<{
    canonicalPlayerId: string;
    displayName: string;
    clubName: string;
    clubLogoUrl: string | null;
    shirtNumber: number | null;
    countryCode3: string | null;
    position: string | null;
  }>;
  marketValueEur: number;
  effectiveSeason: string;
  publicationStatus: string;
  calculatedTier: TouchlineCardTierKey;
  nominalPriceGbp: number;
  cardReview: TouchlineCardReviewPresentation;
}>;

function manualCopy(locale: ManualEditorialLocale) {
  const pt = locale === "pt-BR";
  return {
    oneAtATime: pt ? "Um jogador de cada vez" : "One player at a time",
    title: pt ? "Valor de mercado manual → Card Engine" : "Manual market value → Card Engine",
    intro: pt
      ? "O valor e a evidência interna permanecem protegidos. Quando todos os campos reais do card estiverem completos, a TouchLine calcula tier, borda, neon, preço nominal e publica automaticamente."
      : "The value and internal evidence stay protected. Once every real card field is complete, TouchLine automatically calculates tier, border, neon, nominal price and publication.",
    findPlayer: pt ? "Encontrar jogador canônico" : "Find canonical player",
    searchPlaceholder: pt ? "Nome ou clube" : "Name or club",
    selected: pt ? "Selecionado" : "Selected",
    value: pt ? "Valor manual em EUR" : "Manual EUR value",
    season: pt ? "Temporada" : "Season",
    preview: pt ? "Pré-visualizar card" : "Preview card",
    previewTitle: pt ? "Revise antes de confirmar" : "Review before confirming",
    previewIntro: pt ? "Nada foi salvo ainda. Confira o card e pressione SAVE & REVALIDATE somente quando estiver correto." : "Nothing has been saved yet. Inspect the card and press SAVE & REVALIDATE only when it is correct.",
    edit: pt ? "Voltar e editar" : "Back to edit",
    saveAndRevalidate: pt ? "SAVE & REVALIDATE" : "SAVE & REVALIDATE",
    note: pt ? "Nota interna (nunca pública)" : "Internal note (never public)",
    source: pt ? "Fonte / evidência interna (nunca pública)" : "Internal source / evidence (never public)",
    choose: pt ? "Escolha o jogador existente e informe o valor manual. A publicação será derivada automaticamente apenas quando houver dados suficientes." : "Choose the existing player and enter the manual value. Publication is derived automatically only when enough real data exists.",
    invalid: pt ? "Selecione um jogador e informe um valor inteiro em EUR maior ou igual a zero." : "Select a player and enter a whole non-negative EUR value.",
    saving: pt ? "Salvando o valor manual canônico e o estado de publicação protegido…" : "Saving the canonical manual value and protected publication state…",
    savingShort: pt ? "Salvando" : "Saving",
    preparing: pt ? "Preparar prévia" : "Prepare preview",
    preparingLong: pt ? "Preparando a prévia protegida sem gravar dados…" : "Preparing the protected preview without writing data…",
    bulkEyebrow: pt ? "Atualização em lote de valores de mercado" : "Bulk market value update",
    bulkTitle: pt ? "Validar até 50 linhas" : "Validate up to 50 rows",
    bulkIntro: pt ? "Esta é apenas uma prévia protegida. Ela nunca publica uma linha e não associa um nome digitado fora do elenco canônico do clube selecionado." : "This is a protected preview only. It never publishes a row, and it does not match a typed name outside the selected canonical club.",
    club: pt ? "Clube" : "Club",
    paste: pt ? "Cole até 50 linhas: NOME DO JOGADOR | IDADE | VALOR DE MERCADO." : "Paste up to 50 rows: PLAYER NAME | AGE | MARKET VALUE.",
    resolving: pt ? "Resolvendo o elenco canônico do clube…" : "Resolving canonical club roster…",
    validate: pt ? "Validar linhas" : "Preview validated rows",
    validating: pt ? "Validando" : "Validating",
    received: pt ? "recebidas" : "received",
    ready: pt ? "prontas" : "ready",
    requireReview: pt ? "exigem revisão" : "require review",
    historyEyebrow: pt ? "Histórico imutável" : "Immutable history",
    historyTitle: pt ? "Decisões editoriais recentes" : "Recent editorial decisions",
    historyIntro: pt ? "Reverter restaura uma versão anterior completa somente depois que o jogador ainda passar na validação canônica de membership. O histórico nunca é apagado." : "Revert restores a prior complete snapshot only after the player still passes canonical membership validation. History is never deleted.",
    restore: pt ? "Restaurar versão anterior" : "Revert to prior",
    restoring: pt ? "Restaurando" : "Restoring",
    noSnapshot: pt ? "Sem versão anterior completa" : "No complete prior snapshot",
    noHistory: pt ? "Ainda não há histórico editorial protegido." : "No protected editorial history yet.",
  } as const;
}

export function ManualCardEditorialEditor({ players, locale = "en-GB", initialPlayerId }: { players: readonly PlayerOption[]; locale?: ManualEditorialLocale; initialPlayerId?: string }) {
  const copy = manualCopy(locale);
  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState(() => players.some((player) => player.id === initialPlayerId) ? initialPlayerId ?? "" : "");
  const [marketValueEur, setMarketValueEur] = useState("");
  const [effectiveSeason, setEffectiveSeason] = useState("2026-27");
  const [internalNote, setInternalNote] = useState("");
  const [internalSource, setInternalSource] = useState("");
  const [status, setStatus] = useState<string>(copy.choose);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ManualCardPreview | null>(null);

  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return players.slice(0, 20);
    return players.filter((player) => `${player.name} ${player.clubName}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [players, query]);
  const selectedPlayer = players.find((player) => player.id === playerId) ?? null;

  function requestBody(parsedValue: number) {
    return {
      playerId,
      marketValueEur: parsedValue,
      effectiveSeason,
      internalNote,
      internalSource,
    };
  }

  function validatedValue() {
    if (!marketValueEur.trim()) {
      setStatus(copy.invalid);
      return null;
    }
    const parsedValue = Number(marketValueEur);
    if (!playerId || !Number.isSafeInteger(parsedValue) || parsedValue < 0) {
      setStatus(copy.invalid);
      return null;
    }
    return parsedValue;
  }

  async function preparePreview() {
    const parsedValue = validatedValue();
    if (parsedValue === null) return;
    setBusy(true);
    setStatus(copy.preparingLong);
    try {
      const response = await fetch("/api/admin/manual-card-editorial?action=preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody(parsedValue)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Editorial preview failed.");
      setPreview(payload as ManualCardPreview);
      setStatus(copy.previewIntro);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Editorial preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const parsedValue = validatedValue();
    if (parsedValue === null || !preview) return;
    setBusy(true);
    setStatus(copy.saving);
    try {
      const response = await fetch("/api/admin/manual-card-editorial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody(parsedValue)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Editorial save failed.");
      setStatus(payload.cardReview?.state === "COMPLETE"
        ? `${payload.publicationStatus}: ${payload.calculatedTier} / £${payload.nominalPriceGbp}. ${locale === "pt-BR" ? "Card completo e publicado automaticamente." : "Card complete and published automatically."}`
        : `${payload.cardReview?.missingFields?.length ?? 0} ${locale === "pt-BR" ? "campo(s) ainda requer(em) revisão; o card continua em grayscale." : "field(s) still require review; the card stays grayscale."}`);
      setPreview(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Editorial save failed.");
    } finally {
      setBusy(false);
    }
  }

  const previewPlayer: TouchlineEliteExactPlayer | null = preview ? {
    sportmonksPlayerId: preview.player.canonicalPlayerId,
    canonicalPlayerId: preview.player.canonicalPlayerId,
    overall: "—",
    shirtNumber: preview.player.shirtNumber,
    role: preview.player.position ?? "Player",
    position: preview.player.position ?? "—",
    countryCode3: preview.player.countryCode3 ?? "",
    name: preview.player.displayName,
    clubName: preview.player.clubName,
    clubLogoUrl: preview.player.clubLogoUrl,
    leagueName: "TouchLine England",
    leagueLogoUrl: null,
    marketValue: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(preview.marketValueEur),
    marketValueSource: "verified-cache",
    marketValueState: "verified",
    classificationState: "verified",
    cardTier: preview.calculatedTier,
    cardPriceVersion: preview.effectiveSeason,
    editorialCard: preview.cardReview.state === "COMPLETE" ? {
      tierKey: preview.calculatedTier,
      cardPrice: { amountMinor: preview.nominalPriceGbp * 100, currency: "GBP" },
      lastReviewedAt: new Date().toISOString(),
    } : null,
    cardReview: preview.cardReview,
    updatedAt: "PREVIEW · NOT SAVED",
    age: "—",
    height: "—",
    foot: "—",
    contract: "—",
    nationality: preview.player.countryCode3 ?? "Pending",
    fantasyPoints: 0,
    seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
  } : null;

  return (
    <section className="grid gap-4 rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
      <div>
        <p className="text-[10px] font-black text-cyan-300">{copy.oneAtATime}</p>
        <h2 className="mt-1 text-2xl font-black italic text-white">{copy.title}</h2>
        <p className="mt-2 text-xs leading-5 text-slate-400">{copy.intro}</p>
      </div>
      <label className="grid gap-2 text-[10px] font-black text-slate-300">
        {copy.findPlayer}
        <span className="flex h-10 items-center gap-2 rounded-xl border border-white/[.08] bg-black/30 px-3"><Search size={14} className="text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none" /></span>
      </label>
      <div className="max-h-44 overflow-y-auto rounded-2xl border border-white/[.06] bg-black/20 p-2">
        {filteredPlayers.map((player) => (
          <button key={player.id} type="button" onClick={() => { setPlayerId(player.id); setPreview(null); }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${player.id === playerId ? "bg-[#a3ff12]/15 text-[#d9ff96]" : "text-slate-300 hover:bg-white/[.04]"}`}>
            <span className="text-xs font-bold">{player.name}</span><span className="text-[9px] font-bold text-slate-500">{player.clubName}</span>
          </button>
        ))}
      </div>
      {selectedPlayer ? <p className="text-[10px] font-bold text-[#caff6d]">{copy.selected}: {selectedPlayer.name} · {selectedPlayer.clubName}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.value}<input inputMode="numeric" value={marketValueEur} onChange={(event) => { setMarketValueEur(event.target.value.replace(/[^0-9]/g, "")); setPreview(null); }} placeholder="42000000" className="h-10 rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white outline-none" /></label>
        <label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.season}<input value={effectiveSeason} onChange={(event) => { setEffectiveSeason(event.target.value); setPreview(null); }} className="h-10 rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white outline-none" /></label>
      </div>
      <label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.note}<textarea value={internalNote} onChange={(event) => { setInternalNote(event.target.value); setPreview(null); }} rows={2} className="rounded-xl border border-white/[.08] bg-black/30 p-3 text-xs text-white outline-none" /></label>
      <label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.source}<input value={internalSource} onChange={(event) => { setInternalSource(event.target.value); setPreview(null); }} className="h-10 rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white outline-none" /></label>
      <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={preparePreview} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#a3ff12] px-4 text-[10px] font-black text-black disabled:opacity-50"><Eye size={14} />{busy ? copy.preparing : copy.preview}</button><p aria-live="polite" className="text-[10px] font-bold text-slate-500">{status}</p></div>
      {preview && previewPlayer ? <div role="dialog" aria-modal="true" aria-labelledby="manual-card-preview-title" className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md">
        <section className="relative grid w-full max-w-4xl gap-5 rounded-[2rem] border border-[#a3ff12]/35 bg-[#050b09] p-5 shadow-[0_0_80px_rgba(163,255,18,.16)] md:grid-cols-[minmax(260px,360px)_1fr] md:p-8">
          <button type="button" onClick={() => setPreview(null)} aria-label={copy.edit} className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/70 text-white"><X size={18} /></button>
          <div className="mx-auto w-full max-w-[330px]"><TouchlineEliteExactCard player={previewPlayer} isEditable={false} persistLayoutToMaster={false} ignoreStoredLayout={true} startUnlocked={false} isRemovalMarkerEnabled={false} staticRenderScale={0.72} runtimeLocaleOverride={locale} subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showMatchPoints={false} rankingMode="preview" showSocialMetrics={false} forceNeonActive /></div>
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#a3ff12]">{copy.previewTitle}</p>
            <h3 id="manual-card-preview-title" className="mt-3 text-3xl font-black italic text-white">{preview.player.displayName}</h3>
            <p className="mt-1 text-sm font-bold text-slate-400">{preview.player.clubName}</p>
            <div className="mt-5 grid gap-2 rounded-2xl border border-white/10 bg-white/[.035] p-4 text-sm text-slate-300">
              <p><strong className="text-white">Market Value:</strong> {new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(preview.marketValueEur)}</p>
              <p><strong className="text-white">Authority:</strong> {preview.authority}</p>
              <p><strong className="text-white">Tier:</strong> {preview.calculatedTier}</p>
              <p><strong className="text-white">Card Price:</strong> £{preview.nominalPriceGbp}</p>
              <p><strong className="text-white">State:</strong> {preview.cardReview.state}</p>
              {preview.cardReview.missingFields.length ? <p className="text-amber-200"><strong>Missing:</strong> {preview.cardReview.missingFields.join(", ")}</p> : null}
            </div>
            {preview.providerConflict ? <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[.07] p-4 text-xs leading-5 text-amber-100"><strong className="block font-black uppercase tracking-[.14em]">PROVIDER CONFLICT</strong><span>Sportmonks: {new Intl.NumberFormat(locale, { style: "currency", currency: preview.providerConflict.providerMarketValueCurrency, maximumFractionDigits: 0 }).format(preview.providerConflict.providerMarketValue)} · TouchLine: {new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(preview.providerConflict.touchlineMarketValueEur)}. TouchLine remains authoritative; the provider value was not applied.</span></div> : null}
            <p className="mt-4 text-xs leading-5 text-slate-400">{copy.previewIntro}</p>
            <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setPreview(null)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-[10px] font-black text-white"><X size={14} />{copy.edit}</button><button type="button" onClick={save} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#a3ff12] px-5 text-[10px] font-black uppercase tracking-[.18em] text-black disabled:opacity-50"><Check size={15} />{busy ? copy.savingShort : copy.saveAndRevalidate}</button></div>
          </div>
        </section>
      </div> : null}
    </section>
  );
}

export function ManualCardEditorialBulkPreview({ clubs, locale = "en-GB" }: { clubs: readonly ClubOption[]; locale?: ManualEditorialLocale }) {
  const copy = manualCopy(locale);
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [effectiveSeason, setEffectiveSeason] = useState("2026-27");
  const [bulkText, setBulkText] = useState("");
  const [status, setStatus] = useState<string>(copy.paste);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    setStatus(copy.resolving);
    try {
      const response = await fetch("/api/admin/manual-card-editorial?action=bulk-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedClubId: clubId, effectiveSeason, text: bulkText }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Bulk preview failed.");
      setRows(payload.preview.rows ?? []);
      const counts = payload.preview.counts ?? {};
      setStatus(`${payload.preview.rowsReceived} ${copy.received} · ${counts.READY ?? 0} ${copy.ready} · ${(payload.preview.rowsReceived ?? 0) - (counts.READY ?? 0)} ${copy.requireReview}.`);
    } catch (error) {
      setRows([]);
      setStatus(error instanceof Error ? error.message : "Bulk preview failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-4 rounded-3xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.035] p-5">
    <div><p className="text-[10px] font-black text-[#caff6d]">{copy.bulkEyebrow}</p><h2 className="mt-1 text-2xl font-black italic text-white">{copy.bulkTitle}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{copy.bulkIntro}</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.club}<select value={clubId} onChange={(event) => setClubId(event.target.value)} className="h-10 rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white outline-none">{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label><label className="grid gap-2 text-[10px] font-black text-slate-300">{copy.season}<input value={effectiveSeason} onChange={(event) => setEffectiveSeason(event.target.value)} className="h-10 rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white outline-none" /></label></div>
    <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={8} placeholder={locale === "pt-BR" ? "Erling Haaland | 25 | 180000000\nPhil Foden | 26 | 100000000" : "Erling Haaland | 25 | 180000000\nPhil Foden | 26 | 100000000"} className="rounded-2xl border border-white/[.08] bg-black/30 p-3 font-mono text-xs text-white outline-none" />
    <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={preview} disabled={busy || !clubId} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-4 text-[10px] font-black text-[#d9ff96] disabled:opacity-50"><Search size={14} />{busy ? copy.validating : copy.validate}</button><p aria-live="polite" className="text-[10px] font-bold text-slate-500">{status}</p></div>
    {rows.length ? <div className="overflow-x-auto rounded-2xl border border-white/[.07]"><table className="min-w-full text-left text-[10px]"><thead className="bg-black/30 text-slate-500"><tr>{["Reference", "Age", "Canonical", "Position", "Value", "Tier", "Nominal price", "Status"].map((label) => <th key={label} className="px-3 py-2 font-black">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={String(row.rowNumber)} className="border-t border-white/[.06] text-slate-300"><td className="px-3 py-2">{String(row.referenceName ?? "")}</td><td className="px-3 py-2">{String(row.referenceAge ?? "—")}</td><td className="px-3 py-2">{String(row.canonicalName ?? "—")}</td><td className="px-3 py-2">{String(row.position ?? "—")}</td><td className="px-3 py-2">{row.marketValueEur === null ? "—" : `€${String(row.marketValueEur)}`}</td><td className="px-3 py-2">{String(row.calculatedTier ?? "—")}</td><td className="px-3 py-2">{row.nominalPriceGbp === null ? "—" : `£${String(row.nominalPriceGbp)}`}</td><td className="px-3 py-2 font-black text-[#caff6d]">{String(row.status ?? "")}</td></tr>)}</tbody></table></div> : null}
  </section>;
}

export function ManualCardEditorialHistory({ entries, locale = "en-GB" }: { entries: readonly { id: string; playerName: string; action: string; createdAt: string; canRevert: boolean }[]; locale?: ManualEditorialLocale }) {
  const copy = manualCopy(locale);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  async function revert(historyId: string) {
    setBusyId(historyId);
    setStatus(locale === "pt-BR" ? "Restaurando a versão anterior imutável selecionada…" : "Restoring the selected immutable prior version…");
    try {
      const response = await fetch("/api/admin/manual-card-editorial", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revert", historyId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Revert failed.");
      setStatus(locale === "pt-BR" ? "Restaurado. Recarregue para revisar o novo registro imutável de auditoria." : "Restored. Reload to review the new immutable audit entry.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Revert failed.");
    } finally {
      setBusyId(null);
    }
  }
  return <section className="rounded-3xl border border-white/[.08] bg-black/20 p-5"><p className="text-[10px] font-black text-cyan-300">{copy.historyEyebrow}</p><h2 className="mt-1 text-2xl font-black italic text-white">{copy.historyTitle}</h2><p className="mt-2 text-xs text-slate-400">{copy.historyIntro}</p><div className="mt-4 divide-y divide-white/[.06]">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-xs font-bold text-white">{entry.playerName}</p><p className="mt-1 text-[9px] font-bold text-slate-500">{entry.action} · {new Date(entry.createdAt).toLocaleString(locale)}</p></div>{entry.canRevert ? <button type="button" onClick={() => revert(entry.id)} disabled={busyId !== null} className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-2 text-[9px] font-black text-cyan-100 disabled:opacity-50">{busyId === entry.id ? copy.restoring : copy.restore}</button> : <p className="text-[9px] font-bold text-slate-500">{copy.noSnapshot}</p>}</div>)}{!entries.length ? <p className="py-5 text-xs text-slate-500">{copy.noHistory}</p> : null}</div>{status ? <p aria-live="polite" className="mt-3 text-[10px] font-bold text-slate-500">{status}</p> : null}</section>;
}
