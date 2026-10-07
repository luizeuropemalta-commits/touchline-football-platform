import type { Metadata, Viewport } from "next";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { SiteLocaleReleaseProvider } from "@/components/touchline/SiteLocaleReleaseContext";
import { headers } from "next/headers";
import { Suspense } from "react";

import DocumentLocaleSync from "@/components/touchline/DocumentLocaleSync";
import TouchlineLandscapeBoundary from "@/components/touchline/TouchlineLandscapeBoundary";
import { TouchlineActivityTracker } from "@/components/touchline-activity-tracker";
import { TouchlineAmbientAudioProvider } from "@/components/auth-ambient-audio";
import {
  isTouchlineIsolatedPreviewRequest,
  TOUCHLINE_ISOLATED_PREVIEW_HEADER,
} from "@/lib/touchlinePreview/isolation";
import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";
import { getTouchlineSiteAccessibilityCopy } from "@/lib/touchlineArena/site-accessibility-i18n";
import { normalizeTouchLineLoginLocale } from "@/lib/touchlineArena/auth-i18n";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import {
  resolveTouchLinePresentationLocale,
  TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER,
  touchlineDocumentDirection,
  TOUCHLINE_PRESENTATION_LOCALE_HEADER,
} from "@/lib/touchlineArena/root-locale";
import "./globals.css";
import "./touchline-crest-visibility.css";

const productMetadata: Metadata = {
  metadataBase: new URL(TOUCHLINE_PUBLIC_ORIGIN),
  title: "TouchLine",
  description: "TouchLine brings football cards, teams and live points together. Explore the available competitions and build your team in the Market.",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/touchline-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/touchline-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TouchLine",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  if (isTouchlineIsolatedPreviewRequest(requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) {
    return {
      title: "TouchLine isolated Preview",
      description: "Isolated Preview boundary. Product data and authentication are disabled.",
      robots: { index: false, follow: false },
    };
  }
  return productMetadata;
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07110b",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return renderRootLayout({ children }, isTouchLineSiteLocalesEnabled());
}

async function renderRootLayout({ children }: Readonly<{ children: React.ReactNode }>, draftLocalesEnabled = false) {
  const requestHeaders = await headers();
  const loginLocale = requestHeaders.get(TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER);
  const locale = loginLocale
    ? normalizeTouchLineLoginLocale(loginLocale)
    : resolveTouchLinePresentationLocale(requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER), draftLocalesEnabled);
  const isIsolatedPreview = isTouchlineIsolatedPreviewRequest(
    requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER),
  );
  const dataSource = resolveTouchlineDataSource();
  const allowDraftPresentation = draftLocalesEnabled || Boolean(loginLocale);
  const skipLabel = getTouchlineSiteAccessibilityCopy(locale, allowDraftPresentation).skipToMainContent;

  return (
    <html lang={locale} dir={draftLocalesEnabled ? "ltr" : touchlineDocumentDirection(locale)} data-scroll-behavior="smooth">
      <body>
        <SiteLocaleReleaseProvider enabled={draftLocalesEnabled}>
        {!isIsolatedPreview ? (
          <Suspense fallback={null}>
            <DocumentLocaleSync initialLocale={locale} draftLocalesEnabled={draftLocalesEnabled} />
            {dataSource === "direct" ? <TouchlineActivityTracker /> : null}
          </Suspense>
        ) : null}
        {/*
          This is a single focus destination rather than another `main`
          landmark. Each route keeps its own semantic main; the wrapper lets
          the global skip link work uniformly without nesting landmarks.
        */}
        <TouchlineLandscapeBoundary skipLabel={skipLabel} locale={locale} draftLocalesEnabled={allowDraftPresentation}>
          <TouchlineAmbientAudioProvider enabled={!isIsolatedPreview}>
            {children}
          </TouchlineAmbientAudioProvider>
        </TouchlineLandscapeBoundary>
        </SiteLocaleReleaseProvider>
      </body>
    </html>
  );
}
