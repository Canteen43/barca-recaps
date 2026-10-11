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
