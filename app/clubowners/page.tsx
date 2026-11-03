import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The separate ClubOwners portal was retired. Language stays in the global selector. */
export default async function ClubOwnersPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const { lang } = await searchParams;
  const locale = Array.isArray(lang) ? lang[0] : lang;
  redirect(`/clubowner${typeof locale === "string" ? `?lang=${encodeURIComponent(locale)}` : ""}`);
}
