from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# TWILIO VOICE — click-to-call, status + recording callbacks
# ---------------------------------------------------------------------------
from twilio.rest import Client as TwilioClient  # noqa: E402
from twilio.request_validator import RequestValidator  # noqa: E402
from twilio.twiml.voice_response import VoiceResponse  # noqa: E402
from fastapi.responses import Response as StarletteResponse  # noqa: E402

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER")
BACKEND_PUBLIC_URL = os.environ.get("BACKEND_PUBLIC_URL", "")

_twilio_client: Optional[TwilioClient] = None
_twilio_validator: Optional[RequestValidator] = None
if TWILIO_SID and TWILIO_TOKEN:
    try:
        _twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        _twilio_validator = RequestValidator(TWILIO_TOKEN)
        log.info("Twilio client initialised (from=%s)", TWILIO_FROM)
    except Exception as e:
        log.warning("Twilio init failed: %s", e)


def _looks_like_e164(num: str) -> bool:
    return bool(num) and num.startswith("+") and len(num) >= 8


async def _initiate_twilio_call(lead: dict, actor: dict) -> dict:
    """Executive-first bridged call via Twilio. Rings the executive; on answer
    the TwiML dials the lead and records the conversation."""
    if not lead.get("phone") or not _looks_like_e164(lead["phone"].replace(" ", "")):
        raise HTTPException(status_code=400, detail="Lead has no valid E.164 phone")
    exec_phone = (actor.get("phone") or "").replace(" ", "")
    if not _looks_like_e164(exec_phone):
        raise HTTPException(status_code=400, detail="Set your phone (E.164, e.g. +9198…) on the Team page first")

    lead_phone = lead["phone"].replace(" ", "")
    activity_id = new_id()
    now = now_utc().isoformat()

    if not _twilio_client or not TWILIO_FROM or not BACKEND_PUBLIC_URL:
        await db.activities.insert_one({
            "id": activity_id,
            "lead_id": lead["id"],
            "actor_id": actor.get("id"),
            "actor_name": actor.get("name") or "system",
            "kind": "outgoing_call",
            "message": f"[MOCK] Call queued to {lead['name']}",
            "meta": {"direction": "outgoing", "status": "queued", "mock": True, "to": lead_phone, "from": exec_phone},
            "created_at": now,
        })
        return {"call_sid": None, "status": "mock", "mock": True, "activity_id": activity_id}

    twiml_url = f"{BACKEND_PUBLIC_URL}/api/twilio/twiml/{lead['id']}"
    status_cb = f"{BACKEND_PUBLIC_URL}/api/twilio/status-callback"
    recording_cb = f"{BACKEND_PUBLIC_URL}/api/twilio/recording-callback"

    try:
        call = _twilio_client.calls.create(
            to=exec_phone,
            from_=TWILIO_FROM,
            url=twiml_url,
            method="POST",
            status_callback=status_cb,
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            status_callback_method="POST",
            record=True,
            recording_status_callback=recording_cb,
            recording_status_callback_method="POST",
        )
    except Exception as e:
        # Surface a friendlier hint for the most common trial-account failure
        # so the user knows they need to verify the caller ID in Twilio.
        msg = str(e)
        code = getattr(e, "code", None) or getattr(e, "status", None)
        if "21219" in msg or "unverified" in msg.lower() or code == 21219:
            hint = (
                f"Twilio rejected the call: the number {exec_phone} is not "
                "a Verified Caller ID on this trial account. Add it at "
                "twilio.com/console/phone-numbers/verified, then retry. "
                "The lead's number must also be verified until you upgrade."
            )
            raise HTTPException(status_code=400, detail=hint)
        if "21211" in msg or "invalid" in msg.lower() and "phone" in msg.lower():
            raise HTTPException(status_code=400, detail=f"Twilio: invalid phone number ({exec_phone} or {lead_phone}). Ensure E.164 format like +9198…")
        # Return HTTP 400 (not 502) so the preview gateway does not rewrite the JSON body.
        raise HTTPException(status_code=400, detail=f"Twilio error: {e}")

    await db.activities.insert_one({
        "id": activity_id,
        "lead_id": lead["id"],
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name") or "system",
        "kind": "outgoing_call",
        "message": f"Call initiated to {lead['name']}",
        "meta": {
            "direction": "outgoing",
            "call_sid": call.sid,
            "status": call.status,
            "to_lead": lead_phone,
            "to_exec": exec_phone,
        },
        "created_at": now,
    })
    return {"call_sid": call.sid, "status": call.status, "mock": False, "activity_id": activity_id}


@router.post("/leads/{lead_id}/call")
async def initiate_call(lead_id: str, actor: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_access_lead(lead, actor):
        raise HTTPException(status_code=403, detail="You can only call your own leads")
    from routes.callerdesk import initiate_callerdesk_call
    return await initiate_callerdesk_call(lead, actor)


@router.api_route("/twilio/twiml/{lead_id}", methods=["GET", "POST"])
async def twilio_twiml(lead_id: str, request: Request):
    lead = await db.leads.find_one({"id": lead_id})
    resp = VoiceResponse()
    if not lead or not lead.get("phone"):
        resp.say("Sorry, this lead has no phone number on record. Goodbye.")
        return StarletteResponse(content=str(resp), media_type="application/xml")

    resp.say(f"Connecting you to {lead.get('name', 'the lead')}.", voice="Polly.Aditi", language="en-IN")
    recording_cb = f"{BACKEND_PUBLIC_URL}/api/twilio/recording-callback" if BACKEND_PUBLIC_URL else None
    dial_kwargs = {"record": "record-from-answer-dual", "caller_id": TWILIO_FROM, "timeout": 30}
    if recording_cb:
        dial_kwargs["recording_status_callback"] = recording_cb
        dial_kwargs["recording_status_callback_method"] = "POST"
    dial = resp.dial(**dial_kwargs)
    dial.number(lead["phone"].replace(" ", ""))
    return StarletteResponse(content=str(resp), media_type="application/xml")


def _twilio_verify(request: Request, form_dict: dict) -> bool:
    if not _twilio_validator:
        return True
    sig = request.headers.get("X-Twilio-Signature", "")
    # Rebuild URL against BACKEND_PUBLIC_URL so signature matches what Twilio signed,
    # regardless of ingress / proxy stripping the scheme/host.
    if BACKEND_PUBLIC_URL:
        url = BACKEND_PUBLIC_URL.rstrip("/") + request.url.path
        if request.url.query:
            url += "?" + request.url.query
    else:
        url = str(request.url)
    return _twilio_validator.validate(url, form_dict, sig)


@router.post("/twilio/status-callback")
async def twilio_status_callback(request: Request):
    form = dict(await request.form())
    if not _twilio_verify(request, form):
        log.warning("Twilio signature mismatch on status-callback")
        return StarletteResponse(status_code=403)

    call_sid = form.get("CallSid")
    parent_sid = form.get("ParentCallSid")
    key_sid = parent_sid or call_sid
    call_status = form.get("CallStatus") or ""
    duration = form.get("CallDuration")

    act = await db.activities.find_one({"meta.call_sid": key_sid})
    if act and act.get("organization_id"):
        org_ctx.set(act["organization_id"])
    if not act:
        return StarletteResponse(status_code=200)

    meta = act.get("meta") or {}
    meta["status"] = call_status
    try:
        if duration:
            meta["duration_sec"] = int(duration)
    except ValueError:
        pass

    unsuccessful = {"no-answer", "busy", "failed", "canceled"}
    dur_i = int(meta.get("duration_sec") or 0)
    is_missed = call_status in unsuccessful or (call_status == "completed" and dur_i == 0)
    disposition = call_status.replace("-", "_") if is_missed else "connected"
    meta["disposition"] = disposition
    kind = "missed_call" if is_missed else "outgoing_call"

    await db.activities.update_one(
        {"id": act["id"]},
        {"$set": {"meta": meta, "kind": kind, "message": f"Call {call_status} · {duration or 0}s"}},
    )

    if is_missed:
        settings = await db.settings.find_one({"id": "singleton"}) or {}
        # notify the executive/manager of missed call
        lead = await db.leads.find_one({"id": act["lead_id"]}, {"name": 1, "assigned_to": 1, "_id": 0})
        if lead and lead.get("assigned_to"):
            await create_notification(
                type="missed_call",
                title="Missed call",
                message=f"{lead.get('name', 'Lead')} did not connect ({call_status})",
                user_id=lead["assigned_to"],
                link=f"/leads/{act['lead_id']}",
                meta={"lead_id": act["lead_id"], "call_sid": key_sid},
            )
        if settings.get("missed_call_followup_enabled", True):
            hours = float(settings.get("missed_call_followup_hours", 24))
            due = now_utc() + timedelta(hours=hours)
            await db.follow_ups.insert_one({
                "id": new_id(),
                "lead_id": act["lead_id"],
                "due_at": due.isoformat(),
                "kind": "call",
                "notes": f"Auto-scheduled after {call_status} call",
                "assigned_to": act.get("actor_id") or (await db.leads.find_one({"id": act["lead_id"]}, {"assigned_to": 1}) or {}).get("assigned_to"),
                "status": "pending",
                "created_at": now_utc().isoformat(),
                "meta": {"auto": True, "source_call_sid": key_sid},
            })
    return StarletteResponse(status_code=200)


@router.post("/twilio/recording-callback")
async def twilio_recording_callback(request: Request):
    form = dict(await request.form())
    if not _twilio_verify(request, form):
        log.warning("Twilio signature mismatch on recording-callback")
        return StarletteResponse(status_code=403)

    call_sid = form.get("CallSid")
    parent_sid = form.get("ParentCallSid")
    key_sid = parent_sid or call_sid
    recording_url = form.get("RecordingUrl")
    recording_sid = form.get("RecordingSid")
    duration = form.get("RecordingDuration")
    if recording_url and not recording_url.lower().endswith((".mp3", ".wav")):
        recording_url = recording_url + ".mp3"

    act = await db.activities.find_one({"meta.call_sid": key_sid})
    if act and act.get("organization_id"):
        org_ctx.set(act["organization_id"])
    if act:
        meta = act.get("meta") or {}
        meta["recording_url"] = recording_url
        meta["recording_sid"] = recording_sid
        try:
            meta["recording_duration_sec"] = int(duration or 0)
        except ValueError:
            pass
        await db.activities.update_one({"id": act["id"]}, {"$set": {"meta": meta}})
    return StarletteResponse(status_code=200)


@router.get("/twilio/status")
async def twilio_status(user: dict = Depends(get_current_user)):
    return {
        "configured": bool(_twilio_client),
        "from_number": TWILIO_FROM if _twilio_client else None,
        "webhook_base": BACKEND_PUBLIC_URL,
    }
