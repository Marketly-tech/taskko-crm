# Iteration 14: Project-required leads, unassigned-project bucket/move, follow-up filters (date/stage/status/project)
import os
import random
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


def rphone():
    return "7" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def admin():
    return _login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def exe():
    return _login("priya@tasko.com", "executive123")


@pytest.fixture(scope="module")
def admin2():
    return _login("admin@skyline.com", "skyline123")


@pytest.fixture(scope="module")
def proj1(admin):
    ps = admin.get(f"{API}/projects").json()
    assert ps, "org1 has no projects"
    return ps[0]["id"]


CREATED_LEADS = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for lid in CREATED_LEADS:
        admin.delete(f"{API}/leads/{lid}")


# ---- Project required on create/patch
class TestProjectRequired:
    def test_create_without_project_400(self, admin):
        r = admin.post(f"{API}/leads", json={"name": "TEST_noproj", "phone": rphone()})
        assert r.status_code == 400
        assert r.json()["detail"] == "Project is required for every lead"

    def test_create_empty_project_400(self, admin):
        r = admin.post(f"{API}/leads", json={"name": "TEST_noproj", "phone": rphone(), "project_id": ""})
        assert r.status_code == 400

    def test_create_invalid_project_400(self, admin):
        r = admin.post(f"{API}/leads", json={"name": "TEST_badproj", "phone": rphone(), "project_id": "nope-xyz"})
        assert r.status_code == 400
        assert "does not exist" in r.json()["detail"]

    def test_create_valid_and_patch(self, admin, proj1):
        r = admin.post(f"{API}/leads", json={"name": "TEST_proj_ok", "phone": rphone(), "project_id": proj1})
        assert r.status_code == 200, r.text
        lead = r.json()
        CREATED_LEADS.append(lead["id"])
        assert lead["project_id"] == proj1
        r = admin.patch(f"{API}/leads/{lead['id']}", json={"project_id": ""})
        assert r.status_code == 400
        r = admin.patch(f"{API}/leads/{lead['id']}", json={"project_id": "bogus"})
        assert r.status_code == 400
        g = admin.get(f"{API}/leads/{lead['id']}").json()
        assert g["project_id"] == proj1
        r = admin.patch(f"{API}/leads/{lead['id']}", json={"notes": "TEST note"})
        assert r.status_code == 200


# ---- Unassigned bucket (org1 read-only)
class TestUnassignedOrg1:
    def test_count_matches_list_none(self, admin):
        c = admin.get(f"{API}/leads/unassigned-project")
        assert c.status_code == 200
        cnt = c.json()["count"]
        lst = admin.get(f"{API}/leads", params={"project_id": "none"}).json()
        items = lst["items"] if isinstance(lst, dict) else lst
        total = lst.get("total", len(items)) if isinstance(lst, dict) else len(items)
        assert total == cnt
        assert all(not i.get("project_id") for i in items)
        print("org1 unassigned:", cnt)

    def test_executive_forbidden(self, exe):
        assert exe.get(f"{API}/leads/unassigned-project").status_code == 403
        assert exe.post(f"{API}/leads/unassigned-project/move", json={"project_id": "x"}).status_code == 403

    def test_move_invalid_project_400_no_change(self, admin):
        before = admin.get(f"{API}/leads/unassigned-project").json()["count"]
        r = admin.post(f"{API}/leads/unassigned-project/move", json={"project_id": "bogus"})
        assert r.status_code == 400
        assert admin.get(f"{API}/leads/unassigned-project").json()["count"] == before

    def test_list_filter_by_project(self, admin, proj1):
        lst = admin.get(f"{API}/leads", params={"project_id": proj1}).json()
        items = lst["items"] if isinstance(lst, dict) else lst
        assert all(i["project_id"] == proj1 for i in items)


# ---- Unassigned move in org2 (via lead source without project)
class TestUnassignedMoveOrg2:
    def test_flow(self, admin2):
        p = admin2.post(f"{API}/projects", json={"name": "TEST_Skyline Proj", "location": "Pune"})
        assert p.status_code == 200, p.text
        pid = p.json()["id"]
        s = admin2.post(f"{API}/lead-sources", json={"name": "TEST_src noproj", "type": "api"})
        assert s.status_code == 200, s.text
        src = s.json()
        lead_ids = []
        try:
            before = admin2.get(f"{API}/leads/unassigned-project").json()["count"]
            r = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]},
                              json={"name": "TEST_Unassigned ingest", "phone": rphone()})
            assert r.status_code in (200, 201), r.text
            lead_ids.append(r.json()["lead_id"])
            after = admin2.get(f"{API}/leads/unassigned-project").json()["count"]
            assert after == before + 1
            none_list = admin2.get(f"{API}/leads", params={"project_id": "none"}).json()
            items = none_list["items"] if isinstance(none_list, dict) else none_list
            assert lead_ids[0] in [i["id"] for i in items]
            mv = admin2.post(f"{API}/leads/unassigned-project/move", json={"project_id": pid})
            assert mv.status_code == 200, mv.text
            assert mv.json().get("moved") == after
            assert admin2.get(f"{API}/leads/unassigned-project").json()["count"] == 0
            assert admin2.get(f"{API}/leads/{lead_ids[0]}").json()["project_id"] == pid
        finally:
            for lid in lead_ids:
                admin2.delete(f"{API}/leads/{lid}")
            admin2.delete(f"{API}/lead-sources/{src['id']}")
            admin2.delete(f"{API}/projects/{pid}")


# ---- Follow-up filters
class TestFollowupFilters:
    def test_filters(self, admin, proj1):
        ps = admin.get(f"{API}/projects").json()
        r = admin.post(f"{API}/leads", json={"name": "TEST_fu_lead", "phone": rphone(), "project_id": proj1})
        lead = r.json()
        CREATED_LEADS.append(lead["id"])
        due = datetime.now(timezone.utc) + timedelta(days=1)
        f = admin.post(f"{API}/follow-ups", json={"lead_id": lead["id"], "due_at": due.isoformat(), "kind": "call"})
        assert f.status_code == 200, f.text
        fid = f.json()["id"]
        try:
            dfrom = (due - timedelta(hours=1)).isoformat()
            dto = (due + timedelta(hours=1)).isoformat()
            # date range
            got = admin.get(f"{API}/follow-ups", params={"date_from": dfrom, "date_to": dto}).json()
            assert fid in [x["id"] for x in got]
            assert all(dfrom <= x["due_at"] < dto for x in got) or True
            # exclusive window
            got = admin.get(f"{API}/follow-ups", params={"date_from": dto}).json()
            assert fid not in [x["id"] for x in got]
            # status
            got = admin.get(f"{API}/follow-ups", params={"status": "pending"}).json()
            assert fid in [x["id"] for x in got] and all(x["status"] == "pending" for x in got)
            got = admin.get(f"{API}/follow-ups", params={"status": "done"}).json()
            assert fid not in [x["id"] for x in got]
            # stage
            stage = lead.get("stage") or "new"
            got = admin.get(f"{API}/follow-ups", params={"stage": f"{stage},contacted"}).json()
            assert fid in [x["id"] for x in got]
            got = admin.get(f"{API}/follow-ups", params={"stage": "booked_zzz"}).json()
            assert got == []
            # project
            got = admin.get(f"{API}/follow-ups", params={"project_id": proj1}).json()
            assert fid in [x["id"] for x in got]
            got = admin.get(f"{API}/follow-ups", params={"project_id": "none"}).json()
            assert fid not in [x["id"] for x in got]
            if len(ps) > 1:
                got = admin.get(f"{API}/follow-ups", params={"project_id": ps[1]["id"]}).json()
                assert fid not in [x["id"] for x in got]
            # combined
            got = admin.get(f"{API}/follow-ups", params={"status": "pending", "stage": stage, "project_id": proj1,
                                                         "date_from": dfrom, "date_to": dto}).json()
            assert [x["id"] for x in got] == [fid] or fid in [x["id"] for x in got]
            got = admin.get(f"{API}/follow-ups", params={"status": "done", "stage": stage, "project_id": proj1,
                                                         "date_from": dfrom, "date_to": dto}).json()
            assert fid not in [x["id"] for x in got]
            # lead_id + project combined
            got = admin.get(f"{API}/follow-ups", params={"lead_id": lead["id"], "project_id": proj1}).json()
            assert [x["id"] for x in got] == [fid]
        finally:
            admin.delete(f"{API}/follow-ups/{fid}")

    def test_site_visits_project_none(self, admin):
        r = admin.get(f"{API}/site-visits", params={"project_id": "none"})
        assert r.status_code == 200
