"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import styles from "./ClubHubPremiumPrototype.module.css";

export default function ClubHubShareButton({ title, text }: Readonly<{ title: string; text: string }>) {
  const [state, setState] = useState<"idle" | "copied" | "unavailable">("idle");

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (!navigator.clipboard?.writeText) {
      setState("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2_000);
    } catch {
      setState("unavailable");
    }
  }

  return (
    <button className={styles.shareButton} type="button" onClick={share} aria-live="polite">
      {state === "copied" ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {state === "copied" ? "Post copied" : state === "unavailable" ? "Sharing unavailable" : "Share post"}
    </button>
  );
}
