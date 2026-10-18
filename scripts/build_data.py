"""Build compact per-surah data files from the quran-json npm package (CC-BY-4.0).
Usage: python3 scripts/build_data.py <path-to-quran-json/dist>"""
import json, sys, os
src = sys.argv[1]
ld = lambda f: json.load(open(os.path.join(src, f), encoding="utf-8"))
ar, idn, en, tr = ld("quran.json"), ld("quran_id.json"), ld("quran_en.json"), ld("quran_transliteration.json")
meta, start = [], 1
os.makedirs("data", exist_ok=True)
for i, s in enumerate(ar):
    n = s["total_verses"]
    assert len(idn[i]["verses"]) == len(en[i]["verses"]) == len(tr[i]["verses"]) == n
    meta.append({"n": s["id"], "ar": s["name"], "t": s["transliteration"], "id": idn[i]["translation"],
                 "en": en[i]["translation"], "type": s["type"], "v": n, "s": start})
    start += n
    d = {"a": [v["text"] for v in s["verses"]], "i": [v["translation"] for v in idn[i]["verses"]],
         "e": [v["translation"] for v in en[i]["verses"]], "t": [v["transliteration"] for v in tr[i]["verses"]]}
    json.dump(d, open(f"data/{s['id']}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(meta, open("data/meta.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ayat:", start - 1)
