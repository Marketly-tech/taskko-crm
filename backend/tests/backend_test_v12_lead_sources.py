# Iteration 12: Lead Sources (admin CRUD, universal ingest, duplicates, round-robin, Google Ads, Meta, org isolation, SSE)
import os
import random
import threading
import time
import json
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
def manager():
    return _login("manager@tasko.com", "manager123")


@pytest.fixture(scope="module")
def exe():
    return _login("priya@tasko.com", "executive123")


@pytest.fixture(scope="module")
def admin2():
    return _login("admin@skyline.com", "skyline123")


CREATED = []


@pytest.fixture(scope="module")
def src(admin):
    r = admin.post(f"{API}/lead-sources", json={"name": "TEST_API src", "type": "api"})
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED.append(d["id"])
    return d


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for sid in CREATED:
        admin.delete(f"{API}/lead-sources/{sid}")


def _key(admin, sid):
    items = admin.get(f"{API}/lead-sources").json()["items"]
    return next(s for s in items if s["id"] == sid)


# ---- Admin CRUD + RBAC
class TestAdminCrud:
    def test_create_and_list(self, admin, src):
        assert src["key"].startswith("pz_") and src["verify_token"] and src["active"] is True
        assert "meta_page_token" not in src
        r = admin.get(f"{API}/lead-sources")
        assert r.status_code == 200
        assert any(s["id"] == src["id"] for s in r.json()["items"])
        assert "api" in r.json()["types"]

    def test_create_invalid_type(self, admin):
        r = admin.post(f"{API}/lead-sources", json={"name": "x", "type": "bogus"})
        assert r.status_code == 422

    def test_create_blank_name(self, admin):
        r = admin.post(f"{API}/lead-sources", json={"name": "  ", "type": "api"})
        assert r.status_code == 400

    def test_patch_name(self, admin, src):
        r = admin.patch(f"{API}/lead-sources/{src['id']}", json={"name": "TEST_API src renamed"})
        assert r.status_code == 200 and r.json()["name"] == "TEST_API src renamed"
        assert _key(admin, src["id"])["name"] == "TEST_API src renamed"

    def test_executive_forbidden(self, exe, src):
        assert exe.get(f"{API}/lead-sources").status_code == 403
        assert exe.post(f"{API}/lead-sources", json={"name": "x", "type": "api"}).status_code == 403
        assert exe.patch(f"{API}/lead-sources/{src['id']}", json={"name": "x"}).status_code == 403
        assert exe.post(f"{API}/lead-sources/{src['id']}/test").status_code == 403
        assert exe.get(f"{API}/lead-sources/{src['id']}/events").status_code == 403
        assert exe.post(f"{API}/lead-sources/{src['id']}/rotate-key").status_code == 403
        assert exe.delete(f"{API}/lead-sources/{src['id']}").status_code == 403

    def test_manager_list_ok_delete_403(self, manager, src):
        assert manager.get(f"{API}/lead-sources").status_code == 200
        assert manager.delete(f"{API}/lead-sources/{src['id']}").status_code == 403

    def test_404(self, admin):
        assert admin.patch(f"{API}/lead-sources/nope", json={"name": "x"}).status_code == 404

    def test_old_webhook_removed(self):
        r = requests.post(f"{API}/webhooks/leads/website", json={"name": "x", "phone": rphone()})
        assert r.status_code in (404, 405), r.status_code


# ---- Public ingest: auth methods + content types
class TestIngest:
    def _check_created(self, r):
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "success" and d["lead_id"]
        return d["lead_id"]

    def test_x_api_key_json_paramantra(self, admin, src):
        ph = rphone()
        r = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]},
                          json={"f_name": "TEST_Ravi", "l_name": "Kumar", "phonefax": ph, "email": "r@x.com",
                                "subject": "Camp A", "notes": "wants 2bhk", "channel_id": "agency"})
        lid = self._check_created(r)
        lead = admin.get(f"{API}/leads/{lid}").json()
        assert lead["name"] == "TEST_Ravi Kumar"
        assert lead["phone"].endswith(ph)
        assert "Camp A" in lead["notes"] and "wants 2bhk" in lead["notes"]
        assert lead["source"] == "api" and lead["source_id"] == src["id"]

    def test_basic_auth_form(self, src):
        r = requests.post(f"{API}/v1/leads", auth=(src["key"], src["key"]),
                          data={"f_name": "TEST_Basic", "phonefax": rphone()})
        self._check_created(r)

    def test_bearer_multipart(self, src):
        r = requests.post(f"{API}/v1/leads", headers={"Authorization": f"Bearer {src['key']}"},
                          files={"name": (None, "TEST_Multi"), "mobile": (None, rphone())})
        self._check_created(r)

    def test_query_key_xml(self, src):
        xml = f"<lead><name>TEST_Xml</name><phone>{rphone()}</phone></lead>"
        r = requests.post(f"{API}/v1/leads?key={src['key']}", data=xml, headers={"Content-Type": "application/xml"})
        self._check_created(r)

    def test_path_key_get_query(self, src):
        r = requests.get(f"{API}/v1/leads/{src['key']}", params={"name": "TEST_Get", "phone": rphone()})
        self._check_created(r)

    def test_missing_phone_400(self, src):
        r = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_nophone"})
        assert r.status_code == 400

    def test_bad_key_401(self):
        r = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": "pz_bad"}, json={"name": "x", "phone": rphone()})
        assert r.status_code == 401
        assert requests.post(f"{API}/v1/leads", json={"phone": rphone()}).status_code == 401

    def test_paused_403(self, admin, src):
        admin.patch(f"{API}/lead-sources/{src['id']}", json={"active": False})
        try:
            r = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "x", "phone": rphone()})
            assert r.status_code == 403
        finally:
            assert admin.patch(f"{API}/lead-sources/{src['id']}", json={"active": True}).json()["active"] is True


# ---- Duplicates
class TestDuplicate:
    def test_duplicate_merge(self, admin, src):
        ph = rphone()
        r1 = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_Dup", "phone": ph})
        assert r1.status_code == 201
        lid = r1.json()["lead_id"]
        fmt = f"+91-{ph[:5]} {ph[5:]}"
        r2 = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_Dup2", "phone": fmt, "notes": "again"})
        assert r2.status_code == 200 and r2.json()["status"] == "duplicate" and r2.json()["lead_id"] == lid
        r3 = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "x", "mobile": "0" + ph})
        assert r3.status_code == 200 and r3.json()["lead_id"] == lid
        lead = admin.get(f"{API}/leads/{lid}").json()
        assert lead["enquiry_count"] == 3
        acts = admin.get(f"{API}/activities", params={"lead_id": lid}).json()
        assert sum(1 for a in acts if a.get("kind") == "repeat_enquiry" or a.get("type") == "repeat_enquiry") == 2, acts[:3]


# ---- Round-robin + rep_id
class TestRoundRobin:
    def test_rotation(self, admin, src):
        users = admin.get(f"{API}/users").json()
        execs = [u for u in users if u["role"] == "executive" and u.get("active", True)][:2]
        assert len(execs) == 2
        ids = [u["id"] for u in execs]
        r = admin.patch(f"{API}/lead-sources/{src['id']}", json={"executive_ids": ids})
        assert r.json()["executive_ids"] == ids
        got = []
        for _ in range(4):
            lid = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_RR", "phone": rphone()}).json()["lead_id"]
            got.append(admin.get(f"{API}/leads/{lid}").json()["assigned_to"])
        assert set(got) == set(ids) and got[0] != got[1] and got[0] == got[2] and got[1] == got[3], got

    def test_rep_id_override(self, admin, src):
        users = admin.get(f"{API}/users").json()
        neha = next(u for u in users if u["email"] == "neha@tasko.com")
        lid = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]},
                            json={"name": "TEST_Rep", "phone": rphone(), "rep_id": "neha@tasko.com"}).json()["lead_id"]
        assert admin.get(f"{API}/leads/{lid}").json()["assigned_to"] == neha["id"]


# ---- Google Ads
class TestGoogleAds:
    def test_google(self, admin):
        s = admin.post(f"{API}/lead-sources", json={"name": "TEST_Google", "type": "google_ads"}).json()
        CREATED.append(s["id"])
        ph = rphone()
        payload = {"google_key": s["key"], "is_test": True, "lead_id": "abc",
                   "user_column_data": [{"column_id": "FULL_NAME", "string_value": "TEST_Goog"},
                                        {"column_id": "PHONE_NUMBER", "string_value": "+91" + ph}]}
        r = requests.post(f"{API}/v1/google-ads/{s['key']}", json=payload)
        assert r.status_code == 200 and r.json() == {}
        ev = admin.get(f"{API}/lead-sources/{s['id']}/events").json()["items"]
        assert ev and ev[0]["status"] == "created"
        lead = admin.get(f"{API}/leads/{ev[0]['lead_id']}").json()
        assert lead["name"] == "TEST_Goog" and lead["source"] == "google_ads"
        bad = requests.post(f"{API}/v1/google-ads/{s['key']}", json={**payload, "google_key": "wrong"})
        assert bad.status_code == 401


# ---- Meta
class TestMeta:
    def test_meta_verify_and_webhook(self, admin):
        s = admin.post(f"{API}/lead-sources", json={"name": "TEST_FB", "type": "facebook"}).json()
        CREATED.append(s["id"])
        ok = requests.get(f"{API}/v1/meta/{s['key']}", params={"hub.mode": "subscribe", "hub.verify_token": s["verify_token"], "hub.challenge": "CH123"})
        assert ok.status_code == 200 and ok.text == "CH123"
        bad = requests.get(f"{API}/v1/meta/{s['key']}", params={"hub.mode": "subscribe", "hub.verify_token": "no", "hub.challenge": "CH"})
        assert bad.status_code == 403
        wh = requests.post(f"{API}/v1/meta/{s['key']}", json={"object": "page", "entry": [{"changes": [{"field": "leadgen", "value": {"leadgen_id": "1", "page_id": "2"}}]}]})
        assert wh.status_code == 200
        ev = admin.get(f"{API}/lead-sources/{s['id']}/events").json()["items"]
        assert ev and ev[0]["status"] == "error"


# ---- test endpoint, events, rotate key
class TestOps:
    def test_test_lead_and_events(self, admin, src):
        r = admin.post(f"{API}/lead-sources/{src['id']}/test")
        assert r.status_code == 200 and r.json()["http_status"] == 201
        ev = admin.get(f"{API}/lead-sources/{src['id']}/events").json()["items"]
        assert ev[0]["lead_id"] == r.json()["lead_id"] and "latency_ms" in ev[0]
        cnt = _key(admin, src["id"])
        assert cnt["lead_count"] >= 1 and cnt["today_count"] >= 1

    def test_rotate_key(self, admin):
        s = admin.post(f"{API}/lead-sources", json={"name": "TEST_Rot", "type": "website"}).json()
        CREATED.append(s["id"])
        n = admin.post(f"{API}/lead-sources/{s['id']}/rotate-key").json()
        assert n["key"] != s["key"]
        assert requests.post(f"{API}/v1/leads/{s['key']}", json={"phone": rphone()}).status_code == 401
        assert requests.post(f"{API}/v1/leads/{n['key']}", json={"name": "TEST_rot", "phone": rphone()}).status_code == 201

    def test_delete(self, admin):
        s = admin.post(f"{API}/lead-sources", json={"name": "TEST_Del", "type": "99acres"}).json()
        assert admin.delete(f"{API}/lead-sources/{s['id']}").status_code == 200
        assert not any(x["id"] == s["id"] for x in admin.get(f"{API}/lead-sources").json()["items"])
        assert requests.post(f"{API}/v1/leads/{s['key']}", json={"phone": rphone()}).status_code == 401


# ---- Org isolation
class TestIsolation:
    def test_org_isolation(self, admin, admin2, src):
        lid = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_Iso", "phone": rphone()}).json()["lead_id"]
        assert admin.get(f"{API}/leads/{lid}").status_code == 200
        assert admin2.get(f"{API}/leads/{lid}").status_code == 404
        assert not any(s["id"] == src["id"] for s in admin2.get(f"{API}/lead-sources").json()["items"])


# ---- SSE live stream
def _listen(session, out, stop_after=8):
    t0 = time.time()
    try:
        with session.get(f"{API}/live/stream", stream=True, timeout=stop_after) as r:
            out["status"] = r.status_code
            ev = None
            for line in r.iter_lines(decode_unicode=True):
                if line and line.startswith("event:"):
                    ev = line.split(":", 1)[1].strip()
                elif line and line.startswith("data:") and ev == "lead":
                    out.setdefault("events", []).append((time.time(), json.loads(line[5:])))
                if time.time() - t0 > stop_after:
                    break
    except Exception as e:  # noqa: BLE001
        out["err"] = str(e)


class TestSSE:
    def test_sse_admin_and_exec(self, admin, exe, src):
        users = admin.get(f"{API}/users").json()
        priya = next(u for u in users if u["email"] == "priya@tasko.com")
        a_out, e_out = {}, {}
        ta = threading.Thread(target=_listen, args=(admin, a_out)); te = threading.Thread(target=_listen, args=(exe, e_out))
        ta.start(); te.start()
        time.sleep(2.5)
        ph1, ph2 = rphone(), rphone()
        t_send = time.time()
        l1 = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_SSE_priya", "phone": ph1, "rep_id": "priya@tasko.com"}).json()["lead_id"]
        l2 = requests.post(f"{API}/v1/leads", headers={"X-API-KEY": src["key"]}, json={"name": "TEST_SSE_neha", "phone": ph2, "rep_id": "neha@tasko.com"}).json()["lead_id"]
        ta.join(); te.join()
        assert a_out.get("status") == 200, a_out
        a_ids = {d["lead_id"]: (ts, d) for ts, d in a_out.get("events", [])}
        e_ids = {d["lead_id"]: d for _, d in e_out.get("events", [])}
        assert l1 in a_ids and l2 in a_ids, a_out
        latency = a_ids[l1][0] - t_send
        print(f"SSE latency admin: {latency:.2f}s")
        assert latency < 2.0
        assert l1 in e_ids and l2 not in e_ids, e_out
        assert ph1 not in (e_ids[l1]["lead"]["phone"] or ""), "executive phone not masked"
        assert e_ids[l1]["lead"]["assigned_to"] == priya["id"]
