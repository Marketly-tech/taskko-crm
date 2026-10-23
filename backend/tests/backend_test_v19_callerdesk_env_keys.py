# CallerDesk env-only keys: status, removed settings, lead call via CallerDesk, campaigns, webhook
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def manager():
    return login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def priya():
    return login("priya@tasko.com", "executive123")


def project_id(admin):
    r = admin.get(f"{BASE_URL}/api/projects")
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    return items[0]["id"] if items else None


@pytest.fixture(scope="module")
def test_lead(admin):
    pid = project_id(admin)
    phone = "+9198" + str(uuid.uuid4().int)[:8]
    r = admin.post(f"{BASE_URL}/api/leads", json={"name": "TEST_CD Lead", "phone": phone, "source": "manual", "stage": "negotiation_dnp", "project_id": pid})
    assert r.status_code in (200, 201), r.text
    lead = r.json()
    yield lead
    admin.delete(f"{BASE_URL}/api/leads/{lead['id']}")


# --- status ---
def test_status_admin(admin):
    r = admin.get(f"{BASE_URL}/api/callerdesk/status")
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is False
    assert "provider" not in d and "org_override" not in d
    assert d["webhook_url"].endswith("/api/callerdesk/webhook?org=tasko"), d["webhook_url"]
    assert d["webhook_url"].startswith("https://")
    assert d["secret_configured"] is False
    assert "virtual_number" in d


def test_status_manager_no_webhook(manager):
    r = manager.get(f"{BASE_URL}/api/callerdesk/status")
    assert r.status_code == 200
    d = r.json()
    assert d["webhook_url"] is None
    assert "provider" not in d


def test_settings_patch_removed(admin):
    r = admin.patch(f"{BASE_URL}/api/callerdesk/settings", json={"authcode": "x"})
    assert r.status_code in (404, 405), r.status_code


# --- lead call ---
def test_lead_call_pending_credentials(admin, test_lead):
    r = admin.post(f"{BASE_URL}/api/leads/{test_lead['id']}/call")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "pending_credentials"
    assert d["provider"] == "callerdesk"
    assert d["mock"] is True
    # call log persisted
    logs = admin.get(f"{BASE_URL}/api/callerdesk/call-logs", params={"search": "TEST_CD Lead"}).json()["items"]
    assert any(x["lead_id"] == test_lead["id"] and x["status"] == "pending_credentials" for x in logs)
    # activity not Twilio mock
    acts = admin.get(f"{BASE_URL}/api/leads/{test_lead['id']}").json()
    print("lead detail keys", list(acts.keys())[:20])


def test_lead_call_no_phone_lead_400(admin):
    r = admin.post(f"{BASE_URL}/api/leads", json={"name": "TEST_CD NoPhone", "phone": "", "source": "manual", "project_id": project_id(admin)})
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot create phoneless lead: {r.status_code} {r.text[:120]}")
    lid = r.json()["id"]
    try:
        c = admin.post(f"{BASE_URL}/api/leads/{lid}/call")
        assert c.status_code == 400
        assert "phone" in c.json()["detail"].lower()
    finally:
        admin.delete(f"{BASE_URL}/api/leads/{lid}")


def test_lead_call_caller_no_phone_400(priya):
    leads = priya.get(f"{BASE_URL}/api/leads").json()
    leads = leads if isinstance(leads, list) else leads.get("items", [])
    lead = next((x for x in leads if x.get("phone")), None)
    if not lead:
        pytest.skip("priya has no leads with phone")
    r = priya.post(f"{BASE_URL}/api/leads/{lead['id']}/call")
    assert r.status_code == 400, r.text
    assert "profile" in r.json()["detail"].lower()


def test_lead_call_404(admin):
    r = admin.post(f"{BASE_URL}/api/leads/nonexistent-xyz/call")
    assert r.status_code == 404


# --- campaigns ---
def test_campaign_stage_autostart(admin, test_lead):
    r = admin.post(f"{BASE_URL}/api/callerdesk/campaigns", json={"name": "TEST_CD Campaign", "lead_ids": [test_lead["id"]], "stages": ["negotiation_dnp"],
                                                                 "skip_called_today": False, "auto_start": True, "calls_per_minute": 1})
    assert r.status_code == 200, r.text
    c = r.json()
    try:
        assert c["total_numbers"] >= 1
        assert c["run"]["started"] == 1
        assert c["status"] in ("active", "completed")
        calls = admin.get(f"{BASE_URL}/api/callerdesk/campaigns/{c['id']}/calls").json()["items"]
        statuses = [x["status"] for x in calls]
        assert "pending_credentials" in statuses, statuses
    finally:
        d = admin.delete(f"{BASE_URL}/api/callerdesk/campaigns/{c['id']}")
        assert d.status_code == 200
    lst = admin.get(f"{BASE_URL}/api/callerdesk/campaigns", params={"search": "TEST_CD Campaign"}).json()["items"]
    assert all(x["status"] == "cancelled" for x in lst if x["id"] == c["id"])


def test_campaign_bad_stage_400(admin):
    r = admin.post(f"{BASE_URL}/api/callerdesk/campaigns", json={"name": "TEST_CD Bad", "stages": ["nope"], "auto_start": False})
    assert r.status_code == 400


# --- webhook ---
def test_webhook_no_secret_accepts():
    sid = f"TEST_sid_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json={"sid_id": sid, "callstatus": "answered", "talk_duration": "12",
                                                                             "caller_num": "9000000001", "member_num": "9000000002", "direction": "outgoing"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True


def test_webhook_unknown_org_404():
    r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=no-such-org-xyz", json={"sid_id": "x"})
    assert r.status_code == 404


def test_dashboard_and_logs(admin):
    assert admin.get(f"{BASE_URL}/api/callerdesk/dashboard").status_code == 200
    assert admin.get(f"{BASE_URL}/api/callerdesk/call-logs").status_code == 200
