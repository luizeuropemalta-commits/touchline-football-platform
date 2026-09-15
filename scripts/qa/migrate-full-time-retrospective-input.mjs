import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const value = name => process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = process.cwd();
const privateRoot = resolve(root, "artifacts/social-studio/events");
const sourcePath = resolve(root, value("input") ?? "artifacts/social-studio/events/render-inputs-20260915.json");
const outputPath = resolve(root, value("output") ?? "artifacts/social-studio/events/render-inputs-20260915-full-time-v1.json");
if (!sourcePath.startsWith(`${privateRoot}/`) || !outputPath.startsWith(`${privateRoot}/`)) throw new Error("PRIVATE_STUDIO_PATH_REQUIRED");

const dateLabel = startsAt => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London",
}).format(new Date(startsAt));
const tier = card => String(card?.calculated_tier ?? "").trim();

const inputs = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(inputs)) throw new Error("RENDER_INPUT_ARRAY_REQUIRED");
const migrated = inputs.map(input => {
  if (input.artId !== "FULL_TIME") return input;
  const card = input.factualData?.cardPublication;
  const fullTimeTier = tier(card);
  const facts = {
    schema: "touchline-studio-full-time-v1",
    fixture: {
      providerFixtureId: String(input.evidence?.providerFixtureId ?? ""),
      status: "FULL_TIME",
      displayDate: dateLabel(input.evidence?.startsAt),
      gameweekNumber: input.gameweekNumber,
      score: input.finalScore,
      venue: input.venue,
    },
    home: { providerTeamId: input.home.teamId, name: input.home.name, logoUrl: input.home.logoUrl, accent: input.home.accent },
    away: { providerTeamId: input.away.teamId, name: input.away.name, logoUrl: input.away.logoUrl, accent: input.away.accent },
    goals: input.goals.map(goal => ({ id: goal.id, providerTeamId: goal.teamId, playerName: goal.playerName, minute: goal.minute, extraMinute: goal.extraMinute, kind: goal.kind })),
    featured: {
      canonicalPlayerId: String(input.playerCard.canonicalPlayerId ?? ""),
      providerPlayerId: String(input.playerCard.sportmonksPlayerId ?? ""),
      providerTeamId: input.playerClub.teamId,
      officialMatchRating: input.matchRating,
      card: {
        name: input.playerCard.name,
        shirtNumber: input.playerCard.shirtNumber ?? null,
        clubName: input.playerCard.clubName,
        tierKey: fullTimeTier,
        cardTemplateUrl: input.playerCard.cardTemplateUrl,
        marketValue: input.playerCard.marketValue ?? null,
        seasonTotalRating: input.playerCard.totalRating ?? null,
        stats: {
          goals: input.playerCard.seasonStats?.goals ?? null,
          assists: input.playerCard.seasonStats?.assists ?? null,
          defense: input.playerCard.seasonStats?.defense ?? null,
          yellowcards: input.playerCard.seasonStats?.yellowCards ?? null,
        },
      },
    },
  };
  if (!facts.fixture.providerFixtureId || !facts.featured.canonicalPlayerId || !facts.featured.providerPlayerId
    || !facts.featured.card.tierKey || !facts.featured.card.cardTemplateUrl
    || !Number.isFinite(Date.parse(input.evidence?.startsAt))) throw new Error("FULL_TIME_LEGACY_FACTS_INCOMPLETE");
  return { ...input, fullTime: facts };
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(migrated, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ state: "RETROSPECTIVE_FULL_TIME_INPUT_MIGRATED_NON_PUBLISHABLE", outputPath }));
