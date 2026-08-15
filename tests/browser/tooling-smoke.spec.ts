import { expect, test } from "@playwright/test";

test("captures browser, viewport, input, failure, motion, and screenshot evidence", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("https://touchline.invalid/tooling-smoke", (route) => route.abort("failed"));
  await page.setContent(`
    <style>
      button { transform: translateY(0); }
      button:hover { transform: translateY(-2px); }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    </style>
    <main>
      <button type="button">TouchLine browser smoke</button>
      <output id="network">idle</output>
      <output id="keyboard">inactive</output>
    </main>
    <script>
      document.querySelector("button").addEventListener("click", () => {
        document.querySelector("#keyboard").textContent = "keyboard-activated";
      });
      fetch("https://touchline.invalid/tooling-smoke")
        .catch(() => { document.querySelector("#network").textContent = "network-failure-observed"; });
    </script>
  `);

  const button = page.getByRole("button", { name: "TouchLine browser smoke" });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("keyboard-activated")).toBeVisible();
  await expect(page.getByText("network-failure-observed")).toBeVisible();

  const expectedViewport = testInfo.project.use.viewport;
  expect(page.viewportSize()).toEqual(expectedViewport);

  const shouldReduceMotion = testInfo.project.name === "chromium-reduced-motion";
  await page.emulateMedia({ reducedMotion: shouldReduceMotion ? "reduce" : "no-preference" });
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(reduced).toBe(shouldReduceMotion);

  const screenshot = await page.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1_000);
  expect(
    consoleErrors.filter(
      (message) => !/Failed to load resource|Load failed|Cross-Origin Request Blocked|CORS request did not succeed/i.test(message),
    ),
  ).toEqual([]);
});
