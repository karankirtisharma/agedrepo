"""Builds public/demos/demos.json from tools/notion_list.txt (category line, then its URLs).

    python tools/build_demos.py

Names come from each site's <title> (cleaned); the first 16 keep the names already chosen.
Categories are grouped into a few simple filter chips (GROUPS); the card still shows the exact niche.
"""
import html
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "demos" / "demos.json"

GROUPS = {
    "Food & Drink": ["Restaurant", "Cafe", "Pizza", "Cake Shop"],
    "Health & Fitness": ["Fitness & Gym", "Fitness Coach", "Dental Clinic", "Medical", "Dermatologist"],
    "Beauty & Wellness": ["Wellness", "Spa", "Barber", "Salon"],
    "Home Services": ["HVAC", "Roofing", "Plumbing", "Construction", "Renovation & Remodeling", "Landscaping", "Painting", "Cleaning", "Laundry", "Handyman", "Paving", "Pressure Washing", "Home Solutions", "Home Decor"],
    "Real Estate": ["Real Estate", "Real Estate Main"],
    "Shops": ["Furniture", "Clothing & Fashion", "Jewelry", "Electronics", "Flower Shop"],
    "Hotels & Travel": ["Hotel", "Resort", "Travel Agency"],
    "Schools & Kids": ["Preschool", "Kids Play School", "Driving School", "University & Education", "Tutoring & Coaching"],
    "Auto": ["Car Wash & Auto"],
    "Business & Tech": ["Law Firm", "Solar Energy", "Tech Events", "Video Editing", "Personal Branding"],
}
# demos whose intro animation needs a longer (or shorter) wait before the screenshot, in ms
WAITS = {"sushi-bar": 2500, }
# listed in Notion but the site returns 404 (unpublished or mistyped): left out until fixed
SKIP = {"https://marrowbuildconstructiondemo.framer.website/", "https://realestatesdemo.framer.website/", "https://electronicshop.framer.website/"}
# hand-picked ids and names for the first 16 (their thumbnails are filed under these ids)
PINNED = {
    'https://restaurantdemosite.framer.website/': ('burger-joint', 'Burger Joint'),
    'https://restaurantdemo1.framer.website/': ('restroo', 'Restroo Dining'),
    'https://restaurantdemo2.framer.website/': ('veloria', 'Veloria'),
    'https://restaurantdemo03.framer.website/': ('sofra', 'Sofra'),
    'https://restaurantdemoshushi.framer.website/': ('sushi-bar', 'Sushi Bar'),
    'https://germanrestaurant.framer.website/': ('german-kitchen', 'German Kitchen'),
    'https://modernrestaurant01.framer.website/': ('bramble', 'Bramble'),
    'https://cafedemo1.framer.website/': ('cafenza', 'Cafenza'),
    'https://cafedemo2.framer.website/': ('la-paloma', 'La Paloma'),
    'https://cafedemosite.framer.website/': ('latte', 'Latte'),
    'https://cafe3ddemo.framer.website/': ('kafoska', 'Kafoska'),
    'https://coffedemosite.netlify.app/': ('mello', 'Mello'),
    'https://pizzademo1.framer.website/': ('pepper', 'Pepper'),
    'https://pizzademo2.framer.website/': ('slice-town', 'Slice Town'),
    'https://fitnesscenterdemo.framer.website/': ('energize', 'Energize'),
    'https://gymdemosite.framer.website/': ('iron-house', 'Iron House Gym'),
}

GROUP_OF = {c: g for g, cs in GROUPS.items() for c in cs}

existing = {u: {"id": i, "name": n} for u, (i, n) in PINNED.items()}


def parse():
    cat, rows = None, []
    for line in (ROOT / "tools" / "notion_list.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("http"):
            rows.append((cat, line))
        else:
            cat = line
    return rows


def title(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=20).read(200000).decode("utf-8", "ignore")
        m = re.search(r"<title>(.*?)</title>", raw, re.S | re.I)
        return html.unescape(m.group(1)).strip() if m else ""
    except Exception:
        return ""


def clean(t, cat, n):
    t = re.split(r"\s[–—|·:]\s|\s-\s|\s\|\s", t)[0].strip()
    t = re.sub(r"(?i)\b(framer )?(template|demo( site)?|website|web site|landing page)\b", "", t).strip(" -–—|·:")
    t = re.sub(r"[^\x20-\x7e]", "", t)
    t = re.sub(r"(?i)\b(high[- ]?converting|converting|web ?theory|premium|site)\b", "", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—|·:")
    # a name that is just the niche (or a lowercase / numbered scrap of it) isn't a name: "Roofing 3"
    plain = re.sub(r"[^a-z]", "", t.lower())
    niche = re.sub(r"[^a-z]", "", cat.lower())
    generic = {"", "home", "welcome", "untitled", "framer", "newproject", "site"}
    if plain in generic or len(t) > 28 or len(t) < 3 or t[0].islower() or niche in plain or plain in niche:
        return f"{cat} {n}"
    return t


rows = [r for r in parse() if r[1] not in SKIP]
with ThreadPoolExecutor(12) as ex:
    titles = list(ex.map(title, [u for _, u in rows]))

seen, out, per_cat = {}, [], {}
for (cat, url), t in zip(rows, titles):
    per_cat[cat] = per_cat.get(cat, 0) + 1
    base = existing.get(url)
    name = base["name"] if base else clean(t, cat, per_cat[cat])
    ident = base["id"] if base else re.sub(r"[^a-z0-9]+", "-", re.sub(r"https?://|\..*", "", url).lower()).strip("-")
    entry = {"id": ident, "name": name, "category": cat, "group": GROUP_OF[cat], "url": url}
    if ident in WAITS:
        entry["wait"] = WAITS[ident]
    # two demos can end up with the same name: number them
    seen[name] = seen.get(name, 0) + 1
    if seen[name] > 1:
        entry["name"] = f"{name} {seen[name]}"
    out.append(entry)

OUT.write_text("[\n" + ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in out) + "\n]\n", encoding="utf-8")
missing = [c for c in {c for c, _ in rows} if c not in GROUP_OF]
print(len(out), "demos;", len(GROUPS), "groups; ungrouped:", missing)
for g in GROUPS:
    print(f"  {g}: {sum(1 for e in out if e['group'] == g)}")
