#!/usr/bin/env python3
"""
Jobr.dk – Lokal server
• /api/jobs?offset=N     → proxy til Jobnet.dk's API
• /api/analyze-cv        → AI-analyse via OpenAI eller Anthropic
• /api/status            → server + AI info
Start: python3 server.py
"""

import subprocess, sys, os, json, time, webbrowser, traceback, re, warnings, tempfile, atexit
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, HTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlparse

warnings.filterwarnings("ignore")

# Railway sætter PORT automatisk – lokalt bruges 8080
PORT = int(os.environ.get("PORT", 8080))
DIR  = Path(__file__).resolve().parent

# Tillad requests fra Vercel-frontend og localhost
ALLOWED_ORIGINS = [
    "http://localhost:8080",
    "http://localhost:3000",
    os.environ.get("FRONTEND_URL", ""),   # sæt til https://jobr.vercel.app på Railway
    "https://jobr.dk",
    "https://www.jobr.dk",
]


# ─── Installer pakker stille (ingen --break-system-packages) ─────────────────

def try_install(pkg):
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", pkg, "-q"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        return True
    except Exception:
        return False


def ensure_requests():
    try:
        import requests
        return True
    except ImportError:
        print("📦  Installerer requests…")
        return try_install("requests")


# ─── AI setup ────────────────────────────────────────────────────────────────

def setup_ai():
    openai_key    = os.environ.get("OPENAI_API_KEY", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")

    if openai_key:
        try:
            import openai
        except ImportError:
            print("📦  Installerer openai…")
            try_install("openai")
        try:
            import openai
            return "openai", openai.OpenAI(api_key=openai_key), None
        except Exception as e:
            return None, None, f"OpenAI fejl: {e}"

    if anthropic_key:
        try:
            import anthropic
        except ImportError:
            print("📦  Installerer anthropic…")
            try_install("anthropic")
        try:
            import anthropic
            return "anthropic", anthropic.Anthropic(api_key=anthropic_key), None
        except Exception as e:
            return None, None, f"Anthropic fejl: {e}"

    return None, None, "Ingen API-nøgle. Sæt OPENAI_API_KEY eller ANTHROPIC_API_KEY"


# ─── STAR JobAnnonceService (mTLS certifikat-autentificering) ────────────────

STAR_BASE = "https://virksomhedsindsatst1.starcloud.dk"   # Test — skift til virksomhedsindsats.bm.dk for produktion

_star_session  = None
_star_tmp_cert = None   # midlertidigt filnavn
_star_tmp_key  = None

def _setup_star_certs():
    """Læs STAR_CERT + STAR_KEY fra Railway env-vars og skriv til temp-filer."""
    global _star_tmp_cert, _star_tmp_key
    cert_pem = os.environ.get("STAR_CERT", "").strip()
    key_pem  = os.environ.get("STAR_KEY",  "").strip()
    if not cert_pem or not key_pem:
        return False, "STAR_CERT / STAR_KEY mangler i environment"
    try:
        tf_cert = tempfile.NamedTemporaryFile(suffix=".pem", delete=False, mode="w")
        tf_cert.write(cert_pem); tf_cert.flush(); tf_cert.close()
        _star_tmp_cert = tf_cert.name

        tf_key = tempfile.NamedTemporaryFile(suffix=".pem", delete=False, mode="w")
        tf_key.write(key_pem); tf_key.flush(); tf_key.close()
        _star_tmp_key = tf_key.name

        # Ryd op når processen lukker
        atexit.register(lambda: [os.unlink(f) for f in [_star_tmp_cert, _star_tmp_key] if f and os.path.exists(f)])
        return True, None
    except Exception as e:
        return False, str(e)

def get_star_session():
    global _star_session
    if _star_session is not None:
        return _star_session
    import requests as req
    ok, err = _setup_star_certs()
    if not ok:
        print(f"  [STAR] ⚠️  Certifikat ikke tilgængeligt: {err}")
        return None
    try:
        _star_session = req.Session()
        _star_session.cert    = (_star_tmp_cert, _star_tmp_key)
        _star_session.verify  = False   # STARCLOUD bruger intern CA; sæt sti til STARCLOUD-CA.cer for fuld verifikation
        _star_session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})
        print("  [STAR] ✅ mTLS-session klar")
        return _star_session
    except Exception as e:
        print(f"  [STAR] Session-fejl: {e}")
        return None

def fetch_star_page(offset=0, search=""):
    """Hent job fra STARs JobAnnonceService v2 via mTLS."""
    session = get_star_session()
    if not session:
        return [], "STAR ikke konfigureret", 0
    import requests as req
    try:
        # STAR JobAnnonceService v2 endpoint
        url = f"{STAR_BASE}/v2/Jobannonce"
        params = {"pageSize": 20, "pageNumber": max(1, offset // 20 + 1)}
        if search:
            params["search"] = search
        print(f"  [STAR] GET {url} offset={offset}")
        r = session.get(url, params=params, timeout=20)
        print(f"  [STAR] HTTP {r.status_code}  body[:300]: {r.text[:300]}")
        if r.status_code != 200:
            return [], f"STAR HTTP {r.status_code}", 0
        data = r.json()
    except Exception as e:
        return [], f"STAR fejl: {e}", 0

    postings = (data.get("JobPositionPostings")
             or data.get("jobPositionPostings")
             or data.get("results")
             or [])
    jobs = []
    for p in postings:
        jid         = str(p.get("JobPositionPostingIdentifier") or p.get("id") or "")
        title       = (p.get("PositionTitle") or p.get("title") or "").strip()
        company     = (p.get("HiringOrgName") or p.get("company") or "Ukendt").strip()
        city        = p.get("WorkPlaceCity") or p.get("WorkPlaceName") or ""
        region      = p.get("WorkPlaceRegionName") or ""
        location    = ", ".join(filter(None, [city, region])) or "Danmark"
        raw_desc    = (p.get("PresentationAgreement")
                    or p.get("JobPositionPostingDescription")
                    or p.get("description") or "")
        description = clean_html(raw_desc)[:1500]
        posted_raw  = p.get("PostingCreated") or p.get("created") or ""
        deadline_raw= p.get("LastDateApplication") or ""
        abroad      = bool(p.get("WorkPlaceAbroad"))
        salary      = ""
        m = re.search(r"(\d[\d.,]+)\s*[-–]\s*(\d[\d.,]+)\s*(kr|DKK)", description, re.I)
        if m:
            salary = f"{m.group(1)}–{m.group(2)} kr/md"
        url_job = (p.get("JobPostingUrl")
                or f"https://job.jobnet.dk/CV/FindWork/Details/{jid}")
        jobs.append({
            "id":          f"star-{jid}",
            "title":       title,
            "company":     company,
            "location":    location,
            "type":        p.get("WorkHours") or "Fuldtid",
            "workMode":    "Remote" if abroad else "Kontor",
            "salary":      salary,
            "description": description,
            "keywords":    extract_kws(title + " " + description),
            "posted":      parse_date(posted_raw),
            "deadline":    deadline_raw[:10] if deadline_raw else "",
            "url":         url_job,
            "source":      "jobnet.dk",
            "sourceLabel": "Jobnet",
            "industry":    get_industry(title, description),
        })

    total = data.get("TotalResultCount") or data.get("total") or len(jobs)
    return jobs, None, total


# ─── Adzuna API ───────────────────────────────────────────────────────────────

ADZUNA_APP_ID  = os.environ.get("ADZUNA_APP_ID",  "89154cc5")
ADZUNA_APP_KEY = os.environ.get("ADZUNA_APP_KEY", "c5a493c6da98b7710733944cf74b9d07")

# Søgetermer der dækker det danske jobmarked bredt
ADZUNA_SEARCHES = [
    "",                  # Alle job
    "software developer",
    "data analyst",
    "designer",
    "marketing",
    "projektleder",
    "salgskonsulent",
    "ingeniør",
]

# ── Bulk-cache: opdateres max 1 gang i timen ───────────────────────────────
_bulk_cache = {"jobs": [], "ts": 0}
BULK_TTL    = 3600  # sekunder

def detect_work_mode(title, description):
    """Detektér Remote / Hybrid / Kontor fra tekst."""
    text = (title + " " + description).lower()
    if re.search(r'\b(fully remote|100%\s*remote|remote.?only|fuld.?fjernarbejde)\b', text):
        return "Remote"
    if re.search(r'\b(remote|work from home|hjemmearbejde|wfh)\b', text):
        return "Remote"
    if re.search(r'\b(hybrid|delvist remote|fleksibel arbejdsplads|hjemmefra)\b', text):
        return "Hybrid"
    return "Kontor"

def parse_adzuna_job(p):
    """Parser ét Adzuna job-objekt til vores format."""
    jid         = str(p.get("id", ""))
    title       = (p.get("title") or "").strip()
    company     = (p.get("company", {}) or {}).get("display_name", "Ukendt")
    loc_data    = p.get("location", {}) or {}
    location    = loc_data.get("display_name", "Danmark")
    # Rens lokation: fjern "Denmark, " prefix
    location    = re.sub(r'^Denmark,\s*', '', location).strip() or "Danmark"
    description = clean_html(p.get("description") or "")[:1500]
    salary_min  = p.get("salary_min")
    salary_max  = p.get("salary_max")
    salary      = ""
    if salary_min and salary_max and salary_min > 1000:
        # Adzuna returnerer årsløn — konvertér til månedlig
        mo_min = int(salary_min / 12)
        mo_max = int(salary_max / 12)
        salary = f"{mo_min:,}–{mo_max:,} kr/md".replace(",", ".")
    created     = p.get("created") or ""
    redirect    = p.get("redirect_url") or ""
    contract    = (p.get("contract_time") or "full_time")
    job_type    = "Studiejob" if "part" in contract else "Fuldtid"
    return {
        "id":          f"az-{jid}",
        "title":       title,
        "company":     company,
        "location":    location,
        "type":        job_type,
        "workMode":    detect_work_mode(title, description),
        "salary":      salary,
        "description": description,
        "keywords":    extract_kws(title + " " + description),
        "posted":      parse_date(created),
        "deadline":    "",
        "url":         redirect,
        "source":      "adzuna.dk",
        "sourceLabel": "Adzuna",
        "industry":    get_industry(title, description),
    }

def fetch_adzuna_page(offset=0, search="", per_page=50):
    import requests as req
    page = (offset // per_page) + 1
    url  = f"https://api.adzuna.com/v1/api/jobs/dk/search/{page}"
    params = {
        "app_id":           ADZUNA_APP_ID,
        "app_key":          ADZUNA_APP_KEY,
        "results_per_page": per_page,
        "what":             search or "",
        "sort_by":          "date",
        "content-type":     "application/json",
    }
    try:
        r = req.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return [], f"Adzuna HTTP {r.status_code}", 0
        data = r.json()
    except Exception as e:
        return [], str(e), 0

    jobs  = [parse_adzuna_job(p) for p in (data.get("results") or []) if p.get("id")]
    total = data.get("count") or len(jobs)
    return jobs, None, total

def fetch_bulk_jobs():
    """Hent ~300 unikke job via parallelle Adzuna-søgninger. Caches 1 time."""
    global _bulk_cache
    now = time.time()
    if _bulk_cache["jobs"] and now - _bulk_cache["ts"] < BULK_TTL:
        print(f"  [Bulk] Cache hit — {len(_bulk_cache['jobs'])} job")
        return _bulk_cache["jobs"]

    import concurrent.futures
    seen     = set()
    all_jobs = []

    def safe_fetch(search, page):
        try:
            offset = (page - 1) * 50
            jobs, err, _ = fetch_adzuna_page(offset, search, per_page=50)
            return jobs
        except Exception as e:
            print(f"  [Bulk] Fejl ({search!r} s.{page}): {e}")
            return []

    tasks = []
    # Side 1-4 af generel søgning
    for pg in range(1, 5):
        tasks.append(("", pg))
    # Side 1 af kategori-søgninger
    for term in ADZUNA_SEARCHES[1:]:
        tasks.append((term, 1))

    print(f"  [Bulk] Starter {len(tasks)} parallelle Adzuna-kald…")
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(safe_fetch, t[0], t[1]): t for t in tasks}
        for f in concurrent.futures.as_completed(futures):
            for job in f.result():
                if job["id"] not in seen:
                    seen.add(job["id"])
                    all_jobs.append(job)

    # Sortér nyeste først
    all_jobs.sort(key=lambda j: j.get("posted", "") or "", reverse=True)
    print(f"  [Bulk] ✅ {len(all_jobs)} unikke job hentet")
    _bulk_cache = {"jobs": all_jobs, "ts": now}
    return all_jobs


# ─── Jobnet proxy ─────────────────────────────────────────────────────────────

JOBNET_BASE = "https://job.jobnet.dk/CV/FindWork/Search"
JOBNET_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "da-DK,da;q=0.9",
    "Referer": "https://job.jobnet.dk/CV/FindWork",
    "Origin": "https://job.jobnet.dk",
    "X-Requested-With": "XMLHttpRequest",
}

_jobnet_session = None

def get_session():
    global _jobnet_session
    import requests as req
    if _jobnet_session is None:
        _jobnet_session = req.Session()
        _jobnet_session.verify = False
        _jobnet_session.headers.update(JOBNET_HEADERS)
        try:
            _jobnet_session.get("https://job.jobnet.dk/CV/FindWork", timeout=10)
        except Exception:
            pass
    return _jobnet_session


def clean_html(text):
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    for ent, rep in [("&amp;","&"),("&nbsp;"," "),("&lt;","<"),("&gt;",">"),("&quot;",'"'),("&#39;","'")]:
        text = text.replace(ent, rep)
    return re.sub(r"\s{2,}", " ", text).strip()


def parse_date(s):
    if not s: return ""
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        d = (datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).days
        if d == 0: return "I dag"
        if d == 1: return "I går"
        if d < 7:  return f"{d} dage siden"
        if d < 14: return "1 uge siden"
        return f"{d//7} uger siden"
    except:
        return s[:10] if len(s) >= 10 else s


SKILL_KWS = [
    # Tech / kode
    "python","javascript","typescript","java","golang","rust","php","swift","kotlin",
    "react","vue","angular","next.js","node.js","django","flask","fastapi","spring",
    "sql","postgresql","mysql","mongodb","redis","elasticsearch","kafka","spark","dbt",
    "pandas","numpy","scikit-learn","tensorflow","pytorch","machine learning","nlp","llm",
    "aws","azure","gcp","docker","kubernetes","terraform","ci/cd","linux","bash","git",
    "rest api","graphql","microservices","api design","datadog","grafana",
    # Data & AI
    "power bi","tableau","looker","data science","data modeling","data engineering",
    "rag","copilot","generative ai","embeddings","vector database","mlops","airflow",
    "business intelligence","analytisk","dataanalyse","rapportering","dashboards",
    # Design & UX
    "figma","sketch","adobe xd","ux design","ui design","user research","usability testing",
    "prototyping","wireframing","accessibility","design systems","a/b testing",
    # Produkt & agile
    "jira","confluence","scrum","agile","kanban","okr","kpi","roadmap",
    "product management","product owner","scrum master","user stories",
    # Marketing & salg
    "seo","sem","google ads","content marketing","email marketing","hubspot","salesforce",
    "crm","google analytics","growth hacking","b2b","saas","copywriting","social media",
    # Office & IT
    "excel","powerpoint","word","sharepoint","power automate","power apps",
    "microsoft 365","office 365","dynamics 365","sap","navision","visio","ms project",
    # Forretning & bløde
    "strategi","projektledelse","ledelse","teamledelse","kommunikation","samarbejde",
    "analytisk","forhandling","præsentation","stakeholder management","forandringsledelse",
    "procesoptimering","forretningsudvikling","konsulentvirksomhed","digital transformation",
    "risikostyring","compliance","governance","rapportering","budgettering",
    "finansiel analyse","it-arkitektur","selvstændig","kreativ","problemløsning",
    # Økonomi
    "regnskab","bogføring","controlling","revision","budget","ifrs","moms",
    "finansiel rapportering","årsregnskab","likviditet","cash flow",
    # HR
    "rekruttering","onboarding","medarbejderudvikling","hr administration",
    "lønbehandling","employer branding","trivselsmåling",
    # Jura & compliance
    "gdpr","aml","kyc","due diligence","kontraktret","arbejdsret","persondatalovgivning",
    # Kommunikation & medie
    "pr","kommunikationsstrategi","sociale medier","journalistik","redaktion",
    "videoproduktion","fotografering","storytelling","indholdsstrategi",
]

def extract_kws(text):
    t = text.lower()
    return list({s for s in SKILL_KWS if re.search(r'(?<!\w)' + re.escape(s) + r'(?!\w)', t)})


INDUSTRY_RULES = {
    "IT/Tech":   ["udvikler","developer","software","engineer","devops","it ","programmør","frontend","backend","fullstack","architect"],
    "Design":    ["designer","ux","ui","grafisk","kreativ","visual","brand"],
    "Data & AI": ["data scientist","analytiker","analyst","bi ","machine learning","mlops","nlp","data engineer"],
    "Marketing": ["marketing","seo","sem","content","kommunikation","pr ","brand manager","growth"],
    "Finans":    ["finans","økonomi","revisor","regnskab","controller","bank","forsikring"],
    "Salg":      ["sælger","salg","account","sales","business development","key account"],
    "HR":        ["hr ","human resources","rekruttering","talent","people","personale"],
    "Ledelse":   ["leder","manager","chef","direktør","coo","cto","cfo","head of"],
    "Sundhed":   ["sygeplejerske","læge","terapeut","psykolog","sundhed","hospital","klinik"],
    "Produkt":   ["product manager","product owner","scrum master","projektleder"],
}

def get_industry(title, desc):
    text = (title + " " + desc).lower()
    return next((ind for ind, kws in INDUSTRY_RULES.items() if any(k in text for k in kws)), "Andet")


def fetch_jobnet_page(offset=0, search=""):
    import requests as req
    session = get_session()
    params = {
        "Offset": offset,
        "SortValue": "NewestPosted",
        "SearchString": search,
        "widk": "true",
    }
    try:
        r = session.get(JOBNET_BASE, params=params, timeout=15)
        if r.status_code != 200 or not r.text.strip():
            return [], f"HTTP {r.status_code}"
        if not r.text.strip().startswith("{"):
            return [], f"Ikke JSON: {r.text[:100]}"
        data = r.json()
    except Exception as e:
        return [], str(e)

    postings = data.get("JobPositionPostings") or []
    jobs = []
    for p in postings:
        jid  = str(p.get("JobPositionPostingIdentifier", ""))
        title = (p.get("PositionTitle") or "").strip()
        company = (p.get("HiringOrgName") or "").strip()
        city = p.get("WorkPlaceCity") or p.get("WorkPlaceName") or ""
        region = p.get("WorkPlaceRegionName") or ""
        location = ", ".join(filter(None, [city, region])) or "Danmark"
        raw_desc = p.get("PresentationAgreement") or p.get("JobPositionPostingDescription") or ""
        description = clean_html(raw_desc)[:1500]
        posted_raw = p.get("PostingCreated") or ""
        deadline_raw = p.get("LastDateApplication") or ""
        abroad = bool(p.get("WorkPlaceAbroad"))
        salary = ""
        m = re.search(r"(\d[\d.,]+)\s*[-–]\s*(\d[\d.,]+)\s*(kr|DKK)", description, re.I)
        if m: salary = f"{m.group(1)}–{m.group(2)} kr/md"
        jobs.append({
            "id": f"jn-{jid}",
            "title": title, "company": company, "location": location,
            "type": p.get("WorkHours") or "Fuldtid",
            "workMode": "Remote" if abroad else "Kontor",
            "salary": salary, "description": description,
            "keywords": extract_kws(title + " " + description),
            "posted": parse_date(posted_raw),
            "deadline": deadline_raw[:10] if deadline_raw else "",
            "url": f"https://job.jobnet.dk/CV/FindWork/Details/{jid}",
            "source": "jobnet.dk", "sourceLabel": "Jobnet",
            "industry": get_industry(title, description),
        })

    total = data.get("TotalResultCount") or len(jobs)
    return jobs, None, total


# ─── AI CV-analyse ────────────────────────────────────────────────────────────

CV_SYSTEM = """Du er verdens bedste headhunter og karriererådgiver med 20 års erfaring.
Din specialitet: at læse CV'er ekstremt dybdegående og udtrække ALLE kompetencer — eksplicitte, implicitte og underliggende.
Du ved at et CV altid underrapporterer kandidatens reelle kompetencer. Derfor graver du dybt.
Returnér KUN gyldig JSON – ingen markdown, ingen forklaring udenfor JSON."""

CV_PROMPT = """Analyser dette CV og returnér præcis dette JSON-format.

VIGTIGT: Du SKAL returnere mindst 30 skills totalt. Hellere 40-50. Et CV på 1 side = mindst 30 skills.
Returnér KUN gyldig JSON.

{
  "skills": [
    {"name": "SQL", "cat": "Data & AI", "confidence": 95, "inferred": false, "hits": 2},
    {"name": "Python", "cat": "Backend", "confidence": 90, "inferred": false, "hits": 1},
    {"name": "Power BI", "cat": "Data & AI", "confidence": 95, "inferred": false, "hits": 1},
    {"name": "Projektledelse", "cat": "Produkt & Agile", "confidence": 92, "inferred": false, "hits": 3},
    {"name": "Stakeholder Management", "cat": "Bløde", "confidence": 88, "inferred": true, "hits": 4},
    {"name": "Data-driven beslutninger", "cat": "Data & AI", "confidence": 85, "inferred": true, "hits": 3},
    {"name": "Procesoptimering", "cat": "Forretning", "confidence": 85, "inferred": true, "hits": 2},
    {"name": "IT-strategi", "cat": "Øvrige IT", "confidence": 82, "inferred": true, "hits": 2},
    {"name": "Change Management", "cat": "Forretning", "confidence": 80, "inferred": true, "hits": 2},
    {"name": "Governance", "cat": "Forretning", "confidence": 78, "inferred": true, "hits": 2},
    {"name": "Rapportering", "cat": "Data & AI", "confidence": 85, "inferred": true, "hits": 3},
    {"name": "Finansielle systemer", "cat": "Økonomi & Regnskab", "confidence": 75, "inferred": true, "hits": 2}
  ],
  "name": "Alexander Kougios",
  "roleFamily": "Data & AI",
  "seniority": "Junior",
  "years": 2,
  "education": "Kandidat",
  "languages": ["Dansk", "Engelsk"],
  "location": "København",
  "strengths": ["Konkret styrke med tal fra CV", "Anden styrke", "Tredje styrke"],
  "domains": ["Asset Management", "Finansiel sektor", "IT-arkitektur"],
  "adjacent_roles": ["Data Analyst", "Business Analyst", "IT-projektleder", "Digital Transformation Consultant"],
  "summary": "En præcis, professionel sætning om personen",
  "context_keywords": ["digitalisering", "procesoptimering", "data-driven", "IT-arkitektur", "finansielle systemer"],
  "wildcard_roles": ["Product Manager", "Management Consultant", "Business Intelligence Analyst"],
  "working_style": "Analytisk og struktureret med stærk evne til at navigere mellem teknik og forretning",
  "discovery_reasoning": "Kombinationen af IT-baggrund og finansiel erfaring giver unik fordel i fintech og digital transformation"
}

═══════════════════════════════════════════════════════════
REGLER FOR SKILLS — LÆS DETTE GRUNDIGT:
═══════════════════════════════════════════════════════════

KRITISK: Brug ALTID DANSKE navne for generiske kompetencer:
  "strategi" IKKE "strategy"
  "ledelse" IKKE "management" eller "leadership"
  "projektledelse" IKKE "project management"
  "kommunikation" IKKE "communication"
  "samarbejde" IKKE "collaboration" eller "teamwork"
  "analytisk" IKKE "analytical"
  "forhandling" IKKE "negotiation"
  "præsentation" IKKE "presentation"
  "forandringsledelse" IKKE "change management"
  "risikostyring" IKKE "risk management"
  "procesoptimering" IKKE "process optimization"
  "rapportering" IKKE "reporting"
  "stakeholder management" (behold engelsk — standard fagterm)
  Teknologier beholder engelsk navn: Python, SQL, Power BI, Azure osv.

MÅL: Minimum 30 skills. Gerne 40-50. Inkludér ALT:

1. EKSPLICITTE SKILLS (inferred: false):
   Alle tools, teknologier og metoder direkte nævnt i CV'et.
   Eksempel: "SQL, Python, Power BI, SCRUM" → 4 separate skills

2. UDLEDTE TEKNISKE SKILLS (inferred: true):
   Hvad må de nødvendigvis have brugt?
   "Data-driven frameworks" → Excel, data visualisering, analytisk tænkning
   "Digital transformation" → change management, procesdesign, IT-arkitektur
   "IT Architecture team" → enterprise architecture, teknologistrategi, systemdesign
   "Automation opportunities" → procesautomatisering, RPA-tænkning, workflow-design

3. UDLEDTE BLØDE SKILLS (inferred: true, cat: "Bløde"):
   "Koordinerede meetings og workshops" → Facilitering + Mødeledelse
   "Link between clients and portfolio managers" → Stakeholder Management + Relationspleje
   "Translated operational insight into strategic improvements" → Strategisk tænkning + Kommunikation
   "Aligned digital initiatives with strategic goals" → IT-strategi + Forandringsledelse
   "Acted as link between clients, portfolio managers and traders" → Forhandling + Netværk

4. DOMÆNE-VIDEN (inferred: true):
   "DKK 800bn AUM" → Kapitalforvaltning, Finansielle markeder, Porteføljestyring
   "Risk-mitigation" → Risikostyring, Compliance
   "AML" → Anti-hvidvask, Regulatorisk compliance, KYC
   "Client onboarding" → Kundeservice, CRM-processer

5. AKADEMISKE/UDDANNELSESMÆSSIGE SKILLS:
   "IT strategy, process optimization" (fra studie) → IT-strategi, Procesoptimering
   "Digital transformation" (fra studie) → Digital transformation
   "Business Economics & IT" → Forretningsforståelse, Økonomi, IT-forretning

6. LEDELSES- OG KOORDINERINGSEVNER:
   "Senior management" → Rapportering til ledelse, Ledelseskommunikation
   "Multiple teams" → Tværfagligt samarbejde, Koordinering
   "Workshops" → Workshop-facilitering, Træning

KATEGORIER (cat SKAL være én af disse):
Frontend, Backend, Mobile, Data & AI, Cloud & DevOps, Design,
Produkt & Agile, Marketing, Forretning, Bløde,
Økonomi & Regnskab, HR & Rekruttering, Sundhed & Omsorg,
Undervisning, Jura & Compliance, Kommunikation,
Handel & Service, Produktion & Teknik, Administration, Øvrige IT

confidence: 60-100 (100 = eksplicit nævnt flere gange, 60 = svagt udledt)
hits: antal belæg i CV'et (1-5+)

═══════════════════════════════════════════════════════════
REGLER FOR ØVRIGE FELTER:
═══════════════════════════════════════════════════════════

seniority:
  "Junior"       = 0-2 års erfaring ELLER stadig studerende
  "Mid-level"    = 2-5 års erfaring
  "Senior"       = 5-10 års erfaring
  "Lead / Manager" = 10+ år ELLER dokumenteret lederansvar

years: samlede år med reel erhvervserfaring (ikke studieaktiviteter)

education: "PhD" / "Kandidat" / "Bachelor" / "Gymnasial/EUD" / "Bootcamp/Selvlært" / null
  (igangværende kandidat = "Kandidat")

location: bynavnet fra CV-adresse. Dansk stavemåde: "København", "Aarhus", "Odense". Null hvis ukendt.

domains: 3-6 specifikke fagdomæner med dyb ekspertise (ikke generiske — vær præcis)

adjacent_roles: 6-10 jobtitler personen REALISTISK kan søge NU baseret på erfaring+uddannelse

summary: 1 skarp, præcis sætning (maks 20 ord) der indfanger personen

context_keywords: 8-15 fagspecifikke nøgleord vigtige for job-matching (ikke generiske ord)

strengths: 4-6 konkrete sætninger med specifikke tal/projekter fra CV'et

wildcard_roles: 4-7 overraskende men realistiske roller (dem personen ikke selv ville tænke på)

working_style: 2-3 sætninger baseret på KONKRETE beviser fra CV'et

discovery_reasoning: 2-3 sætninger om HVORFOR de uventede roller giver mening for netop denne person

CV:
"""

JOB_SYSTEM = """Du er en rekrutteringsekspert. Analyser jobopslaget og identificer præcis hvad kandidaten skal have af kompetencer. Returnér KUN gyldig JSON – ingen markdown."""

JOB_PROMPT = """Analyser dette jobopslag og returnér præcis dette JSON-format:

{
  "required_skills": ["Python", "SQL", "Machine Learning", "Data Analysis", "Power BI"],
  "nice_to_have": ["Spark", "Databricks"],
  "seniority": "Mid-level",
  "education_req": "Kandidat",
  "languages": ["Dansk", "Engelsk"],
  "key_requirements": ["Erfaring med AI/ML-modeller", "Kendskab til data pipelines"]
}

REGLER:
- required_skills: ALLE teknologier, metoder og kompetencer jobbet eksplicit kræver eller tydeligt forventer. Vær generøs – hellere for mange end for få. Inkludér bløde kompetencer som "samarbejde", "kommunikation" osv.
- nice_to_have: kompetencer nævnt med "gerne", "fordel", "plus", "vi sætter pris på" osv.
- seniority: "Junior" / "Mid-level" / "Senior" / "Lead / Manager"
- education_req: "PhD" / "Kandidat" / "Bachelor" / null (hvis ikke nævnt)
- languages: krævede sprog
- key_requirements: max 5 vigtigste krav som korte sætninger

Jobopslag:
"""

def analyze_job_with_ai(title, description, ai_type, ai_client):
    if not ai_client:
        return {"error": "Ingen AI-klient"}
    text = f"Titel: {title}\n\n{description[:4000]}"
    try:
        if ai_type == "openai":
            resp = ai_client.chat.completions.create(
                model="gpt-4o-mini", max_tokens=800, temperature=0.1,
                messages=[{"role":"system","content":JOB_SYSTEM},{"role":"user","content":JOB_PROMPT+text}]
            )
            raw = resp.choices[0].message.content.strip()
        else:
            resp = ai_client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=800,
                system=JOB_SYSTEM,
                messages=[{"role":"user","content":JOB_PROMPT+text}]
            )
            raw = resp.content[0].text.strip()

        raw = re.sub(r"^```[a-z]*\n?","",raw).rstrip("` \n").strip()
        result = json.loads(raw)
        result["ai_analyzed"] = True
        return result
    except json.JSONDecodeError as e:
        return {"error": f"Ugyldig JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


def analyze_cv_with_ai(cv_text, ai_type, ai_client):
    if not ai_client:
        return {"fallback": True, "error": "Ingen AI-klient"}
    text = cv_text[:12000]
    try:
        if ai_type == "openai":
            resp = ai_client.chat.completions.create(
                model="gpt-4o-mini", max_tokens=5000, temperature=0.2,
                messages=[{"role":"system","content":CV_SYSTEM},{"role":"user","content":CV_PROMPT+text}]
            )
            raw = resp.choices[0].message.content.strip()
            model = "gpt-4o-mini"
        else:
            resp = ai_client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=5000,
                system=CV_SYSTEM,
                messages=[{"role":"user","content":CV_PROMPT+text}]
            )
            raw = resp.content[0].text.strip()
            model = "claude-haiku-4-5-20251001"

        raw = re.sub(r"^```[a-z]*\n?","",raw).rstrip("` \n").strip()
        result = json.loads(raw)
        result["ai_analyzed"] = True
        result["model"] = model
        return result
    except json.JSONDecodeError as e:
        return {"fallback": True, "error": f"Ugyldig JSON fra AI: {e}"}
    except Exception as e:
        traceback.print_exc()
        return {"fallback": True, "error": str(e)}


# ─── HTTP Handler ─────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):
    ai_type   = None
    ai_client = None
    ai_error  = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        # ── /api/jobs/all ─────────────────────────────────────────────────
        # Returnerer alle job i én bulk (cached 1 time) — bruges af frontend
        if parsed.path == "/api/jobs/all":
            jobs = fetch_bulk_jobs()
            self._json({"jobs": jobs, "total": len(jobs), "source": "adzuna-bulk"})
            return

        # ── /api/jobs ──────────────────────────────────────────────────────
        if parsed.path == "/api/jobs":
            qs     = parse_qs(parsed.query)
            offset = int(qs.get("offset", ["0"])[0])
            search = qs.get("q", [""])[0]

            # 1. Prøv STAR JobAnnonceService (mTLS — friske danske job)
            jobs, err, total = fetch_star_page(offset, search)
            source = "star"

            # 2. Fallback: Adzuna
            if err or not jobs:
                if err:
                    print(f"  [STAR] Fejl: {err} – falder tilbage til Adzuna")
                jobs, err, total = fetch_adzuna_page(offset, search)
                source = "adzuna"

            # 3. Fallback: Jobnet browser-scrape
            if err or not jobs:
                if err:
                    print(f"  [Adzuna] Fejl: {err} – prøver Jobnet som fallback")
                result = fetch_jobnet_page(offset, search)
                if len(result) == 3:
                    jobs, err, total = result
                else:
                    jobs, err = result; total = len(jobs)
                source = "jobnet"

            if err and not jobs:
                self._json({"error": err, "jobs": [], "total": 0}, 502)
            else:
                self._json({"jobs": jobs, "total": total or len(jobs), "offset": offset, "source": source})
            return

        # ── /api/star-test ────────────────────────────────────────────────
        if parsed.path == "/api/star-test":
            session = get_star_session()
            if not session:
                self._json({"ok": False, "error": "Certifikater mangler — sæt STAR_CERT og STAR_KEY i Railway"})
                return
            import requests as req
            try:
                url = f"{STAR_BASE}/v2/Jobannonce"
                r = session.get(url, params={"pageSize": 1, "pageNumber": 1}, timeout=15)
                self._json({"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:500], "url": url})
            except Exception as e:
                self._json({"ok": False, "error": str(e)})
            return

        # ── /api/status ───────────────────────────────────────────────────
        if parsed.path == "/api/status":
            self._json({
                "ok": True,
                "ai_available": Handler.ai_client is not None,
                "ai_type":  Handler.ai_type,
                "ai_error": Handler.ai_error,
            })
            return

        # ── /api/refresh ──────────────────────────────────────────────────
        if parsed.path == "/api/refresh":
            global _jobnet_session
            _jobnet_session = None   # nulstil session
            self._json({"ok": True})
            return

        super().do_GET()

    def do_POST(self):
        # ── /api/embed-match ───────────────────────────────────────────────
        if urlparse(self.path).path == "/api/embed-match":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode())
                cv_text = body.get("cv_text", "").strip()
                jobs    = body.get("jobs", [])

                if not cv_text or not jobs:
                    self._json({"error": "Mangler cv_text eller jobs"}, 400); return
                if Handler.ai_type != "openai":
                    self._json({"error": "Embeddings kræver OpenAI"}, 501); return

                import math

                def cosine_sim(a, b):
                    dot  = sum(x*y for x,y in zip(a,b))
                    magA = math.sqrt(sum(x*x for x in a))
                    magB = math.sqrt(sum(x*x for x in b))
                    return dot / (magA * magB) if magA and magB else 0.0

                # Byg inputtekster: CV + alle jobs i én batch
                cv_input  = cv_text[:2000]
                job_inputs = [
                    f"{j.get('title','')}. {(j.get('description','') or '')[:500]}"
                    for j in jobs
                ]
                all_inputs = [cv_input] + job_inputs

                print(f"  [Embed] Sender {len(jobs)} jobs til text-embedding-3-small…")
                resp = Handler.ai_client.embeddings.create(
                    model="text-embedding-3-small",
                    input=all_inputs,
                )
                embs = [d.embedding for d in resp.data]
                cv_emb = embs[0]

                # Cosine sim → normalisér til 0-100 skala
                # text-embedding-3-small giver typisk 0.25-0.90 for relaterede tekster
                results = {}
                for i, job in enumerate(jobs):
                    sim  = cosine_sim(cv_emb, embs[i + 1])
                    # Normaliser: 0.25 → 0, 0.88 → 100
                    score = max(0.0, min(100.0, (sim - 0.25) / 0.63 * 100))
                    results[job["id"]] = round(score, 1)

                print(f"  [Embed] ✅ {len(results)} job-scores beregnet")
                self._json(results)
            except Exception as e:
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
            return

        if urlparse(self.path).path == "/api/analyze-cv":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode())
                text   = body.get("text", "").strip()
                if not text:
                    self._json({"fallback": True, "error": "Tom tekst"}, 400); return

                print(f"  [AI] Analyserer ({len(text)} tegn) via {Handler.ai_type or '–'}…")
                result = analyze_cv_with_ai(text, Handler.ai_type, Handler.ai_client)
                if not result.get("fallback"):
                    n   = len(result.get("skills", []))
                    inf = sum(1 for s in result.get("skills",[]) if s.get("inferred"))
                    print(f"  [AI] ✅ {n} skills ({inf} udledt) – {result.get('roleFamily','?')}")
                else:
                    print(f"  [AI] Fallback: {result.get('error','')}")
                self._json(result)
            except Exception as e:
                traceback.print_exc()
                self._json({"fallback": True, "error": str(e)}, 500)
            return
        if urlparse(self.path).path == "/api/analyze-job":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode())
                title  = body.get("title", "").strip()
                desc   = body.get("description", "").strip()
                if not desc:
                    self._json({"error": "Tom beskrivelse"}, 400); return

                print(f"  [AI] Analyserer job: '{title[:50]}' ({len(desc)} tegn)…")
                result = analyze_job_with_ai(title, desc, Handler.ai_type, Handler.ai_client)
                n = len(result.get("required_skills", []))
                print(f"  [AI] ✅ Job-analyse: {n} required skills")
                self._json(result)
            except Exception as e:
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
            return

        # ── /api/generate-letter ───────────────────────────────────────
        if urlparse(self.path).path == "/api/generate-letter":
            try:
                length  = int(self.headers.get("Content-Length", 0))
                body    = json.loads(self.rfile.read(length).decode())
                profile = body.get("profile", {})
                job     = body.get("job", {})
                match   = body.get("match", {})

                if not Handler.ai_client:
                    self._json({"error": "Ingen AI-klient"}, 501); return

                name         = (profile.get("name") or "").strip()
                role_family  = profile.get("roleFamily", "")
                seniority    = profile.get("seniority", "")
                years        = profile.get("years") or 0
                education    = profile.get("education", "") or ""
                skills_raw   = profile.get("skills") or []
                explicit_sk  = [s.get("name","") for s in skills_raw if not s.get("inferred")][:10]
                inferred_sk  = [s.get("name","") for s in skills_raw if s.get("inferred")][:5]
                strengths    = (profile.get("strengths") or [])[:3]
                summary_line = profile.get("summary", "") or ""

                job_title    = job.get("title", "")
                job_company  = job.get("company", "")
                job_industry = job.get("industry", "")
                job_desc     = (job.get("description") or "")[:700]
                job_kws      = (job.get("keywords") or [])[:6]
                job_mode     = job.get("workMode", "")

                matched   = (match.get("matched") or [])[:7]
                gaps      = (match.get("gaps") or [])[:3]
                key_reqs  = (match.get("keyRequirements") or [])[:4]

                years_str = f"{years}+ år" if years else "relevant"
                gap_str   = f"Jeg arbejder desuden med at styrke mine kompetencer inden for {', '.join(gaps[:2])}." if gaps else ""
                strength_str = "; ".join(strengths[:2]) if strengths else ""

                prompt = f"""Skriv et personligt og overbevisende ansøgningsbrev på dansk til følgende stilling.

KANDIDATPROFIL:
- Fagområde: {role_family}
- Niveau: {seniority}, {years_str} erhvervserfaring
- Uddannelse: {education}
- Eksplicitte kompetencer: {', '.join(explicit_sk)}
- Udledte kompetencer: {', '.join(inferred_sk)}
- Resumé: {summary_line}
- Konkrete styrker: {strength_str}

STILLINGEN:
- Titel: {job_title}
- Virksomhed: {job_company}
- Branche: {job_industry}
- Arbejdsform: {job_mode}
- Nøgleord fra opslag: {', '.join(job_kws)}
- Jobopslag (uddrag): {job_desc}

MATCH-DATA:
- Kompetencer der matcher: {', '.join(matched) if matched else 'se profil'}
- Kompetencegab: {', '.join(gaps) if gaps else 'ingen væsentlige'}
- Vigtigste krav fra opslag: {'; '.join(key_reqs) if key_reqs else 'se opslag'}

INSTRUKTIONER:
- Skriv 3-4 afsnit, i alt ca. 260-320 ord
- Start med "Kære {job_company},"
- Afsnit 1: En fængende åbning (INGEN klichéer som "Jeg søger hermed" eller "Jeg har altid brændt for"). Forbind kandidatens konkrete baggrund direkte til stillingen.
- Afsnit 2: Konkrete kompetencer og erfaringer der er relevante — brug de matchende kompetencer og styrker.
- Afsnit 3: Hvad der tiltrækker kandidaten ved netop denne virksomhed/branche — brug jobopslaget.
- Afsnit 4 (2 linjer): {gap_str} Afslut med invitation til samtale.
- Slut med: "Med venlig hilsen\\n\\n{name if name else '[Dit navn]'}"
- Skriv i første person som om du er kandidaten
- Undgå: "dedikeret medarbejder", "passioneret", "jeg vil se frem til", generiske fraser
- Vær specifik, selvsikker og menneskelig"""

                print(f"  [Letter] Genererer ansøgning til '{job_title}' @ '{job_company}'…")

                if Handler.ai_type == "openai":
                    resp = Handler.ai_client.chat.completions.create(
                        model="gpt-4o-mini", max_tokens=750, temperature=0.72,
                        messages=[
                            {"role": "system", "content": "Du er ekspert i karriererådgivning og ansøgningsbreve på dansk. Du skriver konkret, personlig og overbevisende. Ingen tomme fraser eller klichéer."},
                            {"role": "user", "content": prompt}
                        ]
                    )
                    letter = resp.choices[0].message.content.strip()
                else:
                    resp = Handler.ai_client.messages.create(
                        model="claude-haiku-4-5-20251001", max_tokens=750,
                        system="Du er ekspert i karriererådgivning og ansøgningsbreve på dansk. Du skriver konkret, personlig og overbevisende. Ingen tomme fraser eller klichéer.",
                        messages=[{"role": "user", "content": prompt}]
                    )
                    letter = resp.content[0].text.strip()

                print(f"  [Letter] ✅ {len(letter)} tegn genereret")
                self._json({"letter": letter})
            except Exception as e:
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
            return

        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Content-Length","0"); self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type,Authorization")

    def end_headers(self):
        self._cors(); super().end_headers()

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4","5")):
            print(f"  {fmt % args}")


# ─── Start ────────────────────────────────────────────────────────────────────

def open_browser(url, delay=1.5):
    time.sleep(delay); webbrowser.open(url)

if __name__ == "__main__":
    ensure_requests()

    ai_type, ai_client, ai_error = setup_ai()
    Handler.ai_type   = ai_type
    Handler.ai_client = ai_client
    Handler.ai_error  = ai_error

    is_railway = bool(os.environ.get("RAILWAY_ENVIRONMENT"))

    print("=" * 52)
    print(f"  Jobr.dk – {'Railway' if is_railway else 'Lokal'} Server  (port {PORT})")
    print("=" * 52)
    if ai_client:
        label = "OpenAI gpt-4o-mini" if ai_type == "openai" else "Claude Haiku"
        print(f"  🤖 AI-analyse:  Aktiv ({label})")
    else:
        print(f"  ⚠️  AI-analyse:  Ikke aktiv – {ai_error}")
    print(f"  📡 Jobs:  Jobnet.dk proxy klar")
    print()

    url = f"http://localhost:{PORT}"
    print(f"✅  Server kører → {url}\n")

    # Åbn browser kun lokalt
    if not is_railway:
        Thread(target=open_browser, args=(url,), daemon=True).start()

    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
