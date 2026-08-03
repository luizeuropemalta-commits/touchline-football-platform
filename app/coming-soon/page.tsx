import type { Metadata } from "next";

import { TouchlineComingSoonLanding } from "@/components/touchline/coming-soon/TouchlineComingSoonLanding";

export const metadata: Metadata = {
  title: "TouchLine Arena — Em breve",
  description: "TouchLine Arena está sendo preparada para entrar em campo.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type TouchLineComingSoonPageProps = {
  searchParams: Promise<{
    lang?: string;
  }>;
};

export default async function TouchLineComingSoonPage({ searchParams }: TouchLineComingSoonPageProps) {
  const { lang } = await searchParams;
  return <TouchlineComingSoonLanding locale={lang} />;
}
