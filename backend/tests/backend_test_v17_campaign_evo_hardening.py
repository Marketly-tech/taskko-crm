# v17: _evo_error/_state hardening (unit) + email campaign unaffected (API)
import os
import sys
import time
import asyncio
import httpx
import pytest
import requests

sys.path.insert(0, "/app/backend")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# --- unit: _evo_error / _state on non-dict bodies
def _resp(status, content, ctype="application/json"):
    return httpx.Response(status, content=content, headers={"content-type": ctype},
                          request=httpx.Request("GET", "http://x"))


@pytest.mark.parametrize("body", [b'["a","b"]', b'"str"', b'123', b'null', b'{"response": ["x"]}', b'{"response": {"message": ["m1","m2"]}}', b'not json'])
def test_evo_error_no_crash(body):
    from routes.whatsapp import _evo_error
    out = _evo_error(_resp(400, body))
    assert isinstance(out, str) and out


@pytest.mark.parametrize("body", [b'["a"]', b'"s"', b'null', b'{"instance": "x"}', b'garbage', b'{"instance": {"state": "open"}}'])
def test_state_no_crash(body, monkeypatch):
    import routes.whatsapp as w

    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return _resp(200, body)

    monkeypatch.setattr(w.httpx, "AsyncClient", FakeClient)
    s = asyncio.run(w._state({"url": "http://x", "instance": "i", "key": "k"}))
    assert s == ("open" if b"open" in body else "unknown")


# --- API: email campaign still works / never NameError
@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@tasko.com", "password": "admin123"})
    assert r.status_code == 200
    return s


def test_email_campaign_unaffected(admin):
    lead = "7c3b30fa-ef78-4aca-a467-c436e6095250"
    r = admin.post(f"{API}/message-campaigns", json={"name": "TEST_campaign_email", "channel": "email", "subject": "TEST", "message": "TEST hi {name}", "lead_ids": [lead]})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    c = None
    for _ in range(15):
        time.sleep(1)
        c = next((x for x in admin.get(f"{API}/message-campaigns").json() if x["id"] == cid), None)
        if c and c["status"] == "completed":
            break
    print(c)
    assert c and c["status"] == "completed"
    assert c["sent"] + c["failed"] + c["skipped"] == c["total"]
    assert all("not defined" not in str(e.get("reason")) for e in c.get("errors", []))
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].message_campaigns.delete_one({"id": cid})
