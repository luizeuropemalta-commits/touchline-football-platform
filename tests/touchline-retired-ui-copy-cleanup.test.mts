import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { getTouchLineAuthCopy, touchLineAuthHref } from "../lib/touchlineArena/auth-i18n.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("account navigation no longer advertises the retired Arena while preserving active destinations", () => {
  const shell = source("components/arena-admin-shell.tsx");
  assert.doesNotMatch(shell, /"[^"\n]*\bArena\b[^"\n]*"|>\s*Arena\s*</);
  for (const path of ["/intro", "/notifications", "/inbox", "/football-search", "/admin"]) {
    assert.ok(shell.includes(`href: "${path}"`), path);
  }
  assert.ok(shell.includes('touchLineAuthHref("/intro", locale)'));
  assert.match(shell, /Conta ClubOwner/);
  assert.match(shell, /ClubOwner account/);
});

test("public authentication copy names TouchLine in both locales, including cinematic and recovery states", () => {
  function assertPublicValues(value: unknown, path: string) {
    if (typeof value === "string") assert.doesNotMatch(value, /\barena\b/i, path);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) assertPublicValues(child, `${path}.${key}`);
    }
  }
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const copy = getTouchLineAuthCopy(locale);
    const pt = locale === "pt-BR";
    assertPublicValues(copy, locale);
    assert.equal(copy.layout.arenaHome, pt ? "Início da TouchLine" : "TouchLine Home");
    assert.equal(`${copy.layout.cinematicTitleTop} ${copy.layout.cinematicTitleBottom}`, pt ? "Entre na TouchLine" : "Enter TouchLine");
    assert.equal(`${copy.layout.standardTitleTop} ${copy.layout.standardTitleBottom}`, pt ? "TouchLine Acesso" : "TouchLine Access");
    assert.equal(copy.layout.accessPanelTitle, pt ? "Entrar na TouchLine" : "Enter TouchLine");
    assert.equal(copy.layout.arenaLabel, pt ? "Mercado" : "Market");
    assert.equal(copy.layout.arenaValue, pt ? "JOGO" : "GAME");
    assert.doesNotMatch(copy.layout.arenaValue, /live|ao vivo|open|aberto/i);
    assert.equal(copy.login.eyebrow, pt ? "Acesso à TouchLine" : "TouchLine access");
    assert.equal(copy.login.title, pt ? "Entre na TouchLine" : "Enter TouchLine");
    assert.equal(copy.register.title, pt ? "Criar acesso à TouchLine" : "Create TouchLine access");
    assert.match(copy.layout.cinematicDescription, /ClubOwner/);
    assert.match(copy.layout.onboardingEyebrow, /ClubOwner/);
    for (const message of [copy.form.registrationCompleteHint, copy.form.emailNotConfirmed, copy.form.profileSetupFailed, copy.form.welcomeUnavailable, copy.reset.description]) {
      assert.match(message, /TouchLine/);
    }
    assert.equal(copy.form.enterArena, pt ? "Entrar na TouchLine" : "Enter TouchLine");
    assert.equal(touchLineAuthHref("/intro", locale), `/intro?lang=${locale}`);
  }
});

test("cinematic, standard and conditional auth consumers retain their existing copy keys and official logo", () => {
  const layout = source("components/auth-layout.tsx");
  for (const suffix of ["TitleTop", "TitleBottom", "Description"]) {
    assert.ok(layout.includes(`cinematic ? copy.cinematic${suffix} : copy.standard${suffix}`), suffix);
  }
  assert.match(layout, /cinematic \? copy\.onboardingTitle : copy\.accessPanelTitle/);
  assert.match(layout, /copy\.arenaHome/);
  assert.match(layout, /<Logo href=\{brandHref \?\? publicArenaHref\} officialArena/);
  const form = source("components/auth-form.tsx");
  for (const key of ["registrationCompleteHint", "emailNotConfirmed", "profileSetupFailed", "welcomeUnavailable"]) assert.ok(form.includes(`copy.${key}`), key);
  assert.match(source("components/reset-password-form.tsx"), /copy\.enterArena/);
  const logo = source("components/logo.tsx");
  assert.doesNotMatch(logo, /Arena Touchline|TouchLine Arena/);
  assert.match(logo, /subtitle = "TouchLine"/);
  assert.match(logo, /text-cyan-100"\}>\{subtitle\}<\/span>/);
  assert.match(logo, /href = "\/intro"/);
  assert.match(logo, /officialArena \? \(/);
  assert.match(logo, /src=\{TOUCHLINE_ARENA_OFFICIAL_LOGO\}/);
});

test("Inbox labels identify the actual localized Market destination without renaming ClubOwner", () => {
  const inbox = source("app/(app)/inbox/page.tsx");
  assert.match(inbox, /back: "Voltar ao ClubOwner"/);
  assert.match(inbox, /back: "Back to ClubOwner"/);
  assert.doesNotMatch(inbox, /Voltar à Arena|Back to Arena/);
  assert.ok(inbox.includes('href={`/clubowner?lang=${encodeURIComponent(locale)}`}'));
  assert.match(inbox, /title: "Inbox do ClubOwner"/);
  assert.match(inbox, /title: "ClubOwner Inbox"/);
});

test("authentication aside uses TouchLine branding while retaining the canonical intro destination", () => {
  const layout = source("components/auth-layout.tsx");
  assert.match(layout, /<p className="text-\[11px\] font-black text-cyan-200\/80">TouchLine<\/p>/);
  assert.doesNotMatch(layout, />TouchLine Arena<\/p>/);
  assert.ok(layout.includes('touchLineAuthHref("/intro", normalizedLocale, siteLocalesEnabled)'));
});

test("only the orphan ComingSoon component is retired; intro implementation and compatibility remain", () => {
  assert.equal(existsSync(new URL("../components/touchline/coming-soon/TouchlineComingSoonLanding.tsx", import.meta.url)), false);
  for (const path of [
    "components/touchline/arena/TouchlineArenaIntro.tsx",
    "components/touchline/arena/TouchlineGameEntry.tsx",
    "components/touchline/arena/touchline-arena-intro.module.css",
    "lib/touchlineArena/arena-intro.ts",
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  assert.ok(source("app/coming-soon/page.tsx").includes('redirect(`/intro?lang=${encodeURIComponent(locale)}`)'));
  assert.match(source("app/arena/page.tsx"), /redirect\(`\/intro\?/);
  assert.match(source("app/manifest.ts"), /id: "\/arena"/);
});

test("retired team presentations and their private styles have no remaining runtime references", () => {
  for (const path of [
    "components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx",
    "components/touchline/fantasy/TouchlineGameweekTeamSnapshot.module.css",
    "components/touchline/market/TouchlineSquadBuilderStage.tsx",
    "components/touchline/market/TouchlineSquadBuilderStage.module.css",
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);

  function inspectRuntimeDirectory(relativePath: string) {
    for (const entry of readdirSync(new URL(`../${relativePath}/`, import.meta.url), { withFileTypes: true })) {
      const path = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) inspectRuntimeDirectory(path);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name)) {
        assert.doesNotMatch(source(path), /TouchlineGameweekTeamSnapshot|TouchlineSquadBuilderStage|TouchlineComingSoonLanding/, path);
      }
    }
  }
  for (const root of ["app", "components", "lib"]) inspectRuntimeDirectory(root);
  for (const path of [
    "app/fantasy/FantasyGameweekClient.tsx",
    "app/fantasy/fantasy.module.css",
    "app/fantasy/TouchlinePositionPicker.tsx",
    "components/touchline/fantasy/TouchlineGameweekCard.tsx",
    "components/touchline/pitch/TouchlinePitchSurface.tsx",
    "components/touchline/pitch/TouchlinePitchSurface.module.css",
    "components/touchline/cards/TouchlineGoalFacingPitchCard.tsx",
    "lib/touchlineArena/squad-rules.ts",
    "lib/touchlineFantasy/arena-lineup.ts",
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
});
