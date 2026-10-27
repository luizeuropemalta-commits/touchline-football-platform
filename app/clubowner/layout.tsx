import type { ReactNode } from "react";

/** Authentication owns the shell; sporting reads suspend only its content. */
export default function ClubOwnerLayout({ children }: { children: ReactNode }) {
  return children;
}
