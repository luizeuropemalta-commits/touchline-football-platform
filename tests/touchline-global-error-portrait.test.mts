import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { webkit } from "@playwright/test";
import { TOUCHLINE_PORTRAIT_QUERY } from "../lib/touchlineArena/orientation-gate.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const errorSource = readFileSync(new URL("../app/global-error.tsx", import.meta.url), "utf8");
const boundaryCss = readFileSync(new URL("../components/touchline/TouchlineLandscapeBoundary.module.css", import.meta.url), "utf8");

test("narrow desktop preview stays visible while touch-phone portrait keeps the gate", {
  skip: process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS !== "1",
}, async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    for (const hasTouch of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch, isMobile: hasTouch });
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\n${boundaryCss}</style><div data-touchline-orientation-root><div class="content"><button>ClubHub</button></div></div><div data-touchline-orientation-gate class="gate">Rotate</div>`);
      assert.equal(await page.evaluate(query => matchMedia(query).matches, TOUCHLINE_PORTRAIT_QUERY), hasTouch);
      assert.equal(await page.getByRole("button", {name:"ClubHub"}).isVisible(), !hasTouch);
      assert.equal(await page.getByText("Rotate", {exact:true}).isVisible(), hasTouch);
      if (!hasTouch) {
        await page.getByRole("button", {name:"ClubHub"}).focus();
        assert.equal(await page.getByRole("button", {name:"ClubHub"}).evaluate(el => el === document.activeElement), true);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("global error identifies its body so portrait gameplay rules cannot hide recovery", () => {
  assert.match(errorSource, /<body\s+data-touchline-global-error/);
});

test("mobile portrait shows a global error while normal gameplay remains behind the orientation gate", {
  skip: process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS !== "1",
}, async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div data-touchline-orientation-root>game</div><div data-touchline-orientation-gate>rotate</div><div data-unrelated-overlay>hidden overlay</div>`);
    assert.equal(await page.locator("[data-unrelated-overlay]").evaluate(el => getComputedStyle(el).display), "none");
    assert.notEqual(await page.locator("[data-touchline-orientation-gate]").evaluate(el => getComputedStyle(el).display), "none");

    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main data-touchline-global-error>Something went wrong</main>`);
    await page.locator("body").evaluate(el => el.setAttribute("data-touchline-global-error", "true"));
    assert.notEqual(await page.locator("main[data-touchline-global-error]").evaluate(el => getComputedStyle(el).display), "none");
    assert.equal(await page.getByText("Something went wrong").isVisible(), true);
  } finally {
    await browser.close();
  }
});
