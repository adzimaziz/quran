"""Build compact per-surah data files from the quran-json npm package (CC-BY-4.0).
Malay translation: Basmeih (Tanzil) via fawazahmed0/quran-api, scripts/ms-basmeih.json.
Usage: python3 scripts/build_data.py <path-to-quran-json/dist>"""
import json, sys, os
src = sys.argv[1]
ld = lambda f: json.load(open(os.path.join(src, f), encoding="utf-8"))
ar, en, tr = ld("quran.json"), ld("quran_en.json"), ld("quran_transliteration.json")
ms = {}
for r in json.load(open(os.path.join(os.path.dirname(__file__), "ms-basmeih.json"), encoding="utf-8"))["quran"]:
    ms.setdefault(r["chapter"], []).append(r["text"].strip())
NAMES = "Pembukaan|Lembu Betina|Keluarga Imran|Wanita|Hidangan|Binatang Ternakan|Tempat Tertinggi|Harta Rampasan Perang|Taubat|Nabi Yunus|Nabi Hud|Nabi Yusuf|Guruh|Nabi Ibrahim|Hijr|Lebah|Perjalanan Malam|Gua|Maryam|Taha|Para Nabi|Haji|Orang-orang Beriman|Cahaya|Pembeza|Penyair|Semut|Kisah-kisah|Labah-labah|Bangsa Rom|Luqman|Sujud|Golongan Bersekutu|Saba'|Pencipta|Yasin|Barisan|Sad|Rombongan|Yang Maha Pengampun|Dijelaskan|Musyawarah|Perhiasan|Kabut|Berlutut|Bukit Pasir|Muhammad|Kemenangan|Bilik-bilik|Qaf|Angin yang Menerbangkan|Bukit Tur|Bintang|Bulan|Yang Maha Pemurah|Hari Kiamat|Besi|Perempuan yang Mengadu|Pengusiran|Wanita yang Diuji|Barisan|Hari Jumaat|Orang Munafik|Hari Terzahirnya Kerugian|Perceraian|Pengharaman|Kerajaan|Pena|Hari yang Pasti|Tangga-tangga|Nabi Nuh|Jin|Orang yang Berselimut|Orang yang Berkemul|Kebangkitan|Manusia|Yang Dihantar|Berita Besar|Malaikat Pencabut|Bermasam Muka|Penggulungan|Pecah Belah|Orang yang Curang|Terbelah|Gugusan Bintang|Yang Datang pada Waktu Malam|Yang Maha Tinggi|Hari Pembalasan|Fajar|Negeri|Matahari|Malam|Waktu Dhuha|Kelapangan|Buah Tin|Segumpal Darah|Kemuliaan|Bukti Nyata|Kegoncangan|Kuda Perang|Hari Penggemparan|Bermegah-megah|Masa|Pengumpat|Gajah|Quraisy|Barang Berguna|Kebaikan Berlimpah|Orang-orang Kafir|Pertolongan|Sabut|Ikhlas|Waktu Subuh|Manusia".split("|")
assert len(NAMES) == 114, len(NAMES)
meta, start = [], 1
os.makedirs("data", exist_ok=True)
for i, s in enumerate(ar):
    n = s["total_verses"]
    assert len(ms[s["id"]]) == len(en[i]["verses"]) == len(tr[i]["verses"]) == n
    meta.append({"n": s["id"], "ar": s["name"], "t": s["transliteration"], "id": NAMES[i],
                 "en": en[i]["translation"], "type": s["type"], "v": n, "s": start})
    start += n
    d = {"a": [v["text"] for v in s["verses"]], "m": ms[s["id"]],
         "e": [v["translation"] for v in en[i]["verses"]], "t": [v["transliteration"] for v in tr[i]["verses"]]}
    json.dump(d, open(f"data/{s['id']}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(meta, open("data/meta.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ayat:", start - 1)
