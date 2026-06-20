// public/sw.js

// ── Install: skip waiting so new SW activates immediately ────────────────
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

// ── Activate: claim all clients so this SW controls them immediately ─────
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// ── Push: show notification + notify all open tabs ────────────────────────
self.addEventListener("push", function (event) {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    vibrate: [200, 100, 200],
    data: data.data,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration
      .showNotification(data.title, options)
      .then(() =>
        self.clients.matchAll({ includeUncontrolled: true, type: "window" }),
      )
      .then((clients) => {
        clients.forEach((client) => {
          // Always send the general notification received event
          client.postMessage({
            type: "NOTIFICATION_RECEIVED",
            payload: {
              title: data.title,
              body: data.body,
              data: data.data,
            },
          });

          // ── If this is a break notification, also send BREAK_STARTED ──
          // The cron job sets data.data.type = "BREAK_STARTED" when it
          // sends the push so we can identify it here.
          if (data.data?.type === "BREAK_STARTED") {
            client.postMessage({
              type: "BREAK_STARTED",
              start: data.data.start ?? null, // e.g. "14:00"
              end: data.data.end ?? null, // e.g. "14:30"
            });
          }
        });
      }),
  );
});

// ── Notification click: open task/attendance URL ──────────────────────────
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const notifData = event.notification.data ?? {};
  const url = notifData.url || "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // ── Post BREAK_STARTED to ALL open tabs first ─────────────────
        // Done before the focus loop so every tab gets the message
        // regardless of which one gets focused.
        if (notifData.type === "BREAK_STARTED") {
          clientList.forEach((c) =>
            c.postMessage({
              type: "BREAK_STARTED",
              start: notifData.start ?? null,
              end: notifData.end ?? null,
            }),
          );
        }

        // ── Focus the first already-open tab ──────────────────────────
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }

        // ── No open tab — open a new one ──────────────────────────────
        // The BreakReminderPopup will show when the user lands on the
        // attendance page because the push handler already posted
        // BREAK_STARTED to any tabs that were open at push time.
        return self.clients.openWindow(url);
      }),
  );
});
