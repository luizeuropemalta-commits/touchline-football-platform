/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Handshake,
  Heart,
  Radio,
  Share2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import { ClubOwnerPortraitPerimeterTrace } from "./ClubOwnerPortraitPerimeterTrace";
import { shareTouchlinePost, type TouchlineNativeShareResult } from "@/lib/touchlineArena/social-native-share";
import { getTouchlineSocialFeedCopy, touchlineSocialProfileDetailsLabel } from "@/lib/touchlineArena/social-feed-i18n";
import styles from "./TouchlineSocial.module.css";

export type TouchlineSocialPost = {
  id: string;
  kind: "official" | "owner" | "simulation";
  title: string;
  body: string;
  meta: string;
  accent?: string;
  badge?: string;
  sharePostId?: string;
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
  coverVariant = "standard",
  featuredVisual,
  featuredLabel,
  backgroundAccent,
  backgroundSecondary,
  profileDetails = [],
  clubOwnerPortraitTrace = false,
  portraitTraceActive = false,
  actionsPlacement = "default",
  locale,
  draftLocalesEnabled = false,
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
  /** Opt-in cover treatment for authenticated My Club only. */
  coverVariant?: "standard" | "stadium" | "command";
  featuredVisual?: React.ReactNode;
  featuredLabel?: string;
  backgroundAccent?: string;
  backgroundSecondary?: string;
  profileDetails?: Array<{ label: string; value: string }>;
  /** Decorative opt-in reserved for the Club Owner identity surface. */
  clubOwnerPortraitTrace?: boolean;
  /** Static local visual-QA control; product callers keep this false. */
  portraitTraceActive?: boolean;
  /** Keeps private My Club controls beside the owner identity. */
  actionsPlacement?: "default" | "avatar";
  locale?: string;
  draftLocalesEnabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`${styles.socialHeader} ${showCover ? "" : styles.identityOnly} ${coverVariant === "command" ? styles.commandHeader : ""}`}
      style={{
        "--social-accent": accent,
        "--social-background-accent": backgroundAccent ?? accent,
        "--social-background-secondary": backgroundSecondary ?? accent,
      } as React.CSSProperties}
    >
      {coverVariant === "command" ? <TouchlineClubPerimeterTrace accent={accent} className={styles.commandPerimeterTrace} /> : null}
      {showCover ? (
        <div className={`${styles.coverArt} ${coverVariant === "stadium" ? styles.coverStadium : ""} ${coverVariant === "command" ? styles.coverCommand : ""}`} aria-hidden="true">
          <span />
        </div>
      ) : null}
      <div className={`${styles.socialIdentity} ${visual ? styles.hasCardVisual : ""} ${featuredVisual ? styles.hasFeaturedVisual : ""}`}>
        <div className={styles.identityVisualStack}>
          {visual ? (
            <div className={styles.socialCardVisual}>{visual}</div>
          ) : (
            <div
              className={styles.socialAvatar}
              data-club-owner-portrait-trace={clubOwnerPortraitTrace ? "touchline-logo-green" : undefined}
              data-club-owner-portrait-trace-active={portraitTraceActive ? "true" : undefined}
            >
              {clubOwnerPortraitTrace ? <ClubOwnerPortraitPerimeterTrace /> : null}
              {clubOwnerPortraitTrace ? (
                <div className={styles.socialAvatarPhoto}>
                  <img src={avatarUrl} alt={avatarAlt || name} />
                </div>
              ) : (
                <img src={avatarUrl} alt={avatarAlt || name} />
              )}
            </div>
          )}
          {children && (featuredVisual || actionsPlacement === "avatar") ? <div className={styles.avatarFooter}>{children}</div> : null}
        </div>
        <div className={styles.socialName}>
          <span><BadgeCheck aria-hidden="true" size={15} /> {kind}</span>
          <h1>{name}</h1>
          <p>{subtitle}</p>
          {profileDetails.length ? (
            <div className={styles.profileDetails} aria-label={touchlineSocialProfileDetailsLabel(name, locale, draftLocalesEnabled)}>
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
        ) : actionsPlacement === "avatar" ? null : (
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
  followerCount: number | null;
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
        <strong aria-label={followerCount === null ? (isPortuguese ? "Total de seguidores indisponível" : "Follower total unavailable") : undefined}>
          {followerCount === null ? "—" : compact(followerCount, locale)}
        </strong>
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

function postKindLabel(kind: TouchlineSocialPost["kind"], locale: string, draftLocalesEnabled = false) {
  const copy = getTouchlineSocialFeedCopy(locale, draftLocalesEnabled);
  if (kind === "official") return copy.officialPost;
  if (kind === "simulation") return copy.simulationPost;
  return copy.ownerPost;
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
  draftLocalesEnabled = false,
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
  draftLocalesEnabled?: boolean;
}) {
  const copy = getTouchlineSocialFeedCopy(locale, draftLocalesEnabled);
  const resolvedEntityRole = entityRole || copy.verifiedProfile;
  const resolvedEmptyMessage = emptyMessage || copy.empty;
  const [sharedPosts, setSharedPosts] = useState<Map<string, TouchlineNativeShareResult>>(new Map());
  const [activeKind, setActiveKind] = useState<"all" | TouchlineSocialPost["kind"]>("all");
  const availableKinds = useMemo(() => [...new Set(posts.map((post) => post.kind))], [posts]);
  const visiblePosts = activeKind === "all" ? posts : posts.filter((post) => post.kind === activeKind);

  async function sharePost(post: TouchlineSocialPost) {
    const text = `${post.title}\n${post.body}`.trim();
    const result = await shareTouchlinePost({
      title: post.title,
      text,
      postId: post.sharePostId,
      imageUrl: post.visualImageUrl,
      pageUrl: window.location.href,
    });
    if (result === "cancelled") return;
    setSharedPosts((current) => new Map(current).set(post.id, result));
    if (result !== "unavailable") window.setTimeout(() => {
      setSharedPosts((current) => {
        const next = new Map(current);
        next.delete(post.id);
        return next;
      });
    }, 2_000);
  }

  return (
    <section
      className={styles.feed}
      data-club-owner-feed={entityId.startsWith("club-owner:") ? "true" : "false"}
      style={{ "--social-accent": accent } as React.CSSProperties}
      aria-label={copy.feed}
    >
      <header className={styles.feedHeading}>
        <div className={styles.feedTitle}>
          <span><Radio aria-hidden="true" size={13} /> TouchLine Pulse</span>
          <h2>{copy.title}</h2>
          <p>
            {copy.description}
          </p>
        </div>
        <div className={styles.feedTrust} aria-label={copy.safeguards}>
          <span><BadgeCheck aria-hidden="true" size={15} /> {copy.officialData}</span>
          <span><ShieldCheck aria-hidden="true" size={15} /> {copy.privateStrategy}</span>
        </div>
      </header>

      {highlights.length ? (
        <div className={styles.feedHighlights} aria-label={copy.summary}>
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
          <nav className={styles.feedFilters} aria-label={copy.filters}>
            {(["all", ...availableKinds] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={activeKind === kind} onClick={() => setActiveKind(kind)}>
                {kind === "all"
                  ? copy.all
                  : kind === "official"
                    ? copy.official
                    : kind === "simulation"
                      ? copy.simulation
                      : "ClubOwner"}
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <div className={styles.feedList}>
        {visiblePosts.map((post, index) => {
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
                      {postKindLabel(post.kind, locale, draftLocalesEnabled)}
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
                    <span /> {copy.featured}
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                  {post.badge ? <strong className={styles.postValue}>{post.badge}</strong> : null}
                </div>
              </div>

              <footer>
                {/* Post reactions need their own persisted identity; player likes
                    and browser preferences cannot stand in for post totals. */}
                <button type="button" disabled title={copy.likesUnavailableReason}>
                  <Heart aria-hidden="true" size={18} />
                  <span>{copy.likesUnavailable}</span>
                </button>
                <button type="button" onClick={() => void sharePost(post)} aria-live="polite">
                  <Share2 aria-hidden="true" size={18} />
                  <span>{sharedPosts.get(post.id) === "shared"
                    ? copy.shared
                    : sharedPosts.get(post.id) === "copied"
                      ? copy.copied
                      : sharedPosts.get(post.id) === "unavailable"
                        ? copy.shareUnavailable
                        : copy.share}</span>
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
