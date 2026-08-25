import Link from "next/link";
import {
  Activity,
  BarChart3,
  Goal,
  Handshake,
  MoreHorizontal,
  Shield,
  Sparkles,
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
}>;

type NavigationCopy = Readonly<{
  ariaLabel: string;
  backToArena: string;
  clubHub: string;
  allClubs: string;
  live: string;
  market: string;
  rankings: string;
  fantasy: string;
  myClub: string;
  more: string;
  currentClub: string;
}>;

const copy: Record<"en-GB" | "pt-BR", NavigationCopy> = {
  "en-GB": {
    ariaLabel: "TouchLine navigation",
    backToArena: "Back to Arena",
    clubHub: "ClubHub",
    allClubs: "All clubs",
    live: "Live",
    market: "Market",
    rankings: "Rankings",
    fantasy: "Fantasy",
    myClub: "My Club",
    more: "More",
    currentClub: "Current club",
  },
  "pt-BR": {
    ariaLabel: "Navegação TouchLine",
    backToArena: "Voltar para a Arena",
    clubHub: "ClubHub",
    allClubs: "Todos os clubes",
    live: "Ao vivo",
    market: "Mercado",
    rankings: "Rankings",
    fantasy: "Fantasy",
    myClub: "Meu Clube",
    more: "Mais",
    currentClub: "Clube atual",
  },
};

const navigationIcons: Record<TouchlineGlobalNavigationItemKey, LucideIcon> = {
  clubHub: Shield,
  live: Activity,
  market: Handshake,
  rankings: BarChart3,
  fantasy: Sparkles,
  myClub: UserRound,
};

function labelFor(
  key: TouchlineGlobalNavigationItemKey,
  dictionary: NavigationCopy,
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
  dictionary: NavigationCopy;
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
      <span>{labelFor(item.key, dictionary, hasTrustedClubContext)}</span>
    </Link>
  );
}

/**
 * Shared general navigation for public TouchLine surfaces. The prominent Arena
 * return is deliberately separate from the fixed four-item general menu.
 */
export default function TouchlineGlobalNavigation({
  locale,
  currentRoute,
  surface,
  trustedContext,
  className,
}: Props) {
  const effectiveLocale = resolveTouchLinePresentationLocale(locale);
  const dictionary = copy[effectiveLocale];
  const items = resolveTouchlineGlobalNavigationItems(effectiveLocale, surface);
  const hasTrustedClubContext = Boolean(trustedContext?.club);
  const overflowItems = items.slice(2);

  return (
    <nav
      className={`${styles.navigation} ${className ?? ""}`}
      aria-label={dictionary.ariaLabel}
      data-touchline-navigation-surface={surface}
      data-touchline-navigation-context={hasTrustedClubContext ? "club" : "none"}
    >
      <Link className={styles.arena} href={touchlineGlobalNavigationArenaHref(effectiveLocale)}>
        <Goal aria-hidden="true" />
        <span>{dictionary.backToArena}</span>
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
    </nav>
  );
}
