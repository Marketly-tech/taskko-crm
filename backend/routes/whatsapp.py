import asyncio
import re
import secrets as pysecrets

import httpx

from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")


class WASendBody(BaseDoc):
    text: Optional[str] = None
    media_base64: Optional[str] = None
    media_url: Optional[str] = None
    mimetype: Optional[str] = "image/jpeg"
    file_name: Optional[str] = "image.jpg"


def wa_digits(num) -> str:
    d = "".join(ch for ch in str(num or "") if ch.isdigit())
    return f"91{d}" if len(d) == 10 else d


def jid_of(num) -> str:
    return f"{wa_digits(num)}@s.whatsapp.net"


async def wa_cfg() -> dict:
    """Evolution API credentials come only from backend environment variables."""
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0, "wa_webhook_secret": 1}) or {}
    if not s.get("wa_webhook_secret"):
        s["wa_webhook_secret"] = pysecrets.token_urlsafe(16)
        await db.settings.update_one({"id": "singleton"}, {"$set": {"wa_webhook_secret": s["wa_webhook_secret"]}}, upsert=True)
    return {
        "url": os.environ.get("EVOLUTION_API_URL", "").strip().rstrip("/"),
        "key": os.environ.get("EVOLUTION_API_KEY", "").strip(),
        "instance": os.environ.get("EVOLUTION_INSTANCE_NAME", "").strip(),
        "secret": s["wa_webhook_secret"],
    }


def _configured(c: dict) -> bool:
    return bool(c["url"] and c["key"] and c["instance"])


def _evo_error(r: httpx.Response) -> str:
    try:
        j = r.json()
        resp = (j.get("response") if isinstance(j, dict) else None) or {}
        msg = resp.get("message") if isinstance(resp, dict) else None
        msg = " ".join(str(x) for x in msg) if isinstance(msg, list) else msg
    except ValueError:
        msg = None
    return str(msg or r.text[:200] or f"HTTP {r.status_code}")


async def _state(c: dict) -> str:
    try:
        async with httpx.AsyncClient(timeout=8) as cl:
            r = await cl.get(f"{c['url']}/instance/connectionState/{c['instance']}", headers={"apikey": c["key"]})
    except httpx.HTTPError:
        return "unreachable"
    if r.status_code == 404:
        return "instance_not_found"
    if r.status_code in (401, 403):
        return "invalid_api_key"
    if r.status_code >= 400:
        return f"error_{r.status_code}"
    try:
        j = r.json()
    except ValueError:
        return "unknown"
    inst = j.get("instance") if isinstance(j, dict) else None
    return inst.get("state", "unknown") if isinstance(inst, dict) else "unknown"


STATE_HELP = {
    "close": "WhatsApp is disconnected on the server. An admin must reconnect it by scanning the QR code (WhatsApp Inbox → Connection).",
    "connecting": "WhatsApp is waiting for the QR scan. Scan it with the phone (click 'Show QR' again if it expired), then try again.",
    "instance_not_found": "The WhatsApp instance set in EVOLUTION_INSTANCE_NAME does not exist on the Evolution server.",
    "invalid_api_key": "The Evolution API key (EVOLUTION_API_KEY) was rejected.",
    "unreachable": "The Evolution API server (EVOLUTION_API_URL) could not be reached.",
}


async def evo(c: dict, method: str, path: str, body: Optional[dict] = None, need_open: bool = False):
    if not _configured(c):
        raise HTTPException(status_code=503, detail="WhatsApp is not configured on the server (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME).")
    if need_open:
        st = await _state(c)
        if st != "open":
            raise HTTPException(status_code=409, detail=STATE_HELP.get(st, f"WhatsApp is not ready (state: {st})."))
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as cl:
            r = await cl.request(method, f"{c['url']}{path}/{c['instance']}", headers={"apikey": c["key"]}, json=body)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Evolution API unreachable: {e.__class__.__name__}")
    if r.status_code >= 400:
        msg = _evo_error(r)
        log.warning("Evolution %s %s -> %s %s", method, path, r.status_code, msg)
        if "connection closed" in msg.lower():
            raise HTTPException(status_code=409, detail=STATE_HELP["close"])
        if r.status_code == 400 and ("exists" in msg.lower() or "number" in msg.lower()):
            raise HTTPException(status_code=400, detail="This number is not on WhatsApp.")
        raise HTTPException(status_code=502, detail=f"WhatsApp server error: {msg}")
    try:
        return r.json()
    except ValueError:
        return {}


def _text_of(msg: dict) -> tuple:
    m = msg or {}
    if m.get("conversation"):
        return "text", m["conversation"], None
    if (m.get("extendedTextMessage") or {}).get("text"):
        return "text", m["extendedTextMessage"]["text"], None
    for k, t in (("imageMessage", "image"), ("videoMessage", "video"), ("documentMessage", "document"), ("audioMessage", "audio")):
        if m.get(k):
            return t, m[k].get("caption") or "", m[k].get("url")
    return "other", "", None


async def store_message(*, jid: str, message_id: str, from_me: bool, kind: str, text: str, media_url=None, ts=None, push_name=None, actor=None, status="sent") -> dict:
    digits = jid.split("@")[0]
    lead = await db.leads.find_one({"phone": {"$regex": f"{digits[-10:]}$"}}, {"_id": 0, "id": 1, "name": 1, "assigned_to": 1, "co_assigned_to": 1}) if len(digits) >= 10 else None
    created = ts or now_utc().isoformat()
    doc = {"message_id": message_id, "remote_jid": jid, "number": digits, "from_me": from_me, "type": kind, "text": text, "media_url": media_url,
           "lead_id": (lead or {}).get("id"), "push_name": push_name, "actor_id": (actor or {}).get("id"), "actor_name": (actor or {}).get("name"),
           "status": status, "created_at": created}
    r = await db.wa_messages.update_one({"message_id": message_id}, {"$setOnInsert": {**doc, "id": new_id()}}, upsert=True)
    inserted = bool(r.upserted_id)
    if inserted:
        await db.wa_chats.update_one({"remote_jid": jid}, {"$set": {"remote_jid": jid, "number": digits, "lead_id": doc["lead_id"], "lead_name": (lead or {}).get("name") or push_name,
                                                                  "last_text": text or f"[{kind}]", "last_at": created, "last_from_me": from_me},
                                                         "$inc": {"unread": 0 if from_me else 1}, "$setOnInsert": {"id": new_id()}}, upsert=True)
        if lead and actor:
            await log_activity(lead["id"], actor, "whatsapp_sent", (text or f"[{kind}]")[:200], {"provider": "evolution", "number": digits})
    return {**doc, "inserted": inserted, "lead": lead}


def _mask_msgs(rows: list, user: dict) -> list:
    for r in rows:
        r.pop("_id", None)
        if should_mask(user):
            r["number"] = mask_phone(r.get("number"))
            r.pop("remote_jid", None)
    return rows


async def _send(jid: str, body: WASendBody, actor: dict) -> dict:
    c = await wa_cfg()
    number = jid.split("@")[0]
    if body.media_base64 or body.media_url:
        media = body.media_base64.split(",")[-1] if body.media_base64 else body.media_url
        if body.media_base64 and len(media) > 7_000_000:
            raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")
        res = await evo(c, "POST", "/message/sendMedia", need_open=True, body={"number": number, "mediatype": "image", "mimetype": body.mimetype, "caption": body.text or "", "media": media, "fileName": body.file_name})
        kind = "image"
    elif (body.text or "").strip():
        res = await evo(c, "POST", "/message/sendText", {"number": number, "text": body.text.strip()}, need_open=True)
        kind = "text"
    else:
        raise HTTPException(status_code=400, detail="Write a message or attach an image")
    mid = ((res or {}).get("key") or {}).get("id") or new_id()
    return await store_message(jid=jid, message_id=mid, from_me=True, kind=kind, text=body.text or "", media_url=body.media_url, actor=actor, status=(res or {}).get("status", "sent"))


async def _sync(jid: str) -> int:
    c = await wa_cfg()
    res = await evo(c, "POST", "/chat/findMessages", {"where": {"key": {"remoteJid": jid}}})
    recs = res.get("messages", {}).get("records", []) if isinstance(res, dict) else res if isinstance(res, list) else []
    n = 0
    for m in recs[:500]:
        key = m.get("key") or {}
        kind, text, url = _text_of(m.get("message") or {})
        ts = m.get("messageTimestamp")
        iso = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat() if str(ts or "").isdigit() else None
        r = await store_message(jid=jid, message_id=key.get("id") or new_id(), from_me=bool(key.get("fromMe")), kind=kind, text=text, media_url=url, ts=iso, push_name=m.get("pushName"))
        n += r["inserted"]
    return n


async def _lead_jid(lead_id: str, user: dict) -> tuple:
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_access_lead(lead, user):
        raise HTTPException(status_code=403, detail="Not your lead")
    if not lead.get("phone"):
        raise HTTPException(status_code=400, detail="Lead has no phone number")
    return lead, jid_of(lead["phone"])


@router.get("/whatsapp/status")
async def wa_status(user: dict = Depends(get_current_user)):
    c = await wa_cfg()
    state = await _state(c) if _configured(c) else "not_configured"
    org = await raw_db.organizations.find_one({"id": user.get("active_organization_id")}, {"_id": 0, "slug": 1}) or {}
    base = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    return {"configured": _configured(c), "state": state, "help": STATE_HELP.get(state), "instance": c["instance"] if is_admin(user) else None,
            "webhook_url": f"{base}/api/whatsapp/webhook/{org.get('slug', '')}?secret={c['secret']}" if is_admin(user) else None}


@router.get("/whatsapp/qrcode")
async def wa_qrcode(actor: dict = Depends(require_roles("admin"))):
    c = await wa_cfg()
    res = await evo(c, "GET", "/instance/connect")
    for _ in range(3):
        if res.get("base64") or res.get("pairingCode") or ((res.get("instance") or {}).get("state") == "open"):
            break
        await asyncio.sleep(1.5)
        res = await evo(c, "GET", "/instance/connect")
    return {"base64": res.get("base64"), "code": res.get("code"), "pairing_code": res.get("pairingCode")}


@router.get("/leads/{lead_id}/whatsapp")
async def lead_whatsapp(lead_id: str, user: dict = Depends(get_current_user)):
    lead, jid = await _lead_jid(lead_id, user)
    tail = {"$regex": f"{jid.split('@')[0][-10:]}$"}
    rows = await db.wa_messages.find({"$or": [{"lead_id": lead_id}, {"number": tail}]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.wa_chats.update_many({"number": tail}, {"$set": {"unread": 0}})
    return {"messages": _mask_msgs(rows, user), "configured": _configured(await wa_cfg())}


@router.post("/leads/{lead_id}/whatsapp/messages")
async def lead_whatsapp_send(lead_id: str, body: WASendBody, user: dict = Depends(get_current_user)):
    _, jid = await _lead_jid(lead_id, user)
    msg = await _send(jid, body, user)
    msg.pop("lead", None)
    return _mask_msgs([msg], user)[0]


@router.post("/leads/{lead_id}/whatsapp/sync")
async def lead_whatsapp_sync(lead_id: str, user: dict = Depends(get_current_user)):
    _, jid = await _lead_jid(lead_id, user)
    return {"synced": await _sync(jid)}


@router.get("/whatsapp/conversations")
async def wa_conversations(search: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if user["role"] == "executive":
        ids = [x["id"] async for x in db.leads.find(exec_lead_scope(user), {"_id": 0, "id": 1})]
        q["lead_id"] = {"$in": ids}
    if search:
        q["lead_name"] = {"$regex": re.escape(search), "$options": "i"}
    rows = await db.wa_chats.find(q, {"_id": 0}).sort("last_at", -1).limit(300).to_list(300)
    for r in rows:
        if should_mask(user):
            r["number"] = mask_phone(r.get("number"))
            r.pop("remote_jid", None)
    return rows


async def _chat_access(chat_id: str, user: dict) -> dict:
    chat = await db.wa_chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["role"] == "executive":
        lead = await db.leads.find_one({"id": chat.get("lead_id")}, {"_id": 0}) if chat.get("lead_id") else None
        if not lead or not can_access_lead(lead, user):
            raise HTTPException(status_code=403, detail="Not your conversation")
    return chat


@router.get("/whatsapp/conversations/{chat_id}/messages")
async def wa_conversation_messages(chat_id: str, user: dict = Depends(get_current_user)):
    jid = (await _chat_access(chat_id, user))["remote_jid"]
    rows = await db.wa_messages.find({"remote_jid": jid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.wa_chats.update_one({"remote_jid": jid}, {"$set": {"unread": 0}})
    return _mask_msgs(rows, user)


@router.post("/whatsapp/conversations/{chat_id}/messages")
async def wa_conversation_send(chat_id: str, body: WASendBody, user: dict = Depends(get_current_user)):
    jid = (await _chat_access(chat_id, user))["remote_jid"]
    msg = await _send(jid, body, user)
    msg.pop("lead", None)
    return _mask_msgs([msg], user)[0]


@router.post("/whatsapp/sync")
async def wa_sync_all(actor: dict = Depends(require_roles("admin", "manager"))):
    c = await wa_cfg()
    chats = await evo(c, "POST", "/chat/findChats", {})
    total = 0
    for ch in (chats if isinstance(chats, list) else [])[:50]:
        jid = ch.get("remoteJid") or ch.get("id")
        if jid and jid.endswith("@s.whatsapp.net"):
            total += await _sync(jid)
    return {"synced": total}


@router.post("/whatsapp/webhook/{org_slug}")
async def wa_webhook(org_slug: str, request: Request, secret: str = ""):
    o = await raw_db.organizations.find_one({"slug": org_slug, "active": {"$ne": False}}, {"_id": 0, "id": 1})
    if not o:
        raise HTTPException(status_code=404, detail="Organisation not found")
    org_ctx.set(o["id"])
    c = await wa_cfg()
    if not pysecrets.compare_digest(secret, c["secret"]):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid body")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    event = str(payload.get("event", "")).lower().replace("_", ".")
    if event not in ("messages.upsert", "send.message"):
        return {"accepted": True}
    items = payload.get("data")
    for d in (items if isinstance(items, list) else [items or {}]):
        if not isinstance(d, dict):
            continue
        key = d.get("key") or {}
        jid = key.get("remoteJid") or ""
        if not key.get("id") or not jid.endswith("@s.whatsapp.net"):
            continue
        kind, text, url = _text_of(d.get("message") or {})
        r = await store_message(jid=jid, message_id=key["id"], from_me=bool(key.get("fromMe")), kind=kind, text=text, media_url=url, push_name=d.get("pushName"))
        lead = r.get("lead")
        if r["inserted"] and not key.get("fromMe") and lead:
            for uid in filter(None, dict.fromkeys([lead.get("assigned_to"), *(lead.get("co_assigned_to") or [])])):
                await create_notification(type="lead_assigned", title="New WhatsApp message", message=f"{lead.get('name')}: {(text or kind)[:60]}",
                                          user_id=uid, link=f"/leads/{lead['id']}?tab=whatsapp", meta={"lead_id": lead["id"]})
    return {"accepted": True}


class MessageCampaignBody(BaseDoc):
    name: str
    channel: Literal["whatsapp", "email"]
    message: str
    subject: Optional[str] = None
    stage: Optional[str] = None
    lead_ids: Optional[List[str]] = None


@router.get("/message-campaigns")
async def list_message_campaigns(user: dict = Depends(require_roles("admin", "manager"))):
    return await db.message_campaigns.find({}, {"_id": 0, "recipients": 0}).sort("created_at", -1).limit(100).to_list(100)


@router.post("/message-campaigns")
async def run_message_campaign(body: MessageCampaignBody, actor: dict = Depends(require_roles("admin", "manager"))):
    from routes.eod import resend
    if not body.name.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Campaign name and message are required")
    q: dict = {"id": {"$in": body.lead_ids}} if body.lead_ids else ({"stage": body.stage} if body.stage else None)
    if q is None:
        raise HTTPException(status_code=400, detail="Pick a stage or leads")
    leads = await db.leads.find(q, {"_id": 0}).to_list(1000)
    if not leads:
        raise HTTPException(status_code=400, detail="No leads match this selection")
    cfg = await wa_cfg()
    if body.channel == "whatsapp" and not _configured(cfg):
        raise HTTPException(status_code=400, detail="Connect WhatsApp (Evolution API) before sending a WhatsApp campaign")
    if body.channel == "email" and not (resend and os.environ.get("RESEND_API_KEY")):
        raise HTTPException(status_code=400, detail="Email (Resend) is not configured")
    doc = {"id": new_id(), "name": body.name.strip(), "channel": body.channel, "message": body.message, "stage": body.stage, "total": len(leads),
           "sent": 0, "failed": 0, "skipped": 0, "errors": [], "status": "running", "created_by_name": actor.get("name"), "created_at": now_utc().isoformat()}
    await db.message_campaigns.insert_one(doc)
    doc.pop("_id", None)
    asyncio.create_task(_deliver_campaign(doc["id"], body, leads, actor))
    return doc


async def _deliver_campaign(cid: str, body: MessageCampaignBody, leads: list, actor: dict) -> None:
    from routes.eod import SENDER_EMAIL, resend  # noqa: F401
    sent = failed = skipped = 0
    errors: list = []
    for lead in leads:
        text = body.message.replace("{name}", lead.get("name") or "")
        try:
            if body.channel == "whatsapp":
                if not lead.get("phone"):
                    skipped += 1
                    continue
                await _send(jid_of(lead["phone"]), WASendBody(text=text), actor)
            else:
                if not lead.get("email"):
                    skipped += 1
                    continue
                if not (resend and os.environ.get("RESEND_API_KEY")):
                    raise HTTPException(status_code=400, detail="Email not configured")
                await asyncio.to_thread(resend.Emails.send, {"from": SENDER_EMAIL, "to": [lead["email"]], "subject": body.subject or body.name, "html": f"<p>{text}</p>"})
                await log_activity(lead["id"], actor, "email_sent", body.subject or body.name, {"campaign": body.name})
            sent += 1
            if body.channel == "whatsapp":
                await asyncio.sleep(1.5)
        except Exception as e:
            failed += 1
            if len(errors) < 20:
                errors.append({"lead": lead.get("name"), "reason": getattr(e, "detail", None) or str(e)[:200]})
        await db.message_campaigns.update_one({"id": cid}, {"$set": {"sent": sent, "failed": failed, "skipped": skipped, "errors": errors}})
    await db.message_campaigns.update_one({"id": cid}, {"$set": {"status": "completed", "completed_at": now_utc().isoformat(),
                                                                  "sent": sent, "failed": failed, "skipped": skipped, "errors": errors}})
