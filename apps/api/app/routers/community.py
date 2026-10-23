"""Community feed: posts (text/images/document cards/job cards/reposts), threaded comments,
likes, saves, shares, topics, reports and moderation."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_or_create_profile
from app.config import get_settings
from app.database import get_db
from app.models import GeneratedDocument, Job, Organization, Profile
from app.models_suite import Comment, ContentReport, Post, PostReaction
from app.services import doc_engine, matcher
from app.services.admin import is_platform_admin
from app.services.files import save_image
from app.services.notify import notify, notify_admins
from app.services.storage import delete_public, public_url

router = APIRouter(prefix="/community", tags=["community"])
Prof = Annotated[Profile, Depends(get_or_create_profile)]
DB = Annotated[Session, Depends(get_db)]

DEFAULT_TOPICS = ["career-advice", "job-hunt", "cv-review", "interviews", "tech", "finance", "health", "education",
                  "remote-work", "nysc", "internships", "wins"]
TOPIC_RE = re.compile(r"(?<![\w/])#([a-z0-9][a-z0-9\-]{1,30})", re.I)
MENTION_RE = re.compile(r"(?<![\w@])@([a-z0-9_.]{2,40})", re.I)
REASONS = ("spam", "harassment", "misinformation", "inappropriate", "scam", "other")


class ImageRef(BaseModel):
    key: str
    w: Optional[int] = None
    h: Optional[int] = None


class PostIn(BaseModel):
    body: str = Field("", max_length=5000)
    images: list[ImageRef] = Field(default_factory=list, max_length=4)
    topics: list[str] = Field(default_factory=list, max_length=5)
    document_id: Optional[int] = None
    job_id: Optional[int] = None
    show_contact: bool = False


class PostPatch(BaseModel):
    body: Optional[str] = Field(None, max_length=5000)
    topics: Optional[list[str]] = None
    show_contact: Optional[bool] = None


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class ShareIn(BaseModel):
    body: str = Field("", max_length=2000)
    repost: bool = False  # False = just count an external share (link / grab)


class ReportIn(BaseModel):
    target_type: str = "post"
    target_id: int
    reason: str = "other"
    details: Optional[str] = Field(None, max_length=1000)


# ── helpers ──────────────────────────────────────────────────────────────
def _author(p: Profile | None) -> dict | None:
    if not p:
        return None
    return {"id": p.id, "name": p.full_name or (p.email or "").split("@")[0], "username": p.username, "headline": p.headline,
            "avatar_url": p.avatar_url, "badge_level": p.badge_level or "none"}


def _norm_topics(raw: list[str], body: str) -> list[str]:
    out: list[str] = []
    for t in list(raw) + TOPIC_RE.findall(body or ""):
        t = re.sub(r"[^a-z0-9\-]", "", t.lower().replace(" ", "-").lstrip("#"))[:32]
        if t and t not in out:
            out.append(t)
    return out[:5]


def _doc_card(db: Session, doc_id: int | None, show_contact: bool) -> dict | None:
    doc = db.get(GeneratedDocument, doc_id) if doc_id else None
    if not doc:
        return None
    snap = doc.content_snapshot or {}
    c = snap.get("content") if snap.get("v") == 3 else None
    c = c or {}
    style = doc_engine.normalize_style(snap.get("style"), doc.template)
    exp = (c.get("experience") or [])[:2]
    card = {"id": doc.id, "doc_type": doc.doc_type, "title": doc.title, "template": style["template"], "color": style["color"],
            "name": c.get("name"), "headline": c.get("headline"), "summary": (c.get("summary") or "")[:280],
            "skills": [s if isinstance(s, str) else s.get("name") for s in (c.get("skills") or [])][:8],
            "roles": [{"title": x.get("title"), "org": x.get("org") or x.get("organization")} for x in exp],
            "pages": snap.get("pages"), "target_job_title": doc.target_job_title, "contact_hidden": not show_contact}
    if doc.doc_type == "cover_letter":
        paras = c.get("paragraphs") or c.get("body") or []
        card["summary"] = (paras[0] if paras else "")[:280]
    if show_contact:
        card["contact"] = c.get("contact")
    return card


def _job_card(db: Session, job_id: int | None, viewer: Profile) -> dict | None:
    job = db.get(Job, job_id) if job_id else None
    if not job:
        return None
    org = db.get(Organization, job.organization_id)
    try:
        m = matcher.summary(matcher.match_job(db, viewer, job))
    except Exception:  # noqa: BLE001
        m = None
    return {"id": job.id, "title": job.title, "location": job.location, "employment_type": job.employment_type, "status": job.status,
            "salary_min": job.salary_min, "salary_max": job.salary_max, "salary_currency": job.salary_currency,
            "organization": {"id": org.id, "name": org.name, "logo_url": getattr(org, "logo_url", None),
                             "verified": org.verification_status == "verified"} if org else None,
            "match": m}


def _post_out(db: Session, post: Post, viewer: Profile, authors: dict | None = None, mine: dict | None = None, depth: int = 0) -> dict:
    authors = authors or {}
    author = authors.get(post.profile_id) or db.get(Profile, post.profile_id)
    if mine is None:
        mine = {r.kind for r in db.query(PostReaction).filter(PostReaction.target_type == "post", PostReaction.target_id == post.id,
                                                              PostReaction.profile_id == viewer.id).all()}
    else:
        mine = mine.get(post.id, set())
    opts = post.share_options or {}
    out = {"id": post.id, "kind": post.kind, "body": post.body, "topics": post.topics or [],
           "images": [{**i, "url": public_url(i.get("key"))} for i in (post.images or [])],
           "author": _author(author), "created_at": post.created_at.isoformat() if post.created_at else None,
           "edited": bool(post.updated_at and post.created_at and (post.updated_at - post.created_at).total_seconds() > 60),
           "counts": {"likes": post.like_count, "comments": post.comment_count, "shares": post.share_count},
           "liked": "like" in mine, "saved": "save" in mine, "is_mine": post.profile_id == viewer.id,
           "can_moderate": is_platform_admin(viewer), "hidden": post.hidden,
           "url": f"{get_settings().app_url.rstrip('/')}/post/{post.id}"}
    if post.kind == "document":
        out["document"] = _doc_card(db, post.document_id, bool(opts.get("show_contact")))
    if post.kind == "job":
        out["job"] = _job_card(db, post.job_id, viewer)
    if post.kind == "repost" and post.repost_of_id and depth == 0:
        orig = db.get(Post, post.repost_of_id)
        out["repost_of"] = _post_out(db, orig, viewer, depth=1) if orig and not orig.hidden else None
    return out


def _get_post(db: Session, post_id: int, viewer: Profile) -> Post:
    post = db.get(Post, post_id)
    if not post or (post.hidden and post.profile_id != viewer.id and not is_platform_admin(viewer)):
        raise HTTPException(404, "Post not found")
    return post


def _mentions(db: Session, body: str, actor: Profile, link: str, title: str, skip: set[int] | None = None) -> None:
    names = {m.lower() for m in MENTION_RE.findall(body or "")}
    if not names:
        return
    for p in db.query(Profile).filter(func.lower(Profile.username).in_(names)).limit(10).all():
        if p.id != actor.id and p.id not in (skip or set()):
            notify(db, p, "mention", f"{actor.full_name or 'Someone'} mentioned you", (body or "")[:140], link=link,
                   actor_id=actor.id, email_template="mention", email_ctx={"actor": actor.full_name, "snippet": body[:300]}, commit=False)


# ── feed ─────────────────────────────────────────────────────────────────
@router.get("/feed")
def feed(profile: Prof, db: DB, tab: str = "latest", topic: Optional[str] = None, q: Optional[str] = None,
         author_id: Optional[int] = None, before_id: Optional[int] = None, limit: int = 15):
    limit = max(1, min(limit, 40))
    qry = db.query(Post).filter(Post.hidden.is_(False))
    if tab == "saved":
        ids = db.query(PostReaction.target_id).filter(PostReaction.target_type == "post", PostReaction.kind == "save",
                                                      PostReaction.profile_id == profile.id)
        qry = qry.filter(Post.id.in_(ids))
    elif tab == "mine":
        qry = db.query(Post).filter(Post.profile_id == profile.id)
    if author_id:
        qry = qry.filter(Post.profile_id == author_id)
    if topic:
        qry = qry.filter(Post.topics.contains([topic.lower()]))
    if q:
        qry = qry.filter(Post.body.ilike(f"%{q.strip()[:80]}%"))
    if tab == "top":
        since = datetime.now(timezone.utc) - timedelta(days=14)
        rows = (qry.filter(Post.created_at >= since)
                .order_by((Post.like_count * 2 + Post.comment_count * 3 + Post.share_count * 4).desc(), Post.id.desc())
                .offset(0 if not before_id else 0).limit(limit).all())
    else:
        if before_id:
            qry = qry.filter(Post.id < before_id)
        rows = qry.order_by(Post.id.desc()).limit(limit).all()
    pids = {r.profile_id for r in rows}
    authors = {p.id: p for p in db.query(Profile).filter(Profile.id.in_(pids)).all()} if pids else {}
    mine: dict[int, set] = {}
    if rows:
        for r in db.query(PostReaction).filter(PostReaction.target_type == "post", PostReaction.profile_id == profile.id,
                                               PostReaction.target_id.in_([x.id for x in rows])).all():
            mine.setdefault(r.target_id, set()).add(r.kind)
    items = [_post_out(db, p, profile, authors, mine) for p in rows]
    return {"items": items, "next_before_id": rows[-1].id if len(rows) == limit and tab != "top" else None}


@router.get("/topics")
def topics(db: DB, profile: Prof):
    since = datetime.now(timezone.utc) - timedelta(days=60)
    counts: dict[str, int] = {}
    for (tps,) in db.query(Post.topics).filter(Post.hidden.is_(False), Post.created_at >= since).limit(2000).all():
        for t in tps or []:
            counts[t] = counts.get(t, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    names = [t for t, _ in ordered] + [t for t in DEFAULT_TOPICS if t not in counts]
    return [{"name": t, "count": counts.get(t, 0)} for t in names[:24]]


@router.get("/shareables")
def shareables(profile: Prof, db: DB):
    """Documents the user can attach to a post."""
    docs = (db.query(GeneratedDocument).filter(GeneratedDocument.profile_id == profile.id, GeneratedDocument.status == "ready",
                                               GeneratedDocument.doc_type.in_(("cv", "cover_letter")))
            .order_by(GeneratedDocument.created_at.desc()).limit(20).all())
    return [{"id": d.id, "title": d.title, "doc_type": d.doc_type, "created_at": d.created_at.isoformat() if d.created_at else None}
            for d in docs]


# ── posts ────────────────────────────────────────────────────────────────
@router.post("/images")
async def upload_image(profile: Prof, file: UploadFile = File(...)):
    return await save_image(profile, file, "posts")


@router.post("/posts", status_code=201)
def create_post(body: PostIn, profile: Prof, db: DB):
    text = (body.body or "").strip()
    kind = "text"
    if body.document_id:
        doc = db.get(GeneratedDocument, body.document_id)
        if not doc or doc.profile_id != profile.id:
            raise HTTPException(404, "Document not found")
        kind = "document"
    elif body.job_id:
        job = db.get(Job, body.job_id)
        if not job or job.status not in ("open", "draft"):
            raise HTTPException(404, "Job not found")
        kind = "job"
    if not text and not body.images and kind == "text":
        raise HTTPException(400, "Write something or add a photo")
    for i in body.images:
        if not i.key.startswith(f"posts/{profile.id}/"):
            raise HTTPException(400, "Invalid image")
    post = Post(profile_id=profile.id, body=text, images=[i.model_dump() for i in body.images] or None,
                topics=_norm_topics(body.topics, text), kind=kind, document_id=body.document_id if kind == "document" else None,
                job_id=body.job_id if kind == "job" else None, share_options={"show_contact": bool(body.show_contact)})
    db.add(post)
    db.flush()
    _mentions(db, text, profile, f"/post/{post.id}", "post")
    db.commit()
    db.refresh(post)
    return _post_out(db, post, profile)


@router.get("/posts/{post_id}")
def get_post(post_id: int, profile: Prof, db: DB):
    return _post_out(db, _get_post(db, post_id, profile), profile)


@router.patch("/posts/{post_id}")
def edit_post(post_id: int, body: PostPatch, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    if post.profile_id != profile.id:
        raise HTTPException(403, "Only the author can edit this post")
    if body.body is not None:
        post.body = body.body.strip()
        post.topics = _norm_topics(body.topics if body.topics is not None else post.topics or [], post.body)
    elif body.topics is not None:
        post.topics = _norm_topics(body.topics, post.body)
    if body.show_contact is not None:
        post.share_options = {**(post.share_options or {}), "show_contact": body.show_contact}
    db.commit()
    db.refresh(post)
    return _post_out(db, post, profile)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(post_id: int, profile: Prof, db: DB):
    post = db.get(Post, post_id)
    if not post:
        return
    if post.profile_id != profile.id and not is_platform_admin(profile):
        raise HTTPException(403, "Not allowed")
    for i in post.images or []:
        if not db.query(Post).filter(Post.id != post.id, Post.images.contains([{"key": i.get("key")}])).first():
            delete_public(i.get("key"))
    db.query(PostReaction).filter(PostReaction.target_type == "post", PostReaction.target_id == post.id).delete()
    db.delete(post)
    db.commit()


def _toggle(db: Session, profile: Profile, target_type: str, target_id: int, kind: str) -> bool:
    row = db.query(PostReaction).filter(PostReaction.target_type == target_type, PostReaction.target_id == target_id,
                                        PostReaction.profile_id == profile.id, PostReaction.kind == kind).first()
    if row:
        db.delete(row)
        return False
    db.add(PostReaction(target_type=target_type, target_id=target_id, profile_id=profile.id, kind=kind))
    return True


@router.post("/posts/{post_id}/like")
def like_post(post_id: int, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    on = _toggle(db, profile, "post", post.id, "like")
    post.like_count = max(0, (post.like_count or 0) + (1 if on else -1))
    if on and post.profile_id != profile.id:
        author = db.get(Profile, post.profile_id)
        notify(db, author, "like", f"{profile.full_name or 'Someone'} liked your post", (post.body or "")[:100],
               link=f"/post/{post.id}", actor_id=profile.id, commit=False)
    db.commit()
    return {"liked": on, "likes": post.like_count}


@router.post("/posts/{post_id}/save")
def save_post(post_id: int, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    on = _toggle(db, profile, "post", post.id, "save")
    db.commit()
    return {"saved": on}


@router.post("/posts/{post_id}/share")
def share_post(post_id: int, body: ShareIn, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    target = db.get(Post, post.repost_of_id) if post.kind == "repost" and post.repost_of_id else post
    target.share_count = (target.share_count or 0) + 1
    new = None
    if body.repost:
        new = Post(profile_id=profile.id, body=body.body.strip(), kind="repost", repost_of_id=target.id,
                   topics=_norm_topics([], body.body))
        db.add(new)
        if target.profile_id != profile.id:
            notify(db, db.get(Profile, target.profile_id), "like", f"{profile.full_name or 'Someone'} reposted your post",
                   body.body[:100], link=f"/post/{target.id}", actor_id=profile.id, commit=False)
    db.commit()
    return {"shares": target.share_count, "post": _post_out(db, new, profile) if new else None}


@router.get("/posts/{post_id}/document", response_class=HTMLResponse)
def shared_document(post_id: int, profile: Prof, db: DB):
    """Read-only render of a shared CV/letter. Contact details are hidden unless the author chose to show them."""
    post = _get_post(db, post_id, profile)
    doc = db.get(GeneratedDocument, post.document_id) if post.kind == "document" and post.document_id else None
    if not doc:
        raise HTTPException(404, "No document on this post")
    snap = doc.content_snapshot or {}
    style = doc_engine.normalize_style(snap.get("style"), doc.template)
    if snap.get("v") == 3 and isinstance(snap.get("content"), dict):
        content = dict(snap["content"])
        if not (post.share_options or {}).get("show_contact") and post.profile_id != profile.id:
            ct = dict(content.get("contact") or {})
            content["contact"] = {"location": ct.get("location"), "links": []}
            content.pop("recipient", None)
        html = doc_engine.render_html(doc.doc_type, content, style, screen=True)
    else:
        md = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s\-()]{7,}\d", "•••", snap.get("markdown") or "")
        html = doc_engine.render_legacy_html(doc_engine.legacy_markdown_content(md), style, screen=True)
    return HTMLResponse(html, headers={"Cache-Control": "private, max-age=60", "X-Frame-Options": "SAMEORIGIN"})


# ── comments ─────────────────────────────────────────────────────────────
@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    rows = db.query(Comment).filter(Comment.post_id == post.id).order_by(Comment.id.asc()).limit(500).all()
    pids = {r.profile_id for r in rows}
    authors = {p.id: p for p in db.query(Profile).filter(Profile.id.in_(pids)).all()} if pids else {}
    liked = {r.target_id for r in db.query(PostReaction).filter(PostReaction.target_type == "comment", PostReaction.kind == "like",
                                                                PostReaction.profile_id == profile.id,
                                                                PostReaction.target_id.in_([r.id for r in rows] or [0])).all()}
    admin = is_platform_admin(profile)
    nodes = {}
    for c in rows:
        nodes[c.id] = {"id": c.id, "parent_id": c.parent_id, "body": "[removed by moderators]" if c.hidden else c.body,
                       "hidden": c.hidden, "author": _author(authors.get(c.profile_id)), "likes": c.like_count, "liked": c.id in liked,
                       "is_mine": c.profile_id == profile.id, "can_delete": c.profile_id == profile.id or admin,
                       "created_at": c.created_at.isoformat() if c.created_at else None, "replies": []}
    roots = []
    for c in rows:
        n = nodes[c.id]
        (nodes[c.parent_id]["replies"] if c.parent_id in nodes else roots).append(n)
    return roots


@router.post("/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: int, body: CommentIn, profile: Prof, db: DB):
    post = _get_post(db, post_id, profile)
    parent = None
    if body.parent_id:
        parent = db.get(Comment, body.parent_id)
        if not parent or parent.post_id != post.id:
            raise HTTPException(400, "Reply target not found")
        # keep threads two levels deep for readability on mobile
        if parent.parent_id:
            parent = db.get(Comment, parent.parent_id) or parent
    c = Comment(post_id=post.id, profile_id=profile.id, parent_id=parent.id if parent else None, body=body.body.strip())
    db.add(c)
    post.comment_count = (post.comment_count or 0) + 1
    db.flush()
    link = f"/post/{post.id}#c{c.id}"
    targets = set()
    if post.profile_id != profile.id:
        targets.add(("comment", post.profile_id))
    if parent and parent.profile_id != profile.id:
        targets.add(("reply", parent.profile_id))
    for kind, pid in targets:
        p = db.get(Profile, pid)
        if p:
            notify(db, p, kind, f"{profile.full_name or 'Someone'} {'replied to your comment' if kind == 'reply' else 'commented on your post'}",
                   c.body[:140], link=link, actor_id=profile.id, email_template=kind,
                   email_ctx={"actor": profile.full_name, "snippet": c.body[:300]}, commit=False)
    _mentions(db, c.body, profile, link, "comment", skip={pid for _, pid in targets})
    db.commit()
    return {"id": c.id, "parent_id": c.parent_id, "body": c.body, "author": _author(profile), "likes": 0, "liked": False,
            "is_mine": True, "can_delete": True, "hidden": False, "created_at": c.created_at.isoformat() if c.created_at else None,
            "replies": [], "comment_count": post.comment_count}


@router.post("/comments/{comment_id}/like")
def like_comment(comment_id: int, profile: Prof, db: DB):
    c = db.get(Comment, comment_id)
    if not c:
        raise HTTPException(404, "Comment not found")
    on = _toggle(db, profile, "comment", c.id, "like")
    c.like_count = max(0, (c.like_count or 0) + (1 if on else -1))
    db.commit()
    return {"liked": on, "likes": c.like_count}


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, profile: Prof, db: DB):
    c = db.get(Comment, comment_id)
    if not c:
        return
    if c.profile_id != profile.id and not is_platform_admin(profile):
        raise HTTPException(403, "Not allowed")
    post = db.get(Post, c.post_id)
    n = 1 + db.query(Comment).filter(Comment.parent_id == c.id).count()
    db.delete(c)
    if post:
        post.comment_count = max(0, (post.comment_count or 0) - n)
    db.commit()


# ── reports ──────────────────────────────────────────────────────────────
@router.post("/report", status_code=201)
def report(body: ReportIn, profile: Prof, db: DB):
    if body.target_type not in ("post", "comment"):
        raise HTTPException(400, "target_type must be post or comment")
    target = db.get(Post if body.target_type == "post" else Comment, body.target_id)
    if not target:
        raise HTTPException(404, "Not found")
    dup = db.query(ContentReport).filter(ContentReport.target_type == body.target_type, ContentReport.target_id == body.target_id,
                                         ContentReport.reporter_profile_id == profile.id).first()
    if dup:
        return {"ok": True, "message": "You already reported this. Thanks — our moderators will take a look."}
    db.add(ContentReport(target_type=body.target_type, target_id=body.target_id, reporter_profile_id=profile.id,
                         reason=body.reason if body.reason in REASONS else "other", details=body.details))
    open_n = db.query(ContentReport).filter(ContentReport.target_type == body.target_type, ContentReport.target_id == body.target_id,
                                            ContentReport.status == "open").count() + 1
    if body.target_type == "post":
        target.report_count = open_n
    if open_n >= get_settings().report_autohide_threshold:
        target.hidden = True
    db.commit()
    notify_admins(db, "admin", f"Content reported ({body.reason})", (getattr(target, "body", "") or "")[:200],
                  link="/admin?tab=reports", email_ctx={"subject": "Content reported on Crede",
                                                        "message": f"A {body.target_type} was reported for {body.reason}. Open reports: {open_n}."})
    return {"ok": True, "message": "Thanks — our moderators will review this."}


@router.get("/people")
def people(profile: Prof, db: DB, q: str = "", limit: int = 8):
    """Mention autocomplete / people search."""
    qry = db.query(Profile).filter(Profile.is_public.is_(True))
    if q:
        like = f"{q.strip()[:40]}%"
        qry = qry.filter(or_(Profile.username.ilike(like), Profile.full_name.ilike(like), Profile.full_name.ilike(f"% {like}")))
    return [_author(p) for p in qry.order_by(Profile.id.desc()).limit(min(limit, 20)).all()]
