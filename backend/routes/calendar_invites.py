import asyncio
import base64
import re

from core import *  # noqa: F401,F403
from routes.eod import resend, SENDER_EMAIL

router = APIRouter(prefix="/api")

REMINDERS = [("1d", timedelta(days=1), "tomorrow"), ("2h", timedelta(hours=2), "in 2 hours"), ("10m", timedelta(minutes=10), "in 10 minutes")]


class CalTestBody(BaseDoc):
    to: Optional[str] = None


def _esc(t: Optional[str]) -> str:
    return (t or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _dt(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


async def _sender() -> tuple:
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    email = (s.get("calendar_from_email") or s.get("resend_from_email") or SENDER_EMAIL).strip()
    name = (s.get("calendar_from_name") or "").strip()
    if not name:
        org = await raw_db.organizations.find_one({"id": org_ctx.get()}, {"_id": 0, "name": 1}) or {}
        name = org.get("name") or "Propzel"
    return email, name, int(s.get("visit_duration_min") or 60), bool(s.get("google_calendar_enabled"))


async def _context(v: dict) -> dict:
    lead = await db.leads.find_one({"id": v["lead_id"]}, {"_id": 0}) or {}
    project = await db.projects.find_one({"id": v.get("project_id")}, {"_id": 0}) or {}
    ids = [i for i in [v.get("assigned_to") or lead.get("assigned_to"), *(lead.get("co_assigned_to") or [])] if i]
    team = await db.users.find({"id": {"$in": ids}, "active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1}).to_list(10)
    return {"lead": lead, "project": project, "team": [u for u in team if u.get("email")]}


def build_ics(v: dict, ctx: dict, sender: tuple, method: str) -> str:
    email, org_name, duration, _ = sender
    start = datetime.fromisoformat(v["scheduled_at"])
    lead, project = ctx["lead"], ctx["project"]
    loc = ", ".join(x for x in [project.get("name"), project.get("location"), project.get("city")] if x)
    exec_line = ", ".join(f"{u['name']}{' (' + u['phone'] + ')' if u.get('phone') else ''}" for u in ctx["team"])
    desc = f"Site visit at {project.get('name', 'the project')} with {lead.get('name', 'customer')}.\nYour {org_name} contact: {exec_line or org_name}." + (f"\nNotes: {v['notes']}" if v.get("notes") else "")
    summary = f"Site visit · {project.get('name') or 'Project'} · {org_name}"
    attendees = [(u["name"], u["email"]) for u in ctx["team"]] + ([(lead.get("name") or "Customer", lead["email"])] if lead.get("email") else [])
    lines = ["BEGIN:VCALENDAR", "PRODID:-//Propzel//Site Visits//EN", "VERSION:2.0", "CALSCALE:GREGORIAN", f"METHOD:{method}", "BEGIN:VEVENT",
             f"UID:visit-{v['id']}@propzel.tech", f"SEQUENCE:{v.get('ics_sequence', 0)}", f"DTSTAMP:{_dt(now_utc())}",
             f"DTSTART:{_dt(start)}", f"DTEND:{_dt(start + timedelta(minutes=duration))}",
             f"SUMMARY:{_esc(summary)}",
             f"LOCATION:{_esc(loc)}", f"DESCRIPTION:{_esc(desc)}", f"ORGANIZER;CN={_esc(org_name)}:mailto:{email}",
             *[f"ATTENDEE;CN={_esc(n)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{e}" for n, e in attendees],
             f"STATUS:{'CANCELLED' if method == 'CANCEL' else 'CONFIRMED'}"]
    if method == "REQUEST":
        for key, delta, _ in REMINDERS:
            mins = int(delta.total_seconds() // 60)
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:Site visit {key} reminder", f"TRIGGER:-PT{mins}M", "END:VALARM"]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


def _html(title: str, v: dict, ctx: dict, sender: tuple, note: str) -> str:
    start = datetime.fromisoformat(v["scheduled_at"]).astimezone(IST)
    p = ctx["project"]
    rows = [("When", start.strftime("%a, %d %b %Y · %I:%M %p IST")), ("Project", p.get("name") or "—"),
            ("Location", ", ".join(x for x in [p.get("location"), p.get("city")] if x) or "—"),
            ("Your contact", ", ".join(f"{u['name']} {u.get('phone') or ''}".strip() for u in ctx["team"]) or sender[1])]
    body = "".join(f"<tr><td style='padding:4px 14px 4px 0;color:#5C6661'>{k}</td><td><b>{val}</b></td></tr>" for k, val in rows)
    return f"<div style='font-family:Arial;color:#1F3D2B'><h2>{title}</h2><p>{note}</p><table>{body}</table><p style='color:#5C6661;font-size:12px'>— {sender[1]}</p></div>"


async def _send(params: dict) -> Optional[str]:
    if not (resend and resend.api_key):
        log.info("[MOCK] calendar email to %s · %s", params["to"], params["subject"])
        return None
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return None
    except Exception as e:  # noqa: BLE001
        return str(e)[:300]


async def send_visit_invite(visit_id: str, method: str = "REQUEST") -> dict:
    """Email a calendar invite (.ics) for a site visit to the team and the customer."""
    sender = await _sender()
    v = await db.site_visits.find_one({"id": visit_id}, {"_id": 0})
    if not v or not sender[3]:
        return {"sent": False, "reason": "disabled" if v else "not found"}
    if method == "REQUEST" and datetime.fromisoformat(v["scheduled_at"]) < now_utc():
        return {"sent": False, "reason": "visit is in the past"}
    if method == "CANCEL" and not v.get("invite_sent_to"):
        return {"sent": False, "reason": "no invite was sent"}
    seq = int(v.get("ics_sequence", -1)) + 1
    v["ics_sequence"] = seq
    ctx = await _context(v)
    to = [u["email"] for u in ctx["team"]] + ([ctx["lead"]["email"]] if ctx["lead"].get("email") else [])
    if not to:
        return {"sent": False, "reason": "no recipient emails"}
    ics = build_ics(v, ctx, sender, method)
    what = {"REQUEST": "Site visit scheduled" if seq == 0 else "Site visit updated", "CANCEL": "Site visit cancelled"}[method]
    subject = f"{what} · {ctx['project'].get('name', 'Project')} · {datetime.fromisoformat(v['scheduled_at']).astimezone(IST).strftime('%d %b, %I:%M %p')}"
    params = {"from": f"{sender[1]} <{sender[0]}>", "to": to, "subject": subject,
              "html": _html(what, v, ctx, sender, "Tap <b>Yes</b> / <b>Add to calendar</b> on this invite to save it to Google Calendar." if method == "REQUEST" else "This visit has been cancelled and will be removed from your calendar."),
              "attachments": [{"filename": "invite.ics", "content": base64.b64encode(ics.encode()).decode(), "content_type": f'text/calendar; charset="UTF-8"; method={method}'}]}
    err = await _send(params)
    await db.site_visits.update_one({"id": visit_id}, {"$set": {"ics_sequence": seq, "invite_status": "failed" if err else ("cancelled" if method == "CANCEL" else "sent"),
                                                               "invite_error": err, "invite_sent_to": to, "invite_sent_at": now_utc().isoformat()}})
    await log_activity(v["lead_id"], None, "calendar_invite", f"Calendar {'cancellation' if method == 'CANCEL' else 'invite'} {'failed' if err else 'emailed'} to {', '.join(to)}", {"visit_id": visit_id, "error": err})
    return {"sent": not err, "to": to, "error": err}


def queue_invite(visit_id: str, method: str = "REQUEST") -> None:
    org = org_ctx.get()

    async def run():
        org_ctx.set(org)
        try:
            await send_visit_invite(visit_id, method)
        except Exception as e:  # noqa: BLE001
            log.warning("calendar invite failed for %s: %s", visit_id, e)
    asyncio.create_task(run())


async def visit_reminder_tick() -> int:
    """Scheduler job: email 1 day / 2 hours / 10 minutes reminders to the customer and team."""
    sender = await _sender()
    if not sender[3]:
        return 0
    now = now_utc()
    sent = 0
    visits = await db.site_visits.find({"status": "scheduled", "scheduled_at": {"$gt": now.isoformat(), "$lte": (now + timedelta(days=1)).isoformat()}}, {"_id": 0}).to_list(500)
    for v in visits:
        left = datetime.fromisoformat(v["scheduled_at"]) - now
        due = [(k, label) for k, delta, label in REMINDERS if left <= delta and k not in (v.get("reminders_sent") or [])]
        if not due:
            continue
        key, label = due[-1]
        claim = await db.site_visits.update_one({"id": v["id"], "reminders_sent": {"$ne": key}}, {"$addToSet": {"reminders_sent": {"$each": [k for k, _ in due]}}})
        if not claim.modified_count:
            continue
        ctx = await _context(v)
        to = [u["email"] for u in ctx["team"]] + ([ctx["lead"]["email"]] if ctx["lead"].get("email") else [])
        if not to:
            continue
        err = await _send({"from": f"{sender[1]} <{sender[0]}>", "to": to, "subject": f"Reminder: site visit {label} · {ctx['project'].get('name', 'Project')}",
                           "html": _html(f"Your site visit is {label}", v, ctx, sender, "A quick reminder about your upcoming site visit.")})
        await log_activity(v["lead_id"], None, "calendar_reminder", f"Visit reminder ({key}) {'failed' if err else 'emailed'} to {', '.join(to)}", {"visit_id": v["id"], "error": err})
        sent += 0 if err else 1
    return sent


@router.get("/calendar/status")
async def calendar_status(user: dict = Depends(require_roles("admin"))):
    email, name, duration, enabled = await _sender()
    domain = email.split("@")[-1].lower()
    status, verified = "unknown", False
    if resend and resend.api_key:
        try:
            doms = await asyncio.to_thread(resend.Domains.list)
            rows = doms.get("data", []) if isinstance(doms, dict) else []
            match = next((d for d in rows if d.get("name", "").lower() == domain), None)
            status = match.get("status") if match else "not_added"
            verified = status == "verified"
        except Exception as e:  # noqa: BLE001
            status = f"check failed: {str(e)[:120]}"
    else:
        status = "email_key_missing"
    return {"enabled": enabled, "from_email": email, "from_name": name, "domain": domain, "domain_status": status, "domain_verified": verified, "duration_min": duration}


@router.post("/calendar/test")
async def calendar_test(body: CalTestBody, user: dict = Depends(require_roles("admin"))):
    sender = await _sender()
    to = (body.to or user.get("email") or "").strip()
    if not re.match(r"[^@\s]+@[^@\s]+\.[^@\s]+$", to):
        raise HTTPException(status_code=400, detail="Enter a valid email")
    v = {"id": f"test-{new_id()}", "scheduled_at": (now_utc() + timedelta(days=1)).isoformat(), "ics_sequence": 0, "notes": "Test invite from Propzel"}
    ctx = {"lead": {"name": "Test Customer"}, "project": {"name": "Sample Project", "location": "Sample location"}, "team": [{"name": user.get("name", "You"), "email": to}]}
    ics = build_ics(v, ctx, sender, "REQUEST")
    err = await _send({"from": f"{sender[1]} <{sender[0]}>", "to": [to], "subject": f"Test site visit invite · {sender[1]}",
                       "html": _html("Test site visit invite", v, ctx, sender, "If you can add this to Google Calendar, invites are working."),
                       "attachments": [{"filename": "invite.ics", "content": base64.b64encode(ics.encode()).decode(), "content_type": 'text/calendar; charset="UTF-8"; method=REQUEST'}]})
    if err:
        raise HTTPException(status_code=400, detail=f"Email provider refused: {err}")
    return {"ok": True, "to": to, "mocked": not (resend and resend.api_key)}


@router.post("/site-visits/{visit_id}/resend-invite")
async def resend_invite(visit_id: str, user: dict = Depends(get_current_user)):
    v = await db.site_visits.find_one({"id": visit_id}, {"_id": 0, "status": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Site visit not found")
    if v.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Only scheduled visits can be re-sent")
    r = await send_visit_invite(visit_id, "REQUEST")
    if not r.get("sent"):
        raise HTTPException(status_code=400, detail=r.get("error") or f"Not sent: {r.get('reason')}")
    return r
