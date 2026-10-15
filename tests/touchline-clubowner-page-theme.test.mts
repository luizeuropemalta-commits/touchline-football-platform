import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The React selector has its own interaction coverage. This regression uses
// the real page + Fantasy CSS to prove the sibling cascade and its boundaries.
test("ClubOwner plan themes reach sibling Market panels without recoloring cards or other routes", {
  skip: process.env.TOUCHLINE_RUN_PLAN_BROWSER_TESTS !== "1",
  timeout: 60_000,
}, async () => {
  const { chromium, webkit } = await import("@playwright/test");
  const css = ["../app/clubowner/market-game.module.css", "../app/fantasy/fantasy.module.css"]
    .map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  const panels = ["myClubMarket", "technicalArea", "myClubSetup", "myClubGameweekFooter"];
  const market = (context: string, id: string) => `<section id="${id}" class="myClubCommand" data-fantasy-context="${context}" data-plan-theme="vip">
    ${panels.map(name => `<section class="${name}">Panel</section>`).join("")}
    <div class="myClubMarketResults"><article data-market-tier-frame="rare" style="--tier-accent:#75bbff"><span>Player card</span></article></div>
    <div class="myClubTacticalPitch">Pitch</div>
    <div class="myClubCommandStatus"><strong>500M</strong></div>
    <button class="viewToggle">TouchLine control</button>
  </section>`;
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [1440, 844]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.setContent(`<!doctype html><style>*{box-sizing:border-box}${css}</style>
          <main class="page"><div class="content"><header data-clubowner-header="true" data-plan-preview="vip"></header>${market("market", "customer-market")}</div></main>
          ${market("my-club", "other-route")}`);
        const unchanged = () => page.evaluate(() => {
          const signature = (selector: string) => {
            const element = document.querySelector(selector)!;
            const style = getComputedStyle(element);
            return [style.color, style.borderColor, style.backgroundImage, style.boxShadow, style.getPropertyValue("--tier-accent")];
          };
          return {
            card: signature("#customer-market [data-market-tier-frame]"),
            pitch: signature("#customer-market .myClubTacticalPitch"),
            money: signature("#customer-market .myClubCommandStatus strong"),
            control: signature("#customer-market .viewToggle"),
            otherRoute: signature("#other-route .myClubMarket"),
          };
        });
        const before = await unchanged();
        for (const [tier, rgb] of [["beta", "203, 67, 79"], ["standard", "65, 139, 226"], ["pro", "190, 157, 82"], ["master", "111, 191, 143"], ["vip", "162, 116, 206"]]) {
          await page.locator("[data-clubowner-header]").evaluate((element, selected) => { element.setAttribute("data-plan-preview", selected); }, tier);
          const actual = await page.locator("#customer-market").evaluate((marketElement, names) => names.map(name => {
            const style = getComputedStyle(marketElement.querySelector(`.${name}`)!);
            return { name, border: style.borderTopColor, shadow: style.boxShadow, transition: style.transitionDuration };
          }), panels);
          for (const panel of actual) {
            assert.equal(panel.border, "rgb(126, 191, 42)", `${tier}/${panel.name}: TouchLine border remains green`);
            assert.ok(panel.shadow.includes(`rgba(${rgb}, 0.64)`), `${tier}/${panel.name}: sibling panel uses viewed plan`);
            assert.equal(panel.transition, "0s", "reduced motion avoids a color transition");
          }
          assert.deepEqual(await unchanged(), before, `${tier}: protected artwork and other route stay unchanged`);
          assert.equal(await page.locator("#customer-market").getAttribute("data-plan-theme"), "vip", "preview leaves the server entitlement attribute intact");
        }
        await page.locator("main.page").evaluate(element => { (element as HTMLElement).style.minHeight = "3000px"; });
        for (const scrollY of [1200, 600, 0]) {
          await page.evaluate(y => window.scrollTo(0, y), scrollY);
          const canvas = await page.locator("main.page").evaluate(element => {
            const style = getComputedStyle(element, "::before");
            return { position: style.position, top: style.top, bottom: style.bottom, pointerEvents: style.pointerEvents, background: style.backgroundImage };
          });
          assert.equal(canvas.position, "fixed");
          assert.equal(canvas.top, "0px");
          assert.equal(canvas.bottom, "0px");
          assert.equal(canvas.pointerEvents, "none");
          assert.ok(canvas.background.includes("radial-gradient"));
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { await browser.close(); }
  }
});

test("ClubOwner uses the same two-light page canvas composition as ClubHub", () => {
  const clubHub = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const clubOwner = readFileSync(new URL("../app/clubowner/market-game.module.css", import.meta.url), "utf8");
  assert.match(clubHub, /radial-gradient\(circle at 16% 18%/);
  assert.match(clubHub, /radial-gradient\(circle at 84% 14%/);
  assert.match(clubHub, /linear-gradient\(135deg, #020707 0%, #06110d 44%, #030503 100%\)/);
  assert.match(clubOwner, /radial-gradient\(circle at 16% 18%, rgba\(var\(--clubowner-rgb\), \.28\), transparent 26%\)/);
  assert.match(clubOwner, /radial-gradient\(circle at 84% 14%, rgba\(var\(--clubowner-secondary-rgb\), \.18\), transparent 22%\)/);
  assert.match(clubOwner, /linear-gradient\(135deg, #020707 0%, #06110d 44%, #030503 100%\)/);
  assert.match(clubOwner, /\.page::before\s*\{[^}]*position: fixed;[^}]*inset: 0;[^}]*pointer-events: none;/);
  assert.doesNotMatch(clubOwner, /background-attachment: fixed/);
  for (const tier of ["beta", "standard", "pro", "master", "vip"]) {
    assert.match(clubOwner, new RegExp(`data-plan-preview="${tier}"\\]\\) \\{ --clubowner-rgb: [^;]+; --clubowner-secondary-rgb:`));
  }
});
