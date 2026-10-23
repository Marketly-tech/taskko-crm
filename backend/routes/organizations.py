import asyncio
import re

from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

SLUG_RE = re.compile(r"^[a-z0-9-]+$")


class OrganizationBody(BaseDoc):
    name: str
    slug: str
    admin_name: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_password: Optional[str] = None


class OrganizationPatchBody(BaseDoc):
    name: Optional[str] = None
    slug: Optional[str] = None
    active: Optional[bool] = None


async def _audit(actor: dict, kind: str, message: str, org_id: str, meta: Optional[dict] = None) -> None:
    await raw_db.activities.insert_one({
        "id": new_id(), "lead_id": None, "actor_id": actor["id"], "actor_name": actor.get("name"),
        "kind": kind, "message": message, "meta": {"organization_id": org_id, **(meta or {})},
        "organization_id": org_id, "created_at": now_utc().isoformat(),
    })


@router.get("/organizations")
async def list_organizations(user: dict = Depends(get_current_user)):
    q = {} if user["role"] == "super_admin" else {"id": user.get("organization_id")}
    return await raw_db.organizations.find(q, {"_id": 0}).sort("created_at", 1).to_list(200)


@router.post("/organizations")
async def create_organization(body: OrganizationBody, actor: dict = Depends(require_roles("super_admin"))):
    if actor["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    slug = body.slug.strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Use lowercase letters, numbers and hyphens for the slug")
    if await raw_db.organizations.find_one({"$or": [{"slug": slug}, {"name": body.name.strip()}]}):
        raise HTTPException(status_code=400, detail="An organisation with this name or slug already exists")
    if body.admin_email and await raw_db.users.find_one({"email": body.admin_email.lower()}):
        raise HTTPException(status_code=400, detail="Admin email already exists")
    doc = {"id": new_id(), "name": body.name.strip(), "slug": slug, "active": True, "created_at": now_utc().isoformat()}
    await raw_db.organizations.insert_one(doc)
    doc.pop("_id", None)
    if body.admin_email and body.admin_password:
        await raw_db.users.insert_one({
            "id": new_id(), "email": body.admin_email.lower(), "name": body.admin_name or "Admin",
            "role": "admin", "phone": "", "active": True, "organization_id": doc["id"],
            "password_hash": hash_password(body.admin_password), "created_at": now_utc().isoformat(),
        })
    await _audit(actor, "organization_created", f"Organisation created: {doc['name']}", doc["id"])
    return doc


@router.patch("/organizations/{org_id}")
async def update_organization(org_id: str, body: OrganizationPatchBody, actor: dict = Depends(require_roles("super_admin"))):
    if actor["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    update = body.model_dump(exclude_none=True)
    if "slug" in update:
        update["slug"] = update["slug"].strip().lower()
        if not SLUG_RE.match(update["slug"]):
            raise HTTPException(status_code=400, detail="Use lowercase letters, numbers and hyphens for the slug")
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    r = await raw_db.organizations.update_one({"id": org_id}, {"$set": {**update, "updated_at": now_utc().isoformat()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organisation not found")
    org = await raw_db.organizations.find_one({"id": org_id}, {"_id": 0})
    await _audit(actor, "organization_updated", f"Organisation updated: {org['name']}", org_id, {"changes": list(update)})
    return org


@router.get("/super-admin/overview")
async def super_admin_overview(user: dict = Depends(require_roles("super_admin"))):
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    orgs = await raw_db.organizations.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)

    async def row(o: dict) -> dict:
        f = {"organization_id": o["id"]}
        users, leads, booked, projects, visits, pending = await asyncio.gather(
            raw_db.users.count_documents({**f, "active": {"$ne": False}}),
            raw_db.leads.count_documents(f),
            raw_db.leads.count_documents({**f, "stage": "booked"}),
            raw_db.projects.count_documents(f),
            raw_db.site_visits.count_documents(f),
            raw_db.follow_ups.count_documents({**f, "status": "pending"}),
        )
        admins = await raw_db.users.find({**f, "role": "admin"}, {"_id": 0, "name": 1, "email": 1}).to_list(10)
        return {**o, "admins": admins, "stats": {"users": users, "leads": leads, "booked": booked, "projects": projects, "site_visits": visits, "pending_followups": pending}}

    rows = await asyncio.gather(*[row(o) for o in orgs])
    return {"organizations": rows, "totals": {
        "organizations": len(rows),
        "users": sum(r["stats"]["users"] for r in rows),
        "leads": sum(r["stats"]["leads"] for r in rows),
        "booked": sum(r["stats"]["booked"] for r in rows),
    }}


@router.get("/super-admin/audit-logs")
async def super_admin_audit_logs(organization_id: Optional[str] = None, limit: int = 100, user: dict = Depends(require_roles("super_admin"))):
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    q: dict = {"kind": {"$in": ["organization_created", "organization_updated", "user_created", "user_updated", "user_deleted"]}}
    if organization_id:
        q["organization_id"] = organization_id
    return await raw_db.activities.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(max(limit, 1), 500))


async def ensure_organizations() -> None:
    """Create default orgs, tag legacy docs, seed the Super Admin."""
    default = await raw_db.organizations.find_one({"slug": "tasko"})
    if not default:
        default = {"id": new_id(), "name": "Propzel Realty", "slug": "tasko", "active": True, "created_at": now_utc().isoformat()}
        await raw_db.organizations.insert_one(default)
    for name in TENANT_COLLECTIONS:
        await raw_db[name].update_many({"organization_id": {"$exists": False}, "role": {"$ne": "super_admin"}} if name == "users" else {"organization_id": {"$exists": False}}, {"$set": {"organization_id": default["id"]}})
    sa_email = os.environ.get("SUPER_ADMIN_EMAIL", "superadmin@tasko.com").lower()
    sa_pw = os.environ.get("SUPER_ADMIN_PASSWORD", "superadmin123")
    sa = await raw_db.users.find_one({"email": sa_email})
    if not sa:
        await raw_db.users.insert_one({
            "id": new_id(), "email": sa_email, "name": "Super Admin", "role": "super_admin", "phone": "",
            "active": True, "organization_id": None, "password_hash": hash_password(sa_pw), "created_at": now_utc().isoformat(),
        })
    elif not verify_password(sa_pw, sa.get("password_hash", "")):
        await raw_db.users.update_one({"email": sa_email}, {"$set": {"password_hash": hash_password(sa_pw)}})
    if not await raw_db.organizations.find_one({"slug": "skyline"}):
        org = {"id": new_id(), "name": "Skyline Estates", "slug": "skyline", "active": True, "created_at": now_utc().isoformat()}
        await raw_db.organizations.insert_one(org)
        if not await raw_db.users.find_one({"email": "admin@skyline.com"}):
            await raw_db.users.insert_one({
                "id": new_id(), "email": "admin@skyline.com", "name": "Vikram Rao", "role": "admin", "phone": "",
                "active": True, "organization_id": org["id"], "password_hash": hash_password("skyline123"), "created_at": now_utc().isoformat(),
            })
    await raw_db.organizations.create_index("slug", unique=True)
    for name in ("leads", "users", "activities", "projects", "follow_ups", "site_visits", "notifications"):
        await raw_db[name].create_index("organization_id")


async def for_each_org(fn) -> list:
    results = []
    async for o in raw_db.organizations.find({"active": {"$ne": False}}, {"_id": 0, "id": 1}):
        token = org_ctx.set(o["id"])
        try:
            results.append(await fn())
        except Exception as e:
            log.warning("org job %s failed for %s: %s", getattr(fn, "__name__", fn), o["id"], e)
        finally:
            org_ctx.reset(token)
    return results
