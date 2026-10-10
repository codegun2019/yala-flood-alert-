from __future__ import annotations

from .base import Source
from .mock import MockSource
from .thaiwater import ThaiWaterSource
from .yala_city import YalaCitySource

REGISTRY = {"yala_city": YalaCitySource, "thaiwater": ThaiWaterSource, "mock": MockSource}


def load_sources(names: list[str]) -> list[Source]:
    out = []
    for n in names:
        if n not in REGISTRY:
            raise ValueError(f"unknown data source {n!r}; available: {sorted(REGISTRY)}")
        out.append(REGISTRY[n]())
    return out
