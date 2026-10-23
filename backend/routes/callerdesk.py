import asyncio
import json
import re
import urllib.parse
import urllib.request

from core import *  # noqa: F401,F403
from core import _pick_auto_assignee

router = APIRouter(prefix="/api")

CD_BASE = "https://app.callerdesk.io/api"
PENDING = ["pending", "dialing", "initiated", "ringing", "queued"]
CONNECTED = ["connected", "completed", "answer", "answered"]


class CampaignBody(BaseDoc):
    name: str
    lead_ids: Optional[List[str]] = None
    numbers: Optional[List[str]] = None
    calls_per_minute: Optional[int] = 3


class CampaignPatchBody(BaseDoc):
    name: Optional[str] = None
    calls_per_minute: Optional[int] = None


class CallerDeskSettingsBody(BaseDoc):
    calling_provider: Optional[Literal["twilio", "callerdesk"]] = None
    callerdesk_authcode: Optional[str] = None
    callerdesk_virtual_number: Optional[str] = None
    callerdesk_webhook_secret: Optional[str] = None


def digits(num, last10: bool = False) -> str:
    d = "".join(ch for ch in str(num or "") if ch.isdigit())
    return d[-10:] if last10 and len(d) > 10 else d


async def cd_settings() -> dict:
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    return {
        "calling_provider": s.get("calling_provider") or "twilio",
        "authcode": s.get("callerdesk_authcode") or os.environ.get("CALLERDESK_AUTHCODE", ""),
        "virtual_number": s.get("callerdesk_virtual_number") or os.environ.get("CALLERDESK_VIRTUAL_NUMBER", ""),
        "webhook_secret": s.get("callerdesk_webhook_secret") or os.environ.get("CALLERDESK_WEBHOOK_SECRET", ""),
        "org_override": bool(s.get("callerdesk_authcode")),
    }


def normalize_status(raw, duration: int = 0) -> str:
    t = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if t in {"dnp", "did_not_pick", "no_answer", "noanswer", "missed", "abandoned", "cancel", "canceled", "cancelled", "cancel_customer", "cancel_agent", "not_answered"}:
        return "dnp"
    if t in {"busy", "user_busy"}:
        return "busy"
    if t in {"failed", "error", "rejected"}:
        return "failed"
    if t in {"answer", "answered", "connected"}:
        return "connected"
    if t == "completed":
        return "connected" if duration > 0 else "dnp"
    return t or "initiated"


async def cd_request(endpoint: str, s: dict, params: dict) -> dict:
    payload = {k: v for k, v in params.items() if v not in (None, "")}
    payload["authcode"] = s["authcode"]
    url = f"{CD_BASE}/{endpoint}?{urllib.parse.urlencode(payload)}"

    def _go():
        with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=20) as r:
            raw = r.read().decode("utf-8", errors="replace")
            try:
                return json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return {"raw": raw}
    return await asyncio.to_thread(_go)


def _find(resp, keys: set):
    if isinstance(resp, dict):
        for k, v in resp.items():
            if str(k).lower() in keys and v not in (None, ""):
                return v
        resp = list(resp.values())
    if isinstance(resp, list):
        for v in resp:
            if isinstance(v, (dict, list)):
                f = _find(v, keys)
                if f is not None:
                    return f
    return None


async def save_call(lead, actor, *, call_sid, direction, status, phone_from, phone_to, duration=0, recording_url=None, campaign_id=None, campaign_number_id=None, raw=None) -> str:
    now = now_utc().isoformat()
    doc = {"provider": "callerdesk", "call_sid": call_sid, "lead_id": (lead or {}).get("id"), "lead_name": (lead or {}).get("name"),
           "actor_id": (actor or {}).get("id"), "actor_name": (actor or {}).get("name") or "CallerDesk", "direction": direction,
           "status": status, "duration_sec": duration, "phone_from": phone_from, "phone_to": phone_to, "recording_url": recording_url,
           "campaign_id": campaign_id, "campaign_number_id": campaign_number_id, "raw": raw or {}, "updated_at": now}
    existing = await db.callerdesk_calls.find_one({"call_sid": call_sid}) if call_sid else None
    if existing:
        await db.callerdesk_calls.update_one({"id": existing["id"]}, {"$set": {k: v for k, v in doc.items() if v not in (None, "") or k == "status"}})
        call_id = existing["id"]
    else:
        call_id = new_id()
        await db.callerdesk_calls.insert_one({**doc, "id": call_id, "created_at": now})
    if lead and lead.get("id"):
        kind = "missed_call" if status in ("dnp", "busy", "failed") else ("incoming_call" if direction == "incoming" else "outgoing_call")
        meta = {"provider": "callerdesk", "direction": direction, "status": status, "disposition": status, "call_sid": call_sid,
                "duration_sec": duration, "from": phone_from, "to": phone_to, "recording_url": recording_url, "campaign_id": campaign_id}
        act = {"lead_id": lead["id"], "actor_id": (actor or {}).get("id"), "actor_name": (actor or {}).get("name") or "CallerDesk",
               "kind": kind, "message": f"CallerDesk call · {status} · {duration}s", "meta": meta}
        prev = await db.activities.find_one({"meta.call_sid": call_sid}) if call_sid else None
        if prev:
            await db.activities.update_one({"id": prev["id"]}, {"$set": act})
        else:
            await db.activities.insert_one({**act, "id": new_id(), "created_at": now})
    return call_id


async def initiate_callerdesk_call(lead: dict, actor: dict, campaign_id=None, campaign_number_id=None) -> dict:
    s = await cd_settings()
    if not lead.get("phone"):
        raise HTTPException(status_code=400, detail="Lead has no phone number")
    agent = digits(actor.get("phone"), last10=True)
    if not agent:
        raise HTTPException(status_code=400, detail="Set your phone number in My profile first")
    target = digits(lead["phone"])
    if target.startswith("91") and len(target) == 12:
        target = target[2:]
    if digits(target, True) == agent:
        raise HTTPException(status_code=400, detail="The lead's number matches your own number")
    common = dict(direction="outgoing", phone_from=agent, phone_to=target, campaign_id=campaign_id, campaign_number_id=campaign_number_id)
    if not (s["authcode"] and s["virtual_number"]):
        cid = await save_call(lead, actor, call_sid=None, status="pending_credentials", **common)
        return {"call_sid": None, "status": "pending_credentials", "provider": "callerdesk", "mock": True, "activity_id": cid}
    try:
        resp = await cd_request("click_to_call_v2", s, {"calling_party_a": agent, "calling_party_b": target, "deskphone": s["virtual_number"], "call_from_did": 1})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CallerDesk error: {e}")
    msg = str(resp.get("message") or resp.get("error") or "") if isinstance(resp, dict) else ""
    kind = str(resp.get("type") or resp.get("status") or "").lower() if isinstance(resp, dict) else ""
    sid = _find(resp, {"sid_id", "call_sid", "callsid", "sid", "call_id", "callid"})
    if (msg and ("invalid" in msg.lower() or "error" in kind or "fail" in kind)) or not sid:
        await save_call(lead, actor, call_sid=None, status="failed", raw=resp if isinstance(resp, dict) else {"raw": resp}, **common)
        raise HTTPException(status_code=400, detail=f"CallerDesk rejected the call: {msg or 'no call ID returned'}")
    status = normalize_status(_find(resp, {"status", "callstatus", "call_status"}) or "initiated")
    cid = await save_call(lead, actor, call_sid=str(sid), status=status, raw=resp, **common)
    return {"call_sid": str(sid), "status": status, "provider": "callerdesk", "mock": False, "activity_id": cid}


def _mask_rows(rows: list, user: dict, keys=("phone_from", "phone_to", "phone")) -> list:
    for r in rows:
        r.pop("_id", None)
        r.pop("raw", None)
        if should_mask(user):
            for k in keys:
                if r.get(k):
                    r[k] = mask_phone(r[k])
    return rows


def _call_query(status, direction, date_from, date_to, search) -> dict:
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if direction and direction != "all":
        q["direction"] = direction
    if date_from or date_to:
        q["created_at"] = {}
        if date_from:
            q["created_at"]["$gte"] = date_from
        if date_to:
            q["created_at"]["$lte"] = f"{date_to}T23:59:59.999999+00:00" if len(date_to) == 10 else date_to
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"phone_from": rx}, {"phone_to": rx}, {"lead_name": rx}, {"call_sid": rx}]
    return q


async def _expire_stale(campaign_id: Optional[str] = None) -> None:
    cutoff = (now_utc() - timedelta(days=2)).isoformat()
    q = {"status": {"$in": PENDING}, "updated_at": {"$lte": cutoff}, **({"campaign_id": campaign_id} if campaign_id else {})}
    await db.callerdesk_campaign_numbers.update_many(q, {"$set": {"status": "dnp", "notes": "Auto-marked DNP after 2 days", "updated_at": now_utc().isoformat()}})


@router.get("/callerdesk/status")
async def callerdesk_status(user: dict = Depends(get_current_user)):
    s = await cd_settings()
    base = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    return {"provider": s["calling_provider"], "configured": bool(s["authcode"] and s["virtual_number"]),
            "virtual_number": mask_phone(s["virtual_number"]) if not is_admin(user) else s["virtual_number"],
            "org_override": s["org_override"], "webhook_url": f"{base}/api/callerdesk/webhook?org=<your-org-slug>",
            "secret_configured": bool(s["webhook_secret"])}


@router.patch("/callerdesk/settings")
async def callerdesk_update_settings(body: CallerDeskSettingsBody, actor: dict = Depends(require_roles("admin"))):
    update = {k: v.strip() if isinstance(v, str) else v for k, v in body.model_dump(exclude_none=True).items()}
    await db.settings.update_one({"id": "singleton"}, {"$set": update}, upsert=True)
    return await callerdesk_status(actor)


@router.get("/callerdesk/dashboard")
async def callerdesk_dashboard(user: dict = Depends(require_roles("admin", "manager"))):
    await _expire_stale()
    now = now_utc()
    q = {"created_at": {"$gte": datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()}}
    total, connected, dnp, failed, active, pending, recent = await asyncio.gather(
        db.callerdesk_calls.count_documents(q), db.callerdesk_calls.count_documents({**q, "status": {"$in": CONNECTED}}),
        db.callerdesk_calls.count_documents({**q, "status": "dnp"}), db.callerdesk_calls.count_documents({**q, "status": {"$in": ["failed", "busy"]}}),
        db.callerdesk_campaigns.count_documents({"status": "active"}), db.callerdesk_campaign_numbers.count_documents({"status": {"$in": PENDING}}),
        db.callerdesk_calls.find({}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8),
    )
    return {"total_calls": total, "connected": connected, "dnp": dnp, "failed": failed, "active_campaigns": active,
            "pending_campaign_calls": pending, "recent": _mask_rows(recent, user)}


@router.get("/callerdesk/call-logs")
async def callerdesk_call_logs(status: Optional[str] = None, direction: Optional[str] = None, date_from: Optional[str] = None,
                               date_to: Optional[str] = None, search: Optional[str] = None, user: dict = Depends(require_roles("admin", "manager"))):
    rows = await db.callerdesk_calls.find(_call_query(status, direction, date_from, date_to, search)).sort("created_at", -1).limit(250).to_list(250)
    return {"items": _mask_rows(rows, user)}


@router.get("/callerdesk/campaigns")
async def list_campaigns(status: Optional[str] = None, search: Optional[str] = None, user: dict = Depends(require_roles("admin", "manager"))):
    await _expire_stale()
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if search:
        q["name"] = {"$regex": re.escape(search), "$options": "i"}
    items = await db.callerdesk_campaigns.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for c in items:
        f = {"campaign_id": c["id"]}
        c["total_numbers"], c["pending_numbers"], c["dnp_numbers"], c["connected_numbers"] = await asyncio.gather(
            db.callerdesk_campaign_numbers.count_documents(f), db.callerdesk_campaign_numbers.count_documents({**f, "status": {"$in": PENDING}}),
            db.callerdesk_campaign_numbers.count_documents({**f, "status": "dnp"}), db.callerdesk_campaign_numbers.count_documents({**f, "status": "connected"}))
    return {"items": items}


@router.post("/callerdesk/campaigns")
async def create_campaign(body: CampaignBody, actor: dict = Depends(require_roles("admin", "manager"))):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Campaign name is required")
    ids = list(dict.fromkeys(body.lead_ids or []))
    leads = await db.leads.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids) or 1) if ids else []
    by_phone = {digits(x.get("phone")): x for x in leads if x.get("phone")}
    numbers = list(dict.fromkeys([digits(n) for n in (body.numbers or []) if len(digits(n)) >= 8] + list(by_phone)))
    if not numbers:
        raise HTTPException(status_code=400, detail="Add at least one lead with a phone number or a valid number")
    now = now_utc().isoformat()
    camp = {"id": new_id(), "name": body.name.strip(), "status": "draft", "calls_per_minute": max(1, min(int(body.calls_per_minute or 3), 20)),
            "created_by": actor["id"], "created_by_name": actor.get("name"), "created_at": now, "updated_at": now}
    await db.callerdesk_campaigns.insert_one(camp)
    await db.callerdesk_campaign_numbers.insert_many([{
        "id": new_id(), "campaign_id": camp["id"], "lead_id": (by_phone.get(n) or {}).get("id"), "lead_name": (by_phone.get(n) or {}).get("name"),
        "phone": n, "status": "pending", "attempts": 0, "duration_sec": 0, "call_sid": None, "created_at": now, "updated_at": now} for n in numbers])
    camp.pop("_id", None)
    return camp


@router.patch("/callerdesk/campaigns/{cid}")
async def update_campaign(cid: str, body: CampaignPatchBody, actor: dict = Depends(require_roles("admin", "manager"))):
    update = body.model_dump(exclude_none=True)
    if update:
        await db.callerdesk_campaigns.update_one({"id": cid}, {"$set": {**update, "updated_at": now_utc().isoformat()}})
    doc = await db.callerdesk_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return doc


async def run_campaign_batch(cid: str, actor: dict) -> dict:
    camp = await db.callerdesk_campaigns.find_one({"id": cid}, {"_id": 0})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    limit = camp.get("calls_per_minute") or 3
    items = await db.callerdesk_campaign_numbers.find({"campaign_id": cid, "status": "pending"}, {"_id": 0}).limit(limit).to_list(limit)
    started = 0
    for it in items:
        lead = (await db.leads.find_one({"id": it["lead_id"]}, {"_id": 0}) if it.get("lead_id") else None) or {"id": None, "name": it["phone"], "phone": it["phone"]}
        try:
            res = await initiate_callerdesk_call(lead, actor, campaign_id=cid, campaign_number_id=it["id"])
            await db.callerdesk_campaign_numbers.update_one({"id": it["id"]}, {"$set": {"status": normalize_status(res["status"]), "call_sid": res.get("call_sid"), "last_attempted_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()}, "$inc": {"attempts": 1}})
            started += 1
        except HTTPException as e:
            await db.callerdesk_campaign_numbers.update_one({"id": it["id"]}, {"$set": {"status": "failed", "notes": e.detail, "updated_at": now_utc().isoformat()}, "$inc": {"attempts": 1}})
            if "profile" in str(e.detail):
                break
    pending = await db.callerdesk_campaign_numbers.count_documents({"campaign_id": cid, "status": "pending"})
    new_status = "completed" if pending == 0 else "active"
    await db.callerdesk_campaigns.update_one({"id": cid}, {"$set": {"status": new_status, "updated_at": now_utc().isoformat()}})
    return {"started": started, "pending": pending, "status": new_status}


@router.post("/callerdesk/campaigns/{cid}/start")
async def start_campaign(cid: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.callerdesk_campaigns.update_one({"id": cid}, {"$set": {"status": "active", "started_by": actor["id"], "updated_at": now_utc().isoformat()}})
    return await run_campaign_batch(cid, actor)


@router.post("/callerdesk/campaigns/{cid}/pause")
async def pause_campaign(cid: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.callerdesk_campaigns.update_one({"id": cid}, {"$set": {"status": "paused", "updated_at": now_utc().isoformat()}})
    return {"ok": True}


@router.delete("/callerdesk/campaigns/{cid}")
async def cancel_campaign(cid: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.callerdesk_campaigns.update_one({"id": cid}, {"$set": {"status": "cancelled", "updated_at": now_utc().isoformat()}})
    await db.callerdesk_campaign_numbers.update_many({"campaign_id": cid, "status": "pending"}, {"$set": {"status": "cancelled", "updated_at": now_utc().isoformat()}})
    return {"ok": True}


@router.get("/callerdesk/campaigns/{cid}/calls")
async def campaign_calls(cid: str, status: Optional[str] = None, search: Optional[str] = None, user: dict = Depends(require_roles("admin", "manager"))):
    q: dict = {"campaign_id": cid}
    if status and status != "all":
        q["status"] = status
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"phone": rx}, {"lead_name": rx}]
    rows = await db.callerdesk_campaign_numbers.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return {"items": _mask_rows(rows, user)}


async def campaign_tick() -> None:
    """Scheduler job: dial the next batch of every active campaign."""
    async for c in db.callerdesk_campaigns.find({"status": "active"}, {"_id": 0}):
        actor = await db.users.find_one({"id": c.get("started_by") or c.get("created_by")}, {"_id": 0, "password_hash": 0})
        if actor:
            await run_campaign_batch(c["id"], actor)


@router.post("/callerdesk/webhook")
async def callerdesk_webhook(request: Request, org: Optional[str] = None):
    payload = await request.json() if "application/json" in (request.headers.get("content-type") or "") else dict(await request.form())
    payload = {**dict(request.query_params), **payload}
    payload.pop("org", None)
    o = await raw_db.organizations.find_one({"$or": [{"slug": org}, {"id": org}]} if org else {}, {"_id": 0, "id": 1}, sort=[("created_at", 1)])
    if not o:
        raise HTTPException(status_code=404, detail="Organisation not found")
    org_ctx.set(o["id"])
    s = await cd_settings()
    if s["webhook_secret"] and s["webhook_secret"] not in (payload.get("secret"), request.headers.get("X-CallerDesk-Secret")):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    sid = payload.get("sid_id") or payload.get("call_sid") or payload.get("CallSid") or payload.get("id")
    duration = int(payload.get("talk_duration") or payload.get("total_duration") or payload.get("duration") or 0)
    status = normalize_status(payload.get("callstatus") or payload.get("status"), duration)
    direction = "outgoing" if str(payload.get("callresult") or payload.get("Flow_type") or "").upper() in {"WEBOBD", "CLICK-TO-CALL", "CLICK_TO_CALL"} else (payload.get("direction") or "incoming")
    p_from = payload.get("caller_num") or payload.get("from")
    p_to = payload.get("member_num") or payload.get("destination_number") or payload.get("to")
    call = await db.callerdesk_calls.find_one({"call_sid": sid}, {"_id": 0}) if sid else None
    if call:
        direction = call.get("direction") or direction
    lead = await db.leads.find_one({"id": call["lead_id"]}, {"_id": 0}) if call and call.get("lead_id") else None
    if not lead and direction == "incoming" and digits(p_from, True):
        lead = await db.leads.find_one({"phone": {"$regex": f"{digits(p_from, True)}$"}}, {"_id": 0})
        if not lead:
            lead = {"id": new_id(), "name": f"Inbound caller {digits(p_from, True)}", "phone": digits(p_from, True), "source": "manual", "stage": "new",
                    "priority": "warm", "assigned_to": await _pick_auto_assignee(), "co_assigned_to": [], "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()}
            await db.leads.insert_one(lead)
            lead.pop("_id", None)
    actor = await db.users.find_one({"id": call["actor_id"]}, {"_id": 0}) if call and call.get("actor_id") else {"name": "CallerDesk"}
    await save_call(lead, actor, call_sid=sid, direction=direction, status=status, phone_from=p_from, phone_to=p_to, duration=duration,
                    recording_url=payload.get("file") or payload.get("recording_url"), campaign_id=(call or {}).get("campaign_id"),
                    campaign_number_id=(call or {}).get("campaign_number_id"), raw=payload)
    if call and call.get("campaign_number_id"):
        await db.callerdesk_campaign_numbers.update_one({"id": call["campaign_number_id"]}, {"$set": {"status": status, "duration_sec": duration, "updated_at": now_utc().isoformat()}})
    if lead:
        for uid in filter(None, dict.fromkeys([lead.get("assigned_to"), *(lead.get("co_assigned_to") or [])])):
            if status in ("dnp", "busy", "failed"):
                await create_notification(type="missed_call", title="Missed CallerDesk call", message=f"{lead.get('name')} · {status}", user_id=uid,
                                          link=f"/leads/{lead['id']}", meta={"lead_id": lead["id"]}, dedupe_key=f"cd:{sid}:{uid}:{status}")
            elif direction == "incoming":
                await create_notification(type="lead_assigned", title="Incoming CallerDesk call", message=f"{lead.get('name')} · {status}", user_id=uid,
                                          link=f"/leads/{lead['id']}", meta={"lead_id": lead["id"]}, dedupe_key=f"cd:{sid}:{uid}:{status}")
    return {"ok": True}
