import Link from "next/link";
import TouchlineNavigationLabel from "./TouchlineNavigationLabel";
import { AuthAmbientAudio } from "@/components/auth-ambient-audio";
import {
  Activity,
  BarChart3,
  Goal,
  MoreHorizontal,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import {
  isTouchlineGlobalNavigationCurrent,
  resolveTouchlineGlobalNavigationItems,
  touchlineGlobalNavigationArenaHref,
  type TouchlineGlobalNavigationItemKey,
  type TouchlineGlobalNavigationRoute,
  type TouchlineGlobalNavigationSurface,
  type TouchlineTrustedNavigationContext,
} from "@/lib/touchlineArena/global-navigation";
import { resolveTouchLinePresentationLocale } from "@/lib/touchlineArena/root-locale";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import {
  getTouchlineNavigationCopy,
  type TouchlineNavigationCopy,
} from "@/lib/touchlineArena/navigation-i18n";

import styles from "./TouchlineGlobalNavigation.module.css";

type Props = Readonly<{
  locale: string;
  currentRoute: TouchlineGlobalNavigationRoute;
  surface: TouchlineGlobalNavigationSurface;
  /**
   * Only server/canonical page data may be supplied here. This component never
   * derives a contextual club link from a query parameter or visual fallback.
   */
  trustedContext?: TouchlineTrustedNavigationContext;
  className?: string;
  draftLocalesEnabled?: boolean;
  showAudioControl?: boolean;
}>;

const navigationIcons: Record<TouchlineGlobalNavigationItemKey, LucideIcon> = {
  clubHub: Shield,
  live: Activity,
  rankings: BarChart3,
  myClub: UserRound,
};

function labelFor(
  key: TouchlineGlobalNavigationItemKey,
  dictionary: TouchlineNavigationCopy,
  hasTrustedClubContext: boolean,
) {
  if (key === "clubHub") return hasTrustedClubContext ? dictionary.allClubs : dictionary.clubHub;
  return dictionary[key];
}

function NavigationLink({
  item,
  dictionary,
  currentRoute,
  hasTrustedClubContext,
  className,
}: {
  item: ReturnType<typeof resolveTouchlineGlobalNavigationItems>[number];
  dictionary: TouchlineNavigationCopy;
  currentRoute: TouchlineGlobalNavigationRoute;
  hasTrustedClubContext: boolean;
  className?: string;
}) {
  const Icon = navigationIcons[item.key];
  const isCurrent = isTouchlineGlobalNavigationCurrent(currentRoute, item.key);

  return (
    <Link
      href={item.href}
      className={className}
      aria-current={isCurrent ? "page" : undefined}
      data-touchline-navigation-key={item.key}
    >
      <Icon aria-hidden="true" />
      <TouchlineNavigationLabel
        label={labelFor(item.key, dictionary, hasTrustedClubContext)}
        pendingLabel={`${dictionary.opening}…`}
      />
    </Link>
  );
}

/**
 * Shared general navigation for public TouchLine surfaces. The prominent Arena
 * return is deliberately separate from the fixed general menu.
 */
export default function TouchlineGlobalNavigation({
  locale,
  currentRoute,
  surface,
  trustedContext,
  className,
  draftLocalesEnabled = false,
  showAudioControl = true,
}: Props) {
  // Only an explicit coordinated opt-in carries draft locales into links.
  // Destination pages continue to own their independent public release gates.
  const effectiveLocale = resolveTouchLinePresentationLocale(locale, draftLocalesEnabled);
  const copyLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const dictionary = getTouchlineNavigationCopy(copyLocale, draftLocalesEnabled);
  const items = resolveTouchlineGlobalNavigationItems(effectiveLocale, surface, draftLocalesEnabled);
  const hasTrustedClubContext = Boolean(trustedContext?.club);
  const overflowItems = items.slice(2);

  return (
    <nav
      className={`${styles.navigation} ${className ?? ""}`}
      aria-label={dictionary.ariaLabel}
      data-touchline-navigation-surface={surface}
      data-touchline-navigation-context={hasTrustedClubContext ? "club" : "none"}
    >
      <Link className={styles.arena} href={touchlineGlobalNavigationArenaHref(effectiveLocale, draftLocalesEnabled)}>
        <Goal aria-hidden="true" />
        <TouchlineNavigationLabel label={dictionary.backToArena} pendingLabel={`${dictionary.opening}…`} />
      </Link>

      {trustedContext?.club ? (
        <span className={styles.context} aria-label={`${dictionary.currentClub}: ${trustedContext.club.name}`}>
          {trustedContext.club.name}
        </span>
      ) : null}

      <div className={styles.links}>
        {items.map((item) => (
          <NavigationLink
            key={item.key}
            item={item}
            dictionary={dictionary}
            currentRoute={currentRoute}
            hasTrustedClubContext={hasTrustedClubContext}
            className={`${styles.link} ${overflowItems.some((overflowItem) => overflowItem.key === item.key) ? styles.desktopOnly : ""}`}
          />
        ))}
      </div>

      <details className={styles.more}>
        <summary>
          <MoreHorizontal aria-hidden="true" />
          <span>{dictionary.more}</span>
        </summary>
        <div className={styles.morePanel}>
          {overflowItems.map((item) => (
            <NavigationLink
              key={item.key}
              item={item}
              dictionary={dictionary}
              currentRoute={currentRoute}
              hasTrustedClubContext={hasTrustedClubContext}
              className={styles.moreLink}
            />
          ))}
        </div>
      </details>
      {showAudioControl ? <AuthAmbientAudio locale={copyLocale} allowDraftLocale={draftLocalesEnabled} className={styles.audioControl} buttonClassName={styles.link} /> : null}
    </nav>
  );
}
