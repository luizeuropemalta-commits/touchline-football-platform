import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const label = arg("label");
if (!label || !/^[a-z0-9-]{1,32}$/.test(label)) throw new Error("SAFE_NEW_LABEL_REQUIRED");
const url = new URL(arg("base-url"));
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol !== "http:") throw new Error("LOCAL_URL_REQUIRED");
const directory = resolve("artifacts/social-studio/events", `watch-isolation-${label}`);
const tracePath = resolve(".next/dev/trace");
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readTrace = async () => {
  const bytes = await readFile(tracePath);
  const events = bytes.toString("utf8").split("\n").flatMap(line => {
    try { return JSON.parse(line); } catch { return []; }
  });
  return { sha256: hash(bytes), bytes: bytes.length, events };
};
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [], consoleHmr = [], socketHmr = [];
let hmrSocketSeen = false, measurementStart = Infinity;
page.on("pageerror", error => errors.push({ at: Date.now(), message: error.message }));
page.on("console", message => {
  if (message.type() === "error") errors.push({ at: Date.now(), message: message.text() });
  if (/Fast Refresh|rebuilding|full reload/i.test(message.text())) consoleHmr.push({ at: Date.now(), message: message.text() });
});
page.on("websocket", socket => {
  if (!socket.url().includes("webpack-hmr")) return;
  hmrSocketSeen = true;
  socket.on("framereceived", event => {
    let payload;
    try { payload = JSON.parse(String(event.payload)); } catch { return; }
    const action = payload.action ?? payload.type;
    if (["building", "built", "reloadPage", "serverComponentChanges"].includes(action)) socketHmr.push({ at: Date.now(), action });
  });
});
try {
  const route = new URL("/visual-qa/social-events-live?artId=HAT_TRICK_HERO&placement=STORY", url);
  const response = await page.goto(route.href, { waitUntil: "networkidle", timeout: 20000 });
  assert.equal(response?.status(), 200);
  await page.locator("[data-events-live-ready='true']").waitFor({ state: "visible" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  // A short quiet baseline separates page/bootstrap compilation from the probe write.
  await page.waitForTimeout(2000);
  const traceBefore = await readTrace();
  measurementStart = Date.now();
  await mkdir(directory, { recursive: false });
  const probePath = join(directory, "technical-write.txt");
  const probeBytes = Buffer.from("TECHNICAL WATCH ISOLATION PROBE. NOT AN ARTWORK. NOT FOOTBALL DATA.\n");
  await writeFile(probePath, probeBytes, { flag: "wx" });
  await page.waitForTimeout(4500);
  const measurementEnd = Date.now();
  const traceAfter = await readTrace();
  const invalidations = traceAfter.events.filter(event => event.startTime >= measurementStart && event.startTime <= measurementEnd
    && ["webpack-invalidated-client", "webpack-compilation", "client-hmr-latency", "client-full-reload"].includes(event.name))
    .map(event => ({ name: event.name, startTime: event.startTime, tags: event.tags }));
  const observedConsole = consoleHmr.filter(event => event.at >= measurementStart);
  const observedSocket = socketHmr.filter(event => event.at >= measurementStart);
  const observedErrors = errors.filter(event => event.at >= measurementStart);
  const overlayCount = await page.locator('nextjs-portal [data-nextjs-dialog], nextjs-portal [role="dialog"], nextjs-portal [role="alert"]').count();
  const report = { label, route: route.href, directory, probePath, probeChecksum: hash(probeBytes),
    measurementStart: new Date(measurementStart).toISOString(), measurementEnd: new Date(measurementEnd).toISOString(),
    observationMs: measurementEnd - measurementStart, hmrSocketSeen, consoleHmr: observedConsole, socketHmr: observedSocket,
    invalidations, browserErrors: observedErrors, overlayCount,
    trace: { path: tracePath, before: { sha256: traceBefore.sha256, bytes: traceBefore.bytes }, after: { sha256: traceAfter.sha256, bytes: traceAfter.bytes } },
    stylesheetChecksum: hash(await readFile(resolve("app/globals.css"))),
    passed: hmrSocketSeen && invalidations.length === 0 && observedConsole.length === 0 && observedSocket.length === 0 && observedErrors.length === 0 && overlayCount === 0,
    publishable: false };
  // Reporting happens after the measured window and is never counted as its evidence.
  await writeFile(join(directory, "watch-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally { await browser.close(); }
