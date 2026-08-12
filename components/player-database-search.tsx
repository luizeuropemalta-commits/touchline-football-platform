"use client";

import { ShieldCheck } from "lucide-react";

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
}: {
  mode?: "full" | "compact";
  locale?: "en-GB" | "pt-BR";
}) {
  const compact = mode === "compact";
  const copy = locale === "pt-BR"
    ? {
      title: "Cards geridos pela equipa editorial",
      description: "Cada card é publicado manualmente, jogador por jogador, depois de revisão editorial.",
    }
    : {
      title: "Cards are managed by the editorial team",
      description: "Each card is published manually, one player at a time, after editorial review.",
    };

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
          <strong className={compact ? "text-[10px] font-black" : "text-xs font-black"}>{copy.title}</strong>
          {!compact ? <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-300">{copy.description}</p> : null}
        </div>
      </div>
    </section>
  );
}
