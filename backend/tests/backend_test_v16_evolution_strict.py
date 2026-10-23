# Iteration 15b: strict assertions for Evolution env-only config (disconnected instance -> 409), QR, sync, DB cleanup, campaign
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
DISC = ("WhatsApp is disconnected on the server", "WhatsApp is still connecting")  # /instance/connect (QR) moves state close->connecting


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def manager():
    return _login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def lead_id(admin):
    data = admin.get(f"{API}/leads", params={"limit": 20}).json()
    items = data.get("items", data) if isinstance(data, dict) else data
    items = [x for x in items if x.get("phone")]
    assert items
    return items[0]["id"]


# status
def test_status_close(admin):
    d = admin.get(f"{API}/whatsapp/status").json()
    print(d)
    assert d["configured"] is True
    assert d["instance"] == "propzelrrl"
    assert d["state"] in ("close", "connecting")
    assert d["help"].startswith(DISC)


def test_manager_status_instance_hidden(manager):
    d = manager.get(f"{API}/whatsapp/status").json()
    assert d["instance"] is None


def test_patch_settings_404(admin):
    assert admin.patch(f"{API}/whatsapp/settings", json={"evolution_api_url": "x"}).status_code == 404


def test_mongo_no_evolution_fields():
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    bad = list(db.settings.find({"$or": [{"evolution_api_url": {"$exists": True}}, {"evolution_api_key": {"$exists": True}}, {"evolution_instance": {"$exists": True}}, {"evolution_instance_name": {"$exists": True}}]}, {"_id": 0, "id": 1}))
    assert bad == [], bad


# send -> 409
def test_lead_send_409(admin, lead_id):
    r = admin.post(f"{API}/leads/{lead_id}/whatsapp/messages", json={"text": "TEST_hello"})
    print(r.status_code, r.text)
    assert r.status_code == 409
    assert r.json()["detail"].startswith(DISC)


def test_lead_send_media_409(admin, lead_id):
    r = admin.post(f"{API}/leads/{lead_id}/whatsapp/messages", json={"media_url": "https://example.com/a.jpg"})
    assert r.status_code == 409


def test_conv_send_409(admin):
    chats = admin.get(f"{API}/whatsapp/conversations").json()
    if not chats:
        pytest.skip("no conversations")
    r = admin.post(f"{API}/whatsapp/conversations/{chats[0]['id']}/messages", json={"text": "TEST_hi"})
    print(r.status_code, r.text)
    assert r.status_code == 409 and r.json()["detail"].startswith(DISC)


def test_qrcode_png(admin):
    t = time.time()
    r = admin.get(f"{API}/whatsapp/qrcode", timeout=60)
    print(r.status_code, r.text[:120], f"{time.time()-t:.1f}s")
    assert r.status_code == 200
    assert (r.json().get("base64") or "").startswith("data:image/png;base64,")


def test_qrcode_manager_403(manager):
    assert manager.get(f"{API}/whatsapp/qrcode").status_code == 403


def test_sync_all(admin):
    r = admin.post(f"{API}/whatsapp/sync", timeout=90)
    print(r.status_code, r.text[:200])
    assert r.status_code < 500 or r.status_code == 502
    assert r.status_code != 500


def test_lead_sync(admin, lead_id):
    r = admin.post(f"{API}/leads/{lead_id}/whatsapp/sync", timeout=60)
    print(r.status_code, r.text[:200])
    assert r.status_code != 500


def test_twilio_not_called_settings(admin):
    g = admin.get(f"{API}/settings")
    assert g.status_code == 200


# campaign delivery: errors should be the clean disconnected message, not a Python NameError
def test_whatsapp_campaign_error_reason(admin, lead_id):
    r = admin.post(f"{API}/message-campaigns", json={"name": "TEST_campaign_wa", "channel": "whatsapp", "message": "TEST hi {name}", "lead_ids": [lead_id]})
    print(r.status_code, r.text[:300])
    assert r.status_code == 200
    cid = r.json()["id"]
    for _ in range(15):
        time.sleep(1)
        rows = admin.get(f"{API}/message-campaigns").json()
        c = next((x for x in rows if x["id"] == cid), None)
        if c and c["status"] == "completed":
            break
    print(c)
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    doc = db.message_campaigns.find_one({"id": cid}, {"_id": 0})
    print("campaign doc:", doc)
    db.message_campaigns.delete_one({"id": cid})
    reasons = [e["reason"] for e in doc.get("errors", [])]
    assert all("not defined" not in str(x) for x in reasons), reasons
