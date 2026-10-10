"""Tests must never touch the developer's real database / keys, whatever the run order."""
import os
from pathlib import Path

_d = Path(__file__).resolve().parents[1] / "data_test"
_d.mkdir(exist_ok=True)
os.environ["YALA_DATA_DIR"] = str(_d)
os.environ["DATABASE_URL"] = f"sqlite:///{_d}/t.db"
