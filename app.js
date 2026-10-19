(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const AUDIO = "https://cdn.islamic.network/quran/audio/128/ar.alafasy/";
  const VERSION_LABEL = "Versi 17";

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("q:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("q:" + k, JSON.stringify(v)); } catch {} },
  };
  const settings = Object.assign({ theme: "auto", lang: "m", translit: false, size: 30 }, store.get("settings", {}));
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
  let bmLast = store.get("bmLast", null); // surah of the most recently set penanda, for "Sambung"
  const bmCount = () => Object.keys(bm).length;
  const lastBookmark = () => {
    if (bmLast && bm[bmLast]) return { s: +bmLast, a: bm[bmLast] };
    const k = Object.keys(bm).pop();
    return k ? { s: +k, a: bm[k] } : null;
  };

  // Group reading bookmarks (Mak's two Yasin groups): one position each, {1: {s, a}, 2: {s, a}}.
  const GROUPS = [1, 2];
  let grp = store.get("grp", {});
  function setGroup(g, s, a) {
    const cur = grp[g], same = cur && cur.s === s && cur.a === a;
    if (same) delete grp[g]; else grp[g] = { s, a };
    store.set("grp", grp);
    toast(same ? `Penanda Group ${g} dibuang` : `Penanda Group ${g} disimpan`);
  }
  function toggleBookmark(n, a) {
    const same = bm[n] === a, replaced = bm[n] && !same;
    if (same) delete bm[n]; else { bm[n] = a; bmLast = n; store.set("bmLast", n); }
    store.set("bm", bm);
    toast(same ? "Penanda dibuang" : replaced ? "Penanda surah ini dipindahkan ke sini" : "Penanda disimpan");
  }

  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--arab-size", settings.size + "px");
    const dark = settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? "#0f1614" : "#0f5a50";
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
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const firstWords = (t, n) => t.replace(/۞\s*/g, "").split(" ").slice(0, n).join(" ");
  const place = (list, p) => `${esc(list[p.s - 1].t)}, ayat ${p.a}`;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400);
  }

  // First ayah [surah, ayah] of each juzuk (standard Hafs division).
  const JUZ = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
  const juzStartAt = (s, a) => JUZ.findIndex(([js, ja]) => js === s && ja === a) + 1; // 0 if none
  const juzOf = (s, a) => { let j = 1; JUZ.forEach(([js, ja], i) => { if (s > js || (s === js && a >= ja)) j = i + 1; }); return j; };

  // ---------- shared pieces ----------
  const topbar = (title) => `<header class="topbar"><button class="back" data-back><img src="assets/icon-back.png" alt="">Kembali</button>${title ? `<h1>${title}</h1>` : ""}</header>`;
  const arrow = `<span class="arrow" aria-hidden="true">›</span>`;
  const bmChip = (n) => bm[n] ? `<span class="bm-chip"><img src="assets/icon-bookmark.png" alt="">Penanda: ayat ${bm[n]}</span>` : "";
  const groupChip = (list, g) => grp[g] ? `<a class="chip g${g}" href="#/surah/${grp[g].s}/${grp[g].a}"><img src="assets/icon-group${g}.png" alt="">Group ${g} • Juzuk ${juzOf(grp[g].s, grp[g].a)}</a>` : "";

  // ---------- routing ----------
  let navCount = 0, current = null;
  const tabbar = $("#tabbar");
  async function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const m = h.match(/^surah\/(\d+)(?:\/(\d+))?$/);
    const view = m ? "surah" : h.split("/")[0] || "home";
    const tab = { home: "home", "": "home", pilihan: "pilihan", tetapan: "tetapan" }[view];
    tabbar.hidden = view === "surah";
    tabbar.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    app.className = view === "surah" ? "reading" : "";
    current = null;
    placePlayer();
    try {
      if (m && +m[1] >= 1 && +m[1] <= 114) await renderSurah(+m[1], m[2] ? +m[2] : 0);
      else if (view === "cari") await renderCari();
      else if (view === "juzuk") await renderJuzuk();
      else if (view === "penanda") await renderPenanda();
      else if (view === "pilihan") await renderPilihan();
      else if (view === "tetapan") await renderTetapan();
      else if (view === "panduan") await renderPanduan();
      else await renderHome();
    } catch (e) {
      app.innerHTML = `${topbar("")}<p class="empty">Gagal memuat data. Sila sambung ke internet sekali untuk muat turun.</p>`;
    }
    if (!m) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => { navCount++; route(); });
  app.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) { if (navCount > 0) history.back(); else location.hash = "#/"; return; }
    const card = e.target.closest("[data-href]");
    if (card && !e.target.closest("a, button")) location.hash = card.dataset.href;
  });

  // ---------- Utama ----------
  async function renderHome() {
    const list = await getMeta();
    document.title = "Al-Quran untuk Mak";
    const last = lastBookmark();
    app.innerHTML = `
      <div class="band"><img src="assets/orn-header-band.png" alt=""><h1>Al-Quran untuk Mak</h1></div>
      <div class="stack">
        <section class="card greet"><h2>Assalamualaikum, mak</h2><p>Baca Al-Quran 114 surah</p></section>
        <img class="divider" src="assets/orn-divider.png" alt="">
        <div class="card nav-card" data-href="#/penanda" role="link" tabindex="0">
          <div class="nav-row"><img src="assets/icon-bookmark.png" alt="">
            <div class="nav-text"><h3>Penanda Buku</h3><p>${bmCount() ? `${bmCount()} surah ada penanda` : "Belum ada penanda"}</p></div>${arrow}</div>
          ${last ? `<a class="btn primary block" href="#/surah/${last.s}/${last.a}"><img src="assets/icon-continue.png" alt="">Sambung: ${place(list, last)}</a>` : ""}
        </div>
        <div class="card nav-card" data-href="#/juzuk" role="link" tabindex="0">
          <div class="nav-row"><img src="assets/icon-juzuk.png" alt="">
            <div class="nav-text"><h3>Juzuk</h3><p>30 juzuk</p></div>${arrow}</div>
          ${grp[1] || grp[2] ? `<div class="chip-col">${groupChip(list, 1)}${groupChip(list, 2)}</div>` : ""}
        </div>
        <div class="card nav-card" data-href="#/cari" role="link" tabindex="0">
          <div class="nav-row"><img src="assets/icon-search.png" alt="">
            <div class="nav-text"><h3>Cari Surah</h3><p>114 surah</p></div>${arrow}</div>
        </div>
        <div class="card nav-card help" data-href="#/panduan" role="link" tabindex="0">
          <div class="nav-row"><img src="assets/icon-help.png" alt="">
            <div class="nav-text"><h3>Rujukan &amp; Panduan</h3><p>Tekan untuk buka panduan</p></div>${arrow}</div>
        </div>
      </div>`;
  }

  // ---------- Cari Surah ----------
  let cariQ = "";
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ\-'’`]/g, "");
  const surahRow = (s) => `<li class="card"><a class="row" href="#/surah/${s.n}"><span class="num">${s.n}</span>
      <span class="row-main"><b>${esc(s.t)}</b><small>${esc(s.id)} • ${s.v} ayat</small>${bmChip(s.n)}</span>
      <span class="ar-name">${s.ar}</span></a></li>`;
  async function renderCari() {
    document.title = "Cari Surah • Al-Quran untuk Mak";
    app.innerHTML = `${topbar("Cari Surah")}
      <div class="stack">
        <label class="search"><img src="assets/icon-search.png" alt=""><input id="q" type="search" placeholder="Taip nama surah…" value="${esc(cariQ)}" autocomplete="off" aria-label="Cari surah"></label>
        <div class="section-head"><h2>Senarai Surah</h2><span class="count">114 surah</span></div>
        <div id="results"></div>
      </div>`;
    let t;
    $("#q").addEventListener("input", (e) => { cariQ = e.target.value; clearTimeout(t); t = setTimeout(renderResults, 200); });
    renderResults();
  }
  async function renderResults() {
    const box = $("#results"); if (!box) return;
    const list = await getMeta();
    const q = cariQ.trim();
    if (!q) { box.innerHTML = `<ul class="list">${list.map(surahRow).join("")}</ul>`; return; }
    const nq = norm(q), num = /^\d+$/.test(q) ? +q : 0;
    const bySurah = list.filter((s) => s.n === num || norm(s.t).includes(nq) || norm(s.id).includes(nq) || norm(s.en).includes(nq) || s.ar.includes(q));
    box.innerHTML = (bySurah.length ? `<ul class="list">${bySurah.map(surahRow).join("")}</ul>` : "") + (q.length >= 3 ? `<p class="empty" id="vs">Mencari dalam ayat…</p>` : "");
    if (q.length < 3) { if (!bySurah.length) box.innerHTML = `<p class="empty">Tiada surah dijumpai.</p>`; return; }
    const token = (renderResults.tok = {});
    const key = settings.lang || "m", hits = [];
    const all = await Promise.all(list.map((s) => getSurah(s.n).catch(() => null)));
    if (renderResults.tok !== token) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    outer: for (let i = 0; i < all.length; i++) {
      const d = all[i]; if (!d) continue;
      for (let j = 0; j < d.a.length; j++) {
        if (re.test(d[key][j]) || re.test(d.t[j])) hits.push([i + 1, j + 1, d]);
        re.lastIndex = 0;
        if (hits.length >= 60) break outer;
      }
    }
    const vs = $("#vs"); if (!vs) return;
    vs.outerHTML = hits.length ? `<div class="section-head"><h2>Ayat yang sepadan</h2><span class="count">${hits.length}${hits.length >= 60 ? "+" : ""}</span></div><div class="stack">` + hits.map(([s, a, d]) =>
      `<a class="card hit" href="#/surah/${s}/${a}"><b>${esc(list[s - 1].t)} ${s}:${a}</b><div>${esc(d[key][a - 1]).replace(re, "<mark>$&</mark>")}</div></a>`).join("") + "</div>"
      : (bySurah.length ? "" : `<p class="empty">Tiada hasil.</p>`);
  }

  // ---------- Juzuk ----------
  async function renderJuzuk() {
    document.title = "Juzuk • Al-Quran untuk Mak";
    const list = await getMeta();
    const data = await Promise.all(JUZ.map(([s]) => getSurah(s)));
    const gcard = (g) => {
      const p = grp[g];
      return p ? `<a class="grp-card g${g}" href="#/surah/${p.s}/${p.a}"><img src="assets/icon-group${g}.png" alt=""><span class="g-name">Group ${g}</span><b>Juzuk ${juzOf(p.s, p.a)}</b><small>${place(list, p)}</small></a>`
        : `<div class="grp-card g${g}"><img src="assets/icon-group${g}.png" alt=""><span class="g-name">Group ${g}</span><small>Belum ditanda</small></div>`;
    };
    app.innerHTML = `${topbar("Juzuk")}
      <div class="stack">
        <div class="grp-cards">${gcard(1)}${gcard(2)}</div>
        <div class="section-head"><h2>Senarai 30 Juzuk</h2></div>
        <p class="muted" style="margin:0">Bulatan <b style="color:var(--g1)">biru</b> (Group 1) dan <b style="color:var(--g2)">merah jambu</b> (Group 2) penuh bila penanda group ada dalam juzuk itu. Tekan bulatan penuh untuk buka penanda. Untuk tanda, tekan <b>Tanda</b> pada ayat.</p>
        <ul class="list">${JUZ.map(([s, a], i) => {
          const j = i + 1;
          const btns = GROUPS.map((g) => grp[g] && juzOf(grp[g].s, grp[g].a) === j
            ? `<a class="g-dot g${g} on" href="#/surah/${grp[g].s}/${grp[g].a}" aria-label="Buka penanda Group ${g}: ${place(list, grp[g])}">${g}</a>`
            : `<span class="g-dot g${g}" aria-label="Group ${g}: tiada penanda dalam juzuk ini">${g}</span>`).join("");
          return `<li class="card" style="display:flex;align-items:center;padding-right:12px"><a class="row" style="flex:1;min-width:0" href="#/surah/${s}/${a}"><span class="num">${j}</span>
            <span class="row-main"><b>Juzuk ${j}</b><small>${esc(list[s - 1].t)}, ayat ${a}</small><span class="juz-ar">${firstWords(data[i].a[a - 1], 3)}</span></span></a>
            <div class="g-btns">${btns}</div></li>`;
        }).join("")}</ul>
      </div>`;
  }

  // ---------- Penanda Buku ----------
  async function renderPenanda() {
    document.title = "Penanda Buku • Al-Quran untuk Mak";
    const list = await getMeta();
    const keys = Object.keys(bm).map(Number).sort((x, y) => x - y);
    app.innerHTML = `${topbar("Penanda Buku")}
      <div class="stack">
        <p class="muted" style="margin:0;text-align:center">Satu penanda bagi setiap surah.</p>
        ${keys.length ? keys.map((n) => `<section class="card bm-card">
          <div class="nav-row"><img src="assets/icon-bookmark.png" alt="">
            <div class="nav-text"><h3>${esc(list[n - 1].t)}</h3><p>Ayat ${bm[n]} daripada ${list[n - 1].v}</p></div>
            <button class="small-btn" data-del="${n}">Buang</button></div>
          <a class="btn primary block" href="#/surah/${n}/${bm[n]}"><img src="assets/icon-continue.png" alt="">Sambung baca</a>
        </section>`).join("") : `<section class="card" style="text-align:center">
          <img src="assets/icon-bookmark.png" alt="" style="width:64px;height:64px">
          <h3 style="margin:6px 0 2px">Belum ada penanda</h3>
          <p class="muted" style="margin:0">Tekan <b>Tanda</b> pada mana-mana ayat untuk simpan tempat bacaan.</p></section>`}
        ${grp[1] || grp[2] ? `<div class="section-head"><h2>Bacaan Group</h2></div><div class="chip-col">${groupChip(list, 1)}${groupChip(list, 2)}</div>` : ""}
      </div>`;
    app.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      delete bm[b.dataset.del]; store.set("bm", bm); toast("Penanda dibuang"); renderPenanda();
    }));
  }

  // ---------- Surah Pilihan ----------
  const PILIHAN = [[36], [18], [67], [56], [55], [2, 255, "Ayat Kursi"]];
  async function renderPilihan() {
    document.title = "Surah Pilihan • Al-Quran untuk Mak";
    const list = await getMeta();
    app.innerHTML = `
      <div class="title-row"><img src="assets/icon-pilihan.png" alt=""><h1>Surah Pilihan</h1></div>
      <p class="muted" style="margin:4px 0 10px">Surah yang Mak selalu baca</p>
      <img class="divider" src="assets/orn-divider.png" alt="" style="margin-bottom:14px">
      <div class="tiles">${PILIHAN.map(([n, a, label]) => {
        const s = list[n - 1];
        return `<div class="card tile" data-href="#/surah/${n}${a ? "/" + a : ""}" role="link" tabindex="0">
          <span class="t-ar">${a ? "آية الكرسي" : s.ar}</span><b>${label || esc(s.t)}</b>
          <small>${a ? `${esc(s.t)} ${a}` : `${s.v} ayat`}</small>
          ${!a && bm[n] ? `<a class="bm-chip" href="#/surah/${n}/${bm[n]}"><img src="assets/icon-bookmark.png" alt="">Penanda: ayat ${bm[n]}</a>` : ""}
        </div>`;
      }).join("")}</div>`;
  }

  // ---------- Tetapan ----------
  let offlineMsg = store.get("offline2", false) ? "✓ Semua surah sudah dimuat turun" : "";
  async function renderTetapan() {
    document.title = "Tetapan • Al-Quran untuk Mak";
    const seg = (key, opts) => opts.map(([v, l]) => `<button class="${settings[key] === v ? "on" : ""}" data-set="${key}" data-v="${v}">${l}</button>`).join("");
    app.innerHTML = `
      <div class="title-row"><img src="assets/icon-settings.png" alt=""><h1>Tetapan</h1></div>
      <div class="stack" style="margin-top:14px">
        <section class="card set-card"><h3>Saiz tulisan Arab</h3>
          <div class="preview">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>
          <div class="size-row"><button class="btn outline" data-size="-2">A− Kecil</button><b class="size-val">${settings.size}</b><button class="btn outline" data-size="2">A+ Besar</button></div>
        </section>
        <section class="card set-card"><h3>Tema</h3>
          <div class="seg">${seg("theme", [["light", "Cerah"], ["dark", "Gelap"], ["auto", "Ikut telefon"]])}</div>
        </section>
        <section class="card set-card"><h3>Terjemahan</h3>
          <div class="radios">${[["m", "Bahasa Melayu (Basmeih)"], ["e", "English"], ["", "Tiada"]].map(([v, l]) => `<button class="radio ${settings.lang === v ? "on" : ""}" data-set="lang" data-v="${v}">${l}</button>`).join("")}</div>
        </section>
        <section class="card set-card"><div class="switch-row"><div><h3>Tunjuk rumi</h3><p class="muted" style="margin:0">Ejaan Latin di bawah setiap ayat</p></div>
          <button class="switch ${settings.translit ? "on" : ""}" id="sw-translit" role="switch" aria-checked="${settings.translit}" aria-label="Tunjuk rumi"></button></div>
        </section>
        <section class="card set-card"><h3>Luar talian</h3>
          <p class="muted" id="offline-status">${offlineMsg || "Muat turun semua surah supaya boleh dibaca tanpa internet."}</p>
          <button class="btn outline block" id="btn-offline">Muat turun semua surah</button>
        </section>
        ${!standalone() ? `<section class="card set-card"><h3>Pasang app</h3><p class="muted">Letak ikon Al-Quran di skrin utama telefon.</p><button class="btn primary block" id="btn-install-set">Pasang Sekarang</button></section>` : ""}
        ${waitingSW ? `<button class="btn primary block" id="btn-update-set">Kemas Kini Sekarang</button>` : ""}
        <p class="muted small" style="text-align:center">${VERSION_LABEL} • Al-Quran untuk Mak</p>
      </div>`;
    app.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
      settings[b.dataset.set] = b.dataset.v; saveSettings(); applySettings(); renderTetapan();
    }));
    app.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => changeSize(+b.dataset.size)));
    $("#sw-translit").onclick = () => { settings.translit = !settings.translit; saveSettings(); renderTetapan(); };
    $("#btn-offline").onclick = () => cacheAll(true);
    const bi = $("#btn-install-set"); if (bi) bi.onclick = () => { shown = false; try { sessionStorage.removeItem("q:dismiss"); } catch {} showInstall(); };
    const bu = $("#btn-update-set"); if (bu) bu.onclick = applyUpdate;
  }
  function changeSize(d) {
    settings.size = Math.min(48, Math.max(22, settings.size + d)); saveSettings(); applySettings();
    document.querySelectorAll(".size-val").forEach((e) => (e.textContent = settings.size));
  }

  // ---------- Panduan ----------
  async function renderPanduan() {
    document.title = "Rujukan & Panduan • Al-Quran untuk Mak";
    app.innerHTML = `${topbar("Panduan")}
      <div class="stack">
        <section class="card set-card"><h3>Cara guna</h3>
          <ol class="guide">
            <li><b>Cari Surah</b>: tekan nama surah untuk mula membaca.</li>
            <li><b>Dengar</b>: tekan di bawah ayat untuk dengar bacaan. Ia terus ke ayat seterusnya.</li>
            <li><b>Tanda</b>: simpan tempat bacaan sebagai <b>Penanda saya</b>, <b>Group 1</b> atau <b>Group 2</b>.</li>
            <li><b>Sambung</b>: di halaman Utama, tekan butang hijau untuk terus ke penanda terakhir.</li>
            <li><b>Juzuk</b>: lihat 30 juzuk dan tanda bacaan Group 1 atau Group 2.</li>
            <li><b>Aa</b>: besarkan atau kecilkan tulisan Arab.</li>
          </ol>
        </section>
        <section class="card set-card refs"><h3>Rujukan</h3>
          <ul>
            <li><b>Teks Arab (Uthmani):</b> pakej <i>quran-json</i> (CC-BY-4.0), berasal daripada projek Tanzil</li>
            <li><b>Terjemahan Melayu:</b> Abdullah Muhammad Basmeih, <i>Tafsir Pimpinan Ar-Rahman</i> (versi Tanzil)</li>
            <li><b>Terjemahan English &amp; transliterasi:</b> pakej <i>quran-json</i></li>
            <li><b>Fon:</b> KFGQPC Uthmanic Script HAFS, Kompleks Percetakan Al-Quran Raja Fahd, Madinah; Plus Jakarta Sans (OFL)</li>
            <li><b>Audio:</b> Mishary Alafasy (cdn.islamic.network, perlu internet)</li>
          </ul>
          <p class="muted small">Sila bandingkan dengan Mushaf bercetak. Jika ada kesilapan, maklumkan kepada Mohammad Adzim.</p>
        </section>
      </div>`;
  }

  // ---------- Bacaan ----------
  function markState(n, a) {
    return { bm: bm[n] === a, g1: !!(grp[1] && grp[1].s === n && grp[1].a === a), g2: !!(grp[2] && grp[2].s === n && grp[2].a === a) };
  }
  function markParts(n, a) {
    const st = markState(n, a);
    const pills = (st.bm ? `<span class="pill st-bm">Penanda</span>` : "") + (st.g1 ? `<span class="pill st-g1">Group 1</span>` : "") + (st.g2 ? `<span class="pill st-g2">Group 2</span>` : "");
    const first = st.bm ? "bm" : st.g1 ? "g1" : st.g2 ? "g2" : "";
    const label = first ? "✓ " + { bm: "Penanda", g1: "Group 1", g2: "Group 2" }[first] : "Tanda";
    return { st, pills, first, label };
  }
  function ayahHtml(n, a, d) {
    const i = a - 1, lang = settings.lang, mp = markParts(n, a);
    const cls = ["bm", "g1", "g2"].filter((k) => mp.st[k]).map((k) => "m-" + k).join(" ");
    const jn = juzStartAt(n, a);
    return `${jn ? `<div class="juz-mark">Juzuk ${jn}</div>` : ""}<article class="card ayah ${cls}" id="a${a}" data-a="${a}">
      <div class="pills"><span class="pill no">${n}:${a}</span><span class="pill juz">Juzuk ${juzOf(n, a)}</span><span class="st-pills pills">${mp.pills}</span></div>
      <div class="arab" lang="ar" dir="rtl">${d.a[i]} <span class="aend">${arDigits(a)}</span></div>
      ${settings.translit ? `<div class="translit">${esc(d.t[i])}</div>` : ""}
      ${lang ? `<div class="trans">${esc(d[lang][i])}</div>` : ""}
      <div class="acts">
        <button class="act" data-act="play"><img src="assets/icon-play.png" alt=""><span>Dengar</span></button>
        <button class="act ${mp.first ? "m-" + mp.first : ""}" data-act="mark"><img src="assets/icon-bookmark.png" alt=""><span>${mp.label}</span></button>
      </div>
    </article>`;
  }
  function refreshMarks() {
    if (!current) return;
    app.querySelectorAll(".ayah").forEach((el) => {
      const a = +el.dataset.a, mp = markParts(current.n, a);
      ["bm", "g1", "g2"].forEach((k) => el.classList.toggle("m-" + k, mp.st[k]));
      el.querySelector(".st-pills").innerHTML = mp.pills;
      const b = el.querySelector('[data-act="mark"]');
      b.className = "act" + (mp.first ? " m-" + mp.first : "");
      b.querySelector("span").textContent = mp.label;
    });
  }

  async function renderSurah(n, focus) {
    const list = await getMeta();
    const s = list[n - 1], d = await getSurah(n);
    current = { n, d, s };
    document.title = `${s.t} • Al-Quran untuk Mak`;
    const showBism = n !== 1 && n !== 9;
    let html = `<header class="topbar"><button class="back" data-back><img src="assets/icon-back.png" alt="">Kembali</button><button class="aa" id="btn-aa" aria-label="Saiz tulisan">Aa</button></header>
      <div class="stack">
        <div class="s-head">
          <div class="frame"><img src="assets/orn-title-frame.png" alt=""><span>سُورَةُ ${s.ar}</span></div>
          <div class="s-info">${esc(s.t)} • ${s.v} ayat • ${s.type === "meccan" ? "Makkiyah" : "Madaniyyah"}</div>
          ${showBism ? `<div class="bismillah">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>` : ""}
          <img class="divider" src="assets/orn-divider.png" alt="" style="margin-top:6px">
        </div>
        <button class="btn outline block" id="play-all"><img src="assets/icon-play.png" alt="">Dengar surah ini</button>`;
    for (let a = 1; a <= d.a.length; a++) html += ayahHtml(n, a, d);
    html += `<div class="surah-nav">
        ${n > 1 ? `<a class="btn outline" href="#/surah/${n - 1}">‹ ${esc(list[n - 2].t)}</a>` : ""}
        ${n < 114 ? `<a class="btn primary" href="#/surah/${n + 1}">${esc(list[n].t)} ›</a>` : ""}
      </div></div>`;
    app.innerHTML = html;
    $("#btn-aa").onclick = openSize;
    $("#play-all").onclick = () => play(n, 1);
    app.querySelectorAll(".ayah .acts").forEach((box) => box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = +b.closest(".ayah").dataset.a;
      if (b.dataset.act === "play") { if (pl && pl.n === n && pl.a === a) togglePause(); else play(n, a); }
      else openMark(n, a);
    }));
    if (focus) { const el = $("#a" + focus); if (el) el.scrollIntoView({ block: "start" }); }
    else window.scrollTo(0, 0);
    highlightPlaying();
  }

  // Tanda sheet
  const mOv = $("#mark-overlay");
  let markAt = null;
  function syncMarkSheet() {
    const st = markState(markAt.n, markAt.a);
    mOv.querySelectorAll(".mark-opt").forEach((o) => o.classList.toggle("on", st[o.dataset.k]));
  }
  async function openMark(n, a) {
    const list = await getMeta();
    markAt = { n, a };
    $("#mark-sub").textContent = `${list[n - 1].t} • Ayat ${a} • Juzuk ${juzOf(n, a)}`;
    syncMarkSheet(); mOv.hidden = false;
  }
  mOv.querySelectorAll(".mark-opt").forEach((o) => o.addEventListener("click", () => {
    const { n, a } = markAt;
    if (o.dataset.k === "bm") toggleBookmark(n, a); else setGroup(+o.dataset.k[1], n, a);
    syncMarkSheet(); refreshMarks();
    setTimeout(() => (mOv.hidden = true), 250);
  }));
  $("#mark-cancel").onclick = () => (mOv.hidden = true);
  mOv.addEventListener("click", (e) => { if (e.target === mOv) mOv.hidden = true; });

  // Aa sheet
  const zOv = $("#size-overlay");
  function openSize() { zOv.querySelector(".size-val").textContent = settings.size; zOv.hidden = false; }
  zOv.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => changeSize(+b.dataset.size)));
  $("#size-done").onclick = () => (zOv.hidden = true);
  zOv.addEventListener("click", (e) => { if (e.target === zOv) zOv.hidden = true; });

  // ---------- audio ----------
  const audio = new Audio(); audio.preload = "none";
  let pl = null; // {n, a}
  function placePlayer() { $("#player").style.bottom = tabbar.hidden ? "0px" : tabbar.offsetHeight + "px"; }
  async function play(n, a) {
    const list = await getMeta();
    pl = { n, a };
    audio.src = AUDIO + (list[n - 1].s + a - 1) + ".mp3";
    $("#player").hidden = false; placePlayer();
    $("#player-title").textContent = `${list[n - 1].t} • Ayat ${a}`;
    try { await audio.play(); } catch { toast("Audio perlu sambungan internet"); }
    highlightPlaying(true);
  }
  function togglePause() { if (audio.paused) audio.play(); else audio.pause(); }
  function highlightPlaying(scroll) {
    $("#p-toggle").textContent = audio.paused ? "▶" : "⏸";
    document.querySelectorAll(".ayah").forEach((el) => {
      const on = !!(pl && current && pl.n === current.n && pl.a === +el.dataset.a);
      el.classList.toggle("playing", on);
      const b = el.querySelector('[data-act="play"]');
      b.classList.toggle("on", on && !audio.paused);
      b.querySelector("span").textContent = on && !audio.paused ? "Jeda" : "Dengar";
      if (on && scroll) el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
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
  audio.addEventListener("play", () => highlightPlaying());
  audio.addEventListener("pause", () => highlightPlaying());
  audio.addEventListener("error", () => { if (pl) toast("Audio tidak dapat dimainkan (tiada internet?)"); });
  $("#p-next").onclick = () => step(1);
  $("#p-prev").onclick = () => step(-1);
  $("#p-close").onclick = closePlayer;
  $("#p-toggle").onclick = togglePause;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

  // ---------- offline ----------
  async function cacheAll(manual) {
    if (store.get("offline2", false) && !manual) return;
    const say = (m) => { offlineMsg = m; const st = $("#offline-status"); if (st) st.textContent = m; };
    try {
      const list = await getMeta();
      let done = 0;
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map((s) => getSurah(s.n).then(() => { done++; if (manual) say(`Memuat turun ${done}/114…`); })));
      }
      store.set("offline2", true);
      say("✓ Semua surah sudah dimuat turun");
      if (manual) toast("Siap! Boleh dibaca tanpa internet");
    } catch { say("Gagal. Cuba lagi dengan internet."); }
  }

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
  function standalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null, shown = false;
  function showInstall() {
    if (standalone() || shown) return;
    if (!splashGone) return splashDone.then(showInstall);
    try { if (sessionStorage.getItem("q:dismiss")) return; } catch {}
    shown = true;
    const steps = $("#install-steps");
    if (deferred) { steps.hidden = true; $("#btn-install").hidden = false; }
    else {
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
    ov.hidden = true;
    if (r.outcome === "accepted") toast("Memasang…");
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    if (shown) { shown = false; ov.hidden = true; } // fallback steps were showing; switch to the real button
    showInstall();
  });
  window.addEventListener("appinstalled", () => { deferred = null; ov.hidden = true; toast("Al-Quran telah dipasang"); });
  $("#btn-install").onclick = doInstall;
  $("#btn-install-later").onclick = hideInstall;
  ov.addEventListener("click", (e) => { if (e.target === ov) hideInstall(); });
  // If the browser does not fire beforeinstallprompt (iOS Safari, Firefox...), show manual steps.
  setTimeout(() => { if (!deferred) showInstall(); }, isIOS || !("onbeforeinstallprompt" in window) ? 1200 : 3000);

  // ---------- app updates ----------
  const uOv = $("#update-overlay");
  let waitingSW = null, reloading = false;
  function offerUpdate(sw) { waitingSW = sw; splashDone.then(() => { uOv.hidden = false; }); }
  function applyUpdate() {
    $("#btn-update").textContent = "Mengemas kini…";
    if (waitingSW) waitingSW.postMessage("SKIP_WAITING"); else location.reload();
  }
  $("#btn-update").onclick = applyUpdate;
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
