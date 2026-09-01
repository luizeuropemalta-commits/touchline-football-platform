import { redirect } from "next/navigation";
import { resolveTouchLineRootLocale } from "@/lib/touchlineArena/root-locale";

type HomePageProps = {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = resolveTouchLineRootLocale(params.lang);

  redirect(`/arena?lang=${encodeURIComponent(locale)}`);
}
