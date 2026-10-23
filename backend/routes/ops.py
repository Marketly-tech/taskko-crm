from core import *  # noqa: F401,F403
from routes.calendar_invites import queue_invite

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# SITE VISITS
# ---------------------------------------------------------------------------
@router.get("/site-visits")
async def list_visits(project_id: Optional[str] = None, lead_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if project_id:
        q["project_id"] = project_id
    if lead_id:
        q["lead_id"] = lead_id
    if user["role"] == "executive":
        q["assigned_to"] = user["id"]
    docs = await db.site_visits.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(2000)
    return docs


@router.post("/site-visits")
async def create_visit(body: SiteVisitBody, actor: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["status"] = "scheduled"
    doc["scheduled_at"] = doc["scheduled_at"].astimezone(timezone.utc).isoformat()
    doc["created_at"] = now_utc().isoformat()
    if not doc.get("assigned_to"):
        lead = await db.leads.find_one({"id": doc["lead_id"]}, {"assigned_to": 1})
        doc["assigned_to"] = (lead or {}).get("assigned_to")
    await db.site_visits.insert_one(doc)
    doc.pop("_id", None)
    # advance lead to site_visit stage
    await db.leads.update_one({"id": doc["lead_id"]}, {"$set": {"stage": "site_visit", "updated_at": now_utc().isoformat()}})
    await log_activity(doc["lead_id"], actor, "site_visit_scheduled", f"Site visit scheduled at {doc['scheduled_at']}")
    if doc.get("assigned_to"):
        lead = await db.leads.find_one({"id": doc["lead_id"]}, {"name": 1, "_id": 0})
        await create_notification(
            type="sitevisit_reminder",
            title="Site visit scheduled",
            message=f"{(lead or {}).get('name', 'Lead')} · {doc['scheduled_at'][:16].replace('T', ' ')}",
            user_id=doc["assigned_to"],
            link=f"/leads/{doc['lead_id']}",
            meta={"visit_id": doc["id"]},
        )
    queue_invite(doc["id"], "REQUEST")
    return doc


@router.patch("/site-visits/{visit_id}")
async def update_visit(visit_id: str, body: UpdateSiteVisitBody, actor: dict = Depends(get_current_user)):
    update = body.model_dump(exclude_none=True)
    if "scheduled_at" in update and isinstance(update["scheduled_at"], datetime):
        update["scheduled_at"] = update["scheduled_at"].astimezone(timezone.utc).isoformat()
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    prev = await db.site_visits.find_one({"id": visit_id}, {"_id": 0})
    if not prev:
        raise HTTPException(status_code=404, detail="Site visit not found")
    await db.site_visits.update_one({"id": visit_id}, {"$set": update})
    v = await db.site_visits.find_one({"id": visit_id}, {"_id": 0})
    if update.get("status") == "cancelled" and prev.get("status") != "cancelled":
        queue_invite(visit_id, "CANCEL")
    elif "scheduled_at" in update and update["scheduled_at"] != prev.get("scheduled_at") and v.get("status") == "scheduled":
        await db.site_visits.update_one({"id": visit_id}, {"$set": {"reminders_sent": []}})
        queue_invite(visit_id, "REQUEST")
    if "status" in update:
        await log_activity(v["lead_id"], actor, "site_visit_" + update["status"], f"Site visit {update['status']}")
    return v


@router.delete("/site-visits/{visit_id}")
async def delete_visit(visit_id: str, actor: dict = Depends(require_roles("admin", "manager"))):
    v = await db.site_visits.find_one({"id": visit_id}, {"_id": 0, "status": 1})
    if v and v.get("status") == "scheduled":
        from routes.calendar_invites import send_visit_invite
        await send_visit_invite(visit_id, "CANCEL")
    await db.site_visits.delete_one({"id": visit_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# FOLLOW-UPS
# ---------------------------------------------------------------------------
@router.get("/follow-ups")
async def list_followups(lead_id: Optional[str] = None, status_q: Optional[str] = Query(None, alias="status"), user: dict = Depends(get_current_user)):
    q: dict = {}
    if lead_id:
        q["lead_id"] = lead_id
    if status_q:
        q["status"] = status_q
    if user["role"] == "executive":
        q["assigned_to"] = user["id"]
    docs = await db.follow_ups.find(q, {"_id": 0}).sort("due_at", 1).to_list(2000)
    return docs


@router.post("/follow-ups")
async def create_followup(body: FollowUpBody, actor: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["status"] = "pending"
    doc["due_at"] = doc["due_at"].astimezone(timezone.utc).isoformat()
    doc["created_at"] = now_utc().isoformat()
    if not doc.get("assigned_to"):
        lead = await db.leads.find_one({"id": doc["lead_id"]}, {"assigned_to": 1})
        doc["assigned_to"] = (lead or {}).get("assigned_to")
    await db.follow_ups.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(doc["lead_id"], actor, "followup_scheduled", f"Follow-up scheduled at {doc['due_at']}")
    if doc.get("assigned_to"):
        lead = await db.leads.find_one({"id": doc["lead_id"]}, {"name": 1, "_id": 0})
        await create_notification(
            type="followup_due",
            title="Follow-up scheduled",
            message=f"{doc.get('kind', 'call').title()} · {(lead or {}).get('name', 'Lead')} · {doc['due_at'][:16].replace('T', ' ')}",
            user_id=doc["assigned_to"],
            link=f"/leads/{doc['lead_id']}",
            meta={"followup_id": doc["id"]},
        )
    return doc


@router.patch("/follow-ups/{fu_id}")
async def update_followup(fu_id: str, body: UpdateFollowUpBody, actor: dict = Depends(get_current_user)):
    update = body.model_dump(exclude_none=True)
    if "due_at" in update and isinstance(update["due_at"], datetime):
        update["due_at"] = update["due_at"].astimezone(timezone.utc).isoformat()
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    r = await db.follow_ups.update_one({"id": fu_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return await db.follow_ups.find_one({"id": fu_id}, {"_id": 0})


@router.delete("/follow-ups/{fu_id}")
async def delete_followup(fu_id: str, actor: dict = Depends(get_current_user)):
    await db.follow_ups.delete_one({"id": fu_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# ACTIVITIES / TIMELINE
# ---------------------------------------------------------------------------
@router.get("/activities")
async def list_activities(lead_id: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    q = {"lead_id": lead_id} if lead_id else {}
    docs = await db.activities.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return mask_activities(docs, user)


# ---------------------------------------------------------------------------
# ANALYTICS
# ---------------------------------------------------------------------------
@router.get("/analytics/summary")
async def analytics_summary(project_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    match: dict = {}
    if project_id:
        match["project_id"] = project_id
    if user["role"] == "executive":
        match["assigned_to"] = user["id"]

    total_leads = await db.leads.count_documents(match)

    # stage funnel
    stages = ALL_STAGES
    funnel = {}
    for s in stages:
        funnel[s] = await db.leads.count_documents({**match, "stage": s})

    # source breakdown
    pipeline = [{"$match": match}, {"$group": {"_id": "$source", "count": {"$sum": 1}}}]
    sources = [{"source": r["_id"], "count": r["count"]} async for r in db.leads.aggregate(pipeline)]

    # visits & follow-ups today
    today_start = datetime.combine(now_utc().date(), datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(now_utc().date(), datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    visits_today = await db.site_visits.count_documents({"scheduled_at": {"$gte": today_start, "$lte": today_end}})
    followups_pending = await db.follow_ups.count_documents({"status": "pending"})

    # last 7d trend
    trend = []
    for i in range(6, -1, -1):
        d = (now_utc() - timedelta(days=i)).date()
        start = datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
        end = datetime.combine(d, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
        cnt = await db.leads.count_documents({**match, "created_at": {"$gte": start, "$lte": end}})
        trend.append({"date": d.isoformat(), "leads": cnt})

    # conversion
    booked = funnel.get("booked", 0)
    conversion = round((booked / total_leads * 100), 1) if total_leads else 0.0

    return {
        "total_leads": total_leads,
        "conversion_rate": conversion,
        "visits_today": visits_today,
        "followups_pending": followups_pending,
        "funnel": funnel,
        "sources": sources,
        "trend": trend,
    }


# ---------------------------------------------------------------------------
# SETTINGS (integration toggles)
# ---------------------------------------------------------------------------
@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    if not s:
        s = {
            "id": "singleton",
            "whatsapp_enabled": False,
            "email_enabled": False,
            "google_calendar_enabled": False,
            "whatsapp_number": "",
            "resend_from_email": "",
            "auto_assign_enabled": True,
            "auto_followup_enabled": True,
            "auto_call_on_new_lead": False,
            "missed_call_followup_enabled": True,
            "missed_call_followup_hours": 24,
        }
        await db.settings.insert_one(s.copy())
    s.pop("_id", None)
    return s


@router.patch("/settings")
async def update_settings(body: SettingsBody, actor: dict = Depends(require_roles("admin"))):
    update = body.model_dump(exclude_none=True)
    await db.settings.update_one({"id": "singleton"}, {"$set": update}, upsert=True)
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    return s
