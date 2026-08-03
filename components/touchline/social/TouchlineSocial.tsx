/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Handshake,
  Heart,
  Radio,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import styles from "./TouchlineSocial.module.css";

export type TouchlineSocialPost = {
  id: string;
  kind: "official" | "owner" | "simulation";
  title: string;
  body: string;
  meta: string;
  accent?: string;
  badge?: string;
  visualImageUrl?: string;
  visual?: React.ReactNode;
  visualAlt?: string;
  visualKicker?: string;
  visualValue?: string;
  visualTheme?: "match" | "goal" | "evolution" | "availability" | "market" | "profile" | "squad";
  metrics?: Array<{ label: string; value: string }>;
  baseLikeCount?: number;
  actionHref?: string;
  actionLabel?: string;
};

export function TouchlineSocialProfileHeader({
  kind,
  name,
  subtitle,
  avatarUrl,
  avatarAlt,
  visual,
  accent,
  stats = [],
  showCover = true,
  featuredVisual,
  featuredLabel,
  backgroundAccent,
  backgroundSecondary,
  profileDetails = [],
  children,
}: {
  kind: string;
  name: string;
  subtitle: string;
  avatarUrl?: string;
  avatarAlt?: string;
  visual?: React.ReactNode;
  accent: string;
  stats?: Array<{ label: string; value: string }>;
  showCover?: boolean;
  featuredVisual?: React.ReactNode;
  featuredLabel?: string;
  backgroundAccent?: string;
  backgroundSecondary?: string;
  profileDetails?: Array<{ label: string; value: string }>;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`${styles.socialHeader} ${showCover ? "" : styles.identityOnly}`}
      style={{
        "--social-accent": accent,
        "--social-background-accent": backgroundAccent ?? accent,
        "--social-background-secondary": backgroundSecondary ?? accent,
      } as React.CSSProperties}
    >
      {showCover ? (
        <div className={styles.coverArt} aria-hidden="true">
          <span />
        </div>
      ) : null}
      <div className={`${styles.socialIdentity} ${visual ? styles.hasCardVisual : ""} ${featuredVisual ? styles.hasFeaturedVisual : ""}`}>
        <div className={styles.identityVisualStack}>
          {visual ? (
            <div className={styles.socialCardVisual}>{visual}</div>
          ) : (
            <div className={styles.socialAvatar}>
              <img src={avatarUrl} alt={avatarAlt || name} />
            </div>
          )}
          {featuredVisual && children ? <div className={styles.avatarFooter}>{children}</div> : null}
        </div>
        <div className={styles.socialName}>
          <span><BadgeCheck aria-hidden="true" size={15} /> {kind}</span>
          <h1>{name}</h1>
          <p>{subtitle}</p>
          {profileDetails.length ? (
            <div className={styles.profileDetails} aria-label={`${name} profile details`}>
              {profileDetails.map((detail) => (
                <span key={detail.label}>
                  <small>{detail.label}</small>
                  <strong>{detail.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {featuredVisual ? (
          <aside className={styles.profileFeatured} aria-label={featuredLabel}>
            {featuredLabel ? <span>{featuredLabel}</span> : null}
            <div>{featuredVisual}</div>
          </aside>
        ) : (
          <div className={styles.headerActions}>{children}</div>
        )}
      </div>
      {stats.length ? (
        <div className={styles.socialStats}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type ProfileActionsProps = {
  entityId: string;
  entityName: string;
  followerCount: number;
  accent: string;
  locale?: string;
  purchaseHref?: string | null;
  purchaseLabel?: string;
};

function compact(value: number, locale = "pt-BR") {
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function readBoolean(key: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

export function TouchlineSocialProfileActions({
  entityId,
  entityName,
  followerCount,
  accent,
  locale = "pt-BR",
  purchaseHref,
  purchaseLabel = "Contratar jogador",
}: ProfileActionsProps) {
  const isPortuguese = locale === "pt-BR";
  const followKey = `touchline:social:following:${entityId}`;
  const [isFollowing, setIsFollowing] = useState(false);

  // Hydrate this entity's private browser preference after the server render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setIsFollowing(readBoolean(followKey)), [followKey]);

  function toggleFollow() {
    setIsFollowing((current) => {
      const next = !current;
      window.localStorage.setItem(followKey, String(next));
      return next;
    });
  }

  return (
    <div className={styles.profileActions} style={{ "--social-accent": accent } as React.CSSProperties}>
      <button type="button" aria-pressed={isFollowing} onClick={toggleFollow}>
        <UserPlus aria-hidden="true" size={17} />
        <span>{isFollowing ? (isPortuguese ? "Seguindo" : "Following") : (isPortuguese ? "Seguir" : "Follow")}</span>
        <strong>{compact(followerCount + (isFollowing ? 1 : 0), locale)}</strong>
      </button>
      {purchaseHref ? (
        <a href={purchaseHref} aria-label={`${purchaseLabel}: ${entityName}`}>
          <Handshake aria-hidden="true" size={17} />
          <span>{purchaseLabel}</span>
        </a>
      ) : null}
    </div>
  );
}

function postKindLabel(kind: TouchlineSocialPost["kind"], locale: string) {
  const isPortuguese = locale === "pt-BR";
  if (kind === "official") return isPortuguese ? "Atualização oficial" : "Official update";
  if (kind === "simulation") return isPortuguese ? "Simulação TouchLine" : "TouchLine simulation";
  return isPortuguese ? "Publicação do ClubOwner" : "ClubOwner post";
}

function postMonogram(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function TouchlineSocialFeed({
  entityId,
  entityName = "TouchLine",
  entityImageUrl,
  entityImageAlt,
  entityRole,
  posts,
  accent,
  locale = "pt-BR",
  highlights = [],
  defaultActionHref,
  defaultActionLabel,
  emptyMessage,
}: {
  entityId: string;
  entityName?: string;
  entityImageUrl?: string;
  entityImageAlt?: string;
  entityRole?: string;
  posts: TouchlineSocialPost[];
  accent: string;
  locale?: string;
  highlights?: Array<{ label: string; value: string }>;
  defaultActionHref?: string;
  defaultActionLabel?: string;
  emptyMessage?: string;
}) {
  const isPortuguese = locale === "pt-BR";
  const resolvedEntityRole = entityRole || (isPortuguese ? "Perfil verificado" : "Verified profile");
  const resolvedEmptyMessage = emptyMessage || (
    isPortuguese ? "As atualizações oficiais aparecerão aqui." : "Official updates will appear here."
  );
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [activeKind, setActiveKind] = useState<"all" | TouchlineSocialPost["kind"]>("all");
  const storagePrefix = useMemo(() => `touchline:social:likes:${entityId}:`, [entityId]);
  const availableKinds = useMemo(() => [...new Set(posts.map((post) => post.kind))], [posts]);
  const visiblePosts = activeKind === "all" ? posts : posts.filter((post) => post.kind === activeKind);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLikedPosts(new Set(posts.filter((post) => readBoolean(`${storagePrefix}${post.id}`)).map((post) => post.id)));
  }, [posts, storagePrefix]);

  function toggleLike(postId: string) {
    setLikedPosts((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      window.localStorage.setItem(`${storagePrefix}${postId}`, String(next.has(postId)));
      return next;
    });
  }

  return (
    <section
      className={styles.feed}
      data-club-owner-feed={entityId.startsWith("club-owner:") ? "true" : "false"}
      style={{ "--social-accent": accent } as React.CSSProperties}
      aria-label={isPortuguese ? "Feed TouchLine" : "TouchLine feed"}
    >
      <header className={styles.feedHeading}>
        <div className={styles.feedTitle}>
          <span><Radio aria-hidden="true" size={13} /> TouchLine Pulse</span>
          <h2>{isPortuguese ? "Central de atualizações" : "Updates centre"}</h2>
          <p>
            {isPortuguese
              ? "O futebol real encontra a evolução do card em um feed visual, automático e verificado."
              : "Real football meets card progression in a visual, automatic and verified feed."}
          </p>
        </div>
        <div className={styles.feedTrust} aria-label={isPortuguese ? "Proteções do feed" : "Feed safeguards"}>
          <span><BadgeCheck aria-hidden="true" size={15} /> {isPortuguese ? "Dados oficiais" : "Official data"}</span>
          <span><ShieldCheck aria-hidden="true" size={15} /> {isPortuguese ? "Estratégia privada" : "Private strategy"}</span>
        </div>
      </header>

      {highlights.length ? (
        <div className={styles.feedHighlights} aria-label={isPortuguese ? "Resumo do perfil" : "Profile summary"}>
          {highlights.map((highlight) => (
            <div key={highlight.label}>
              <span>{highlight.label}</span>
              <strong>{highlight.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.feedToolbar}>
        <div className={styles.feedProfile}>
          <div className={styles.feedAvatar}>
            {entityImageUrl ? <img src={entityImageUrl} alt={entityImageAlt || entityName} /> : <strong>{postMonogram(entityName)}</strong>}
          </div>
          <div>
            <strong>{entityName}<BadgeCheck aria-hidden="true" size={13} /></strong>
            <span>{resolvedEntityRole}</span>
          </div>
        </div>
        {availableKinds.length > 1 ? (
          <nav className={styles.feedFilters} aria-label={isPortuguese ? "Filtrar notícias" : "Filter updates"}>
            {(["all", ...availableKinds] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={activeKind === kind} onClick={() => setActiveKind(kind)}>
                {kind === "all"
                  ? (isPortuguese ? "Tudo" : "All")
                  : kind === "official"
                    ? (isPortuguese ? "Oficial" : "Official")
                    : kind === "simulation"
                      ? (isPortuguese ? "Simulação" : "Simulation")
                      : "ClubOwner"}
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <div className={styles.feedList}>
        {visiblePosts.map((post, index) => {
          const liked = likedPosts.has(post.id);
          const likeCount = Math.max(0, post.baseLikeCount ?? 0) + (liked ? 1 : 0);
          const visualTheme = post.visualTheme || "profile";
          const actionHref = post.actionHref || defaultActionHref;
          const actionLabel = post.actionLabel || defaultActionLabel;
          return (
            <article
              key={post.id}
              className={styles.post}
              data-featured={index === 0 ? "true" : "false"}
              data-visual-theme={visualTheme}
              style={{ "--post-accent": post.accent || accent } as React.CSSProperties}
            >
              <div className={styles.postRail} aria-hidden="true" />
              <header className={styles.postHeader}>
                <div className={styles.postPublisher}>
                  <div className={styles.postAvatar}>
                    {entityImageUrl ? <img src={entityImageUrl} alt="" /> : <strong>{postMonogram(entityName)}</strong>}
                  </div>
                  <div>
                    <strong>{entityName}<BadgeCheck aria-hidden="true" size={12} /></strong>
                    <span className={post.kind === "official" ? styles.officialBadge : post.kind === "simulation" ? styles.simulationBadge : styles.ownerBadge}>
                      {post.kind === "official" ? <BadgeCheck aria-hidden="true" size={12} /> : <Sparkles aria-hidden="true" size={12} />}
                      {postKindLabel(post.kind, locale)}
                    </span>
                  </div>
                </div>
                <small>{post.meta}</small>
              </header>

              <div className={styles.postBody}>
                {post.visual || post.visualValue || post.visualImageUrl ? (
                  <div className={styles.postVisual}>
                    <div className={styles.postVisualGlow} aria-hidden="true" />
                    <div className={styles.postBroadcastTag}><Zap aria-hidden="true" size={12} /> TouchLine Live</div>
                    <div className={styles.postVisualCore}>
                      {post.visual ? <div className={styles.postCardVisual}>{post.visual}</div> : null}
                      {post.visualImageUrl ? <img src={post.visualImageUrl} alt={post.visualAlt || ""} /> : null}
                      {post.visualKicker ? <span>{post.visualKicker}</span> : null}
                      {post.visualValue ? <strong>{post.visualValue}</strong> : null}
                    </div>
                    {post.metrics?.length ? (
                      <div className={styles.postMetrics}>
                        {post.metrics.map((metric) => (
                          <div key={metric.label}>
                            <strong>{metric.value}</strong>
                            <span>{metric.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.postCopy}>
                  <div className={styles.postStoryLabel}>
                    <span /> {isPortuguese ? "Em destaque no perfil" : "Featured on profile"}
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                  {post.badge ? <strong className={styles.postValue}>{post.badge}</strong> : null}
                </div>
              </div>

              <footer>
                <button type="button" aria-pressed={liked} onClick={() => toggleLike(post.id)}>
                  <Heart aria-hidden="true" size={18} fill={liked ? "currentColor" : "none"} />
                  <span>{liked ? (isPortuguese ? "Curtido" : "Liked") : (isPortuguese ? "Curtir" : "Like")}</span>
                  <strong>{likeCount ? compact(likeCount, locale) : ""}</strong>
                </button>
                {actionHref && actionLabel ? (
                  <a href={actionHref}>
                    {actionLabel}
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </a>
                ) : null}
              </footer>
            </article>
          );
        })}
        {!visiblePosts.length ? <div className={styles.empty}>{resolvedEmptyMessage}</div> : null}
      </div>
    </section>
  );
}
