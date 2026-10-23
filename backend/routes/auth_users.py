from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
@router.post("/auth/login")
async def login(body: LoginBody, response: Response):
    email = body.email.lower().strip()
    user = await raw_db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Account is disabled")
    set_auth_cookies(response, user["id"], user["email"], user["role"])
    return clean(user)


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    tok = request.cookies.get("refresh_token")
    if not tok:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(tok)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await raw_db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
    if not user or user.get("active") is False:
        raise HTTPException(status_code=401, detail="User not found")
    set_auth_cookies(response, user["id"], user["email"], user["role"])
    return clean(user)


# ---------------------------------------------------------------------------
# USERS / TEAM
# ---------------------------------------------------------------------------
@router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    docs = await db.users.find({"role": {"$ne": "super_admin"}}, {"password_hash": 0, "_id": 0}).sort("created_at", -1).to_list(500)
    return [mask_user(d, user) for d in docs]


@router.post("/users")
async def create_user(body: RegisterBody, actor: dict = Depends(require_roles("admin"))):
    email = body.email.lower().strip()
    if await raw_db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    if body.role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin accounts cannot be created here")
    doc = {
        "id": new_id(),
        "email": email,
        "name": body.name,
        "role": body.role,
        "phone": body.phone or "",
        "password_hash": hash_password(body.password),
        "active": True,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    return clean(doc)


class UpdateSelfBody(BaseDoc):
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None


@router.patch("/users/me")
async def update_self(body: UpdateSelfBody, actor: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "password"}
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await raw_db.users.update_one({"id": actor["id"]}, {"$set": update})
    return await raw_db.users.find_one({"id": actor["id"]}, {"password_hash": 0, "_id": 0})


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserBody, actor: dict = Depends(require_roles("admin"))):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "password"}
    if update.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin role cannot be assigned here")
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.users.update_one({"id": user_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    doc = await db.users.find_one({"id": user_id}, {"password_hash": 0, "_id": 0})
    return doc


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, actor: dict = Depends(require_roles("admin"))):
    if user_id == actor["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    r = await db.users.delete_one({"id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
