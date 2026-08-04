"use client";

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

  async function markRead(messageId: string): Promise<boolean> {
    const item = items.find((candidate) => candidate.id === messageId);
    if (!item || item.readAt) return true;
    const response = await fetch("/api/touchline-central/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
    if (!response?.ok) return false;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((candidate) => candidate.id === messageId ? { ...candidate, readAt } : candidate));
    return true;
  }

  async function openDestination(item: TouchlineCentralInboxItem) {
    if (!item.deepLink) return;
    // Wait for the server-owned receipt before leaving this page. A Link click
    // can cancel an in-flight POST during navigation and lose the durable read.
    await markRead(item.id);
    const separator = item.deepLink.includes("?") ? "&" : "?";
    window.location.assign(`${item.deepLink}${separator}lang=${encodeURIComponent(locale)}`);
  }

  return <ol>{items.map((item) => <li key={item.id}><div><span>{item.priority} · {item.category}</span><h2>{item.title}</h2><p>{item.body}</p></div><aside><b>{item.readAt ? labels.read : labels.unread}</b><small>{item.lifecycleState}</small>{item.deepLink ? <button type="button" onClick={() => void openDestination(item)}>{labels.open}</button> : !item.readAt ? <button type="button" onClick={() => void markRead(item.id)}>{labels.markRead}</button> : null}</aside></li>)}</ol>;
}
