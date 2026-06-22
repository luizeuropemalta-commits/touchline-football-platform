import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Touchline — The Football Agent Game",
  description: "A next-generation football management ecosystem for elite agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
