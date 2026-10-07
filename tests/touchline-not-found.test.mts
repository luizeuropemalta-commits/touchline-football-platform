import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchlinePublicErrorCopy } from "../lib/touchlineArena/public-error-i18n.ts";

const page = readFileSync(new URL("../app/not-found.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/touchline/TouchlineNotFound.tsx", import.meta.url), "utf8");

test("the global not-found boundary uses the TouchLine safe navigation surface", () => {
  assert.match(page, /<Suspense fallback=\{null\}>/);
  assert.match(page, /<TouchlineNotFound/);
  assert.match(renderer, /useSearchParams\(\)/);
  assert.match(renderer, /resolveTouchlineCatalogueLocale\(searchParams\.get\("lang"\), draftLocalesEnabled\)/);
  assert.match(renderer, /draftLocalesEnabled = false/);
  assert.match(renderer, /export default function TouchlineNotFound\(\) \{\s*return <NotFoundContent \/>;/);
  assert.match(renderer, /<main dir="ltr"/);
  assert.match(renderer, /TouchlineGlobalNavigation/);
  assert.match(renderer, /currentRoute="notFound"/);
  assert.match(renderer, /surface="public"/);
  // The real consumer SSR is exercised in touchline-public-error-i18n.test.
  assert.match(renderer, /const copy = getTouchlinePublicErrorCopy\(locale, draftLocalesEnabled\)\.notFound/);
  assert.match(renderer, /\{copy\.description\}/);
  assert.equal(getTouchlinePublicErrorCopy("pt-BR").notFound.description,
    "O endereço pode ter mudado ou não existir. Nenhum dado do seu clube foi alterado.");
  assert.equal(getTouchlinePublicErrorCopy("en-GB").notFound.description,
    "The address may have changed or may not exist. No club data was changed.");
});
