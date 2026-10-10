"""YALA FLOOD ALERT — FastAPI application."""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import secrets
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, insert, select, update

from . import collector, config, push, risk, status
from .db import (
    alerts, announcements, data_source_health, get_engine, init_db, notification_logs, notification_preferences,
    push_subscriptions, rainfall_readings, station_thresholds, stations, upsert, utcnow, water_readings,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("yala")

VAPID_PUBLIC = ""


def admin_token() -> str:
    import os
    tok = os.getenv("ADMIN_TOKEN")
    if tok:
        return tok
    if config.SERVERLESS:  # a per-instance random token would be unusable
        raise HTTPException(503, "ADMIN_TOKEN is not configured")
    f = config.ADMIN_TOKEN_FILE
    if not f.exists():
        f.write_text(secrets.token_urlsafe(32))
        f.chmod(0o600)
    return f.read_text().strip()


_boot_lock = threading.Lock()
_booted = False


def boot() -> None:
    """Idempotent start-up (tables + VAPID). Also called lazily on the first request because
    serverless hosts may not run the ASGI lifespan."""
    global VAPID_PUBLIC, _booted
    if _booted:
        return
    with _boot_lock:
        if _booted:
            return
        init_db()
        try:
            VAPID_PUBLIC = push.ensure_vapid()
        except Exception:  # keep the public dashboard working even if push is misconfigured
            log.exception("VAPID not available; push disabled")
        _booted = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    boot()
    if not config.SERVERLESS:
        admin_token()
        log.info("admin token stored at %s (or ADMIN_TOKEN env)", config.ADMIN_TOKEN_FILE)
    # No background loop on serverless: /api/cron/collect is called by an external scheduler instead.
    task = asyncio.create_task(collector.loop(get_engine())) if not (_disabled_collector() or config.SERVERLESS) else None
    yield
    if task:
        task.cancel()


def _disabled_collector() -> bool:
    import os
    return os.getenv("DISABLE_COLLECTOR") == "1"


app = FastAPI(title="YALA FLOOD ALERT API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def _ensure_boot(request, call_next):
    if not _booted:
        await asyncio.to_thread(boot)
    return await call_next(request)


def require_admin(x_admin_token: str | None = Header(default=None)):
    if not x_admin_token or not hmac.compare_digest(x_admin_token, admin_token()):
        raise HTTPException(401, "unauthorized")


def _iso(d):
    return d.isoformat() if d else None


# ---------------------------------------------------------------- public: stations & readings
@app.get("/api/stations")
def list_stations(kind: Literal["water", "rain"] | None = None):
    now = utcnow()
    with get_engine().connect() as conn:
        items = []
        if kind in (None, "water"):
            items += [{"kind": "water", **status.public(v)} for v in status.water_views(conn, now)]
        if kind in (None, "rain"):
            items += [{"kind": "rain", **v} for v in status.rain_views(conn, now)]
    return {"now": now.isoformat(), "stations": items}


@app.get("/api/stations/{station_id}")
def get_station(station_id: str):
    now = utcnow()
    with get_engine().connect() as conn:
        for v in status.water_views(conn, now):
            if v["id"] == station_id:
                return {"kind": "water", **status.public(v)}
        for v in status.rain_views(conn, now):
            if v["id"] == station_id:
                return {"kind": "rain", **v}
    raise HTTPException(404, "station not found")


@app.get("/api/water/latest")
def water_latest():
    now = utcnow()
    with get_engine().connect() as conn:
        views = status.water_views(conn, now)
    return {"now": now.isoformat(), "stations": [status.public(v) for v in views], "source_health": _source_health()}


@app.get("/api/water/history")
def water_history(station_id: str, hours: int = Query(48, ge=1, le=24 * 30)):
    cutoff = utcnow() - timedelta(hours=hours)
    with get_engine().connect() as conn:
        rows = conn.execute(select(water_readings.c.observed_at, water_readings.c.level_msl)
                            .where(water_readings.c.station_id == station_id, water_readings.c.observed_at >= cutoff)
                            .order_by(water_readings.c.observed_at)).all()
        s = conn.execute(select(stations).where(stations.c.id == station_id)).first()
        if not s:
            raise HTTPException(404, "station not found")
        th = risk.resolve_thresholds(s.bank_level, s.official_critical,
                                     status.load_overrides(conn).get(station_id))
    return {"station_id": station_id, "name": s.name, "thresholds": th.as_dict() if th else None,
            "points": [{"t": r.observed_at.isoformat(), "v": r.level_msl} for r in rows]}


@app.get("/api/rainfall/latest")
def rainfall_latest():
    now = utcnow()
    with get_engine().connect() as conn:
        return {"now": now.isoformat(), "stations": status.rain_views(conn, now), "source_health": _source_health()}


@app.get("/api/rainfall/history")
def rainfall_history(station_id: str, hours: int = Query(48, ge=1, le=24 * 30)):
    cutoff = utcnow() - timedelta(hours=hours)
    with get_engine().connect() as conn:
        rows = conn.execute(select(rainfall_readings).where(
            rainfall_readings.c.station_id == station_id, rainfall_readings.c.observed_at >= cutoff)
            .order_by(rainfall_readings.c.observed_at)).all()
    return {"station_id": station_id, "points": [
        {"t": r.observed_at.isoformat(), "rain_1h": r.rain_1h, "rain_24h": r.rain_24h} for r in rows]}


# ---------------------------------------------------------------- public: alerts & announcements
def _active_announcements(conn, now):
    rows = conn.execute(select(announcements).where(announcements.c.active.is_(True))
                        .order_by(desc(announcements.c.created_at))).all()
    return [{"id": r.id, "created_at": _iso(r.created_at), "title": r.title, "body": r.body, "severity": r.severity,
             "official": True} for r in rows if r.expires_at is None or r.expires_at > now]


@app.get("/api/alerts/active")
def alerts_active():
    """Live situation: official announcements (separate!) + auto-detected conditions."""
    now = utcnow()
    with get_engine().connect() as conn:
        water = status.water_views(conn, now)
        rain = status.rain_views(conn, now)
        ann = _active_announcements(conn, now)
    auto = [status.public(v) for v in water if v["risk"] in ("watch", "high", "critical", "stale")]
    auto.sort(key=lambda v: -risk.rank(v["risk"]) if v["risk"] != "stale" else 0)
    heavy = [v for v in rain if v["rain_level"] in ("heavy", "very_heavy")]
    return {"now": now.isoformat(), "official_announcements": ann, "auto_water": auto, "auto_rain": heavy,
            "notice": "การเตือนอัตโนมัติมาจากข้อมูลสถานี ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ"}


@app.get("/api/alerts")
def alerts_history(limit: int = Query(50, ge=1, le=200), include_simulated: bool = False):
    q = select(alerts).order_by(desc(alerts.c.created_at)).limit(limit)
    if not include_simulated:
        q = q.where(alerts.c.simulated.is_(False))
    with get_engine().connect() as conn:
        rows = conn.execute(q).all()
    return {"alerts": [{"id": r.id, "created_at": _iso(r.created_at), "kind": r.kind, "station_id": r.station_id,
                        "station_name": r.station_name, "risk": r.risk, "title": r.title, "body": r.body,
                        "official": r.official, "simulated": r.simulated} for r in rows]}


@app.get("/api/announcements")
def announcements_list():
    now = utcnow()
    with get_engine().connect() as conn:
        return {"announcements": _active_announcements(conn, now)}


@app.get("/api/cctv")
def cctv():
    return {"cameras": config.CCTV_LINKS, "sources": config.SOURCE_LINKS}


def _source_health() -> list[dict]:
    now = utcnow()
    with get_engine().connect() as conn:
        rows = conn.execute(select(data_source_health)).all()
    out = []
    for r in rows:
        age = (now - r.last_success_at).total_seconds() / 60 if r.last_success_at else None
        ok = age is not None and age <= max(3 * config.POLL_SECONDS / 60, 15) and r.consecutive_failures < 3
        out.append({"source": r.source, "ok": ok, "last_success_at": _iso(r.last_success_at),
                    "age_minutes": age, "consecutive_failures": r.consecutive_failures,
                    "simulated": r.source == "mock"})
    return out


@app.get("/api/system-status")
def system_status():
    return {"now": utcnow().isoformat(), "poll_seconds": config.POLL_SECONDS, "stale_minutes": config.STALE_MINUTES,
            "sources": _source_health()}


# ---------------------------------------------------------------- push subscription
class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Sub(BaseModel):
    endpoint: str = Field(max_length=2000)
    keys: Keys


class SubscribeIn(BaseModel):
    subscription: Sub
    stations: list[str] = Field(default_factory=list, max_length=200)
    min_level: Literal["watch", "high", "critical"] = "watch"
    notify_rain: bool = True


class PrefsIn(BaseModel):
    endpoint: str = Field(max_length=2000)
    stations: list[str] = Field(default_factory=list, max_length=200)
    min_level: Literal["watch", "high", "critical"] = "watch"
    notify_rain: bool = True


@app.get("/api/push/public-key")
def push_public_key():
    return {"publicKey": VAPID_PUBLIC}


def _save_prefs(conn, sub_id: int, stations_: list[str], min_level: str, notify_rain: bool):
    ids = sorted({s[:64] for s in stations_})
    upsert(conn, notification_preferences, dict(subscription_id=sub_id, stations=json.dumps(ids),
                                                min_level=min_level, notify_rain=notify_rain), ["subscription_id"])


@app.post("/api/push/subscribe")
def push_subscribe(body: SubscribeIn):
    if not body.subscription.endpoint.startswith("https://"):
        raise HTTPException(400, "invalid endpoint")
    with get_engine().begin() as conn:
        upsert(conn, push_subscriptions, dict(endpoint=body.subscription.endpoint, p256dh=body.subscription.keys.p256dh,
                                              auth=body.subscription.keys.auth, created_at=utcnow(), failures=0),
               ["endpoint"], ["p256dh", "auth", "failures"])
        sid = conn.execute(select(push_subscriptions.c.id).where(
            push_subscriptions.c.endpoint == body.subscription.endpoint)).scalar_one()
        _save_prefs(conn, sid, body.stations, body.min_level, body.notify_rain)
    return {"ok": True}


@app.post("/api/alerts/preferences")
def alerts_preferences(body: PrefsIn):
    with get_engine().begin() as conn:
        sid = conn.execute(select(push_subscriptions.c.id).where(push_subscriptions.c.endpoint == body.endpoint)).scalar()
        if sid is None:
            raise HTTPException(404, "subscription not found")
        _save_prefs(conn, sid, body.stations, body.min_level, body.notify_rain)
    return {"ok": True}


class UnsubIn(BaseModel):
    endpoint: str = Field(max_length=2000)


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: UnsubIn):
    with get_engine().begin() as conn:
        sid = conn.execute(select(push_subscriptions.c.id).where(push_subscriptions.c.endpoint == body.endpoint)).scalar()
        if sid is not None:
            conn.execute(delete(notification_preferences).where(notification_preferences.c.subscription_id == sid))
            conn.execute(delete(push_subscriptions).where(push_subscriptions.c.id == sid))
    return {"ok": True}


class SelfTestIn(BaseModel):
    endpoint: str = Field(max_length=2000)


_last_selftest: dict[str, float] = {}


@app.post("/api/push/test")
def push_self_test(body: SelfTestIn):
    """Send a test notification to the caller's own device only (rate-limited)."""
    import time
    now_t = time.time()
    if now_t - _last_selftest.get(body.endpoint, 0) < 15:
        raise HTTPException(429, "รอสักครู่ก่อนกดทดสอบอีกครั้ง (15 วินาที)")
    with get_engine().begin() as conn:
        row = conn.execute(select(push_subscriptions).where(push_subscriptions.c.endpoint == body.endpoint)).first()
        if not row:
            raise HTTPException(404, "ยังไม่ได้สมัครรับแจ้งเตือนบนเครื่องนี้")
        aid = conn.execute(insert(alerts).values(
            created_at=utcnow(), kind="test", title="ทดสอบการแจ้งเตือนรายเครื่อง", body="self-test", simulated=True,
            official=False)).inserted_primary_key[0]
    _last_selftest[body.endpoint] = now_t
    if len(_last_selftest) > 5000:
        _last_selftest.clear()
    sub = {"id": row.id, "endpoint": row.endpoint, "p256dh": row.p256dh, "auth": row.auth}
    res = push.deliver_results(
        get_engine(), aid, [sub], "🧪 ทดสอบแจ้งเตือน YALA FLOOD ALERT",
        "ถ้าคุณเห็นข้อความนี้ที่หน้าจอ แสดงว่าระบบแจ้งเตือนทำงานปกติ\n(ข้อความทดสอบ ไม่ใช่เหตุการณ์จริง)",
        "/?tab=notify", f"selftest-{row.id}", "test")
    _, status_, err = res[0]
    if status_ == "expired":
        raise HTTPException(410, "การสมัครหมดอายุ กรุณาเปิดการแจ้งเตือนใหม่อีกครั้ง")
    return {"status": status_, "error": err}


class ResubIn(BaseModel):
    old_endpoint: str = Field(max_length=2000)
    subscription: Sub


@app.post("/api/push/resubscribe")
def push_resubscribe(body: ResubIn):
    """Browser rotated the push subscription (pushsubscriptionchange): keep the user's preferences."""
    if not body.subscription.endpoint.startswith("https://"):
        raise HTTPException(400, "invalid endpoint")
    with get_engine().begin() as conn:
        row = conn.execute(select(push_subscriptions.c.id).where(push_subscriptions.c.endpoint == body.old_endpoint)).first()
        if not row:
            raise HTTPException(404, "subscription not found")
        conn.execute(update(push_subscriptions).where(push_subscriptions.c.id == row.id).values(
            endpoint=body.subscription.endpoint, p256dh=body.subscription.keys.p256dh,
            auth=body.subscription.keys.auth, failures=0))
    return {"ok": True}


# ---------------------------------------------------------------- admin
@app.get("/api/admin/system-status", dependencies=[Depends(require_admin)])
def admin_system_status():
    now = utcnow()
    day = now - timedelta(hours=24)
    with get_engine().connect() as conn:
        water = status.water_views(conn, now)
        n_subs = conn.execute(select(func.count()).select_from(push_subscriptions)).scalar()
        logs = dict(conn.execute(select(notification_logs.c.status, func.count()).where(
            notification_logs.c.created_at >= day).group_by(notification_logs.c.status)).all())
        overrides = status.load_overrides(conn)
        health = conn.execute(select(data_source_health)).all()
    stations_out = []
    for v in water:
        d = status.public(v)
        o = overrides.get(v["id"])
        d["override"] = None if not o else {"watch_msl": o["watch_msl"], "high_msl": o["high_msl"],
                                            "critical_msl": o["critical_msl"], "verified": o["verified"],
                                            "note": o["note"]}
        stations_out.append(d)
    return {
        "now": now.isoformat(), "poll_seconds": config.POLL_SECONDS, "stale_minutes": config.STALE_MINUTES,
        "subscriptions": n_subs, "notifications_24h": logs, "stations": stations_out,
        "sources": [{"source": h.source, "last_attempt_at": _iso(h.last_attempt_at),
                     "last_success_at": _iso(h.last_success_at), "last_error": h.last_error,
                     "consecutive_failures": h.consecutive_failures, "records": h.records} for h in health],
        "defaults": {"watch_margin_m": config.WATCH_MARGIN_M, "high_margin_m": config.HIGH_MARGIN_M},
    }


class ThresholdIn(BaseModel):
    watch_msl: float
    high_msl: float
    critical_msl: float
    verified: bool = False
    note: str | None = Field(default=None, max_length=500)


@app.put("/api/admin/thresholds/{station_id}", dependencies=[Depends(require_admin)])
def admin_set_threshold(station_id: str, body: ThresholdIn):
    err = risk.validate_thresholds(body.watch_msl, body.high_msl, body.critical_msl)
    if err:
        raise HTTPException(422, err)
    with get_engine().begin() as conn:
        if not conn.execute(select(stations.c.id).where(stations.c.id == station_id, stations.c.kind == "water")).first():
            raise HTTPException(404, "station not found")
        upsert(conn, station_thresholds, dict(station_id=station_id, **body.model_dump(), updated_at=utcnow()),
               ["station_id"])
    return {"ok": True}


@app.delete("/api/admin/thresholds/{station_id}", dependencies=[Depends(require_admin)])
def admin_reset_threshold(station_id: str):
    with get_engine().begin() as conn:
        conn.execute(delete(station_thresholds).where(station_thresholds.c.station_id == station_id))
    return {"ok": True}


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=4000)
    severity: Literal["info", "watch", "high", "critical"] = "info"
    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 30)
    push: bool = False


@app.post("/api/admin/announcements", dependencies=[Depends(require_admin)])
def admin_create_announcement(body: AnnouncementIn):
    now = utcnow()
    exp = now + timedelta(hours=body.expires_in_hours) if body.expires_in_hours else None
    recipients = sent = 0
    with get_engine().begin() as conn:
        aid = conn.execute(insert(announcements).values(
            created_at=now, title=body.title, body=body.body, severity=body.severity, active=True,
            expires_at=exp)).inserted_primary_key[0]
        alert_id = None
        subs = []
        if body.push:
            alert_id = conn.execute(insert(alerts).values(
                created_at=now, kind="official", title=f"📢 ประกาศ: {body.title}", body=body.body, risk=None,
                simulated=False, official=True)).inserted_primary_key[0]
            subs = push.audience(conn, "official", None, None, official=True)
    if body.push and subs:
        recipients = len(subs)
        sent = push.deliver(get_engine(), alert_id, subs, f"📢 ประกาศ: {body.title}", body.body, "/", "official", "official")
    return {"id": aid, "recipients": recipients, "sent": sent}


@app.delete("/api/admin/announcements/{ann_id}", dependencies=[Depends(require_admin)])
def admin_deactivate_announcement(ann_id: int):
    with get_engine().begin() as conn:
        conn.execute(update(announcements).where(announcements.c.id == ann_id).values(active=False))
    return {"ok": True}


@app.api_route("/api/cron/collect", methods=["GET", "POST"])
async def cron_collect(authorization: str | None = Header(default=None), x_cron_secret: str | None = Header(default=None)):
    """Called every ~5 min by an external scheduler (serverless has no background loop)."""
    if not config.CRON_SECRET:
        raise HTTPException(503, "CRON_SECRET is not configured")
    given = x_cron_secret or (authorization[7:] if authorization and authorization.startswith("Bearer ") else "")
    if not given or not hmac.compare_digest(given, config.CRON_SECRET):
        raise HTTPException(401, "unauthorized")
    summary = await asyncio.to_thread(collector.run_once, get_engine())
    return {"ok": True, "sources": {k: v.get("error") for k, v in summary["sources"].items()},
            "alerts": len(summary["alerts"])}


@app.post("/api/admin/collect", dependencies=[Depends(require_admin)])
async def admin_collect():
    return await asyncio.to_thread(collector.run_once, get_engine())


class TestPushIn(BaseModel):
    message: str = Field(default="ทดสอบระบบแจ้งเตือน (ข้อความทดสอบ ไม่ใช่เหตุการณ์จริง)", max_length=300)


@app.post("/api/admin/test-push", dependencies=[Depends(require_admin)])
def admin_test_push(body: TestPushIn):
    now = utcnow()
    with get_engine().begin() as conn:
        aid = conn.execute(insert(alerts).values(
            created_at=now, kind="test", title="🧪 ทดสอบการแจ้งเตือน", body=body.message, simulated=True,
            official=False)).inserted_primary_key[0]
        subs = push.audience(conn, "test", None, None)
    sent = push.deliver(get_engine(), aid, subs, "🧪 ทดสอบการแจ้งเตือน", body.message, "/", "test", "test")
    return {"recipients": len(subs), "sent": sent}
