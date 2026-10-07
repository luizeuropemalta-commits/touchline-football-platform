import assert from "node:assert/strict";
import test from "node:test";

// Notification copy has its own exact input contract. Public site locale
// gates must not silently turn a requested notification language into English.
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const eventKinds = [
  "goal", "own-goal", "red-card", "match-start", "half-time", "second-half", "full-time",
  "penalty-awarded", "penalty-confirmed", "penalty-missed", "penalty-converted",
  "var-review", "goal-disallowed", "penalty-cancelled", "var-goal-confirmed",
  "official-lineup", "lineup-reminder", "crown", "golden-boot",
] as const;

type NotificationCopy = {
  brand: string;
  eventLabels: Record<(typeof eventKinds)[number], string>;
  reminders: { title: string; missing_xi: string; complete_unconfirmed: string };
  match: { titleTemplate: string; bodyTemplate: string };
  actions: { openMatch: string; openLineup: string; openRankings: string; close: string };
};
type CopyModule = { getTouchlineNotificationCopy: (locale: unknown) => NotificationCopy | null };
const moduleUrl = new URL("../lib/touchlineArena/notification-i18n.ts", import.meta.url);

async function getCopy(locale: unknown) {
  // Absence of the module is an intended RED, never a skipped requirement.
  const catalogue = await import(moduleUrl.href) as CopyModule;
  assert.equal(typeof catalogue.getTouchlineNotificationCopy, "function");
  return catalogue.getTouchlineNotificationCopy(locale);
}

function tokens(template: string) {
  return [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

function nonemptyStrings(value: unknown, path: string) {
  if (typeof value === "string") {
    assert.ok(value.trim().length > 0, `${path}: empty copy`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b/, path);
    assert.doesNotMatch(value, /\[(?:translate|missing)\]/i, path);
    return;
  }
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path}: unexpected value`);
  for (const [key, child] of Object.entries(value)) nonemptyStrings(child, `${path}.${key}`);
}

for (const locale of locales) {
  test(`${locale}: all approved notification copy exists with identical keys, factual placeholders and TouchLine branding`, async () => {
    const copy = await getCopy(locale);
    assert.ok(copy, locale);
    assert.deepEqual(Object.keys(copy).sort(), ["actions", "brand", "eventLabels", "match", "reminders"]);
    assert.deepEqual(Object.keys(copy.eventLabels).sort(), [...eventKinds].sort());
    assert.equal(Object.keys(copy.eventLabels).length, 19);
    assert.deepEqual(Object.keys(copy.reminders).sort(), ["complete_unconfirmed", "missing_xi", "title"]);
    assert.deepEqual(Object.keys(copy.match).sort(), ["bodyTemplate", "titleTemplate"]);
    assert.deepEqual(Object.keys(copy.actions).sort(), ["close", "openLineup", "openMatch", "openRankings"]);
    nonemptyStrings(copy, locale);
    assert.equal(copy.brand, "TouchLine");
    assert.notEqual(copy.reminders.missing_xi, copy.reminders.complete_unconfirmed, `${locale}: readiness distinction lost`);
    assert.notEqual(copy.eventLabels.goal, copy.eventLabels["own-goal"]);
    assert.notEqual(copy.eventLabels["penalty-awarded"], copy.eventLabels["penalty-confirmed"]);
    assert.notEqual(copy.eventLabels["penalty-missed"], copy.eventLabels["penalty-converted"]);
    assert.notEqual(copy.eventLabels["goal-disallowed"], copy.eventLabels["var-goal-confirmed"]);
    assert.notEqual(copy.eventLabels.crown, copy.eventLabels["golden-boot"]);
    assert.equal(Object.hasOwn(copy.eventLabels, "yellow-card"), false);
    assert.equal(Object.hasOwn(copy.eventLabels, "yellowcard"), false);
    assert.deepEqual(tokens(copy.match.titleTemplate), ["away", "home"]);
    assert.deepEqual(tokens(copy.match.bodyTemplate), ["awayScore", "event", "homeScore", "minute", "player"]);
    assert.equal(copy.match.titleTemplate.replace("{home}", "Bodø/Glimt").replace("{away}", "İstanbul Başakşehir"),
      "Bodø/Glimt - İstanbul Başakşehir");
    assert.doesNotMatch(copy.match.bodyTemplate, /\{(?:rating|matchRating|ratingLabel|points|touchlinePoints)\}/);
    // No football fact, identifier, numerical score or rating is fabricated by
    // this dictionary. Real event eligibility and formatting remain separate.
  });
}

test("unknown and nonexact notification locales fail closed without English fallback", async () => {
  for (const locale of [undefined, null, "", "en", "pt", "es", "ar", "EN-GB", "pt-br", " en-GB", "en-GB ",
    "nl-NL", 0, true, {}, ["en-GB"], { locale: "en-GB" }, { toString: () => "en-GB" }]) {
    assert.equal(await getCopy(locale), null);
  }
});

test("English and Portuguese use the approved compact reminders and league-top-scorer wording", async () => {
  const english = await getCopy("en-GB");
  const portuguese = await getCopy("pt-BR");
  assert.ok(english && portuguese);
  assert.equal(english.eventLabels["golden-boot"], "Top scorer");
  assert.equal(portuguese.eventLabels["golden-boot"], "Artilheiro da liga");
  assert.deepEqual(english.reminders, {
    title: "Your team is waiting", missing_xi: "Build your lineup", complete_unconfirmed: "Confirm your lineup",
  });
  assert.deepEqual(portuguese.reminders, {
    title: "Seu time está esperando", missing_xi: "Monte sua escalação", complete_unconfirmed: "Confirme sua escalação",
  });
  assert.doesNotMatch(english.match.bodyTemplate, /rating|points/i);
  assert.doesNotMatch(portuguese.match.bodyTemplate, /nota|pontos/i);
});

test("all six additional languages have their own goal labels instead of sharing an English fallback", async () => {
  const expected = { "es-ES": "gol", "it-IT": "gol", "fr-FR": "but", "ar-SA": "هدف", "tr-TR": "gol", "de-DE": "tor" };
  for (const [locale, goal] of Object.entries(expected)) {
    const copy = await getCopy(locale);
    assert.ok(copy);
    assert.equal(copy.eventLabels.goal.toLocaleLowerCase(locale), goal);
  }
});

test("Arabic has Arabic event, readiness and action text while retaining product and factual template tokens", async () => {
  const copy = await getCopy("ar-SA");
  assert.ok(copy);
  for (const [key, label] of Object.entries(copy.eventLabels)) assert.match(label, /[\u0600-\u06ff]/, key);
  for (const text of [...Object.values(copy.reminders), ...Object.values(copy.actions)]) assert.match(text, /[\u0600-\u06ff]/);
  assert.equal(copy.brand, "TouchLine");
  assert.equal(copy.match.titleTemplate, "{home} - {away}");
  assert.deepEqual(tokens(copy.match.bodyTemplate), ["awayScore", "event", "homeScore", "minute", "player"]);
  // Actual RTL layout, notification transport and latest-account-choice reads
  // are not proven by a pure catalogue test.
});
