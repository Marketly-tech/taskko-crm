import asyncio
import base64
import hashlib
import hmac
import json
import re
import secrets as _secrets
import time
import xml.etree.ElementTree as ET
from typing import Any, List, Literal, Optional
from urllib.parse import parse_qs

import httpx
from fastapi import BackgroundTasks
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

from core import *  # noqa: F401,F403
from core import _pick_auto_assignee
from routes.eod import resend, SENDER_EMAIL

router = APIRouter(prefix="/api")

SOURCE_TYPES = {
    "api": "Universal Lead API", "website": "Website form", "facebook": "Facebook & Instagram Lead Ads",
    "google_ads": "Google Ads lead form", "99acres": "99acres", "magicbricks": "MagicBricks", "housing": "Housing.com",
}
LEAD_SOURCE_OF = {"api": "api", "website": "website", "facebook": "facebook", "google_ads": "google_ads",
                  "99acres": "99acres", "magicbricks": "magicbricks", "housing": "housing"}
GRAPH = "https://graph.facebook.com/v21.0"

ALIASES = {
    "name": ["name", "full_name", "fullname", "customer_name", "contact_name", "lead_name", "client_name", "cust_name", "your_name"],
    "first_name": ["first_name", "f_name", "fname", "firstname"],
    "last_name": ["last_name", "l_name", "lname", "lastname", "surname"],
    "phone": ["phone", "phone_number", "phonenumber", "mobile", "mobile_no", "mobile_number", "mobileno", "contact", "contact_no",
              "contact_number", "phonefax", "cell", "whatsapp", "whatsapp_number", "telephone", "tel", "number", "sender_mobile", "querymobile"],
    "email": ["email", "email_id", "emailid", "customer_email", "email_address", "mail", "sender_email", "queryemail"],
    "project": ["project", "project_name", "projectname", "property", "property_name", "listing", "listing_name", "prop_name", "society"],
    "budget": ["budget", "price", "price_range"],
    "budget_min": ["budget_min", "min_budget", "minbudget"],
    "budget_max": ["budget_max", "max_budget", "maxbudget"],
    "configuration": ["configuration", "bhk", "unit_type", "property_type", "flat_type", "bedrooms"],
    "location": ["location", "locality", "city", "area", "address", "preferred_location"],
    "notes": ["message", "notes", "comments", "comment", "query", "remarks", "description", "enquiry", "requirement", "querymessage"],
    "rep": ["rep_id", "assign_to", "assigned_to", "owner_email", "agent_email"],
    "channel": ["channel_id", "channel", "lead_source", "source"],
    "subject": ["subject", "campaign", "campaign_name", "utm_campaign", "ad_name", "form_name"],
}


class SourceBody(BaseDoc):
    name: str
    type: Literal["api", "website", "facebook", "google_ads", "99acres", "magicbricks", "housing"]
    executive_ids: Optional[List[str]] = None
    project_id: Optional[str] = None


class SourcePatch(BaseDoc):
    name: Optional[str] = None
    active: Optional[bool] = None
    executive_ids: Optional[List[str]] = None
    project_id: Optional[str] = None
    meta_page_token: Optional[str] = None
    meta_app_secret: Optional[str] = None


def _new_key() -> str:
    return "pz_" + _secrets.token_hex(20)


def _mask(v: Optional[str]) -> Optional[str]:
    return f"••••{v[-4:]}" if v else None


def _public(s: dict) -> dict:
    s = {k: v for k, v in s.items() if k not in ("_id", "meta_page_token", "meta_app_secret")}
    return s


def _flatten(d: Any, out: dict, prefix: str = "") -> dict:
    if isinstance(d, dict):
        for k, v in d.items():
            if isinstance(v, (dict, list)):
                _flatten(v, out, prefix)
            else:
                key = re.sub(r"[^a-z0-9]+", "_", str(k).strip().lower()).strip("_")
                if v not in (None, "") and key not in out:
                    out[key] = v
    elif isinstance(d, list):
        for item in d:
            if isinstance(item, dict) and ("name" in item or "column_id" in item or "column_name" in item) and ("values" in item or "string_value" in item or "value" in item):
                key = re.sub(r"[^a-z0-9]+", "_", str(item.get("column_id") or item.get("name") or item.get("column_name")).lower()).strip("_")
                val = item.get("string_value") or item.get("value") or (item.get("values") or [None])[0]
                if val not in (None, "") and key not in out:
                    out[key] = val
            else:
                _flatten(item, out, prefix)
    return out


def _pick(flat: dict, field: str) -> Optional[str]:
    for a in ALIASES[field]:
        if flat.get(a) not in (None, ""):
            return str(flat[a]).strip()
    return None


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 10:
        return f"+91 {digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+91 {digits[2:]}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91 {digits[1:]}"
    return f"+{digits}" if 8 <= len(digits) <= 15 else None


def _num(v: Optional[str]) -> Optional[float]:
    if not v:
        return None
    m = re.sub(r"[^\d.]", "", str(v))
    try:
        return float(m) if m else None
    except ValueError:
        return None


def map_payload(raw: dict) -> dict:
    flat = _flatten(raw, {})
    name = _pick(flat, "name") or " ".join(x for x in [_pick(flat, "first_name"), _pick(flat, "last_name")] if x) or None
    budget = _pick(flat, "budget")
    return {
        "name": name, "phone_raw": _pick(flat, "phone"), "phone": normalize_phone(_pick(flat, "phone")), "email": _pick(flat, "email"),
        "project": _pick(flat, "project"), "budget_min": _num(_pick(flat, "budget_min")),
        "budget_max": _num(_pick(flat, "budget_max")) or _num(budget), "configuration": _pick(flat, "configuration"),
        "location": _pick(flat, "location"), "notes": _pick(flat, "notes"), "rep": _pick(flat, "rep"),
        "channel": _pick(flat, "channel"), "subject": _pick(flat, "subject"),
    }


async def _read_body(request: Request) -> dict:
    data: dict = dict(request.query_params)
    for k in ("key", "api_key", "apikey"):
        data.pop(k, None)
    raw = await request.body()
    if not raw:
        return data
    ctype = request.headers.get("content-type", "").lower()
    text = raw.decode("utf-8", errors="ignore").strip()
    try:
        if "json" in ctype or text[:1] in "{[":
            parsed = json.loads(text)
            data.update(parsed if isinstance(parsed, dict) else {"items": parsed})
        elif "xml" in ctype or text.startswith("<"):
            root = ET.fromstring(text)
            for el in root.iter():
                if el.text and el.text.strip() and len(el) == 0:
                    data.setdefault(el.tag.lower(), el.text.strip())
        elif "multipart" in ctype:
            form = await request.form()
            data.update({k: v for k, v in form.items() if isinstance(v, str)})
        else:
            data.update({k: v[0] for k, v in parse_qs(text).items()})
    except (ValueError, ET.ParseError):
        data["_raw"] = text[:2000]
    return data


def _key_from_request(request: Request, path_key: Optional[str]) -> Optional[str]:
    if path_key:
        return path_key
    h = request.headers
    if h.get("x-api-key"):
        return h["x-api-key"].strip()
    auth = h.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if auth.lower().startswith("basic "):
        try:
            return base64.b64decode(auth[6:]).decode().split(":", 1)[0].strip()
        except (ValueError, UnicodeDecodeError):
            return None
    q = request.query_params
    return q.get("key") or q.get("api_key") or q.get("apikey")


async def _source_by_key(key: Optional[str]) -> dict:
    if not key:
        raise HTTPException(status_code=401, detail="Not authorized: API key missing")
    src = await raw_db.lead_sources.find_one({"key": key}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=401, detail="Not authorized: invalid API key")
    org_ctx.set(src["organization_id"])
    return src


async def _log_event(src: dict, status: str, payload: dict, started: float, lead_id: Optional[str] = None, message: str = "", ip: str = "") -> None:
    await db.lead_events.insert_one({
        "id": new_id(), "source_id": src["id"], "source_name": src["name"], "source_type": src["type"], "status": status,
        "lead_id": lead_id, "message": message, "payload": json.loads(json.dumps(payload, default=str))[:1] if isinstance(payload, list) else json.loads(json.dumps(payload, default=str)),
        "ip": ip, "latency_ms": int((time.perf_counter() - started) * 1000), "created_at": now_utc().isoformat(),
    })


async def _next_assignee(src: dict, rep: Optional[str]) -> Optional[str]:
    if rep:
        u = await db.users.find_one({"$or": [{"email": rep.lower()}, {"id": rep}], "active": {"$ne": False}}, {"id": 1})
        if u:
            return u["id"]
    ids = src.get("executive_ids") or []
    if ids:
        upd = await raw_db.lead_sources.find_one_and_update({"id": src["id"]}, {"$inc": {"rr_index": 1}}, projection={"rr_index": 1})
        active = [u["id"] for u in await db.users.find({"id": {"$in": ids}, "active": {"$ne": False}}, {"id": 1}).to_list(100)]
        ordered = [i for i in ids if i in active]
        if ordered:
            return ordered[(upd or {}).get("rr_index", 0) % len(ordered)]
    settings = await db.settings.find_one({"id": "singleton"}) or {}
    return await _pick_auto_assignee() if settings.get("auto_assign_enabled", True) else None


async def _email_admins(lead: dict, src: dict, repeat: bool) -> None:
    admins = await db.users.find({"role": "admin", "active": {"$ne": False}}, {"_id": 0, "email": 1}).to_list(20)
    to = [a["email"] for a in admins if a.get("email")]
    if not to:
        return
    title = "Repeat enquiry" if repeat else "New lead"
    rows = "".join(f"<tr><td style='padding:4px 12px 4px 0;color:#5C6661'>{k}</td><td><b>{v}</b></td></tr>"
                   for k, v in [("Name", lead.get("name")), ("Phone", lead.get("phone")), ("Email", lead.get("email") or "—"),
                                ("Source", src["name"]), ("Notes", lead.get("notes") or "—")])
    html = f"<div style='font-family:Arial'><h2 style='color:#1F3D2B'>{title} · {src['name']}</h2><table>{rows}</table></div>"
    params = {"from": SENDER_EMAIL, "to": to, "subject": f"Propzel · {title}: {lead.get('name')} ({src['name']})", "html": html}
    try:
        if resend and resend.api_key:
            await asyncio.to_thread(resend.Emails.send, params)
        else:
            log.info("[MOCK] lead alert email to %s · %s", to, params["subject"])
    except Exception as e:  # noqa: BLE001
        log.warning("lead alert email failed: %s", e)


_locks: dict = {}


async def ingest(src: dict, raw: dict, ip: str = "", test: bool = False) -> tuple:
    """Create or merge a lead from any source payload. Returns (http_status, body)."""
    last10 = re.sub(r"\D", "", str(map_payload(raw)["phone"] or ""))[-10:]
    lock = _locks.setdefault(f"{src['organization_id']}:{last10}", asyncio.Lock())
    try:
        async with lock:
            return await _ingest(src, raw, ip, test)
    finally:
        if not lock.locked() and not getattr(lock, "_waiters", None):
            _locks.pop(f"{src['organization_id']}:{last10}", None)


async def _ingest(src: dict, raw: dict, ip: str, test: bool) -> tuple:
    started = time.perf_counter()
    if not src.get("active", True):
        await _log_event(src, "rejected", raw, started, message="Source is paused", ip=ip)
        return 403, {"status": "error", "message": "This lead source is paused in Propzel"}
    m = map_payload(raw)
    if not m["phone"]:
        await _log_event(src, "rejected", raw, started, message="Missing or invalid phone number", ip=ip)
        return 400, {"status": "error", "message": "A valid phone number is required (field: phone / mobile / phonefax)"}
    now = now_utc().isoformat()
    last10 = re.sub(r"\D", "", m["phone"])[-10:]
    existing = await db.leads.find_one({"phone": {"$regex": f"{last10}$"}}, {"_id": 0})
    enquiry = {k: m[k] for k in ("project", "configuration", "location", "notes", "subject") if m.get(k)}
    if existing:
        await db.leads.update_one({"id": existing["id"]}, [{"$set": {"updated_at": now, "last_enquiry_at": now, "enquiry_count": {"$add": [{"$ifNull": ["$enquiry_count", 1]}, 1]}}}])
        await log_activity(existing["id"], None, "repeat_enquiry", f"Repeat enquiry via {src['name']}" + (f" · {m['notes']}" if m.get("notes") else ""),
                           {"source_id": src["id"], "enquiry": enquiry, "raw": raw})
        if existing.get("assigned_to"):
            await create_notification(type="lead_assigned", title="Repeat enquiry", message=f"{existing['name']} enquired again · {src['name']}",
                                      user_id=existing["assigned_to"], link=f"/leads/{existing['id']}", meta={"lead_id": existing["id"]})
        await _log_event(src, "duplicate", raw, started, lead_id=existing["id"], message="Existing lead updated with new enquiry", ip=ip)
        await raw_db.lead_sources.update_one({"id": src["id"]}, {"$set": {"last_lead_at": now}, "$inc": {"duplicate_count": 1}})
        asyncio.create_task(_email_admins(existing, src, True))
        return 200, {"status": "duplicate", "message": "Lead already exists; new enquiry logged on it", "lead_id": existing["id"]}

    project_id = src.get("project_id")
    if m["project"]:
        p = await db.projects.find_one({"name": {"$regex": f"^{re.escape(m['project'])}$", "$options": "i"}}, {"id": 1})
        project_id = p["id"] if p else project_id
    lead = {
        "id": new_id(), "name": m["name"] or "Unknown", "phone": m["phone"], "email": m["email"],
        "source": LEAD_SOURCE_OF[src["type"]], "source_id": src["id"], "source_name": src["name"], "project_id": project_id,
        "budget_min": m["budget_min"], "budget_max": m["budget_max"], "configuration": m["configuration"], "location_pref": m["location"],
        "notes": " · ".join(x for x in [m["subject"], m["notes"]] if x) or None, "stage": "new", "priority": "hot" if not test else "warm",
        "is_test": test, "enquiry_count": 1, "created_at": now, "updated_at": now,
        "assigned_to": await _next_assignee(src, m["rep"]),
    }
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
    await log_activity(lead["id"], None, "lead_created", f"Live lead from {src['name']}", {"source_id": src["id"], "raw": raw})
    if lead["assigned_to"]:
        await create_notification(type="lead_assigned", title="New live lead", message=f"{lead['name']} · {src['name']}",
                                  user_id=lead["assigned_to"], link=f"/leads/{lead['id']}", meta={"lead_id": lead["id"]})
    await _log_event(src, "created", raw, started, lead_id=lead["id"], message="Lead created", ip=ip)
    await raw_db.lead_sources.update_one({"id": src["id"]}, {"$set": {"last_lead_at": now}, "$inc": {"lead_count": 1}})
    asyncio.create_task(_email_admins(lead, src, False))
    return 201, {"status": "success", "message": "Lead created", "lead_id": lead["id"]}


def _ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()


# ---------------------------------------------------------------------------
# Public ingestion endpoints
# ---------------------------------------------------------------------------
@router.api_route("/v1/leads", methods=["GET", "POST"])
async def v1_leads(request: Request):
    src = await _source_by_key(_key_from_request(request, None))
    code, body = await ingest(src, await _read_body(request), _ip(request))
    return JSONResponse(body, status_code=code)


@router.api_route("/v1/leads/{key}", methods=["GET", "POST"])
async def v1_leads_path(key: str, request: Request):
    src = await _source_by_key(key)
    code, body = await ingest(src, await _read_body(request), _ip(request))
    return JSONResponse(body, status_code=code)


@router.post("/v1/google-ads/{key}")
async def v1_google_ads(key: str, request: Request):
    src = await _source_by_key(key)
    raw = await _read_body(request)
    if raw.get("google_key") and raw["google_key"] != key:
        raise HTTPException(status_code=401, detail="Not authorized: google_key does not match")
    code, body = await ingest(src, raw, _ip(request), test=bool(raw.get("is_test")))
    return JSONResponse(body if code >= 400 else {}, status_code=200 if code < 400 else code)


@router.get("/v1/meta/{key}")
async def v1_meta_verify(key: str, request: Request):
    src = await _source_by_key(key)
    q = request.query_params
    if q.get("hub.mode") == "subscribe" and q.get("hub.verify_token") == src.get("verify_token"):
        return PlainTextResponse(q.get("hub.challenge", ""))
    raise HTTPException(status_code=403, detail="Verify token mismatch")


async def _fetch_meta_lead(src: dict, value: dict, ip: str) -> None:
    started = time.perf_counter()
    token = src.get("meta_page_token")
    if not token:
        await _log_event(src, "error", value, started, message="Page access token not set — add it in Propzel Lead Sources", ip=ip)
        return
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get(f"{GRAPH}/{value.get('leadgen_id')}", params={"access_token": token, "fields": "field_data,created_time,ad_name,campaign_name,form_id,platform"})
    if r.status_code != 200:
        await _log_event(src, "error", {"webhook": value, "graph": r.text[:500]}, started, message="Meta Graph API refused the lead fetch", ip=ip)
        return
    data = r.json()
    raw = {**{f["name"]: (f.get("values") or [""])[0] for f in data.get("field_data", [])},
           "subject": data.get("campaign_name") or data.get("ad_name"), "meta_leadgen_id": value.get("leadgen_id"), "platform": data.get("platform")}
    await ingest(src, raw, ip)


@router.post("/v1/meta/{key}")
async def v1_meta_webhook(key: str, request: Request):
    src = await _source_by_key(key)
    body = await request.body()
    if src.get("meta_app_secret"):
        sig = request.headers.get("x-hub-signature-256", "")
        expected = "sha256=" + hmac.new(src["meta_app_secret"].encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid Meta signature")
    payload = json.loads(body or b"{}")
    ip = _ip(request)
    tasks = [_fetch_meta_lead(src, ch.get("value", {}), ip) for e in payload.get("entry", []) for ch in e.get("changes", []) if ch.get("field") == "leadgen"]
    await asyncio.gather(*tasks)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin management
# ---------------------------------------------------------------------------
async def _get_source(sid: str) -> dict:
    s = await db.lead_sources.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Lead source not found")
    return s


def _view(s: dict, today: str, counts: dict) -> dict:
    v = _public(s)
    v["meta_page_token_set"] = _mask(s.get("meta_page_token"))
    v["meta_app_secret_set"] = _mask(s.get("meta_app_secret"))
    v["today_count"] = counts.get(s["id"], 0)
    return v


@router.get("/lead-sources")
async def list_sources(user: dict = Depends(require_roles("admin", "manager"))):
    items = await db.lead_sources.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    now = now_utc()
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()
    counts = {r["_id"]: r["n"] async for r in db.lead_events.aggregate([{"$match": {"status": "created", "created_at": {"$gte": today}}}, {"$group": {"_id": "$source_id", "n": {"$sum": 1}}}])}
    return {"items": [_view(s, today, counts) for s in items], "types": SOURCE_TYPES}


@router.post("/lead-sources")
async def create_source(body: SourceBody, user: dict = Depends(require_roles("admin", "manager"))):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    doc = {"id": new_id(), "name": body.name.strip(), "type": body.type, "key": _new_key(), "verify_token": _secrets.token_hex(12),
           "active": True, "executive_ids": body.executive_ids or [], "project_id": body.project_id, "rr_index": 0,
           "lead_count": 0, "duplicate_count": 0, "last_lead_at": None, "created_by": user["id"], "created_at": now_utc().isoformat()}
    await db.lead_sources.insert_one(doc)
    return _view(doc, "", {})


async def _meta_connect(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        me = await c.get(f"{GRAPH}/me", params={"access_token": token, "fields": "id,name"})
        if me.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Meta rejected the page token: {me.json().get('error', {}).get('message', me.text[:200])}")
        page = me.json()
        sub = await c.post(f"{GRAPH}/{page['id']}/subscribed_apps", params={"access_token": token, "subscribed_fields": "leadgen"})
    return {"meta_page_id": page["id"], "meta_page_name": page.get("name"), "meta_subscribed": sub.status_code == 200,
            "meta_subscribe_error": None if sub.status_code == 200 else sub.json().get("error", {}).get("message")}


@router.patch("/lead-sources/{sid}")
async def update_source(sid: str, body: SourcePatch, user: dict = Depends(require_roles("admin", "manager"))):
    await _get_source(sid)
    upd = body.model_dump(exclude_none=True)
    if "name" in upd and not upd["name"].strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if upd.get("executive_ids") and await db.users.count_documents({"id": {"$in": upd["executive_ids"]}, "role": "executive"}) != len(set(upd["executive_ids"])):
        raise HTTPException(status_code=400, detail="Rotation list must contain executives of this organisation")
    if upd.get("meta_page_token"):
        upd.update(await _meta_connect(upd["meta_page_token"].strip()))
    await db.lead_sources.update_one({"id": sid}, {"$set": upd})
    return _view(await _get_source(sid), "", {})


@router.post("/lead-sources/{sid}/rotate-key")
async def rotate_key(sid: str, user: dict = Depends(require_roles("admin", "manager"))):
    await _get_source(sid)
    await db.lead_sources.update_one({"id": sid}, {"$set": {"key": _new_key()}})
    return _view(await _get_source(sid), "", {})


@router.delete("/lead-sources/{sid}")
async def delete_source(sid: str, user: dict = Depends(require_roles("admin"))):
    await _get_source(sid)
    await db.lead_sources.delete_one({"id": sid})
    return {"ok": True}


@router.get("/lead-sources/{sid}/events")
async def source_events(sid: str, user: dict = Depends(require_roles("admin", "manager"))):
    await _get_source(sid)
    return {"items": await db.lead_events.find({"source_id": sid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)}


@router.post("/lead-sources/{sid}/test")
async def test_source(sid: str, user: dict = Depends(require_roles("admin", "manager"))):
    src = await _get_source(sid)
    n = _secrets.randbelow(10 ** 9)
    code, body = await ingest(src, {"name": f"Test Lead {n % 1000}", "phone": f"9{n:09d}", "email": "test.lead@example.com",
                                    "message": f"Test lead sent from Propzel for {src['name']}"}, "propzel-test", test=True)
    return {"http_status": code, **body}


# ---------------------------------------------------------------------------
# Real-time stream (Server-Sent Events) — new leads pushed to the CRM UI
# ---------------------------------------------------------------------------
@router.get("/live/stream")
async def live_stream(request: Request, user: dict = Depends(get_current_user)):
    org = user["active_organization_id"]
    execs_only = user["role"] == "executive"

    async def gen():
        since = now_utc().isoformat()
        beat = time.monotonic()
        yield "retry: 2000\n\n"
        while not await request.is_disconnected():
            evs = await raw_db.lead_events.find({"organization_id": org, "created_at": {"$gt": since}, "status": {"$in": ["created", "duplicate"]}},
                                                {"_id": 0, "payload": 0}).sort("created_at", 1).to_list(20)
            for ev in evs:
                since = ev["created_at"]
                lead = await raw_db.leads.find_one({"id": ev["lead_id"], "organization_id": org}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "assigned_to": 1, "co_assigned_to": 1})
                if not lead or (execs_only and user["id"] not in [lead.get("assigned_to"), *(lead.get("co_assigned_to") or [])]):
                    continue
                if should_mask(user):
                    lead["phone"] = mask_phone(lead.get("phone"))
                yield f"event: lead\ndata: {json.dumps({**ev, 'lead': lead})}\n\n"
            if time.monotonic() - beat > 15:
                beat = time.monotonic()
                yield ": ping\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
