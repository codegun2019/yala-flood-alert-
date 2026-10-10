"""Runtime configuration (environment variables with safe defaults)."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
# Vercel (serverless): code dir is read-only, only /tmp is writable and it is NOT persistent.
# There, state must live in an external DB (DATABASE_URL) and secrets in env vars.
SERVERLESS = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
DATA_DIR = Path(os.getenv("YALA_DATA_DIR", "/tmp/yala" if SERVERLESS else BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# sqlite for local dev; for Supabase use e.g.
#   postgresql+psycopg://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'yala.db'}")
# Hosts hand out "postgres://" / "postgresql://"; SQLAlchemy needs the psycopg (v3) driver name.
for _old in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_old):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_old):]
        break

# Serverless has no background loop: an external scheduler calls /api/cron/collect with this secret.
CRON_SECRET = os.getenv("CRON_SECRET", "")

# Data source adapters to run: yala_city, thaiwater, mock (comma separated)
DATA_SOURCES = [s.strip() for s in os.getenv("DATA_SOURCES", "yala_city,thaiwater").split(",") if s.strip()]
YALA_CITY_MUNI_CODE = os.getenv("YALA_CITY_MUNI_CODE", "03950102")  # เทศบาลนครยะลา
PROVINCE_CODE = os.getenv("PROVINCE_CODE", "95")  # 95 = Yala
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "300"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "40"))

# Data older than this is "stale" and is NEVER shown as normal.
STALE_MINUTES = int(os.getenv("STALE_MINUTES", "180"))
# Readings from the future beyond this tolerance are rejected.
FUTURE_TOLERANCE_MIN = 10

# Default thresholds, measured as metres below the lowest bank level.
# These are NOT officially certified; admins should override per station.
WATCH_MARGIN_M = float(os.getenv("WATCH_MARGIN_M", "1.5"))
HIGH_MARGIN_M = float(os.getenv("HIGH_MARGIN_M", "0.5"))

# Rapid rise: m/hour measured over the last RAPID_WINDOW_MIN minutes,
# only considered when the water is within RAPID_NEAR_M of critical.
RAPID_RISE_M_PER_H = float(os.getenv("RAPID_RISE_M_PER_H", "0.3"))
RAPID_WINDOW_MIN = 180
RAPID_NEAR_M = float(os.getenv("RAPID_NEAR_M", "2.0"))
TREND_EPS_M_PER_H = 0.05

# Rain (mm). TMD: 35-90 mm/day heavy, >90 mm/day very heavy.
RAIN_24H_HEAVY = float(os.getenv("RAIN_24H_HEAVY", "35"))
RAIN_24H_VERY_HEAVY = float(os.getenv("RAIN_24H_VERY_HEAVY", "90"))
RAIN_1H_ALERT = float(os.getenv("RAIN_1H_ALERT", "30"))

# Alert de-duplication
RISK_FLAP_COOLDOWN_MIN = 60
RAPID_COOLDOWN_MIN = 60
RAIN_COOLDOWN_MIN = 180

ADMIN_TOKEN_FILE = DATA_DIR / "admin_token.txt"
VAPID_DIR = DATA_DIR / "vapid"
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")

FRONTEND_ORIGINS = [o for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",") if o]

# CCTV is embedded as the municipality's own page (iframe); we never call their stream API ourselves.
CCTV_LINKS = [
    {
        "id": "yala-cctv",
        "name": "กล้อง CCTV เทศบาลนครยะลา",
        "url": "https://yala-cctv.localth.ai/",
        "embed": os.getenv("CCTV_EMBED", "1") == "1",  # set CCTV_EMBED=0 to link-out only
        "note": "ภาพสดจากระบบของเทศบาลนครยะลา เลือกกล้องจากแผนที่ในหน้าต่างด้านล่าง",
    }
]
SOURCE_LINKS = [
    {"name": "ระบบระดับน้ำเทศบาลนครยะลา", "url": "https://cddp-smartcity.localgov.ai/เทศบาลนครยะลา/telemeter"},
    {"name": "ThaiWater จังหวัดยะลา", "url": "https://yala.thaiwater.net/"},
    {"name": "ศูนย์รวมข้อมูลสภาพอากาศเทศบาล (เรดาร์ฝน)", "url": "https://sites.google.com/view/ycm-rd"},
]

# Citizen flood reports (moderated; never used for risk levels or push alerts)
REPORT_MAX_PHOTO_BYTES = 220_000
REPORT_VISIBLE_HOURS = 12          # approved reports disappear from the public view after this long
REPORT_LIMIT_PER_HOUR = 3
REPORT_LIMIT_PER_DAY = 8
