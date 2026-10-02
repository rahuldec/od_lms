"""Vercel Python entrypoint - re-exports the FastAPI app from server.py.

Vercel's @vercel/python runtime auto-detects an ASGI `app` object exported
from a file under /api and wraps it directly (no adapter like Mangum
needed, unlike AWS Lambda). All real routes/logic stay in server.py;
this file only exists to satisfy Vercel's file-based routing convention.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from server import app  # noqa: E402
