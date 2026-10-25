import type { ReactNode } from "react";
import * as ReactHooks from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Bell, CheckCircle2, Clock3, Mail, Radio, Save, ShieldCheck, Smartphone } from "lucide-react";
import TouchlineNavigationRail from "../../components/touchline/TouchlineNavigationRail";
import { SiteLocaleReleaseProvider, useSiteLocaleRelease } from "../../components/touchline/SiteLocaleReleaseContext";
import styles from "../../app/(app)/notifications/NotificationsContent.module.css";
import navigationStyles from "../../components/touchline/TouchlineGlobalNavigation.module.css";
import { resolveTouchlineCatalogueLocale } from "../../lib/touchlineArena/catalogue-locale";
import { getTouchlineNotificationCentreCopy, formatTouchlineNotificationActiveCount } from "../../lib/touchlineArena/notification-centre-i18n";

/** Actual dependencies for AST-extracted page declarations. The only routing
 * boundary is useSearchParams supplied by the test from its local URL. */
export { ReactHooks, jsxRuntime, Bell, CheckCircle2, Clock3, Mail, Radio, Save, ShieldCheck, Smartphone,
  TouchlineNavigationRail, useSiteLocaleRelease, styles, navigationStyles, resolveTouchlineCatalogueLocale,
  getTouchlineNotificationCentreCopy, formatTouchlineNotificationActiveCount };

export default function NotificationsContentBrowserFixture({ children }: { children: ReactNode }) {
  return <SiteLocaleReleaseProvider enabled>
    <div style={{ padding: 16, minWidth: 0 }} data-notifications-fixture="synthetic-read-only">
      <p>Isolated synthetic preferences — no real account, consent or subscription.</p>
      <button type="button" id="before-notifications">Before isolated preferences</button>
      <main>{children}</main>
    </div>
  </SiteLocaleReleaseProvider>;
}
