"""Alert Engine: decides which alerts to raise. Pure (no I/O) so it is unit-testable."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from . import config
from .risk import ALERT_LEVELS, rank

TH_TZ = timezone(timedelta(hours=7))
AUTO_NOTE = "ข้อความอัตโนมัติจากข้อมูลสถานี ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ"
ICON = {"watch": "🟡", "high": "🟠", "critical": "🔴"}
LABEL = {"watch": "เฝ้าระวัง", "high": "เสี่ยงสูง", "critical": "วิกฤต"}
TREND = {"rising": "เพิ่มขึ้น", "falling": "ลดลง", "steady": "ทรงตัว"}


@dataclass
class AlertDraft:
    kind: str  # risk | rapid | rain | stale
    station_id: str | None
    station_name: str | None
    risk: str | None
    title: str
    body: str
    simulated: bool = False


def hhmm(dt: datetime | None) -> str:
    return dt.astimezone(TH_TZ).strftime("%H:%M น.") if dt else "-"


def _water_body(v: dict, now: datetime) -> str:
    parts = [f"📍 {v['name']}" + (f" อ.{v['amphoe']}" if v.get("amphoe") else "")]
    if v.get("level_msl") is not None:
        parts.append(f"🌊 ระดับน้ำ {v['level_msl']:.2f} ม.รทก.")
    if v.get("thresholds"):
        parts.append(f"เกณฑ์วิกฤต {v['thresholds']['critical']:.2f} ม.")
    if v.get("trend"):
        parts.append(f"📈 แนวโน้ม: {TREND[v['trend']]}")
    parts.append(f"⏰ ข้อมูลเวลา {hhmm(v.get('_observed_dt'))}")
    return "\n".join(parts) + f"\n{AUTO_NOTE}"


def plan_alerts(water: list[dict], rain: list[dict], states: dict[str, dict], now: datetime):
    """Returns (drafts, new_states). `states` maps station_id -> station_state row dict."""
    drafts: list[AlertDraft] = []
    new: dict[str, dict] = {}

    for v in water:
        sid = v["id"]
        st = dict(states.get(sid) or {})
        seen_before = "last_risk" in st and st.get("last_risk") is not None
        r = v["risk"]
        sim = bool(v.get("simulated"))

        if r in ALERT_LEVELS:
            last = st.get("last_risk") or "normal"
            if rank(r) > rank(last):
                peak, peak_at = st.get("peak_risk"), st.get("peak_at")
                suppressed = (
                    peak is not None and peak_at is not None and rank(r) <= rank(peak)
                    and now - peak_at < timedelta(minutes=config.RISK_FLAP_COOLDOWN_MIN)
                )
                if not suppressed:
                    drafts.append(AlertDraft(
                        "risk", sid, v["name"], r,
                        f"{ICON[r]} {LABEL[r]} — {v['name']}", _water_body(v, now), sim))
                    st["peak_risk"], st["peak_at"] = r, now
        if r in ("normal", *ALERT_LEVELS):
            st["last_risk"] = r
            st["stale_alerted"] = False

        if v.get("rapid_rise"):
            last_rapid = st.get("last_rapid_alert_at")
            if last_rapid is None or now - last_rapid >= timedelta(minutes=config.RAPID_COOLDOWN_MIN):
                drafts.append(AlertDraft(
                    "rapid", sid, v["name"], r if r in ALERT_LEVELS else "watch",
                    f"📈 น้ำเพิ่มขึ้นเร็ว — {v['name']}",
                    f"ระดับน้ำเพิ่มขึ้น {v['rate_m_per_h']:.2f} ม./ชม.\n" + _water_body(v, now), sim))
                st["last_rapid_alert_at"] = now

        if r == "stale" and not st.get("stale_alerted"):
            st["stale_alerted"] = True
            if seen_before:  # don't alert on stations that were already dead when first seen
                drafts.append(AlertDraft(
                    "stale", sid, v["name"], "stale",
                    f"⚠️ ข้อมูลสถานีหยุดอัปเดต — {v['name']}",
                    f"{v['reason']}\nอย่าตีความว่าสถานการณ์ปกติ ควรตรวจสอบจากแหล่งอื่น\n⏰ ข้อมูลล่าสุด {hhmm(v.get('_observed_dt'))}", sim))
        new[sid] = st

    rain_hits: list[dict] = []
    for v in rain:
        sid = v["id"]
        st = dict(states.get(sid) or {})
        lvl = v["rain_level"]
        hit = lvl == "very_heavy" or (lvl in ("heavy", "very_heavy") and (v.get("rain_1h") or 0) >= config.RAIN_1H_ALERT)
        if hit:
            last = st.get("last_rain_alert_at")
            if last is None or now - last >= timedelta(minutes=config.RAIN_COOLDOWN_MIN):
                rain_hits.append(v)
                st["last_rain_alert_at"] = now
        new[sid] = st
    for sim in (False, True):  # never mix simulated and real stations in one message
        hits = sorted((v for v in rain_hits if bool(v.get("simulated")) == sim), key=lambda x: -(x.get("rain_24h") or 0))
        if not hits:
            continue
        lines = []
        for v in hits[:5]:
            h1 = f"{v['rain_1h']:.0f}" if v.get("rain_1h") is not None else "-"
            h24 = f"{v['rain_24h']:.0f}" if v.get("rain_24h") is not None else "-"
            lines.append(f"• {v['name']}: 1 ชม. {h1} มม. | 24 ชม. {h24} มม.")
        more = f"\nและอีก {len(hits) - 5} สถานี" if len(hits) > 5 else ""
        drafts.append(AlertDraft(
            "rain", None, None, None, f"🌧️ ฝนตกหนัก {len(hits)} สถานีในจังหวัดยะลา",
            "\n".join(lines) + more + f"\n{AUTO_NOTE}", sim))
    return drafts, new
