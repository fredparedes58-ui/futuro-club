/**
 * VITAS · Custom Service Worker Extensions
 * Handles push notifications and offline fallback.
 * This file is injected alongside the auto-generated Workbox SW.
 */

// ─── Push Notification Handler ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "VITAS", body: event.data.text() };
  }

  const { title = "VITAS Football Intelligence", body = "", url = "/" } = payload;

  const options = {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-64x64.png",
    vibrate: [200, 100, 200],
    data: { url },
    actions: [
      { action: "open", title: "Ver" },
      { action: "dismiss", title: "Cerrar" },
    ],
    tag: `vitas-${Date.now()}`, // Prevent stacking
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click Handler ──────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ─── Offline Fallback for API requests ──────────────────────────────────────
self.addEventListener("fetch", (event) => {
  // Only handle API requests that fail
  if (event.request.url.includes("/api/") && event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Sin conexión. Los datos se sincronizarán cuando vuelvas a estar online.",
            offline: true,
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
  }
});
