"""ThaiWater (HII / สสน.) public open-data adapter, filtered to one province."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from .. import config
from .base import PartialFailure, RainObs, StationInfo, WaterObs

log = logging.getLogger(__name__)

BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public"
WATER_URL = f"{BASE}/waterlevel_load"
RAIN_URL = f"{BASE}/rain_24h"
TH_TZ = timezone(timedelta(hours=7))


def _f(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _ref(v) -> float | None:
    """Reference levels (bank / critical / ground): the source uses 0 for 'not set' (e.g. dams, weirs)."""
    f = _f(v)
    return f if f not in (None, 0.0) else None


def _name(d: dict | None) -> str | None:
    if not d:
        return None
    for k in ("th", "en"):
        v = (d.get(k) or "").strip()
        if v:
            return v
    return None


def _ts(s: str | None) -> datetime | None:
    """ThaiWater timestamps are Thai local time (UTC+7) without zone."""
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=TH_TZ).astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def parse_water(payload: dict, province: str) -> list[WaterObs]:
    out: list[WaterObs] = []
    for r in (payload.get("waterlevel_data") or {}).get("data") or []:
        geo = r.get("geocode") or {}
        st = r.get("station") or {}
        if geo.get("province_code") != province or st.get("id") is None:
            continue
        ts = _ts(r.get("waterlevel_datetime"))
        if ts is None:
            continue
        banks = [b for b in (_ref(st.get("left_bank")), _ref(st.get("right_bank"))) if b is not None]
        bank = _ref(st.get("min_bank")) if _ref(st.get("min_bank")) is not None else (min(banks) if banks else None)
        info = StationInfo(
            id=f"tw-wl-{st['id']}", kind="water",
            name=_name(st.get("tele_station_name")) or f"สถานี {st['id']}",
            lat=_f(st.get("tele_station_lat")), lon=_f(st.get("tele_station_long")),
            amphoe=_name(geo.get("amphoe_name")), tumbon=_name(geo.get("tumbon_name")),
            agency=_name((r.get("agency") or {}).get("agency_shortname")) or _name((r.get("agency") or {}).get("agency_name")),
            bank_level=bank, ground_level=_ref(st.get("ground_level")),
            official_critical=_ref(st.get("critical_level_msl")),
            source_situation=r.get("situation_level") if isinstance(r.get("situation_level"), int) else None,
        )
        out.append(WaterObs(info, ts, _f(r.get("waterlevel_msl")), _f(r.get("waterlevel_msl_previous"))))
    return out


def parse_rain(payload: dict, province: str) -> list[RainObs]:
    out: list[RainObs] = []
    for r in payload.get("data") or []:
        geo = r.get("geocode") or {}
        st = r.get("station") or {}
        if geo.get("province_code") != province or st.get("id") is None:
            continue
        ts = _ts(r.get("rainfall_datetime"))
        if ts is None:
            continue
        info = StationInfo(
            id=f"tw-rn-{st['id']}", kind="rain",
            name=_name(st.get("tele_station_name")) or f"สถานีฝน {st['id']}",
            lat=_f(st.get("tele_station_lat")), lon=_f(st.get("tele_station_long")),
            amphoe=_name(geo.get("amphoe_name")), tumbon=_name(geo.get("tumbon_name")),
            agency=_name((r.get("agency") or {}).get("agency_shortname")) or _name((r.get("agency") or {}).get("agency_name")),
        )
        out.append(RainObs(info, ts, _f(r.get("rain_1h")), _f(r.get("rain_24h"))))
    return out


class ThaiWaterSource:
    name = "thaiwater"
    simulated = False

    def fetch(self) -> tuple[list[WaterObs], list[RainObs]]:
        with httpx.Client(timeout=config.HTTP_TIMEOUT, headers={"User-Agent": "yala-flood-alert/1.0"}) as c:
            w = c.get(WATER_URL)
            w.raise_for_status()
            water = parse_water(w.json(), config.PROVINCE_CODE)
            rain: list[RainObs] = []
            try:
                r = c.get(RAIN_URL)
                r.raise_for_status()
                rain = parse_rain(r.json(), config.PROVINCE_CODE)
            except Exception as e:  # rain failure must not hide water data
                log.warning("rain fetch failed: %s", e)
                raise PartialFailure(water, rain, f"rain: {e}") from e
        return water, rain

