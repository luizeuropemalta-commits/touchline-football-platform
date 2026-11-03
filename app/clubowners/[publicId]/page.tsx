import type { Metadata } from "next";
import ClubOwnerPublicProfile from "@/components/touchline/social/ClubOwnerPublicProfile";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { parsePublicOwnerProfile, peopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { handlePublicOwners } from "@/lib/touchlineArena/clubowner-public-handler";
import { publicOwnerDependencies } from "@/lib/touchlineArena/clubowner-public-server";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import styles from "@/components/touchline/social/ClubOwnerPublic.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ClubOwner · TouchLine", robots: { index: false, follow: false } };
export default async function PublicClubOwnerPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ lang?: string | string[] }> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const draftLocalesEnabled = isTouchLineSiteLocalesEnabled("/clubowner");
  const locale = resolveTouchlineCatalogueLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang, draftLocalesEnabled);
  const deps = publicOwnerDependencies();
  const accountLocaleContext = await loadAccountLocaleContext();
  const response = await handlePublicOwners(new Request("https://touchline.local/api/touchline/clubowners?include=standing"), "profile", deps, route.publicId);
  const data = await response.json();
  const profile = response.ok ? parsePublicOwnerProfile(data.profile) : null;
  return <main className={styles.shell} lang={locale}>
    <TouchlineBrandHeader href={`/clubowner?lang=${encodeURIComponent(locale)}`} locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled}
      navigation={<TouchlineGlobalNavigation locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="market" surface={accountLocaleContext.mode === "account" ? "authenticated" : "public"} showAudioControl={false} />} />
    <div className={styles.content}>
      <ClubOwnerPublicProfile key={route.publicId} locale={peopleLocale(locale)} publicId={route.publicId} enabled={deps.enabled} initial={{ status: response.status, profile }} />
    </div>
  </main>;
}
