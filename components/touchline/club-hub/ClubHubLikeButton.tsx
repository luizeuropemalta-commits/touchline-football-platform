"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { getTouchlineClubHubLikeCopy } from "@/lib/touchlineArena/club-hub-like-i18n";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import styles from "./ClubHubPremiumPrototype.module.css";

export default function ClubHubLikeButton({ locale = "en-GB" }: Readonly<{ locale?: TouchLineLocale }>) {
  const [liked, setLiked] = useState(false);
  const copy = getTouchlineClubHubLikeCopy(locale);

  return (
    <button
      aria-label={liked ? copy.unlike : copy.like}
      aria-pressed={liked}
      className={`${styles.likeButton} ${liked ? styles.likedButton : ""}`}
      onClick={() => setLiked((current) => !current)}
      type="button"
    >
      <Heart aria-hidden="true" fill={liked ? "currentColor" : "none"} />
      {liked ? copy.liked : copy.like}
    </button>
  );
}
