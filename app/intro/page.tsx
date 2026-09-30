import TouchlineGameEntry from "@/components/touchline/arena/TouchlineGameEntry";
import { parseTouchlineArenaIntroIntent } from "@/lib/touchlineArena/arena-intro";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export default async function IntroPage({ searchParams }: {
  searchParams: Promise<{ lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] }>;
}) {
  const params = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  return <TouchlineGameEntry locale={normalizeTouchLineLocale(first(params.lang))}
    initialIntroIntent={parseTouchlineArenaIntroIntent({ intro: first(params.intro), skipIntro: first(params.skipIntro) })} />;
}
