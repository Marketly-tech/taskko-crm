import re

from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")
from core import _pick_auto_assignee
from routes.twilio_voice import _initiate_twilio_call

# ---------------------------------------------------------------------------
# LEADS
# ---------------------------------------------------------------------------



async def _require_lead(lead_id: str, user: dict) -> dict:
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_access_lead(lead, user):
        raise HTTPException(status_code=403, detail="Not your lead")
    return lead


async def _validate_members(ids: list) -> None:
    ids = [i for i in ids if i]
    if ids and await db.users.count_documents({"id": {"$in": ids}}) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Assignee is not a member of this organisation")


async def _notify_co_owners(lead: dict, user_ids: list) -> None:
    for uid in user_ids:
        await create_notification(
            type="lead_assigned",
            title="Added as co-owner",
            message=f"{lead.get('name', 'Lead')} · {lead.get('source', 'manual')}",
            user_id=uid,
            link=f"/leads/{lead['id']}",
            meta={"lead_id": lead["id"], "co_owner": True},
        )


async def _require_project(pid: Optional[str]) -> None:
    if not pid:
        raise HTTPException(status_code=400, detail="Project is required for every lead")
    if not await db.projects.find_one({"id": pid}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Selected project does not exist")


class AssignProjectBody(BaseDoc):
    project_id: str


@router.get("/leads/unassigned-project")
async def unassigned_project_count(user: dict = Depends(require_roles("admin", "manager"))):
    return {"count": await db.leads.count_documents({"project_id": {"$in": [None, ""]}})}


@router.post("/leads/unassigned-project/move")
async def move_unassigned(body: AssignProjectBody, user: dict = Depends(require_roles("admin", "manager"))):
    await _require_project(body.project_id)
    r = await db.leads.update_many({"project_id": {"$in": [None, ""]}}, {"$set": {"project_id": body.project_id, "updated_at": now_utc().isoformat()}})
    return {"moved": r.modified_count}


@router.get("/leads")
async def list_leads(
    project_id: Optional[str] = None,
    stage: Optional[str] = None,
    assigned_to: Optional[str] = None,
    owner_mode: Literal["any", "primary", "co_owner"] = "any",
    source: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    search = re.escape(search) if search else search
    q: dict = {}
    ands: list = []
    if project_id == "none":
        q["project_id"] = {"$in": [None, ""]}
    elif project_id:
        q["project_id"] = project_id
    if stage:
        q["stage"] = stage
    if assigned_to:
        if owner_mode == "primary":
            q["assigned_to"] = assigned_to
        elif owner_mode == "co_owner":
            q["co_assigned_to"] = assigned_to
        else:
            ands.append({"$or": [{"assigned_to": assigned_to}, {"co_assigned_to": assigned_to}]})
    if source:
        q["source"] = source
    if search:
        ands.append({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]})
    if user["role"] == "executive":
        ands.append(exec_lead_scope(user))
    if ands:
        q["$and"] = ands
    docs = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return mask_leads(docs, user)


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_access_lead(doc, user):
        raise HTTPException(status_code=403, detail="Not your lead")
    return mask_lead(doc, user)


@router.post("/leads")
async def create_lead(body: LeadBody, actor: dict = Depends(get_current_user)):
    doc = body.model_dump()
    await _validate_members([doc.get("assigned_to"), *(doc.get("co_assigned_to") or [])])
    await _require_project(doc.get("project_id"))
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    doc["updated_at"] = doc["created_at"]
    doc.setdefault("priority", "warm")
    if not doc.get("assigned_to"):
        settings = await db.settings.find_one({"id": "singleton"}) or {}
        if settings.get("auto_assign_enabled", True):
            doc["assigned_to"] = await _pick_auto_assignee()
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(doc["id"], actor, "lead_created", f"Lead created from {doc['source']}")
    # Notify the assigned executive
    if doc.get("assigned_to"):
        await create_notification(
            type="lead_assigned",
            title="New lead assigned",
            message=f"{doc['name']} · {doc.get('source', 'manual')}",
            user_id=doc["assigned_to"],
            link=f"/leads/{doc['id']}",
            meta={"lead_id": doc["id"]},
        )
    # Auto-call on new lead assignment (Twilio)
    settings = await db.settings.find_one({"id": "singleton"}) or {}
    if settings.get("auto_call_on_new_lead") and doc.get("assigned_to") and doc.get("phone"):
        assignee = await db.users.find_one({"id": doc["assigned_to"]})
        if assignee and assignee.get("phone"):
            try:
                await _initiate_twilio_call(doc, assignee)
            except HTTPException as e:
                log.warning("auto-call skipped: %s", e.detail)
            except Exception as e:
                log.warning("auto-call error: %s", e)
    await _notify_co_owners(doc, doc.get("co_assigned_to") or [])
    return mask_lead(doc, actor)


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: UpdateLeadBody, actor: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Executives can only edit their own leads. Admin/manager can edit any.
    if not can_access_lead(lead, actor):
        raise HTTPException(status_code=403, detail="You can only edit your own leads")
    update = body.model_dump(exclude_none=True)
    for f in ("phone",):
        if is_masked_value(update.get(f)):
            update.pop(f)
    if actor["role"] == "executive":
        update.pop("co_assigned_to", None)
    await _validate_members([update.get("assigned_to"), *(update.get("co_assigned_to") or [])])
    if "project_id" in update:
        await _require_project(update["project_id"])
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = now_utc().isoformat()
    r = await db.leads.update_one({"id": lead_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    if "stage" in update:
        await log_activity(lead_id, actor, "stage_change", f"Stage moved to {update['stage']}")
    if "assigned_to" in update:
        await log_activity(lead_id, actor, "assignment", f"Assigned to user {update['assigned_to']}")
    if "co_assigned_to" in update:
        added = [u for u in update["co_assigned_to"] if u not in (lead.get("co_assigned_to") or [])]
        await log_activity(lead_id, actor, "co_owner_change", f"Co-owners updated ({len(update['co_assigned_to'])})")
        await _notify_co_owners({**lead, **update}, added)
    return mask_lead(await db.leads.find_one({"id": lead_id}, {"_id": 0}), actor)


@router.post("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, body: AssignBody, actor: dict = Depends(require_roles("admin", "manager"))):
    await _validate_members([body.user_id])
    r = await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"assigned_to": body.user_id, "updated_at": now_utc().isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    assignee = await db.users.find_one({"id": body.user_id}, {"name": 1, "_id": 0})
    await log_activity(lead_id, actor, "assignment", f"Assigned to {assignee.get('name', body.user_id) if assignee else body.user_id}")
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if lead:
        await create_notification(
            type="lead_assigned",
            title="New lead assigned",
            message=f"{lead.get('name', 'Lead')} · {lead.get('source', 'manual')}",
            user_id=body.user_id,
            link=f"/leads/{lead_id}",
            meta={"lead_id": lead_id},
        )
    return mask_lead(lead, actor)


@router.post("/leads/{lead_id}/stage")
async def move_stage(lead_id: str, body: StageBody, actor: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not can_access_lead(lead, actor):
        raise HTTPException(status_code=403, detail="Not your lead")
    update = {"stage": body.stage, "updated_at": now_utc().isoformat()}
    r = await db.leads.update_one({"id": lead_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    await log_activity(lead_id, actor, "stage_change", f"Stage → {body.stage}" + (f": {body.note}" if body.note else ""))
    return mask_lead(await db.leads.find_one({"id": lead_id}, {"_id": 0}), actor)


@router.post("/leads/{lead_id}/notes")
async def add_note(lead_id: str, body: NoteBody, actor: dict = Depends(get_current_user)):
    await _require_lead(lead_id, actor)
    await log_activity(lead_id, actor, body.kind, body.text)
    return {"ok": True}


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, actor: dict = Depends(require_roles("admin"))):
    r = await db.leads.delete_one({"id": lead_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.activities.delete_many({"lead_id": lead_id})
    await db.wa_chats.update_many({"lead_id": lead_id}, {"$set": {"lead_id": None}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# CALL / SMS / EMAIL LOGGING (with recording URL for calls)
# ---------------------------------------------------------------------------
class CallLogBody(BaseDoc):
    direction: Literal["outgoing", "incoming"] = "outgoing"
    duration_sec: int = 0
    disposition: Literal["connected", "missed", "busy", "no_answer", "voicemail"] = "connected"
    recording_url: Optional[str] = None
    notes: Optional[str] = None


class SmsLogBody(BaseDoc):
    text: str
    template_id: Optional[str] = None


class EmailLogBody(BaseDoc):
    subject: str
    body: str
    template_id: Optional[str] = None


@router.post("/leads/{lead_id}/log-call")
async def log_call(lead_id: str, body: CallLogBody, actor: dict = Depends(get_current_user)):
    await _require_lead(lead_id, actor)
    meta = body.model_dump()
    kind = "outgoing_call" if body.direction == "outgoing" else "incoming_call"
    if body.disposition in ("missed", "busy", "no_answer"):
        kind = "missed_call"
    msg = f"{body.direction.capitalize()} call · {body.disposition} · {body.duration_sec}s"
    await log_activity(lead_id, actor, kind, msg, meta)
    return {"ok": True}


@router.post("/leads/{lead_id}/log-sms")
async def log_sms(lead_id: str, body: SmsLogBody, actor: dict = Depends(get_current_user)):
    await _require_lead(lead_id, actor)
    await log_activity(lead_id, actor, "sms_sent", body.text[:200], body.model_dump())
    return {"ok": True}


@router.post("/leads/{lead_id}/log-email")
async def log_email(lead_id: str, body: EmailLogBody, actor: dict = Depends(get_current_user)):
    await _require_lead(lead_id, actor)
    await log_activity(lead_id, actor, "email_sent", body.subject, body.model_dump())
    return {"ok": True}


# ---------------------------------------------------------------------------
# BULK LEAD ALLOCATION
# ---------------------------------------------------------------------------
class BulkAssignBody(BaseDoc):
    lead_ids: List[str]
    user_id: str


@router.post("/leads/bulk-assign")
async def bulk_assign(body: BulkAssignBody, actor: dict = Depends(require_roles("admin", "manager"))):
    if not body.lead_ids:
        raise HTTPException(status_code=400, detail="No leads provided")
    user = await db.users.find_one({"id": body.user_id}, {"name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Assignee not found")
    result = await db.leads.update_many(
        {"id": {"$in": body.lead_ids}},
        {"$set": {"assigned_to": body.user_id, "updated_at": now_utc().isoformat()}},
    )
    for lid in body.lead_ids:
        await log_activity(lid, actor, "assignment", f"Bulk-assigned to {user.get('name')}")
    return {"ok": True, "matched": result.matched_count, "modified": result.modified_count}


# ---------------------------------------------------------------------------
# CSV IMPORT
# ---------------------------------------------------------------------------
class ImportRow(BaseDoc):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = "manual"
    project_name: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    configuration: Optional[str] = None
    location_pref: Optional[str] = None
    notes: Optional[str] = None


class ImportBody(BaseDoc):
    rows: List[ImportRow]
    auto_assign: bool = True


@router.post("/leads/import")
async def import_leads(body: ImportBody, actor: dict = Depends(require_roles("admin", "manager"))):
    projects = {p["name"].lower(): p["id"] async for p in db.projects.find({}, {"id": 1, "name": 1})}
    created, failed = 0, 0
    for row in body.rows:
        try:
            pid = projects.get((row.project_name or "").lower())
            doc = {
                "id": new_id(),
                "name": row.name,
                "phone": row.phone,
                "email": row.email,
                "source": row.source if row.source in ("magicbricks", "99acres", "commonfloor", "housing", "website", "google_ads", "facebook", "instagram", "referral", "walk_in", "manual") else "manual",
                "project_id": pid,
                "budget_min": row.budget_min,
                "budget_max": row.budget_max,
                "configuration": row.configuration,
                "location_pref": row.location_pref,
                "notes": row.notes,
                "stage": "new",
                "priority": "warm",
                "stars": 0,
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            }
            if body.auto_assign:
                doc["assigned_to"] = await _pick_auto_assignee()
            await db.leads.insert_one(doc)
            await log_activity(doc["id"], actor, "lead_created", "Imported via CSV")
            created += 1
        except Exception:
            failed += 1
    return {"created": created, "failed": failed}
