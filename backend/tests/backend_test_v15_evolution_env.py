# Iteration 15: Evolution API env-only config, clean error handling, Twilio removed from settings
import os
import sys
import asyncio
import pytest
import requests
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


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
def exec_s():
    return _login("priya@tasko.com", "executive123")


# --- settings endpoint removal
class TestSettingsRemoved:
    def test_patch_wa_settings_gone(self, admin):
        r = admin.patch(f"{API}/whatsapp/settings", json={"evolution_api_url": "http://x"})
        assert r.status_code in (404, 405)

    def test_get_wa_settings_gone(self, admin):
        r = admin.get(f"{API}/whatsapp/settings")
        assert r.status_code in (404, 405)

    def test_generic_settings_ignores_evolution_fields(self, admin):
        r = admin.patch(f"{API}/settings", json={"evolution_api_url": "http://evil", "evolution_api_key": "k"})
        assert r.status_code == 200
        g = admin.get(f"{API}/settings").json()
        assert "evolution_api_url" not in g and "evolution_api_key" not in g


# --- status endpoint
class TestStatus:
    def test_admin_status(self, admin):
        r = admin.get(f"{API}/whatsapp/status")
        assert r.status_code == 200
        d = r.json()
        assert d["configured"] is True
        assert isinstance(d["state"], str) and d["state"]
        assert d["instance"]
        assert "/api/whatsapp/webhook/tasko?secret=" in d["webhook_url"]
        if d["state"] != "open":
            assert d["help"]
        print("state:", d["state"])

    def test_exec_status_hides_admin_fields(self, exec_s):
        d = exec_s.get(f"{API}/whatsapp/status").json()
        assert d["instance"] is None and d["webhook_url"] is None

    def test_status_no_secrets_leaked(self, admin):
        txt = admin.get(f"{API}/whatsapp/status").text
        key = os.environ.get("EVOLUTION_API_KEY_CHECK", "")
        if key:
            assert key not in txt
        assert "apikey" not in txt.lower()


# --- sending / qr / sync never 500
class TestCleanErrors:
    @pytest.fixture(scope="class")
    def lead_id(self, admin):
        r = admin.get(f"{API}/leads", params={"limit": 5})
        data = r.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        items = [x for x in items if x.get("phone")]
        assert items
        return items[0]["id"]

    def test_lead_send(self, admin, lead_id):
        r = admin.post(f"{API}/leads/{lead_id}/whatsapp/messages", json={"text": "TEST_hello"})
        print(r.status_code, r.text[:200])
        assert r.status_code != 500
        if r.status_code >= 400:
            assert isinstance(r.json().get("detail"), str)

    def test_lead_send_empty_400(self, admin, lead_id):
        r = admin.post(f"{API}/leads/{lead_id}/whatsapp/messages", json={"text": "  "})
        assert r.status_code in (400, 409)

    def test_lead_sync(self, admin, lead_id):
        r = admin.post(f"{API}/leads/{lead_id}/whatsapp/sync")
        print(r.status_code, r.text[:200])
        assert r.status_code != 500
        if r.status_code >= 400:
            assert isinstance(r.json().get("detail"), str)

    def test_conversation_send(self, admin):
        chats = admin.get(f"{API}/whatsapp/conversations").json()
        if not chats:
            pytest.skip("no conversations")
        r = admin.post(f"{API}/whatsapp/conversations/{chats[0]['id']}/messages", json={"text": "TEST_hi"})
        print(r.status_code, r.text[:200])
        assert r.status_code != 500
        if r.status_code >= 400:
            assert isinstance(r.json().get("detail"), str)

    def test_qrcode(self, admin):
        r = admin.get(f"{API}/whatsapp/qrcode")
        print(r.status_code, r.text[:200])
        assert r.status_code != 500
        if r.status_code >= 400:
            assert isinstance(r.json().get("detail"), str)

    def test_qrcode_exec_forbidden(self, exec_s):
        assert exec_s.get(f"{API}/whatsapp/qrcode").status_code == 403

    def test_sync_all(self, admin):
        r = admin.post(f"{API}/whatsapp/sync")
        print(r.status_code, r.text[:200])
        assert r.status_code != 500
        if r.status_code >= 400:
            assert isinstance(r.json().get("detail"), str)


# --- unit: evo() maps upstream 500 Connection Closed -> 409
sys.path.insert(0, "/app/backend")


def _load_wa():
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    import routes.whatsapp as wa
    return wa


class _FakeClient:
    def __init__(self, resp=None, exc=None, *a, **k):
        self.resp, self.exc = resp, exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def request(self, *a, **k):
        if self.exc:
            raise self.exc
        return self.resp

    async def get(self, *a, **k):
        return self.resp


CFG = {"url": "http://evo.local", "key": "k", "instance": "i", "secret": "s"}


def _patch(monkeypatch, wa, resp=None, exc=None):
    monkeypatch.setattr(wa.httpx, "AsyncClient", lambda *a, **k: _FakeClient(resp, exc))


class TestEvoUnit:
    def test_connection_closed_409(self, monkeypatch):
        wa = _load_wa()
        req = httpx.Request("POST", "http://evo.local/x")
        _patch(monkeypatch, wa, httpx.Response(500, json={"response": {"message": "Connection Closed"}}, request=req))
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo(CFG, "POST", "/message/sendText", {}))
        assert e.value.status_code == 409
        assert "reconnect" in e.value.detail.lower()

    def test_generic_500_maps_502(self, monkeypatch):
        wa = _load_wa()
        req = httpx.Request("POST", "http://evo.local/x")
        _patch(monkeypatch, wa, httpx.Response(500, text="boom", request=req))
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo(CFG, "POST", "/x", {}))
        assert e.value.status_code == 502

    def test_unreachable_502(self, monkeypatch):
        wa = _load_wa()
        _patch(monkeypatch, wa, exc=httpx.ConnectError("x"))
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo(CFG, "GET", "/x"))
        assert e.value.status_code == 502

    def test_not_configured_503(self):
        wa = _load_wa()
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo({**CFG, "key": ""}, "GET", "/x"))
        assert e.value.status_code == 503

    def test_need_open_close_state_409(self, monkeypatch):
        wa = _load_wa()
        req = httpx.Request("GET", "http://evo.local/x")
        _patch(monkeypatch, wa, httpx.Response(200, json={"instance": {"state": "close"}}, request=req))
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo(CFG, "POST", "/message/sendText", {}, need_open=True))
        assert e.value.status_code == 409 and e.value.detail == wa.STATE_HELP["close"]

    def test_list_json_error_body_does_not_crash(self, monkeypatch):
        wa = _load_wa()
        req = httpx.Request("POST", "http://evo.local/x")
        _patch(monkeypatch, wa, httpx.Response(500, json=["oops"], request=req))
        with pytest.raises(wa.HTTPException) as e:
            asyncio.run(wa.evo(CFG, "POST", "/x", {}))
        assert e.value.status_code == 502
