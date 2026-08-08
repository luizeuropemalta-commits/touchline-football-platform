import type { Metadata } from "next";

import { TouchlineComingSoonLanding } from "@/components/touchline/coming-soon/TouchlineComingSoonLanding";
import {
  resolveTouchLinePresentationLocale,
  type TouchLinePresentationLocale,
} from "@/lib/touchlineArena/root-locale";

type TouchLineComingSoonPageProps = {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
};

function comingSoonMetadata(locale: TouchLinePresentationLocale): Metadata {
  const isPortuguese = locale === "pt-BR";

  return {
    title: isPortuguese ? "TouchLine Arena — Em breve" : "TouchLine Arena — Coming soon",
    description: isPortuguese
      ? "TouchLine Arena está sendo preparada para entrar em campo."
      : "TouchLine Arena is being prepared to enter the pitch.",
    alternates: {
      canonical: `/coming-soon?lang=${locale}`,
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export async function generateMetadata({ searchParams }: TouchLineComingSoonPageProps): Promise<Metadata> {
  const params = await searchParams;
  return comingSoonMetadata(resolveTouchLinePresentationLocale(params.lang));
}

export default async function TouchLineComingSoonPage({ searchParams }: TouchLineComingSoonPageProps) {
  const params = await searchParams;
  const locale = resolveTouchLinePresentationLocale(params.lang);

  return <TouchlineComingSoonLanding locale={locale} />;
}
