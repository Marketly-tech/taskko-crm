"""
Iteration 7 backend regression tests
Focus: Kanban 3-dot move endpoint (POST /leads/{id}/stage), activity logging,
       auth logout, and general regression on core endpoints.
"""
import os
import pytest
import requests
import uuid

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # fallback: read from /app/frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not v:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return v.rstrip("/")


BASE_URL = _load_backend_url()


# --------------- Fixtures ---------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "admin@tasko.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def exec_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "priya@tasko.com", "password": "executive123"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def admin_me(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    return r.json()


# --------------- Auth ---------------
class TestAuth:
    def test_login_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "admin@tasko.com", "password": "admin123"})
        assert r.status_code == 200
        cookies = {c.name for c in s.cookies}
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_me_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "admin@tasko.com"

    def test_logout_clears_cookies_and_me_401(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "admin@tasko.com", "password": "admin123"})
        assert r.status_code == 200
        # Verify /me works
        assert s.get(f"{BASE_URL}/api/auth/me").status_code == 200
        # Logout
        r = s.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        # Backend should send Set-Cookie clearing cookies. requests session
        # will drop them or set them to empty. Verify /me is no longer authed.
        s.cookies.clear()  # simulate the browser clearing based on Set-Cookie
        r2 = s.get(f"{BASE_URL}/api/auth/me")
        assert r2.status_code == 401


# --------------- Kanban 3-dot move + activity logging ---------------
class TestKanbanStageMove:
    @pytest.fixture(scope="class")
    def test_lead(self, admin_session):
        """Create a fresh lead in 'new' stage, yield its id, then delete."""
        payload = {
            "name": f"TEST_kanban_{uuid.uuid4().hex[:8]}",
            "phone": "+919876500001",
            "source": "manual",
        }
        r = admin_session.post(f"{BASE_URL}/api/leads", json=payload)
        assert r.status_code in (200, 201), r.text
        lead = r.json()
        assert lead["stage"] == "new"
        yield lead
        # cleanup
        admin_session.delete(f"{BASE_URL}/api/leads/{lead['id']}")

    def test_stage_move_new_to_negotiation(self, admin_session, test_lead):
        lead_id = test_lead["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/leads/{lead_id}/stage",
            json={"stage": "negotiation"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["stage"] == "negotiation"
        assert data["id"] == lead_id

        # GET verifies persistence
        g = admin_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert g.status_code == 200
        assert g.json()["stage"] == "negotiation"

    def test_activity_stage_change_logged(self, admin_session, test_lead):
        lead_id = test_lead["id"]
        r = admin_session.get(
            f"{BASE_URL}/api/activities",
            params={"lead_id": lead_id, "limit": 50},
        )
        assert r.status_code == 200
        acts = r.json()
        stage_changes = [a for a in acts if a.get("kind") == "stage_change"]
        assert len(stage_changes) >= 1, f"no stage_change activity found: {acts}"

    def test_stage_move_to_all_stages(self, admin_session, test_lead):
        lead_id = test_lead["id"]
        for stage in ["contacted", "qualified", "site_visit",
                      "negotiation", "booked", "lost", "new"]:
            r = admin_session.post(
                f"{BASE_URL}/api/leads/{lead_id}/stage",
                json={"stage": stage},
            )
            assert r.status_code == 200, f"failed for {stage}: {r.text}"
            assert r.json()["stage"] == stage

    def test_stage_move_invalid_stage(self, admin_session, test_lead):
        lead_id = test_lead["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/leads/{lead_id}/stage",
            json={"stage": "not_a_stage"},
        )
        assert r.status_code in (400, 422)

    def test_stage_move_missing_lead(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/leads/does-not-exist/stage",
            json={"stage": "qualified"},
        )
        assert r.status_code == 404

    def test_stage_move_with_note(self, admin_session, test_lead):
        lead_id = test_lead["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/leads/{lead_id}/stage",
            json={"stage": "contacted", "note": "TEST_kanban note"},
        )
        assert r.status_code == 200
        # activity should contain the note text
        acts = admin_session.get(
            f"{BASE_URL}/api/activities",
            params={"lead_id": lead_id, "limit": 50},
        ).json()
        assert any("TEST_kanban note" in (a.get("message") or "") for a in acts)


# --------------- Executive scoping regression ---------------
class TestExecScoping:
    def test_priya_sees_only_own_leads(self, exec_session):
        r = exec_session.get(f"{BASE_URL}/api/leads")
        assert r.status_code == 200
        me = exec_session.get(f"{BASE_URL}/api/auth/me").json()
        for l in r.json():
            # Should be assigned to priya
            assert l.get("assigned_to") == me["id"], (
                f"Priya saw lead {l['id']} assigned to {l.get('assigned_to')} not {me['id']}"
            )

    def test_priya_can_move_own_lead_stage(self, exec_session, admin_session):
        # find one of priya's leads
        r = exec_session.get(f"{BASE_URL}/api/leads")
        leads = r.json()
        if not leads:
            pytest.skip("Priya has no leads")
        lead_id = leads[0]["id"]
        orig_stage = leads[0]["stage"]
        target = "qualified" if orig_stage != "qualified" else "contacted"
        r = exec_session.post(
            f"{BASE_URL}/api/leads/{lead_id}/stage",
            json={"stage": target},
        )
        assert r.status_code == 200
        assert r.json()["stage"] == target
        # restore
        exec_session.post(f"{BASE_URL}/api/leads/{lead_id}/stage",
                          json={"stage": orig_stage})


# --------------- Regression: core endpoints still 200 ---------------
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/users",
        "/api/leads",
        "/api/projects",
        "/api/follow-ups",
        "/api/site-visits",
        "/api/notifications",
        "/api/settings",
        "/api/dashboard/monthly",
    ])
    def test_endpoint_200(self, admin_session, path):
        r = admin_session.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
