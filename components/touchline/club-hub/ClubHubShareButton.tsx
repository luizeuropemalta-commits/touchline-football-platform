"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
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
  const pt = locale === "pt-BR";

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
        ? (pt ? "Compartilhado" : "Shared")
        : state === "copied"
          ? (pt ? "Link copiado" : "Post copied")
          : state === "unavailable"
            ? (pt ? "Compartilhamento indisponível" : "Sharing unavailable")
            : (pt ? "Compartilhar" : "Share post")}
    </button>
  );
}
