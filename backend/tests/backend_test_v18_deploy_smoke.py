# Deployment-readiness smoke: admin login + core GET endpoints
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@tasko.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    assert "access_token" in s.cookies.get_dict()
    return s


def test_login_returns_user(admin):
    r = admin.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    assert r.json().get("email") == "admin@tasko.com"


def test_bad_login_401():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "nobody_smoke@tasko.com", "password": "x"})
    assert r.status_code in (400, 401)


@pytest.mark.parametrize("path", ["/api/leads", "/api/dashboard/monthly", "/api/lead-sources", "/api/whatsapp/status"])
def test_core_endpoints_200(admin, path):
    r = admin.get(f"{BASE_URL}{path}")
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
    assert r.json() is not None


def test_unauth_leads_401():
    r = requests.get(f"{BASE_URL}/api/leads")
    assert r.status_code == 401
