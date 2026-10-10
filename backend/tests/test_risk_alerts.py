import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import risk  # noqa: E402
from app.alerts import plan_alerts  # noqa: E402
from app.sources.thaiwater import parse_rain, parse_water  # noqa: E402

NOW = datetime(2026, 10, 10, 8, 0, tzinfo=timezone.utc)
TH = risk.resolve_thresholds(bank=10.0, official_critical=None, override=None)  # watch 8.5 high 9.5 crit 10


def assess(level, age_min=10, prev=None, hist=None, th=TH):
    return risk.assess_water(level, prev, NOW - timedelta(minutes=age_min), NOW, th, hist or [])


def test_default_thresholds_from_bank():
    assert (TH.watch, TH.high, TH.critical, TH.source) == (8.5, 9.5, 10.0, "bank_default")


def test_override_wins_and_official_beats_bank():
    o = {"watch_msl": 1, "high_msl": 2, "critical_msl": 3, "verified": True}
    assert risk.resolve_thresholds(10, 9, o).source == "admin_verified"
    assert risk.resolve_thresholds(10, 9, None).critical == 9
    assert risk.resolve_thresholds(None, None, None) is None


def test_levels():
    assert assess(7.0)["risk"] == "normal"
    assert assess(8.5)["risk"] == "watch"
    assert assess(9.6)["risk"] == "high"
    assert assess(10.0)["risk"] == "critical"


def test_stale_is_never_normal():
    a = assess(7.0, age_min=500)
    assert a["risk"] == "stale" and a["last_known_risk"] == "normal"
    assert assess(9.9, age_min=500)["last_known_risk"] == "high"


def test_missing_data_is_unknown():
    assert risk.assess_water(None, None, None, NOW, TH, [])["risk"] == "unknown"
    assert assess(5.0, th=None)["risk"] == "unknown"


def test_rapid_rise_only_near_critical():
    hist = [(NOW - timedelta(minutes=60), 7.0), (NOW, 7.6)]  # +0.6 m/h, margin 2.4 -> too far
    assert not assess(7.6, hist=hist)["rapid_rise"]
    hist = [(NOW - timedelta(minutes=60), 7.6), (NOW, 8.2)]  # margin 1.8
    a = assess(8.2, hist=hist)
    assert a["rapid_rise"] and a["risk"] == "watch" and a["trend"] == "rising"


def test_rain_levels():
    f = lambda h1, h24, age=10: risk.assess_rain(h1, h24, NOW - timedelta(minutes=age), NOW)["level"]  # noqa: E731
    assert f(1, 10) == "normal"
    assert f(35, 40) == "heavy"
    assert f(0, 120) == "very_heavy"
    assert f(0, 120, age=600) == "stale"
    assert risk.assess_rain(None, None, None, NOW)["level"] == "unknown"


def wv(risk_, **kw):
    base = {"id": "s1", "name": "สถานี", "amphoe": "เมือง", "risk": risk_, "level_msl": 9.0, "trend": "rising",
            "thresholds": {"critical": 10.0}, "rapid_rise": False, "reason": "x", "_observed_dt": NOW,
            "simulated": False}
    base.update(kw)
    return base


def test_alert_on_rise_and_not_repeated():
    d, st = plan_alerts([wv("watch")], [], {}, NOW)
    assert [x.kind for x in d] == ["risk"]
    d2, st2 = plan_alerts([wv("watch")], [], st, NOW + timedelta(minutes=5))
    assert d2 == []
    d3, _ = plan_alerts([wv("high")], [], st2, NOW + timedelta(minutes=10))
    assert [x.risk for x in d3] == ["high"]


def test_flapping_suppressed_then_allowed():
    _, st = plan_alerts([wv("high")], [], {}, NOW)
    _, st = plan_alerts([wv("normal")], [], st, NOW + timedelta(minutes=10))
    d, st = plan_alerts([wv("high")], [], st, NOW + timedelta(minutes=20))
    assert d == []  # within cooldown
    _, st = plan_alerts([wv("normal")], [], st, NOW + timedelta(minutes=30))
    d, _ = plan_alerts([wv("high")], [], st, NOW + timedelta(minutes=120))
    assert len(d) == 1


def test_stale_alert_once_and_not_for_never_seen():
    d, st = plan_alerts([wv("stale")], [], {}, NOW)
    assert d == []  # dead on first sight
    _, st = plan_alerts([wv("normal")], [], {}, NOW)
    d, st = plan_alerts([wv("stale")], [], st, NOW + timedelta(hours=4))
    assert [x.kind for x in d] == ["stale"]
    d, _ = plan_alerts([wv("stale")], [], st, NOW + timedelta(hours=5))
    assert d == []


def test_rain_alert_aggregated_and_cooldown():
    rv = lambda i, h24: {"id": i, "name": i, "rain_level": "very_heavy", "rain_1h": 5, "rain_24h": h24, "simulated": False}  # noqa: E731
    d, st = plan_alerts([], [rv("a", 100), rv("b", 120)], {}, NOW)
    assert len(d) == 1 and d[0].kind == "rain" and "2 สถานี" in d[0].title
    d, _ = plan_alerts([], [rv("a", 100)], st, NOW + timedelta(hours=1))
    assert d == []


def test_simulated_alerts_flagged():
    d, _ = plan_alerts([wv("critical", simulated=True)], [], {}, NOW)
    assert d[0].simulated


def test_parse_thaiwater_filters_province_and_converts_time():
    w = {"waterlevel_data": {"data": [
        {"waterlevel_datetime": "2026-10-10 14:00", "waterlevel_msl": "12.80", "waterlevel_msl_previous": "12.7",
         "situation_level": 4, "station": {"id": 1, "tele_station_name": {"th": "ก"}, "min_bank": 13.85,
                                           "tele_station_lat": 6.5, "tele_station_long": 101.2},
         "geocode": {"province_code": "95", "amphoe_name": {"th": "เมืองยะลา"}}},
        {"waterlevel_datetime": "2026-10-10 14:00", "waterlevel_msl": "1", "station": {"id": 2},
         "geocode": {"province_code": "14"}},
    ]}}
    w["waterlevel_data"]["data"].append(
        {"waterlevel_datetime": "2026-10-10 14:00", "waterlevel_msl": "99.5", "situation_level": None,
         "station": {"id": 3, "tele_station_name": {"th": "เขื่อน"}, "left_bank": 0, "right_bank": 0,
                     "min_bank": 0, "ground_level": 0, "critical_level_msl": 0},
         "geocode": {"province_code": "95"}})
    out = parse_water(w, "95")
    dam = [o for o in out if o.station.id == "tw-wl-3"][0]
    assert dam.station.bank_level is None and dam.station.official_critical is None  # 0 means "not set"
    assert risk.resolve_thresholds(0, 0, None) is None
    out = [o for o in out if o.station.id == "tw-wl-1"]
    assert len(out) == 1 and out[0].level_msl == 12.8 and out[0].station.bank_level == 13.85
    assert out[0].observed_at == datetime(2026, 10, 10, 7, 0, tzinfo=timezone.utc)
    r = parse_rain({"data": [{"rainfall_datetime": "2026-10-10 15:00", "rain_24h": 110.8, "rain_1h": 47.4,
                              "station": {"id": 9, "tele_station_name": {"th": "ข"}},
                              "geocode": {"province_code": "95"}}]}, "95")
    assert r[0].rain_1h == 47.4


# ---- Yala City Municipality adapter
from app.sources.yala_city import parse_detail  # noqa: E402

CITY = {
    "telemeterStationName": "สะพานข้ามคลองตืองอ", "telemeterLocation": "ต.บุดี อ.เมืองยะลา จ.ยะลา",
    "geometry": {"type": "Point", "coordinates": [101.311194, 6.498861]},
    "transactionIntervalHour": "2026-10-10T09:00:00.000Z",
    "waterLevelDetail": {"waterLevel": {"value": "26.19", "status": "water_level_range_2"},
                         "bankLevel": {"value": "30.35"}, "bottomLevel": {"value": "26.00"}},
    "rainfallDetail": {"rainfallAcc": {"value": "N/A"}, "rainfallPerHour": {"value": "-"}},
}


def test_city_parse_water_only():
    w, r = parse_detail("abc", CITY)
    assert r is None  # N/A and '-' mean no rain data, never 0
    assert (w.station.id, w.level_msl, w.station.bank_level, w.station.source_situation) == ("yc-wl-abc", 26.19, 30.35, 1)
    assert (w.station.tumbon, w.station.amphoe, w.station.lat, w.station.lon) == ("บุดี", "เมืองยะลา", 6.498861, 101.311194)
    assert w.observed_at == datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)


def test_city_parse_rain_and_broken_sensor():
    d = {**CITY, "rainfallDetail": {"rainfallAcc": {"value": "64.8"}, "rainfallPerHour": {"value": "0.0"}}}
    _, r = parse_detail("abc", d)
    assert (r.rain_24h, r.rain_1h) == (64.8, 0.0)
    for bad in ("water_level_range_1", "water_level_range_7"):  # no sensor / sensor broken
        d = {**CITY, "waterLevelDetail": {**CITY["waterLevelDetail"], "waterLevel": {"value": "26.19", "status": bad}}}
        assert parse_detail("abc", d)[0] is None
    assert parse_detail("abc", {**CITY, "transactionIntervalHour": None}) == (None, None)


def test_center_status_roundtrip(tmp_path, monkeypatch):
    """Admin-only setting; empty by default so the UI never claims a centre state nobody declared."""
    import os
    os.environ["ADMIN_TOKEN"] = "t"
    from fastapi.testclient import TestClient
    from app import db, main
    db.reset_engine(); db.init_db()
    c = TestClient(main.app)
    assert c.get("/api/center-status").json() == {"status": None}
    body = {"state": "closed", "text": "ยังไม่เปิดศูนย์อย่างเป็นทางการ", "phone": "1784"}
    assert c.put("/api/admin/center-status", json=body).status_code == 401
    assert c.put("/api/admin/center-status", json=body, headers={"X-Admin-Token": "t"}).status_code == 200
    got = c.get("/api/center-status").json()["status"]
    assert got["state"] == "closed" and got["phone"] == "1784" and got["updated_at"]
    assert c.put("/api/admin/center-status", json={**body, "phone": "<script>"}, headers={"X-Admin-Token": "t"}).status_code == 422
    assert c.delete("/api/admin/center-status", headers={"X-Admin-Token": "t"}).status_code == 200
    assert c.get("/api/center-status").json() == {"status": None}


def test_rain_forecast_parse_and_summary():
    from datetime import datetime, timezone
    from app import forecast
    times = [f"2026-10-10T{h:02d}:00" for h in range(24)] + [f"2026-10-11T{h:02d}:00" for h in range(24)]
    mm = [0.0] * 48
    mm[20], mm[21], mm[22] = 12.0, 31.5, 4.0
    payload = {"hourly": {"time": times, "precipitation": mm, "precipitation_probability": [80] * 48}}
    now = datetime(2026, 10, 10, 12, 40, tzinfo=timezone.utc)   # 19:40 Bangkok -> starts at 19:00
    hours = forecast.parse(payload, now)
    assert len(hours) == 24 and hours[0]["t"].startswith("2026-10-10T19:00")
    s = forecast.summarize(hours)
    assert s["total_mm"] == 47.5 and s["level"] == "heavy" and s["peak_mm"] == 31.5 and s["peak_at"].startswith("2026-10-10T21")
    assert forecast.summarize([{"t": "x", "mm": 0.0, "prob": 5}])["level"] == "none"
    assert forecast.snap(None, None) == forecast.CENTER and forecast.snap(6.549, 101.251) == (6.5, 101.3)
    import pytest
    with pytest.raises(ValueError):
        forecast.snap(13.7, 100.5)   # Bangkok: outside Yala


def test_help_points_admin_only_and_validated():
    import os
    os.environ["ADMIN_TOKEN"] = "t"
    from fastapi.testclient import TestClient
    from app import db, main
    db.reset_engine(); db.init_db()
    c = TestClient(main.app)
    h = {"X-Admin-Token": "t"}
    p = {"kind": "shelter", "name": "ศูนย์พักพิงทดสอบ", "lat": 6.54, "lon": 101.28, "phone": "073-123456"}
    assert c.post("/api/admin/help-points", json=p).status_code == 401
    assert c.post("/api/admin/help-points", json={**p, "lat": 13.7}, headers=h).status_code == 422   # outside Yala
    assert c.post("/api/admin/help-points", json={**p, "phone": "x<y"}, headers=h).status_code == 422
    pid = c.post("/api/admin/help-points", json=p, headers=h).json()["id"]
    pts = c.get("/api/help-points").json()["points"]
    assert [x["name"] for x in pts if x["id"] == pid] == ["ศูนย์พักพิงทดสอบ"]
    assert c.put(f"/api/admin/help-points/{pid}", json={**p, "name": "แก้แล้ว"}, headers=h).status_code == 200
    assert c.delete(f"/api/admin/help-points/{pid}", headers=h).status_code == 200
    assert all(x["id"] != pid for x in c.get("/api/help-points").json()["points"])
