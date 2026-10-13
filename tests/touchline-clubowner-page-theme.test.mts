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
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { await browser.close(); }
  }
});
