import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import DocumentLocaleSync from "@/components/touchline/DocumentLocaleSync";
import { TouchlineActivityTracker } from "@/components/touchline-activity-tracker";
import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>
        <Suspense fallback={null}>
          <DocumentLocaleSync />
          <TouchlineActivityTracker />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
