from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# DASHBOARD (Month's Updates + Action Items)
# ---------------------------------------------------------------------------
def _month_bounds(dt: datetime) -> tuple:
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    if dt.month == 12:
        end = datetime(dt.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(dt.year, dt.month + 1, 1, tzinfo=timezone.utc)
    return start, end


@router.get("/dashboard/monthly")
async def dashboard_monthly(user: dict = Depends(get_current_user)):
    """Month's Updates tab data."""
    scope: dict = {}
    if user["role"] == "executive":
        scope["assigned_to"] = user["id"]

    now = now_utc()
    cur_start, cur_end = _month_bounds(now)
    prev_dt = cur_start - timedelta(days=1)
    prev_start, prev_end = _month_bounds(prev_dt)

    def iso(d):
        return d.isoformat()

    # KPIs current month
    new_leads = await db.leads.count_documents({**scope, "created_at": {"$gte": iso(cur_start), "$lt": iso(cur_end)}})
    booked = await db.leads.count_documents({**scope, "stage": "booked", "updated_at": {"$gte": iso(cur_start), "$lt": iso(cur_end)}})
    # revenue = sum of accepted proposals in month
    cur_rev_pipe = [
        {"$match": {"status": "accepted", "created_at": {"$gte": iso(cur_start), "$lt": iso(cur_end)}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    cur_rev_docs = [r async for r in db.proposals.aggregate(cur_rev_pipe)]
    cur_revenue = cur_rev_docs[0]["total"] if cur_rev_docs else 0

    prev_rev_pipe = [
        {"$match": {"status": "accepted", "created_at": {"$gte": iso(prev_start), "$lt": iso(prev_end)}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    prev_rev_docs = [r async for r in db.proposals.aggregate(prev_rev_pipe)]
    prev_revenue = prev_rev_docs[0]["total"] if prev_rev_docs else 0

    total_leads_m = new_leads
    conversion = round((booked / total_leads_m) * 100, 2) if total_leads_m > 0 else 0.0

    revenue_pct = 0
    if prev_revenue > 0:
        revenue_pct = round(((cur_revenue - prev_revenue) / prev_revenue) * 100, 2)

    # Telemetry — last 4 months by activity kind
    telemetry = []
    for i in range(3, -1, -1):
        month_dt = (cur_start.replace(day=15) - timedelta(days=30 * i))
        ms, me = _month_bounds(month_dt)
        row = {"label": ms.strftime("%b-%y"), "month": ms.strftime("%Y-%m")}
        for kind_key, kinds in (
            ("outgoing_call", ["outgoing_call", "call"]),
            ("email_sent", ["email_sent", "email"]),
            ("sms_sent", ["sms_sent"]),
            ("followup_scheduled", ["followup_scheduled"]),
        ):
            row[kind_key] = await db.activities.count_documents({
                "kind": {"$in": kinds},
                "created_at": {"$gte": iso(ms), "$lt": iso(me)},
            })
        telemetry.append(row)

    # Total lead pipeline (bar) — counts by stage across all-time in scope
    stages = ALL_STAGES
    pipeline = []
    for s in stages:
        pipeline.append({"stage": s, "count": await db.leads.count_documents({**scope, "stage": s})})

    # Upcoming closures — proposals in draft/sent with validity ending soon OR leads in negotiation
    closures_raw = await db.leads.find({**scope, "stage": {"$in": ["negotiation", "site_visit"]}}, {"_id": 0}).sort("updated_at", -1).limit(8).to_list(8)

    # Top leads — sorted by stars desc then updated_at
    top = await db.leads.find({**scope, "stars": {"$gt": 0}}, {"_id": 0}).sort([("stars", -1), ("updated_at", -1)]).limit(6).to_list(6)
    if len(top) < 6:
        rest = await db.leads.find({**scope, "stage": {"$nin": ["lost", "booked"]}}, {"_id": 0}).sort("updated_at", -1).limit(6 - len(top)).to_list(6)
        top = top + [r for r in rest if r["id"] not in {t["id"] for t in top}]

    # Recent inquiries — latest 8 leads
    recent = await db.leads.find(scope, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)

    return {
        "period": {"start": iso(cur_start), "end": iso(cur_end)},
        "kpi": {"new_leads": new_leads, "revenue": cur_revenue, "booked": booked, "conversion": conversion},
        "revenue": {"current": cur_revenue, "previous": prev_revenue, "change_pct": revenue_pct},
        "telemetry": telemetry,
        "pipeline": pipeline,
        "top_leads": mask_leads(top, user),
        "recent_inquiries": mask_leads(recent, user),
        "upcoming_closures": mask_leads(closures_raw, user),
    }


@router.get("/dashboard/action-items")
async def dashboard_action_items(user: dict = Depends(get_current_user)):
    scope: dict = {}
    if user["role"] == "executive":
        scope["assigned_to"] = user["id"]

    now = now_utc()
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    def iso(d):
        return d.isoformat()

    # Missed calls today (activity kind = missed_call)
    missed = await db.activities.count_documents({
        "kind": "missed_call",
        "created_at": {"$gte": iso(day_start), "$lt": iso(day_end)},
    })

    todays_followups = await db.follow_ups.find({
        **scope,
        "status": "pending",
        "due_at": {"$gte": iso(day_start), "$lt": iso(day_end)},
    }, {"_id": 0}).sort("due_at", 1).to_list(100)

    scheduled_calls = await db.follow_ups.count_documents({**scope, "status": "pending", "kind": "call"})
    tasks = await db.follow_ups.count_documents({**scope, "status": "pending", "kind": {"$in": ["meeting", "email", "whatsapp"]}})

    planned_visits = await db.site_visits.find({
        **scope,
        "status": "scheduled",
        "scheduled_at": {"$gte": iso(day_start - timedelta(days=1)), "$lt": iso(day_start + timedelta(days=7))},
    }, {"_id": 0}).sort("scheduled_at", 1).to_list(100)

    # Leads with no calls done — leads with no activities of call kind
    lead_docs = await db.leads.find({**scope, "stage": {"$nin": ["booked", "lost"]}}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    lead_ids = [l["id"] for l in lead_docs]
    called_ids = set()
    if lead_ids:
        pipe = [
            {"$match": {"lead_id": {"$in": lead_ids}, "kind": {"$in": ["outgoing_call", "call", "incoming_call", "missed_call"]}}},
            {"$group": {"_id": "$lead_id"}},
        ]
        called_ids = {r["_id"] async for r in db.activities.aggregate(pipe)}
    no_call_leads = [l for l in lead_docs if l["id"] not in called_ids][:12]

    # No follow-up added leads
    followed_ids = set()
    if lead_ids:
        followed = await db.follow_ups.find({"lead_id": {"$in": lead_ids}}, {"lead_id": 1}).to_list(len(lead_ids))
        followed_ids = {f["lead_id"] for f in followed}
    no_followup_leads = [l for l in lead_docs if l["id"] not in followed_ids][:12]

    return {
        "period": {"start": iso(day_start), "end": iso(day_end)},
        "widgets": {
            "missed_calls": missed,
            "todays_followups": len(todays_followups),
            "scheduled_calls": scheduled_calls,
            "tasks": tasks,
        },
        "todays_followups": todays_followups,
        "planned_visits": planned_visits,
        "no_call_leads": mask_leads(no_call_leads, user),
        "no_followup_leads": mask_leads(no_followup_leads, user),
    }


# ---------------------------------------------------------------------------
# REPORTS (aggregations)
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# DASHBOARD DRILL-DOWNS
# ---------------------------------------------------------------------------
@router.get("/dashboard/revenue-breakdown")
async def dashboard_revenue_breakdown(user: dict = Depends(get_current_user)):
    """Agent-wise + project-wise revenue split (accepted proposals, current month).
    Executives see only their own attributions."""
    now = now_utc()
    cur_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        cur_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        cur_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    match: dict = {"status": "accepted", "created_at": {"$gte": cur_start.isoformat(), "$lt": cur_end.isoformat()}}
    if user["role"] == "executive":
        match["created_by"] = user["id"]

    # by agent
    by_agent_pipe = [
        {"$match": match},
        {"$group": {"_id": "$created_by", "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    by_agent = []
    async for r in db.proposals.aggregate(by_agent_pipe):
        u = await db.users.find_one({"id": r["_id"]}, {"name": 1, "_id": 0}) if r["_id"] else None
        by_agent.append({
            "id": r["_id"], "name": (u or {}).get("name") or "Unassigned",
            "amount": r["amount"], "count": r["count"],
        })
    by_agent.sort(key=lambda r: -r["amount"])

    # by project
    by_project_pipe = [
        {"$match": match},
        {"$group": {"_id": "$project_id", "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    by_project = []
    async for r in db.proposals.aggregate(by_project_pipe):
        p = await db.projects.find_one({"id": r["_id"]}, {"name": 1, "_id": 0}) if r["_id"] else None
        by_project.append({
            "id": r["_id"], "name": (p or {}).get("name") or "Unassigned",
            "amount": r["amount"], "count": r["count"],
        })
    by_project.sort(key=lambda r: -r["amount"])

    total = sum(a["amount"] for a in by_agent)
    return {"total": total, "by_agent": by_agent, "by_project": by_project, "period": {"start": cur_start.isoformat(), "end": cur_end.isoformat()}}
