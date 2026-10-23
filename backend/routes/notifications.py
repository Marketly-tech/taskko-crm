from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

def _notif_scope_filter(user: dict) -> dict:
    """Admin sees admin + manager notifs (and personal). Manager sees manager notifs (and personal). Executive only personal."""
    role = user.get("role")
    scopes = []
    if role in ("admin", "super_admin"):
        scopes = ["admin", "manager"]
    elif role == "manager":
        scopes = ["manager"]
    ors: list = [{"user_id": user["id"]}]
    if scopes:
        ors.append({"role_scope": {"$in": scopes}})
    return {"$or": ors}


@router.get("/notifications")
async def list_notifications(unread_only: bool = False, user: dict = Depends(get_current_user)):
    q = _notif_scope_filter(user)
    if unread_only:
        q = {**q, "read": False}
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({**q, "read": False})
    return {"items": docs, "unread": unread}


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    scope = _notif_scope_filter(user)
    await db.notifications.update_one({"id": nid, **scope}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    scope = _notif_scope_filter(user)
    r = await db.notifications.update_many({**scope, "read": False}, {"$set": {"read": True}})
    return {"ok": True, "updated": r.modified_count}


async def refresh_notifications() -> dict:
    """Compute time-sensitive notifications: due follow-ups, upcoming visits,
    stale leads, team overdue, negotiation pending, exec inactivity."""
    now = now_utc()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    stale_cutoff = (now - timedelta(days=3)).isoformat()

    created = 0

    # Agent-level: follow-ups due today / overdue
    fus = await db.follow_ups.find({
        "status": "pending",
        "due_at": {"$lt": today_end.isoformat()},
        "assigned_to": {"$ne": None},
    }, {"_id": 0}).to_list(500)
    for f in fus:
        due = f.get("due_at", "")
        overdue = due < now.isoformat()
        dedupe = f"fu:{f['id']}:{today_start.date().isoformat()}"
        lead = await db.leads.find_one({"id": f.get("lead_id")}, {"name": 1, "_id": 0})
        title = "Follow-up overdue" if overdue else "Follow-up due today"
        msg = f"{f.get('kind', 'call').title()} · {(lead or {}).get('name', 'Lead')}"
        await create_notification(
            type="followup_due",
            title=title,
            message=msg,
            user_id=f["assigned_to"],
            link=f"/leads/{f['lead_id']}",
            meta={"followup_id": f["id"], "overdue": overdue},
            dedupe_key=dedupe,
        )
        created += 1

    # Agent-level: site visits within next 24h
    visits = await db.site_visits.find({
        "status": "scheduled",
        "scheduled_at": {"$gte": now.isoformat(), "$lt": (now + timedelta(hours=24)).isoformat()},
        "assigned_to": {"$ne": None},
    }, {"_id": 0}).to_list(200)
    for v in visits:
        dedupe = f"sv:{v['id']}"
        lead = await db.leads.find_one({"id": v.get("lead_id")}, {"name": 1, "_id": 0})
        when = datetime.fromisoformat(v["scheduled_at"]).astimezone(timezone.utc)
        await create_notification(
            type="sitevisit_reminder",
            title="Site visit tomorrow",
            message=f"{(lead or {}).get('name', 'Lead')} · {when.strftime('%d %b, %H:%M UTC')}",
            user_id=v["assigned_to"],
            link=f"/leads/{v['lead_id']}",
            meta={"visit_id": v["id"]},
            dedupe_key=dedupe,
        )
        created += 1

    # Manager-level: team overdue follow-ups (aggregate)
    overdue_count = await db.follow_ups.count_documents({
        "status": "pending",
        "due_at": {"$lt": now.isoformat()},
    })
    if overdue_count > 0:
        await create_notification(
            type="team_overdue",
            title="Team follow-ups overdue",
            message=f"{overdue_count} follow-up{'s' if overdue_count != 1 else ''} past due across the team",
            role_scope="manager",
            link="/follow-ups",
            meta={"count": overdue_count},
            dedupe_key=f"team_overdue:{today_start.date().isoformat()}",
        )
        created += 1

    # Manager-level: stale leads (no update in 3+ days, not booked/lost)
    stale = await db.leads.count_documents({
        "stage": {"$nin": ["booked", "lost"]},
        "updated_at": {"$lt": stale_cutoff},
    })
    if stale > 0:
        await create_notification(
            type="stale_lead",
            title="Stale leads",
            message=f"{stale} lead{'s' if stale != 1 else ''} with no activity for 3+ days",
            role_scope="manager",
            link="/leads",
            meta={"count": stale},
            dedupe_key=f"stale_leads:{today_start.date().isoformat()}",
        )
        created += 1

    # Manager-level: negotiation stage leads pending
    negotiation = await db.leads.count_documents({"stage": "negotiation"})
    if negotiation > 0:
        await create_notification(
            type="negotiation_pending",
            title="Deals in negotiation",
            message=f"{negotiation} lead{'s' if negotiation != 1 else ''} awaiting decision",
            role_scope="manager",
            link="/leads?stage=negotiation",
            meta={"count": negotiation},
            dedupe_key=f"negotiation:{today_start.date().isoformat()}",
        )
        created += 1

    # Manager-level: executives with 0 activity today
    execs = await db.users.find({"role": "executive", "active": {"$ne": False}}, {"_id": 0}).to_list(50)
    idle = []
    for e in execs:
        cnt = await db.activities.count_documents({
            "actor_id": e["id"],
            "created_at": {"$gte": today_start.isoformat(), "$lt": today_end.isoformat()},
        })
        if cnt == 0:
            idle.append(e["name"])
    if idle:
        await create_notification(
            type="exec_no_activity",
            title="Executives with no activity today",
            message=", ".join(idle[:5]) + (f" +{len(idle) - 5} more" if len(idle) > 5 else ""),
            role_scope="manager",
            link="/team",
            meta={"names": idle},
            dedupe_key=f"exec_idle:{today_start.date().isoformat()}",
        )
        created += 1

    return {"created": created}


@router.post("/notifications/refresh")
async def notif_refresh_endpoint(user: dict = Depends(get_current_user)):
    return await refresh_notifications()
