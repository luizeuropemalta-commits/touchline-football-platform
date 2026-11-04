import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as geometry from "../lib/touchlineArena/formation-geometry.ts";
import { verifiedTimestampLabel } from "../lib/touchlineArena/verified-timestamp-label.ts";

const files = ["components/admin-manual-card-editorial-actions.tsx", "components/touchline/admin/FormationCalibrationStudio.tsx"] as const;
const compiled = files.map(file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText);

// Real history components and timestamp helper render through React SSR.
// Presentation-only boundaries avoid mounting cards or contacting an account.
// This compares initial markup under both host zones; it is not a browser hydration run.
function load(index: number) {
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  runInNewContext(compiled[index], { exports, Intl, Date, require(name: string) {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "@/lib/touchlineArena/verified-timestamp-label") return { verifiedTimestampLabel };
    if (name === "@/lib/touchlineArena/formation-geometry") return geometry;
    if (name === "next/navigation") return { useRouter: () => ({ refresh() { throw Error("No router mutation in SSR regression"); } }) };
    if (name === "next/image" || name.includes("TouchlineEliteExactCard")) return { __esModule: true, default: () => null };
    if (name.includes("TouchlinePitchSurface")) return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "lucide-react") return { Check: () => null, Eye: () => null, Search: () => null, X: () => null, CheckCircle2: () => null, RotateCcw: () => null, Save: () => null, ShieldCheck: () => null };
    throw Error(`Unexpected history dependency: ${name}`);
  } });
  return exports;
}
const ManualHistory = load(0).ManualCardEditorialHistory;
const FormationHistory = load(1).default;
const instants = ["2026-01-01T23:30:00Z", "2026-07-01T23:30:00Z", "2026-10-25T01:30:00Z", "2026-11-03T18:12:35.123456+00:00"];
const labels = ["2026-01-02 00:30", "2026-07-02 01:30", "2026-10-25 02:30", "2026-11-03 19:12"];

function renderHistories(locale: "pt-BR" | "en-GB", values = instants) {
  const manual = renderToStaticMarkup(React.createElement(ManualHistory, { locale, entries: values.map((createdAt, i) => ({
    id: `synthetic-${i}`, playerName: `Player ${i}`, action: "published", createdAt, canRevert: i % 2 === 0,
  })) }));
  const formation = renderToStaticMarkup(React.createElement(FormationHistory, { locale, registry: geometry.TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
    history: values.map((publishedAt, i) => ({ id: `synthetic-${i}`, formationCode: "4-3-3", geometryVersion: i + 1,
      status: i === 0 ? "published" : "superseded", changeReason: `Synthetic revision ${i}`, publishedAt, rollbackOfVersion: null })) }));
  return { manual, formation };
}

for (const locale of ["pt-BR", "en-GB"] as const) test(`admin history ${locale}: UTC and Europe/Malta hosts produce identical initial markup`, () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const utcControl = new Date(instants[0]).toLocaleString(locale);
    const server = renderHistories(locale);
    process.env.TZ = "Europe/Malta";
    const maltaControl = new Date(instants[0]).toLocaleString(locale);
    assert.notEqual(maltaControl, utcControl, "regression must exercise genuinely different host timezones");
    const client = renderHistories(locale);
    assert.deepEqual(client, server, "local host timezone must never alter initial history markup");
    for (const html of Object.values(client)) for (const [i, label] of labels.entries()) {
      assert.ok(html.includes(`<time dateTime="${instants[i]}">${label}</time>`), label);
    }
    assert.match(client.manual, locale === "pt-BR" ? /Histórico/ : /History/);
    assert.match(client.formation, locale === "pt-BR" ? /Calibração de Formações/ : /Formation Calibration/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("invalid history instants render the canonical unavailable label without a host-dependent fallback", () => {
  for (const html of Object.values(renderHistories("pt-BR", ["not-a-timestamp"]))) {
    assert.ok(html.includes('<time dateTime="not-a-timestamp">—</time>'));
    assert.doesNotMatch(html, /Invalid Date|NaN/);
  }
});
