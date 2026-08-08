import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import DocumentLocaleSync from "@/components/touchline/DocumentLocaleSync";
import { TouchlineActivityTracker } from "@/components/touchline-activity-tracker";
import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";
import {
  resolveTouchLinePresentationLocale,
  touchlineDocumentDirection,
  TOUCHLINE_PRESENTATION_LOCALE_HEADER,
} from "@/lib/touchlineArena/root-locale";
import "./globals.css";

export const metadata: Metadata = {
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
  const skipLabel = locale === "pt-BR" ? "Pular para o conteúdo principal" : "Skip to main content";

  return (
    <html lang={locale} dir={touchlineDocumentDirection(locale)}>
      <body>
        <a
          href="#touchline-main-content"
          className="sr-only fixed left-4 top-4 z-[2147483647] rounded-lg bg-[#edfff0] px-4 py-3 text-sm font-black text-[#041019] shadow-[0_16px_48px_rgba(0,0,0,.45)] focus:not-sr-only focus:outline focus:outline-3 focus:outline-offset-4 focus:outline-cyan-300"
        >
          {skipLabel}
        </a>
        <Suspense fallback={null}>
          <DocumentLocaleSync initialLocale={locale} />
          <TouchlineActivityTracker />
        </Suspense>
        {/*
          This is a single focus destination rather than another `main`
          landmark. Each route keeps its own semantic main; the wrapper lets
          the global skip link work uniformly without nesting landmarks.
        */}
        <div id="touchline-main-content" tabIndex={-1} data-touchline-main-content-fallback>
          {children}
        </div>
      </body>
    </html>
  );
}
