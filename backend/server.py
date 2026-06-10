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


class TraineeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    join_date: Optional[str] = None
    manager: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ProgressIn(BaseModel):
    lesson_id: str
    watched: Optional[bool] = None
    watch_seconds_delta: Optional[int] = 0
    set_watch_seconds: Optional[int] = None


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
        # check if user exists by listing
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
            # reset password to known value (idempotent setup)
            await cx.put(
                f"{AUTH}/admin/users/{user_id}",
                headers=ADMIN_HEADERS,
                json={"password": ADMIN_PASSWORD},
            )
            created = False

        # ensure role row
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
        # check if username/email already exists
        existing_r = await cx.get(
            f"{REST}/trainees?username=eq.{username}&select=id",
            headers=ADMIN_HEADERS,
        )
        if existing_r.status_code == 200 and len(existing_r.json()) > 0:
            raise HTTPException(status_code=400, detail="Username already taken")

        # create auth user
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

        # insert trainee
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
            # rollback auth user
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
        # fetch trainee to get auth_user_id
        r = await cx.get(
            f"{REST}/trainees?id=eq.{trainee_id}&select=*",
            headers=ADMIN_HEADERS,
        )
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Not found")
        t = rows[0]
        auth_user_id = t.get("auth_user_id")

        # delete lesson_progress
        await cx.delete(
            f"{REST}/lesson_progress?trainee_id=eq.{trainee_id}",
            headers=ADMIN_HEADERS,
        )
        # delete trainee
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
    return {"trainee": rows[0], "progress": p.json() if p.status_code == 200 else []}


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
    return {"trainee": trainee, "progress": p.json() if p.status_code == 200 else []}


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
