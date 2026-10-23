"""
Iteration 8: Phase 1 refactor regression + Phase 2 multi-org / super-admin / masking / co-owner / DNP stages.
"""
import os
import uuid
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


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
    s.user = r.json()
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


@pytest.fixture(scope="module")
def karan():
    return login("karan@tasko.com", "executive123")


@pytest.fixture(scope="module")
def sa():
    return login("superadmin@tasko.com", "superadmin123")


@pytest.fixture(scope="module")
def sky():
    return login("admin@skyline.com", "skyline123")


@pytest.fixture(scope="module")
def orgs(sa):
    r = sa.get(f"{BASE}/organizations")
    assert r.status_code == 200
    d = {o["slug"]: o for o in r.json()}
    assert "tasko" in d and "skyline" in d
    return d


# ---------- Regression: auth ----------
class TestAuthRegression:
    def test_me_refresh_logout(self):
        s = login("admin@tasko.com", "admin123")
        assert "access_token" in s.cookies and "refresh_token" in s.cookies
        me = s.get(f"{BASE}/auth/me").json()
        assert me["email"] == "admin@tasko.com" and "password_hash" not in me
        assert me.get("active_organization_id")
        assert s.post(f"{BASE}/auth/refresh").status_code == 200
        assert s.post(f"{BASE}/auth/logout").status_code == 200
        s.cookies.clear()
        assert s.get(f"{BASE}/auth/me").status_code == 401

    def test_bad_login(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": "admin@tasko.com", "password": "nope"})
        assert r.status_code == 401


# ---------- Regression: GET smoke for all roles ----------
GET_ENDPOINTS = [
    "users", "projects", "units", "leads", "site-visits", "follow-ups", "activities", "analytics/summary",
    "settings", "whatsapp-templates", "channel-partners", "proposals", "dashboard/monthly",
    "dashboard/action-items", "dashboard/revenue-breakdown", "reports/executives", "reports/sources",
    "notifications", "twilio/status", "organizations",
]


@pytest.mark.parametrize("ep", GET_ENDPOINTS)
def test_admin_get_endpoints(admin, ep):
    r = admin.get(f"{BASE}/{ep}")
    assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("ep", ["leads", "site-visits", "follow-ups", "activities", "analytics/summary", "dashboard/monthly", "dashboard/action-items", "notifications", "users"])
def test_exec_manager_get_endpoints(manager, priya, ep):
    for s in (manager, priya):
        r = s.get(f"{BASE}/{ep}")
        assert r.status_code == 200, f"{ep} as {s.user['email']}: {r.status_code} {r.text[:200]}"


def test_admin_only_endpoints(admin):
    assert admin.get(f"{BASE}/admin/eod-summary").status_code == 200
    assert admin.get(f"{BASE}/units/export").status_code == 200
    assert admin.post(f"{BASE}/notifications/refresh").status_code == 200
    assert admin.post(f"{BASE}/notifications/read-all").status_code == 200


# ---------- Regression: lead CRUD flow ----------
class TestLeadFlow:
    def test_lead_crud(self, admin, priya):
        pid = priya.user["id"]
        r = admin.post(f"{BASE}/leads", json={"name": "TEST_lead_v8", "phone": "+919812345678", "source": "manual", "assigned_to": pid})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        assert r.json()["phone"] == "+919812345678"
        g = admin.get(f"{BASE}/leads/{lid}").json()
        assert g["name"] == "TEST_lead_v8"
        assert admin.patch(f"{BASE}/leads/{lid}", json={"notes": "upd"}).json()["notes"] == "upd"
        assert admin.post(f"{BASE}/leads/{lid}/assign", json={"user_id": pid}).status_code == 200
        for st in ["contacted_dnp", "qualified_dnp", "site_visit_dnp", "negotiation_dnp", "new"]:
            r = admin.post(f"{BASE}/leads/{lid}/stage", json={"stage": st})
            assert r.status_code == 200 and r.json()["stage"] == st, r.text
        assert admin.post(f"{BASE}/leads/{lid}/stage", json={"stage": "bogus"}).status_code == 422
        assert admin.post(f"{BASE}/leads/{lid}/notes", json={"text": "hello"}).status_code == 200
        assert admin.post(f"{BASE}/leads/{lid}/log-call", json={"duration_sec": 10}).status_code == 200
        assert admin.post(f"{BASE}/leads/bulk-assign", json={"lead_ids": [lid], "user_id": pid}).json()["matched"] == 1
        acts = admin.get(f"{BASE}/activities", params={"lead_id": lid}).json()
        assert len(acts) >= 3
        # executive patch with masked phone must not overwrite
        r = priya.get(f"{BASE}/leads/{lid}")
        assert r.status_code == 200 and r.json()["phone_masked"] is True
        masked = r.json()["phone"]
        assert "X" in masked and masked.startswith("98") and masked.endswith("78")
        r = priya.patch(f"{BASE}/leads/{lid}", json={"phone": masked, "notes": "exec"})
        assert r.status_code == 200, r.text
        assert admin.get(f"{BASE}/leads/{lid}").json()["phone"] == "+919812345678"
        assert admin.delete(f"{BASE}/leads/{lid}").status_code == 200
        assert admin.get(f"{BASE}/leads/{lid}").status_code == 404

    def test_import(self, admin):
        r = admin.post(f"{BASE}/leads/import", json={"rows": [{"name": "TEST_import_v8", "phone": "9000000001"}]})
        assert r.status_code == 200 and r.json()["created"] == 1
        for l in admin.get(f"{BASE}/leads", params={"search": "TEST_import_v8"}).json():
            admin.delete(f"{BASE}/leads/{l['id']}")


# ---------- Stage funnel ----------
def test_analytics_and_pipeline_dnp(admin):
    a = admin.get(f"{BASE}/analytics/summary").json()
    txt = str(a)
    for st in ["contacted_dnp", "qualified_dnp", "site_visit_dnp", "negotiation_dnp"]:
        assert st in txt, f"{st} missing from analytics"
    m = admin.get(f"{BASE}/dashboard/monthly").json()
    for st in ["contacted_dnp", "negotiation_dnp"]:
        assert st in str(m), f"{st} missing from dashboard/monthly"


# ---------- Multi-org isolation ----------
class TestIsolation:
    def test_skyline_isolated(self, admin, sky):
        tasko_leads = admin.get(f"{BASE}/leads").json()
        assert len(tasko_leads) > 0
        sky_leads = sky.get(f"{BASE}/leads").json()
        tasko_ids = {l["id"] for l in tasko_leads}
        assert not any(l["id"] in tasko_ids for l in sky_leads)
        sky_projects = sky.get(f"{BASE}/projects").json()
        tasko_proj_ids = {p["id"] for p in admin.get(f"{BASE}/projects").json()}
        assert not any(p["id"] in tasko_proj_ids for p in sky_projects)
        lid = tasko_leads[0]["id"]
        assert sky.get(f"{BASE}/leads/{lid}").status_code == 404
        assert sky.patch(f"{BASE}/leads/{lid}", json={"notes": "hack"}).status_code == 404
        assert sky.delete(f"{BASE}/leads/{lid}").status_code == 404
        users = sky.get(f"{BASE}/users").json()
        assert all(u["email"] != "admin@tasko.com" for u in users)

    def test_skyline_created_lead_scoped(self, admin, sky):
        r = sky.post(f"{BASE}/leads", json={"name": "TEST_sky_lead_v8", "phone": "+919700000011"})
        assert r.status_code == 200
        lid = r.json()["id"]
        assert sky.get(f"{BASE}/leads/{lid}").status_code == 200
        assert admin.get(f"{BASE}/leads/{lid}").status_code == 404
        # auto-assign must not pick a Tasko exec
        tasko_uids = {u["id"] for u in admin.get(f"{BASE}/users").json()}
        assert r.json().get("assigned_to") not in tasko_uids
        sky.delete(f"{BASE}/leads/{lid}")

    def test_cross_org_assign(self, admin, sky):
        """Skyline admin assigning a Skyline lead to a Tasko executive should be rejected."""
        r = sky.post(f"{BASE}/leads", json={"name": "TEST_sky_assign_v8"})
        lid = r.json()["id"]
        priya_id = [u for u in admin.get(f"{BASE}/users").json() if u["email"] == "priya@tasko.com"][0]["id"]
        r2 = sky.post(f"{BASE}/leads/{lid}/assign", json={"user_id": priya_id})
        sky.delete(f"{BASE}/leads/{lid}")
        assert r2.status_code in (400, 404), f"cross-org assign accepted: {r2.status_code}"


# ---------- Super admin ----------
class TestSuperAdmin:
    def test_orgs_and_header_scope(self, sa, orgs, admin, sky):
        me = sa.get(f"{BASE}/auth/me").json()
        assert me["role"] == "super_admin"
        assert me["active_organization_id"] == orgs["tasko"]["id"]
        default_leads = sa.get(f"{BASE}/leads").json()
        assert len(default_leads) == len(admin.get(f"{BASE}/leads").json())
        assert default_leads and "X" not in (default_leads[0].get("phone") or "")
        sl = sa.get(f"{BASE}/leads", headers={"X-Organization-Id": orgs["skyline"]["id"]}).json()
        assert len(sl) == len(sky.get(f"{BASE}/leads").json())
        assert sa.get(f"{BASE}/leads", headers={"X-Organization-Id": "nonexistent"}).status_code == 403

    def test_overview(self, sa):
        r = sa.get(f"{BASE}/super-admin/overview")
        assert r.status_code == 200
        d = r.json()
        assert d["totals"]["organizations"] >= 2
        for o in d["organizations"]:
            assert "stats" in o and "leads" in o["stats"]
        assert sa.get(f"{BASE}/super-admin/audit-logs").status_code == 200

    def test_non_super_admin_forbidden(self, admin, manager, sky):
        for s in (admin, manager, sky):
            assert s.get(f"{BASE}/super-admin/overview").status_code == 403
            assert s.post(f"{BASE}/organizations", json={"name": "x", "slug": "x"}).status_code == 403
        assert len(admin.get(f"{BASE}/organizations").json()) == 1

    def test_create_org_with_admin_and_disable(self, sa):
        slug = f"test-org-{uuid.uuid4().hex[:6]}"
        email = f"{slug}@example.com"
        r = sa.post(f"{BASE}/organizations", json={"name": f"TEST {slug}", "slug": slug, "admin_name": "T", "admin_email": email, "admin_password": "pass1234"})
        assert r.status_code == 200, r.text
        oid = r.json()["id"]
        assert sa.post(f"{BASE}/organizations", json={"name": "dup", "slug": slug}).status_code == 400
        assert sa.post(f"{BASE}/organizations", json={"name": "bad", "slug": "Bad Slug"}).status_code == 400
        na = login(email, "pass1234")
        assert na.get(f"{BASE}/leads").json() == []
        assert na.get(f"{BASE}/projects").json() == []
        r = sa.patch(f"{BASE}/organizations/{oid}", json={"active": False})
        assert r.status_code == 200 and r.json()["active"] is False
        assert na.get(f"{BASE}/leads").status_code == 403
        sa.patch(f"{BASE}/organizations/{oid}", json={"active": True})
        assert na.get(f"{BASE}/leads").status_code == 200
        assert sa.patch(f"{BASE}/organizations/nonexistent", json={"active": True}).status_code == 404

    def test_disable_skyline_then_reenable(self, sa, orgs, sky):
        oid = orgs["skyline"]["id"]
        try:
            assert sa.patch(f"{BASE}/organizations/{oid}", json={"active": False}).status_code == 200
            assert sky.get(f"{BASE}/leads").status_code == 403
        finally:
            assert sa.patch(f"{BASE}/organizations/{oid}", json={"active": True}).json()["active"] is True
        assert sky.get(f"{BASE}/leads").status_code == 200


# ---------- Webhook ----------
def test_webhook_org(admin, sky):
    r = requests.post(f"{BASE}/webhooks/leads/website?org=skyline", json={"name": "TEST_wh_sky_v8", "phone": "9811111111"})
    assert r.status_code == 200
    lid = r.json()["lead_id"]
    assert sky.get(f"{BASE}/leads/{lid}").status_code == 200
    assert admin.get(f"{BASE}/leads/{lid}").status_code == 404
    sky.delete(f"{BASE}/leads/{lid}")
    r = requests.post(f"{BASE}/webhooks/leads/website", json={"name": "TEST_wh_tasko_v8", "phone": "9822222222"})
    lid = r.json()["lead_id"]
    assert admin.get(f"{BASE}/leads/{lid}").status_code == 200
    admin.delete(f"{BASE}/leads/{lid}")
    assert requests.post(f"{BASE}/webhooks/leads/website?org=nope", json={"name": "x"}).status_code == 404
    assert requests.post(f"{BASE}/webhooks/leads/badsrc", json={"name": "x"}).status_code == 400


# ---------- Masking ----------
class TestMasking:
    def test_leads_masked(self, manager, priya, admin, sa):
        for s in (manager, priya):
            leads = [l for l in s.get(f"{BASE}/leads").json() if l.get("phone")]
            assert leads
            for l in leads:
                assert "X" in l["phone"] and l.get("phone_masked") is True, l["phone"]
        for s in (admin, sa):
            leads = [l for l in s.get(f"{BASE}/leads").json() if l.get("phone")]
            assert any(l["phone"].startswith("+91") for l in leads)
            assert not any("X" in l["phone"] for l in leads)

    def test_dashboard_users_activities_masked(self, manager):
        a = manager.get(f"{BASE}/analytics/summary").json()
        m = manager.get(f"{BASE}/dashboard/monthly").json()
        ai = manager.get(f"{BASE}/dashboard/action-items").json()
        for d, keys in ((m, ["top_leads", "recent_inquiries"]), (ai, ["no_call_leads"])):
            for k in keys:
                for l in d.get(k) or []:
                    if l.get("phone"):
                        assert "X" in l["phone"], f"{k} unmasked {l['phone']}"
        for u in manager.get(f"{BASE}/users").json():
            if u["id"] != manager.user["id"] and u.get("phone"):
                assert "X" in u["phone"], f"user phone unmasked {u['phone']}"
        import re
        acts = manager.get(f"{BASE}/activities").json()
        for act in acts:
            for k, v in (act.get("meta") or {}).items():
                if k in ("phone", "to", "from") and isinstance(v, str) and re.search(r"\d{8,}", v):
                    pytest.fail(f"activity meta unmasked {k}={v}")

    def test_search_by_phone_leak(self, admin, priya):
        """Exec searching by digits of real phone should not reveal hidden numbers (info leak check)."""
        lead = next(l for l in admin.get(f"{BASE}/leads", params={"assigned_to": priya.user["id"]}).json() if l.get("phone"))
        digits = "".join(c for c in lead["phone"] if c.isdigit())[-10:]
        res = priya.get(f"{BASE}/leads", params={"search": digits[2:8]}).json()
        # report only (informational)
        print("search-by-hidden-digits results:", len(res))


# ---------- Co-owner ----------
class TestCoOwner:
    def test_co_owner_flow(self, admin, manager, priya, karan):
        kid, pid = karan.user["id"], priya.user["id"]
        lid = admin.post(f"{BASE}/leads", json={"name": "TEST_coowner_v8", "phone": "+919833333333", "assigned_to": pid}).json()["id"]
        try:
            assert karan.get(f"{BASE}/leads/{lid}").status_code == 403
            r = manager.patch(f"{BASE}/leads/{lid}", json={"co_assigned_to": [kid]})
            assert r.status_code == 200 and r.json()["co_assigned_to"] == [kid]
            assert any(l["id"] == lid for l in karan.get(f"{BASE}/leads").json())
            g = karan.get(f"{BASE}/leads/{lid}")
            assert g.status_code == 200 and "X" in g.json()["phone"]
            notifs = karan.get(f"{BASE}/notifications").json()
            items = notifs.get("items", notifs) if isinstance(notifs, dict) else notifs
            assert any((n.get("meta") or {}).get("lead_id") == lid and "co-owner" in n.get("title", "").lower() for n in items)
            ids = lambda mode: {l["id"] for l in admin.get(f"{BASE}/leads", params={"assigned_to": kid, "owner_mode": mode}).json()}
            assert lid in ids("co_owner") and lid in ids("any") and lid not in ids("primary")
            pids = {l["id"] for l in admin.get(f"{BASE}/leads", params={"assigned_to": pid, "owner_mode": "co_owner"}).json()}
            assert lid not in pids
            # executive cannot change co-owners
            r = priya.patch(f"{BASE}/leads/{lid}", json={"co_assigned_to": [], "notes": "x"})
            assert r.status_code == 200
            assert admin.get(f"{BASE}/leads/{lid}").json()["co_assigned_to"] == [kid]
            assert karan.post(f"{BASE}/leads/{lid}/stage", json={"stage": "contacted_dnp"}).status_code == 200
        finally:
            admin.delete(f"{BASE}/leads/{lid}")
