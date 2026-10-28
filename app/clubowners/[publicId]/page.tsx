import Link from "next/link";
import type { Metadata } from "next";
import ClubOwnerPublicProfile from "@/components/touchline/social/ClubOwnerPublicProfile";
import { parsePublicOwnerProfile, peopleCopy, peopleLocale, publicOwnerHref } from "@/lib/touchlineArena/clubowner-public-contract";
import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "@/components/touchline/social/ClubOwnerPublic.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ClubOwner · TouchLine", robots: { index: false, follow: false } };
export default async function PublicClubOwnerPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ lang?: string | string[] }> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const locale = peopleLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang), copy = peopleCopy(locale);
  const deps = publicOwnerDependencies();
  const response = await handlePublicOwners(new Request("https://touchline.local/api/touchline/clubowners"), "profile", deps, route.publicId);
  const data = await response.json();
  const profile = response.ok ? parsePublicOwnerProfile(data.profile) : null;
  return <main className={styles.shell} lang={locale}><div className={styles.content}>
    <nav className={styles.navigation} aria-label="TouchLine">
      <Link className={controls.link} href={`/clubowners?lang=${locale}`}>{copy.back}</Link>
      <Link className={controls.link} href={`/clubowner?lang=${locale}`}>{copy.myClub}</Link>
      <Link className={controls.link} href={publicOwnerHref(route.publicId, "pt-BR")} lang="pt-BR" aria-current={locale === "pt-BR" ? "page" : undefined}>Português</Link>
      <Link className={controls.link} href={publicOwnerHref(route.publicId, "en-GB")} lang="en-GB" aria-current={locale === "en-GB" ? "page" : undefined}>English</Link>
    </nav>
    <ClubOwnerPublicProfile key={route.publicId} locale={locale} publicId={route.publicId} enabled={deps.enabled} initial={{ status: response.status, profile }} />
  </div></main>;
}
