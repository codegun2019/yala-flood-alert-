"""24-hour rain forecast (Open-Meteo, free model data). NOT an official forecast: shown as a supplement,
clearly labelled in the UI. Cached in memory; on failure callers get None and the UI hides the card."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from . import config

log = logging.getLogger(__name__)
BKK = timezone(timedelta(hours=7))
URL = "https://api.open-meteo.com/v1/forecast"
CACHE_SECONDS = 30 * 60
# Yala province centre (used when the caller gives no coordinates) and the area we accept queries for.
CENTER = (6.54, 101.28)
BBOX = (5.4, 7.1, 100.7, 102.2)  # lat_min, lat_max, lon_min, lon_max

_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_lock = threading.Lock()


def snap(lat: float | None, lon: float | None) -> tuple[float, float]:
    """Round to a 0.1° grid (~11 km): good enough for rain and keeps the cache small / no arbitrary proxying."""
    if lat is None or lon is None:
        return CENTER
    if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]):
        raise ValueError("outside Yala area")
    return round(lat, 1), round(lon, 1)


def summarize(hours: list[dict]) -> dict:
    total = round(sum(h["mm"] for h in hours), 1)
    peak = max(hours, key=lambda h: h["mm"]) if hours else None
    max_prob = max((h["prob"] or 0 for h in hours), default=0)
    if total >= config.RAIN_24H_VERY_HEAVY:
        level, label = "very_heavy", "ฝนหนักมาก"
    elif total >= config.RAIN_24H_HEAVY or (peak and peak["mm"] >= config.RAIN_1H_ALERT):
        level, label = "heavy", "ฝนหนัก"
    elif total >= 10:
        level, label = "moderate", "ฝนปานกลาง"
    elif total >= 1:
        level, label = "light", "ฝนเล็กน้อย"
    else:
        level, label = "none", "แทบไม่มีฝน"
    return {"total_mm": total, "max_prob": max_prob, "level": level, "label": label,
            "peak_at": peak["t"] if peak and peak["mm"] > 0 else None, "peak_mm": peak["mm"] if peak else 0}


def parse(payload: dict, now: datetime) -> list[dict]:
    h = payload["hourly"]
    start = now.astimezone(BKK).replace(minute=0, second=0, microsecond=0).replace(tzinfo=None)
    out = []
    for t, mm, pr in zip(h["time"], h["precipitation"], h.get("precipitation_probability") or [None] * len(h["time"])):
        dt = datetime.fromisoformat(t)
        if dt < start or mm is None:
            continue
        out.append({"t": dt.replace(tzinfo=BKK).isoformat(), "mm": round(float(mm), 1), "prob": None if pr is None else int(pr)})
        if len(out) == 24:
            break
    return out


def get_rain_forecast(lat: float | None = None, lon: float | None = None, now: datetime | None = None) -> dict | None:
    key = snap(lat, lon)
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    try:
        r = httpx.get(URL, params={"latitude": key[0], "longitude": key[1], "hourly": "precipitation,precipitation_probability",
                                   "forecast_days": 2, "timezone": "Asia/Bangkok"}, timeout=10)
        r.raise_for_status()
        hours = parse(r.json(), now or datetime.now(timezone.utc))
        if len(hours) < 12:
            raise ValueError("forecast too short")
    except Exception as e:  # noqa: BLE001
        log.warning("forecast fetch failed: %s", e)
        with _lock:
            old = _cache.get(key)  # serve stale cache (flagged) rather than nothing, but only if < 3 h old
        if old and time.time() - old[0] < 3 * 3600:
            return {**old[1], "stale": True}
        return None
    data = {"source": "Open-Meteo", "official": False, "lat": key[0], "lon": key[1],
            "generated_at": datetime.now(timezone.utc).isoformat(), "stale": False,
            "hours": hours, "summary": summarize(hours)}
    with _lock:
        _cache[key] = (time.time(), data)
    return data
