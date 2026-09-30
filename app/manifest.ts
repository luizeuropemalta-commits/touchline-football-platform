import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Preserve the installed application's previous implicit identity; not a navigation URL.
    id: "/arena",
    name: "TouchLine",
    short_name: "TouchLine",
    description: "TouchLine football cards, Market and live points.",
    start_url: "/intro",
    scope: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#020708",
    theme_color: "#07110b",
    icons: [
      {
        src: "/icons/touchline-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/touchline-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/touchline-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
