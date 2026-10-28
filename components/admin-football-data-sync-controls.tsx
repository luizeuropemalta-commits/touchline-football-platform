"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Action = "live" | "scores" | "rosters" | "countries" | "capabilities";
type Outcome = { ok?: boolean; status?: string; fixturesUpdated?: number; issueCount?: number; runId?: string };

export function FootballDataSyncControls({ locale = "en-GB", allowQaMaintenance = false }: {
  locale?: "pt-BR" | "en-GB"; allowQaMaintenance?: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const pt = locale === "pt-BR";
  const t = (portuguese: string, english: string) => pt ? portuguese : english;
  const labels: Record<Action, string> = {
    live: t("Atualizar jogos e notas", "Update fixtures and ratings"),
    scores: t("Recalcular pontos com dados salvos", "Recalculate points from stored data"),
    rosters: t("Conferir os 20 elencos de QA", "Reconcile 20 QA squads"),
    countries: t("Conferir nacionalidades em QA", "Reconcile QA nationalities"),
    capabilities: t("Verificar recursos do fornecedor", "Check provider capabilities"),
  };

  async function run(action: Action) {
    if (busy.current || (!allowQaMaintenance && action !== "live" && action !== "scores")) return;
    busy.current = true;
    setPending(action); setFailed(false);
    setMessage(t("Conferindo os dados. Aguarde a confirmação…", "Checking data. Please wait for confirmation…"));
    try {
      const scopes = { rosters: "qa_twenty_club_roster_sync", countries: "qa_country_sync", capabilities: "capabilities" };
      const endpoint = action === "live" ? "/api/admin/football-data/sync"
        : action === "scores" ? "/api/football-data/player-season-statistics/sync"
          : `/api/football-data/sync-starter?${new URLSearchParams({ scope: scopes[action], runId: crypto.randomUUID() })}`;
      const response = await fetch(endpoint, {
        method: "POST", headers: { Accept: "application/json" }, credentials: "same-origin",
        cache: "no-store", signal: AbortSignal.timeout(310_000),
      });
      const result = await response.json() as Outcome;
      const confirmedPartial = action === "live" && response.status === 502 && result.status === "partial"
        && typeof result.runId === "string" && result.runId.length > 0;
      if ((!response.ok || result.ok !== true) && !confirmedPartial) throw new Error("NOT_CONFIRMED");
      const partial = result.status === "partial" || (result.issueCount ?? 0) > 0;
      setFailed(partial);
      setMessage(result.status === "skipped"
        ? t("Nenhuma nova execução iniciada. O processo respeitou o intervalo ou uma atualização já em andamento.", "No new run started. The process respected its interval or an update already in progress.")
        : partial
          ? t("Atualização parcial. Confira o histórico antes de repetir.", "Partial update. Check the history before retrying.")
          : action === "live"
            ? t(`${result.fixturesUpdated ?? 0} jogos atualizados. Confira o resultado no histórico abaixo.`, `${result.fixturesUpdated ?? 0} fixtures updated. Check the outcome in the history below.`)
            : t("Operação confirmada. Os dados do painel serão atualizados.", "Operation confirmed. The panel data will refresh."));
      router.refresh();
    } catch {
      setFailed(true);
      setMessage(t("Atualização não confirmada. Confira o histórico: o processo pode continuar no servidor. Não há repetição automática.", "Update not confirmed. Check the history: the process may continue on the server. No automatic retry."));
    } finally {
      busy.current = false; setPending(null);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.045] p-5" aria-labelledby="football-sync-title">
      <h2 id="football-sync-title" className="text-xl font-black text-white">{t("Sincronização de jogos e notas", "Fixture and rating synchronization")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300/75">
        {t("Consulta a fonte oficial e verifica correções após os jogos pelo mesmo processo automático. Atualizar esses dados não exige novo deploy.", "Checks the official source and post-match corrections through the same automatic pipeline. Refreshing this data requires no new deployment.")}
      </p>
      <Button className="mt-4 h-auto min-h-11 whitespace-normal py-3 text-center" disabled={pending !== null} aria-busy={pending === "live"} onClick={() => void run("live")}>
        {pending === "live" ? t("Atualizando…", "Updating…") : labels.live}
      </Button>
      <details className="mt-5 border-t border-white/10 pt-4">
        <summary className="cursor-pointer py-2 text-sm font-bold text-slate-300">{t("Manutenção de dados", "Data maintenance")}</summary>
        <p className="mt-2 text-sm leading-6 text-slate-400">{t("Recalcular usa os dados já salvos; não consulta novas notas. A atualização principal acima consulta o fornecedor.", "Recalculation uses stored data; it does not fetch new ratings. The main update above checks the provider.")}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {(["scores", ...(allowQaMaintenance ? ["rosters", "countries", "capabilities"] : [])] as Action[]).map(action => (
            <Button key={action} variant="secondary" className="h-auto min-h-11 whitespace-normal py-3 text-center" disabled={pending !== null} aria-busy={pending === action} onClick={() => void run(action)}>
              {pending === action ? t("Processando…", "Processing…") : labels[action]}
            </Button>
          ))}
        </div>
      </details>
      <p className={`mt-4 min-h-6 text-sm leading-6 ${failed ? "text-amber-200" : "text-slate-300"}`} role="status" aria-live="polite">{message}</p>
    </section>
  );
}
