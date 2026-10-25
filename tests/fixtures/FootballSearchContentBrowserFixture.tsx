import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import * as jsxRuntime from "react/jsx-runtime";
import { PlayerDatabaseSearch } from "../../components/player-database-search";
import TouchlineNavigationRail from "../../components/touchline/TouchlineNavigationRail";
import navigationStyles from "../../components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "../../app/(app)/football-search/FootballSearchContent.module.css";
import { touchLineAuthHref } from "../../lib/touchlineArena/auth-i18n";
import { resolveTouchlineCatalogueLocale } from "../../lib/touchlineArena/catalogue-locale";
import { getTouchlineFootballSearchCopy } from "../../lib/touchlineArena/football-search-i18n";

// Imports used by the unmodified renderer extracted from the server page.
// No server policy, session, network or search implementation is substituted.
export { Link, ArrowLeft, DatabaseZap, jsxRuntime, PlayerDatabaseSearch, TouchlineNavigationRail,
  navigationStyles, styles, touchLineAuthHref, resolveTouchlineCatalogueLocale, getTouchlineFootballSearchCopy };

export default function FootballSearchContentBrowserFixture({ children }: { children: ReactNode }) {
  return <div style={{ padding: 16, minWidth: 0 }}>
    <button type="button" id="before-search-content">Before isolated content</button>
    <main data-football-search-fixture="true">{children}</main>
    <button type="button" id="after-search-content">After isolated content</button>
  </div>;
}
