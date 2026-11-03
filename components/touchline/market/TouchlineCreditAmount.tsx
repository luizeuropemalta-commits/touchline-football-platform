"use client";

import { TouchlineCoinMark } from "./TouchlineMarketMarks";
import styles from "./TouchlineCreditAmount.module.css";

/** One monetary presentation; the caller remains responsible for the quoted amount. */
export default function TouchlineCreditAmount({ value, locale, signed = false }: {
  value: number; locale: string; signed?: boolean;
}) {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) return <span>—</span>;
  const label = `${value.toLocaleString(locale)} TC`;
  return <span className={styles.amount} data-tc-amount={value}>
    <span className={styles.coin} aria-hidden="true"><TouchlineCoinMark size={20} /></span>
    <bdi>{label}</bdi>
  </span>;
}
