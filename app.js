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
  // Penanda buku: at most one per surah, stored as {surah: ayah}. A new one in the same surah replaces the old.
  let bm = store.get("bm", null);
  if (!bm) { // migrate from earlier versions (single {s,a} or list ["2:255"])
    bm = {};
    const one = store.get("bookmark", null);
    if (one) bm[one.s] = one.a;
    for (const k of store.get("bookmarks", [])) { const [s, a] = k.split(":").map(Number); bm[s] = a; }
    store.set("bm", bm);
  }
  const bmCount = () => Object.keys(bm).length;

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
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"[d]);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400);
  }

  // ---------- routing ----------
  async function route() {
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
  let homeState = { q: "", view: "menu" }; // view: menu | surah | mark
  async function renderHome() {
    const list = await getMeta();
    document.title = "Al-Quran Digital";
    app.innerHTML = `
      <section class="hero"><h1>Assalamualaikum 👋</h1><div class="muted">Baca Al-Quran 114 surah, 6,236 ayat</div></section>
      ${homeState.view === "menu" ? `
        <div class="menu-cards">
          <button class="menu-card" data-view="mark"><span class="mc-ico">🔖</span><b>Penanda buku</b><small>${bmCount() ? `${bmCount()} surah ada penanda` : "Belum ada penanda"}</small></button>
          <button class="menu-card" data-view="surah"><span class="mc-ico">📖</span><b>Cari surah</b><small>114 surah • cari nama atau ayat</small></button>
        </div>
        <section class="refs">
          <h3>Rujukan</h3>
          <ul>
            <li><b>Teks Arab (Uthmani):</b> pakej <i>quran-json</i> (CC-BY-4.0), berasal daripada projek Tanzil</li>
            <li><b>Terjemahan Melayu:</b> Abdullah Muhammad Basmeih, <i>Tafsir Pimpinan Ar-Rahman</i> (versi Tanzil)</li>
            <li><b>Terjemahan English &amp; transliterasi:</b> pakej <i>quran-json</i></li>
            <li><b>Fon:</b> KFGQPC Uthmanic Script HAFS, Kompleks Percetakan Al-Quran Raja Fahd, Madinah</li>
            <li><b>Audio:</b> Mishary Alafasy (cdn.islamic.network)</li>
          </ul>
          <p class="muted small">Sila bandingkan dengan Mushaf bercetak. Jika ada kesilapan, maklumkan kepada Mohammad Adzim.</p>
        </section>` : `
        <button class="btn back" id="home-back">← Utama</button>
        ${homeState.view === "surah" ? `<input id="q" class="search" type="search" placeholder="Cari surah atau kata dalam terjemahan…" value="${esc(homeState.q)}" autocomplete="off">` : `<h2 class="view-title">🔖 Penanda buku</h2>`}`}
      <div id="results"></div>`;
    app.querySelectorAll(".menu-card").forEach((b) => b.addEventListener("click", () => { homeState.view = b.dataset.view; renderHome(); }));
    const back = $("#home-back"); if (back) back.addEventListener("click", () => { homeState.view = "menu"; homeState.q = ""; renderHome(); });
    const q = $("#q"); if (q) { q.addEventListener("input", (e) => { homeState.q = e.target.value; debounceResults(); }); if (!homeState.q) q.focus(); }
    renderResults();
  }
  let rt; const debounceResults = () => { clearTimeout(rt); rt = setTimeout(renderResults, 200); };

  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ\-'’`]/g, "");
  function surahRow(s) {
    return `<li><a class="s-item" href="#/surah/${s.n}"><div class="s-num"><span>${s.n}</span></div>
      <div class="s-main"><b>${esc(s.t)}</b><small>${esc(s.id)} • ${s.type === "meccan" ? "Makkiyah" : "Madaniyah"} • ${s.v} ayat</small>${bm[s.n] ? `<small class="bm-tag">🔖 Penanda: ayat ${bm[s.n]}</small>` : ""}</div>
      <div class="s-ar">${s.ar}</div></a></li>`;
  }
  async function renderResults() {
    const box = $("#results"); if (!box) return;
    const list = await getMeta();
    const q = homeState.q.trim();
    if (homeState.view === "menu") { box.innerHTML = ""; return; }
    if (homeState.view === "mark") {
      const keys = Object.keys(bm).map(Number).sort((x, y) => x - y);
      if (!keys.length) { box.innerHTML = `<p class="empty">Belum ada penanda buku.<br>Tekan ☆ pada mana-mana ayat. Setiap surah boleh ada satu penanda.</p>`; return; }
      box.innerHTML = `<ul class="list">${keys.map((n) => `<li class="bm-row"><a class="s-item" href="#/surah/${n}/${bm[n]}"><div class="s-num"><span>${n}</span></div>
        <div class="s-main"><b>${esc(list[n - 1].t)}</b><small>Ayat ${bm[n]} daripada ${list[n - 1].v}</small></div><div class="s-ar">${list[n - 1].ar}</div></a>
        <button class="bm-del" data-s="${n}" aria-label="Buang penanda">✕</button></li>`).join("")}</ul>`;
      box.querySelectorAll(".bm-del").forEach((b) => b.addEventListener("click", () => {
        delete bm[b.dataset.s]; store.set("bm", bm);
        renderResults();
      }));
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
      const a = i + 1, marked = bm[n] === a;
      html += `<article class="ayah" id="a${a}" data-a="${a}">
        <div class="ayah-top"><span class="a-no">${n}:${a}</span><div class="a-tools">
          <button data-act="play" aria-label="Main">▶</button>
          <button data-act="mark" class="${marked ? "on" : ""}" aria-label="Penanda">${marked ? "★" : "☆"}</button>
          <button data-act="copy" aria-label="Salin">⧉</button></div></div>
        <div class="arab" lang="ar" dir="rtl">${d.a[i]} <span class="aend">${arDigits(a)}</span></div>
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
    highlightPlaying();
  }

  function toggleMark(n, a, btn) {
    const same = bm[n] === a, replaced = bm[n] && !same;
    if (same) delete bm[n]; else bm[n] = a;
    store.set("bm", bm);
    app.querySelectorAll('.a-tools button[data-act="mark"]').forEach((b) => { b.classList.remove("on"); b.textContent = "☆"; });
    if (!same) { btn.classList.add("on"); btn.textContent = "★"; }
    toast(same ? "Penanda buku dibuang" : replaced ? "Penanda surah ini dipindahkan ke sini" : "Penanda buku disimpan");
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

  // ---------- app updates ----------
  const uOv = $("#update-overlay");
  let waitingSW = null, reloading = false;
  function offerUpdate(sw) {
    waitingSW = sw;
    $("#btn-update-top").hidden = false;
    splashDone.then(() => { uOv.hidden = false; });
  }
  function applyUpdate() {
    $("#btn-update").textContent = "Mengemas kini…";
    if (waitingSW) waitingSW.postMessage("SKIP_WAITING"); else location.reload();
  }
  $("#btn-update").onclick = applyUpdate;
  $("#btn-update-top").onclick = () => (uOv.hidden = false);
  $("#btn-update-later").onclick = () => (uOv.hidden = true);

  // ---------- boot ----------
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const watch = (sw) => sw && sw.addEventListener("statechange", () => { if (sw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(sw); });
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => watch(reg.installing));
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 30 * 60 * 1000);
      return navigator.serviceWorker.ready;
    }).then(() => setTimeout(() => cacheAll(false), 3000)).catch(() => {});
  }
  route();
})();
