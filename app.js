(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const AUDIO = "https://cdn.islamic.network/quran/audio/128/ar.alafasy/";

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("q:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("q:" + k, JSON.stringify(v)); } catch {} },
  };
  const settings = Object.assign({ theme: "auto", lang: "m", translit: false, size: 34 }, store.get("settings", {}));
  if (settings.lang === "i") settings.lang = "m"; // Indonesian removed; Malay (Basmeih) is the default
  const saveSettings = () => store.set("settings", settings);
  let bookmarks = store.get("bookmarks", []); // ["2:255"]

  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--arab-size", settings.size + "px");
    const dark = settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? "#0b3a35" : "#0f766e";
  }
  applySettings();

  // ---------- data ----------
  let meta = null;
  const cache = new Map();
  async function getMeta() {
    if (!meta) meta = await (await fetch("data/meta.json")).json();
    return meta;
  }
  async function getSurah(n) {
    if (!cache.has(n)) cache.set(n, fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    return cache.get(n);
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400);
  }

  // ---------- routing ----------
  async function route() {
    stopObserve();
    const h = location.hash.replace(/^#\/?/, "");
    const m = h.match(/^surah\/(\d+)(?:\/(\d+))?$/);
    try {
      if (m && +m[1] >= 1 && +m[1] <= 114) await renderSurah(+m[1], m[2] ? +m[2] : 0);
      else await renderHome();
    } catch (e) {
      app.innerHTML = `<p class="empty">Gagal memuat data. Sila sambung ke internet sekali untuk muat turun.</p>`;
    }
  }
  window.addEventListener("hashchange", route);

  // ---------- home ----------
  let homeState = { q: "", tab: "surah" };
  async function renderHome() {
    const list = await getMeta();
    document.title = "Al-Quran Digital";
    const last = store.get("last", null);
    app.innerHTML = `
      <section class="hero"><h1>Assalamualaikum 👋</h1><div class="muted">Baca Al-Quran 114 surah, 6,236 ayat</div></section>
      ${last ? `<a class="resume" href="#/surah/${last.s}/${last.a}"><span class="muted small">Sambung bacaan</span><b>${esc(list[last.s - 1].t)} • ayat ${last.a}</b></a>` : ""}
      <input id="q" class="search" type="search" placeholder="Cari surah atau kata dalam terjemahan…" value="${esc(homeState.q)}" autocomplete="off">
      <div class="tabs">
        <button class="tab ${homeState.tab === "surah" ? "on" : ""}" data-tab="surah">Surah</button>
        <button class="tab ${homeState.tab === "mark" ? "on" : ""}" data-tab="mark">Penanda (${bookmarks.length})</button>
      </div>
      <div id="results"></div>`;
    $("#q").addEventListener("input", (e) => { homeState.q = e.target.value; homeState.tab = "surah"; debounceResults(); syncTabs(); });
    app.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { homeState.tab = b.dataset.tab; syncTabs(); renderResults(); }));
    renderResults();
  }
  function syncTabs() { app.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === homeState.tab)); }
  let rt; const debounceResults = () => { clearTimeout(rt); rt = setTimeout(renderResults, 200); };

  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ\-'’`]/g, "");
  function surahRow(s) {
    return `<li><a class="s-item" href="#/surah/${s.n}"><div class="s-num"><span>${s.n}</span></div>
      <div class="s-main"><b>${esc(s.t)}</b><small>${esc(s.id)} • ${s.type === "meccan" ? "Makkiyah" : "Madaniyah"} • ${s.v} ayat</small></div>
      <div class="s-ar">${s.ar}</div></a></li>`;
  }
  async function renderResults() {
    const box = $("#results"); if (!box) return;
    const list = await getMeta();
    const q = homeState.q.trim();
    if (homeState.tab === "mark") {
      box.innerHTML = bookmarks.length ? "" : `<p class="empty">Belum ada penanda. Tekan ☆ pada mana-mana ayat.</p>`;
      for (const key of bookmarks) {
        const [s, a] = key.split(":").map(Number);
        const d = await getSurah(s);
        box.insertAdjacentHTML("beforeend", `<a class="hit" href="#/surah/${s}/${a}"><b>${esc(list[s - 1].t)} ${s}:${a}</b>
          <div class="arab" style="font-size:26px">${d.a[a - 1]}</div><div>${esc(d[settings.lang || "m"][a - 1])}</div></a>`);
      }
      return;
    }
    if (!q) { box.innerHTML = `<ul class="list">${list.map(surahRow).join("")}</ul>`; return; }
    const nq = norm(q);
    const num = /^\d+$/.test(q) ? +q : 0;
    const bySurah = list.filter((s) => s.n === num || norm(s.t).includes(nq) || norm(s.id).includes(nq) || norm(s.en).includes(nq) || s.ar.includes(q));
    let html = bySurah.length ? `<ul class="list">${bySurah.map(surahRow).join("")}</ul>` : "";
    box.innerHTML = html + (q.length >= 3 ? `<p class="empty" id="vs">Mencari dalam ayat…</p>` : "");
    if (q.length < 3) { if (!bySurah.length) box.innerHTML = `<p class="empty">Tiada surah dijumpai.</p>`; return; }
    const token = (renderResults.tok = {});
    const key = settings.lang || "m";
    const hits = [];
    const all = await Promise.all(list.map((s) => getSurah(s.n).catch(() => null)));
    if (renderResults.tok !== token) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    outer: for (let i = 0; i < all.length; i++) {
      const d = all[i]; if (!d) continue;
      for (let j = 0; j < d.a.length; j++) {
        if (re.test(d[key][j]) || re.test(d.t[j])) { hits.push([i + 1, j + 1, d]); }
        re.lastIndex = 0;
        if (hits.length >= 60) break outer;
      }
    }
    const vs = $("#vs"); if (!vs) return;
    vs.outerHTML = hits.length ? `<h3>Ayat (${hits.length}${hits.length >= 60 ? "+" : ""})</h3>` + hits.map(([s, a, d]) =>
      `<a class="hit" href="#/surah/${s}/${a}"><b>${esc(list[s - 1].t)} ${s}:${a}</b><div>${esc(d[key][a - 1]).replace(re, "<mark>$&</mark>")}</div></a>`).join("")
      : (bySurah.length ? "" : `<p class="empty">Tiada hasil.</p>`);
  }

  // ---------- reader ----------
  let obs = null;
  const stopObserve = () => { if (obs) { obs.disconnect(); obs = null; } };
  let current = null; // {n, data}

  async function renderSurah(n, focus) {
    const list = await getMeta();
    const s = list[n - 1];
    const d = await getSurah(n);
    current = { n, d, s };
    document.title = `${s.t} • Al-Quran`;
    const showBism = n !== 1 && n !== 9;
    const lang = settings.lang;
    let html = `
      <div class="reader-head"><div class="s-ar">${s.ar}</div><h1>${esc(s.t)}</h1>
        <div class="muted">${esc(s.id)} • ${s.type === "meccan" ? "Makkiyah" : "Madaniyah"} • ${s.v} ayat</div></div>
      <div class="nav-row">
        ${n > 1 ? `<a class="btn" href="#/surah/${n - 1}">← ${esc(list[n - 2].t)}</a>` : "<span></span>"}
        <button class="btn primary" id="play-all">▶ Main surah</button>
        ${n < 114 ? `<a class="btn" href="#/surah/${n + 1}">${esc(list[n].t)} →</a>` : "<span></span>"}
      </div>
      ${showBism ? `<div class="bismillah">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>` : ""}`;
    for (let i = 0; i < d.a.length; i++) {
      const a = i + 1, marked = bookmarks.includes(`${n}:${a}`);
      html += `<article class="ayah" id="a${a}" data-a="${a}">
        <div class="ayah-top"><span class="a-no">${n}:${a}</span><div class="a-tools">
          <button data-act="play" aria-label="Main">▶</button>
          <button data-act="mark" class="${marked ? "on" : ""}" aria-label="Penanda">${marked ? "★" : "☆"}</button>
          <button data-act="copy" aria-label="Salin">⧉</button></div></div>
        <div class="arab" lang="ar" dir="rtl">${d.a[i]}</div>
        ${settings.translit ? `<div class="translit">${esc(d.t[i])}</div>` : ""}
        ${lang ? `<div class="trans">${esc(d[lang][i])}</div>` : ""}
      </article>`;
    }
    app.innerHTML = html;
    $("#play-all").onclick = () => play(n, 1);
    app.querySelectorAll(".ayah").forEach((el) => {
      el.querySelector(".a-tools").addEventListener("click", (e) => {
        const act = e.target.dataset.act; if (!act) return;
        const a = +el.dataset.a;
        if (act === "play") play(n, a);
        if (act === "mark") toggleMark(n, a, e.target);
        if (act === "copy") copyAyah(n, a);
      });
    });
    if (focus) { const el = $("#a" + focus); if (el) el.scrollIntoView({ block: "start" }); }
    else window.scrollTo(0, 0);
    observeProgress();
    highlightPlaying();
  }

  function observeProgress() {
    let t;
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const els = app.querySelectorAll(".ayah"); if (!els.length || !current) return;
        for (const el of els) { if (el.getBoundingClientRect().bottom > 80) { store.set("last", { s: current.n, a: +el.dataset.a }); break; } }
      }, 400);
    };
    window.addEventListener("scroll", on, { passive: true });
    obs = { disconnect: () => window.removeEventListener("scroll", on) };
  }

  function toggleMark(n, a, btn) {
    const k = `${n}:${a}`, i = bookmarks.indexOf(k);
    if (i >= 0) bookmarks.splice(i, 1); else bookmarks.push(k);
    store.set("bookmarks", bookmarks);
    const on = i < 0; btn.classList.toggle("on", on); btn.textContent = on ? "★" : "☆";
    toast(on ? "Penanda ditambah" : "Penanda dibuang");
  }
  async function copyAyah(n, a) {
    const d = await getSurah(n), s = (await getMeta())[n - 1];
    const text = `${d.a[a - 1]}\n\n${d[settings.lang || "m"][a - 1]}\n— ${s.t} ${n}:${a}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Disalin"); }
    } catch {}
  }

  // ---------- audio ----------
  const audio = new Audio(); audio.preload = "none";
  let pl = null; // {n, a}
  async function play(n, a) {
    const list = await getMeta();
    pl = { n, a };
    audio.src = AUDIO + (list[n - 1].s + a - 1) + ".mp3";
    $("#player").hidden = false;
    $("#player-title").textContent = list[n - 1].t;
    $("#player-sub").textContent = `Ayat ${a} / ${list[n - 1].v}`;
    try { await audio.play(); $("#p-toggle").textContent = "⏸"; }
    catch { toast("Audio perlu sambungan internet"); $("#p-toggle").textContent = "▶"; }
    highlightPlaying(true);
  }
  function highlightPlaying(scroll) {
    document.querySelectorAll(".ayah.playing").forEach((e) => e.classList.remove("playing"));
    if (!pl || !current || pl.n !== current.n) return;
    const el = $("#a" + pl.a);
    if (el) { el.classList.add("playing"); if (scroll) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  async function step(dir) {
    if (!pl) return;
    const list = await getMeta();
    let { n, a } = pl; a += dir;
    if (a > list[n - 1].v) { if (n === 114) return closePlayer(); n++; a = 1; if (current && current.n === pl.n) location.hash = `#/surah/${n}`; }
    else if (a < 1) { if (n === 1) return; n--; a = list[n - 1].v; }
    play(n, a);
  }
  function closePlayer() { audio.pause(); pl = null; $("#player").hidden = true; highlightPlaying(); }
  audio.addEventListener("ended", () => step(1));
  audio.addEventListener("error", () => { if (pl) toast("Audio tidak dapat dimainkan (tiada internet?)"); });
  $("#p-next").onclick = () => step(1);
  $("#p-prev").onclick = () => step(-1);
  $("#p-close").onclick = closePlayer;
  $("#p-toggle").onclick = () => { if (audio.paused) { audio.play(); $("#p-toggle").textContent = "⏸"; } else { audio.pause(); $("#p-toggle").textContent = "▶"; } };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
  }

  // ---------- settings ----------
  const sOv = $("#settings-overlay");
  function openSettings() {
    $("#set-theme").value = settings.theme; $("#set-lang").value = settings.lang;
    $("#set-translit").checked = settings.translit; $("#set-size").value = settings.size; $("#size-val").textContent = settings.size + "px";
    sOv.hidden = false;
  }
  $("#btn-settings").onclick = openSettings;
  $("#settings-close").onclick = () => (sOv.hidden = true);
  sOv.addEventListener("click", (e) => { if (e.target === sOv) sOv.hidden = true; });
  const change = (fn) => (e) => { fn(e.target); saveSettings(); applySettings(); if (current && /surah/.test(location.hash)) renderSurah(current.n, 0).then(() => {}); else if ($("#results")) renderResults(); };
  $("#set-theme").onchange = change((t) => (settings.theme = t.value));
  $("#set-lang").onchange = change((t) => (settings.lang = t.value));
  $("#set-translit").onchange = change((t) => (settings.translit = t.checked));
  $("#set-size").oninput = (e) => { settings.size = +e.target.value; $("#size-val").textContent = settings.size + "px"; saveSettings(); applySettings(); };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

  // ---------- offline ----------
  async function cacheAll(manual) {
    const st = $("#offline-status");
    if (store.get("offline2", false) && !manual) return;
    try {
      const list = await getMeta();
      let done = 0;
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map((s) => getSurah(s.n).then(() => { done++; st.textContent = `Memuat turun ${done}/114…`; })));
      }
      store.set("offline2", true);
      st.textContent = "✓ Semua surah tersedia luar talian";
      if (manual) toast("Siap! Boleh dibaca tanpa internet");
    } catch { st.textContent = "Gagal. Cuba lagi dengan internet."; }
  }
  $("#btn-offline").onclick = () => cacheAll(true);
  if (store.get("offline2", false)) $("#offline-status").textContent = "✓ Semua surah tersedia luar talian";

  // ---------- splash cover ----------
  const splash = $("#splash");
  let splashGone = false, splashResolve;
  const splashDone = new Promise((r) => (splashResolve = r));
  function closeSplash() {
    if (splashGone) return; splashGone = true;
    splash.classList.add("out"); setTimeout(() => splash.remove(), 600); splashResolve();
  }
  splash.addEventListener("click", closeSplash);
  setTimeout(closeSplash, 3500);

  // ---------- install prompt ----------
  const ov = $("#install-overlay");
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null, shown = false;

  function showInstall() {
    if (standalone() || shown) return;
    if (!splashGone) return splashDone.then(showInstall);
    try { if (sessionStorage.getItem("q:dismiss")) return; } catch {}
    shown = true;
    const steps = $("#install-steps");
    if (deferred) {
      steps.hidden = true; $("#btn-install").hidden = false;
    } else {
      $("#btn-install").hidden = true; steps.hidden = false;
      steps.innerHTML = isIOS
        ? `<li>Ketik butang <b>Kongsi</b> (ikon petak dengan anak panah) di Safari</li><li>Pilih <b>Tambah ke Skrin Utama</b></li><li>Ketik <b>Tambah</b></li>`
        : `<li>Ketik menu <b>⋮</b> pada pelayar</li><li>Pilih <b>Pasang aplikasi</b> / <b>Tambah ke skrin utama</b></li>`;
    }
    ov.hidden = false;
  }
  function hideInstall() { ov.hidden = true; try { sessionStorage.setItem("q:dismiss", "1"); } catch {} }
  async function doInstall() {
    if (!deferred) return;
    const p = deferred; deferred = null;
    p.prompt();
    const r = await p.userChoice;
    $("#btn-install-top").hidden = true;
    ov.hidden = true;
    if (r.outcome === "accepted") toast("Memasang…");
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    $("#btn-install-top").hidden = false;
    if (shown) { // fallback steps were showing; switch to real button
      shown = false; ov.hidden = true;
    }
    showInstall();
  });
  window.addEventListener("appinstalled", () => { deferred = null; ov.hidden = true; $("#btn-install-top").hidden = true; toast("Al-Quran telah dipasang 🎉"); });
  $("#btn-install").onclick = doInstall;
  $("#btn-install-later").onclick = hideInstall;
  ov.addEventListener("click", (e) => { if (e.target === ov) hideInstall(); });
  $("#btn-install-top").onclick = () => { shown = false; try { sessionStorage.removeItem("q:dismiss"); } catch {} showInstall(); };
  // If the browser does not fire beforeinstallprompt (iOS Safari, Firefox...), show manual steps.
  setTimeout(() => { if (!deferred) showInstall(); }, isIOS || !("onbeforeinstallprompt" in window) ? 1200 : 3000);

  // ---------- boot ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => setTimeout(() => cacheAll(false), 3000)).catch(() => {});
  }
  route();
})();
