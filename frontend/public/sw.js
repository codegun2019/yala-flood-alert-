/* YALA FLOOD ALERT service worker: push notifications + minimal app-shell offline fallback.
   API responses are NEVER cached: stale flood data must not be shown as current. */
const SHELL = "yala-shell-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/offline.html")));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

// Severity -> how loud the notification should be. Web Push cannot ship a custom sound file:
// the phone plays its own default notification sound (unless muted / Do Not Disturb).
const LOUD = ["critical", "high", "official", "rapid", "test"];
const STICKY = ["critical", "high", "official"];
const VIBRATE = {
  critical: [600, 150, 600, 150, 600, 150, 1000],
  high: [400, 120, 400, 120, 400],
  official: [400, 120, 400, 120, 400],
  rapid: [300, 120, 300],
  test: [250, 100, 250, 100, 250],
};

self.addEventListener("push", (event) => {
  let data = { title: "YALA FLOOD ALERT", body: "", url: "/", tag: undefined, severity: "watch", ts: Date.now() };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }
  const sev = data.severity;
  event.waitUntil(
    (async () => {
      // Tell any open page so it can also play its in-app siren (Chrome requires we ALWAYS show a notification too).
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach((c) => c.postMessage({ type: "push-alert", severity: sev, title: data.title, body: data.body }));
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag,
        renotify: !!data.tag,
        silent: false,
        requireInteraction: STICKY.includes(sev),
        vibrate: VIBRATE[sev] || (LOUD.includes(sev) ? [300, 120, 300] : [200]),
        timestamp: data.ts,
        data: { url: data.url || "/" },
      });
    })()
  );
});

// Browser rotated our push subscription: re-register it on the server so alerts keep arriving.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        const sub = event.newSubscription || (old && (await self.registration.pushManager.subscribe(old.options)));
        if (!sub || !old) return;
        await fetch("/api/push/resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ old_endpoint: old.endpoint, subscription: sub.toJSON() }),
        });
      } catch (_) {}
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
