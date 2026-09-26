import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchLineAuthCopy, touchLineAuthHref } from "../lib/touchlineArena/auth-i18n.ts";

test("entry logo and Arena Home return to Arena, preserving the selected language", () => {
  const source = readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
  assert.match(source, /const publicArenaHref = touchLineAuthHref\("\/arena", normalizedLocale\)/);
  assert.match(source, /<Logo href=\{publicArenaHref\}/);
  assert.match(source, /<Link href=\{publicArenaHref\}/);
  for (const locale of ["pt-BR", "en-GB"] as const) {
    const url = new URL(touchLineAuthHref("/arena", locale), "https://touchline.test");
    assert.equal(url.pathname, "/arena");
    assert.equal(url.searchParams.get("lang"), locale);
  }
});

test("global entrance uses the owner-approved name and readable team copy", () => {
  const logo = readFileSync(new URL("../components/logo.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /title: "Arena Touchline"/);
  assert.match(logo, />Arena Touchline</);
  assert.doesNotMatch(logo, /Arena \/ TouchLine England/);
  assert.equal(getTouchLineAuthCopy("pt-BR").login.description, "Entre para montar seu time e acessar a Arena Touchline.");
  assert.match(login, /text-sm font-medium leading-6 text-slate-200/);
});

test("root declares smooth scrolling so route restoration does not animate unexpectedly", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<html[^>]*data-scroll-behavior="smooth"/);
});
