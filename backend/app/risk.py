"""Risk assessment. Pure functions, no I/O.

Safety rules:
  * Missing / stale / threshold-less data is NEVER reported as "normal".
  * Thresholds are per-station. Defaults derive from the station's lowest bank
    level and are flagged as uncertified; admin overrides take precedence.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from . import config

RANK = {"unknown": -1, "stale": -1, "normal": 0, "watch": 1, "high": 2, "critical": 3}
ALERT_LEVELS = ("watch", "high", "critical")


def rank(risk: str | None) -> int:
    return RANK.get(risk or "", -1)


@dataclass
class Thresholds:
    watch: float
    high: float
    critical: float
    source: str  # admin_verified | admin | official | bank_default

    def as_dict(self) -> dict:
        return {"watch": self.watch, "high": self.high, "critical": self.critical, "source": self.source}


def resolve_thresholds(bank: float | None, official_critical: float | None, override: dict | None) -> Thresholds | None:
    if override:
        return Thresholds(override["watch_msl"], override["high_msl"], override["critical_msl"],
                          "admin_verified" if override.get("verified") else "admin")
    official_critical = official_critical if official_critical and official_critical > 0 else None
    bank = bank if bank and bank > 0 else None
    crit, src = (official_critical, "official") if official_critical is not None else (bank, "bank_default")
    if crit is None:
        return None
    return Thresholds(crit - config.WATCH_MARGIN_M, crit - config.HIGH_MARGIN_M, crit, src)


def validate_thresholds(watch: float, high: float, critical: float) -> str | None:
    if not (watch < high < critical):
        return "ต้องกำหนดให้ เฝ้าระวัง < เสี่ยงสูง < วิกฤต"
    return None


def level_risk(level: float, th: Thresholds) -> str:
    if level >= th.critical:
        return "critical"
    if level >= th.high:
        return "high"
    if level >= th.watch:
        return "watch"
    return "normal"


def rise_rate(history: list[tuple[datetime, float]], now: datetime) -> float | None:
    """m/hour over the recent window using (observed_at, level) points, or None if not enough data."""
    cutoff = now - timedelta(minutes=config.RAPID_WINDOW_MIN)
    pts = sorted(p for p in history if p[0] >= cutoff)
    if len(pts) < 2:
        return None
    (t0, v0), (t1, v1) = pts[0], pts[-1]
    hours = (t1 - t0).total_seconds() / 3600
    if hours < 20 / 60:
        return None
    return (v1 - v0) / hours


def trend_label(rate: float | None, level: float | None = None, prev: float | None = None) -> str | None:
    if rate is None and level is not None and prev is not None:
        d = level - prev  # direction only; interval unknown
        return "rising" if d > 0.01 else "falling" if d < -0.01 else "steady"
    if rate is None:
        return None
    return "rising" if rate > config.TREND_EPS_M_PER_H else "falling" if rate < -config.TREND_EPS_M_PER_H else "steady"


def assess_water(level: float | None, prev_level: float | None, observed_at: datetime | None, now: datetime,
                 th: Thresholds | None, history: list[tuple[datetime, float]]) -> dict:
    age_min = None if observed_at is None else (now - observed_at).total_seconds() / 60
    res = {"risk": "unknown", "last_known_risk": None, "reason": "", "trend": None, "rate_m_per_h": None,
           "rapid_rise": False, "margin_to_critical": None, "age_minutes": age_min}
    if level is None or observed_at is None:
        res["reason"] = "ไม่มีข้อมูลระดับน้ำล่าสุด"
        return res
    if th is None:
        res["reason"] = "ยังไม่มีเกณฑ์ระดับน้ำของสถานีนี้"
        return res

    rate = rise_rate(history, now)
    base = level_risk(level, th)
    margin = th.critical - level
    res.update(rate_m_per_h=rate, trend=trend_label(rate, level, prev_level), margin_to_critical=margin)
    rapid = rate is not None and rate >= config.RAPID_RISE_M_PER_H and margin <= config.RAPID_NEAR_M
    res["rapid_rise"] = rapid
    if rapid and base == "normal":
        base = "watch"
        res["reason"] = f"ระดับน้ำเพิ่มขึ้นเร็ว {rate:.2f} ม./ชม."

    if age_min is not None and age_min > config.STALE_MINUTES:
        res.update(risk="stale", last_known_risk=base,
                   reason=f"ข้อมูลหยุดอัปเดตมา {int(age_min // 60)} ชม. {int(age_min % 60)} นาที")
        res["rapid_rise"] = False  # old data must not trigger rapid alerts
        return res
    res["risk"] = base
    if not res["reason"]:
        res["reason"] = {
            "critical": "ระดับน้ำถึงเกณฑ์วิกฤต", "high": "ระดับน้ำใกล้เกณฑ์วิกฤต",
            "watch": "ระดับน้ำเริ่มสูงขึ้น", "normal": "ระดับน้ำอยู่ในเกณฑ์ปกติ",
        }[base]
    return res


def assess_rain(rain_1h: float | None, rain_24h: float | None, observed_at: datetime | None, now: datetime) -> dict:
    res = {"level": "unknown", "reason": "", "age_minutes": None}
    if observed_at is None or (rain_1h is None and rain_24h is None):
        res["reason"] = "ไม่มีข้อมูลฝนล่าสุด"
        return res
    age = (now - observed_at).total_seconds() / 60
    res["age_minutes"] = age
    if age > config.STALE_MINUTES:
        res.update(level="stale", reason="ข้อมูลฝนหยุดอัปเดต")
        return res
    if (rain_24h or 0) >= config.RAIN_24H_VERY_HEAVY:
        res.update(level="very_heavy", reason=f"ฝนสะสม 24 ชม. {rain_24h:.0f} มม. (หนักมาก)")
    elif (rain_1h or 0) >= config.RAIN_1H_ALERT:
        res.update(level="heavy", reason=f"ฝน 1 ชม. {rain_1h:.0f} มม. (ตกหนัก)")
    elif (rain_24h or 0) >= config.RAIN_24H_HEAVY:
        res.update(level="heavy", reason=f"ฝนสะสม 24 ชม. {rain_24h:.0f} มม. (หนัก)")
    else:
        res.update(level="normal", reason="ปริมาณฝนปกติ")
    return res
