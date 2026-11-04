import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { TouchlineAmbientAudioProvider } from "../../components/auth-ambient-audio";
import { AuthForm } from "../../components/auth-form";
import { AuthLayout } from "../../components/auth-layout";
import { ResetPasswordForm } from "../../components/reset-password-form";
import LoginPlanGallery from "../../components/touchline/LoginPlanGallery";
import NotificationsPage from "../../app/(app)/notifications/page";
import TouchlineCustomerUtilityShell, { customerUtilityRoute } from "../../components/touchline/TouchlineCustomerUtilityShell";
import TouchlineLandscapeBoundary from "../../components/touchline/TouchlineLandscapeBoundary";
import { SiteLocaleReleaseProvider } from "../../components/touchline/SiteLocaleReleaseContext";
import { getTouchLineAuthCopy, getTouchLineLoginCopy, touchLineAuthHref, touchLineAuthEntryHref } from "../../lib/touchlineArena/auth-i18n";
import * as InboxBindings from "./InboxContentBrowserFixture";

export { Link, ArrowLeft, FlaskConical, AuthForm, AuthLayout, ResetPasswordForm, LoginPlanGallery,
  NotificationsPage, getTouchLineAuthCopy, getTouchLineLoginCopy, touchLineAuthHref, touchLineAuthEntryHref, InboxBindings };

/** Real presentation and orientation boundary. Identity/GET data are explicitly
 * synthetic. No login SDK, account session, logout or write is supplied. */
export default function CustomerAuthLandscapeBrowserFixture({ children, pathname, locale }: {
  children: ReactNode; pathname: string; locale: string;
}) {
  const currentRoute = customerUtilityRoute(pathname);
  return <SiteLocaleReleaseProvider enabled>
    <TouchlineAmbientAudioProvider enabled>
    <TouchlineLandscapeBoundary skipLabel="Skip to content" locale={locale} draftLocalesEnabled>
      {currentRoute ? <TouchlineCustomerUtilityShell
        accountId="11111111-1111-4111-8111-111111111111" currentRoute={currentRoute}
        pathname={pathname} locale={locale} draftLocalesEnabled
        profileName="Synthetic ClubOwner" profileEmail="fixture@example.test"
        signingOut={false} signOutError=""
        onSignOut={async () => { throw new Error("Logout is forbidden in this presentation fixture"); }}
        switchAccountHref={touchLineAuthEntryHref("/login", locale)}>
        {children}
      </TouchlineCustomerUtilityShell> : children}
    </TouchlineLandscapeBoundary>
    </TouchlineAmbientAudioProvider>
  </SiteLocaleReleaseProvider>;
}
