# CallerDesk recording on lead timeline (webhook) + Super Admin leaves no trace (activities/notifications/calls/audit)
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
REC = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
ORG1 = "622f9115-0ee1-4541-86ed-fa389e13199f"
KARAN = "2222859e-4504-4144-9ed7-7983fa3b68a7"
SA_ID = "8a2d8a11-ce89-42b1-a17c-3caebb9f29b9"

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]


def login(email, pw, org=None):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    if org:
        s.headers["X-Organization-Id"] = org
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@tasko.com", "admin123")


@pytest.fixture(scope="module")
def sa():
    return login("superadmin@tasko.com", "superadmin123", ORG1)


@pytest.fixture(scope="module")
def karan():
    return login("karan@tasko.com", "executive123")


def pid(s):
    r = s.get(f"{BASE_URL}/api/projects")
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    return items[0]["id"]


def rand_phone():
    return "+9197" + str(uuid.uuid4().int)[:8]


def mk_lead(s, name):
    r = s.post(f"{BASE_URL}/api/leads", json={"name": name, "phone": rand_phone(), "source": "manual", "project_id": pid(s), "assigned_to": KARAN})
    assert r.status_code in (200, 201), r.text
    return r.json()


def acts(s, lead_id):
    r = s.get(f"{BASE_URL}/api/activities", params={"lead_id": lead_id, "limit": 200})
    assert r.status_code == 200
    return r.json()


def notifs_for_lead(lead_id):
    return list(mdb.notifications.find({"meta.lead_id": lead_id}, {"_id": 0}))


# ---------------- Webhook recording ----------------
class TestWebhookRecording:
    def test_incoming_webhook_recording_and_merge(self, admin):
        lead = mk_lead(admin, "TEST_REC Lead")
        try:
            phone10 = mdb.leads.find_one({"id": lead["id"]})["phone"][-10:]
            sid = "TEST_sid_" + uuid.uuid4().hex[:10]
            p = {"SourceNumber": "0" + phone10, "DestinationNumber": "08069999999", "DialWhomNumber": "9606334692", "CallDuration": "45",
                 "Status": "ANSWER", "CallSid": sid, "CallRecordingUrl": REC, "Direction": "IVR", "TalkDuration": "32"}
            r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json=p)
            assert r.status_code == 200, r.text
            a = [x for x in acts(admin, lead["id"]) if (x.get("meta") or {}).get("call_sid") == sid]
            assert len(a) == 1, a
            assert a[0]["kind"] == "incoming_call"
            assert a[0]["meta"]["recording_url"] == REC
            assert a[0]["meta"]["status"] == "connected"
            assert a[0]["meta"]["duration_sec"] == 32
            # second webhook, no recording -> keep recording
            p2 = {k: v for k, v in p.items() if k != "CallRecordingUrl"}
            r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json=p2)
            assert r.status_code == 200
            a = [x for x in acts(admin, lead["id"]) if (x.get("meta") or {}).get("call_sid") == sid]
            assert len(a) == 1, f"duplicate activity: {len(a)}"
            assert a[0]["meta"]["recording_url"] == REC
            call = mdb.callerdesk_calls.find_one({"call_sid": sid})
            assert call["recording_url"] == REC
            # regression: assigned exec notified
            assert any(n.get("user_id") == KARAN for n in notifs_for_lead(lead["id"]))
            # call log visible
            logs = admin.get(f"{BASE_URL}/api/callerdesk/call-logs", params={"search": sid}).json()["items"]
            assert any(x["call_sid"] == sid for x in logs)
        finally:
            admin.delete(f"{BASE_URL}/api/leads/{lead['id']}")
            mdb.callerdesk_calls.delete_many({"call_sid": {"$regex": "^TEST_sid_"}})

    def test_existing_call_sid_updates_same_activity(self, admin):
        """Simulate an outgoing call with a known sid (as if keys were configured), then webhook updates it."""
        lead = mk_lead(admin, "TEST_REC Out")
        sid = "TEST_sid_out_" + uuid.uuid4().hex[:8]
        try:
            # admin-created pending call via API (no sid)
            r = admin.post(f"{BASE_URL}/api/leads/{lead['id']}/call")
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "pending_credentials" and r.json()["call_sid"] is None
            # seed a call + activity with known sid as initiate_callerdesk_call would
            now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
            mdb.callerdesk_calls.insert_one({"id": "TESTCALL" + sid, "organization_id": ORG1, "provider": "callerdesk", "call_sid": sid, "lead_id": lead["id"],
                                             "actor_id": "fc46ddd7-896d-4f25-a5e7-2ca6e1575c91", "direction": "outgoing", "status": "initiated", "created_at": now, "updated_at": now})
            mdb.activities.insert_one({"id": "TESTACT" + sid, "organization_id": ORG1, "lead_id": lead["id"], "kind": "outgoing_call", "message": "x",
                                       "meta": {"call_sid": sid, "status": "initiated", "direction": "outgoing"}, "created_at": now})
            p = {"CallSid": sid, "Status": "ANSWER", "TalkDuration": "20", "CallRecordingUrl": REC, "SourceNumber": "9876543210", "DestinationNumber": "9000000000"}
            r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json=p)
            assert r.status_code == 200
            a = [x for x in acts(admin, lead["id"]) if (x.get("meta") or {}).get("call_sid") == sid]
            assert len(a) == 1, a
            assert a[0]["id"] == "TESTACT" + sid
            assert a[0]["kind"] == "outgoing_call"
            assert a[0]["meta"]["recording_url"] == REC and a[0]["meta"]["duration_sec"] == 20
            # status-only webhook without status/duration should not wipe recording
            r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json={"CallSid": sid})
            a = [x for x in acts(admin, lead["id"]) if (x.get("meta") or {}).get("call_sid") == sid][0]
            assert a["meta"]["recording_url"] == REC
            print("after bare webhook status:", a["meta"].get("status"), "dur:", a["meta"].get("duration_sec"))
        finally:
            admin.delete(f"{BASE_URL}/api/leads/{lead['id']}")
            mdb.callerdesk_calls.delete_many({"call_sid": sid})


# ---------------- Super admin no-trace ----------------
class TestSuperAdminSilent:
    def test_sa_actions_leave_no_trace(self, sa, admin, karan):
        mdb.users.update_one({"id": SA_ID}, {"$set": {"phone": "+919111111111"}})
        before_report = admin.get(f"{BASE_URL}/api/dashboard/call-report").json()
        before_dash = admin.get(f"{BASE_URL}/api/callerdesk/dashboard").json()
        notif_before = mdb.notifications.count_documents({"user_id": KARAN})
        sa_acts_before = mdb.activities.count_documents({"actor_id": SA_ID})
        lead = mk_lead(sa, "TEST_SA Lead")
        lid = lead["id"]
        try:
            assert mdb.leads.find_one({"id": lid})["organization_id"] == ORG1
            assert sa.post(f"{BASE_URL}/api/leads/{lid}/stage", json={"stage": "contacted", "note": "sa"}).status_code == 200
            assert sa.post(f"{BASE_URL}/api/leads/{lid}/notes", json={"text": "TEST_SA note"}).status_code == 200
            assert sa.post(f"{BASE_URL}/api/follow-ups", json={"lead_id": lid, "due_at": "2026-12-01T10:00:00Z"}).status_code in (200, 201)
            assert sa.post(f"{BASE_URL}/api/site-visits", json={"lead_id": lid, "project_id": pid(sa), "scheduled_at": "2026-12-02T10:00:00Z"}).status_code in (200, 201)
            assert sa.patch(f"{BASE_URL}/api/leads/{lid}", json={"stage": "qualified"}).status_code == 200
            assert sa.post(f"{BASE_URL}/api/leads/{lid}/log-call", json={"duration_sec": 10}).status_code == 200
            rc = sa.post(f"{BASE_URL}/api/leads/{lid}/call")
            assert rc.status_code == 200, rc.text
            a = acts(admin, lid)
            assert a == [], f"super admin left activities: {[x['kind'] for x in a]}"
            assert mdb.activities.count_documents({"lead_id": lid}) == 0
            assert mdb.activities.count_documents({"actor_id": SA_ID}) == sa_acts_before
            assert notifs_for_lead(lid) == [], notifs_for_lead(lid)
            assert mdb.notifications.count_documents({"user_id": KARAN}) == notif_before
            logs = admin.get(f"{BASE_URL}/api/callerdesk/call-logs").json()["items"]
            assert not any(x.get("lead_id") == lid for x in logs)
            dash = admin.get(f"{BASE_URL}/api/callerdesk/dashboard").json()
            assert dash["total_calls"] == before_dash["total_calls"]
            assert not any(x.get("lead_id") == lid for x in dash["recent"])
            after_report = admin.get(f"{BASE_URL}/api/dashboard/call-report").json()
            for k in ("outgoing_calls", "answered", "missed", "unique_contacts", "incoming"):
                assert after_report[k] == before_report[k], k
            # karan can still see the lead
            assert karan.get(f"{BASE_URL}/api/leads/{lid}").status_code == 200
        finally:
            mdb.users.update_one({"id": SA_ID}, {"$set": {"phone": ""}})
            admin.delete(f"{BASE_URL}/api/leads/{lid}")
            mdb.callerdesk_calls.delete_many({"lead_id": lid})

    def test_sa_call_then_webhook_stays_untracked(self, sa, admin):
        lead = mk_lead(admin, "TEST_SA Hook")
        lid = lead["id"]
        sid = "TEST_sid_sa_" + uuid.uuid4().hex[:8]
        try:
            n0 = len(acts(admin, lid))
            now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
            mdb.callerdesk_calls.insert_one({"id": "TESTSA" + sid, "organization_id": ORG1, "call_sid": sid, "lead_id": lid, "actor_id": SA_ID,
                                             "direction": "outgoing", "status": "initiated", "untracked": True, "created_at": now, "updated_at": now})
            r = requests.post(f"{BASE_URL}/api/callerdesk/webhook?org=tasko", json={"CallSid": sid, "Status": "NOANSWER", "CallRecordingUrl": REC})
            assert r.status_code == 200
            assert len(acts(admin, lid)) == n0
            assert not [n for n in notifs_for_lead(lid) if n.get("type") == "missed_call"]
            assert mdb.callerdesk_calls.find_one({"call_sid": sid})["untracked"] is True
        finally:
            admin.delete(f"{BASE_URL}/api/leads/{lid}")
            mdb.callerdesk_calls.delete_many({"call_sid": sid})

    def test_org_create_update_no_audit(self, sa):
        slug = "test-sa-" + uuid.uuid4().hex[:6]
        r = sa.post(f"{BASE_URL}/api/organizations", json={"name": "TEST_SA Org " + slug, "slug": slug})
        assert r.status_code in (200, 201), r.text
        oid = r.json()["id"]
        try:
            assert sa.patch(f"{BASE_URL}/api/organizations/{oid}", json={"name": "TEST_SA Org2 " + slug}).status_code == 200
            assert mdb.activities.count_documents({"meta.organization_id": oid}) == 0
            assert mdb.activities.count_documents({"organization_id": oid}) == 0
            logs = sa.get(f"{BASE_URL}/api/super-admin/audit-logs").json()
            items = logs if isinstance(logs, list) else logs.get("items", [])
            assert not any((x.get("meta") or {}).get("organization_id") == oid for x in items)
        finally:
            mdb.organizations.delete_one({"id": oid})
            mdb.settings.delete_many({"organization_id": oid})


# ---------------- Regression: normal admin is tracked ----------------
class TestAdminTracked:
    def test_admin_actions_tracked(self, admin):
        notif_before = mdb.notifications.count_documents({"user_id": KARAN})
        lead = mk_lead(admin, "TEST_ADM Lead")
        lid = lead["id"]
        try:
            admin.post(f"{BASE_URL}/api/leads/{lid}/stage", json={"stage": "contacted"})
            admin.post(f"{BASE_URL}/api/leads/{lid}/notes", json={"text": "TEST_ADM note"})
            admin.post(f"{BASE_URL}/api/follow-ups", json={"lead_id": lid, "due_at": "2026-12-01T10:00:00Z"})
            admin.post(f"{BASE_URL}/api/site-visits", json={"lead_id": lid, "project_id": pid(admin), "scheduled_at": "2026-12-02T10:00:00Z"})
            rc = admin.post(f"{BASE_URL}/api/leads/{lid}/call")
            assert rc.status_code == 200, rc.text
            kinds = {x["kind"] for x in acts(admin, lid)}
            for k in ("lead_created", "stage_change", "note", "followup_scheduled", "site_visit_scheduled", "outgoing_call"):
                assert k in kinds, f"{k} missing from {kinds}"
            assert mdb.notifications.count_documents({"user_id": KARAN}) > notif_before
            logs = admin.get(f"{BASE_URL}/api/callerdesk/call-logs").json()["items"]
            assert any(x.get("lead_id") == lid for x in logs)
        finally:
            admin.delete(f"{BASE_URL}/api/leads/{lid}")
            mdb.callerdesk_calls.delete_many({"lead_id": lid})
