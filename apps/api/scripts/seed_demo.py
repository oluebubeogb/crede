"""Seed a local/pilot Crede with demo data through the public API (AUTH_MODE=local or hybrid).

    python scripts/seed_demo.py http://localhost:8018

Creates: admin (first ADMIN_EMAILS entry), 3 professionals, a company, a school and an issuer org
(claimed + admin-approved), verification requests, jobs, posts, comments and a simulated badge checkout.
Idempotent-ish: re-running logs in instead of signing up.
"""
import sys
import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8018").rstrip("/") + "/api"
PW = "CredeDemo!2026"


def client(email, name):
    c = httpx.Client(base_url=BASE, timeout=60)
    r = c.post("/auth/signup", json={"email": email, "password": PW, "full_name": name})
    if r.status_code != 200:
        r = c.post("/auth/login", json={"email": email, "password": PW})
        r.raise_for_status()
    c.get("/profile/me").raise_for_status()
    return c


def ok(r, label):
    if r.status_code >= 400:
        print(f"  ! {label}: {r.status_code} {r.text[:300]}")
        return None
    print(f"  ✓ {label}")
    return r.json() if r.content else {}


def main():
    admin = client("admin@crede.africa", "Crede Admin")
    ada = client("ada@paystackish.ng", "Ada Okafor")
    tunde = client("tunde@unilag.edu.ng", "Tunde Bakare")
    ngozi = client("ngozi@cisco-demo.org", "Ngozi Eze")
    chidi = client("chidi@example.com", "Chidi Nwosu")

    print("profiles")
    ok(chidi.patch("/profile/me", json={"headline": "Backend Engineer · Python & Go", "location": "Lagos, Nigeria",
       "username": "chidi", "phone": "+2348030000000",
       "summary": "Backend engineer with 5 years building payment and logistics APIs for Nigerian fintechs. Led migration to event-driven services cutting settlement time by 40%."}), "chidi profile")
    ok(ada.patch("/profile/me", json={"headline": "Head of Talent, Paystackish", "location": "Lagos", "username": "ada"}), "ada profile")
    ok(tunde.patch("/profile/me", json={"headline": "Registrar's Office, University of Lagos", "location": "Akoka, Lagos", "username": "tunde"}), "tunde")
    ok(ngozi.patch("/profile/me", json={"headline": "Programme Lead, Cisco Networking Academy", "location": "Abuja", "username": "ngozi"}), "ngozi")

    print("orgs + claims")
    def org_claim(c, name, typ, domain, email):
        found = c.get("/organizations", params={"q": name}).json()
        items = found if isinstance(found, list) else found.get("items", [])
        org = next((o for o in items if o["name"] == name), None) or ok(c.post("/organizations", json={"name": name, "org_type": typ, "email_domain": domain, "website": f"https://{domain}", "location": "Lagos, Nigeria"}), f"create {name}")
        cl = ok(c.post(f"/organizations/{org['id']}/claim", json={"work_email": email, "evidence": "I run this page"}), f"claim {name}")
        if cl and cl.get("dev_code"):
            ok(c.post(f"/organizations/claims/{cl['id']}/confirm", json={"code": cl["dev_code"]}), f"confirm code {name}")
        return org
    company = org_claim(ada, "Paystackish", "company", "paystackish.ng", "ada@paystackish.ng")
    school = org_claim(tunde, "University of Lagos Demo", "school", "unilag.edu.ng", "tunde@unilag.edu.ng")
    issuer = org_claim(ngozi, "Cisco Networking Academy Demo", "issuer", "cisco-demo.org", "ngozi@cisco-demo.org")
    for c in admin.get("/admin/claims", params={"status": "pending_admin"}).json():
        ok(admin.post(f"/admin/claims/{c['id']}/decide", json={"approve": True, "note": "Domain + evidence look right"}), f"admin approves claim {c['id']}")

    print("chidi timeline/skills/certs")
    if not chidi.get("/timeline").json():
        ok(chidi.post("/timeline", json={"entry_type": "work", "job_title": "Backend Engineer", "organization": "Paystackish", "organization_id": company["id"], "location": "Lagos", "start_date": "2022-03-01", "is_current": True,
           "achievements": ["Cut settlement reconciliation time by 40% by moving to an event-driven pipeline (Kafka, Python)", "Designed idempotent payment webhooks handling 2M events/day"],
           "responsibilities": ["Own payouts API", "Mentor 3 junior engineers"]}), "work 1")
        ok(chidi.post("/timeline", json={"entry_type": "work", "job_title": "Software Engineer", "organization": "Kobo Logistics", "location": "Lagos", "start_date": "2020-01-01", "end_date": "2022-02-01",
           "achievements": ["Built route-pricing service in Go serving 30k quotes/day", "Reduced AWS spend 25% with right-sizing and caching"]}), "work 2")
        ok(chidi.post("/timeline", json={"entry_type": "education", "job_title": "B.Sc. Computer Science", "organization": "University of Lagos Demo", "organization_id": school["id"], "start_date": "2015-09-01", "end_date": "2019-07-01", "grade": "Second Class Upper"}), "education")
        for s in ["Python", "Go", "PostgreSQL", "Kafka", "Docker", "AWS", "FastAPI", "REST APIs"]:
            chidi.post("/skills", json={"name": s})
        ok(chidi.post("/certifications", json={"name": "CCNA", "issuer": "Cisco Networking Academy Demo", "issuer_org_id": issuer["id"], "issued_at": "2021-05-01"}), "cert")
    tl = chidi.get("/timeline").json()
    certs = chidi.get("/certifications").json()
    print("verification requests")
    for e in tl:
        if e.get("organization_id"):
            ok(chidi.post("/verification/request", json={"subject_type": "timeline", "subject_id": e["id"], "organization_id": e["organization_id"]}), f"request {e['organization']}")
    for c in certs:
        if c.get("issuer_org_id"):
            ok(chidi.post("/verification/request", json={"subject_type": "certification", "subject_id": c["id"], "organization_id": c["issuer_org_id"]}), "request cert")
    for who in (ada, tunde, ngozi):
        for r in who.get("/organizations/requests/inbox").json():
            if r.get("status") == "pending":
                ok(who.post(f"/organizations/requests/{r['id']}/decide", json={"approve": True, "note": "Confirmed from records"}), f"org approves request {r['id']}")
    print("identity + badge")
    ok(chidi.post("/verification/identity", files={"file": ("nin.png", _png(), "image/png")}, data={"notes": "NIN slip"}), "identity upload")
    for it in admin.get("/admin/identity").json():
        if it.get("status") == "submitted":
            ok(admin.post(f"/admin/identity/{it['id']}/decide", json={"approve": True, "note": "Matches"}), "admin approves identity")
    co = ok(chidi.post("/badges/checkout", json={"level": "green"}), "badge checkout (green)")
    if co and co.get("simulated"):
        ok(chidi.post(f"/badges/payments/{co['reference']}/simulate"), "simulated payment")
    for b in admin.get("/admin/badges", params={"status": "pending_review"}).json():
        ok(admin.post(f"/admin/badges/{b['id']}/decide", json={"action": "grant", "level": b["level"], "note": "Verified claims check out"}), "admin grants badge")

    print("jobs")
    if not [j for j in ada.get("/jobs").json() if j.get("organization_id") == company["id"]]:
        ok(ada.post("/jobs", json={"organization_id": company["id"], "title": "Senior Backend Engineer (Payments)", "location": "Lagos (Hybrid)", "employment_type": "full_time", "status": "open",
           "description": "We are hiring a Senior Backend Engineer to scale our payments platform.\n\nRequirements:\n- 4+ years of backend engineering experience\n- Strong Python or Go\n- Experience with PostgreSQL and event streaming (Kafka)\n- Experience designing idempotent APIs and webhooks\n- B.Sc. in Computer Science or related field\n\nNice to have:\n- AWS\n- Kubernetes\n- Fintech experience in Nigeria"}), "job 1")
        ok(ada.post("/jobs", json={"organization_id": company["id"], "title": "Product Designer", "location": "Remote (Nigeria)", "employment_type": "full_time", "status": "open",
           "description": "Requirements:\n- 3+ years product design\n- Figma\n- Design systems\n- User research\n- Portfolio of shipped mobile apps"}), "job 2")

    print("community")

    def _has_posts(c):
        return bool(c.get("/community/feed", params={"tab": "mine"}).json().get("items"))

    p1 = None
    if not _has_posts(chidi):
        img = ok(chidi.post("/community/images", files={"file": ("desk.png", _png(900, 600), "image/png")}), "image upload")
        p1 = ok(chidi.post("/community/posts", json={"body": "Just shipped idempotent webhooks that handle 2M events/day 🎉 Biggest lesson: store the provider event id before you do anything else. #engineering #fintech", "images": [{"key": img["key"], "w": img["w"], "h": img["h"]}] if img else []}), "post 1")
    if not _has_posts(ada):
        ok(ada.post("/community/posts", json={"body": "We're hiring a Senior Backend Engineer in Lagos. Crede-verified profiles get fast-tracked. #hiring #lagos", "topics": ["hiring"]}), "post 2")
    if not _has_posts(ngozi):
        ok(ngozi.post("/community/posts", json={"body": "CCNA cohort 7 opens next month in Abuja and Lagos. Certificates issued on Crede are verifiable by any employer. #certifications"}), "post 3")
    if p1:
        cm = ok(ada.post(f"/community/posts/{p1['id']}/comments", json={"body": "Great write-up @chidi — we do the same at Paystackish."}), "comment")
        if cm:
            ok(chidi.post(f"/community/posts/{p1['id']}/comments", json={"body": "Thanks! Happy to share the schema.", "parent_id": cm["id"]}), "reply")
        ok(ada.post(f"/community/posts/{p1['id']}/like"), "like")
        ok(ngozi.post(f"/community/posts/{p1['id']}/like"), "like 2")
    print("matching")
    ok(chidi.get("/opportunities"), "opportunities")
    ok(chidi.get("/profile/dashboard/stats"), "dashboard stats")
    print("done. Logins: admin@crede.africa / chidi@example.com / ada@paystackish.ng —", PW)


def _png(w=64, h=64):
    """Calm, single-accent illustration (events/day chart card) for demo posts and uploads."""
    from io import BytesIO
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (w, h), (241, 244, 250))
    d = ImageDraw.Draw(im)
    for y in range(h):  # soft vertical gradient
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=(int(238 + 10 * t), int(242 + 7 * t), int(255 - 3 * t)))
    m = max(6, w // 14)
    d.rounded_rectangle([m, m, w - m, h - m], radius=max(6, w // 40), fill=(255, 255, 255), outline=(226, 232, 240))
    if w >= 200:
        x0, x1, y0, y1 = m * 2, w - m * 2, m * 3, h - m * 2
        for i in range(4):  # grid lines
            yy = y0 + (y1 - y0) * i / 3
            d.line([(x0, yy), (x1, yy)], fill=(237, 241, 247), width=2)
        vals = [0.62, 0.58, 0.66, 0.6, 0.48, 0.5, 0.38, 0.34, 0.26, 0.22, 0.16, 0.12]
        pts = [(x0 + (x1 - x0) * i / (len(vals) - 1), y0 + (y1 - y0) * v) for i, v in enumerate(vals)]
        d.polygon(pts + [(x1, y1), (x0, y1)], fill=(232, 238, 253))
        d.line(pts, fill=(59, 91, 219), width=max(3, w // 200), joint="curve")
        lx, ly = pts[-1]
        r = max(5, w // 120)
        d.ellipse([lx - r, ly - r, lx + r, ly + r], fill=(59, 91, 219), outline=(255, 255, 255), width=2)
        d.rounded_rectangle([x0, m + m // 2, x0 + w // 6, m + m // 2 + max(8, h // 40)], radius=4, fill=(203, 213, 225))
    b = BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


if __name__ == "__main__":
    main()
