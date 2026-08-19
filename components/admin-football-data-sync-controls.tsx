"use client";

import { useState } from "react";

type SyncResponse = {
  ok?: boolean;
  status?: string;
  fixturesFetched?: number;
  fixturesStored?: number;
  resourceCount?: number;
  enrichmentCount?: number;
  errors?: string[];
  error?: string;
};

const OPENING_ROUND_WINDOW = {
  fromDate: "2026-08-21",
  throughDate: "2026-08-24",
};

export function FootballDataSyncControls() {
  const [state, setState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function syncOpeningRound() {
    setState("syncing");
    setMessage("Reading the verified Sportmonks Premier League schedule…");

    try {
      const params = new URLSearchParams({
        scope: "fixture_schedule",
        competitionId: "8",
        ...OPENING_ROUND_WINDOW,
      });
      const response = await fetch(`/api/football-data/sync-starter?${params.toString()}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const result = await response.json() as SyncResponse;

      if (!response.ok || !result.ok) {
        const detail = result.errors?.filter(Boolean).join(" ") || result.error || "The official schedule could not be synchronized.";
        throw new Error(detail);
      }

      setState("success");
      setMessage(`${result.fixturesStored ?? 0} verified fixtures stored from ${result.fixturesFetched ?? 0} provider fixtures. Refreshing the control room…`);
      window.setTimeout(() => window.location.reload(), 1_200);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The official schedule could not be synchronized.");
    }
  }

  async function syncCapabilities() {
    setState("syncing");
    setMessage("Reading the active Sportmonks subscription capabilities…");

    try {
      const params = new URLSearchParams({ scope: "capabilities" });
      const response = await fetch(`/api/football-data/sync-starter?${params.toString()}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const result = await response.json() as SyncResponse;
      if (!response.ok || !result.ok) {
        const detail = result.errors?.filter(Boolean).join(" ") || result.error || "The subscription capability check failed.";
        throw new Error(detail);
      }

      setState("success");
      setMessage(`${result.resourceCount ?? 0} resources and ${result.enrichmentCount ?? 0} enrichments recorded from the active subscription.`);
      window.setTimeout(() => window.location.reload(), 1_200);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The subscription capability check failed.");
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.045] p-5">
      <p className="text-[9px] font-black text-[#c6ff62]">QA owner action · official fixture source</p>
      <h2 className="mt-2 text-xl font-black italic text-white">Load the Premier League opening round</h2>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300/75">
        Imports only verified Sportmonks fixtures for 21–24 August 2026 into the QA database. Existing verified fixtures are upserted; no fixture is deleted and no score, lineup or card is simulated.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={syncCapabilities}
          disabled={state === "syncing"}
          className="rounded-2xl border border-cyan-300/30 bg-cyan-300/[.08] px-4 py-3 text-[10px] font-black text-cyan-100 transition hover:bg-cyan-300/[.14] disabled:cursor-wait disabled:opacity-60"
        >
          {state === "syncing" ? "Checking active plan…" : "Check active plan"}
        </button>
        <button
          type="button"
          onClick={syncOpeningRound}
          disabled={state === "syncing"}
          className="rounded-2xl bg-[#a3ff12] px-4 py-3 text-[10px] font-black text-black transition hover:bg-[#c6ff62] disabled:cursor-wait disabled:opacity-60"
        >
          {state === "syncing" ? "Synchronizing official fixtures…" : "Sync official fixtures"}
        </button>
        {message ? (
          <p className={state === "error" ? "text-xs font-bold text-rose-200" : "text-xs font-bold text-slate-300"} role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
