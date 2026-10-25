import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

// CSS cascade/box-model regression only: real pitch component and full production
// styles, not proof of the authenticated XI, card sizes or Arena transition.
test("ClubOwner normal and Arena pitches fit their actual containing block without margin overflow", async t => {
  const fantasyCss = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/pitch/TouchlinePitchSurface.tsx",
    requiredSources: ["components/touchline/pitch/TouchlinePitchSurface.tsx"],
    mountScript: `flushSync(()=>root.render(React.createElement(loadEntry().default,{className:'myClubTacticalPitch',ariaLabel:'Pitch bounds review',orientation:'horizontal',surfaceVariant:'smoked-glass'})));`,
  });
  const css = `${bundle.css}\n${fantasyCss}`;
  const failures: unknown[] = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => route.abort());
      for (const viewport of [{ width: 844, height: 600 }, { width: 844, height: 390 }, { width: 900, height: 700 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport);
        for (const arena of [false, true]) {
          // Ancestor class structure matches FantasyGameweekClient. The React
          // root itself is the existing viewport, so no layout wrapper is added.
          const squad = `<section class="myClubSquad"><div class="arenaBody"><div class="arenaLiveRail"></div><div class="myClubPitchViewport" id="root"></div></div></section>`;
          const content = arena ? squad : `<div class="myClubCommandGrid">${squad}</div>`;
          await page.setContent(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0}*,*::before,*::after{box-sizing:border-box}${css}</style><div class="myClubCommand${arena ? " arenaOverlay" : ""}" data-fantasy-context="market">${content}</div>`);
          await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
          const geometry = await page.locator(".myClubTacticalPitch").evaluate(pitch => {
            const parent = pitch.parentElement!;
            const box = pitch.getBoundingClientRect();
            const container = parent.getBoundingClientRect();
            const style = getComputedStyle(pitch);
            const parentStyle = getComputedStyle(parent);
            const left = container.left + parent.clientLeft + parseFloat(parentStyle.paddingLeft);
            const available = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
            const right = left + available;
            const marginLeft = parseFloat(style.marginLeft), marginRight = parseFloat(style.marginRight);
            return { pitch: box.toJSON(), parent: container.toJSON(), left, right, available, marginLeft, marginRight,
              outerWidth: box.width + marginLeft + marginRight, transform: style.transform, ratio: style.aspectRatio,
              documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
          });
          const record = { browser: engine.name(), ...viewport, arena, ...geometry };
          t.diagnostic(JSON.stringify(record));
          if (geometry.outerWidth > geometry.available + 1 || geometry.pitch.left < geometry.left - 1 || geometry.pitch.right > geometry.right + 1) failures.push(record);
          assert.equal(geometry.transform, "none", "full cascade must already cancel obsolete miniature scaling");
          assert.ok(Math.abs(geometry.pitch.width / geometry.pitch.height - 105 / 68) < .003, "regulation pitch ratio stays intact");
          assert.equal(geometry.documentWidth <= geometry.viewportWidth, true, "no document horizontal overflow");
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  assert.equal(failures.length, 0, `Pitch margin-box exceeds its viewport: ${JSON.stringify(failures)}`);
});
