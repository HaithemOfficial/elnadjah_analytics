self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      title: "ElNadjah alert",
      body: event.data ? event.data.text() : "New dashboard notification",
    };
  }

  const title = payload.title || "ElNadjah alert";
  const options = {
    body: payload.body || "",
    icon: "/pwa-192x192.png",
    badge: "/favicon-32x32.png",
    tag: payload.tag || "elnadjah-alert",
    actions: [
      {
        action: "mark-seen",
        title: "Mark as seen",
      },
    ],
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "mark-seen") {
    return;
  }

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((item) => item.url === targetUrl);
      if (client) return client.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
