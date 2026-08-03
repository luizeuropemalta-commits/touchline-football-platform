import type { MetadataRoute } from "next";

import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/touchline-clubs/"],
      disallow: ["/admin/", "/arena/", "/market-transfer/", "/notifications/", "/visual-qa/", "/audit/", "/audit-index", "/api/"],
    },
    sitemap: `${TOUCHLINE_PUBLIC_ORIGIN}/sitemap.xml`,
    host: TOUCHLINE_PUBLIC_ORIGIN,
  };
}
