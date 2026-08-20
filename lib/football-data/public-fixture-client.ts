import type { TouchlinePublicFixture, TouchlinePublicTeam } from "./public-fixture";

const PROVIDER_ID = /^[1-9]\d{0,19}$/;

function optionalText(value: unknown, maxLength: number) {
  return value === undefined
    || (typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength);
}

function optionalProviderId(value: unknown) {
  return value === undefined
    || (typeof value === "string" && PROVIDER_ID.test(value.trim()));
}

function optionalScore(value: unknown) {
  return value === undefined
    || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

export function isTouchlinePublicTeam(value: unknown): value is TouchlinePublicTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const team = value as Partial<TouchlinePublicTeam> & Record<string, unknown>;
  return typeof team.id === "string"
    && typeof team.providerId === "string"
    && PROVIDER_ID.test(team.providerId.trim())
    && team.id === team.providerId
    && typeof team.name === "string"
    && Boolean(team.name.trim())
    && team.name.length <= 160
    && optionalText(team.shortCode, 16)
    && optionalText(team.logoUrl, 2_048)
    && !("provider" in team)
    && !("source" in team);
}

export function isTouchlinePublicFixture(value: unknown): value is TouchlinePublicFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<TouchlinePublicFixture> & Record<string, unknown>;
  return typeof fixture.id === "string"
    && typeof fixture.providerId === "string"
    && PROVIDER_ID.test(fixture.providerId.trim())
    && fixture.id === fixture.providerId
    && optionalText(fixture.name, 320)
    && (fixture.startsAt === undefined
      || (typeof fixture.startsAt === "string" && Number.isFinite(Date.parse(fixture.startsAt))))
    && optionalText(fixture.status, 80)
    && optionalProviderId(fixture.competitionId)
    && optionalProviderId(fixture.seasonId)
    && optionalProviderId(fixture.roundId)
    && optionalText(fixture.roundName, 80)
    && isTouchlinePublicTeam(fixture.homeTeam)
    && isTouchlinePublicTeam(fixture.awayTeam)
    && fixture.homeTeam.providerId !== fixture.awayTeam.providerId
    && optionalScore(fixture.homeScore)
    && optionalScore(fixture.awayScore)
    && (fixture.verifiedAt === undefined
      || (typeof fixture.verifiedAt === "string" && Number.isFinite(Date.parse(fixture.verifiedAt))))
    && !("provider" in fixture)
    && !("source" in fixture);
}

export function parseTouchlinePublicFixtures(value: unknown): TouchlinePublicFixture[] | null {
  return Array.isArray(value) && value.every(isTouchlinePublicFixture)
    ? value
    : null;
}
