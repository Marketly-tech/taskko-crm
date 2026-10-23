# Iteration 13: Calendar invites (.ics) for site visits — settings, status, test, create/patch/cancel/delete hooks, resend, reminder tick
import os
import random
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return s


def iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


def wait_visit(admin, vid, pred, timeout=20):
    v = None
    for _ in range(timeout * 2):
        vs = admin.get(f"{API}/site-visits").json()
        v = next((x for x in vs if x["id"] == vid), None)
        if v and pred(v):
            return v
        time.sleep(0.5)
    return v


@pytest.fixture(scope="module")
def admin():
    return _login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def manager():
    return _login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def exe():
    return _login("priya@tasko.com", "executive123")


@pytest.fixture(scope="module")
def ctx(admin):
    users = admin.get(f"{API}/users").json()
    priya = next(u for u in users if u["email"] == "priya@tasko.com")
    karan = next(u for u in users if u["email"] == "karan@tasko.com")
    proj = admin.get(f"{API}/projects").json()[0]
    r = admin.post(f"{API}/leads", json={"name": "TEST_Cal Lead", "phone": "7" + str(random.randint(100000000, 999999999)),
                                         "email": "test_cal_customer@example.com", "project_id": proj["id"],
                                         "assigned_to": priya["id"], "co_assigned_to": [karan["id"]]})
    assert r.status_code == 200, r.text
    lead = r.json()
    yield {"priya": priya, "karan": karan, "project": proj, "lead": lead, "visits": []}


@pytest.fixture(scope="module", autouse=True)
def restore(admin, ctx):
    yield
    for vid in ctx["visits"]:
        admin.delete(f"{API}/site-visits/{vid}")
    admin.delete(f"{API}/leads/{ctx['lead']['id']}")
    admin.patch(f"{API}/settings", json={"google_calendar_enabled": True, "calendar_from_email": "visits@propzel.tech", "calendar_from_name": "Propzel Realty", "visit_duration_min": 60})


def mk_visit(admin, ctx, delta):
    r = admin.post(f"{API}/site-visits", json={"lead_id": ctx["lead"]["id"], "project_id": ctx["project"]["id"], "scheduled_at": iso(delta)})
    assert r.status_code == 200, r.text
    ctx["visits"].append(r.json()["id"])
    return r.json()


# Settings persistence
def test_settings_patch_persists(admin):
    r = admin.patch(f"{API}/settings", json={"google_calendar_enabled": True, "calendar_from_email": "visits@propzel.tech", "calendar_from_name": "Propzel Realty", "visit_duration_min": 45})
    assert r.status_code == 200
    s = admin.get(f"{API}/settings").json()
    assert s["calendar_from_email"] == "visits@propzel.tech" and s["calendar_from_name"] == "Propzel Realty" and s["visit_duration_min"] == 45
    admin.patch(f"{API}/settings", json={"visit_duration_min": 60})


def test_settings_patch_forbidden_for_manager(manager):
    assert manager.patch(f"{API}/settings", json={"calendar_from_name": "x"}).status_code == 403


# Status
def test_status_admin(admin):
    r = admin.get(f"{API}/calendar/status")
    assert r.status_code == 200
    d = r.json()
    for k in ["enabled", "from_email", "from_name", "domain", "domain_status", "domain_verified"]:
        assert k in d
    assert d["domain"] == "propzel.tech" and d["enabled"] is True


@pytest.mark.parametrize("who", ["manager", "exe"])
def test_status_forbidden(who, request):
    s = request.getfixturevalue(who)
    assert s.get(f"{API}/calendar/status").status_code == 403


# Test invite
def test_test_invalid_email(admin):
    r = admin.post(f"{API}/calendar/test", json={"to": "not-an-email"})
    assert r.status_code == 400 and "valid email" in r.json()["detail"]


def test_test_valid_email_provider(admin):
    r = admin.post(f"{API}/calendar/test", json={"to": "test_cal@example.com"})
    assert r.status_code in (200, 400)
    if r.status_code == 400:
        assert "Email provider refused" in r.json()["detail"]
    print("calendar/test:", r.status_code, r.text[:200])


def test_test_forbidden_exec(exe):
    assert exe.post(f"{API}/calendar/test", json={"to": "a@b.com"}).status_code == 403


# Create visit -> invite fields
def test_create_future_visit_sets_invite(admin, ctx):
    v = mk_visit(admin, ctx, timedelta(days=3))
    got = wait_visit(admin, v["id"], lambda x: x.get("invite_status"))
    assert got.get("invite_status") in ("sent", "failed"), got
    to = got["invite_sent_to"]
    assert "priya@tasko.com" in to and "karan@tasko.com" in to and "test_cal_customer@example.com" in to
    assert got["ics_sequence"] == 0
    acts = admin.get(f"{API}/activities", params={"lead_id": ctx["lead"]["id"], "limit": 100}).json()
    assert any(a.get("kind") == "calendar_invite" for a in acts), [a.get("kind") for a in acts]
    ctx["future"] = v["id"]


def test_past_visit_no_invite(admin, ctx):
    v = mk_visit(admin, ctx, timedelta(hours=-5))
    time.sleep(4)
    got = wait_visit(admin, v["id"], lambda x: True)
    assert not got.get("invite_status") and "ics_sequence" not in got


def test_reschedule_increments_sequence(admin, ctx):
    vid = ctx["future"]
    admin.patch(f"{API}/site-visits/{vid}", json={"scheduled_at": iso(timedelta(days=4))})
    got = wait_visit(admin, vid, lambda x: x.get("ics_sequence") == 1)
    assert got["ics_sequence"] == 1 and got.get("reminders_sent") == []


def test_resend_invite_increments(admin, ctx):
    vid = ctx["future"]
    r = admin.post(f"{API}/site-visits/{vid}/resend-invite")
    assert r.status_code in (200, 400)
    print("resend:", r.status_code, r.text[:200])
    got = wait_visit(admin, vid, lambda x: x.get("ics_sequence") == 2)
    assert got["ics_sequence"] == 2


def test_resend_invite_404(admin):
    assert admin.post(f"{API}/site-visits/nonexistent-id/resend-invite").status_code == 404


def test_cancel_sends_cancel(admin, ctx):
    vid = ctx["future"]
    admin.patch(f"{API}/site-visits/{vid}", json={"status": "cancelled"})
    got = wait_visit(admin, vid, lambda x: x.get("ics_sequence") == 3)
    assert got["ics_sequence"] == 3 and got["invite_status"] in ("cancelled", "failed")
    r = admin.post(f"{API}/site-visits/{vid}/resend-invite")
    assert r.status_code == 400 and "scheduled" in r.json()["detail"]


def test_disabled_calendar_no_invite(admin, ctx):
    admin.patch(f"{API}/settings", json={"google_calendar_enabled": False})
    try:
        v = mk_visit(admin, ctx, timedelta(days=2))
        time.sleep(4)
        got = wait_visit(admin, v["id"], lambda x: True)
        assert not got.get("invite_status") and "ics_sequence" not in got
    finally:
        admin.patch(f"{API}/settings", json={"google_calendar_enabled": True})


# Reminder tick (waits ~75s)
def test_reminder_tick(admin, ctx):
    v = mk_visit(admin, ctx, timedelta(hours=1))
    got = wait_visit(admin, v["id"], lambda x: set(x.get("reminders_sent") or []) >= {"1d", "2h"}, timeout=80)
    assert set(got.get("reminders_sent") or []) >= {"1d", "2h"}, got
    assert "10m" not in (got.get("reminders_sent") or [])
    acts = admin.get(f"{API}/activities", params={"lead_id": ctx["lead"]["id"], "limit": 100}).json()
    assert any(a.get("kind") == "calendar_reminder" for a in acts)
