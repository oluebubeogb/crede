"""End-to-end smoke test (stdlib only). Usage:
    python scripts/smoke_e2e.py http://localhost:3001/backend   # through the web proxy
    python scripts/smoke_e2e.py http://localhost:8008           # API directly
Requires the demo seed (scripts/seed_demo.py). Creates one throwaway user. Sends no email
(with SMTP unset the outbox only logs) and never processes the outbox.
"""
import http.cookiejar, json, sys, time, urllib.request, urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001/backend").rstrip("/")
PW = "CredeDemo!2026"
ok = fail = 0


def client():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(op, method, path, body=None, expect=(200, 201)):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"} if data else {})
    try:
        r = op.open(req, timeout=120)
        code, raw, ctype = r.status, r.read(), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        code, raw, ctype = e.code, e.read(), e.headers.get("content-type", "")
    out = json.loads(raw) if "json" in ctype and raw else raw
    return code, out


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1; print(f"  ✓ {name}")
    else:
        fail += 1; print(f"  ✗ {name} {extra}")


def login(email):
    op = client()
    code, _ = call(op, "POST", "/api/auth/login", {"email": email, "password": PW})
    check(f"login {email}", code == 200, code)
    return op


print(f"Crede smoke → {BASE}")
code, h = call(client(), "GET", "/health")
check("health", code == 200 and h.get("database") == "ok", h)

# ── New user: signup → profile → timeline → skills → cert
u = client(); email = f"smoke{int(time.time())}@example.com"
code, r = call(u, "POST", "/api/auth/signup", {"email": email, "password": PW, "full_name": "Smoke Tester"})
check("signup", code in (200, 201), (code, r))
code, me = call(u, "GET", "/api/profile/me"); check("profile/me", code == 200)
code, _ = call(u, "PATCH", "/api/profile/me", {"headline": "Backend engineer", "location": "Lagos, Nigeria",
                                                "years_experience": 4, "summary": "Builds payment APIs in Python and Go."})
check("profile patch", code == 200)
code, t = call(u, "POST", "/api/timeline", {"entry_type": "work", "job_title": "Backend Engineer", "organization": "Paystackish",
                                             "start_date": "2021-01-01", "is_current": True,
                                             "responsibilities": ["Built payment APIs in Python", "Ran PostgreSQL"]})
check("timeline add work", code in (200, 201), (code, t))
code, e = call(u, "POST", "/api/timeline", {"entry_type": "education", "job_title": "BSc Computer Science",
                                             "organization": "University of Lagos", "start_date": "2014-09-01", "end_date": "2018-07-01"})
check("timeline add education", code in (200, 201), (code, e))
for s in ["Python", "PostgreSQL", "Docker", "REST APIs"]:
    code, _ = call(u, "POST", "/api/skills", {"name": s, "level": "advanced"})
check("skills add", code in (200, 201))
code, sug = call(u, "GET", "/api/certifications/issuer-suggestions?q=a"); check("issuer suggestions", code == 200)
code, _ = call(u, "POST", "/api/certifications", {"name": "AWS Cloud Practitioner", "issuer": "Amazon Web Services", "issued_date": "2023-05-01"})
check("cert add", code in (200, 201))

# ── Analysis (deterministic matcher; LLM optional) → history
JD = ("Senior Backend Engineer — Lagos (hybrid). Requirements: 3+ years backend experience; strong Python; "
      "PostgreSQL; Docker; experience with payment systems is a plus; BSc in Computer Science or related.")
code, a = call(u, "POST", "/api/analysis", {"job_description": JD, "save": True})
check("analysis", code == 200, (code, str(a)[:200]))
m = a if isinstance(a, dict) else None
check("match score + weighted breakdown", isinstance(m, dict) and m.get("score") is not None
      and sum(c.get("weight", 0) for c in m.get("breakdown", [])) == 100, str(a)[:200])
if isinstance(m, dict):
    print(f"    score={m.get('score')} counts={m.get('counts')} " + " ".join(f"{c['key']}={c.get('points')}/{c.get('max')}" for c in m.get("breakdown", [])))
    code, again = call(u, "POST", "/api/analysis", {"job_description": JD, "save": False})
    check("JD parse cached (same jd_hash, same score)", again.get("jd_hash") == m.get("jd_hash") and again.get("score") == m.get("score"))
code, hist = call(u, "GET", "/api/history?page_size=5"); check("history list", code == 200)

# ── Generate CV + letter, restyle, export
code, g = call(u, "POST", "/api/generate", {"job_description": JD, "doc_type": "cv", "template": "modern"})
check("generate cv", code in (200, 201), (code, str(g)[:200]))
doc_id = g.get("document_id") if isinstance(g, dict) else None
for _ in range(60):
    code, d = call(u, "GET", f"/api/documents/{doc_id}")
    if d.get("status") in ("ready", "failed"): break
    time.sleep(1)
check("cv ready", d.get("status") == "ready", d.get("status"))
code, so = call(u, "GET", "/api/documents/style-options"); check("style options", code == 200 and len(so.get("templates", [])) >= 6, str(so)[:120])
if doc_id:
    code, _ = call(u, "POST", f"/api/documents/{doc_id}/style", {"template": "classic", "color": so["colors"][1]["key"] if so.get("colors") else None, "ats": False})
    check("restyle", code == 200, code)
    code, pdf = call(u, "GET", f"/api/documents/{doc_id}/download.pdf")
    check("pdf export", code == 200 and isinstance(pdf, bytes) and pdf[:4] == b"%PDF", code)
    try:
        import io, pypdf
        pages = len(pypdf.PdfReader(io.BytesIO(pdf)).pages); check(f"cv is 1–2 pages ({pages})", 1 <= pages <= 2)
    except ImportError:
        pass
    code, docx = call(u, "GET", f"/api/documents/{doc_id}/download.docx")
    check("docx export", code == 200 and isinstance(docx, bytes) and docx[:2] == b"PK", code)
code, gl = call(u, "POST", "/api/generate", {"job_description": JD, "doc_type": "cover_letter"})
check("generate cover letter", code in (200, 201), (code, str(gl)[:200]))

# ── Opportunities, community, notifications, badges
code, op = call(u, "GET", "/api/opportunities"); check("opportunities", code == 200)
code, p = call(u, "POST", "/api/community/posts", {"body": "Smoke test post — hello Crede!", "topics": ["career"]})
check("community post", code in (200, 201), (code, p))
code, f = call(u, "GET", "/api/community/feed"); check("feed", code == 200)
if isinstance(p, dict) and p.get("id"):
    code, _ = call(u, "DELETE", f"/api/community/posts/{p['id']}"); check("delete own post (cleanup)", code in (200, 204), code)
code, n = call(u, "GET", "/api/notifications/preferences"); check("email prefs get", code == 200)
code, bi = call(u, "GET", "/api/badges"); check("badges info", code == 200 and bi.get("provider") in ("none", "paystack", "monnify"), bi.get("provider"))
code, b = call(u, "POST", "/api/badges/checkout", {"level": "gray"})
check("badge checkout gated until identity confirmed", code == 400 and "missing" in str(b), (code, b))

# ── Org claim flow: claim requires domain email; admin must approve
code, orgs = call(u, "GET", "/api/organizations/suggest?q=Paystack"); check("org suggest", code == 200)

# ── Admin
ad = login("admin@crede.africa")
code, ov = call(ad, "GET", "/api/admin/overview"); check("admin overview", code == 200)
code, bq = call(ad, "GET", "/api/admin/badges"); check("admin badge queue", code == 200)
code, cq = call(ad, "GET", "/api/admin/claims"); check("admin claims", code == 200)
code, ob = call(ad, "GET", "/api/admin/outbox"); check("admin outbox (view only)", code == 200)
code, ts = call(ad, "GET", "/api/admin/teams-sync"); check("admin teams-sync status", code == 200)
code, gr = call(ad, "POST", f"/api/admin/profiles/{me['id']}/badge", {"action": "grant", "level": "gray", "note": "smoke"})
check("admin grant badge", code == 200 and gr.get("badge_level") == "gray", (code, gr))
code, gr = call(ad, "POST", f"/api/admin/profiles/{me['id']}/badge", {"action": "revoke", "level": "gray", "note": "smoke"})
check("admin revoke badge", code == 200 and gr.get("badge_level") in (None, "", "none"), (code, gr))
code, _ = call(u, "GET", "/api/admin/overview"); check("non-admin blocked from admin", code in (401, 403), code)

# ── Recruiter (org owner)
ada = login("ada@paystackish.ng")
code, jobs = call(ada, "GET", "/api/jobs"); check("jobs list", code == 200)
code, cs = call(ada, "GET", "/api/candidates/search?q=python"); check("candidate search", code == 200)

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
