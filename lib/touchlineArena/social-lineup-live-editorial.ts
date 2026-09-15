import { assessSocialLineupLiveReference, type SocialLineupLiveReference } from "./social-lineup-live-contract.ts";

/** Private retrospective copy. It cannot label a historical lineup as upcoming. */
export function socialLineupLiveEditorial(reference: SocialLineupLiveReference, clubs: {
  club: { teamId: string; name: string }; home: { teamId: string; name: string }; away: { teamId: string; name: string };
}, now = Date.now()) {
  const gate = assessSocialLineupLiveReference(reference, now);
  if (!gate.reviewable || clubs.club.teamId !== reference.teamId || clubs.home.teamId !== reference.homeTeamId
    || clubs.away.teamId !== reference.awayTeamId || [clubs.club, clubs.home, clubs.away].some(c => !c.name.trim())) throw new Error("LINEUP_EDITORIAL_SOURCE_INVALID");
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(reference.startsAt));
  const body = [
    `⚽ ${clubs.club.name} · escalação da rodada ${reference.gameweekNumber}`,
    `${clubs.home.name} ${reference.score.home} x ${reference.score.away} ${clubs.away.name} · ${date}`,
    "",
    `Relembre os 11 titulares e os 9 reservas relacionados por ${reference.coach.name}.`,
    reference.formationAgreement ? `Formação: ${reference.formation}.` : `Posicionamento do provedor: ${reference.formation}; o relato do clube registra ${reference.officialReportFormation}. Revisão de formação pendente.`,
    "",
    "Monte seu XI na TouchLine e acompanhe cada rodada com o seu elenco.",
  ].join("\n");
  return {
    captions: { INSTAGRAM: `${body}\n\n#TouchLine #PremierLeague`, FACEBOOK: body },
    dispatch: {
      artId: "LINEUP", mode: "RETROSPECTIVE_VISUAL_REVIEW", enabled: false, outbound: "DISABLED",
      editorialSchedule: null, suggestedAt: null, scheduleRule: "OWNER_SCHEDULE_AFTER_NEW_CONFIRMED_LINEUP",
      observedAt: reference.firstObservedAt, providerPublishedAt: reference.providerPublishedAt,
      destinations: ["INSTAGRAM", "FACEBOOK"].flatMap(platform => ["FEED", "STORY"].map(placement => ({ platform, placement, accountId: null, selected: false, artworkApproved: false, captionApproved: false }))),
      internal: { type: "SUBJECT_CLUB", providerTeamIds: [reference.teamId], selected: false, state: "PENDING_OWNER_APPROVAL" },
      rules: ["This historical sample is never an upcoming-lineup notification.", "A new confirmed XI creates a fixture/team/revision instance; schedule only after confirmation.", "Never infer provider publication time from first observation.", "Destination/account/placement/instance deduplication; reconcile uncertain attempts before retry.", "Independent Feed and Story two-loop approval plus formation reconciliation required."],
      publishable: false,
    },
  };
}
