"use client";

import type { ComponentProps } from "react";
import { TouchlineSocialFeed } from "./social/TouchlineSocial";
import { useTouchlineSeasonPlayerFacts } from "./cards/TouchlinePlayerSeasonScope";

/** Only the current-card post/highlight is live; historical posts remain unchanged. */
export default function TouchlinePlayerSeasonFeed({ ratingPostId, ratingHighlightIndex, ratingBadgeSuffix, unavailable, ...props }: ComponentProps<typeof TouchlineSocialFeed> & {
  ratingPostId: string; ratingHighlightIndex: number; ratingBadgeSuffix?: string; unavailable: string;
}) {
  const facts = useTouchlineSeasonPlayerFacts();
  if (facts === undefined) return <TouchlineSocialFeed {...props} />;
  const total = facts?.totalRating == null ? unavailable : String(facts.totalRating);
  const posts = props.posts.map(post => post.id !== ratingPostId ? post : {
    ...post,
    badge: ratingBadgeSuffix === undefined ? post.badge : `${total} ${ratingBadgeSuffix}`,
    metrics: post.metrics?.map((metric, index) => index === 0 ? { ...metric, value: total } : metric),
  });
  const highlights = props.highlights?.map((item, index) => index === ratingHighlightIndex ? { ...item, value: total } : item);
  return <TouchlineSocialFeed {...props} posts={posts} highlights={highlights} />;
}
