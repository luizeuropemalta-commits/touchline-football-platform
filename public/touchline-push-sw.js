/* TouchLine device receiver. Delivery is intentionally server-controlled. */
function safeNotificationHref(value) {
  if (typeof value !== "string" || !value.trim()) return "/notifications";
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.username || url.password || url.pathname.startsWith("//")) return "/notifications";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/notifications"; }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const value = event.data?.json?.();
    if (value && typeof value === "object" && !Array.isArray(value)) payload = value;
  } catch { /* A malformed message still receives a safe, visible fallback. */ }
  const title = typeof payload.title === "string" ? payload.title : "TouchLine";
  const tag = typeof payload.tag === "string" && payload.tag.trim() && payload.tag.length <= 160 ? payload.tag : undefined;
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: payload.eventIcon === "goal" || payload.eventIcon === "red-card"
      ? `/icons/touchline-event-${payload.eventIcon}.png`
      : "/icons/touchline-192.png",
    badge: "/icons/touchline-192.png",
    data: { href: safeNotificationHref(payload.href) },
    ...(tag ? { tag } : {}),
    // A server revision (author/settled points) reuses the event tag. Never
    // request another sound/vibration, even if the first notice was dismissed.
    renotify: false,
    ...(payload.update === true ? { silent: true } : {}),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openNotificationDestination(safeNotificationHref(event.notification.data?.href)));
});

async function openNotificationDestination(href) {
  const destination = new URL(href, self.location.origin).href;
  try {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      // Do not navigate a different tab away from unsaved team/account work.
      if (client.url === destination && typeof client.focus === "function") {
        try { await client.focus(); return; } catch { /* Closed or unfocusable: open the destination. */ }
      }
    }
  } catch { /* Browser unavailable: preserve the safe openWindow fallback. */ }
  await clients.openWindow(href);
}
