import Link from "next/link";
import type { Metadata } from "next";
import ClubOwnerPublicDirectory from "@/components/touchline/social/ClubOwnerPublicDirectory";
import { peopleCopy, peopleLocale, parseOwnPublicOwner } from "@/lib/touchlineArena/clubowner-public-contract";
import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "@/components/touchline/social/ClubOwnerPublic.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ClubOwners · TouchLine", robots: { index: false, follow: false } };
export default async function ClubOwnersPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const params = await searchParams, locale = peopleLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang), copy = peopleCopy(locale);
  const deps = publicOwnerDependencies();
  // Invoke the same authorized read contract without an internal HTTP round trip.
  const response = await handlePublicOwners(new Request("https://touchline.local/api/account/public-profile"), "own", deps);
  const data = await response.json();
  const profile = response.ok ? parseOwnPublicOwner(data.profile) : null;
  return <main className={styles.shell} lang={locale}><div className={styles.content}>
    <nav className={styles.navigation} aria-label="TouchLine">
      <Link className={controls.link} href={`/clubowner?lang=${locale}`}>{copy.myClub}</Link>
      <Link className={controls.link} href="/clubowners?lang=pt-BR" lang="pt-BR" aria-current={locale === "pt-BR" ? "page" : undefined}>Português</Link>
      <Link className={controls.link} href="/clubowners?lang=en-GB" lang="en-GB" aria-current={locale === "en-GB" ? "page" : undefined}>English</Link>
    </nav>
    <h1 className="sr-only">{copy.title}</h1>
    <ClubOwnerPublicDirectory locale={locale} enabled={deps.enabled} photoSharingEnabled={deps.photoEnabled === true && data.photoSharingAllowed === true} initialOwn={{ status: response.status, profile }} />
  </div></main>;
}
