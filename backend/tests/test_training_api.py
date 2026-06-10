"""Backend tests for Training Program Tracker.

Tests cover:
- /api/setup/init bootstrap
- Admin Supabase auth -> /api/me role=admin
- Trainee CRUD via admin: create, get, promote, update, delete
- Trainee auth -> /api/me role=trainee
- /api/trainee/progress upsert (watch_seconds_delta + watched)
- RLS / role enforcement: 401 (no token), 403 (trainee hitting admin)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://erp-academy-6.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL", "https://rlenfsigkfxppxkskqks.supabase.co").rstrip("/")
SUPABASE_ANON = os.environ.get(
    "REACT_APP_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZW5mc2lna2Z4cHB4a3NrcWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTgyOTcsImV4cCI6MjA5NjIzNDI5N30.Mwlh0U38LUsMsg9diegPQqpoc9n7Nt_fajinkG9tSyU",
)

ADMIN_EMAIL = "admin@odk.local"
ADMIN_PASSWORD = "rahul-ranger"


def supabase_signin(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    return r


@pytest.fixture(scope="session")
def admin_token():
    # bootstrap admin first
    requests.post(f"{BASE_URL}/api/setup/init", timeout=20)
    r = supabase_signin(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    assert token
    return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- health / setup ----------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_setup_init_idempotent(self):
        r = requests.post(f"{BASE_URL}/api/setup/init", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "admin_user_id" in body


# ---------------- /api/me ----------------
class TestMe:
    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/me", timeout=15)
        assert r.status_code == 401

    def test_me_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"
        assert data["email"] == ADMIN_EMAIL
        assert data.get("trainee") is None


# ---------------- Admin Trainees CRUD ----------------
class TestTraineesCRUD:
    """Full CRUD: create -> GET to verify -> promote -> update -> delete -> verify 404."""

    @pytest.fixture(scope="class")
    def created_trainee(self, admin_headers):
        unique = uuid.uuid4().hex[:8]
        username = f"test_qa_{unique}"
        password = "qa-test-pass-2026"
        payload = {
            "name": "TEST_QA Trainee",
            "phone": "+91 9999",
            "join_date": "2026-02-01",
            "manager": "Bob",
            "status": "Active",
            "notes": "auto-created by pytest",
            "username": username,
            "password": password,
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/trainees", headers=admin_headers, json=payload, timeout=30
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["username"] == username
        assert data["current_level"] == 0
        assert data["status"] == "Active"
        assert "id" in data and isinstance(data["id"], str)
        data["_password"] = password
        yield data
        # teardown
        try:
            requests.delete(
                f"{BASE_URL}/api/admin/trainees/{data['id']}", headers=admin_headers, timeout=20
            )
        except Exception:
            pass

    def test_list_trainees_contains_created(self, admin_headers, created_trainee):
        r = requests.get(f"{BASE_URL}/api/admin/trainees", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert any(t["id"] == created_trainee["id"] for t in rows)

    def test_get_trainee_detail(self, admin_headers, created_trainee):
        r = requests.get(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["trainee"]["id"] == created_trainee["id"]
        assert isinstance(data["progress"], list)

    def test_create_duplicate_username_rejected(self, admin_headers, created_trainee):
        payload = {
            "name": "dup",
            "username": created_trainee["username"],
            "password": "whatever123",
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/trainees", headers=admin_headers, json=payload, timeout=20
        )
        assert r.status_code == 400

    def test_promote_trainee(self, admin_headers, created_trainee):
        r = requests.post(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}/promote",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["current_level"] == 1
        # GET verify
        g = requests.get(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert g.json()["trainee"]["current_level"] == 1

    def test_update_trainee_manager(self, admin_headers, created_trainee):
        r = requests.put(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            json={"manager": "Carol"},
            timeout=20,
        )
        assert r.status_code == 200
        # verify
        g = requests.get(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert g.json()["trainee"]["manager"] == "Carol"

    def test_zz_delete_and_verify(self, admin_headers, created_trainee):
        r = requests.delete(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200
        # verify 404
        g = requests.get(
            f"{BASE_URL}/api/admin/trainees/{created_trainee['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert g.status_code == 404


# ---------------- Trainee progress + auth correctness ----------------
class TestTraineeFlow:
    @pytest.fixture(scope="class")
    def trainee(self, admin_headers):
        unique = uuid.uuid4().hex[:8]
        username = f"test_prog_{unique}"
        password = "prog-test-pass-2026"
        payload = {
            "name": "TEST_Progress Trainee",
            "username": username,
            "password": password,
            "status": "Active",
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/trainees", headers=admin_headers, json=payload, timeout=30
        )
        assert r.status_code == 200, r.text
        t = r.json()
        # login as trainee
        s = supabase_signin(f"{username}@trainee.local", password)
        assert s.status_code == 200, s.text
        t["_token"] = s.json()["access_token"]
        yield t
        try:
            requests.delete(
                f"{BASE_URL}/api/admin/trainees/{t['id']}", headers=admin_headers, timeout=20
            )
        except Exception:
            pass

    def test_me_trainee_role(self, trainee):
        headers = {"Authorization": f"Bearer {trainee['_token']}"}
        r = requests.get(f"{BASE_URL}/api/me", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "trainee"
        assert data["trainee"] is not None
        assert data["trainee"]["id"] == trainee["id"]

    def test_trainee_cannot_list_trainees(self, trainee):
        headers = {"Authorization": f"Bearer {trainee['_token']}"}
        r = requests.get(f"{BASE_URL}/api/admin/trainees", headers=headers, timeout=15)
        assert r.status_code == 403

    def test_no_token_admin_list(self):
        r = requests.get(f"{BASE_URL}/api/admin/trainees", timeout=15)
        assert r.status_code == 401

    def test_progress_upsert_delta_and_watched(self, trainee):
        headers = {"Authorization": f"Bearer {trainee['_token']}", "Content-Type": "application/json"}
        lesson_id = "m-1-l1"
        # first delta
        r = requests.post(
            f"{BASE_URL}/api/trainee/progress",
            headers=headers,
            json={"lesson_id": lesson_id, "watch_seconds_delta": 5},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d1 = r.json()
        assert d1["watch_seconds"] == 5
        assert d1["watched"] is False
        # second delta accumulates
        r2 = requests.post(
            f"{BASE_URL}/api/trainee/progress",
            headers=headers,
            json={"lesson_id": lesson_id, "watch_seconds_delta": 7},
            timeout=20,
        )
        assert r2.status_code == 200
        assert r2.json()["watch_seconds"] == 12
        # mark watched
        r3 = requests.post(
            f"{BASE_URL}/api/trainee/progress",
            headers=headers,
            json={"lesson_id": lesson_id, "watched": True},
            timeout=20,
        )
        assert r3.status_code == 200
        assert r3.json()["watched"] is True
        assert r3.json()["watch_seconds"] == 12
        # /api/trainee/progress GET reflects state
        g = requests.get(
            f"{BASE_URL}/api/trainee/progress",
            headers={"Authorization": f"Bearer {trainee['_token']}"},
            timeout=20,
        )
        assert g.status_code == 200
        gdata = g.json()
        match = [p for p in gdata["progress"] if p["lesson_id"] == lesson_id]
        assert len(match) == 1
        assert match[0]["watched"] is True
        assert match[0]["watch_seconds"] == 12

    def test_admin_cannot_post_progress(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/trainee/progress",
            headers=admin_headers,
            json={"lesson_id": "m-1-l1", "watch_seconds_delta": 1},
            timeout=15,
        )
        assert r.status_code == 403
