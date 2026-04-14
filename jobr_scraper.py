"""
Jobr.dk – Job Scraper
Henter rigtige jobs fra Jobnet.dk og Jobindex.dk
"""

import requests, json, re, sys, os, warnings, time
from datetime import datetime, timezone

warnings.filterwarnings("ignore")

OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jobs.json")

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def parse_date(s):
    if not s:
        return ""
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        d = delta.days
        if d == 0: return "I dag"
        if d == 1: return "I går"
        if d < 7:  return f"{d} dage siden"
        if d < 14: return "1 uge siden"
        return f"{d // 7} uger siden"
    except:
        return s[:10] if len(s) >= 10 else s


def clean_html(text):
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


SKILL_KEYWORDS = [
    "python","javascript","typescript","java","c#","c++","golang","rust","php","swift","kotlin","ruby",
    "react","vue","angular","nextjs","next.js","node.js","nodejs","django","flask","fastapi","spring","laravel",
    "sql","postgresql","mysql","mongodb","redis","elasticsearch","kafka","spark","pandas","numpy",
    "scikit-learn","tensorflow","pytorch","machine learning","nlp","llm","data science",
    "aws","azure","gcp","docker","kubernetes","terraform","ci/cd","github actions","linux",
    "figma","sketch","ux","ui","design systems","prototyping","user research","wireframing",
    "excel","powerpoint","jira","scrum","agile","kanban","sap","hubspot","salesforce","crm","power bi","tableau",
    "projektledelse","kommunikation","strategi","ledelse","teamledelse","forretningsudvikling",
    "seo","sem","content marketing","google analytics","email marketing","b2b","b2c","saas",
]


def extract_keywords(text):
    t = text.lower()
    return list({s for s in SKILL_KEYWORDS if re.search(r'(?<!\w)' + re.escape(s) + r'(?!\w)', t)})


# ─── Jobnet.dk ───────────────────────────────────────────────────────────────

def fetch_jobnet(max_pages=5):
    """Henter jobs fra Jobnet.dk's API med session-cookie og korrekte headers"""
    session = requests.Session()
    session.verify = False
    session.headers.update({**BROWSER_HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://job.jobnet.dk/CV/FindWork",
        "Origin": "https://job.jobnet.dk",
        "X-Requested-With": "XMLHttpRequest",
    })

    # Besøg forsiden for cookies + anti-bot bypass
    try:
        session.get("https://job.jobnet.dk/CV/FindWork", timeout=12)
        time.sleep(0.5)
    except Exception as e:
        print(f"  [jobnet] Forside-hentning fejlede: {e}")

    jobs, seen = [], set()
    base = "https://job.jobnet.dk/CV/FindWork/Search"

    for page in range(max_pages):
        # Prøv flere parameter-varianter – Jobnet har ændret API format
        attempts = [
            {"Offset": page*20, "SortValue": "NewestPosted", "widk": "true"},
            {"Offset": page*20, "SortValue": "NewestPosted", "SearchString": "", "Region": "", "widk": "true"},
            {"Offset": page*20, "SortValue": "BestMatch", "SearchString": ""},
        ]
        data = None
        for params in attempts:
            try:
                r = session.get(base, params=params, timeout=15)
                if r.status_code == 200 and r.content and r.text.strip().startswith("{"):
                    data = r.json()
                    break
                elif r.status_code != 200:
                    print(f"  [jobnet] HTTP {r.status_code} ved side {page}")
            except requests.exceptions.JSONDecodeError:
                print(f"  [jobnet] Ikke JSON – svar: {r.text[:200]}")
            except Exception as e:
                print(f"  [jobnet] Fejl: {e}")
                break

        if not data:
            print(f"  [jobnet] Ingen data på side {page} – stopper")
            break

        postings = data.get("JobPositionPostings") or []
        if not postings:
            print(f"  [jobnet] Ingen stillinger på side {page} – slut")
            break

        for p in postings:
            jid = str(p.get("JobPositionPostingIdentifier", ""))
            if jid in seen: continue
            seen.add(jid)

            title   = (p.get("PositionTitle") or "").strip()
            company = (p.get("HiringOrgName") or "").strip()
            city    = p.get("WorkPlaceCity", "") or p.get("WorkPlaceName", "")
            region  = p.get("WorkPlaceRegionName", "")
            location = ", ".join(filter(None, [city, region])) or "Danmark"

            raw_desc = p.get("PresentationAgreement", "") or p.get("JobPositionPostingDescription", "")
            description = clean_html(raw_desc)[:1500]

            posted_raw   = p.get("PostingCreated", "")
            deadline_raw = p.get("LastDateApplication", "")
            abroad       = p.get("WorkPlaceAbroad", False)

            salary = ""
            m = re.search(r"(\d[\d.,]+)\s*[-–]\s*(\d[\d.,]+)\s*(kr|DKK)", description, re.I)
            if m: salary = f"{m.group(1)}–{m.group(2)} kr/md"

            jobs.append({
                "id": f"jn-{jid}",
                "title": title, "company": company, "location": location,
                "type": p.get("WorkHours", "Fuldtid") or "Fuldtid",
                "workMode": "Remote" if abroad else "Kontor",
                "salary": salary, "description": description,
                "keywords": extract_keywords(title + " " + description),
                "posted": parse_date(posted_raw),
                "deadline": deadline_raw[:10] if deadline_raw else "",
                "url": f"https://job.jobnet.dk/CV/FindWork/Details/{jid}",
                "source": "jobnet.dk", "sourceLabel": "Jobnet", "industry": "",
            })

        print(f"  [jobnet] Side {page+1}: {len(postings)} jobs (total: {len(jobs)})")

    return jobs


# ─── Jobindex.dk ─────────────────────────────────────────────────────────────

def fetch_jobindex(pages=3):
    """Henter jobs fra Jobindex.dk's åbne JSON-API"""
    session = requests.Session()
    session.verify = False
    session.headers.update({**BROWSER_HEADERS, "Accept": "application/json"})

    jobs, seen = [], set()
    base = "https://www.jobindex.dk/jobsoegning.json"

    for page in range(pages):
        params = {
            "q": "",
            "page": page + 1,
            "jobtypes": "",
            "subid": 0,
        }
        try:
            r = session.get(base, params=params, timeout=15)
            if r.status_code != 200:
                print(f"  [jobindex] HTTP {r.status_code}")
                break
            data = r.json()
        except Exception as e:
            print(f"  [jobindex] Fejl side {page}: {e}")
            break

        postings = data.get("results", [])
        if not postings:
            print(f"  [jobindex] Ingen resultater side {page+1}")
            break

        for p in postings:
            jid = str(p.get("jobad_id") or p.get("id", ""))
            if not jid or jid in seen: continue
            seen.add(jid)

            title   = (p.get("header") or p.get("title") or "").strip()
            company = (p.get("company_name") or p.get("company") or "").strip()
            location = (p.get("work_place") or p.get("location") or "Danmark").strip()

            body_html = p.get("body_text") or p.get("description") or ""
            description = clean_html(body_html)[:1500]

            posted_raw   = p.get("published_at") or p.get("date") or ""
            deadline_raw = p.get("application_deadline") or p.get("deadline") or ""
            jurl = p.get("url") or p.get("apply_url") or f"https://www.jobindex.dk/jobannonce/{jid}"

            jobs.append({
                "id": f"ji-{jid}",
                "title": title, "company": company, "location": location,
                "type": "Fuldtid", "workMode": "Kontor",
                "salary": "", "description": description,
                "keywords": extract_keywords(title + " " + description),
                "posted": parse_date(posted_raw),
                "deadline": deadline_raw[:10] if deadline_raw else "",
                "url": jurl,
                "source": "jobindex.dk", "sourceLabel": "Jobindex", "industry": "",
            })

        print(f"  [jobindex] Side {page+1}: {len(postings)} jobs (total: {len(jobs)})")

    return jobs


# ─── Ofir.dk (simpel RSS fallback) ───────────────────────────────────────────

def fetch_ofir(max_items=40):
    """Ofir.dk – læser jobs via deres åbne RSS-feed"""
    import xml.etree.ElementTree as ET
    session = requests.Session()
    session.verify = False
    session.headers.update(BROWSER_HEADERS)

    url = "https://www.ofir.dk/ofirRSS.aspx?cat=it"
    jobs = []
    try:
        r = session.get(url, timeout=15)
        root = ET.fromstring(r.content)
        ns = ""
        items = root.findall(f".//{ns}item")

        for i, item in enumerate(items[:max_items]):
            def g(tag): return (item.findtext(f"{ns}{tag}") or "").strip()

            title    = g("title")
            link     = g("link")
            desc     = clean_html(g("description"))[:1500]
            pub_date = g("pubDate")

            # Udled virksomhed fra titel (format: "Stilling – Virksomhed")
            parts = re.split(r'\s+[-–—]\s+', title, maxsplit=1)
            company = parts[1] if len(parts) > 1 else ""
            clean_title = parts[0] if len(parts) > 1 else title

            # Parse dato
            posted = ""
            try:
                dt = datetime.strptime(pub_date[:16], "%a, %d %b %Y")
                delta = (datetime.now() - dt).days
                if delta == 0: posted = "I dag"
                elif delta == 1: posted = "I går"
                elif delta < 7: posted = f"{delta} dage siden"
                else: posted = f"{delta//7} uger siden"
            except: posted = pub_date[:10]

            jid = re.search(r'\d{5,}', link)
            jid = jid.group(0) if jid else str(i)

            jobs.append({
                "id": f"of-{jid}",
                "title": clean_title, "company": company, "location": "Danmark",
                "type": "Fuldtid", "workMode": "Kontor",
                "salary": "", "description": desc,
                "keywords": extract_keywords(clean_title + " " + desc),
                "posted": posted, "deadline": "",
                "url": link,
                "source": "ofir.dk", "sourceLabel": "Ofir", "industry": "",
            })

        print(f"  [ofir] {len(jobs)} jobs fra RSS")
    except Exception as e:
        print(f"  [ofir] Fejl: {e}")

    return jobs


# ─── Industry tagger ─────────────────────────────────────────────────────────

INDUSTRY_RULES = {
    "IT/Tech":    ["udvikler","developer","software","engineer","devops","cloud","data scientist","ml","ai ","it ","programmør","frontend","backend","fullstack","architect","qa ","tester","sysadmin"],
    "Design":     ["designer","ux","ui","grafisk","motion","brand","kreativ","visual"],
    "Data & AI":  ["data scientist","analytiker","analyst","bi ","business intelligence","machine learning","mlops","data engineer","nlp"],
    "Marketing":  ["marketing","seo","sem","social media","content","kommunikation","pr ","brand manager","vækst"],
    "Finans":     ["finans","økonomi","revisor","regnskab","controller","bank","forsikring","kredit","aktuar"],
    "Salg":       ["sælger","salg","account manager","sales","business development","kundeansvarlig","key account"],
    "HR":         ["hr ","human resources","rekruttering","talent acquisition","people","personalechef","chro"],
    "Ledelse":    ["leder","manager","chef","direktør","coo","cto","cfo","head of","vp "],
    "Sundhed":    ["sygeplejerske","læge","terapeut","psykolog","sundhed","klinik","hospital","plejer","farmaceut"],
    "Logistik":   ["logistik","lager","transport","supply chain","indkøb","chauffør","procurement"],
    "Handel":     ["butik","detailhandel","kassemedarbeider","ekspedient","retail","merchandiser"],
    "Produkt":    ["product manager","product owner","scrum master","agile coach","projektleder","po ","pm "],
}

def enrich(jobs):
    for job in jobs:
        text = (job["title"] + " " + job["description"]).lower()
        job["industry"] = next(
            (ind for ind, kws in INDUSTRY_RULES.items() if any(k in text for k in kws)),
            "Andet"
        )
    return jobs


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("🔄 Jobr.dk Scraper – henter rigtige jobs...\n")
    all_jobs = []

    print("📥 Jobnet.dk...")
    jn = fetch_jobnet(max_pages=5)
    all_jobs.extend(jn)
    print(f"  → {len(jn)} jobs fra Jobnet\n")

    if len(all_jobs) < 20:
        print("📥 Jobindex.dk (fallback)...")
        ji = fetch_jobindex(pages=3)
        all_jobs.extend(ji)
        print(f"  → {len(ji)} jobs fra Jobindex\n")

    if len(all_jobs) < 15:
        print("📥 Ofir.dk (RSS fallback)...")
        of = fetch_ofir(max_items=40)
        all_jobs.extend(of)
        print(f"  → {len(of)} jobs fra Ofir\n")

    all_jobs = enrich(all_jobs)

    # Deduplikér
    seen_keys, deduped = set(), []
    for j in all_jobs:
        k = (j["title"].lower().strip(), j["company"].lower().strip())
        if k not in seen_keys:
            seen_keys.add(k)
            deduped.append(j)

    # Sorter: nyeste først
    deduped.sort(key=lambda j: j.get("posted",""), reverse=False)

    print(f"✅ {len(deduped)} unikke jobs")

    out = {"fetched_at": datetime.now().isoformat(), "count": len(deduped), "jobs": deduped}
    output_dir = os.path.dirname(OUTPUT_FILE)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"📝 Gemt → {OUTPUT_FILE}")

    if deduped:
        e = deduped[0]
        print(f"\nEksempel: {e['title']} @ {e['company']} ({e['source']})")

    return len(deduped)


if __name__ == "__main__":
    main()
