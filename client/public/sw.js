// 41 Hub — Service Worker para Web Push Notifications
// Roda em background mesmo com a aba fechada/em segundo plano

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "41 Hub", message: event.data.text() };
  }

  const options = {
    body: payload.message || "",
    icon: "/icon-192.png",
    badge: "/icon-72.png",
    tag: payload.id || "hub-notification",       // agrupa por id (sem duplicar)
    renotify: false,
    data: { url: payload.linkUrl || "/" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "41 Hub", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Se já tem uma aba aberta do Hub, foca nela e navega
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Senão abre nova aba
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
