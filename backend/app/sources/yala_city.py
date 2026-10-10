"""Yala City Municipality (เทศบาลนครยะลา) telemetry adapter.

Reads the same JSON endpoints the municipality's public telemeter web page uses
(https://cddp-smartcity.localgov.ai/เทศบาลนครยะลา/telemeter). No credentials are
involved. This is an undocumented API: confirm permission with the municipality
before relying on it in production, and keep the polling rate low.
"""
from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx

from .. import config
from .base import PartialFailure, RainObs, StationInfo, WaterObs

log = logging.getLogger(__name__)

API = "https://cddp-smartcity-api.localgov.ai"
AGENCY = "เทศบาลนครยะลา"
# status classes used by the municipal page (water_level_range_N)
SENSOR_MISSING, SENSOR_BROKEN = 1, 7


def _num(v) -> float | None:
    """Source uses 'N/A' and '-' for no data."""
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _status_n(s: str | None) -> int | None:
    m = re.search(r"range_(\d+)$", s or "")
    return int(m.group(1)) if m else None


def _ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _place(loc: str | None) -> tuple[str | None, str | None]:
    tumbon = re.search(r"ต\.\s*([^\s]+)", loc or "")
    amphoe = re.search(r"อ\.\s*([^\s]+)", loc or "")
    return (tumbon.group(1) if tumbon else None, amphoe.group(1) if amphoe else None)


def parse_detail(uid: str, d: dict) -> tuple[WaterObs | None, RainObs | None]:
    coords = (d.get("geometry") or {}).get("coordinates") or [None, None]
    lon, lat = (coords + [None, None])[:2]
    tumbon, amphoe = _place(d.get("telemeterLocation"))
    name = (d.get("telemeterStationName") or "").strip() or f"สถานี {uid[:8]}"
    ts = _ts(d.get("transactionIntervalHour"))
    if ts is None:
        return None, None

    water = rain = None
    wl = d.get("waterLevelDetail") or {}
    level_block = wl.get("waterLevel") or {}
    status = _status_n(level_block.get("status"))
    level = _num(level_block.get("value"))
    # sensor missing / broken => do not trust any number the page may still carry
    if level is not None and status not in (SENSOR_MISSING, SENSOR_BROKEN):
        bank = _num((wl.get("bankLevel") or {}).get("value"))
        bottom = _num((wl.get("bottomLevel") or {}).get("value"))
        water = WaterObs(
            StationInfo(id=f"yc-wl-{uid}", kind="water", name=name, lat=lat, lon=lon, amphoe=amphoe, tumbon=tumbon,
                        agency=AGENCY, bank_level=bank if bank and bank > 0 else None,
                        ground_level=bottom if bottom and bottom > 0 else None,
                        source_situation=status - 1 if status and 2 <= status <= 6 else None),  # align to 1..5 scale
            ts, level, None)

    rd = d.get("rainfallDetail") or {}
    h24 = _num((rd.get("rainfallAcc") or {}).get("value"))
    h1 = _num((rd.get("rainfallPerHour") or {}).get("value"))
    if h24 is not None or h1 is not None:
        rain = RainObs(
            StationInfo(id=f"yc-rn-{uid}", kind="rain", name=name, lat=lat, lon=lon, amphoe=amphoe, tumbon=tumbon,
                        agency=AGENCY), ts, h1, h24)
    return water, rain


class YalaCitySource:
    name = "yala_city"
    simulated = False

    def __init__(self, muni_code: str | None = None):
        self.muni = muni_code or config.YALA_CITY_MUNI_CODE

    def fetch(self) -> tuple[list[WaterObs], list[RainObs]]:
        headers = {"User-Agent": "yala-flood-alert/1.0 (community flood monitor)"}
        with httpx.Client(timeout=config.HTTP_TIMEOUT, headers=headers) as c:
            ids: dict[str, None] = {}
            for t in ("water_level", "rainfall"):
                r = c.get(f"{API}/telemeters/{self.muni}/", params={"type": t})
                r.raise_for_status()
                for item in r.json():
                    ids[item["id"]] = None  # same station id serves both water + rain
            if not ids:
                raise RuntimeError("station list is empty")

            def one(uid: str):
                try:
                    r = c.get(f"{API}/telemeters/{self.muni}/{uid}")
                    r.raise_for_status()
                    return uid, parse_detail(uid, r.json()), None
                except Exception as e:
                    return uid, (None, None), f"{uid[:8]}: {type(e).__name__}"

            with ThreadPoolExecutor(max_workers=4) as ex:
                results = list(ex.map(one, ids))

        water = [w for _, (w, _r), _e in results if w]
        rain = [r for _, (_w, r), _e in results if r]
        errors = [e for *_, e in results if e]
        if errors and len(errors) == len(results):
            raise RuntimeError("all station requests failed: " + "; ".join(errors[:3]))
        if errors:
            raise PartialFailure(water, rain, f"{len(errors)}/{len(results)} stations failed: " + "; ".join(errors[:3]))
        return water, rain
