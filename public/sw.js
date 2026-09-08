// Minimal push service worker. Only job: show the notification a push event
// carries, and focus/open the app when it's tapped. No caching, no offline
// support — that's a separate concern this file deliberately doesn't take on.

self.addEventListener("push", (event) => {
  let data = { title: "Ηλεία Pulse", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* fall back to the defaults above */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/brand/ilia-pulse-icon-192.png",
      badge: "/brand/favicon-32.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
