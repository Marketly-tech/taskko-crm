"""
Iteration 6 backend tests — Twilio unverified caller ID error path,
missing-phone path, auth refresh interceptor contract, and auto-call
swallowing on lead creation.

Covers:
- POST /leads/{id}/call with an unverified exec phone returns HTTP 400
  with the NEW actionable message ("Twilio rejected the call: the number
  <phone> is not a Verified Caller ID …"), NOT the old cryptic Twilio SDK
  wording.
- Same 400 error path is triggered for any unverified E.164 number, not
  only the +15005550006 placeholder.
- Missing/empty exec phone returns HTTP 400 with
  "Set your phone (E.164, e.g. +9198…) on the Team page first".
- Auto-refresh contract: POST /auth/refresh with only refresh_token
  cookie present returns 200 and rotates cookies. Original session
  continues working.
- Full logout: DELETE both cookies → /auth/me returns 401 (no infinite
  refresh loop on the server side).
- Auto-call on new lead creation with settings.auto_call_on_new_lead=True
  and an unverified executive phone: the lead is still created (200) and
  the auto-call HTTPException is swallowed (server does not 500).
- Regression: /users, /leads, /projects, /follow-ups, /site-visits,
  /twilio/status, /notifications, /admin/eod-summary, /dashboard/monthly
  all still 200 for admin.

Restores the admin's original phone number in a session-scoped finalizer
so no state leaks between iterations.
"""
import os
import re
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

TEST_LEAD_ID = "170fe933-e731-410a-bee5-6339fdef385c"  # per review request
PLACEHOLDER_UNVERIFIED = "+15005550006"
OTHER_UNVERIFIED = "+919999999999"


def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    _login(s, "admin@tasko.com", "admin123")
    return s


@pytest.fixture(scope="module")
def priya_sess():
    s = requests.Session()
    _login(s, "priya@tasko.com", "executive123")
    return s


@pytest.fixture(scope="module")
def admin_user(admin_sess):
    r = admin_sess.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def priya_user(admin_sess):
    r = admin_sess.get(f"{API}/users", timeout=10)
    assert r.status_code == 200
    for u in r.json():
        if u.get("email") == "priya@tasko.com":
            return u
    pytest.fail("priya user not found")


@pytest.fixture(scope="module", autouse=True)
def restore_admin_phone(admin_sess, admin_user):
    """Snapshot the admin's current phone and restore it after this module
    finishes so we don't corrupt real user state."""
    original_phone = admin_user.get("phone") or ""
    yield original_phone
    try:
        admin_sess.patch(
            f"{API}/users/{admin_user['id']}",
            json={"phone": original_phone},
            timeout=10,
        )
    except Exception:
        pass


def _set_admin_phone(sess, admin_user, phone: str):
    r = sess.patch(f"{API}/users/{admin_user['id']}", json={"phone": phone}, timeout=10)
    assert r.status_code == 200, f"failed to set admin phone: {r.status_code} {r.text}"
    assert r.json().get("phone") == phone


# ---------------------------------------------------------------------------
# Twilio unverified caller ID error path
# ---------------------------------------------------------------------------
class TestTwilioUnverifiedErrorPath:
    """When exec_phone is a live-but-unverified E.164 number, /leads/{id}/call
    must return HTTP 400 with the new hint that points the user at the
    Verified Caller ID console."""

    def test_placeholder_unverified_returns_helpful_400(self, admin_sess, admin_user):
        _set_admin_phone(admin_sess, admin_user, PLACEHOLDER_UNVERIFIED)
        r = admin_sess.post(f"{API}/leads/{TEST_LEAD_ID}/call", timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # New actionable message
        assert "Twilio rejected the call" in detail, f"missing new hint prefix: {detail!r}"
        assert PLACEHOLDER_UNVERIFIED in detail, f"placeholder phone missing from msg: {detail!r}"
        assert "Verified Caller ID" in detail, f"missing Verified Caller ID phrase: {detail!r}"
        assert "twilio.com/console/phone-numbers/verified" in detail, (
            f"missing console URL hint: {detail!r}"
        )
        # NOT the old cryptic message
        assert "Unable to create record" not in detail, (
            f"old cryptic Twilio SDK message leaked: {detail!r}"
        )

    def test_different_unverified_number_same_error_path(self, admin_sess, admin_user):
        _set_admin_phone(admin_sess, admin_user, OTHER_UNVERIFIED)
        r = admin_sess.post(f"{API}/leads/{TEST_LEAD_ID}/call", timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # Frontend regex: /unverified|21219|Verified Caller ID/i
        assert re.search(r"unverified|21219|Verified Caller ID", detail, re.IGNORECASE), (
            f"frontend regex will not match: {detail!r}"
        )
        assert OTHER_UNVERIFIED in detail, (
            f"exec phone should be echoed in message so users know which number: {detail!r}"
        )

    def test_missing_phone_returns_set_your_phone(self, admin_sess, admin_user):
        _set_admin_phone(admin_sess, admin_user, "")
        r = admin_sess.post(f"{API}/leads/{TEST_LEAD_ID}/call", timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # Frontend regex: /Set your phone/i
        assert re.search(r"Set your phone", detail, re.IGNORECASE), (
            f"missing 'Set your phone' phrase: {detail!r}"
        )
        # Should reference E.164 hint for actionability
        assert "E.164" in detail or "+91" in detail, (
            f"missing E.164 format hint: {detail!r}"
        )


# ---------------------------------------------------------------------------
# Auth refresh interceptor contract (server side)
# ---------------------------------------------------------------------------
class TestAuthRefreshContract:
    def test_refresh_with_only_refresh_token_cookie_succeeds(self):
        """Simulate the frontend interceptor: after access_token expiry,
        POST /auth/refresh with just the refresh_token cookie should return
        200 and set fresh access_token + refresh_token cookies."""
        s = requests.Session()
        _login(s, "admin@tasko.com", "admin123")
        # Remove the access_token but keep the refresh_token to mimic expiry
        assert "access_token" in s.cookies, "login should set access_token"
        assert "refresh_token" in s.cookies, "login should set refresh_token"
        # Drop only the access_token cookie
        for c in list(s.cookies):
            if c.name == "access_token":
                s.cookies.clear(name="access_token", path=c.path, domain=c.domain)
        assert "access_token" not in s.cookies
        assert "refresh_token" in s.cookies

        # /auth/me MUST fail (no access token)
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401, f"expected 401 without access_token, got {r.status_code}"

        # Now call /auth/refresh — must issue fresh cookies
        r2 = s.post(f"{API}/auth/refresh", timeout=10)
        assert r2.status_code == 200, f"refresh failed: {r2.status_code} {r2.text}"
        assert "access_token" in s.cookies, "refresh did not set a new access_token cookie"

        # Original request replayed should now work
        r3 = s.get(f"{API}/auth/me", timeout=10)
        assert r3.status_code == 200, f"replayed /auth/me failed: {r3.status_code}"
        assert r3.json().get("email") == "admin@tasko.com"

    def test_full_logout_no_refresh_loop(self):
        """When BOTH cookies are gone, refresh must fail with 401 and
        /auth/me must fail with 401 too — server must not go into a loop."""
        s = requests.Session()
        _login(s, "admin@tasko.com", "admin123")
        s.cookies.clear()  # kill both cookies
        r = s.post(f"{API}/auth/refresh", timeout=10)
        assert r.status_code == 401, f"expected 401 with no refresh_token, got {r.status_code}"
        r2 = s.get(f"{API}/auth/me", timeout=10)
        assert r2.status_code == 401


# ---------------------------------------------------------------------------
# Auto-call on new lead creation
# ---------------------------------------------------------------------------
class TestAutoCallOnLeadCreate:
    def test_lead_created_even_when_autocall_fails(self, admin_sess, admin_user, priya_user):
        # Enable auto_call_on_new_lead
        r = admin_sess.patch(f"{API}/settings", json={"auto_call_on_new_lead": True}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("auto_call_on_new_lead") is True

        # Force priya's phone to an unverified number so Twilio rejects it
        _set_admin_phone(admin_sess, priya_user, PLACEHOLDER_UNVERIFIED)

        # Also ensure admin's own phone is restored to something safe (not empty)
        # so unrelated background jobs don't break — we set it in a later test.
        try:
            payload = {
                "name": f"TEST_autocall_{uuid.uuid4().hex[:6]}",
                "phone": "+919611111111",  # lead phone — E.164 valid
                "source": "manual",
                "assigned_to": priya_user["id"],
            }
            r = admin_sess.post(f"{API}/leads", json=payload, timeout=30)
            assert r.status_code == 200, (
                f"lead creation must succeed even when auto-call fails: "
                f"{r.status_code} {r.text}"
            )
            body = r.json()
            assert body["name"] == payload["name"]
            assert "id" in body

            # Verify persistence via GET
            r2 = admin_sess.get(f"{API}/leads/{body['id']}", timeout=10)
            assert r2.status_code == 200
            assert r2.json()["assigned_to"] == priya_user["id"]

            # Clean up
            admin_sess.delete(f"{API}/leads/{body['id']}", timeout=10)
        finally:
            # Disable auto-call & clear priya's phone
            admin_sess.patch(f"{API}/settings", json={"auto_call_on_new_lead": False}, timeout=10)
            admin_sess.patch(f"{API}/users/{priya_user['id']}", json={"phone": ""}, timeout=10)


# ---------------------------------------------------------------------------
# Regression: core endpoints still 200
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("path", [
    "/users",
    "/leads",
    "/projects",
    "/follow-ups",
    "/site-visits",
    "/twilio/status",
    "/notifications",
    "/admin/eod-summary",
    "/dashboard/monthly",
    "/dashboard/revenue-breakdown",
    "/settings",
    "/auth/me",
])
def test_regression_endpoints_200(admin_sess, path):
    r = admin_sess.get(f"{API}{path}", timeout=15)
    assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"
