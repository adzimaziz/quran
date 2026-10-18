# Al-Quran Digital (PWA)

Al-Quran lengkap 114 surah (6,236 ayat) — teks Arab, terjemahan Melayu (Basmeih)/English, transliterasi, audio (Alafasy), penanda, carian, mod gelap. Boleh dipasang di telefon dan berfungsi tanpa internet.

## Jalankan
Hos di pelayan statik HTTPS (cth. GitHub Pages) supaya boleh dipasang. Untuk ujian: `python3 -m http.server 8000`.

Semasa dibuka, aplikasi memaparkan prompt "Pasang" (butang pemasangan Chrome/Android; panduan manual untuk iOS Safari).

## Data
`data/` dijana dengan `scripts/build_data.py` daripada pakej npm `quran-json` (CC-BY-4.0). Fon KFGQPC Uthmanic Script HAFS (fail asal tanpa ubahan; lesen dalam `fonts/LICENSE-KFGQPC.txt`).

## GitHub Pages
Settings → Pages → Source: *Deploy from a branch* → pilih branch dan folder `/ (root)`. Pautan: `https://adzimaziz.github.io/quran/`.

## Keluarkan kemas kini
Tukar `VERSION` di `sw.js` setiap kali ada perubahan. Pengguna akan nampak popup "Versi baru tersedia" dan menekan **Kemas Kini Sekarang**.
