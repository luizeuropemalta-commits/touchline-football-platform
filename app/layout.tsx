import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Touchline — Global Football Agent & Club Ecosystem",
  description: "A digital ecosystem where football agents, clubs, scouts, coaches, players and football professionals connect, recruit, negotiate and manage football business.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
