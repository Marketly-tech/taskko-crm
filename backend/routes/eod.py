from core import *  # noqa: F401,F403

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# ADMIN EOD SUMMARY + RESEND EMAIL
# ---------------------------------------------------------------------------
import asyncio  # noqa: E402
try:
    import resend  # noqa: E402
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
except Exception:
    resend = None

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")




async def compute_eod_summary(target_date: Optional[datetime] = None) -> dict:
    """Aggregate today's key metrics for the admin."""
    now = target_date or now_utc()
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    s, e = day_start.isoformat(), day_end.isoformat()

    # Follow-ups due today
    fu_due = await db.follow_ups.count_documents({
        "status": "pending",
        "due_at": {"$gte": s, "$lt": e},
    })
    fu_overdue = await db.follow_ups.count_documents({
        "status": "pending",
        "due_at": {"$lt": now.isoformat()},
    })

    # Milestones today
    bookings_today = await db.leads.count_documents({
        "stage": "booked",
        "updated_at": {"$gte": s, "$lt": e},
    })
    site_visits_completed = await db.site_visits.count_documents({
        "status": "completed",
        "scheduled_at": {"$gte": s, "$lt": e},
    })
    new_leads = await db.leads.count_documents({"created_at": {"$gte": s, "$lt": e}})

    # Calls (from activities): total, connected, missed, total talk time
    call_kinds = ["outgoing_call", "incoming_call", "missed_call", "call"]
    calls_pipe = [
        {"$match": {"kind": {"$in": call_kinds}, "created_at": {"$gte": s, "$lt": e}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "connected": {"$sum": {"$cond": [{"$eq": ["$meta.disposition", "connected"]}, 1, 0]}},
            "missed": {"$sum": {"$cond": [{"$eq": ["$kind", "missed_call"]}, 1, 0]}},
            "talk_time": {"$sum": {"$ifNull": ["$meta.duration_sec", 0]}},
        }},
    ]
    calls_row = None
    async for r in db.activities.aggregate(calls_pipe):
        calls_row = r
    calls = {
        "total": (calls_row or {}).get("total", 0),
        "connected": (calls_row or {}).get("connected", 0),
        "missed": (calls_row or {}).get("missed", 0),
        "talk_time_sec": int((calls_row or {}).get("talk_time", 0)),
    }

    # Top performers today (bookings / calls)
    pipe = [
        {"$match": {"kind": {"$in": call_kinds}, "created_at": {"$gte": s, "$lt": e}, "actor_id": {"$ne": None}}},
        {"$group": {"_id": "$actor_id", "calls": {"$sum": 1}, "talk_time": {"$sum": {"$ifNull": ["$meta.duration_sec", 0]}}}},
        {"$sort": {"calls": -1}}, {"$limit": 5},
    ]
    top_execs = []
    async for r in db.activities.aggregate(pipe):
        u = await db.users.find_one({"id": r["_id"]}, {"name": 1, "_id": 0})
        top_execs.append({
            "name": (u or {}).get("name", "Unknown"),
            "calls": r["calls"],
            "talk_time_sec": int(r["talk_time"] or 0),
        })

    return {
        "date": day_start.date().isoformat(),
        "generated_at": now_utc().isoformat(),
        "followups": {"due_today": fu_due, "overdue": fu_overdue},
        "milestones": {
            "bookings": bookings_today,
            "site_visits_completed": site_visits_completed,
            "new_leads": new_leads,
        },
        "calls": calls,
        "top_execs": top_execs,
    }


def _fmt_hms(sec: int) -> str:
    if sec <= 0:
        return "0m"
    h = sec // 3600
    m = (sec % 3600) // 60
    if h > 0:
        return f"{h}h {m}m"
    return f"{m}m"


def _eod_html(summary: dict) -> str:
    c = summary["calls"]
    m = summary["milestones"]
    f = summary["followups"]
    rows_html = ""
    for t in summary.get("top_execs", []):
        rows_html += f"<tr><td style='padding:8px 12px;border-top:1px solid #E6E4DD;'>{t['name']}</td><td style='padding:8px 12px;border-top:1px solid #E6E4DD;text-align:right;'>{t['calls']}</td><td style='padding:8px 12px;border-top:1px solid #E6E4DD;text-align:right;'>{_fmt_hms(t['talk_time_sec'])}</td></tr>"
    if not rows_html:
        rows_html = "<tr><td colspan='3' style='padding:12px;color:#5C6661;text-align:center;'>No call activity today.</td></tr>"
    return f"""<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;background:#F6F1E8;padding:32px;color:#102A20;">
<div style="letter-spacing:0.22em;font-size:11px;text-transform:uppercase;color:#5C6661;">Tasko · Daily Summary</div>
<h1 style="font-size:28px;margin:8px 0 4px;letter-spacing:-0.02em;">End of day report</h1>
<div style="color:#5C6661;font-size:14px;">{summary['date']}</div>

<table style="width:100%;margin-top:24px;border-collapse:collapse;background:#fff;border:1px solid #E6E4DD;">
  <tr>
    <td style="padding:16px;border-right:1px solid #E6E4DD;width:33%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">New leads</div>
      <div style="font-size:32px;font-weight:900;margin-top:4px;">{m['new_leads']}</div>
    </td>
    <td style="padding:16px;border-right:1px solid #E6E4DD;width:33%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Bookings</div>
      <div style="font-size:32px;font-weight:900;margin-top:4px;">{m['bookings']}</div>
    </td>
    <td style="padding:16px;width:33%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Site visits done</div>
      <div style="font-size:32px;font-weight:900;margin-top:4px;">{m['site_visits_completed']}</div>
    </td>
  </tr>
</table>

<table style="width:100%;margin-top:16px;border-collapse:collapse;background:#fff;border:1px solid #E6E4DD;">
  <tr>
    <td style="padding:16px;border-right:1px solid #E6E4DD;width:25%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Total calls</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px;">{c['total']}</div>
    </td>
    <td style="padding:16px;border-right:1px solid #E6E4DD;width:25%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Connected</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px;color:#2D6A4F;">{c['connected']}</div>
    </td>
    <td style="padding:16px;border-right:1px solid #E6E4DD;width:25%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Missed</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px;color:#C25934;">{c['missed']}</div>
    </td>
    <td style="padding:16px;width:25%;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Talk time</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px;">{_fmt_hms(c['talk_time_sec'])}</div>
    </td>
  </tr>
</table>

<div style="margin-top:16px;padding:16px;background:#fff;border:1px solid #E6E4DD;">
  <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Follow-ups</div>
  <div style="font-size:14px;margin-top:6px;">Due today: <strong>{f['due_today']}</strong> · Overdue: <strong style="color:#C25934;">{f['overdue']}</strong></div>
</div>

<div style="margin-top:16px;background:#fff;border:1px solid #E6E4DD;">
  <div style="padding:12px 16px;border-bottom:1px solid #E6E4DD;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C6661;">Top executives · today</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="color:#5C6661;text-transform:uppercase;font-size:10px;letter-spacing:0.15em;">
      <th style="padding:8px 12px;text-align:left;">Name</th>
      <th style="padding:8px 12px;text-align:right;">Calls</th>
      <th style="padding:8px 12px;text-align:right;">Talk time</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
</div>

<div style="margin-top:24px;font-size:11px;color:#5C6661;">
  Generated by Tasko CRM · {summary['generated_at']}
</div>
</div>"""


async def send_eod_email_to_admins() -> dict:
    """Send today's summary to all admin users. Uses Resend when available."""
    summary = await compute_eod_summary()
    admins = await db.users.find({"role": "admin", "active": {"$ne": False}}, {"_id": 0}).to_list(50)
    if not admins:
        return {"sent": 0, "reason": "no admins"}
    html = _eod_html(summary)
    subject = f"Tasko · End of day report · {summary['date']}"
    sent = 0
    errors = []
    for a in admins:
        if not a.get("email"):
            continue
        params = {"from": SENDER_EMAIL, "to": [a["email"]], "subject": subject, "html": html}
        try:
            if resend and resend.api_key:
                r = await asyncio.to_thread(resend.Emails.send, params)
                sent += 1
                await db.eod_emails.insert_one({
                    "id": new_id(),
                    "admin_id": a["id"],
                    "email": a["email"],
                    "date": summary["date"],
                    "email_id": r.get("id") if isinstance(r, dict) else None,
                    "created_at": now_utc().isoformat(),
                })
            else:
                log.info("[MOCK] EOD email to %s · subject=%s", a["email"], subject)
                sent += 1
                await db.eod_emails.insert_one({
                    "id": new_id(),
                    "admin_id": a["id"],
                    "email": a["email"],
                    "date": summary["date"],
                    "mock": True,
                    "created_at": now_utc().isoformat(),
                })
        except Exception as exc:
            log.warning("EOD email failed for %s: %s", a["email"], exc)
            errors.append({"email": a["email"], "error": str(exc)})
    return {"sent": sent, "errors": errors, "date": summary["date"]}


@router.get("/admin/eod-summary")
async def admin_eod_summary(user: dict = Depends(require_roles("admin"))):
    return await compute_eod_summary()


@router.post("/admin/eod-email/send")
async def admin_eod_email_send(user: dict = Depends(require_roles("admin"))):
    return await send_eod_email_to_admins()
