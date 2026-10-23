"""SMTP mailer with a DB-backed outbox and retries.

enqueue() writes to email_outbox; a small background loop (main.lifespan) calls process_outbox().
When SMTP_HOST is unset, messages are logged and marked 'logged' instead of failing.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models_suite import EmailOutbox
from app.services.email_templates import render

log = logging.getLogger("crede.mail")
MAX_ATTEMPTS = 5


def enqueue(db: Session, to: str, template: str, ctx: dict, commit: bool = True) -> EmailOutbox | None:
    if not to or "@" not in to:
        return None
    subject, html, text = render(template, ctx)
    row = EmailOutbox(to_email=to.strip().lower(), subject=subject, html=html, text=text, template=template)
    db.add(row)
    if commit:
        db.commit()
    return row


def _send_smtp(row: EmailOutbox) -> None:
    s = get_settings()
    msg = EmailMessage()
    name, addr = parseaddr(s.smtp_from)
    msg["From"] = formataddr((name or "Crede", addr or s.smtp_user))
    msg["To"] = row.to_email
    msg["Subject"] = row.subject
    msg["Message-ID"] = make_msgid(domain=(addr or "crede.local").split("@")[-1])
    msg.set_content(row.text or "")
    msg.add_alternative(row.html, subtype="html")
    mode = (s.smtp_tls or "starttls").lower()
    ctx = ssl.create_default_context()
    if mode == "ssl" or s.smtp_port == 465:
        server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=20, context=ctx)
    else:
        server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20)
        if mode in ("starttls", "true", "1", "yes"):
            server.starttls(context=ctx)
    try:
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def process_outbox(db: Session, limit: int = 20) -> dict:
    s = get_settings()
    now = datetime.now(timezone.utc)
    rows = (db.query(EmailOutbox).filter(EmailOutbox.status == "queued", EmailOutbox.next_attempt_at <= now)
            .order_by(EmailOutbox.id).limit(limit).all())
    sent = logged = failed = 0
    for row in rows:
        if not s.smtp_enabled:
            log.info("MAIL (SMTP not configured, logged) to=%s subject=%r template=%s", row.to_email, row.subject, row.template)
            row.status, row.sent_at = "logged", now
            logged += 1
            continue
        try:
            _send_smtp(row)
            row.status, row.sent_at, row.last_error = "sent", now, None
            sent += 1
        except Exception as e:  # noqa: BLE001
            row.attempts += 1
            row.last_error = f"{type(e).__name__}: {e}"[:1000]
            if row.attempts >= MAX_ATTEMPTS:
                row.status = "failed"
                failed += 1
            else:
                row.next_attempt_at = now + timedelta(minutes=2 ** row.attempts)
            log.warning("MAIL send failed (%s/%s) to=%s: %s", row.attempts, MAX_ATTEMPTS, row.to_email, row.last_error)
    if rows:
        db.commit()
    return {"sent": sent, "logged": logged, "failed": failed, "seen": len(rows)}
