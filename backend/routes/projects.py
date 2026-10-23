from core import *  # noqa: F401,F403

from fastapi.responses import Response as StarletteResponse

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# PROJECTS
# ---------------------------------------------------------------------------
@router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    docs = await db.projects.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # attach counts
    for d in docs:
        d["units_total"] = await db.units.count_documents({"project_id": d["id"]})
        d["units_available"] = await db.units.count_documents({"project_id": d["id"], "status": "available"})
        d["leads_count"] = await db.leads.count_documents({"project_id": d["id"]})
    return docs


@router.post("/projects")
async def create_project(body: ProjectBody, actor: dict = Depends(require_roles("admin", "manager"))):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectBody, actor: dict = Depends(require_roles("admin", "manager"))):
    update = body.model_dump(exclude_none=True)
    r = await db.projects.update_one({"id": project_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, actor: dict = Depends(require_roles("admin"))):
    await db.projects.delete_one({"id": project_id})
    await db.units.delete_many({"project_id": project_id})
    moved = await db.leads.update_many({"project_id": project_id}, {"$set": {"project_id": None, "updated_at": now_utc().isoformat()}})
    return {"ok": True, "leads_unassigned": moved.modified_count}


# ---------------------------------------------------------------------------
# INVENTORY / UNITS
# ---------------------------------------------------------------------------
@router.get("/units")
async def list_units(project_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if project_id:
        q["project_id"] = project_id
    docs = await db.units.find(q, {"_id": 0}).sort([("tower", 1), ("floor", 1), ("unit_no", 1)]).to_list(2000)
    return docs


@router.post("/units")
async def create_unit(body: UnitBody, actor: dict = Depends(require_roles("admin", "manager"))):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_utc().isoformat()
    await db.units.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/units/{unit_id}")
async def update_unit(unit_id: str, body: dict, actor: dict = Depends(require_roles("admin", "manager"))):
    allowed = {"status", "price", "carpet_area", "facing", "config", "tower", "floor", "unit_no"}
    update = {k: v for k, v in body.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    r = await db.units.update_one({"id": unit_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Unit not found")
    return await db.units.find_one({"id": unit_id}, {"_id": 0})


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, actor: dict = Depends(require_roles("admin", "manager"))):
    await db.units.delete_one({"id": unit_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# INVENTORY IMPORT / EXPORT
# ---------------------------------------------------------------------------
@router.get("/units/export")
async def export_units(project_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if project_id:
        q["project_id"] = project_id
    units = await db.units.find(q, {"_id": 0}).sort([("tower", 1), ("floor", 1), ("unit_no", 1)]).to_list(5000)
    header = "tower,floor,unit_no,config,carpet_area,price,facing,status\n"
    lines = [header]
    for u in units:
        line = ",".join([
            str(u.get("tower", "")),
            str(u.get("floor", "")),
            str(u.get("unit_no", "")),
            str(u.get("config", "")),
            str(u.get("carpet_area", "")),
            str(int(u.get("price") or 0)),
            str(u.get("facing", "")),
            str(u.get("status", "")),
        ])
        lines.append(line + "\n")
    body = "".join(lines)
    fname = f"tasko-units-{project_id or 'all'}.csv"
    return StarletteResponse(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


class UnitImportRow(BaseDoc):
    tower: str
    floor: int
    unit_no: str
    config: str
    carpet_area: Optional[float] = None
    price: Optional[float] = None
    facing: Optional[str] = None
    status: Optional[UnitStatus] = "available"


class UnitImportBody(BaseDoc):
    project_id: str
    rows: List[UnitImportRow]
    replace_existing: bool = False


@router.post("/units/import")
async def import_units(body: UnitImportBody, actor: dict = Depends(require_roles("admin", "manager"))):
    project = await db.projects.find_one({"id": body.project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.replace_existing:
        await db.units.delete_many({"project_id": body.project_id})
    created, failed = 0, 0
    for r in body.rows:
        try:
            doc = r.model_dump()
            doc["id"] = new_id()
            doc["project_id"] = body.project_id
            doc["created_at"] = now_utc().isoformat()
            await db.units.insert_one(doc)
            created += 1
        except Exception:
            failed += 1
    return {"created": created, "failed": failed, "replaced": body.replace_existing}
