"""Branded HTML emails. Every template returns (subject, html, text). Inline CSS only (mail clients)."""
from __future__ import annotations

import html as _h

from app.config import get_settings

ACCENT = "#2563EB"


def _e(v) -> str:
    return _h.escape(str(v or ""))


def _layout(title: str, intro: str, body_html: str = "", cta: tuple[str, str] | None = None, footer: str = "") -> str:
    app = get_settings().app_url.rstrip("/")
    btn = ""
    if cta:
        label, href = cta
        if href.startswith("/"):
            href = app + href
        btn = (f'<tr><td style="padding:8px 32px 28px"><a href="{_e(href)}" style="display:inline-block;background:{ACCENT};'
               f'color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">{_e(label)}</a></td></tr>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(title)}</title></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
<tr><td style="padding:24px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:30px;height:30px;border-radius:9px;background:{ACCENT};color:#fff;font-weight:800;font-size:16px;text-align:center;vertical-align:middle">C</td>
<td style="padding-left:10px;font-weight:700;font-size:15px;letter-spacing:-0.01em">Crede</td></tr></table></td></tr>
<tr><td style="padding:22px 32px 6px;font-size:20px;font-weight:700;letter-spacing:-0.02em;line-height:1.3">{_e(title)}</td></tr>
<tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.6;color:#334155">{intro}</td></tr>
{f'<tr><td style="padding:0 32px 18px;font-size:14px;line-height:1.6;color:#334155">{body_html}</td></tr>' if body_html else ''}
{btn}
<tr><td style="padding:18px 32px;border-top:1px solid #EEF2F7;font-size:12px;color:#64748B;line-height:1.5">
{footer or 'You get this email because you have a Crede account. Manage email preferences in Settings → Notifications.'}<br>
<a href="{app}" style="color:#64748B">crede.collab.name.ng</a> · Part of the Collab Suite</td></tr>
</table></td></tr></table></body></html>"""


def _quote(text: str) -> str:
    return (f'<div style="border-left:3px solid #DBEAFE;background:#F8FAFC;padding:10px 14px;border-radius:8px;'
            f'color:#0F172A">{_e(text)}</div>')


def render(template: str, c: dict) -> tuple[str, str, str]:
    name = _e(c.get("name") or "there")
    link = c.get("link") or "/"
    t = template
    if t == "welcome":
        subj = "Welcome to Crede"
        html = _layout("Welcome to Crede", f"Hi {name}, your verified career profile starts here.",
                       "Add your timeline once — roles, schools and certifications — and Crede turns it into tailored CVs, "
                       "cover letters and honest match scores. Ask employers and schools to verify claims to earn a badge.",
                       ("Open your dashboard", "/dashboard"))
        text = f"Hi {c.get('name') or 'there'}, welcome to Crede. Open {get_settings().app_url}/dashboard"
    elif t == "verification_request":
        subj = f"Verification request: {c.get('requester')}"
        html = _layout("New verification request", f"<b>{_e(c.get('requester'))}</b> asked <b>{_e(c.get('org'))}</b> to confirm a claim.",
                       _quote(c.get("summary") or ""), ("Review request", link))
        text = f"{c.get('requester')} asked {c.get('org')} to verify: {c.get('summary')}. Review: {link}"
    elif t == "verification_result":
        ok = c.get("approved")
        subj = f"{c.get('org')} {'verified' if ok else 'declined'} your claim"
        html = _layout(f"Claim {'verified' if ok else 'not verified'}",
                       f"Hi {name}, <b>{_e(c.get('org'))}</b> {'confirmed' if ok else 'could not confirm'} this claim:",
                       _quote(c.get("summary") or "") + (f"<p style='margin:12px 0 0'>Note: {_e(c.get('note'))}</p>" if c.get("note") else ""),
                       ("View verification", "/verification"))
        text = f"{c.get('org')} {'verified' if ok else 'declined'}: {c.get('summary')}"
    elif t == "org_claim_code":
        subj = f"Your Crede code: {c.get('code')}"
        html = _layout("Confirm your official email", f"Use this code to confirm you work at <b>{_e(c.get('org'))}</b>:",
                       f'<div style="font-size:30px;font-weight:800;letter-spacing:8px;color:{ACCENT}">{_e(c.get("code"))}</div>'
                       '<p style="margin:12px 0 0;color:#64748B">The code expires in 30 minutes. If you did not request it, ignore this email.</p>')
        text = f"Your Crede code for {c.get('org')}: {c.get('code')} (expires in 30 minutes)"
    elif t == "org_claim_admin":
        subj = f"Org claim to review: {c.get('org')}"
        html = _layout("Organization claim awaiting approval", f"<b>{_e(c.get('requester'))}</b> wants to manage <b>{_e(c.get('org'))}</b>.",
                       f"Method: {_e(c.get('method'))}<br>Work email: {_e(c.get('work_email') or '—')} "
                       f"({'domain verified' if c.get('email_verified') else 'not verified'})"
                       + (f"<br><br>{_quote(c.get('evidence'))}" if c.get("evidence") else ""), ("Open admin", "/admin?tab=claims"))
        text = f"Org claim for {c.get('org')} by {c.get('requester')}. Review at /admin"
    elif t == "org_claim_result":
        ok = c.get("approved")
        subj = f"Your claim for {c.get('org')} was {'approved' if ok else 'declined'}"
        html = _layout(f"Claim {'approved' if ok else 'declined'}",
                       f"Hi {name}, your request to manage <b>{_e(c.get('org'))}</b> was {'approved. You can now verify claims for your organization.' if ok else 'declined.'}",
                       _quote(c.get("note")) if c.get("note") else "", ("Open organization", link))
        text = subj
    elif t == "org_invite":
        subj = f"{c.get('inviter')} added you to {c.get('org')} on Crede"
        html = _layout(f"You were added to {_e(c.get('org'))}", f"{_e(c.get('inviter'))} added you as <b>{_e(c.get('role'))}</b>.",
                       "", ("Open organization", link))
        text = subj
    elif t in ("reply", "mention", "comment"):
        what = {"reply": "replied to your comment", "mention": "mentioned you", "comment": "commented on your post"}[t]
        subj = f"{c.get('actor')} {what}"
        html = _layout(subj, f"Hi {name},", _quote(c.get("excerpt") or ""), ("View on Crede", link))
        text = f"{subj}: {c.get('excerpt')} — {link}"
    elif t == "badge_admin":
        subj = f"Badge request: {c.get('requester')} ({c.get('level')})"
        html = _layout("Badge request to review", f"<b>{_e(c.get('requester'))}</b> requested the <b>{_e(c.get('level'))}</b> badge.",
                       f"Payment: {_e(c.get('payment_status'))} via {_e(c.get('provider'))} — ref {_e(c.get('reference'))}<br>"
                       f"Eligible now: {'yes' if c.get('eligible') else 'no'}"
                       + ("<br><br><b>No payment provider is configured</b>, so no money was collected. "
                          "Review and grant manually." if c.get("provider") == "none" else ""), ("Open admin", "/admin?tab=badges"))
        text = f"Badge request from {c.get('requester')} ({c.get('level')}). Payment {c.get('payment_status')}. Review in /admin"
    elif t == "badge_result":
        status = c.get("status")
        title = {"granted": "Your badge is live", "revoked": "Your badge was removed", "rejected": "Badge request declined",
                 "pending_review": "Badge request received"}.get(status, "Badge update")
        subj = title
        html = _layout(title, f"Hi {name}, " + {
            "granted": f"your <b>{_e(c.get('level'))}</b> verification badge now shows on your profile.",
            "revoked": "your verification badge was removed from your profile.",
            "rejected": "we could not approve your badge request yet.",
            "pending_review": f"we received your request for the <b>{_e(c.get('level'))}</b> badge and will review it shortly.",
        }.get(status, "there is an update on your badge."), _quote(c.get("note")) if c.get("note") else "", ("View verification", "/verification"))
        text = f"{title}. {c.get('note') or ''}"
    elif t == "admin_alert":
        subj = c.get("subject") or "Crede admin alert"
        html = _layout(subj, _e(c.get("message")), "", ("Open admin", "/admin"))
        text = c.get("message") or subj
    else:  # generic
        subj = c.get("subject") or "Update from Crede"
        html = _layout(subj, _e(c.get("message") or ""), "", ("Open Crede", link))
        text = c.get("message") or subj
    return subj, html, text
