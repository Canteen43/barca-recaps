// Service worker: app shell cache-first, data network-first (falls back to cache when offline).
const VERSION = "__VERSION__";
const SHELL = `shell-${VERSION}`;
const RUNTIME = "runtime-v1";
const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "lib/parse.js",
  "lib/watchlist.js",
  "lib/espn.js",
  "lib/push.js",
  "lib/checks.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  const key = new URL(request.url);
  key.search = key.pathname.endsWith("videos.json") ? "" : key.search;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key.href, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key.href);
    if (hit) return hit;
    throw err;
  }
}

// ---------- Web Push ----------
// Only the watcher holding the VAPID private key can push here. Even so, the payload is treated as
// untrusted text: taps only ever open this app or YouTube, with URLs built here from validated video IDs.
const VIDEO_ID = /^[\w-]{11}$/;
const scope = () => self.registration.scope;

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data?.json() ?? {};
  } catch {
    /* not JSON: show the generic notification */
  }
  const ids = (Array.isArray(msg.ids) ? msg.ids : []).filter((id) => typeof id === "string" && VIDEO_ID.test(id));
  event.waitUntil(
    self.registration.showNotification(String(msg.title || "New Barça recap").slice(0, 80), {
      body: String(msg.body || "").slice(0, 300),
      icon: "icons/icon-192.png",
      tag: "recaps",
      data: { ids },
      actions: ids.length === 1 ? [{ action: "youtube", title: "▶ YouTube" }] : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ids = event.notification.data?.ids ?? [];
  const url =
    event.action === "youtube" && ids.length === 1
      ? `https://www.youtube.com/watch?v=${ids[0]}`
      : ids.length === 1
        ? `${scope()}#/v/${ids[0]}`
        : scope();
  event.waitUntil(
    (async () => {
      if (!url.startsWith(scope())) return self.clients.openWindow(url);
      const open = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).find((c) => c.url.startsWith(scope()));
      if (open) {
        await open.focus();
        return open.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === location.origin && url.pathname.endsWith("/data/videos.json")) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname === "site.api.espn.com") {
    event.respondWith(networkFirst(request));
  } else if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).catch(() => caches.match("index.html"))),
    );
  }
});
