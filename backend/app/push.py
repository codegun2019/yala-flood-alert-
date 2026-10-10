"""Web Push (VAPID) delivery with audience filtering, retry and delivery logs."""
from __future__ import annotations

import base64
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from py_vapid import Vapid01
from cryptography.hazmat.primitives import serialization
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, insert, select, update

from . import config
from .db import (
    notification_logs, notification_preferences, push_subscriptions, utcnow,
)
from .risk import rank

log = logging.getLogger(__name__)


def _vapid_paths():
    config.VAPID_DIR.mkdir(parents=True, exist_ok=True)
    return config.VAPID_DIR / "private.pem", config.VAPID_DIR / "public.pem"


def ensure_vapid() -> str:
    """Create keys on first run; returns the public key in the format browsers expect."""
    priv, pub = _vapid_paths()
    if not priv.exists():
        v = Vapid01()
        v.generate_keys()
        v.save_key(str(priv))
        v.save_public_key(str(pub))
        priv.chmod(0o600)
    v = Vapid01.from_file(str(priv))
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def audience(conn, kind: str, station_id: str | None, risk: str | None, official: bool = False) -> list[dict]:
    """Which subscriptions should receive this alert."""
    rows = conn.execute(
        select(push_subscriptions, notification_preferences.c.stations, notification_preferences.c.min_level,
               notification_preferences.c.notify_rain)
        .select_from(push_subscriptions.outerjoin(
            notification_preferences, notification_preferences.c.subscription_id == push_subscriptions.c.id))
    ).all()
    out = []
    for r in rows:
        stations = json.loads(r.stations or "[]")
        min_level = r.min_level or "watch"
        notify_rain = True if r.notify_rain is None else bool(r.notify_rain)
        if official or kind == "test":
            ok = True
        elif kind == "rain":
            ok = notify_rain
        elif kind == "stale":
            ok = station_id in stations  # only people who explicitly follow this station
        else:  # risk / rapid
            in_scope = not stations or station_id in stations
            ok = in_scope and (kind == "rapid" or rank(risk) >= rank(min_level))
        if ok:
            out.append({"id": r.id, "endpoint": r.endpoint, "p256dh": r.p256dh, "auth": r.auth})
    return out


def _send_one(sub: dict, payload: str, urgency: str = "normal") -> tuple[str, str | None]:
    priv, _ = _vapid_paths()
    last_err = None
    for attempt in range(2):
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload, vapid_private_key=str(priv), vapid_claims={"sub": config.VAPID_SUBJECT},
                ttl=3600 * 6 if urgency == "high" else 3600 * 2, timeout=15,
                headers={"Urgency": urgency},  # "high" wakes a sleeping phone promptly
            )
            return "sent", None
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            if code in (404, 410):
                return "expired", f"HTTP {code}"
            last_err = f"{type(e).__name__}: {e}"[:300]
            if code is not None and 400 <= code < 500 and code != 429:
                break
        except Exception as e:  # network errors
            last_err = f"{type(e).__name__}: {e}"[:300]
        time.sleep(2 * (attempt + 1))
    return "failed", last_err


SEVERE = {"watch": "normal", "high": "high", "critical": "high", "official": "high", "test": "high", "rapid": "high", "rain": "normal"}


def deliver_results(engine, alert_id: int | None, subs: list[dict], title: str, body: str, url: str = "/",
                    tag: str | None = None, severity: str = "watch") -> list[tuple[dict, str, str | None]]:
    """Send to every sub; record results; drop dead subscriptions. Returns [(sub, status, error)]."""
    if not subs:
        return []
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag or f"alert-{alert_id}",
                          "severity": severity, "ts": int(time.time() * 1000)}, ensure_ascii=False)
    urgency = SEVERE.get(severity, "normal")
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda s: (s, *_send_one(s, payload, urgency)), subs))
    now = utcnow()
    with engine.begin() as conn:
        for s, status, err in results:
            conn.execute(insert(notification_logs).values(
                alert_id=alert_id, subscription_id=s["id"], status=status, error=err, created_at=now))
            if status == "sent":
                conn.execute(update(push_subscriptions).where(push_subscriptions.c.id == s["id"])
                             .values(last_success_at=now, failures=0))
            elif status == "expired":
                conn.execute(delete(notification_preferences).where(notification_preferences.c.subscription_id == s["id"]))
                conn.execute(delete(push_subscriptions).where(push_subscriptions.c.id == s["id"]))
            else:
                conn.execute(update(push_subscriptions).where(push_subscriptions.c.id == s["id"])
                             .values(failures=push_subscriptions.c.failures + 1))
    return results


def deliver(engine, alert_id: int | None, subs: list[dict], title: str, body: str, url: str = "/",
            tag: str | None = None, severity: str = "watch") -> int:
    """Returns number successfully sent."""
    return sum(1 for _, st, _ in deliver_results(engine, alert_id, subs, title, body, url, tag, severity) if st == "sent")
