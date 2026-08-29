import type { Metadata } from "next";
import { headers } from "next/headers";

import { TouchlineComingSoonLanding } from "@/components/touchline/coming-soon/TouchlineComingSoonLanding";
import { TouchlinePublicLaunchGate } from "@/components/touchline/coming-soon/TouchlinePublicLaunchGate";
import { resolveTouchLineRequestHostname } from "@/lib/server/touchline-host-routing";
import {
  resolveTouchlinePublicLaunchGate,
  TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY,
} from "@/lib/touchlineArena/public-launch-gate";
import {
  resolveTouchLinePresentationLocale,
  type TouchLinePresentationLocale,
} from "@/lib/touchlineArena/root-locale";

type TouchLineComingSoonPageProps = {
  searchParams: Promise<{
    lang?: string | string[];
    launchPreview?: string | string[];
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
  const requestHeaders = await headers();
  const locale = resolveTouchLinePresentationLocale(params.lang);
  const launchGate = resolveTouchlinePublicLaunchGate({
    previewOptIn: Array.isArray(params[TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY])
      ? params[TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY][0]
      : params[TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY],
    requestHostname: resolveTouchLineRequestHostname(
      requestHeaders.get("x-forwarded-host"),
      requestHeaders.get("host"),
      "",
    ),
  });

  if (launchGate.active) {
    return <TouchlinePublicLaunchGate locale={locale} mode={launchGate.mode} />;
  }

  return <TouchlineComingSoonLanding locale={locale} />;
}
