"""Data Source Adapter contract.

Any upstream (ThaiWater, Yala Municipality telemetry, ...) implements `Source`.
The rest of the system only sees these normalised dataclasses, so swapping the
upstream does not affect the dashboard or the alert engine.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class StationInfo:
    id: str
    kind: str  # "water" | "rain"
    name: str
    lat: float | None = None
    lon: float | None = None
    amphoe: str | None = None
    tumbon: str | None = None
    agency: str | None = None
    bank_level: float | None = None
    ground_level: float | None = None
    official_critical: float | None = None
    source_situation: int | None = None


@dataclass
class WaterObs:
    station: StationInfo
    observed_at: datetime  # tz-aware
    level_msl: float | None
    prev_level_msl: float | None = None


@dataclass
class RainObs:
    station: StationInfo
    observed_at: datetime  # tz-aware
    rain_1h: float | None
    rain_24h: float | None


class Source(Protocol):
    name: str
    simulated: bool

    def fetch(self) -> tuple[list[WaterObs], list[RainObs]]: ...


class PartialFailure(Exception):
    """Some data was fetched but part of the source failed. Carries what we did get."""

    def __init__(self, water, rain, message):
        super().__init__(message)
        self.water, self.rain = water, rain
