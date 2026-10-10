"""Helpers for moderated citizen flood reports."""
from __future__ import annotations

import base64
import binascii
import hashlib
import re

from . import config

DEPTHS = {"ankle": "ระดับข้อเท้า (ไม่เกิน ~20 ซม.)", "knee": "ระดับเข่า (~50 ซม.)", "waist": "ระดับเอว (~1 ม.)", "above": "สูงกว่าเอว (> 1 ม.)"}
_URL_OR_PHONE = re.compile(r"(https?:|www\.|\.com|\.co\.th|line\.me|@\w{3,}|\b0\d[\d\- ]{7,}\b)", re.I)


def clean_note(note: str | None) -> str | None:
    """Reports are public after approval: no links / phone numbers / handles (spam & privacy)."""
    if not note:
        return None
    note = " ".join(note.split())
    if _URL_OR_PHONE.search(note):
        raise ValueError("note must not contain links, phone numbers or account handles")
    return note[:300] or None


def decode_photo(b64: str | None) -> bytes | None:
    if not b64:
        return None
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("photo is not valid base64")
    if len(raw) > config.REPORT_MAX_PHOTO_BYTES:
        raise ValueError("photo too large")
    if not (raw.startswith(b"\xff\xd8\xff") and raw.endswith(b"\xff\xd9")):
        raise ValueError("photo must be a JPEG")
    return raw


def hash_ip(ip: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}|{ip}".encode()).hexdigest()
