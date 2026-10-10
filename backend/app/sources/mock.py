"""SIMULATED data for development. Never produces real push notifications."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .base import RainObs, StationInfo, WaterObs


class MockSource:
    name = "mock"
    simulated = True

    def fetch(self) -> tuple[list[WaterObs], list[RainObs]]:
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        phase = now.timestamp() / 3600.0
        water: list[WaterObs] = []
        specs = [
            ("A", "[ทดสอบ] สถานีจำลอง A", 6.5400, 101.2800, 10.0, 0.0),
            ("B", "[ทดสอบ] สถานีจำลอง B", 6.5000, 101.2500, 10.0, 2.0),
        ]
        for sid, name, lat, lon, bank, off in specs:
            lvl = bank - 2.5 + 2.5 * math.sin(phase / 2 + off)
            prev = bank - 2.5 + 2.5 * math.sin((phase - 0.25) / 2 + off)
            info = StationInfo(f"mock-wl-{sid}", "water", name, lat, lon, "เมืองยะลา", None, "จำลอง", bank_level=bank)
            water.append(WaterObs(info, now, round(lvl, 2), round(prev, 2)))
        rinfo = StationInfo("mock-rn-A", "rain", "[ทดสอบ] สถานีฝนจำลอง", 6.52, 101.27, "เมืองยะลา", None, "จำลอง")
        rain = [RainObs(rinfo, now, round(max(0.0, 40 * math.sin(phase)), 1), 55.0)]
        return water, rain
