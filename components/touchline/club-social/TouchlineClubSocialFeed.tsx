import Image from "next/image";
import Link from "next/link";

import type { TouchlineClubSocialFeedPage } from "@/lib/touchlineArena/club-social-feed-server";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import ClubHubLikeButton from "@/components/touchline/club-hub/ClubHubLikeButton";
import ClubHubShareButton from "@/components/touchline/club-hub/ClubHubShareButton";

import styles from "./TouchlineClubSocialFeed.module.css";

const LABELS: Readonly<Record<string, Readonly<{ en: string; pt: string }>>> = Object.freeze({
  LINEUP: { en: "Official line-up", pt: "Escalação oficial" },
  MATCH_PREVIEW: { en: "Match preview", pt: "Prévia da partida" },
  FULL_TIME: { en: "Full Time", pt: "Fim de jogo" },
  GOAL_CONFIRMED: { en: "Goal", pt: "Gol" },
  RED_CARD_CONFIRMED: { en: "Red card confirmed", pt: "Cartão vermelho confirmado" },
  GAMEWEEK_RANKING_PREVIEW: { en: "Gameweek ranking", pt: "Ranking da Gameweek" },
  GAMEWEEK_RANKING_FINAL: { en: "Gameweek final ranking", pt: "Ranking final da Gameweek" },
  PLAYER_DUEL: { en: "TouchLine card duel", pt: "Duelo de cards TouchLine" },
  GAMEWEEK_HERO: { en: "Gameweek hero", pt: "Herói da Gameweek" },
  TOP_PERFORMER: { en: "Top performer", pt: "Destaque da partida" },
  HAT_TRICK_HERO: { en: "Hat-trick hero", pt: "Herói do hat-trick" },
});

function contentLabel(contentType: string, locale: TouchLineLocale) {
  const label = LABELS[contentType];
  return label ? (locale === "pt-BR" ? label.pt : label.en) : "TouchLine update";
}

export default function TouchlineClubSocialFeed({
  clubName,
  clubSlug,
  locale,
  page,
  channelEyebrow,
  channelTitle,
  paginationPath,
}: Readonly<{
  clubName: string;
  clubSlug: string;
  locale: TouchLineLocale;
  page: TouchlineClubSocialFeedPage;
  channelEyebrow?: string;
  channelTitle?: string;
  paginationPath?: string;
}>) {
  const pt = locale === "pt-BR";
  const feedPath = paginationPath ?? `/touchline-clubs/${clubSlug}`;
  return (
    <section className={styles.shell} aria-labelledby="club-social-feed-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            {channelEyebrow ?? (pt ? "Canal oficial do clube" : "Official club channel")}
          </span>
          <h2 className={styles.title} id="club-social-feed-title">
            {channelTitle ?? `${clubName} · TouchLine`}
          </h2>
        </div>
        <span className={styles.verified}>TouchLine Verified</span>
      </header>

      {page.state === "ready" ? (
        <div className={styles.grid}>
          {page.items.map((item) => (
            <article className={styles.card} key={item.id}>
              <div className={styles.media}>
                <Image
                  alt={`${contentLabel(item.contentType, locale)} · ${clubName}`}
                  fill
                  sizes="(max-width: 620px) 92vw, 540px"
                  src={item.imageUrl}
                  unoptimized
                />
              </div>
              <div className={styles.body}>
                <span className={styles.kind}>{contentLabel(item.contentType, locale)}</span>
                <p className={styles.copy}>{item.copy}</p>
                <time className={styles.date} dateTime={item.publishedAt}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Malta",
                  }).format(new Date(item.publishedAt))}
                </time>
                <div className={styles.actions} aria-label={pt ? "Ações da publicação" : "Post actions"}>
                  <ClubHubLikeButton />
                  <ClubHubShareButton
                    title={`${clubName} · ${contentLabel(item.contentType, locale)}`}
                    text={item.copy}
                    postId={item.id}
                    imageUrl={item.imageUrl}
                    locale={locale}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.empty} role="status">
          {page.state === "unavailable"
            ? (pt ? "As atualizações oficiais estão temporariamente indisponíveis." : "Official updates are temporarily unavailable.")
            : (pt ? "As próximas atualizações oficiais aparecerão aqui." : "The next official club updates will appear here.")}
        </p>
      )}

      {page.nextCursor ? (
        <Link
          className={styles.more}
          href={`${feedPath}?lang=${encodeURIComponent(locale)}&feedCursor=${encodeURIComponent(page.nextCursor)}`}
        >
          {pt ? "Ver atualizações anteriores" : "View earlier updates"}
        </Link>
      ) : null}
    </section>
  );
}
