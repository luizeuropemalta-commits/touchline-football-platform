import ArenaClient from "@/app/arena/ArenaClient";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Quick Substitution visual QA",
  robots: { index: false, follow: false },
};

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string; scenario?: string }>>;
}>;

/**
 * Local-only visual proof of the actual standalone Quick Substitution UI.
 * The injected XI and nine substitutes are static demo data; no account,
 * roster, market, provider, or persistence is used as acceptance evidence.
 */
export default async function QuickSubstitutionReadinessVisualQaPage({ searchParams }: VisualQaPageProps) {
  const params = await searchParams;
  const locale = resolveTouchlineVisualQaLocale(params.lang);
  const isSetupScenario = params.scenario === "setup";
  return (
    <div data-quick-substitution-readiness-fixture={isSetupScenario ? "setup" : "ready"} lang={locale}>
      <ArenaClient
        initialLocale={locale}
        initialIntroIntent="skip"
        standalonePanel="bench"
        initialDemoLineup={!isSetupScenario}
        initialEmptyLineup={isSetupScenario}
      />
    </div>
  );
}
