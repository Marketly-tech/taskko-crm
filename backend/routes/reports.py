import asyncio

from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

CALL_KINDS = {"outgoing_call", "call", "missed_call"}
MISSED = {"missed", "no_answer", "busy", "failed", "not_answered"}


def _wide(user: dict) -> bool:
    return user["role"] in ("admin", "super_admin", "manager")


def _parse(value: Optional[str], fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}")


def _range(start: Optional[str], end: Optional[str]) -> tuple:
    end_dt = _parse(end, now_utc())
    if end and len(end) == 10:
        end_dt = end_dt + timedelta(days=1) - timedelta(microseconds=1)
    start_dt = _parse(start, end_dt - timedelta(days=30))
    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="Start date must be before end date")
    return start_dt, end_dt


def _lead_match(user, start_dt, end_dt, date_field="created", stage=None, source=None, assigned_to=None) -> dict:
    field = "updated_at" if date_field == "updated" else "created_at"
    m: dict = {field: {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}}
    if stage and stage != "all":
        m["stage"] = stage
    if source and source != "all":
        m["source"] = source
    if assigned_to and assigned_to != "all":
        m["assigned_to"] = assigned_to
    if not _wide(user):
        m["assigned_to"] = user["id"]
    return m


async def _activities(user, start_dt, end_dt, assigned_to=None) -> list:
    q: dict = {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}}
    if not _wide(user):
        q["actor_id"] = user["id"]
    elif assigned_to and assigned_to != "all":
        q["actor_id"] = assigned_to
    return await db.activities.find(q, {"_id": 0}).to_list(20000)


def _is_out(a: dict) -> bool:
    meta = a.get("meta") or {}
    return a.get("kind") in CALL_KINDS and meta.get("direction", "outgoing") == "outgoing" and meta.get("status") != "pending_credentials" and not meta.get("mock")


def _is_missed(a: dict) -> bool:
    return a.get("kind") == "missed_call" or (a.get("meta") or {}).get("disposition") in MISSED


def _is_answered(a: dict) -> bool:
    return (a.get("meta") or {}).get("disposition") in ("connected", "answered", "completed")


async def _user_names(user) -> dict:
    q = {} if _wide(user) else {"id": user["id"]}
    return {u["id"]: u.get("name", u["id"]) async for u in db.users.find(q, {"_id": 0, "id": 1, "name": 1})}


@router.get("/reports/summary")
async def report_summary(start: Optional[str] = None, end: Optional[str] = None, date_field: str = "created", stage: Optional[str] = None,
                         source: Optional[str] = None, assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    fu_q: dict = {"created_at": {"$gte": s.isoformat(), "$lte": e.isoformat()}}
    if not _wide(user):
        fu_q["assigned_to"] = user["id"]
    leads, acts, fus = await asyncio.gather(
        db.leads.find(_lead_match(user, s, e, date_field, stage, source, assigned_to), {"_id": 0, "stage": 1, "stars": 1}).to_list(20000),
        _activities(user, s, e, assigned_to),
        db.follow_ups.find(fu_q, {"_id": 0, "status": 1}).to_list(20000),
    )
    out = [a for a in acts if _is_out(a)]
    return {
        "period": {"start": s.isoformat(), "end": e.isoformat(), "date_field": date_field},
        "totals": {"leads": len(leads), "booked": sum(1 for x in leads if x.get("stage") == "booked"),
                   "lost": sum(1 for x in leads if x.get("stage") == "lost"), "stars": sum(1 for x in leads if (x.get("stars") or 0) > 0)},
        "activity": {
            "outgoing_calls": len(out), "outgoing_answered": sum(1 for a in out if _is_answered(a)),
            "outgoing_missed": sum(1 for a in out if _is_missed(a)),
            "sms_sent": sum(1 for a in acts if a.get("kind") in ("sms", "sms_sent")),
            "emails_sent": sum(1 for a in acts if a.get("kind") in ("email", "email_sent")),
            "whatsapp_sent": sum(1 for a in acts if a.get("kind") in ("whatsapp", "whatsapp_sent")),
            "followups": len(fus), "followups_done": sum(1 for f in fus if f.get("status") == "done"),
        },
        "by_stage": [{"stage": st, "count": sum(1 for x in leads if x.get("stage") == st)} for st in ALL_STAGES],
    }


@router.get("/reports/activity")
async def report_activity(start: Optional[str] = None, end: Optional[str] = None, assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    rows, names = await asyncio.gather(_activities(user, s, e, assigned_to), _user_names(user))
    grouped: dict = {}
    for r in rows:
        aid = r.get("actor_id")
        if not aid or aid not in names:
            continue
        it = grouped.setdefault(aid, {"user_id": aid, "user": names[aid], "outgoing_calls": 0, "answered": 0, "missed": 0,
                                      "unique_contacts": set(), "sms_sent": 0, "emails_sent": 0, "whatsapp_sent": 0, "followups": 0, "_dur": 0})
        meta = r.get("meta") or {}
        if _is_out(r):
            it["outgoing_calls"] += 1
            it["_dur"] += int(meta.get("duration_sec") or meta.get("duration") or 0)
            it["unique_contacts"].add(r.get("lead_id"))
            it["answered"] += _is_answered(r)
            it["missed"] += _is_missed(r)
        k = r.get("kind")
        it["sms_sent"] += k in ("sms", "sms_sent")
        it["emails_sent"] += k in ("email", "email_sent")
        it["whatsapp_sent"] += k in ("whatsapp", "whatsapp_sent")
        it["followups"] += k == "followup_scheduled"
    out = []
    for it in grouped.values():
        it["unique_contacts"] = len({x for x in it["unique_contacts"] if x})
        it["avg_duration_sec"] = round(it.pop("_dur") / it["outgoing_calls"], 1) if it["outgoing_calls"] else 0
        out.append(it)
    return sorted(out, key=lambda x: (-x["outgoing_calls"], x["user"]))


@router.get("/reports/calls")
async def report_calls(call_type: Literal["missed", "outgoing"] = "outgoing", start: Optional[str] = None, end: Optional[str] = None,
                       assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    rows = [r for r in await _activities(user, s, e, assigned_to) if _is_out(r) and (call_type == "outgoing" or _is_missed(r))]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    ids = list({r["lead_id"] for r in rows if r.get("lead_id")})
    leads = {x["id"]: mask_lead(x, user) for x in await db.leads.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(len(ids) or 1)}
    return [{
        "id": r.get("id"), "lead_id": r.get("lead_id"),
        "lead_name": (leads.get(r.get("lead_id")) or {}).get("name", "Unknown lead"),
        "phone": (leads.get(r.get("lead_id")) or {}).get("phone"),
        "user": r.get("actor_name"), "status": (r.get("meta") or {}).get("disposition") or (r.get("meta") or {}).get("status") or r.get("kind"),
        "duration_sec": int((r.get("meta") or {}).get("duration_sec") or 0), "created_at": r.get("created_at"),
    } for r in rows[:500]]


@router.get("/reports/daily")
async def report_daily(start: Optional[str] = None, end: Optional[str] = None, assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    if (e - s).days > 366:
        raise HTTPException(status_code=400, detail="Daily report supports up to 1 year")
    rows = await _activities(user, s, e, assigned_to)
    buckets: dict = {}
    d = s.date()
    while d <= e.date():
        buckets[d.isoformat()] = {"date": d.isoformat(), "outgoing_calls": 0, "answered": 0, "email_sent": 0, "sms_sent": 0, "whatsapp_sent": 0, "followups": 0, "site_visits": 0}
        d += timedelta(days=1)
    for r in rows:
        b = buckets.get(str(r.get("created_at", ""))[:10])
        if not b:
            continue
        k = r.get("kind", "")
        if _is_out(r):
            b["outgoing_calls"] += 1
            b["answered"] += _is_answered(r)
        b["email_sent"] += k in ("email", "email_sent")
        b["sms_sent"] += k in ("sms", "sms_sent")
        b["whatsapp_sent"] += k in ("whatsapp", "whatsapp_sent")
        b["followups"] += k == "followup_scheduled"
        b["site_visits"] += k == "site_visit_scheduled"
    return list(buckets.values())


@router.get("/reports/user-status")
async def report_user_status(start: Optional[str] = None, end: Optional[str] = None, date_field: str = "created", source: Optional[str] = None,
                             assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    leads, names = await asyncio.gather(
        db.leads.find(_lead_match(user, s, e, date_field, None, source, assigned_to), {"_id": 0, "assigned_to": 1, "stage": 1}).to_list(20000),
        _user_names(user),
    )
    grouped: dict = {}
    for x in leads:
        uid = x.get("assigned_to") or "unassigned"
        row = grouped.setdefault(uid, {"user_id": uid, "user": names.get(uid, "Unassigned"), "total": 0, **{st: 0 for st in ALL_STAGES}})
        row[x.get("stage") if x.get("stage") in ALL_STAGES else "new"] += 1
        row["total"] += 1
    return sorted(grouped.values(), key=lambda r: -r["total"])


@router.get("/reports/not-interested")
async def report_not_interested(start: Optional[str] = None, end: Optional[str] = None, date_field: str = "updated", source: Optional[str] = None,
                                assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end)
    m = _lead_match(user, s, e, date_field, None, source, assigned_to)
    m["$or"] = [{"stage": "lost"}, {"lost_reason": {"$nin": [None, ""]}}]
    rows, names = await asyncio.gather(db.leads.find(m, {"_id": 0}).sort("updated_at", -1).to_list(5000), _user_names(user))
    return [{
        "id": x["id"], "name": x.get("name"), "phone": mask_lead(x, user).get("phone"), "source": x.get("source"), "stage": x.get("stage"),
        "reason": x.get("lost_reason") or "Not specified", "owner": names.get(x.get("assigned_to"), "Unassigned"), "updated_at": x.get("updated_at"),
    } for x in rows]


@router.get("/reports/lost-reasons")
async def report_lost_reasons(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(get_current_user)):
    rows = await report_not_interested(start, end, "updated", None, None, user)
    counts: dict = {}
    for r in rows:
        counts[r["reason"]] = counts.get(r["reason"], 0) + 1
    return sorted([{"reason": k, "count": v} for k, v in counts.items()], key=lambda r: -r["count"])


@router.get("/reports/executives")
async def report_executives(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = _range(start, end) if (start or end) else (None, None)
    rng = {"$gte": s.isoformat(), "$lte": e.isoformat()} if s else None
    q = {"role": "executive"} if _wide(user) else {"id": user["id"]}
    execs = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(200)
    rows = []
    for x in execs:
        lq = {"assigned_to": x["id"], **({"created_at": rng} if rng else {})}
        total, booked, visits, pending = await asyncio.gather(
            db.leads.count_documents(lq), db.leads.count_documents({**lq, "stage": "booked"}),
            db.site_visits.count_documents({"assigned_to": x["id"], **({"scheduled_at": rng} if rng else {})}),
            db.follow_ups.count_documents({"assigned_to": x["id"], "status": "pending"}),
        )
        rows.append({"id": x["id"], "name": x["name"], "email": x["email"], "leads": total, "booked": booked, "site_visits": visits,
                     "pending_followups": pending, "conversion": round(booked / total * 100, 1) if total else 0})
    return sorted(rows, key=lambda r: -r["conversion"])


@router.get("/reports/sources")
async def report_sources(start: Optional[str] = None, end: Optional[str] = None, date_field: str = "created", stage: Optional[str] = None,
                         assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    if start or end:
        s, e = _range(start, end)
        m = _lead_match(user, s, e, date_field, stage, None, assigned_to)
    else:
        m = {} if _wide(user) else {"assigned_to": user["id"]}
    rows: dict = {}
    async for r in db.leads.aggregate([{"$match": m}, {"$group": {"_id": {"source": "$source", "stage": "$stage"}, "count": {"$sum": 1}}}]):
        src, stg = r["_id"].get("source") or "manual", r["_id"].get("stage")
        it = rows.setdefault(src, {"source": src, "total": 0, "booked": 0, "site_visit": 0, "lost": 0, "active": 0})
        it["total"] += r["count"]
        if stg in ("booked", "lost"):
            it[stg] += r["count"]
        else:
            it["active"] += r["count"]
        if stg and stg.startswith("site_visit"):
            it["site_visit"] += r["count"]
    out = list(rows.values())
    for o in out:
        o["conversion"] = round(o["booked"] / o["total"] * 100, 1) if o["total"] else 0
    return sorted(out, key=lambda r: -r["total"])
