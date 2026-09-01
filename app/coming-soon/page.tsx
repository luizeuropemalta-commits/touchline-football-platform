import { redirect } from "next/navigation";
import { resolveTouchLineRootLocale } from "@/lib/touchlineArena/root-locale";

type TouchLineComingSoonPageProps = {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
};

export default async function TouchLineComingSoonPage({ searchParams }: TouchLineComingSoonPageProps) {
  const params = await searchParams;
  const locale = resolveTouchLineRootLocale(params.lang);
  redirect(`/arena?lang=${encodeURIComponent(locale)}`);
}
