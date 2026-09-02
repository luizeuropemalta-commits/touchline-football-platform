"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import styles from "./ClubHubPremiumPrototype.module.css";

export default function ClubHubLikeButton() {
  const [liked, setLiked] = useState(false);

  return (
    <button
      aria-label={liked ? "Unlike post" : "Like post"}
      aria-pressed={liked}
      className={`${styles.likeButton} ${liked ? styles.likedButton : ""}`}
      onClick={() => setLiked((current) => !current)}
      type="button"
    >
      <Heart aria-hidden="true" fill={liked ? "currentColor" : "none"} />
      {liked ? "Liked" : "Like post"}
    </button>
  );
}
