import type { ReactNode } from "react";
import styles from "./TouchlinePageContent.module.css";

/** Reserve route space even when its streamed content is empty. This neutral
 * wrapper is not a landmark or Suspense boundary; each route owns its main. */
export default function TouchlinePageContent({ children }: { children: ReactNode }) {
  return <div className={styles.routeSpace} data-touchline-page-content>{children}</div>;
}
