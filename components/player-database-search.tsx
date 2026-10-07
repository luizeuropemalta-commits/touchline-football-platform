"use client";

import { ShieldCheck } from "lucide-react";
import { getTouchlineFootballSearchCopy } from "@/lib/touchlineArena/football-search-i18n";

/**
 * Public-facing notice for the temporary editorial card programme.
 *
 * Cards are deliberately not generated from a player search or a valuation.
 * The editorial team publishes one canonical-player profile at a time through
 * the server-side catalogue, so this component must remain data-free.
 */
export function PlayerDatabaseSearch({
  mode = "full",
  locale = "en-GB",
  draftLocalesEnabled = false,
}: {
  mode?: "full" | "compact";
  locale?: string;
  draftLocalesEnabled?: boolean;
}) {
  const compact = mode === "compact";
  const copy = getTouchlineFootballSearchCopy(locale, draftLocalesEnabled);

  return (
    <section
      data-touchline-editorial-card-notice="true"
      className={compact
        ? "rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-3 py-2 text-[#e9ffc3]"
        : "rounded-3xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] p-4 text-[#e9ffc3]"}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck aria-hidden="true" size={compact ? 15 : 18} className="mt-0.5 shrink-0 text-[#caff72]" />
        <div>
          <strong className={compact ? "text-[10px] font-black" : "text-xs font-black"}>{copy.editorialTitle}</strong>
          {!compact ? <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-300">{copy.editorialDescription}</p> : null}
        </div>
      </div>
    </section>
  );
}
