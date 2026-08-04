"use client";

import Link from "next/link";
import { useState } from "react";

import type { TouchlineCentralInboxItem } from "@/lib/touchlineArena/central-inbox";

export function TouchlineInboxList({
  initialItems,
  locale,
  labels,
}: {
  initialItems: readonly TouchlineCentralInboxItem[];
  locale: string;
  labels: { read: string; unread: string; open: string; markRead: string };
}) {
  const [items, setItems] = useState(initialItems);

  async function markRead(messageId: string) {
    const item = items.find((candidate) => candidate.id === messageId);
    if (!item || item.readAt) return;
    const response = await fetch("/api/touchline-central/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
    if (!response?.ok) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((candidate) => candidate.id === messageId ? { ...candidate, readAt } : candidate));
  }

  return <ol>{items.map((item) => <li key={item.id}><div><span>{item.priority} · {item.category}</span><h2>{item.title}</h2><p>{item.body}</p></div><aside><b>{item.readAt ? labels.read : labels.unread}</b><small>{item.lifecycleState}</small>{item.deepLink ? <Link href={`${item.deepLink}${item.deepLink.includes("?") ? "&" : "?"}lang=${encodeURIComponent(locale)}`} onClick={() => void markRead(item.id)}>{labels.open}</Link> : !item.readAt ? <button type="button" onClick={() => void markRead(item.id)}>{labels.markRead}</button> : null}</aside></li>)}</ol>;
}
