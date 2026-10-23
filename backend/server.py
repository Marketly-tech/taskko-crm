"""Propzel CRM - FastAPI app entrypoint."""
from core import *  # noqa: F401,F403
from routes import auth_users, projects, leads, ops, catalog, dashboard, twilio_voice, notifications, eod, organizations, reports, callerdesk, whatsapp, lead_sources, calendar_invites
from routes.organizations import ensure_organizations, for_each_org
from routes.eod import send_eod_email_to_admins
from routes.notifications import refresh_notifications

app = FastAPI(title="Propzel CRM API")
for _m in (auth_users, projects, leads, ops, catalog, dashboard, twilio_voice, notifications, eod, organizations, reports, callerdesk, whatsapp, lead_sources, calendar_invites):
    app.include_router(_m.router)


@app.get("/api/")
async def root():
    return {"service": "Propzel CRM", "version": "1.0.0"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup: indexes + admin seeding + demo data
# ---------------------------------------------------------------------------
DEMO_PROJECTS = [
    {
        "name": "Aurelia Heights",
        "location": "Whitefield, Bengaluru",
        "city": "Bengaluru",
        "rera": "PRM/KA/RERA/1251/446/PR/220621/004512",
        "price_min": 12500000,
        "price_max": 32000000,
        "configurations": ["2BHK", "3BHK", "4BHK"],
        "cover": "https://images.pexels.com/photos/15577446/pexels-photo-15577446.jpeg",
        "description": "A premium residential enclave with skyline views and 40+ amenities.",
        "status": "active",
    },
    {
        "name": "Meridian Bay",
        "location": "Bandra West, Mumbai",
        "city": "Mumbai",
        "rera": "P51800009876",
        "price_min": 45000000,
        "price_max": 120000000,
        "configurations": ["3BHK", "4BHK", "Penthouse"],
        "cover": "https://images.pexels.com/photos/5323853/pexels-photo-5323853.jpeg",
        "description": "Sea-facing luxury towers in the heart of Bandra.",
        "status": "active",
    },
    {
        "name": "Cedar Grove",
        "location": "Sector 65, Gurugram",
        "city": "Gurugram",
        "rera": "RC/REP/HARERA/GGM/447/179/2023/45",
        "price_min": 18000000,
        "price_max": 48000000,
        "configurations": ["3BHK", "4BHK"],
        "cover": "https://images.unsplash.com/photo-1614595737476-42487331b8a1",
        "description": "Low-density gated community with private gardens.",
        "status": "active",
    },
]


async def seed_demo():
    # projects
    existing = await db.projects.count_documents({})
    if existing == 0:
        for p in DEMO_PROJECTS:
            doc = {**p, "id": new_id(), "created_at": now_utc().isoformat()}
            await db.projects.insert_one(doc)

    # units - one per project if none
    if await db.units.count_documents({}) == 0:
        projects = await db.projects.find({}, {"_id": 0}).to_list(10)
        rnd = random.Random(42)
        for p in projects:
            configs = p.get("configurations") or ["2BHK", "3BHK"]
            for tower in ["A", "B"]:
                for floor in range(1, 9):
                    for unit_idx in range(1, 5):
                        cfg = configs[unit_idx % len(configs)]
                        price_min = p.get("price_min") or 10000000
                        price_max = p.get("price_max") or 30000000
                        price = int(price_min + (price_max - price_min) * rnd.random())
                        status_r = rnd.random()
                        if status_r < 0.55:
                            unit_status = "available"
                        elif status_r < 0.75:
                            unit_status = "held"
                        elif status_r < 0.92:
                            unit_status = "booked"
                        else:
                            unit_status = "sold"
                        u = {
                            "id": new_id(),
                            "project_id": p["id"],
                            "tower": tower,
                            "floor": floor,
                            "unit_no": f"{tower}-{floor:02d}0{unit_idx}",
                            "config": cfg,
                            "carpet_area": 900 + rnd.randint(0, 900),
                            "price": price,
                            "facing": rnd.choice(["East", "West", "North", "South", "NE", "SW"]),
                            "status": unit_status,
                            "created_at": now_utc().isoformat(),
                        }
                        await db.units.insert_one(u)

    # users
    if await db.users.count_documents({}) == 0:
        seeds = [
            {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "name": "Aditi Kapoor", "role": "admin"},
            {"email": "manager@tasko.com", "password": "manager123", "name": "Rohan Mehra", "role": "manager"},
            {"email": "priya@tasko.com", "password": "executive123", "name": "Priya Sharma", "role": "executive"},
            {"email": "karan@tasko.com", "password": "executive123", "name": "Karan Malhotra", "role": "executive"},
            {"email": "neha@tasko.com", "password": "executive123", "name": "Neha Iyer", "role": "executive"},
        ]
        for s in seeds:
            await db.users.insert_one({
                "id": new_id(),
                "email": s["email"].lower(),
                "name": s["name"],
                "role": s["role"],
                "phone": "",
                "active": True,
                "password_hash": hash_password(s["password"]),
                "created_at": now_utc().isoformat(),
            })
    else:
        # ensure admin password matches env
        admin = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
        if admin and not verify_password(ADMIN_PASSWORD, admin.get("password_hash", "")):
            await db.users.update_one({"email": ADMIN_EMAIL.lower()}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})

    # leads
    if await db.leads.count_documents({}) == 0:
        projects = await db.projects.find({}, {"_id": 0}).to_list(10)
        execs = await db.users.find({"role": "executive"}, {"_id": 0}).to_list(10)
        first_names = ["Aarav", "Ishaan", "Vihaan", "Ananya", "Diya", "Kabir", "Aditya", "Meera", "Zoya", "Rahul", "Sneha", "Aryan", "Nikhil", "Riya", "Sanya", "Pooja", "Vikas", "Aman", "Simran", "Kunal"]
        last_names = ["Sharma", "Verma", "Gupta", "Kapoor", "Malhotra", "Sinha", "Iyer", "Rao", "Bose", "Chatterjee", "Reddy", "Nair"]
        sources = ["magicbricks", "99acres", "commonfloor", "housing", "website", "google_ads", "facebook", "instagram", "referral", "walk_in"]
        stages = ["new", "contacted", "qualified", "site_visit", "negotiation", "booked", "lost"]
        stage_weights = [0.25, 0.20, 0.15, 0.15, 0.10, 0.08, 0.07]
        priorities = ["hot", "warm", "cold"]
        configs = ["2BHK", "3BHK", "4BHK"]
        rnd = random.Random(7)

        for i in range(48):
            fn = rnd.choice(first_names)
            ln = rnd.choice(last_names)
            proj = rnd.choice(projects) if projects else None
            stage = rnd.choices(stages, weights=stage_weights, k=1)[0]
            assignee = rnd.choice(execs) if execs else None
            created = now_utc() - timedelta(days=rnd.randint(0, 20), hours=rnd.randint(0, 23))
            budget_min = rnd.choice([5000000, 10000000, 15000000, 20000000, 30000000])
            lead = {
                "id": new_id(),
                "name": f"{fn} {ln}",
                "phone": f"+91 9{rnd.randint(100000000, 999999999)}",
                "email": f"{fn.lower()}.{ln.lower()}@example.com",
                "source": rnd.choice(sources),
                "project_id": proj["id"] if proj else None,
                "budget_min": budget_min,
                "budget_max": budget_min + rnd.randint(1000000, 8000000),
                "configuration": rnd.choice(configs),
                "location_pref": (proj or {}).get("city", ""),
                "notes": "",
                "stage": stage,
                "priority": rnd.choice(priorities),
                "stars": rnd.choice([0, 0, 0, 3, 4, 5]),
                "assigned_to": assignee["id"] if assignee else None,
                "created_at": created.isoformat(),
                "updated_at": created.isoformat(),
            }
            await db.leads.insert_one(lead)

    # site visits & follow ups (a few)
    if await db.site_visits.count_documents({}) == 0:
        leads = await db.leads.find({"stage": {"$in": ["site_visit", "negotiation"]}}, {"_id": 0}).to_list(20)
        rnd = random.Random(11)
        for lead in leads[:12]:
            scheduled = now_utc() + timedelta(days=rnd.randint(-2, 7), hours=rnd.randint(9, 18))
            await db.site_visits.insert_one({
                "id": new_id(),
                "lead_id": lead["id"],
                "project_id": lead.get("project_id"),
                "scheduled_at": scheduled.isoformat(),
                "assigned_to": lead.get("assigned_to"),
                "status": "scheduled" if scheduled > now_utc() else rnd.choice(["completed", "no_show"]),
                "notes": "",
                "created_at": now_utc().isoformat(),
            })

    if await db.follow_ups.count_documents({}) == 0:
        leads = await db.leads.find({"stage": {"$nin": ["booked", "lost"]}}, {"_id": 0}).to_list(30)
        rnd = random.Random(13)
        for lead in leads[:20]:
            due = now_utc() + timedelta(hours=rnd.randint(-24, 96))
            await db.follow_ups.insert_one({
                "id": new_id(),
                "lead_id": lead["id"],
                "due_at": due.isoformat(),
                "kind": rnd.choice(["call", "whatsapp", "email"]),
                "notes": "",
                "assigned_to": lead.get("assigned_to"),
                "status": "pending",
                "created_at": now_utc().isoformat(),
            })

    # whatsapp templates
    if await db.whatsapp_templates.count_documents({}) == 0:
        seeds = [
            {"name": "Welcome", "category": "greeting", "body": "Hi {{name}}, thanks for your interest in {{project}}. Our team will connect with you shortly.", "variables": ["name", "project"], "approved": True},
            {"name": "Site Visit Confirmation", "category": "site_visit", "body": "Hi {{name}}, your site visit to {{project}} is confirmed for {{date}} at {{time}}. Reply YES to confirm.", "variables": ["name", "project", "date", "time"], "approved": True},
            {"name": "Follow-up Nudge", "category": "followup", "body": "Hi {{name}}, just checking in on your interest in {{project}}. Any questions I can answer?", "variables": ["name", "project"], "approved": True},
            {"name": "Proposal Sent", "category": "proposal", "body": "Hi {{name}}, we've sent a proposal for {{unit}} at {{project}}. Total: ₹{{amount}}. Valid until {{validity}}.", "variables": ["name", "unit", "project", "amount", "validity"], "approved": False},
        ]
        for s in seeds:
            await db.whatsapp_templates.insert_one({**s, "id": new_id(), "created_at": now_utc().isoformat()})

    # channel partners
    if await db.channel_partners.count_documents({}) == 0:
        seeds = [
            {"name": "Amit Verma", "company": "Verma Realty", "phone": "+91 9800011122", "email": "amit@vermarealty.in", "city": "Bengaluru", "rera": "PRM/KA/2298", "commission_pct": 2.0, "active": True},
            {"name": "Rekha Nair", "company": "SkyLine Advisors", "phone": "+91 9800011133", "email": "rekha@skyline.in", "city": "Mumbai", "rera": "P51900011232", "commission_pct": 1.75, "active": True},
            {"name": "Sameer Khan", "company": "Khan Properties", "phone": "+91 9800011155", "email": "sameer@khanprop.in", "city": "Gurugram", "rera": "RC/REP/HARERA/778", "commission_pct": 2.25, "active": True},
        ]
        for s in seeds:
            await db.channel_partners.insert_one({**s, "id": new_id(), "created_at": now_utc().isoformat(), "notes": ""})

    # proposals (accepted → month revenue)
    if await db.proposals.count_documents({}) == 0:
        booked = await db.leads.find({"stage": "booked"}, {"_id": 0}).to_list(20)
        rnd = random.Random(23)
        for b in booked:
            await db.proposals.insert_one({
                "id": new_id(),
                "lead_id": b["id"],
                "project_id": b.get("project_id"),
                "unit_id": None,
                "amount": rnd.choice([12000000, 18000000, 25000000, 32000000, 48000000]),
                "validity_days": 15,
                "status": "accepted",
                "terms": "Standard terms apply.",
                "created_by": b.get("assigned_to"),
                "created_at": now_utc().isoformat(),
            })
        # a few in draft/sent for pipeline
        neg = await db.leads.find({"stage": "negotiation"}, {"_id": 0}).to_list(10)
        for n in neg[:4]:
            await db.proposals.insert_one({
                "id": new_id(),
                "lead_id": n["id"],
                "project_id": n.get("project_id"),
                "unit_id": None,
                "amount": rnd.choice([15000000, 22000000, 30000000]),
                "validity_days": 15,
                "status": rnd.choice(["sent", "draft"]),
                "terms": "",
                "created_by": n.get("assigned_to"),
                "created_at": now_utc().isoformat(),
            })

    # activities — synthesize outgoing calls / emails / sms across last 4 months so telemetry chart is meaningful
    if await db.activities.count_documents({"kind": {"$in": ["outgoing_call", "email_sent", "sms_sent"]}}) == 0:
        all_leads = await db.leads.find({}, {"id": 1, "assigned_to": 1, "_id": 0}).to_list(200)
        if all_leads:
            rnd = random.Random(29)
            now = now_utc()
            for i in range(220):
                lead = rnd.choice(all_leads)
                kind = rnd.choices(["outgoing_call", "email_sent", "sms_sent", "missed_call"], weights=[0.55, 0.20, 0.20, 0.05])[0]
                days_back = rnd.randint(0, 110)
                ts = now - timedelta(days=days_back, hours=rnd.randint(0, 23))
                meta = {}
                if kind == "outgoing_call":
                    meta = {"direction": "outgoing", "duration_sec": rnd.randint(20, 480), "disposition": "connected", "recording_url": f"https://cdn.tasko.demo/rec/{new_id()}.mp3"}
                elif kind == "missed_call":
                    meta = {"direction": "outgoing", "duration_sec": 0, "disposition": "no_answer"}
                await db.activities.insert_one({
                    "id": new_id(),
                    "lead_id": lead["id"],
                    "actor_id": lead.get("assigned_to"),
                    "actor_name": "System",
                    "kind": kind,
                    "message": kind.replace("_", " ").title(),
                    "meta": meta,
                    "created_at": ts.isoformat(),
                })


from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: E402
from apscheduler.triggers.cron import CronTrigger  # noqa: E402

_scheduler: Optional[AsyncIOScheduler] = None


@app.on_event("startup")
async def on_startup():
    global _scheduler
    try:
        await db.users.create_index("email", unique=True)
        await db.leads.create_index("stage")
        await db.leads.create_index("assigned_to")
        await db.leads.create_index("project_id")
        await raw_db.lead_sources.create_index("key", unique=True)
        await raw_db.lead_events.create_index([("organization_id", 1), ("created_at", -1)])
        await db.units.create_index([("project_id", 1), ("tower", 1), ("floor", 1)])
        await db.site_visits.create_index("scheduled_at")
        await db.follow_ups.create_index("due_at")
        await db.activities.create_index("lead_id")
        await db.activities.create_index("kind")
        await db.activities.create_index("created_at")
        await db.proposals.create_index("lead_id")
        await db.whatsapp_templates.create_index("name")
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.notifications.create_index([("role_scope", 1), ("created_at", -1)])
        await db.notifications.create_index("dedupe_key")
    except Exception as e:
        log.warning(f"index setup: {e}")
    await seed_demo()
    await ensure_organizations()

    # Scheduler: EOD email at IST 18:00; notif refresh every 15 minutes
    try:
        eod_hour = int(os.environ.get("EOD_HOUR_IST", "18"))
        eod_min = int(os.environ.get("EOD_MIN_IST", "0"))
        _scheduler = AsyncIOScheduler(timezone=IST)
        _scheduler.add_job(for_each_org, args=[send_eod_email_to_admins], trigger=CronTrigger(hour=eod_hour, minute=eod_min), id="eod-email", replace_existing=True)
        _scheduler.add_job(for_each_org, args=[refresh_notifications], trigger="interval", minutes=15, id="notif-refresh", replace_existing=True, next_run_time=now_utc() + timedelta(seconds=30))
        _scheduler.add_job(for_each_org, args=[calendar_invites.visit_reminder_tick], trigger="interval", minutes=1, id="visit-reminders", replace_existing=True)
        _scheduler.add_job(for_each_org, args=[callerdesk.campaign_tick], trigger="interval", minutes=1, id="cd-campaigns", replace_existing=True)
        _scheduler.start()
        log.info("Scheduler started (EOD %02d:%02d IST, notif-refresh every 15m)", eod_hour, eod_min)
    except Exception as e:
        log.warning("Scheduler setup failed: %s", e)

    log.info("Propzel CRM startup complete.")


@app.on_event("shutdown")
async def on_shutdown():
    try:
        if _scheduler:
            _scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
