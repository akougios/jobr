#!/usr/bin/env python3
"""
Jobr.dk – Lokal server
• /api/jobs?offset=N     → proxy til Jobnet.dk's API
• /api/analyze-cv        → AI-analyse via OpenAI eller Anthropic
• /api/status            → server + AI info
Start: python3 server.py
"""

import subprocess, sys, os, json, time, webbrowser, traceback, re, warnings
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


# ─── Adzuna API ───────────────────────────────────────────────────────────────

ADZUNA_APP_ID  = os.environ.get("ADZUNA_APP_ID",  "89154cc5")
ADZUNA_APP_KEY = os.environ.get("ADZUNA_APP_KEY", "c5a493c6da98b7710733944cf74b9d07")

def fetch_adzuna_page(offset=0, search=""):
    import requests as req
    page = (offset // 20) + 1
    url = f"https://api.adzuna.com/v1/api/jobs/dk/search/{page}"
    params = {
        "app_id":           ADZUNA_APP_ID,
        "app_key":          ADZUNA_APP_KEY,
        "results_per_page": 20,
        "what":             search or "",
        "sort_by":          "date",
        "content-type":     "application/json",
    }
    try:
        print(f"  [Adzuna] GET {url} page={page}")
        r = req.get(url, params=params, timeout=15)
        print(f"  [Adzuna] Status: {r.status_code}, Body[:200]: {r.text[:200]}")
        if r.status_code != 200:
            return [], f"Adzuna HTTP {r.status_code}", 0
        data = r.json()
    except Exception as e:
        return [], str(e), 0

    results = data.get("results") or []
    jobs = []
    for p in results:
        jid         = str(p.get("id", ""))
        title       = (p.get("title") or "").strip()
        company     = (p.get("company", {}) or {}).get("display_name", "Ukendt")
        location    = (p.get("location", {}) or {}).get("display_name", "Danmark")
        description = clean_html(p.get("description") or "")[:1500]
        salary_min  = p.get("salary_min")
        salary_max  = p.get("salary_max")
        salary      = f"{int(salary_min):,}–{int(salary_max):,} kr/md".replace(",", ".") if salary_min and salary_max else ""
        created     = p.get("created") or ""
        redirect    = p.get("redirect_url") or ""
        contract    = (p.get("contract_time") or "full_time").replace("_", " ").title()
        jobs.append({
            "id":          f"az-{jid}",
            "title":       title,
            "company":     company,
            "location":    location,
            "type":        contract,
            "workMode":    "Kontor",
            "salary":      salary,
            "description": description,
            "keywords":    extract_kws(title + " " + description),
            "posted":      parse_date(created),
            "deadline":    "",
            "url":         redirect,
            "source":      "adzuna.dk",
            "sourceLabel": "Adzuna",
            "industry":    get_industry(title, description),
        })

    total = data.get("count") or len(jobs)
    return jobs, None, total


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
    "python","javascript","typescript","java","golang","rust","php","swift","kotlin",
    "react","vue","angular","next.js","node.js","django","flask","fastapi","spring",
    "sql","postgresql","mysql","mongodb","redis","elasticsearch","kafka","spark",
    "pandas","numpy","scikit-learn","tensorflow","pytorch","machine learning","nlp",
    "aws","azure","gcp","docker","kubernetes","terraform","ci/cd","linux",
    "figma","ux","ui","design systems","user research",
    "excel","jira","scrum","agile","kanban","hubspot","salesforce","power bi","tableau",
    "seo","sem","content marketing","b2b","saas",
    "projektledelse","kommunikation","ledelse","analytisk","forretningsudvikling",
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

CV_SYSTEM = """Du er en erfaren headhunter og rekrutteringsekspert med 20 års erfaring.
Din opgave er at analysere CV'er dybdegående og identificere ALLE kompetencer – både eksplicitte og underliggende.
Du forstår transferable skills: en tekstildesigner kan sagtens arbejde med produktdesign, en journalist med content marketing osv.
Returnér KUN gyldig JSON – ingen markdown, ingen forklaring."""

CV_PROMPT = """Analyser dette CV grundigt og returnér præcis dette JSON-format:

{
  "skills": [
    {"name": "Python", "cat": "Backend", "confidence": 95, "inferred": false, "hits": 3},
    {"name": "Projektledelse", "cat": "Produkt & Agile", "confidence": 85, "inferred": true, "hits": 4}
  ],
  "roleFamily": "Data & AI",
  "seniority": "Mid-level",
  "years": 4,
  "education": "Kandidat",
  "languages": ["Dansk", "Engelsk"],
  "strengths": ["4 års erfaring med dataanalyse", "Selvstændig projektleder på 3+ projekter"],
  "domains": ["Tekstildesign", "Bæredygtigt mode", "Materialeteknologi"],
  "adjacent_roles": ["Produktdesigner", "Bæredygtighedskonsulent", "Brand Manager"],
  "summary": "Erfaren tekstildesigner med stærk baggrund i bæredygtige materialer",
  "context_keywords": ["cirkulær økonomi", "leverandørstyring", "kollektionsudvikling"],
  "wildcard_roles": ["UX Researcher", "Bæredygtighedskonsulent", "Indkøbsansvarlig i modebranchen"],
  "working_style": "analytisk og struktureret med stærkt visuelt sans og evne til at omsætte komplekse krav til konkrete løsninger",
  "discovery_reasoning": "Tekstildesignerens erfaring med materialevalg og leverandørkæder giver direkte overførbar viden til produktionsoptimering og indkøb i fremstillingsindustrien"
}

REGLER FOR SKILLS:
- Udled ALLE kompetencer fra CV'et – ikke kun direkte nævnte
- inferred: false = eksplicit nævnt; inferred: true = udledt fra projekter/ansvar/kontekst
- confidence: 50-100 (100 = mange eksplicitte beviser, 50 = svag indikation)
- hits: antal gange kompetencen fremgår direkte eller indirekte
- cat SKAL være én af: Frontend, Backend, Mobile, Data & AI, Cloud & DevOps, Design, Produkt & Agile, Marketing, Forretning, Bløde
- Minimum 8 skills med inferred: true – læs AKTIVT mellem linjerne
- Eksempler: "koordinerede 5 leverandører" → Leverandørstyring + Forhandling; "præsenterede for bestyrelsen" → Stakeholder Management

REGLER FOR ØVRIGE FELTER:
- seniority: "Junior" (0-2 år), "Mid-level" (2-5 år), "Senior" (5-10 år), "Lead / Manager" (10+ år eller lederansvar)
- education: "PhD", "Kandidat", "Bachelor", "Gymnasial/EUD", "Bootcamp/Selvlært", eller null
- domains: 2-5 specifikke fagdomæner personen har dyb ekspertise i
- adjacent_roles: 4-8 jobtitler personen REALISTISK kan søge baseret på transferable skills
- summary: 1 præcis sætning der beskriver personen professionelt
- context_keywords: 5-10 nøgleord fra CV'ets kontekst der er vigtige for job-matching
- strengths: 3-5 konkrete, evidensbaserede sætninger (citér specifikke tal/projekter fra CV'et)
- wildcard_roles: 3-6 jobtitler personen ALDRIG HAR OVERVEJET men ville være overraskende gode til
  Tænk som karriererådgiver: hvad ville overraske denne person positivt?
  Eksempler: journalist → UX researcher (samme evne til at forstå brugerbehov og formidle)
             lærer → L&D konsulent, change management (pædagogiske evner i erhvervslivet)
             tekstildesigner → produktionsleder, indkøbsansvarlig (materialeekspertise + leverandørstyring)
- working_style: 1-2 sætninger der beskriver HVORDAN personen arbejder (analytisk/kreativ/systemisk/relationel osv.)
  Basér det på konkrete beviser fra CV'et – ikke generiske fraser
- discovery_reasoning: 1-2 sætninger der forklarer HVORFOR de uventede roller giver mening for netop denne person

CV:
"""

def analyze_cv_with_ai(cv_text, ai_type, ai_client):
    if not ai_client:
        return {"fallback": True, "error": "Ingen AI-klient"}
    text = cv_text[:12000]
    try:
        if ai_type == "openai":
            resp = ai_client.chat.completions.create(
                model="gpt-4o-mini", max_tokens=2500, temperature=0.3,
                messages=[{"role":"system","content":CV_SYSTEM},{"role":"user","content":CV_PROMPT+text}]
            )
            raw = resp.choices[0].message.content.strip()
            model = "gpt-4o-mini"
        else:
            resp = ai_client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=2500,
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

        # ── /api/jobs ──────────────────────────────────────────────────────
        if parsed.path == "/api/jobs":
            qs     = parse_qs(parsed.query)
            offset = int(qs.get("offset", ["0"])[0])
            search = qs.get("q", [""])[0]

            # Prøv Adzuna først (officiel API, ingen bot-blokering)
            jobs, err, total = fetch_adzuna_page(offset, search)
            source = "adzuna"

            # Fallback til Jobnet hvis Adzuna fejler
            if err or not jobs:
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
