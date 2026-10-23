"""
Iteration 9: Phase 3 (reports w/ date range) + Phase 4 (CallerDesk integration, mocked - no keys).
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests


def _url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
    return v.rstrip("/")


BASE = _url() + "/api"
TODAY = date.today()
START = (TODAY - timedelta(days=365)).isoformat()
END = (TODAY + timedelta(days=1)).isoformat()
RNG = {"start": START, "end": END}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
    s.user = r.json()
    return s


@pytest.fixture(scope="module")
def admin():
    s = login("admin@tasko.com", "admin123")
    yield s
    # ALWAYS restore twilio provider
    r = s.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "twilio"})
    assert r.status_code == 200 and r.json()["provider"] == "twilio"


@pytest.fixture(scope="module")
def manager():
    return login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def priya():
    return login("priya@tasko.com", "executive123")


@pytest.fixture(scope="module")
def sky():
    return login("admin@skyline.com", "skyline123")


# ---------------- Reports ----------------
REPORTS = ["summary", "activity", "calls", "daily", "user-status", "not-interested", "lost-reasons", "executives", "sources"]


class TestReports:
    @pytest.mark.parametrize("name", REPORTS)
    def test_all_reports_200(self, admin, name):
        r = admin.get(f"{BASE}/reports/{name}", params={"start": (TODAY - timedelta(days=90)).isoformat(), "end": TODAY.isoformat()})
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("name", REPORTS)
    def test_invalid_date_400(self, admin, name):
        r = admin.get(f"{BASE}/reports/{name}", params={"start": "not-a-date", "end": TODAY.isoformat()})
        assert r.status_code == 400, f"{name}: {r.status_code}"

    @pytest.mark.parametrize("name", REPORTS)
    def test_start_after_end_400(self, admin, name):
        r = admin.get(f"{BASE}/reports/{name}", params={"start": "2026-05-10", "end": "2026-05-01"})
        assert r.status_code == 400, f"{name}: {r.status_code}"

    def test_summary_structure(self, admin):
        d = admin.get(f"{BASE}/reports/summary", params=RNG).json()
        assert set(d["totals"]) >= {"leads", "booked", "lost", "stars"}
        assert len(d["by_stage"]) == 11
        assert d["totals"]["leads"] == sum(x["count"] for x in d["by_stage"])
        assert "outgoing_calls" in d["activity"]

    def test_summary_date_field_updated(self, admin):
        r = admin.get(f"{BASE}/reports/summary", params={**RNG, "date_field": "updated"})
        assert r.status_code == 200

    def test_summary_source_filter(self, admin):
        allsrc = admin.get(f"{BASE}/reports/sources", params=RNG).json()
        assert allsrc, "no sources"
        src = allsrc[0]["source"]
        d = admin.get(f"{BASE}/reports/summary", params={**RNG, "source": src}).json()
        assert d["totals"]["leads"] == allsrc[0]["total"]

    def test_daily_rows_per_day(self, admin):
        s, e = "2026-06-01", "2026-06-30"
        d = admin.get(f"{BASE}/reports/daily", params={"start": s, "end": e}).json()
        assert len(d) == 30
        assert d[0]["date"] == s and d[-1]["date"] == e

    def test_daily_over_year_400(self, admin):
        r = admin.get(f"{BASE}/reports/daily", params={"start": "2024-01-01", "end": "2026-01-01"})
        assert r.status_code == 400

    def test_user_status_all_stages(self, admin):
        d = admin.get(f"{BASE}/reports/user-status", params=RNG).json()
        assert d
        row = d[0]
        stages = ["new", "contacted", "dnp_1", "dnp_2", "dnp_3", "dnp_4", "site_visit_scheduled", "site_visit_done", "negotiation", "booked", "lost"]
        keys = set(row) - {"user_id", "user", "total"}
        assert len(keys) == 11, keys
        for r in d:
            assert r["total"] == sum(r[k] for k in keys)

    def test_not_interested_and_masking(self, admin, manager):
        a = admin.get(f"{BASE}/reports/not-interested", params=RNG).json()
        m = manager.get(f"{BASE}/reports/not-interested", params=RNG).json()
        assert len(a) == len(m)
        for r in a:
            assert r["stage"] == "lost" or r["reason"] != "Not specified"
        if m:
            assert any(ch in (m[0]["phone"] or "") for ch in "*•x×X"), f"manager phone not masked: {m[0]['phone']}"
            assert m[0]["phone"] != a[0]["phone"]

    def test_lost_reasons_count(self, admin):
        ni = admin.get(f"{BASE}/reports/not-interested", params=RNG).json()
        lr = admin.get(f"{BASE}/reports/lost-reasons", params=RNG).json()
        assert sum(x["count"] for x in lr) == len(ni)

    def test_calls_types(self, admin):
        o = admin.get(f"{BASE}/reports/calls", params={**RNG, "call_type": "outgoing"})
        m = admin.get(f"{BASE}/reports/calls", params={**RNG, "call_type": "missed"})
        assert o.status_code == 200 and m.status_code == 200
        assert len(m.json()) <= len(o.json())
        bad = admin.get(f"{BASE}/reports/calls", params={**RNG, "call_type": "foo"})
        assert bad.status_code == 422

    def test_executive_scoping(self, admin, priya):
        pid = priya.user.get("id") or priya.user.get("user", {}).get("id")
        a = admin.get(f"{BASE}/reports/summary", params={**RNG, "assigned_to": pid}).json()
        p = priya.get(f"{BASE}/reports/summary", params=RNG).json()
        assert a["totals"]["leads"] == p["totals"]["leads"]
        us = priya.get(f"{BASE}/reports/user-status", params=RNG).json()
        assert all(r["user_id"] == pid for r in us)
        ex = priya.get(f"{BASE}/reports/executives", params=RNG).json()
        assert len(ex) == 1 and ex[0]["id"] == pid
        act = priya.get(f"{BASE}/reports/activity", params=RNG).json()
        assert all(r["user_id"] == pid for r in act)

    def test_org_scoping_skyline(self, sky):
        d = sky.get(f"{BASE}/reports/summary", params=RNG).json()
        assert d["totals"]["leads"] == 0
        assert sky.get(f"{BASE}/reports/sources", params=RNG).json() == []
        assert sky.get(f"{BASE}/reports/not-interested", params=RNG).json() == []


# ---------------- CallerDesk ----------------
@pytest.fixture(scope="module")
def a_lead(admin):
    r = admin.post(f"{BASE}/leads", json={"name": f"TEST_CD {uuid.uuid4().hex[:5]}", "phone": f"+9190{uuid.uuid4().int % 10**8:08d}", "source": "website"})
    assert r.status_code in (200, 201), r.text
    lead = r.json()
    yield lead
    admin.delete(f"{BASE}/leads/{lead['id']}")


class TestCallerDesk:
    def test_status_default(self, admin):
        admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "twilio"})
        d = admin.get(f"{BASE}/callerdesk/status").json()
        assert d["configured"] is False
        assert d["provider"] == "twilio"
        assert "webhook" in d["webhook_url"]

    def test_settings_manager_403(self, manager):
        r = manager.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "callerdesk"})
        assert r.status_code == 403

    def test_exec_403(self, priya):
        for p in ["dashboard", "call-logs", "campaigns"]:
            assert priya.get(f"{BASE}/callerdesk/{p}").status_code == 403, p
        assert priya.post(f"{BASE}/callerdesk/campaigns", json={"name": "x", "numbers": ["9000000000"]}).status_code == 403

    def test_call_pending_credentials(self, admin, a_lead):
        r = admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "callerdesk"})
        assert r.status_code == 200 and r.json()["provider"] == "callerdesk"
        r = admin.post(f"{BASE}/leads/{a_lead['id']}/call")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending_credentials" and d["mock"] is True
        logs = admin.get(f"{BASE}/callerdesk/call-logs", params={"search": a_lead["name"]}).json()["items"]
        assert len(logs) >= 1 and logs[0]["status"] == "pending_credentials" and logs[0]["lead_id"] == a_lead["id"]
        acts = admin.get(f"{BASE}/leads/{a_lead['id']}/activities")
        if acts.status_code == 200:
            assert any((x.get("meta") or {}).get("provider") == "callerdesk" for x in acts.json())

    def test_call_requires_actor_phone(self, priya, admin, a_lead):
        me = priya.get(f"{BASE}/auth/me").json()
        if me.get("phone"):
            pytest.skip("priya has phone")
        pid = me.get("id")
        admin.post(f"{BASE}/leads/{a_lead['id']}/assign", json={"assigned_to": pid})
        admin.patch(f"{BASE}/leads/{a_lead['id']}", json={"assigned_to": pid})
        admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "callerdesk"})
        r = priya.post(f"{BASE}/leads/{a_lead['id']}/call")
        assert r.status_code == 400, r.text
        assert "phone" in r.json()["detail"].lower()

    def test_call_logs_filters_and_mask(self, admin, manager):
        a = admin.get(f"{BASE}/callerdesk/call-logs", params={"status": "pending_credentials", "direction": "outgoing"}).json()["items"]
        assert a and all(x["status"] == "pending_credentials" and x["direction"] == "outgoing" for x in a)
        assert "_id" not in a[0] and "raw" not in a[0]
        m = manager.get(f"{BASE}/callerdesk/call-logs", params={"status": "pending_credentials"}).json()["items"]
        assert m and m[0]["phone_to"] != a[0]["phone_to"], "manager phone not masked"
        today = TODAY.isoformat()
        d = admin.get(f"{BASE}/callerdesk/call-logs", params={"date_from": "2000-01-01", "date_to": "2000-01-02"}).json()["items"]
        assert d == []

    def test_dashboard(self, admin, manager):
        d = admin.get(f"{BASE}/callerdesk/dashboard").json()
        for k in ["total_calls", "connected", "dnp", "failed", "active_campaigns", "pending_campaign_calls", "recent"]:
            assert k in d
        assert manager.get(f"{BASE}/callerdesk/dashboard").status_code == 200

    def test_campaign_no_numbers_400(self, admin):
        r = admin.post(f"{BASE}/callerdesk/campaigns", json={"name": "TEST_empty", "numbers": ["12"], "lead_ids": []})
        assert r.status_code == 400

    def test_campaign_lifecycle(self, admin, a_lead):
        admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "callerdesk"})
        r = admin.post(f"{BASE}/callerdesk/campaigns", json={"name": "TEST_camp", "lead_ids": [a_lead["id"]],
                                                              "numbers": ["9000022222", "9000033333", "9000044444"], "calls_per_minute": 2})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["status"] == "draft" and c["calls_per_minute"] == 2
        lst = admin.get(f"{BASE}/callerdesk/campaigns").json()["items"]
        me = next(x for x in lst if x["id"] == c["id"])
        assert me["total_numbers"] == 4 and me["pending_numbers"] == 4
        p = admin.patch(f"{BASE}/callerdesk/campaigns/{c['id']}", json={"name": "TEST_camp2"})
        assert p.status_code == 200 and p.json()["name"] == "TEST_camp2"
        s = admin.post(f"{BASE}/callerdesk/campaigns/{c['id']}/start")
        assert s.status_code == 200, s.text
        sd = s.json()
        assert sd["status"] in ("active", "completed") and sd["pending"] == 2
        calls = admin.get(f"{BASE}/callerdesk/campaigns/{c['id']}/calls").json()["items"]
        st = [x["status"] for x in calls]
        assert st.count("pending") == 2 and sum(1 for x in st if x in ("pending_credentials", "failed")) == 2, st
        assert admin.post(f"{BASE}/callerdesk/campaigns/{c['id']}/pause").status_code == 200
        assert next(x for x in admin.get(f"{BASE}/callerdesk/campaigns").json()["items"] if x["id"] == c["id"])["status"] == "paused"
        assert admin.delete(f"{BASE}/callerdesk/campaigns/{c['id']}").status_code == 200
        it = next(x for x in admin.get(f"{BASE}/callerdesk/campaigns").json()["items"] if x["id"] == c["id"])
        assert it["status"] == "cancelled" and it["pending_numbers"] == 0

    def test_campaign_404(self, admin):
        assert admin.patch(f"{BASE}/callerdesk/campaigns/nope", json={"name": "x"}).status_code == 404
        assert admin.post(f"{BASE}/callerdesk/campaigns/nope/start").status_code == 404

    def test_webhook_answer_incoming(self, admin):
        num = f"90{uuid.uuid4().int % 10**8:08d}"
        sid = f"TEST_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE}/callerdesk/webhook?org=tasko", json={"sid_id": sid, "callstatus": "ANSWER", "talk_duration": "42", "caller_num": num, "direction": "incoming"})
        assert r.status_code == 200, r.text
        logs = admin.get(f"{BASE}/callerdesk/call-logs", params={"search": sid}).json()["items"]
        assert len(logs) == 1 and logs[0]["status"] == "connected" and logs[0]["direction"] == "incoming" and logs[0]["duration_sec"] == 42
        assert logs[0]["lead_id"]
        lead = admin.get(f"{BASE}/leads/{logs[0]['lead_id']}").json()
        assert num in (lead.get("phone") or "")
        # same number again -> match same lead, no dupe
        sid2 = sid + "b"
        r2 = requests.post(f"{BASE}/callerdesk/webhook?org=tasko", json={"sid_id": sid2, "callstatus": "NO ANSWER", "talk_duration": "0", "caller_num": num, "direction": "incoming"})
        assert r2.status_code == 200
        l2 = admin.get(f"{BASE}/callerdesk/call-logs", params={"search": sid2}).json()["items"]
        assert l2[0]["status"] == "dnp" and l2[0]["lead_id"] == logs[0]["lead_id"]
        TestCallerDesk.wh_lead = lead
        admin.delete(f"{BASE}/leads/{lead['id']}")

    def test_webhook_missed_notification(self, admin):
        lead = getattr(TestCallerDesk, "wh_lead", None)
        if not lead or not lead.get("assigned_to"):
            pytest.skip("no assigned webhook lead")
        # login as owner if it's a known user
        from pymongo import MongoClient
        env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
        cli = MongoClient(env["MONGO_URL"].strip('"'))
        n = cli[env["DB_NAME"].strip('"')].notifications.find_one({"type": "missed_call", "user_id": lead["assigned_to"], "link": f"/leads/{lead['id']}"})
        assert n, "no missed_call notification for lead owner"

    def test_webhook_unknown_org(self):
        r = requests.post(f"{BASE}/callerdesk/webhook?org=does-not-exist", json={"sid_id": "x", "callstatus": "ANSWER"})
        assert r.status_code == 404

    def test_restore_twilio(self, admin):
        r = admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "twilio"})
        assert r.status_code == 200 and r.json()["provider"] == "twilio"
