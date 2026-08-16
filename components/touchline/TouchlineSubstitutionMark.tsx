import type { SVGProps } from "react";
import styles from "./TouchlineSubstitutionMark.module.css";

type TouchlineSubstitutionMarkProps = Omit<SVGProps<SVGSVGElement>, "aria-label"> & {
  label?: string;
};

export default function TouchlineSubstitutionMark({
  className = "",
  label,
  ...props
}: TouchlineSubstitutionMarkProps) {
  return (
    <svg
      {...props}
      className={`${styles.mark} ${className}`.trim()}
      viewBox="0 0 64 64"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path className={styles.incoming} d="M9 29v-6c0-7 5-12 12-12h22V5l13 12-13 12v-7H22c-2 0-3 1-3 3v4" />
      <path className={styles.outgoing} d="M55 35v6c0 7-5 12-12 12H21v6L8 47l13-12v7h21c2 0 3-1 3-3v-4" />
    </svg>
  );
}
