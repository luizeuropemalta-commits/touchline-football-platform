import { parseCoachRankingDiagnostic } from "@/lib/football-data/coach-reconciliation-diagnostic";

export function CoachSyncDiagnostic({ value, locale }: { value: unknown; locale: "pt-BR" | "en-GB" }) {
  const diagnostic = parseCoachRankingDiagnostic(value);
  if (!diagnostic) return null;
  const portuguese = locale === "pt-BR";
  const messages = {
    "season-unavailable": ["Temporada dos treinadores não confirmada", "Coach season not confirmed"],
    "fixture-attribution-pending": ["Treinador de uma partida ainda não confirmado", "A fixture coach is not confirmed yet"],
    "coach-editorial-identity-pending": ["Ranking dos treinadores aguarda revisão do catálogo", "Coach ranking awaits catalogue review"],
    "fixture-results-unavailable": ["Resultados necessários ao ranking indisponíveis", "Required ranking results are unavailable"],
    "ranking-unconfirmed": ["Motivo do bloqueio do ranking não confirmado", "Ranking blockage reason not confirmed"],
    "reconciliation-unconfirmed": ["Atualização dos treinadores não confirmada", "Coach update not confirmed"],
  } as const;
  return <section className="mt-3 rounded-xl border border-amber-300/25 p-3 text-xs text-amber-100"
    aria-label={portuguese ? "Diagnóstico dos treinadores" : "Coach diagnostic"}>
    <h3 className="font-bold">{messages[diagnostic.reason][portuguese ? 0 : 1]}</h3>
    {diagnostic.reason === "coach-editorial-identity-pending" ? <>
      <p className="mt-2 leading-5">{portuguese
        ? "A atribuição das partidas foi recebida, mas há identidade de treinador ainda não aprovada no catálogo. Revise a fonte oficial antes de publicar."
        : "Fixture attribution was received, but a coach identity has not yet been approved in the catalogue. Review the official source before publishing."}</p>
      {diagnostic.pendingCoachCount !== null ? <p className="mt-2">{portuguese ? "Identidades pendentes" : "Pending identities"}: {diagnostic.pendingCoachCount}</p> : null}
      <a className="mt-3 inline-block underline" href={`/admin/coaches?lang=${locale}`}>{portuguese ? "Abrir catálogo de técnicos" : "Open coach catalogue"}</a>
    </> : <p className="mt-2 leading-5">{portuguese
      ? "Confira os registros protegidos desta execução. Esta indicação não autoriza alterar pontos nem publicar dados incompletos."
      : "Review the protected records for this run. This diagnostic does not authorize changing points or publishing incomplete data."}</p>}
    {diagnostic.pendingFixtureCount !== null && diagnostic.pendingFixtureCount > 0
      ? <p className="mt-2">{portuguese ? "Partidas pendentes" : "Pending fixtures"}: {diagnostic.pendingFixtureCount}</p> : null}
  </section>;
}
