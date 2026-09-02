import Image from "next/image";

import styles from "./TouchlineSocialFixtureScoreboard.module.css";

type ClubIdentity = Readonly<{
  name: string;
  shortCode: string;
  logoUrl: string;
}>;

type SharedProps = Readonly<{
  home: ClubIdentity;
  away: ClubIdentity;
  eyebrow: string;
  footer: string;
  variant?: "preview" | "event";
  className?: string;
}>;

type Props = SharedProps & (
  | Readonly<{ mode: "versus" }>
  | Readonly<{ mode: "score"; homeScore: number; awayScore: number; minute: string }>
);

/**
 * Canonical TouchLine fixture scoreboard. Its geometry is locked to the owner-
 * approved 041 MATCH_PREVIEW identity row. Live and final modules must reuse
 * this component instead of independently drawing club crests or separators.
 */
export default function TouchlineSocialFixtureScoreboard(props: Props) {
  const variant = props.variant ?? "preview";
  const label = props.mode === "versus"
    ? `${props.home.name} versus ${props.away.name}`
    : `${props.home.name} ${props.homeScore}, ${props.away.name} ${props.awayScore}`;
  return (
    <section
      className={[styles.fixture, styles[variant], props.className].filter(Boolean).join(" ")}
      aria-label={label}
      data-touchline-fixture-scoreboard="041-standard"
      data-scoreboard-mode={props.mode}
    >
      <div className={styles.clubIdentity}>
        <Image src={props.home.logoUrl} alt={`${props.home.name} crest`} width={112} height={112} priority />
        <strong>{variant === "event" ? props.home.shortCode : props.home.name}</strong>
      </div>
      <div className={styles.fixtureCore}>
        <span>{props.eyebrow}</span>
        {props.mode === "versus" ? (
          <b className={styles.versus}>VS</b>
        ) : (
          <b className={styles.scoreline} aria-hidden="true">
            <i>{props.homeScore}</i><em>-</em><i>{props.awayScore}</i>
          </b>
        )}
        <small>{props.mode === "score"
          ? `${props.minute}${props.footer ? ` · ${props.footer}` : ""}`
          : props.footer}</small>
      </div>
      <div className={styles.clubIdentity}>
        <Image src={props.away.logoUrl} alt={`${props.away.name} crest`} width={112} height={112} priority />
        <strong>{variant === "event" ? props.away.shortCode : props.away.name}</strong>
      </div>
    </section>
  );
}
