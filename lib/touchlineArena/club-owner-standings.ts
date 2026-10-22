/** Public projection: database account identifiers never cross this boundary. */
export type ClubOwnerStanding = Readonly<{
  rank: number; name: string; touchlinePoints: number;
}>;
export function clubOwnerStandingsNote(locale: string): string {
  const copy: Record<string, string> = {
    "en-GB": "Finalized round points. Registered clubs without a finalized round start at 0.",
    "pt-BR": "Pontos de rodadas finalizadas. Inscritos sem rodada finalizada começam com 0.",
    "es-ES": "Puntos de jornadas finalizadas. Los clubes inscritos sin jornadas finalizadas empiezan con 0.",
    "it-IT": "Punti delle giornate concluse. I club iscritti senza giornate concluse iniziano da 0.",
    "fr-FR": "Points des journées terminées. Les clubs inscrits sans journée terminée commencent à 0.",
    "de-DE": "Punkte abgeschlossener Spieltage. Angemeldete Vereine ohne abgeschlossenen Spieltag starten bei 0.",
    "tr-TR": "Tamamlanan haftaların puanları. Tamamlanan haftası olmayan kayıtlı kulüpler 0 ile başlar.",
    "ar-SA": "نقاط الجولات المكتملة. تبدأ الأندية المسجلة دون جولة مكتملة من 0.",
  };
  return copy[locale] ?? copy["en-GB"];
}
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function joined(value: unknown): RecordValue | null {
  return record(Array.isArray(value) && value.length === 1 ? value[0] : value);
}
/** Existing competitive enrollment is user_gameweeks with a paid plan snapshot.
 * Missing scores mean no settled points yet; provisional scores never count.
 * Corrupt or duplicate inputs fail closed instead of publishing partial ranks. */
export function projectClubOwnerStandings(input: readonly unknown[], registrations: readonly unknown[] = [], now = Date.now()): ClubOwnerStanding[] | null {
  const totals = new Map<string, { name: string; cents: number }>();
  for (const value of registrations) {
    const row = record(value);
    const user = joined(row?.users);
    if (!row || typeof row.user_id !== "string" || !row.user_id || !user || totals.has(row.user_id)) return null;
    if (!["standard", "master", "vip"].includes(String(row.plan))) continue;
    if (!Array.isArray(user.touchline_fantasy_entitlements)) return null;
    const grants = user.touchline_fantasy_entitlements.map(record).filter(grant => grant?.entitlement_key === "fantasy_access");
    if (grants.length > 1) return null;
    const grant = grants[0];
    if (!grant || grant.status !== "active" || !["standard", "pro", "master", "vip"].includes(String(grant.plan_key))) continue;
    const start = grant.current_period_start === null ? -Infinity : Date.parse(String(grant.current_period_start));
    const end = grant.current_period_end === null ? Infinity : Date.parse(String(grant.current_period_end));
    if (!(start <= now && end > now)) continue;
    const name = (typeof user.full_name === "string" ? user.full_name.trim().slice(0, 160) : "") || "TouchLine Manager";
    totals.set(row.user_id, { name, cents: 0 });
  }
  const seen = new Set<string>();
  for (const value of input) {
    const row = record(value);
    if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id)
      || typeof row.user_id !== "string" || !row.user_id
      || !["standard", "pro", "master", "vip"].includes(String(row.market_plan_key_snapshot))) return null;
    seen.add(row.id);
    const user = joined(row.users);
    if (!user) return null;
    const name = (typeof user.full_name === "string" ? user.full_name.trim().slice(0, 160) : "") || "TouchLine Manager";
    const previous = totals.get(row.user_id);
    if (previous && previous.name !== name) return null;
    let cents = previous?.cents ?? 0;
    const score = joined(row.touchline_fantasy_user_gameweek_scores);
    if (row.touchline_fantasy_user_gameweek_scores != null && !score
      && !(Array.isArray(row.touchline_fantasy_user_gameweek_scores) && row.touchline_fantasy_user_gameweek_scores.length === 0)) return null;
    if (score) {
      if (score.settlement_status !== "FINAL" && score.settlement_status !== "PROVISIONAL") return null;
      const raw = score.gameweek_score;
      if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") return null;
      const amount = Number(raw);
      const amountCents = Math.round(amount * 100);
      if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(amountCents)
        || Math.abs(amount * 100 - amountCents) > 0.00001) return null;
      if (score.settlement_status === "FINAL") cents += amountCents;
    }
    if (!Number.isSafeInteger(cents)) return null;
    totals.set(row.user_id, { name, cents });
  }
  const sorted = [...totals].sort(([a, x], [b, y]) => y.cents - x.cents || x.name.localeCompare(y.name) || a.localeCompare(b));
  let rank = 0;
  return sorted.map(([, row], index) => {
    if (index === 0 || row.cents !== sorted[index - 1][1].cents) rank = index + 1;
    return { rank, name: row.name, touchlinePoints: row.cents / 100 };
  });
}
