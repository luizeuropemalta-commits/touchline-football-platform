import type { NextConfig } from "next";

import { assertTouchlineIsolatedPreviewEnvironment } from "./lib/touchlinePreview/isolation.ts";

// A Vercel Preview that is not explicitly bound to the isolated contract must
// fail at config load rather than inherit the normal product environment.
assertTouchlineIsolatedPreviewEnvironment();

const configuredDevOrigins = (process.env.TOUCHLINE_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set(["127.0.0.1", "localhost", ...configuredDevOrigins])],
  async headers() {
    const cacheHeaders = [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ];

    return [
      { source: "/touchlineArena/cards/templates/live-compact/:path*", headers: cacheHeaders },
      { source: "/touchlineArena/cards/templates/zoom/:path*", headers: cacheHeaders },
      { source: "/touchlineArena/frames/live-compact/:path*", headers: cacheHeaders },
      { source: "/touchlineArena/frames/zoom/:path*", headers: cacheHeaders },
      { source: "/touchlineArena/shared/club-logos/2026-27/live-160/:path*", headers: cacheHeaders },
      { source: "/touchlineArena/live/:path*.webp", headers: cacheHeaders },
    ];
  },
};

export default nextConfig;
