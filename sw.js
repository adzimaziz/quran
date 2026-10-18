const VERSION = "v4";
const SHELL = `quran-shell-${VERSION}`;
const DATA = "quran-data-v2"; // surah data rarely changes; kept across shell versions
const SHELL_FILES = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "fonts/amiri-arabic-400-normal.woff2", "icons/cover.jpg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/maskable-512.png", "icons/apple-touch-icon.png", "data/meta.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("quran-") && k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // audio streams straight from network

  const isData = url.pathname.includes("/data/");
  if (isData) {
    e.respondWith(
      caches.open(DATA).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // App shell: stale-while-revalidate, with index.html as navigation fallback.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
      return hit || net;
    })
  );
});
