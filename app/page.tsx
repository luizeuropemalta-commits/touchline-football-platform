import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TouchlinePublicLaunchGate } from "@/components/touchline/coming-soon/TouchlinePublicLaunchGate";
import { resolveTouchLineRequestHostname } from "@/lib/server/touchline-host-routing";
import {
  resolveTouchlinePublicLaunchGate,
  TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY,
} from "@/lib/touchlineArena/public-launch-gate";
import {
  resolveTouchLinePresentationLocale,
  resolveTouchLineRootLocale,
} from "@/lib/touchlineArena/root-locale";

type HomePageProps = {
  searchParams: Promise<{
    lang?: string | string[];
    launchPreview?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const locale = resolveTouchLineRootLocale(params.lang);
  const launchLocale = resolveTouchLinePresentationLocale(params.lang);
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
    return <TouchlinePublicLaunchGate locale={launchLocale} mode={launchGate.mode} />;
  }

  redirect(`/arena?lang=${encodeURIComponent(locale)}`);
}
