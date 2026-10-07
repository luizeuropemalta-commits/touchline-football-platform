import { redirect } from "next/navigation";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { resolveTouchLineRootLocale } from "@/lib/touchlineArena/root-locale";

type HomePageProps = {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = resolveTouchLineRootLocale(params.lang, isTouchLineSiteLocalesEnabled("/"));

  redirect(`/intro?lang=${encodeURIComponent(locale)}`);
}
