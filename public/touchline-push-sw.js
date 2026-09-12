/* TouchLine device receiver. Delivery is intentionally server-controlled. */
self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = typeof payload.title === "string" ? payload.title : "TouchLine";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/touchline-192.png",
    badge: "/icons/touchline-192.png",
    data: { href: typeof payload.href === "string" ? payload.href : "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.href ?? "/notifications"));
});
