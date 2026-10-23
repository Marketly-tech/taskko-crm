# Iteration 11: dashboard date range, call report, CallerDesk stage campaigns, WA templates
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def manager():
    return _login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def exe():
    return _login("priya@tasko.com", "executive123")


CREATED = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for cid in CREATED:
        admin.delete(f"{BASE_URL}/api/callerdesk/campaigns/{cid}")


# ---- Dashboard monthly
class TestMonthly:
    def test_default(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/monthly")
        assert r.status_code == 200
        assert "period" in r.json() and "telemetry" in r.json()

    def test_range_daily(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/monthly", params={"date_from": "2026-10-01", "date_to": "2026-10-10"})
        assert r.status_code == 200
        d = r.json()
        assert d["period"]["start"].startswith("2026-10-01")
        assert d["period"]["end"].startswith("2026-10-11")
        assert len(d["telemetry"]) == 10
        assert d["telemetry"][0]["label"] == "01 Oct"

    def test_range_monthly(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/monthly", params={"date_from": "2026-01-01", "date_to": "2026-10-31"})
        assert r.status_code == 200
        t = r.json()["telemetry"]
        assert len(t) == 10 and t[0]["label"] == "Jan-26"

    def test_invalid(self, admin):
        assert admin.get(f"{BASE_URL}/api/dashboard/monthly", params={"date_from": "bad"}).status_code == 400

    def test_to_before_from(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/monthly", params={"date_from": "2026-10-10", "date_to": "2026-10-01"})
        assert r.status_code == 400


# ---- Action items
class TestActionItems:
    def test_default_today(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/action-items")
        assert r.status_code == 200
        d = r.json()
        assert "todo_list" in d and "widgets" in d and "tasks" in d["widgets"]
        from datetime import datetime, timedelta
        s = datetime.fromisoformat(d["period"]["start"])
        e = datetime.fromisoformat(d["period"]["end"])
        assert e - s == timedelta(days=1)

    def test_range(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/action-items", params={"date_from": "2026-09-01", "date_to": "2026-11-30"})
        assert r.status_code == 200
        d = r.json()
        for t in d["todo_list"]:
            assert t["kind"] in ("meeting", "email", "whatsapp") and t["status"] == "pending"
            assert "2026-09-01" <= t["due_at"][:10] <= "2026-11-30"
        assert d["widgets"]["tasks"] == len(d["todo_list"])

    def test_invalid(self, admin):
        assert admin.get(f"{BASE_URL}/api/dashboard/action-items", params={"date_from": "2026-10-10", "date_to": "2026-10-01"}).status_code == 400


# ---- Call report
KEYS = ["outgoing_calls", "answered", "missed", "unique_contacts", "incoming", "sms_sent", "email_sent", "followups"]


class TestCallReport:
    def test_admin(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard/call-report", params={"date_from": "2026-01-01", "date_to": "2026-12-31"})
        assert r.status_code == 200
        d = r.json()
        for k in KEYS:
            assert isinstance(d[k], int)

    def test_manager(self, manager):
        assert manager.get(f"{BASE_URL}/api/dashboard/call-report").status_code == 200

    def test_exec_forbidden(self, exe):
        assert exe.get(f"{BASE_URL}/api/dashboard/call-report").status_code == 403

    def test_user_filter(self, admin):
        params = {"date_from": "2025-01-01", "date_to": "2026-12-31"}
        all_ = admin.get(f"{BASE_URL}/api/dashboard/call-report", params={**params, "user_id": "all"}).json()
        users = admin.get(f"{BASE_URL}/api/users").json()
        sums = {k: 0 for k in KEYS}
        diff = False
        for u in users:
            d = admin.get(f"{BASE_URL}/api/dashboard/call-report", params={**params, "user_id": u["id"]}).json()
            for k in KEYS:
                sums[k] += d[k]
                assert d[k] <= all_[k]
            if d["outgoing_calls"] != all_["outgoing_calls"]:
                diff = True
        print("ALL:", all_, "SUM:", sums)
        assert diff or all_["outgoing_calls"] == 0

    def test_invalid(self, admin):
        assert admin.get(f"{BASE_URL}/api/dashboard/call-report", params={"date_from": "x"}).status_code == 400


# ---- Campaign stages
class TestCampaignStages:
    def test_preview(self, admin):
        r = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": "new,contacted", "skip_called_today": "true"})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["count"], int) and isinstance(d["skipped"], int)
        r2 = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": "new,contacted", "skip_called_today": "false"}).json()
        assert r2["count"] == d["count"] + d["skipped"] and r2["skipped"] == 0

    def test_preview_unknown(self, admin):
        assert admin.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": "foo"}).status_code == 400

    def test_preview_empty(self, admin):
        r = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": ""})
        assert r.json() == {"count": 0, "skipped": 0}

    def test_preview_exec_forbidden(self, exe):
        assert exe.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": "new"}).status_code == 403

    def test_create_draft(self, admin):
        prev = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/stage-preview", params={"stages": "new", "skip_called_today": "false"}).json()
        r = admin.post(f"{BASE_URL}/api/callerdesk/campaigns", json={"name": "TEST_draft", "stages": ["new"], "skip_called_today": False, "auto_start": False})
        if prev["count"] == 0:
            assert r.status_code == 400
            return
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED.append(c["id"])
        assert c["status"] == "draft" and c["stages"] == ["new"]
        assert c["total_numbers"] <= prev["count"] and c["total_numbers"] > 0
        lst = admin.get(f"{BASE_URL}/api/callerdesk/campaigns").json()["items"]
        m = [x for x in lst if x["id"] == c["id"]][0]
        assert m["total_numbers"] == c["total_numbers"] and m["pending_numbers"] == c["total_numbers"]

    def test_create_autostart(self, admin):
        r = admin.post(f"{BASE_URL}/api/callerdesk/campaigns", json={"name": "TEST_auto", "stages": ["new", "contacted"], "skip_called_today": True, "auto_start": True, "calls_per_minute": 2})
        if r.status_code == 400:
            pytest.skip(r.text)
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED.append(c["id"])
        print("RUN:", c.get("run"))
        assert "run" in c and "started" in c["run"] and "pending" in c["run"]
        assert c["status"] in ("active", "completed")
        calls = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/{c['id']}/calls").json()["items"]
        print("statuses:", {x["status"] for x in calls})
        assert any(x["status"] != "pending" for x in calls)

    def test_create_unknown_stage(self, admin):
        r = admin.post(f"{BASE_URL}/api/callerdesk/campaigns", json={"name": "TEST_bad", "stages": ["xx"]})
        assert r.status_code == 400

    def test_cancel(self, admin):
        for cid in CREATED:
            assert admin.delete(f"{BASE_URL}/api/callerdesk/campaigns/{cid}").status_code == 200
        lst = admin.get(f"{BASE_URL}/api/callerdesk/campaigns").json()["items"]
        for x in lst:
            if x["id"] in CREATED:
                assert x["status"] == "cancelled" and x["pending_numbers"] == 0
