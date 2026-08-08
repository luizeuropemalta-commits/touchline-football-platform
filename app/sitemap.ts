import type { MetadataRoute } from "next";

import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";

const publicPaths = ["/", "/login", "/register", "/forgot-password", "/touchline-clubs"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: new URL(path, TOUCHLINE_PUBLIC_ORIGIN).toString(),
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
