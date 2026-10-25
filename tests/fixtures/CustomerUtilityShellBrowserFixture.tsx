import { useState } from "react";
import TouchlineCustomerUtilityShell, { customerUtilityRoute } from "../../components/touchline/TouchlineCustomerUtilityShell";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref } from "../../lib/touchlineArena/auth-i18n";

/** Synthetic caller-provided identity only. This does not create or verify a
 * session. The real shell/header/rails render; the caller's logout operation is
 * a deliberately unresolved local promise, never a transport or credential. */
export default function CustomerUtilityShellBrowserFixture({ pathname, locale }: { pathname: string; locale: string }) {
  const [signingOut, setSigningOut] = useState(false);
  const [calls, setCalls] = useState(0);
  const route = customerUtilityRoute(pathname);
  if (!route) throw new Error("Unsupported utility fixture route");
  const Content = route === "inbox" ? "main" : "section";
  return <TouchlineCustomerUtilityShell accountId="11111111-1111-4111-8111-111111111111"
    currentRoute={route} pathname={pathname} locale={locale} draftLocalesEnabled
    profileName="Synthetic ClubOwner" profileEmail="utility-fixture@example.test"
    signingOut={signingOut} signOutError=""
    onSignOut={async () => {
      setCalls(value => value + 1); setSigningOut(true);
      await new Promise<void>(() => {});
    }}
    switchAccountHref={touchLineAuthEntryHref("/login", normalizeTouchLineAuthLocale(locale), `${pathname}?lang=${locale}`)}>
    <Content data-utility-fixture-content="true" data-sign-out-calls={calls}>
      <h1>Isolated utility content</h1><p>No real account, messages or notifications.</p>
      <div aria-hidden="true" style={{ height: 900 }} />
    </Content>
  </TouchlineCustomerUtilityShell>;
}
