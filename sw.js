const VERSION = "v20";
const SHELL = `quran-shell-${VERSION}`;
const DATA = "quran-data-v2"; // surah data rarely changes; kept across shell versions
const SHELL_FILES = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "fonts/KFGQPC-Uthmanic-Script-HAFS.otf", "fonts/plus-jakarta-sans-latin-500-normal.woff2", "fonts/plus-jakarta-sans-latin-700-normal.woff2",
  "icons/cover.jpg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "data/meta.json",
  "assets/icon-back.png",
  "assets/icon-bookmark.png",
  "assets/icon-continue.png",
  "assets/icon-group1.png",
  "assets/icon-group2.png",
  "assets/icon-help.png",
  "assets/icon-home.png",
  "assets/icon-juzuk.png",
  "assets/icon-pilihan.png",
  "assets/icon-play.png",
  "assets/icon-search.png",
  "assets/icon-settings.png",
  "assets/orn-divider.png",
  "assets/orn-header-band.png",
  "assets/bg-tile.png",
  "assets/bg-tile-dark.png",
  "assets/orn-title-frame.png",
];

self.addEventListener("install", (e) => {
  // Bypass the HTTP cache so a new release is fetched fresh. The new worker then waits until
  // the user taps "Kemas kini" in the app (see SKIP_WAITING below).
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

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
