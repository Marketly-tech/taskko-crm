from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# WHATSAPP TEMPLATES
# ---------------------------------------------------------------------------
class WATemplateBody(BaseDoc):
    name: str
    category: Optional[str] = "general"
    body: str
    variables: Optional[List[str]] = None
    approved: Optional[bool] = False


@router.get("/whatsapp-templates")
async def list_wa_templates(user: dict = Depends(get_current_user)):
    docs = await db.whatsapp_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.post("/whatsapp-templates")
async def create_wa_template(body: WATemplateBody, actor: dict = Depends(require_roles("admin", "manager"))):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    await db.whatsapp_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/whatsapp-templates/{tid}")
async def update_wa_template(tid: str, body: WATemplateBody, actor: dict = Depends(require_roles("admin", "manager"))):
    r = await db.whatsapp_templates.update_one({"id": tid}, {"$set": body.model_dump(exclude_none=True)})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return await db.whatsapp_templates.find_one({"id": tid}, {"_id": 0})


@router.delete("/whatsapp-templates/{tid}")
async def delete_wa_template(tid: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.whatsapp_templates.delete_one({"id": tid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# CHANNEL PARTNERS
# ---------------------------------------------------------------------------
class ChannelPartnerBody(BaseDoc):
    name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: Optional[str] = None
    rera: Optional[str] = None
    commission_pct: Optional[float] = None
    active: Optional[bool] = True
    notes: Optional[str] = None


@router.get("/channel-partners")
async def list_partners(user: dict = Depends(get_current_user)):
    docs = await db.channel_partners.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["leads_count"] = await db.leads.count_documents({"channel_partner_id": d["id"]})
    return docs


@router.post("/channel-partners")
async def create_partner(body: ChannelPartnerBody, actor: dict = Depends(require_roles("admin", "manager"))):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    await db.channel_partners.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/channel-partners/{pid}")
async def update_partner(pid: str, body: ChannelPartnerBody, actor: dict = Depends(require_roles("admin", "manager"))):
    r = await db.channel_partners.update_one({"id": pid}, {"$set": body.model_dump(exclude_none=True)})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Partner not found")
    return await db.channel_partners.find_one({"id": pid}, {"_id": 0})


@router.delete("/channel-partners/{pid}")
async def delete_partner(pid: str, actor: dict = Depends(require_roles("admin"))):
    await db.channel_partners.delete_one({"id": pid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# PROPOSALS
# ---------------------------------------------------------------------------
class ProposalBody(BaseDoc):
    lead_id: str
    project_id: Optional[str] = None
    unit_id: Optional[str] = None
    amount: float
    validity_days: Optional[int] = 15
    status: Optional[Literal["draft", "sent", "accepted", "declined", "expired"]] = "draft"
    terms: Optional[str] = None


class UpdateProposalBody(BaseDoc):
    amount: Optional[float] = None
    validity_days: Optional[int] = None
    status: Optional[Literal["draft", "sent", "accepted", "declined", "expired"]] = None
    terms: Optional[str] = None


@router.get("/proposals")
async def list_proposals(lead_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if lead_id:
        q["lead_id"] = lead_id
    docs = await db.proposals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.post("/proposals")
async def create_proposal(body: ProposalBody, actor: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    doc["created_by"] = actor["id"]
    await db.proposals.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(body.lead_id, actor, "proposal_created", f"Proposal for ₹{int(body.amount)} created")
    return doc


@router.patch("/proposals/{prop_id}")
async def update_proposal(prop_id: str, body: UpdateProposalBody, actor: dict = Depends(get_current_user)):
    update = body.model_dump(exclude_none=True)
    r = await db.proposals.update_one({"id": prop_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Proposal not found")
    prop = await db.proposals.find_one({"id": prop_id}, {"_id": 0})
    if "status" in update:
        await log_activity(prop["lead_id"], actor, "proposal_" + update["status"], f"Proposal marked {update['status']}")
    return prop


@router.delete("/proposals/{prop_id}")
async def delete_proposal(prop_id: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.proposals.delete_one({"id": prop_id})
    return {"ok": True}
