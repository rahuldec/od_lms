"""FastAPI backend that wraps Supabase admin operations using service_role key.

The frontend authenticates with Supabase directly (Supabase Auth + anon key).
For any write that requires bypassing RLS (creating trainees, assigning roles,
updating progress, deleting users), the frontend calls these endpoints with
its Supabase access token. The backend verifies the token and uses the
service_role key to perform privileged operations.
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime, timezone
import os
import logging
import httpx
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

REST = f"{SUPABASE_URL}/rest/v1"
AUTH = f"{SUPABASE_URL}/auth/v1"
ADMIN_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

logger = logging.getLogger("training-api")
logging.basicConfig(level=logging.INFO)

# ---------- Zoho report URLs ----------
ZOHO_REPORTS = {
    "SIS": "https://forms.zohopublic.in/odforms1/report/SIS/reportperma/4tMQi4s1xd13XlzrERR2J42hJWZbE6VznPPcwaz9xQ0",
    "Fee Module": "https://forms.zohopublic.in/odforms1/report/FeeModuleAssignment/reportperma/_x9CwE0qH6Xr5XGb55H_oStvU0M6uUjrZr9mLsNyHuA",
}

PASS_THRESHOLD = 9   # score >= 9 out of 50 is Pass

app = FastAPI()
api = APIRouter(prefix="/api")


# ---------- helpers ----------
async def supabase_get_user(token: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(
            f"{AUTH}/user",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid token")
    return r.json()


async def get_user_role(user_id: str) -> Optional[str]:
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(
            f"{REST}/user_roles?user_id=eq.{user_id}&select=role",
            headers=ADMIN_HEADERS,
        )
    rows = r.json() if r.status_code == 200 else []
    return rows[0]["role"] if rows else None


async def require_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    user = await supabase_get_user(token)
    role = await get_user_role(user["id"])
    return {"user": user, "role": role}


async def require_admin(ctx=Depends(require_user)):
    if ctx["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return ctx


# ---------- Zoho score fetcher ----------
async def fetch_zoho_score(assignment_name: str, trainee_name: str) -> Optional[float]:
    """
    Fetches the 'Overall Score' for a trainee from a Zoho public report.
    Matches trainee by first name (case-insensitive).
    Returns the score as float, or None if not found.
    """
    url = ZOHO_REPORTS.get(assignment_name)
    if not url:
        raise HTTPException(status_code=400, detail=f"Unknown assignment: {assignment_name}. Valid: {list(ZOHO_REPORTS.keys())}")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as cx:
            r = await cx.get(url, headers=headers)

        if r.status_code != 200:
            logger.warning(f"Zoho report fetch failed: status {r.status_code}")
            return None

        html = r.text

        # Try to find score via JSON embedded in the page (Zoho often embeds data as JS/JSON)
        # Pattern: find table rows in the HTML
        # Zoho reports render as HTML tables — parse with regex
        # Find all table rows: extract Name and Overall Score columns

        # Remove HTML tags for easier parsing
        # Find header row to get column positions
        th_matches = re.findall(r'<th[^>]*>(.*?)</th>', html, re.IGNORECASE | re.DOTALL)
        headers_clean = [re.sub(r'<[^>]+>', '', h).strip() for h in th_matches]

        name_idx = None
        score_idx = None
        for i, h in enumerate(headers_clean):
            if h.lower() == "name":
                name_idx = i
            if "overall score" in h.lower() or "score" in h.lower():
                score_idx = i

        logger.info(f"Zoho headers found: {headers_clean}, name_idx={name_idx}, score_idx={score_idx}")

        if name_idx is None or score_idx is None:
            # Fallback: try to find score near the trainee name in raw HTML
            logger.warning("Could not find Name/Score columns in Zoho report headers")
            return None

        # Find all <tr> rows
        tr_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.IGNORECASE | re.DOTALL)
        for row in tr_matches:
            td_matches = re.findall(r'<td[^>]*>(.*?)</td>', row, re.IGNORECASE | re.DOTALL)
            cells = [re.sub(r'<[^>]+>', '', td).strip() for td in td_matches]
            if len(cells) > max(name_idx, score_idx):
                cell_name = cells[name_idx].strip().lower()
                target_name = trainee_name.strip().lower()
                # Match by first name or full name
                if cell_name == target_name or cell_name.startswith(target_name.split()[0].lower()):
                    raw_score = cells[score_idx].strip()
                    try:
                        return float(raw_score)
                    except ValueError:
                        logger.warning(f"Could not parse score '{raw_score}' for {trainee_name}")
                        return None

        logger.info(f"Trainee '{trainee_name}' not found in Zoho report for '{assignment_name}'")
        return None

    except Exception as e:
        logger.error(f"Zoho fetch error: {e}")
        return None


# ---------- models ----------
class TraineeIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    join_date: Optional[str] = None
    manager: Optional[str] = ""
    status: Optional[str] = "Active"
    notes: Optional[str] = ""
    username: str
    password: str
    batch_id: Optional[str] = None


class TraineeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    join_date: Optional[str] = None
    manager: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    batch_id: Optional[str] = None


class ProgressIn(BaseModel):
    lesson_id: str
    watched: Optional[bool] = None
    watch_seconds_delta: Optional[int] = 0
    set_watch_seconds: Optional[int] = None


class BatchIn(BaseModel):
    name: str
    start_date: Optional[str] = None
    status: Optional[str] = "Active"
    notes: Optional[str] = ""


class BatchUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AssignBatchIn(BaseModel):
    batch_id: Optional[str] = None


class AssignmentScoreIn(BaseModel):
    assignment_name: str          # "SIS" or "Fee Module"
    score: Optional[float] = None  # manual override; if None, fetch from Zoho


class RecordingIn(BaseModel):
    recording_url: str            # Google Drive URL


# ---------- setup / health ----------
@api.get("/")
async def root():
    return {"ok": True, "service": "training-tracker"}


@api.post("/setup/init")
async def setup_init():
    """Idempotently ensure the admin user exists with the configured password
    and has role=admin in user_roles."""
    email = f"{ADMIN_USERNAME}@odk.local"
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{AUTH}/admin/users?per_page=200",
            headers=ADMIN_HEADERS,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"List users failed: {r.text}")
        users = r.json().get("users", [])
        existing = next((u for u in users if u.get("email") == email), None)
        if existing is None:
            r = await cx.post(
                f"{AUTH}/admin/users",
                headers=ADMIN_HEADERS,
                json={
                    "email": email,
                    "password": ADMIN_PASSWORD,
                    "email_confirm": True,
                },
            )
            if r.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Create admin failed: {r.text}")
            user_id = r.json()["id"]
            created = True
        else:
            user_id = existing["id"]
            await cx.put(
                f"{AUTH}/admin/users/{user_id}",
                headers=ADMIN_HEADERS,
                json={"password": ADMIN_PASSWORD},
            )
            created = False

        rr = await cx.get(
            f"{REST}/user_roles?user_id=eq.{user_id}&select=id",
            headers=ADMIN_HEADERS,
        )
        if rr.status_code == 200 and len(rr.json()) == 0:
            await cx.post(
                f"{REST}/user_roles",
                headers=ADMIN_HEADERS,
                json={"user_id": user_id, "role": "admin"},
            )

    return {"ok": True, "created": created, "admin_user_id": user_id}


# ---------- /me ----------
@api.get("/me")
async def me(ctx=Depends(require_user)):
    user = ctx["user"]
    role = ctx["role"]
    trainee = None
    if role == "trainee":
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=*",
                headers=ADMIN_HEADERS,
            )
            rows = r.json() if r.status_code == 200 else []
            trainee = rows[0] if rows else None
    return {"user_id": user["id"], "email": user.get("email"), "role": role, "trainee": trainee}


# ---------- admin trainees ----------
@api.get("/admin/trainees")
async def list_trainees(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/trainees?select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    return r.json()


@api.post("/admin/trainees")
async def create_trainee(body: TraineeIn, _=Depends(require_admin)):
    username = body.username.strip().lower()
    email = f"{username}@trainee.local"
    async with httpx.AsyncClient(timeout=30) as cx:
        existing_r = await cx.get(
            f"{REST}/trainees?username=eq.{username}&select=id",
            headers=ADMIN_HEADERS,
        )
        if existing_r.status_code == 200 and len(existing_r.json()) > 0:
            raise HTTPException(status_code=400, detail="Username already taken")

        r = await cx.post(
            f"{AUTH}/admin/users",
            headers=ADMIN_HEADERS,
            json={
                "email": email,
                "password": body.password,
                "email_confirm": True,
            },
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Auth create failed: {r.text}")
        auth_user_id = r.json()["id"]

        today = datetime.now(timezone.utc).date().isoformat()
        payload = {
            "name": body.name,
            "phone": body.phone or "",
            "join_date": body.join_date or today,
            "level_since_date": today,
            "manager": body.manager or "",
            "status": body.status or "Active",
            "notes": body.notes or "",
            "username": username,
            "auth_user_id": auth_user_id,
            "current_level": 0,
            "batch_id": body.batch_id or None,
            "history": [
                {
                    "type": "joined",
                    "level": 0,
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }
        r2 = await cx.post(
            f"{REST}/trainees",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=payload,
        )
        if r2.status_code not in (200, 201):
            await cx.delete(f"{AUTH}/admin/users/{auth_user_id}", headers=ADMIN_HEADERS)
            raise HTTPException(status_code=400, detail=f"Trainee insert failed: {r2.text}")
        trainee = r2.json()[0]

        await cx.post(
            f"{REST}/user_roles",
            headers=ADMIN_HEADERS,
            json={"user_id": auth_user_id, "role": "trainee"},
        )

    return trainee


@api.put("/admin/trainees/{trainee_id}")
async def update_trainee(trainee_id: str, body: TraineeUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "join_date" in patch and not patch["join_date"]:
        patch["join_date"] = None
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=patch,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/trainees/{trainee_id}")
async def delete_trainee(trainee_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        auth_user_id = t.get("auth_user_id")

        await cx.delete(
            f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}",
            headers=ADMIN_HEADERS,
        )
        await cx.delete(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}",
            headers=ADMIN_HEADERS,
        )
        await cx.delete(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers=ADMIN_HEADERS,
        )
        if auth_user_id:
            await cx.delete(
                f"{REST}/user_roles?user_id=eq.{auth_user_id}",
                headers=ADMIN_HEADERS,
            )
            await cx.delete(
                f"{AUTH}/admin/users/{auth_user_id}",
                headers=ADMIN_HEADERS,
            )
    return {"ok": True}


@api.post("/admin/trainees/{trainee_id}/promote")
async def promote_trainee(trainee_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        current = t.get("current_level") or 0
        if current >= 3:
            raise HTTPException(status_code=400, detail="Already at Level 3")
        next_level = current + 1
        history = t.get("history") or []
        if not isinstance(history, list):
            history = []
        history.append(
            {
                "type": "promotion",
                "from": current,
                "to": next_level,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        today = datetime.now(timezone.utc).date().isoformat()
        r2 = await cx.patch(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"current_level": next_level, "history": history, "level_since_date": today},
        )
    if r2.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r2.text)
    return r2.json()[0]


@api.get("/admin/trainees/{trainee_id}")
async def get_trainee(trainee_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        p = await cx.get(
            f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        a = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}&select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    return {
        "trainee": rows[0],
        "progress": p.json() if p.status_code == 200 else [],
        "assignments": a.json() if a.status_code == 200 else [],
    }


# ---------- assignments ----------

@api.get("/admin/assignments/{trainee_id}")
async def list_assignments(trainee_id: str, _=Depends(require_admin)):
    """List all assignments for a trainee."""
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}&select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    return r.json() if r.status_code == 200 else []


@api.post("/admin/assignments/{trainee_id}")
async def upsert_assignment(trainee_id: str, body: AssignmentScoreIn, _=Depends(require_admin)):
    """
    Fetch score from Zoho (or use manual override) and save/update the assignment record.
    Pass threshold: score >= 9 out of 50.
    """
    # Get trainee name for Zoho lookup
    async with httpx.AsyncClient(timeout=20) as cx:
        tr = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=name",
            headers=ADMIN_HEADERS,
        )
        rows = tr.json() if tr.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_name = rows[0]["name"]

    # Determine score
    if body.score is not None:
        score = body.score
        source = "manual"
    else:
        score = await fetch_zoho_score(body.assignment_name, trainee_name)
        source = "zoho"
        if score is None:
            raise HTTPException(
                status_code=404,
                detail=f"Could not find score for '{trainee_name}' in Zoho report '{body.assignment_name}'. "
                       f"Please enter score manually."
            )

    passed = score >= PASS_THRESHOLD
    now = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(timeout=20) as cx:
        # Check if assignment record already exists for this trainee + assignment
        existing_r = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}&assignment_name=eq.{body.assignment_name}&select=*",
            headers=ADMIN_HEADERS,
        )
        existing = existing_r.json()[0] if existing_r.status_code == 200 and existing_r.json() else None

        payload = {
            "trainee_id": trainee_id,
            "assignment_name": body.assignment_name,
            "score": score,
            "total_marks": 50,
            "passed": passed,
            "source": source,
            "updated_at": now,
        }

        if existing:
            # Preserve existing recording_url if present
            if existing.get("recording_url"):
                payload["recording_url"] = existing["recording_url"]
            r2 = await cx.patch(
                f"{REST}/assignments?id=eq.{existing['id']}",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json=payload,
            )
        else:
            payload["created_at"] = now
            payload["recording_url"] = None
            r2 = await cx.post(
                f"{REST}/assignments",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json=payload,
            )

    if r2.status_code not in (200, 201, 204):
        raise HTTPException(status_code=400, detail=r2.text)

    result = r2.json()[0] if r2.json() else payload
    return {**result, "passed": passed, "score": score, "total_marks": 50}


@api.patch("/admin/assignments/{trainee_id}/{assignment_name}/recording")
async def update_recording(trainee_id: str, assignment_name: str, body: RecordingIn, _=Depends(require_admin)):
    """Add or update the Google Drive recording URL for a specific trainee's assignment."""
    async with httpx.AsyncClient(timeout=20) as cx:
        existing_r = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}&assignment_name=eq.{assignment_name}&select=*",
            headers=ADMIN_HEADERS,
        )
        existing = existing_r.json()[0] if existing_r.status_code == 200 and existing_r.json() else None

        now = datetime.now(timezone.utc).isoformat()

        if existing:
            r = await cx.patch(
                f"{REST}/assignments?id=eq.{existing['id']}",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json={"recording_url": body.recording_url, "updated_at": now},
            )
        else:
            # Create a placeholder assignment record with just the recording URL
            r = await cx.post(
                f"{REST}/assignments",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json={
                    "trainee_id": trainee_id,
                    "assignment_name": assignment_name,
                    "score": None,
                    "total_marks": 50,
                    "passed": None,
                    "source": "manual",
                    "recording_url": body.recording_url,
                    "created_at": now,
                    "updated_at": now,
                },
            )

    if r.status_code not in (200, 201, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.get("/admin/assignments/{trainee_id}/{assignment_name}/zoho-fetch")
async def fetch_score_from_zoho(trainee_id: str, assignment_name: str, _=Depends(require_admin)):
    """
    Fetch and preview the score from Zoho without saving.
    Admin can confirm before saving.
    """
    async with httpx.AsyncClient(timeout=20) as cx:
        tr = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=name",
            headers=ADMIN_HEADERS,
        )
        rows = tr.json() if tr.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_name = rows[0]["name"]

    score = await fetch_zoho_score(assignment_name, trainee_name)
    if score is None:
        return {
            "found": False,
            "trainee_name": trainee_name,
            "assignment_name": assignment_name,
            "message": f"No submission found for '{trainee_name}' in Zoho report.",
        }

    passed = score >= PASS_THRESHOLD
    return {
        "found": True,
        "trainee_name": trainee_name,
        "assignment_name": assignment_name,
        "score": score,
        "total_marks": 50,
        "passed": passed,
        "pass_threshold": PASS_THRESHOLD,
    }


# ---------- available assignments list ----------
@api.get("/admin/assignments-list")
async def get_assignments_list(_=Depends(require_admin)):
    """Return the list of available assignment names."""
    return {"assignments": list(ZOHO_REPORTS.keys())}


# ---------- admin batches ----------
@api.get("/admin/batches")
async def list_batches(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/batches?select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    return r.json()


@api.post("/admin/batches")
async def create_batch(body: BatchIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"{REST}/batches",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={
                "name": body.name,
                "start_date": body.start_date or None,
                "status": body.status or "Active",
                "notes": body.notes or "",
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/batches/{batch_id}")
async def update_batch(batch_id: str, body: BatchUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(
            f"{REST}/batches?id=eq.{batch_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=patch,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/batches/{batch_id}")
async def delete_batch(batch_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.patch(
            f"{REST}/trainees?batch_id=eq.{batch_id}",
            headers=ADMIN_HEADERS,
            json={"batch_id": None},
        )
        await cx.delete(
            f"{REST}/batches?id=eq.{batch_id}",
            headers=ADMIN_HEADERS,
        )
    return {"ok": True}


@api.get("/admin/batches/{batch_id}")
async def get_batch(batch_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        rb = await cx.get(
            f"{REST}/batches?id=eq.{batch_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = rb.json() if rb.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Batch not found")
        rt = await cx.get(
            f"{REST}/trainees?batch_id=eq.{batch_id}&select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
        trainees = rt.json() if rt.status_code == 200 else []
    return {"batch": rows[0], "trainees": trainees}


@api.patch("/admin/trainees/{trainee_id}/batch")
async def assign_batch(trainee_id: str, body: AssignBatchIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"batch_id": body.batch_id},
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


# ---------- trainee progress ----------
@api.get("/trainee/progress")
async def my_progress(ctx=Depends(require_user)):
    if ctx["role"] != "trainee":
        raise HTTPException(status_code=403, detail="Trainee only")
    user = ctx["user"]
    async with httpx.AsyncClient(timeout=20) as cx:
        rt = await cx.get(
            f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = rt.json() if rt.status_code == 200 else []
        if not rows:
            return {"trainee": None, "progress": []}
        trainee = rows[0]
        p = await cx.get(
            f"{REST}/lesson_progress?trainee_id=eq.{trainee['id']}&select=*",
            headers=ADMIN_HEADERS,
        )
        a = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee['id']}&select=*&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    return {
        "trainee": trainee,
        "progress": p.json() if p.status_code == 200 else [],
        "assignments": a.json() if a.status_code == 200 else [],
    }


@api.post("/trainee/progress")
async def upsert_progress(body: ProgressIn, ctx=Depends(require_user)):
    if ctx["role"] != "trainee":
        raise HTTPException(status_code=403, detail="Trainee only")
    user = ctx["user"]
    async with httpx.AsyncClient(timeout=20) as cx:
        rt = await cx.get(
            f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=id",
            headers=ADMIN_HEADERS,
        )
        rows = rt.json() if rt.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_id = rows[0]["id"]

        r = await cx.get(
            f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}&lesson_id=eq.{body.lesson_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        existing = r.json()[0] if r.status_code == 200 and r.json() else None

        watched = existing["watched"] if existing else False
        watch_seconds = existing["watch_seconds"] if existing else 0
        if body.watched is not None:
            watched = bool(body.watched)
        if body.set_watch_seconds is not None:
            watch_seconds = int(body.set_watch_seconds)
        elif body.watch_seconds_delta:
            watch_seconds = (watch_seconds or 0) + int(body.watch_seconds_delta)

        payload = {
            "trainee_id": trainee_id,
            "lesson_id": body.lesson_id,
            "watched": watched,
            "watch_seconds": watch_seconds,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing:
            r2 = await cx.patch(
                f"{REST}/lesson_progress?id=eq.{existing['id']}",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json=payload,
            )
        else:
            r2 = await cx.post(
                f"{REST}/lesson_progress",
                headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
                json=payload,
            )
    if r2.status_code not in (200, 201, 204):
        raise HTTPException(status_code=400, detail=r2.text)
    return r2.json()[0] if r2.json() else payload


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
