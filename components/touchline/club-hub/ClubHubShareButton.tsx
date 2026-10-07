"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchlineClubHubShareCopy } from "@/lib/touchlineArena/club-hub-share-i18n";
import { shareTouchlinePost } from "@/lib/touchlineArena/social-native-share";
import styles from "./ClubHubPremiumPrototype.module.css";

export default function ClubHubShareButton({
  title,
  text,
  postId,
  imageUrl,
  locale = "en-GB",
}: Readonly<{ title: string; text: string; postId?: string; imageUrl?: string; locale?: TouchLineLocale }>) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "unavailable">("idle");
  const copy = getTouchlineClubHubShareCopy(locale);

  async function share() {
    const result = await shareTouchlinePost({ title, text, postId, imageUrl, pageUrl: window.location.href });
    if (result === "cancelled") return;
    setState(result);
    if (result !== "unavailable") window.setTimeout(() => setState("idle"), 2_000);
  }

  return (
    <button className={styles.shareButton} type="button" onClick={share} aria-live="polite">
      {state === "copied" || state === "shared" ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {state === "shared"
        ? copy.shared
        : state === "copied"
          ? copy.copied
          : state === "unavailable"
            ? copy.unavailable
            : copy.idle}
    </button>
  );
}
