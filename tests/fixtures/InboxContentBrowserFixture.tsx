import type { ReactNode } from "react";
import Link from "next/link";
import * as jsxRuntime from "react/jsx-runtime";
import { TouchlineInboxList } from "../../components/touchline/TouchlineInboxList";
import TouchlineNavigationRail from "../../components/touchline/TouchlineNavigationRail";
import navigationStyles from "../../components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "../../app/(app)/inbox/InboxContent.module.css";
import { resolveTouchlineCatalogueLocale } from "../../lib/touchlineArena/catalogue-locale";
import type { TouchlineCentralInboxItem } from "../../lib/touchlineArena/central-inbox";

/** Imports consumed by the exact return/catalogues extracted from the server
 * page. No session, database client, receipt or server loader is simulated. */
export { Link, jsxRuntime, TouchlineInboxList, TouchlineNavigationRail, navigationStyles, styles, resolveTouchlineCatalogueLocale };

export function syntheticInboxItems(locale: string): readonly TouchlineCentralInboxItem[] {
  return [{
    id: "synthetic-inbox-layout-message", title: locale === "ar-SA"
      ? "رسالة اصطناعية لاختبار عرض النص الطويل ".repeat(5)
      : "Mensagem sintética para testar título extenso ".repeat(5),
    body: locale === "ar-SA" ? "نصاختباراصطناعيطويلبدونفواصل".repeat(35) : "SyntheticUnbrokenEditorialBody".repeat(35),
    deepLink: null, category: "MAINTENANCE", lifecycleState: "ACTIVE", priority: "HIGH", readAt: null,
  }];
}

export default function InboxContentBrowserFixture({ children }: { children: ReactNode }) {
  return <div data-inbox-fixture="synthetic-layout-only" style={{ padding: 16, minWidth: 0 }}>
    <button type="button" id="before-inbox-content">Before isolated Inbox</button>
    {children}
    <button type="button" id="after-inbox-content">After isolated Inbox</button>
  </div>;
}
