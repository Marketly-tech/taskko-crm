"""
Iteration 10: Phase 5 - WhatsApp via Evolution API (not configured), webhook ingestion, masking,
executive scoping, message campaigns + iteration-9 fix verification.
"""
import os
import random
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
    s.me = s.get(f"{BASE}/auth/me").json()
    return s


@pytest.fixture(scope="module")
def admin():
    s = login("admin@tasko.com", "admin123")
    yield s
    s.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "twilio"})


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
def sky():
    return login("admin@skyline.com", "skyline123")


@pytest.fixture(scope="module")
def secret(admin):
    st = admin.get(f"{BASE}/whatsapp/status").json()
    return st["webhook_url"].split("secret=")[1]


@pytest.fixture(scope="module")
def leads(admin, priya, karan):
    """Two TEST leads: one owned by priya, one by karan."""
    out = {}
    for who, sess in (("priya", priya), ("karan", karan)):
        phone = "98" + "".join(random.choice("0123456789") for _ in range(8))
        r = admin.post(f"{BASE}/leads", json={"name": f"TEST_WA_{who}", "phone": phone, "assigned_to": sess.me["id"], "stage": "negotiation", "email": f"test_wa_{who}@example.com"})
        assert r.status_code == 200, r.text
        out[who] = {**r.json(), "phone": phone}
    yield out
    for v in out.values():
        admin.delete(f"{BASE}/leads/{v['id']}")


def hook(secret, phone, mid, text="hello", org="tasko", extra_msg=None, event="messages.upsert", from_me=False):
    body = {"event": event, "data": {"key": {"id": mid, "remoteJid": f"91{phone}@s.whatsapp.net", "fromMe": from_me}, "pushName": "Cust",
                                     "message": extra_msg or {"conversation": text}}}
    return requests.post(f"{BASE}/whatsapp/webhook/{org}", params={"secret": secret}, json=body)


# --- Status / settings / QR ---
class TestStatus:
    def test_admin_status(self, admin):
        d = admin.get(f"{BASE}/whatsapp/status").json()
        assert d["configured"] is False
        assert d["webhook_url"].startswith("https://") and "/api/whatsapp/webhook/tasko?secret=" in d["webhook_url"]

    def test_non_admin_status(self, manager, priya):
        for s in (manager, priya):
            d = s.get(f"{BASE}/whatsapp/status").json()
            assert d["webhook_url"] is None and d["configured"] is False

    def test_settings_manager_403(self, manager):
        assert manager.patch(f"{BASE}/whatsapp/settings", json={"evolution_instance_name": "x"}).status_code == 403

    def test_settings_admin_empty_patch(self, admin):
        r = admin.patch(f"{BASE}/whatsapp/settings", json={})
        assert r.status_code == 200 and r.json()["configured"] is False

    def test_qrcode_not_connected(self, admin):
        r = admin.get(f"{BASE}/whatsapp/qrcode")
        assert r.status_code == 400 and "not connected" in r.json()["detail"]

    def test_skyline_secret_different(self, admin, sky):
        a = admin.get(f"{BASE}/whatsapp/status").json()["webhook_url"]
        b = sky.get(f"{BASE}/whatsapp/status").json()["webhook_url"]
        assert "/webhook/skyline" in b or "/webhook/" in b
        assert a.split("secret=")[1] != b.split("secret=")[1]


# --- Webhook ingestion ---
class TestWebhook:
    def test_wrong_secret_401(self, leads):
        assert hook("bad", leads["priya"]["phone"], "x").status_code == 401

    def test_unknown_org_404(self, secret, leads):
        assert hook(secret, leads["priya"]["phone"], "x", org="nope-org").status_code == 404

    def test_invalid_json_400(self, secret):
        r = requests.post(f"{BASE}/whatsapp/webhook/tasko", params={"secret": secret}, data="{bad", headers={"Content-Type": "application/json"})
        assert r.status_code == 400

    def test_list_payload_no_500(self, secret):
        r = requests.post(f"{BASE}/whatsapp/webhook/tasko", params={"secret": secret}, json=[1, 2])
        assert r.status_code < 500, f"list payload -> {r.status_code}"

    def test_connection_update_ignored(self, admin, secret, leads):
        mid = "TEST_CONN_" + uuid.uuid4().hex[:6]
        assert hook(secret, leads["priya"]["phone"], mid, event="connection.update").status_code == 200
        msgs = admin.get(f"{BASE}/leads/{leads['priya']['id']}/whatsapp").json()["messages"]
        assert not any(m["message_id"] == mid for m in msgs)

    def test_store_dedupe_conversation_notification(self, admin, priya, secret, leads):
        L = leads["priya"]
        mid = "TEST_" + uuid.uuid4().hex[:8]
        assert hook(secret, L["phone"], mid, "hello").status_code == 200
        assert hook(secret, L["phone"], mid, "hello").status_code == 200
        msgs = admin.get(f"{BASE}/leads/{L['id']}/whatsapp").json()["messages"]
        mine = [m for m in msgs if m["message_id"] == mid]
        assert len(mine) == 1 and mine[0]["text"] == "hello" and mine[0]["lead_id"] == L["id"]
        assert mine[0]["number"] == f"91{L['phone']}" and mine[0]["remote_jid"] == f"91{L['phone']}@s.whatsapp.net"
        # conversations
        hook(secret, L["phone"], mid + "b", "second")
        convs = admin.get(f"{BASE}/whatsapp/conversations").json()
        c = next(c for c in convs if c.get("lead_id") == L["id"])
        assert c["lead_name"] == L["name"] and c["last_text"] == "second" and c["unread"] >= 1 and c["id"]
        # notification for owner
        notes = priya.get(f"{BASE}/notifications").json()
        items = notes if isinstance(notes, list) else notes.get("items") or notes.get("notifications") or []
        assert any(n.get("title") == "New WhatsApp message" and L["name"] in (n.get("message") or "") for n in items)

    def test_image_message(self, admin, secret, leads):
        L = leads["priya"]
        mid = "TEST_IMG_" + uuid.uuid4().hex[:6]
        hook(secret, L["phone"], mid, extra_msg={"imageMessage": {"caption": "pic cap", "url": "https://example.com/a.jpg"}})
        m = next(m for m in admin.get(f"{BASE}/leads/{L['id']}/whatsapp").json()["messages"] if m["message_id"] == mid)
        assert m["type"] == "image" and m["text"] == "pic cap"

    def test_skyline_isolation(self, admin, sky, leads):
        sky_secret = sky.get(f"{BASE}/whatsapp/status").json()["webhook_url"].split("secret=")[1]
        slug = sky.get(f"{BASE}/whatsapp/status").json()["webhook_url"].split("/webhook/")[1].split("?")[0]
        mid = "TEST_SKY_" + uuid.uuid4().hex[:6]
        assert hook(sky_secret, leads["priya"]["phone"], mid, "sky msg", org=slug).status_code == 200
        # tasko secret on skyline -> 401
        tasko_secret = admin.get(f"{BASE}/whatsapp/status").json()["webhook_url"].split("secret=")[1]
        assert hook(tasko_secret, leads["priya"]["phone"], "y", org=slug).status_code == 401
        msgs = admin.get(f"{BASE}/leads/{leads['priya']['id']}/whatsapp").json()["messages"]
        assert not any(m["message_id"] == mid for m in msgs)
        sky_convs = sky.get(f"{BASE}/whatsapp/conversations").json()
        assert any(c.get("last_text") == "sky msg" for c in sky_convs)
        assert all(c.get("lead_id") != leads["priya"]["id"] for c in sky_convs)


# --- Masking & executive scope ---
class TestMaskingScope:
    def test_manager_masked(self, manager, secret, leads):
        L = leads["karan"]
        hook(secret, L["phone"], "TEST_M_" + uuid.uuid4().hex[:6], "hi mgr")
        msgs = manager.get(f"{BASE}/leads/{L['id']}/whatsapp").json()["messages"]
        assert msgs and all("remote_jid" not in m and "X" in m["number"] and m["number"].endswith(L["phone"][-2:]) for m in msgs)
        convs = manager.get(f"{BASE}/whatsapp/conversations").json()
        assert convs and all("remote_jid" not in c and (not c.get("number") or "X" in c["number"]) for c in convs)

    def test_admin_full(self, admin):
        convs = admin.get(f"{BASE}/whatsapp/conversations").json()
        assert any("remote_jid" in c and "X" not in c["number"] for c in convs)

    def test_exec_scope(self, admin, priya, karan, secret, leads):
        hook(secret, leads["karan"]["phone"], "TEST_K_" + uuid.uuid4().hex[:6], "for karan")
        hook(secret, leads["priya"]["phone"], "TEST_P_" + uuid.uuid4().hex[:6], "for priya")
        pc = priya.get(f"{BASE}/whatsapp/conversations").json()
        assert any(c["lead_id"] == leads["priya"]["id"] for c in pc)
        assert not any(c["lead_id"] == leads["karan"]["id"] for c in pc)
        assert all("remote_jid" not in c and "X" in c["number"] for c in pc)
        kchat = next(c for c in admin.get(f"{BASE}/whatsapp/conversations").json() if c.get("lead_id") == leads["karan"]["id"])
        assert priya.get(f"{BASE}/whatsapp/conversations/{kchat['id']}/messages").status_code == 403
        assert priya.post(f"{BASE}/whatsapp/conversations/{kchat['id']}/messages", json={"text": "x"}).status_code == 403
        assert priya.get(f"{BASE}/leads/{leads['karan']['id']}/whatsapp").status_code == 403
        r = karan.get(f"{BASE}/whatsapp/conversations/{kchat['id']}/messages")
        assert r.status_code == 200 and all("remote_jid" not in m for m in r.json())

    def test_unknown_chat_404(self, admin):
        assert admin.get(f"{BASE}/whatsapp/conversations/nope/messages").status_code == 404

    def test_search(self, admin, leads):
        r = admin.get(f"{BASE}/whatsapp/conversations", params={"search": "TEST_WA_pri"}).json()
        assert r and all("TEST_WA_pri" in c["lead_name"] for c in r)


# --- Sending (not connected) ---
class TestSend:
    def test_lead_send_not_connected(self, admin, leads):
        r = admin.post(f"{BASE}/leads/{leads['priya']['id']}/whatsapp/messages", json={"text": "hi"})
        assert r.status_code == 400 and "not connected" in r.json()["detail"]

    def test_lead_send_empty(self, admin, leads):
        r = admin.post(f"{BASE}/leads/{leads['priya']['id']}/whatsapp/messages", json={})
        assert r.status_code == 400

    def test_chat_send_not_connected(self, admin, leads):
        c = next(c for c in admin.get(f"{BASE}/whatsapp/conversations").json() if c.get("lead_id") == leads["priya"]["id"])
        r = admin.post(f"{BASE}/whatsapp/conversations/{c['id']}/messages", json={"text": "hi"})
        assert r.status_code == 400 and "not connected" in r.json()["detail"]

    def test_sync_not_connected(self, admin, priya, leads):
        r = admin.post(f"{BASE}/leads/{leads['priya']['id']}/whatsapp/sync")
        assert r.status_code == 400 and "not connected" in r.json()["detail"]
        assert admin.post(f"{BASE}/whatsapp/sync").status_code == 400
        assert priya.post(f"{BASE}/whatsapp/sync").status_code == 403


# --- Message campaigns ---
class TestMessageCampaigns:
    def test_list_roles(self, admin, manager, priya):
        assert admin.get(f"{BASE}/message-campaigns").status_code == 200
        assert manager.get(f"{BASE}/message-campaigns").status_code == 200
        assert priya.get(f"{BASE}/message-campaigns").status_code == 403
        assert priya.post(f"{BASE}/message-campaigns", json={"name": "x", "channel": "email", "message": "m", "stage": "new"}).status_code == 403

    def test_whatsapp_not_connected(self, admin):
        r = admin.post(f"{BASE}/message-campaigns", json={"name": "TEST_MC_wa", "channel": "whatsapp", "message": "Hi {name}", "stage": "negotiation"})
        assert r.status_code == 400 and "Connect WhatsApp" in r.json()["detail"]

    def test_missing_target(self, admin):
        r = admin.post(f"{BASE}/message-campaigns", json={"name": "TEST_MC", "channel": "email", "message": "Hi"})
        assert r.status_code == 400

    def test_bad_channel_422(self, admin):
        r = admin.post(f"{BASE}/message-campaigns", json={"name": "TEST_MC", "channel": "sms", "message": "Hi", "stage": "new"})
        assert r.status_code == 422

    def test_email_campaign(self, manager, admin, leads):
        r = manager.post(f"{BASE}/message-campaigns", json={"name": "TEST_MC_email", "channel": "email", "message": "Hi {name}", "subject": "Hello",
                                                           "lead_ids": [leads["priya"]["id"], leads["karan"]["id"]]}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 2 and d["status"] == "running" and d["channel"] == "email"
        import time
        for _ in range(20):
            c = next(c for c in admin.get(f"{BASE}/message-campaigns").json() if c["id"] == d["id"])
            if c["status"] == "completed":
                break
            time.sleep(1)
        assert c["status"] == "completed" and c["sent"] + c["failed"] + c["skipped"] == 2


# --- Iteration-9 fixes ---
class TestIter9Fixes:
    def test_campaign_start_blocked_twilio(self, admin):
        admin.patch(f"{BASE}/callerdesk/settings", json={"calling_provider": "twilio"})
        camps = admin.get(f"{BASE}/callerdesk/campaigns").json()
        items = camps if isinstance(camps, list) else camps.get("items") or camps.get("campaigns") or []
        cid = items[0]["id"] if items else "nope"
        r = admin.post(f"{BASE}/callerdesk/campaigns/{cid}/start")
        assert r.status_code == 400 and "CallerDesk" in r.json()["detail"]

    def test_cd_webhook_invalid_json(self):
        r = requests.post(f"{BASE}/callerdesk/webhook", params={"org": "tasko"}, data="{bad", headers={"Content-Type": "application/json"})
        assert r.status_code == 400

    def test_cd_webhook_bad_duration(self, admin):
        sid = "TEST_DUR_" + uuid.uuid4().hex[:6]
        r = requests.post(f"{BASE}/callerdesk/webhook", params={"org": "tasko"}, json={"sid_id": sid, "caller_num": "9000011111", "callstatus": "ANSWER", "talk_duration": "abc"})
        assert r.status_code == 200, r.text
        logs = admin.get(f"{BASE}/callerdesk/call-logs").json()
        items = logs if isinstance(logs, list) else logs.get("items") or logs.get("calls") or []
        row = next((x for x in items if x.get("call_sid") == sid), None)
        if row:
            assert row.get("duration", 0) == 0
