import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import DocumentLocaleSync from "@/components/touchline/DocumentLocaleSync";
import TouchlineLandscapeBoundary from "@/components/touchline/TouchlineLandscapeBoundary";
import { TouchlineActivityTracker } from "@/components/touchline-activity-tracker";
import {
  isTouchlineIsolatedPreviewRequest,
  TOUCHLINE_ISOLATED_PREVIEW_HEADER,
} from "@/lib/touchlinePreview/isolation";
import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";
import {
  resolveTouchLinePresentationLocale,
  touchlineDocumentDirection,
  TOUCHLINE_PRESENTATION_LOCALE_HEADER,
} from "@/lib/touchlineArena/root-locale";
import "./globals.css";

const productMetadata: Metadata = {
  metadataBase: new URL(TOUCHLINE_PUBLIC_ORIGIN),
  title: "TouchLine Arena / TouchLine England",
  description: "TouchLine England is the first TouchLine Arena competition experience for premium football cards, squads and clubowner gameplay.",
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
  const requestHeaders = await headers();
  const locale = resolveTouchLinePresentationLocale(
    requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER),
  );
  const isIsolatedPreview = isTouchlineIsolatedPreviewRequest(
    requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER),
  );
  const skipLabel = locale === "pt-BR" ? "Pular para o conteúdo principal" : "Skip to main content";

  return (
    <html lang={locale} dir={touchlineDocumentDirection(locale)}>
      <body>
        {!isIsolatedPreview ? (
          <Suspense fallback={null}>
            <DocumentLocaleSync initialLocale={locale} />
            <TouchlineActivityTracker />
          </Suspense>
        ) : null}
        {/*
          This is a single focus destination rather than another `main`
          landmark. Each route keeps its own semantic main; the wrapper lets
          the global skip link work uniformly without nesting landmarks.
        */}
        <TouchlineLandscapeBoundary locale={locale} skipLabel={skipLabel}>
          {children}
        </TouchlineLandscapeBoundary>
      </body>
    </html>
  );
}
