"""Builds live station views (latest reading + risk assessment) from the database."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select

from . import config, risk
from .db import station_thresholds, stations, water_readings


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def load_overrides(conn) -> dict[str, dict]:
    return {r.station_id: dict(r._mapping) for r in conn.execute(select(station_thresholds))}


def _recent_history(conn, now: datetime) -> dict[str, list[tuple[datetime, float]]]:
    cutoff = now - timedelta(minutes=config.RAPID_WINDOW_MIN + 30)
    rows = conn.execute(
        select(water_readings.c.station_id, water_readings.c.observed_at, water_readings.c.level_msl)
        .where(water_readings.c.observed_at >= cutoff)
    )
    h: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for r in rows:
        h[r.station_id].append((r.observed_at, r.level_msl))
    return h


def water_views(conn, now: datetime) -> list[dict]:
    overrides = load_overrides(conn)
    hist = _recent_history(conn, now)
    out = []
    for s in conn.execute(select(stations).where(stations.c.kind == "water").order_by(stations.c.name)):
        th = risk.resolve_thresholds(s.bank_level, s.official_critical, overrides.get(s.id))
        a = risk.assess_water(s.level_msl, s.prev_level_msl, s.observed_at, now, th, hist.get(s.id, []))
        out.append({
            "id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon, "amphoe": s.amphoe, "tumbon": s.tumbon,
            "agency": s.agency, "source": s.source, "simulated": s.simulated,
            "level_msl": s.level_msl, "bank_level": s.bank_level, "ground_level": s.ground_level,
            "observed_at": _iso(s.observed_at), "received_at": _iso(s.received_at),
            "source_situation": s.source_situation,
            "thresholds": th.as_dict() if th else None,
            "_observed_dt": s.observed_at,
            **a,
        })
    return out


def rain_views(conn, now: datetime) -> list[dict]:
    out = []
    for s in conn.execute(select(stations).where(stations.c.kind == "rain").order_by(stations.c.name)):
        a = risk.assess_rain(s.rain_1h, s.rain_24h, s.observed_at, now)
        out.append({
            "id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon, "amphoe": s.amphoe, "tumbon": s.tumbon,
            "agency": s.agency, "source": s.source, "simulated": s.simulated,
            "rain_1h": s.rain_1h, "rain_24h": s.rain_24h,
            "observed_at": _iso(s.observed_at), "received_at": _iso(s.received_at),
            "rain_level": a["level"], "reason": a["reason"], "age_minutes": a["age_minutes"],
        })
    return out


def public(view: dict) -> dict:
    return {k: v for k, v in view.items() if not k.startswith("_")}
