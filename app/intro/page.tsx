import TouchlineGameEntry from "@/components/touchline/arena/TouchlineGameEntry";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { parseTouchlineArenaIntroIntent } from "@/lib/touchlineArena/arena-intro";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";

type IntroPageProps = {
  searchParams: Promise<{ lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] }>;
};

export default async function IntroPage(props: IntroPageProps) {
  return renderIntroPage(props, isTouchLineSiteLocalesEnabled("/intro"));
}

async function renderIntroPage({ searchParams }: IntroPageProps, draftLocalesEnabled = false) {
  const params = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  return <TouchlineGameEntry locale={resolveTouchlineCatalogueLocale(first(params.lang), draftLocalesEnabled)} draftLocalesEnabled={draftLocalesEnabled}
    initialIntroIntent={parseTouchlineArenaIntroIntent({ intro: first(params.intro), skipIntro: first(params.skipIntro) })} />;
}
