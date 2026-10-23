"""Shared config, DB, auth helpers and models."""

from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import secrets
import uuid
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, status, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ---------------------------------------------------------------------------
# Config & DB
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGO = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@tasko.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

client = AsyncIOMotorClient(MONGO_URL)
raw_db = client[DB_NAME]

# Multi-organisation scoping: tenant collections auto-filter by the active org of the request.
import contextvars  # noqa: E402
org_ctx: contextvars.ContextVar = contextvars.ContextVar("org_id", default=None)
TENANT_COLLECTIONS = {
    "users", "leads", "projects", "units", "site_visits", "follow_ups", "activities", "proposals",
    "channel_partners", "whatsapp_templates", "settings", "notifications", "eod_emails",
    "wa_messages", "wa_chats", "callerdesk_calls", "callerdesk_campaigns", "message_campaigns",
    "lead_sources", "lead_events",
}


class ScopedCollection:
    def __init__(self, coll):
        self._c = coll

    def _f(self, flt=None):
        org = org_ctx.get()
        flt = dict(flt or {})
        if org and "organization_id" not in flt:
            flt["organization_id"] = org
        return flt

    def find(self, filter=None, *a, **k):
        return self._c.find(self._f(filter), *a, **k)

    async def find_one(self, filter=None, *a, **k):
        return await self._c.find_one(self._f(filter), *a, **k)

    async def count_documents(self, filter=None, *a, **k):
        return await self._c.count_documents(self._f(filter), *a, **k)

    async def update_one(self, filter, *a, **k):
        return await self._c.update_one(self._f(filter), *a, **k)

    async def update_many(self, filter, *a, **k):
        return await self._c.update_many(self._f(filter), *a, **k)

    async def delete_one(self, filter, *a, **k):
        return await self._c.delete_one(self._f(filter), *a, **k)

    async def delete_many(self, filter, *a, **k):
        return await self._c.delete_many(self._f(filter), *a, **k)

    async def distinct(self, key, filter=None, *a, **k):
        return await self._c.distinct(key, self._f(filter), *a, **k)

    async def insert_one(self, doc, *a, **k):
        org = org_ctx.get()
        if org:
            doc.setdefault("organization_id", org)
        return await self._c.insert_one(doc, *a, **k)

    async def insert_many(self, docs, *a, **k):
        org = org_ctx.get()
        if org:
            for d in docs:
                d.setdefault("organization_id", org)
        return await self._c.insert_many(docs, *a, **k)

    def aggregate(self, pipeline, *a, **k):
        org = org_ctx.get()
        if org:
            pipeline = [{"$match": {"organization_id": org}}] + list(pipeline)
        return self._c.aggregate(pipeline, *a, **k)

    def __getattr__(self, name):
        return getattr(self._c, name)


class ScopedDB:
    def __getattr__(self, name):
        coll = raw_db[name]
        return ScopedCollection(coll) if name in TENANT_COLLECTIONS else coll


db = ScopedDB()


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
log = logging.getLogger("tasko")


# ---------------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str, kind: str = "access", ttl_min: int = 60 * 12) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": kind,
        "exp": now_utc() + timedelta(minutes=ttl_min),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await raw_db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("active") is False:
        raise HTTPException(status_code=401, detail="Account is disabled")
    user.pop("_id", None)
    if user.get("role") == "super_admin":
        requested = request.headers.get("X-Organization-Id", "").strip()
        org = None
        if requested:
            org = await raw_db.organizations.find_one({"id": requested}, {"_id": 0, "id": 1})
            if not org:
                raise HTTPException(status_code=403, detail="Organisation access denied")
        if not org:
            org = await raw_db.organizations.find_one({"active": {"$ne": False}}, {"_id": 0, "id": 1}, sort=[("created_at", 1)])
        user["active_organization_id"] = (org or {}).get("id")
    else:
        if not user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Your account is not assigned to an organisation")
        org = await raw_db.organizations.find_one({"id": user["organization_id"]}, {"_id": 0, "active": 1})
        if org and org.get("active") is False:
            raise HTTPException(status_code=403, detail="Your organisation is disabled")
        user["active_organization_id"] = user["organization_id"]
    org_ctx.set(user["active_organization_id"])
    return user


def is_admin(user: dict) -> bool:
    return user.get("role") in ("admin", "super_admin")


def should_mask(user: Optional[dict]) -> bool:
    return bool(user) and user.get("role") in ("executive", "manager")


def mask_phone(value):
    if not value:
        return value
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) <= 4:
        return "XXXX"
    core_digits = digits[-10:] if len(digits) > 10 else digits
    return f"{core_digits[:2]}{'X' * (len(core_digits) - 4)}{core_digits[-2:]}"


def is_masked_value(value) -> bool:
    return bool(value) and "X" in str(value)


PHONE_FIELDS = ("phone", "secondary_contact_phone", "alt_phone")
PHONE_META_KEYS = {"phone", "mobile", "contact", "to", "from", "to_lead", "to_exec", "from_number", "number", "remote_jid", "caller", "receiver"}


def mask_lead(doc: dict, user: dict) -> dict:
    if not doc or not should_mask(user):
        return doc
    out = dict(doc)
    for f in PHONE_FIELDS:
        if out.get(f):
            out[f] = mask_phone(out[f])
            out[f"{f}_masked"] = True
    return out


def mask_leads(docs: list, user: dict) -> list:
    return [mask_lead(d, user) for d in docs] if should_mask(user) else docs


def _mask_meta(value, key=None):
    if isinstance(value, dict):
        return {k: _mask_meta(v, k.lower()) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_meta(v, key) for v in value]
    if key in PHONE_META_KEYS and value and any(ch.isdigit() for ch in str(value)):
        return mask_phone(str(value))
    return value


def mask_activities(docs: list, user: dict) -> list:
    if not should_mask(user):
        return docs
    return [{**d, "meta": _mask_meta(d.get("meta") or {})} for d in docs]


def mask_user(doc: dict, viewer: dict) -> dict:
    if not doc or not should_mask(viewer) or doc.get("id") == viewer.get("id"):
        return doc
    out = dict(doc)
    if out.get("phone"):
        out["phone"] = mask_phone(out["phone"])
        out["phone_masked"] = True
    return out


def can_access_lead(lead: dict, user: dict) -> bool:
    if user["role"] != "executive":
        return True
    return lead.get("assigned_to") == user["id"] or user["id"] in (lead.get("co_assigned_to") or [])


def exec_lead_scope(user: dict) -> dict:
    return {"$or": [{"assigned_to": user["id"]}, {"co_assigned_to": user["id"]}]}


def require_roles(*roles: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] != "super_admin" and user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


def set_auth_cookies(resp: Response, user_id: str, email: str, role: str) -> None:
    access = create_token(user_id, email, role, "access", ttl_min=60 * 12)
    refresh = create_token(user_id, email, role, "refresh", ttl_min=60 * 24 * 7)
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 12, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 24 * 7, path="/")


def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------------------
# Models (pydantic schemas for requests / responses)
# ---------------------------------------------------------------------------
Role = Literal["super_admin", "admin", "manager", "executive"]
LeadStage = Literal["new", "contacted", "contacted_dnp", "qualified", "qualified_dnp", "site_visit", "site_visit_dnp", "negotiation", "negotiation_dnp", "booked", "lost"]
ALL_STAGES = ["new", "contacted", "contacted_dnp", "qualified", "qualified_dnp", "site_visit", "site_visit_dnp", "negotiation", "negotiation_dnp", "booked", "lost"]
LeadSource = Literal["api", "magicbricks", "99acres", "commonfloor", "housing", "website", "google_ads", "facebook", "instagram", "referral", "walk_in", "manual"]
UnitStatus = Literal["available", "held", "booked", "sold"]
VisitStatus = Literal["scheduled", "completed", "no_show", "cancelled"]
FollowUpStatus = Literal["pending", "done", "missed"]


class BaseDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")


class LoginBody(BaseDoc):
    email: EmailStr
    password: str


class RegisterBody(BaseDoc):
    email: EmailStr
    password: str
    name: str
    role: Role = "executive"
    phone: Optional[str] = None


class UpdateUserBody(BaseDoc):
    name: Optional[str] = None
    role: Optional[Role] = None
    phone: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class ProjectBody(BaseDoc):
    name: str
    location: str
    city: Optional[str] = None
    rera: Optional[str] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    configurations: Optional[List[str]] = None
    cover: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = "active"


class UnitBody(BaseDoc):
    project_id: str
    tower: str
    floor: int
    unit_no: str
    config: str  # e.g. 2BHK
    carpet_area: Optional[float] = None
    price: Optional[float] = None
    facing: Optional[str] = None
    status: UnitStatus = "available"


class LeadBody(BaseDoc):
    name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    source: LeadSource = "manual"
    project_id: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    configuration: Optional[str] = None
    location_pref: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    co_assigned_to: Optional[List[str]] = None
    stage: LeadStage = "new"
    stars: Optional[int] = 0


class UpdateLeadBody(BaseDoc):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    source: Optional[LeadSource] = None
    project_id: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    configuration: Optional[str] = None
    location_pref: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    co_assigned_to: Optional[List[str]] = None
    stage: Optional[LeadStage] = None
    lost_reason: Optional[str] = None
    priority: Optional[Literal["hot", "warm", "cold"]] = None
    stars: Optional[int] = None


class AssignBody(BaseDoc):
    user_id: str


class StageBody(BaseDoc):
    stage: LeadStage
    note: Optional[str] = None


class NoteBody(BaseDoc):
    text: str
    kind: Literal["note", "call", "whatsapp", "email"] = "note"


class SiteVisitBody(BaseDoc):
    lead_id: str
    project_id: str
    scheduled_at: datetime
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class UpdateSiteVisitBody(BaseDoc):
    scheduled_at: Optional[datetime] = None
    status: Optional[VisitStatus] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    assigned_to: Optional[str] = None


class FollowUpBody(BaseDoc):
    lead_id: str
    due_at: datetime
    kind: Literal["call", "whatsapp", "email", "meeting"] = "call"
    notes: Optional[str] = None
    assigned_to: Optional[str] = None


class UpdateFollowUpBody(BaseDoc):
    due_at: Optional[datetime] = None
    status: Optional[FollowUpStatus] = None
    notes: Optional[str] = None


class SettingsBody(BaseDoc):
    whatsapp_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    google_calendar_enabled: Optional[bool] = None
    whatsapp_number: Optional[str] = None
    resend_from_email: Optional[str] = None
    auto_assign_enabled: Optional[bool] = None
    auto_followup_enabled: Optional[bool] = None
    auto_call_on_new_lead: Optional[bool] = None
    missed_call_followup_enabled: Optional[bool] = None
    missed_call_followup_hours: Optional[float] = None


# ---------------------------------------------------------------------------
# Activity helper
# ---------------------------------------------------------------------------
async def log_activity(lead_id: Optional[str], actor: dict, kind: str, message: str, meta: Optional[dict] = None) -> None:
    doc = {
        "id": new_id(),
        "lead_id": lead_id,
        "actor_id": actor.get("id") if actor else None,
        "actor_name": actor.get("name") if actor else "system",
        "kind": kind,
        "message": message,
        "meta": meta or {},
        "created_at": now_utc().isoformat(),
    }
    await db.activities.insert_one(doc)



async def _pick_auto_assignee() -> Optional[str]:
    """Round-robin among executives that are active."""
    execs = await db.users.find({"role": "executive", "active": {"$ne": False}}, {"id": 1, "_id": 0}).to_list(200)
    if not execs:
        return None
    # pick executive with the fewest open (non-terminal) leads
    counts = []
    for e in execs:
        c = await db.leads.count_documents({"assigned_to": e["id"], "stage": {"$nin": ["booked", "lost"]}})
        counts.append((c, e["id"]))
    counts.sort()
    return counts[0][1]


NOTIF_TYPES = Literal[
    "lead_assigned", "followup_due", "sitevisit_reminder", "missed_call",
    "team_overdue", "stale_lead", "negotiation_pending", "exec_no_activity",
    "eod_summary",
]


class NotificationBody(BaseDoc):
    id: Optional[str] = None
    user_id: Optional[str] = None
    role_scope: Optional[str] = None  # "admin" | "manager" | "executive" | None
    type: str
    title: str
    message: str
    link: Optional[str] = None
    meta: Optional[dict] = None


async def create_notification(
    *,
    type: str,
    title: str,
    message: str,
    user_id: Optional[str] = None,
    role_scope: Optional[str] = None,
    link: Optional[str] = None,
    meta: Optional[dict] = None,
    dedupe_key: Optional[str] = None,
) -> None:
    """Insert a notification. If dedupe_key given, skip if one already exists
    for the same target and key in the last 24h."""
    if dedupe_key:
        since = (now_utc() - timedelta(hours=24)).isoformat()
        exists = await db.notifications.find_one({
            "dedupe_key": dedupe_key,
            "user_id": user_id,
            "role_scope": role_scope,
            "created_at": {"$gte": since},
        })
        if exists:
            return
    doc = {
        "id": new_id(),
        "user_id": user_id,
        "role_scope": role_scope,
        "type": type,
        "title": title,
        "message": message,
        "link": link,
        "meta": meta or {},
        "read": False,
        "dedupe_key": dedupe_key,
        "created_at": now_utc().isoformat(),
    }
    await db.notifications.insert_one(doc)


IST = timezone(timedelta(hours=5, minutes=30))

