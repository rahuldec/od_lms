"""FastAPI backend that wraps Supabase admin operations using service_role key."""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, File, UploadFile, Form
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

ZOHO_REPORTS = {
    "SIS": "https://forms.zohopublic.in/odforms1/report/SIS/reportperma/4tMQi4s1xd13XlzrERR2J42hJWZbE6VznPPcwaz9xQ0",
    "Fee Module": "https://forms.zohopublic.in/odforms1/report/FeeModuleAssignment/reportperma/_x9CwE0qH6Xr5XGb55H_oStvU0M6uUjrZr9mLsNyHuA",
}

PASS_THRESHOLD = 9

app = FastAPI()
api = APIRouter(prefix="/api")


# ---------- helpers ----------
async def supabase_get_user(token: str) -> Dict[str, Any]:
    last_error = None
    for attempt in range(2):  # one retry to absorb a one-off network/timeout blip
        try:
            async with httpx.AsyncClient(timeout=15) as cx:
                r = await cx.get(
                    f"{AUTH}/user",
                    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
                )
        except (httpx.TimeoutException, httpx.TransportError) as e:
            # Network/timeout talking to Supabase - NOT a token problem.
            # Don't tell the frontend "invalid token" (that triggers sign-out).
            last_error = e
            continue

        if r.status_code == 401:
            # Supabase explicitly rejected the token - genuinely invalid/expired.
            raise HTTPException(status_code=401, detail="Invalid token")
        if r.status_code != 200:
            # Some other hiccup on Supabase's side (5xx, rate limit, etc).
            # Treat as transient, not as an invalid session.
            last_error = HTTPException(
                status_code=503, detail="Auth service temporarily unavailable"
            )
            continue
        return r.json()

    if isinstance(last_error, HTTPException):
        raise last_error
    raise HTTPException(status_code=503, detail="Auth service temporarily unavailable")


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


# ---------- Supabase Storage helpers (used by results/publishing) ----------
RESULTS_BUCKET = "results"


async def upload_to_supabase_storage(bucket: str, path: str, content: bytes, content_type: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type or "application/octet-stream",
        "x-upsert": "true",
    }
    async with httpx.AsyncClient(timeout=30) as cx:
        r = await cx.post(url, headers=headers, content=content)
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Storage upload failed: {r.text}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"


async def delete_from_supabase_storage(bucket: str, path: str) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.delete(url, headers=headers)


# ---------- Zoho score fetcher ----------
async def fetch_zoho_score(assignment_name: str, trainee_name: str) -> Optional[float]:
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
        th_matches = re.findall(r'<th[^>]*>(.*?)</th>', html, re.IGNORECASE | re.DOTALL)
        headers_clean = [re.sub(r'<[^>]+>', '', h).strip() for h in th_matches]

        name_idx = None
        score_idx = None
        for i, h in enumerate(headers_clean):
            if h.lower() == "name":
                name_idx = i
            if "overall score" in h.lower() or "score" in h.lower():
                score_idx = i

        if name_idx is None or score_idx is None:
            logger.warning("Could not find Name/Score columns in Zoho report headers")
            return None

        tr_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.IGNORECASE | re.DOTALL)
        for row in tr_matches:
            td_matches = re.findall(r'<td[^>]*>(.*?)</td>', row, re.IGNORECASE | re.DOTALL)
            cells = [re.sub(r'<[^>]+>', '', td).strip() for td in td_matches]
            if len(cells) > max(name_idx, score_idx):
                cell_name = cells[name_idx].strip().lower()
                target_name = trainee_name.strip().lower()
                if cell_name == target_name or cell_name.startswith(target_name.split()[0].lower()):
                    raw_score = cells[score_idx].strip()
                    try:
                        return float(raw_score)
                    except ValueError:
                        logger.warning(f"Could not parse score '{raw_score}' for {trainee_name}")
                        return None

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
    level_since_date: Optional[str] = None


class LevelChangeIn(BaseModel):
    date: Optional[str] = None


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
    current_module: Optional[str] = None


class BatchModulesIn(BaseModel):
    module_names: List[str]


class AssignBatchIn(BaseModel):
    batch_id: Optional[str] = None


class AssignmentScoreIn(BaseModel):
    assignment_name: str
    score: Optional[float] = None


class RecordingIn(BaseModel):
    recording_url: str


class ResourceCategoryIn(BaseModel):
    name: str


class ResourceCategoryUpdate(BaseModel):
    name: str


class ResourceLinkIn(BaseModel):
    category_id: str
    title: str
    url: Optional[str] = ""
    urls: Optional[Any] = []
    practice_sheet_url: Optional[str] = ""
    description: Optional[str] = ""


class ResourceLinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    urls: Optional[Any] = None
    practice_sheet_url: Optional[str] = None
    description: Optional[str] = None


class WebinarIn(BaseModel):
    title: str
    description: Optional[str] = ""
    drive_url: str
    published: Optional[bool] = True
    sort_order: Optional[int] = 0


class WebinarUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    drive_url: Optional[str] = None
    published: Optional[bool] = None
    sort_order: Optional[int] = None


class TrainingModuleIn(BaseModel):
    sr_no: Optional[int] = None
    module: str
    day_label: Optional[str] = ""
    sub_part: str
    video_url: Optional[str] = ""
    assignment_url: Optional[str] = ""
    sort_order: Optional[int] = 0


class TrainingModuleUpdate(BaseModel):
    sr_no: Optional[int] = None
    module: Optional[str] = None
    day_label: Optional[str] = None
    sub_part: Optional[str] = None
    video_url: Optional[str] = None
    assignment_url: Optional[str] = None
    sort_order: Optional[int] = None


# ---------- setup / health ----------
@api.get("/")
async def root():
    return {"ok": True, "service": "training-tracker"}


@api.post("/setup/init")
async def setup_init():
    email = f"{ADMIN_USERNAME}@odk.local"
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{AUTH}/admin/users?per_page=200", headers=ADMIN_HEADERS)
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"List users failed: {r.text}")
        users = r.json().get("users", [])
        existing = next((u for u in users if u.get("email") == email), None)
        if existing is None:
            r = await cx.post(
                f"{AUTH}/admin/users",
                headers=ADMIN_HEADERS,
                json={"email": email, "password": ADMIN_PASSWORD, "email_confirm": True},
            )
            if r.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Create admin failed: {r.text}")
            user_id = r.json()["id"]
            created = True
        else:
            user_id = existing["id"]
            await cx.put(f"{AUTH}/admin/users/{user_id}", headers=ADMIN_HEADERS, json={"password": ADMIN_PASSWORD})
            created = False

        rr = await cx.get(f"{REST}/user_roles?user_id=eq.{user_id}&select=id", headers=ADMIN_HEADERS)
        if rr.status_code == 200 and len(rr.json()) == 0:
            await cx.post(f"{REST}/user_roles", headers=ADMIN_HEADERS, json={"user_id": user_id, "role": "admin"})

    return {"ok": True, "created": created, "admin_user_id": user_id}


# ---------- /me ----------
@api.get("/me")
async def me(ctx=Depends(require_user)):
    user = ctx["user"]
    role = ctx["role"]
    trainee = None
    if role == "trainee":
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=*", headers=ADMIN_HEADERS)
            rows = r.json() if r.status_code == 200 else []
            trainee = rows[0] if rows else None
    return {"user_id": user["id"], "email": user.get("email"), "role": role, "trainee": trainee}


# ---------- admin trainees ----------
@api.get("/admin/trainees")
async def list_trainees(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/trainees?select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    return r.json()


@api.post("/admin/trainees")
async def create_trainee(body: TraineeIn, _=Depends(require_admin)):
    username = body.username.strip().lower()
    email = f"{username}@trainee.local"
    async with httpx.AsyncClient(timeout=30) as cx:
        existing_r = await cx.get(f"{REST}/trainees?username=eq.{username}&select=id", headers=ADMIN_HEADERS)
        if existing_r.status_code == 200 and len(existing_r.json()) > 0:
            raise HTTPException(status_code=400, detail="Username already taken")

        r = await cx.post(
            f"{AUTH}/admin/users",
            headers=ADMIN_HEADERS,
            json={"email": email, "password": body.password, "email_confirm": True},
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
            "history": [{"type": "joined", "level": 0, "at": datetime.now(timezone.utc).isoformat()}],
        }
        r2 = await cx.post(f"{REST}/trainees", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=payload)
        if r2.status_code not in (200, 201):
            await cx.delete(f"{AUTH}/admin/users/{auth_user_id}", headers=ADMIN_HEADERS)
            raise HTTPException(status_code=400, detail=f"Trainee insert failed: {r2.text}")
        trainee = r2.json()[0]
        await cx.post(f"{REST}/user_roles", headers=ADMIN_HEADERS, json={"user_id": auth_user_id, "role": "trainee"})

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
        r = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=*", headers=ADMIN_HEADERS)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        auth_user_id = t.get("auth_user_id")
        await cx.delete(f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}", headers=ADMIN_HEADERS)
        await cx.delete(f"{REST}/assignments?trainee_id=eq.{trainee_id}", headers=ADMIN_HEADERS)
        await cx.delete(f"{REST}/login_events?trainee_id=eq.{trainee_id}", headers=ADMIN_HEADERS)
        await cx.delete(f"{REST}/trainees?id=eq.{trainee_id}", headers=ADMIN_HEADERS)
        if auth_user_id:
            await cx.delete(f"{REST}/user_roles?user_id=eq.{auth_user_id}", headers=ADMIN_HEADERS)
            await cx.delete(f"{AUTH}/admin/users/{auth_user_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


@api.post("/admin/trainees/{trainee_id}/promote")
async def promote_trainee(trainee_id: str, body: LevelChangeIn = LevelChangeIn(), _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=*", headers=ADMIN_HEADERS)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        current = t.get("current_level") or 0
        if current >= 3:
            raise HTTPException(status_code=400, detail="Already at Level 3")
        next_level = current + 1
        effective_date = body.date or datetime.now(timezone.utc).date().isoformat()
        history = t.get("history") or []
        if not isinstance(history, list):
            history = []
        history.append({
            "type": "promotion",
            "from": current,
            "to": next_level,
            "at": datetime.now(timezone.utc).isoformat(),
            "effective_date": effective_date,
        })
        r2 = await cx.patch(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"current_level": next_level, "history": history, "level_since_date": effective_date},
        )
    if r2.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r2.text)
    return r2.json()[0]


@api.post("/admin/trainees/{trainee_id}/demote")
async def demote_trainee(trainee_id: str, body: LevelChangeIn = LevelChangeIn(), _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=*", headers=ADMIN_HEADERS)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        current = t.get("current_level") or 0
        if current <= 0:
            raise HTTPException(status_code=400, detail="Already at Level 0")
        next_level = current - 1
        effective_date = body.date or datetime.now(timezone.utc).date().isoformat()
        history = t.get("history") or []
        if not isinstance(history, list):
            history = []
        history.append({
            "type": "demotion",
            "from": current,
            "to": next_level,
            "at": datetime.now(timezone.utc).isoformat(),
            "effective_date": effective_date,
        })
        r2 = await cx.patch(
            f"{REST}/trainees?id=eq.{trainee_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"current_level": next_level, "history": history, "level_since_date": effective_date},
        )
    if r2.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r2.text)
    return r2.json()[0]


@api.get("/admin/trainees/{trainee_id}")
async def get_trainee(trainee_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=*", headers=ADMIN_HEADERS)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        p = await cx.get(f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}&select=*", headers=ADMIN_HEADERS)
        a = await cx.get(f"{REST}/assignments?trainee_id=eq.{trainee_id}&select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    return {
        "trainee": rows[0],
        "progress": p.json() if p.status_code == 200 else [],
        "assignments": a.json() if a.status_code == 200 else [],
    }


# ---------- login timeline ----------
@api.get("/admin/trainees/{trainee_id}/timeline")
async def get_login_timeline(trainee_id: str, _=Depends(require_admin)):
    """Return last 50 login events for a trainee, newest first."""
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/login_events?trainee_id=eq.{trainee_id}&select=id,created_at&order=created_at.desc&limit=50",
            headers=ADMIN_HEADERS,
        )
    return r.json() if r.status_code == 200 else []


@api.get("/admin/trainees/last-seen/all")
async def get_all_last_seen(_=Depends(require_admin)):
    """Return the most recent login timestamp for every trainee in one call."""
    async with httpx.AsyncClient(timeout=20) as cx:
        # Fetch all login events ordered desc, then dedupe by trainee_id on server
        r = await cx.get(
            f"{REST}/login_events?select=trainee_id,created_at&order=created_at.desc&limit=1000",
            headers=ADMIN_HEADERS,
        )
    rows = r.json() if r.status_code == 200 else []
    # Keep only the first (most recent) row per trainee
    seen = {}
    for row in rows:
        tid = row["trainee_id"]
        if tid not in seen:
            seen[tid] = row["created_at"]
    return seen


# ---------- trainee login ping ----------
@api.post("/trainee/login-ping")
async def login_ping(ctx=Depends(require_user)):
    """Called by the frontend on login and on page visits. Records a login event."""
    if ctx["role"] != "trainee":
        raise HTTPException(status_code=403, detail="Trainee only")
    user = ctx["user"]
    async with httpx.AsyncClient(timeout=15) as cx:
        rt = await cx.get(
            f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=id",
            headers=ADMIN_HEADERS,
        )
        rows = rt.json() if rt.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_id = rows[0]["id"]

        # Rate-limit: only insert if no event in last 10 minutes to avoid spam
        from datetime import timedelta
        ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        recent_r = await cx.get(
            f"{REST}/login_events?trainee_id=eq.{trainee_id}&created_at=gte.{ten_min_ago}&select=id&limit=1",
            headers=ADMIN_HEADERS,
        )
        if recent_r.status_code == 200 and recent_r.json():
            return {"ok": True, "recorded": False, "reason": "rate_limited"}

        r = await cx.post(
            f"{REST}/login_events",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"trainee_id": trainee_id, "created_at": datetime.now(timezone.utc).isoformat()},
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return {"ok": True, "recorded": True}


# ---------- assignments ----------
@api.get("/admin/assignments/{trainee_id}")
async def list_assignments(trainee_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/assignments?trainee_id=eq.{trainee_id}&select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    return r.json() if r.status_code == 200 else []


@api.post("/admin/assignments/{trainee_id}")
async def upsert_assignment(trainee_id: str, body: AssignmentScoreIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        tr = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=name", headers=ADMIN_HEADERS)
        rows = tr.json() if tr.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_name = rows[0]["name"]

    if body.score is not None:
        score = body.score
        source = "manual"
    else:
        score = await fetch_zoho_score(body.assignment_name, trainee_name)
        source = "zoho"
        if score is None:
            raise HTTPException(status_code=404, detail=f"Could not find score for '{trainee_name}' in Zoho report '{body.assignment_name}'. Please enter score manually.")

    passed = score >= PASS_THRESHOLD
    now = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(timeout=20) as cx:
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
            if existing.get("recording_url"):
                payload["recording_url"] = existing["recording_url"]
            r2 = await cx.patch(f"{REST}/assignments?id=eq.{existing['id']}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=payload)
        else:
            payload["created_at"] = now
            payload["recording_url"] = None
            r2 = await cx.post(f"{REST}/assignments", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=payload)

    if r2.status_code not in (200, 201, 204):
        raise HTTPException(status_code=400, detail=r2.text)
    result = r2.json()[0] if r2.json() else payload
    return {**result, "passed": passed, "score": score, "total_marks": 50}


@api.patch("/admin/assignments/{trainee_id}/{assignment_name}/recording")
async def update_recording(trainee_id: str, assignment_name: str, body: RecordingIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        existing_r = await cx.get(
            f"{REST}/assignments?trainee_id=eq.{trainee_id}&assignment_name=eq.{assignment_name}&select=*",
            headers=ADMIN_HEADERS,
        )
        existing = existing_r.json()[0] if existing_r.status_code == 200 and existing_r.json() else None
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            r = await cx.patch(f"{REST}/assignments?id=eq.{existing['id']}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json={"recording_url": body.recording_url, "updated_at": now})
        else:
            r = await cx.post(f"{REST}/assignments", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json={
                "trainee_id": trainee_id, "assignment_name": assignment_name,
                "score": None, "total_marks": 50, "passed": None, "source": "manual",
                "recording_url": body.recording_url, "created_at": now, "updated_at": now,
            })
    if r.status_code not in (200, 201, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.get("/admin/assignments/{trainee_id}/{assignment_name}/zoho-fetch")
async def fetch_score_from_zoho(trainee_id: str, assignment_name: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        tr = await cx.get(f"{REST}/trainees?id=eq.{trainee_id}&select=name", headers=ADMIN_HEADERS)
        rows = tr.json() if tr.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_name = rows[0]["name"]
    score = await fetch_zoho_score(assignment_name, trainee_name)
    if score is None:
        return {"found": False, "trainee_name": trainee_name, "assignment_name": assignment_name, "message": f"No submission found for '{trainee_name}' in Zoho report."}
    passed = score >= PASS_THRESHOLD
    return {"found": True, "trainee_name": trainee_name, "assignment_name": assignment_name, "score": score, "total_marks": 50, "passed": passed, "pass_threshold": PASS_THRESHOLD}


@api.get("/admin/assignments-list")
async def get_assignments_list(_=Depends(require_admin)):
    return {"assignments": list(ZOHO_REPORTS.keys())}


# ---------- admin batches ----------
@api.get("/admin/batches")
async def list_batches(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/batches?select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    return r.json()


@api.post("/admin/batches")
async def create_batch(body: BatchIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(f"{REST}/batches", headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={"name": body.name, "start_date": body.start_date or None, "status": body.status or "Active", "notes": body.notes or ""})
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/batches/{batch_id}")
async def update_batch(batch_id: str, body: BatchUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(f"{REST}/batches?id=eq.{batch_id}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=patch)
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/batches/{batch_id}")
async def delete_batch(batch_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.patch(f"{REST}/trainees?batch_id=eq.{batch_id}", headers=ADMIN_HEADERS, json={"batch_id": None})
        await cx.delete(f"{REST}/batch_module_assignments?batch_id=eq.{batch_id}", headers=ADMIN_HEADERS)
        await cx.delete(f"{REST}/batches?id=eq.{batch_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


@api.get("/admin/batches/{batch_id}")
async def get_batch(batch_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        rb = await cx.get(f"{REST}/batches?id=eq.{batch_id}&select=*", headers=ADMIN_HEADERS)
        rows = rb.json() if rb.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Batch not found")
        rt = await cx.get(f"{REST}/trainees?batch_id=eq.{batch_id}&select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    return {"batch": rows[0], "trainees": rt.json() if rt.status_code == 200 else []}


@api.patch("/admin/trainees/{trainee_id}/batch")
async def assign_batch(trainee_id: str, body: AssignBatchIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(f"{REST}/trainees?id=eq.{trainee_id}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json={"batch_id": body.batch_id})
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


# ---------- admin batch <-> module assignment ----------
@api.get("/admin/batches/{batch_id}/modules")
async def get_batch_modules(batch_id: str, _=Depends(require_admin)):
    """Return the active module assignments for a single batch."""
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/batch_module_assignments?batch_id=eq.{batch_id}&is_active=eq.true&select=*",
            headers=ADMIN_HEADERS,
        )
    return r.json() if r.status_code == 200 else []


@api.post("/admin/batches/{batch_id}/modules")
async def set_batch_modules(batch_id: str, body: BatchModulesIn, _=Depends(require_admin)):
    """Replace the set of active modules for a batch with body.module_names."""
    async with httpx.AsyncClient(timeout=20) as cx:
        # Deactivate everything for this batch first, then re-activate the selected set
        # in a single bulk upsert (was previously one POST per module name).
        await cx.patch(
            f"{REST}/batch_module_assignments?batch_id=eq.{batch_id}",
            headers=ADMIN_HEADERS,
            json={"is_active": False},
        )
        if body.module_names:
            rows = [
                {"batch_id": batch_id, "module_name": name, "is_active": True}
                for name in body.module_names
            ]
            r = await cx.post(
                f"{REST}/batch_module_assignments?on_conflict=batch_id,module_name",
                headers={**ADMIN_HEADERS, "Prefer": "resolution=merge-duplicates"},
                json=rows,
            )
            if r.status_code not in (200, 201, 204):
                raise HTTPException(status_code=400, detail=r.text)
    return {"ok": True, "module_names": body.module_names}


@api.get("/admin/batches/{batch_id}/analytics")
async def batch_analytics(batch_id: str, _=Depends(require_admin)):
    """Return raw trainee + assignment + lesson_progress data for a batch, for the frontend to chart."""
    async with httpx.AsyncClient(timeout=20) as cx:
        rt = await cx.get(f"{REST}/trainees?batch_id=eq.{batch_id}&select=id,name", headers=ADMIN_HEADERS)
        trainees = rt.json() if rt.status_code == 200 else []
        trainee_ids = [t["id"] for t in trainees]
        if not trainee_ids:
            return {"trainees": [], "assignments": [], "lesson_progress": []}
        id_list = ",".join(trainee_ids)
        ra = await cx.get(f"{REST}/assignments?trainee_id=in.({id_list})&select=*", headers=ADMIN_HEADERS)
        rl = await cx.get(f"{REST}/lesson_progress?trainee_id=in.({id_list})&select=*", headers=ADMIN_HEADERS)
    return {
        "trainees": trainees,
        "assignments": ra.json() if ra.status_code == 200 else [],
        "lesson_progress": rl.json() if rl.status_code == 200 else [],
    }


# ---------- admin resources ----------
@api.get("/admin/resources")
async def list_resources(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        rc = await cx.get(f"{REST}/resource_categories?select=*&order=created_at.asc", headers=ADMIN_HEADERS)
        rl = await cx.get(f"{REST}/resource_links?select=*&order=created_at.asc", headers=ADMIN_HEADERS)
    categories = rc.json() if rc.status_code == 200 else []
    links = rl.json() if rl.status_code == 200 else []
    for cat in categories:
        cat["links"] = [l for l in links if l.get("category_id") == cat["id"]]
    return categories


@api.post("/admin/resources/categories")
async def create_resource_category(body: ResourceCategoryIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(f"{REST}/resource_categories", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json={"name": body.name})
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/resources/categories/{category_id}")
async def update_resource_category(category_id: str, body: ResourceCategoryUpdate, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(f"{REST}/resource_categories?id=eq.{category_id}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json={"name": body.name})
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/resources/categories/{category_id}")
async def delete_resource_category(category_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.delete(f"{REST}/resource_links?category_id=eq.{category_id}", headers=ADMIN_HEADERS)
        await cx.delete(f"{REST}/resource_categories?id=eq.{category_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


@api.post("/admin/resources/links")
async def create_resource_link(body: ResourceLinkIn, _=Depends(require_admin)):
    urls = body.urls if body.urls else ([body.url] if body.url else [])
    primary_url = urls[0].get("url", urls[0]) if urls and isinstance(urls[0], dict) else (urls[0] if urls else "")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"{REST}/resource_links",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={
                "category_id": body.category_id,
                "title": body.title,
                "url": primary_url,
                "urls": urls,
                "practice_sheet_url": body.practice_sheet_url or "",
                "description": body.description or "",
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/resources/links/{link_id}")
async def update_resource_link(link_id: str, body: ResourceLinkUpdate, _=Depends(require_admin)):
    patch = {}
    if body.title is not None:
        patch["title"] = body.title
    if body.description is not None:
        patch["description"] = body.description
    if body.practice_sheet_url is not None:
        patch["practice_sheet_url"] = body.practice_sheet_url
    if body.urls is not None:
        patch["urls"] = body.urls
        first = body.urls[0] if body.urls else {}
        patch["url"] = first.get("url", first) if isinstance(first, dict) else first
    elif body.url is not None:
        patch["url"] = body.url
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(f"{REST}/resource_links?id=eq.{link_id}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=patch)
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/resources/links/{link_id}")
async def delete_resource_link(link_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.delete(f"{REST}/resource_links?id=eq.{link_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


# ---------- admin webinars ----------
@api.get("/admin/webinars")
async def list_webinars_admin(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/webinars?select=*&order=sort_order.asc,created_at.desc", headers=ADMIN_HEADERS)
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()


@api.post("/admin/webinars")
async def create_webinar(body: WebinarIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"{REST}/webinars",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json={
                "title": body.title,
                "description": body.description or "",
                "drive_url": body.drive_url,
                "published": body.published if body.published is not None else True,
                "sort_order": body.sort_order or 0,
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/webinars/{webinar_id}")
async def update_webinar(webinar_id: str, body: WebinarUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(f"{REST}/webinars?id=eq.{webinar_id}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=patch)
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/webinars/{webinar_id}")
async def delete_webinar(webinar_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.delete(f"{REST}/webinars?id=eq.{webinar_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


@api.get("/webinars")
async def list_webinars_public():
    """Fully public - no auth. Powers the /webinar page, published only."""
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/webinars?published=eq.true&select=id,title,description,drive_url,sort_order,created_at&order=sort_order.asc,created_at.desc",
            headers=ADMIN_HEADERS,
        )
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()


# ---------- admin training modules ----------
@api.get("/admin/training-modules")
async def list_training_modules(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/training_modules?select=*&order=sort_order.asc", headers=ADMIN_HEADERS)
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()


@api.post("/admin/training-modules")
async def create_training_module(body: TrainingModuleIn, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"{REST}/training_modules",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=body.dict(),
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.put("/admin/training-modules/{module_id}")
async def update_training_module(module_id: str, body: TrainingModuleUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(
            f"{REST}/training_modules?id=eq.{module_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=patch,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/training-modules/{module_id}")
async def delete_training_module(module_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.delete(f"{REST}/training_modules?id=eq.{module_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


# ---------- results ----------
class ResultUpdate(BaseModel):
    title: Optional[str] = None
    cycle: Optional[str] = None
    published: Optional[bool] = None


@api.get("/admin/results")
async def list_results_admin(_=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/results?select=*&order=created_at.desc", headers=ADMIN_HEADERS)
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()


@api.post("/admin/results")
async def upload_result(
    title: str = Form(...),
    cycle: str = Form(""),
    file: UploadFile = File(...),
    _=Depends(require_admin),
):
    is_pdf = (file.content_type == "application/pdf") or (file.filename or "").lower().endswith(".pdf")
    if not is_pdf:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "result.pdf")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    storage_path = f"{stamp}_{safe_name}"

    public_url = await upload_to_supabase_storage(RESULTS_BUCKET, storage_path, content, file.content_type)

    payload = {
        "title": title,
        "cycle": cycle,
        "file_path": storage_path,
        "file_name": file.filename or safe_name,
        "file_size": len(content),
        "file_url": public_url,
        "published": True,
    }
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"{REST}/results",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=payload,
        )
    if r.status_code not in (200, 201):
        # Upload succeeded but the DB insert failed - clean up the orphaned file.
        await delete_from_supabase_storage(RESULTS_BUCKET, storage_path)
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0]


@api.patch("/admin/results/{result_id}")
async def update_result(result_id: str, body: ResultUpdate, _=Depends(require_admin)):
    patch = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.patch(
            f"{REST}/results?id=eq.{result_id}",
            headers={**ADMIN_HEADERS, "Prefer": "return=representation"},
            json=patch,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()[0] if r.json() else {"ok": True}


@api.delete("/admin/results/{result_id}")
async def delete_result(result_id: str, _=Depends(require_admin)):
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{REST}/results?id=eq.{result_id}&select=file_path", headers=ADMIN_HEADERS)
        rows = r.json() if r.status_code == 200 else []
        if rows:
            await delete_from_supabase_storage(RESULTS_BUCKET, rows[0]["file_path"])
        await cx.delete(f"{REST}/results?id=eq.{result_id}", headers=ADMIN_HEADERS)
    return {"ok": True}


@api.get("/results")
async def list_published_results(ctx=Depends(require_user)):
    """Visible to any signed-in user (trainee or admin) - published results only."""
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(
            f"{REST}/results?published=eq.true&select=id,title,cycle,file_name,file_url,created_at&order=created_at.desc",
            headers=ADMIN_HEADERS,
        )
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=r.text)
    return r.json()


# ---------- trainee progress ----------
@api.get("/trainee/progress")
async def my_progress(ctx=Depends(require_user)):
    if ctx["role"] != "trainee":
        raise HTTPException(status_code=403, detail="Trainee only")
    user = ctx["user"]
    async with httpx.AsyncClient(timeout=20) as cx:
        rt = await cx.get(f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=*", headers=ADMIN_HEADERS)
        rows = rt.json() if rt.status_code == 200 else []
        if not rows:
            return {"trainee": None, "progress": []}
        trainee = rows[0]
        p = await cx.get(f"{REST}/lesson_progress?trainee_id=eq.{trainee['id']}&select=*", headers=ADMIN_HEADERS)
        a = await cx.get(f"{REST}/assignments?trainee_id=eq.{trainee['id']}&select=*&order=created_at.desc", headers=ADMIN_HEADERS)
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
        rt = await cx.get(f"{REST}/trainees?auth_user_id=eq.{user['id']}&select=id", headers=ADMIN_HEADERS)
        rows = rt.json() if rt.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Trainee not found")
        trainee_id = rows[0]["id"]

        r = await cx.get(f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}&lesson_id=eq.{body.lesson_id}&select=*", headers=ADMIN_HEADERS)
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
            r2 = await cx.patch(f"{REST}/lesson_progress?id=eq.{existing['id']}", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=payload)
        else:
            r2 = await cx.post(f"{REST}/lesson_progress", headers={**ADMIN_HEADERS, "Prefer": "return=representation"}, json=payload)
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
