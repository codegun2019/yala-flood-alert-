"""Data Collector + evaluation cycle: fetch -> validate -> store -> assess -> alert -> push."""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import timedelta

from sqlalchemy import func, insert, select, text, update

from . import config, push, status
from .alerts import AlertDraft, plan_alerts
from .db import (
    alerts, data_source_health, insert_ignore, rainfall_readings, station_state, stations, upsert, utcnow,
    water_readings,
)
from .sources import load_sources
from .sources.base import RainObs, WaterObs
from .sources.base import PartialFailure

log = logging.getLogger(__name__)
_lock = threading.Lock()

STATIC_COLS = ["kind", "source", "simulated", "name", "lat", "lon", "amphoe", "tumbon", "agency",
               "bank_level", "ground_level", "official_critical", "source_situation"]


def _valid_time(obs_at, now) -> bool:
    return obs_at <= now + timedelta(minutes=config.FUTURE_TOLERANCE_MIN)


def ingest(conn, water: list[WaterObs], rain: list[RainObs], source: str, simulated: bool, now) -> dict:
    n_w = n_r = rejected = 0
    for o in water:
        if o.level_msl is None or abs(o.level_msl) > 3000 or not _valid_time(o.observed_at, now):
            rejected += 1
            continue
        s = o.station
        values = dict(id=s.id, kind=s.kind, source=source, simulated=simulated, name=s.name, lat=s.lat, lon=s.lon,
                      amphoe=s.amphoe, tumbon=s.tumbon, agency=s.agency, bank_level=s.bank_level,
                      ground_level=s.ground_level, official_critical=s.official_critical,
                      source_situation=s.source_situation, updated_at=now)
        upsert(conn, stations, values, ["id"], STATIC_COLS + ["updated_at"])
        insert_ignore(conn, water_readings, dict(station_id=s.id, observed_at=o.observed_at, received_at=now,
                                                 level_msl=o.level_msl), ["station_id", "observed_at"])
        conn.execute(update(stations).where(
            stations.c.id == s.id, (stations.c.observed_at.is_(None)) | (stations.c.observed_at <= o.observed_at)
        ).values(level_msl=o.level_msl, prev_level_msl=o.prev_level_msl, observed_at=o.observed_at, received_at=now))
        n_w += 1
    for o in rain:
        if (o.rain_1h is None and o.rain_24h is None) or not _valid_time(o.observed_at, now) \
                or (o.rain_1h or 0) > 400 or (o.rain_24h or 0) > 1500 or (o.rain_1h or 0) < 0 or (o.rain_24h or 0) < 0:
            rejected += 1
            continue
        s = o.station
        values = dict(id=s.id, kind=s.kind, source=source, simulated=simulated, name=s.name, lat=s.lat, lon=s.lon,
                      amphoe=s.amphoe, tumbon=s.tumbon, agency=s.agency, updated_at=now)
        upsert(conn, stations, values, ["id"], ["kind", "source", "simulated", "name", "lat", "lon", "amphoe",
                                                "tumbon", "agency", "updated_at"])
        insert_ignore(conn, rainfall_readings, dict(station_id=s.id, observed_at=o.observed_at, received_at=now,
                                                    rain_1h=o.rain_1h, rain_24h=o.rain_24h),
                      ["station_id", "observed_at"])
        conn.execute(update(stations).where(
            stations.c.id == s.id, (stations.c.observed_at.is_(None)) | (stations.c.observed_at <= o.observed_at)
        ).values(rain_1h=o.rain_1h, rain_24h=o.rain_24h, observed_at=o.observed_at, received_at=now))
        n_r += 1
    return {"water": n_w, "rain": n_r, "rejected": rejected}


def _record_health(conn, source: str, now, ok: bool, error: str | None, records: int):
    prev = conn.execute(select(data_source_health).where(data_source_health.c.source == source)).first()
    fails = 0 if ok else ((prev.consecutive_failures if prev else 0) + 1)
    vals = dict(source=source, last_attempt_at=now, last_error=error, consecutive_failures=fails,
                last_success_at=now if ok else (prev.last_success_at if prev else None),
                records=records if ok else (prev.records if prev else 0))
    upsert(conn, data_source_health, vals, ["source"])


def evaluate_and_alert(engine, now) -> list[dict]:
    """Assess all stations, create alert rows, push real (non-simulated) alerts. Returns created alerts."""
    with engine.begin() as conn:
        water = status.water_views(conn, now)
        rain = status.rain_views(conn, now)
        states = {r.station_id: dict(r._mapping) for r in conn.execute(select(station_state))}
        drafts, new_states = plan_alerts(water, rain, states, now)
        for sid, st in new_states.items():
            st = {**st, "station_id": sid}
            upsert(conn, station_state, st, ["station_id"])
        created = []
        for d in drafts:
            res = conn.execute(insert(alerts).values(
                created_at=now, kind=d.kind, station_id=d.station_id, station_name=d.station_name, risk=d.risk,
                title=d.title, body=d.body, simulated=d.simulated, official=False))
            created.append((res.inserted_primary_key[0], d))
        targets = []
        for aid, d in created:
            if d.simulated:
                continue  # simulated data must never reach real phones
            targets.append((aid, d, push.audience(conn, d.kind, d.station_id, d.risk)))
    out = []
    for aid, d, subs in targets:
        try:
            sent = push.deliver(engine, aid, subs, d.title, d.body, url="/?tab=notify", tag=f"{d.kind}-{d.station_id or 'all'}",
                               severity=d.risk if d.risk in ("watch", "high", "critical") else ("rapid" if d.kind == "rapid" else d.kind))
        except Exception:
            log.exception("push delivery failed for alert %s", aid)
            sent = 0
        out.append({"id": aid, "title": d.title, "recipients": len(subs), "sent": sent})
        log.info("alert %s %s -> %d/%d", aid, d.title, sent, len(subs))
    return out


def run_once(engine, source_names: list[str] | None = None) -> dict:
    with _lock:
        summary: dict = {"sources": {}}
        for src in load_sources(source_names or config.DATA_SOURCES):
            now = utcnow()
            water: list[WaterObs] = []
            rain: list[RainObs] = []
            err = None
            try:
                water, rain = src.fetch()
            except PartialFailure as e:
                water, rain, err = e.water, e.rain, str(e)
            except Exception as e:
                err = f"{type(e).__name__}: {e}"[:500]
                log.error("source %s failed: %s", src.name, err)
            with engine.begin() as conn:
                stats = ingest(conn, water, rain, src.name, src.simulated, now) if (water or rain) else {}
                _record_health(conn, src.name, now, ok=err is None, error=err, records=len(water) + len(rain))
            summary["sources"][src.name] = {"error": err, **stats}
        summary["alerts"] = evaluate_and_alert(engine, utcnow())
        return summary


_ADVISORY_KEY = 727_001


def ensure_fresh(engine) -> bool:
    """Serverless fallback: there is no background loop, so a visitor's request refreshes the data when it is
    older than POLL_SECONDS. A DB advisory lock (Postgres) / process lock keeps parallel instances from
    collecting (and alerting) twice. Returns True if a collection ran. Never raises."""
    try:
        with engine.connect() as conn:
            last = conn.execute(select(func.max(data_source_health.c.last_attempt_at))).scalar()
        if last is not None and (utcnow() - last).total_seconds() < config.POLL_SECONDS - 30:
            return False
        if engine.dialect.name == "postgresql":
            with engine.connect() as lock_conn:
                if not lock_conn.execute(text("select pg_try_advisory_lock(:k)"), {"k": _ADVISORY_KEY}).scalar():
                    return False
                try:
                    run_once(engine)
                finally:
                    lock_conn.execute(text("select pg_advisory_unlock(:k)"), {"k": _ADVISORY_KEY})
                    lock_conn.commit()
        else:
            if _lock.locked():
                return False
            run_once(engine)
        return True
    except Exception:
        log.exception("ensure_fresh failed")
        return False


async def loop(engine):
    while True:
        try:
            await asyncio.to_thread(run_once, engine)
        except Exception:
            log.exception("collector cycle crashed")
        await asyncio.sleep(config.POLL_SECONDS)
