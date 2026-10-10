"""Database schema (SQLAlchemy Core). Works on SQLite (dev) and PostgreSQL/Supabase."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, MetaData, String, Table, Text,
    TypeDecorator, create_engine, event,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from . import config


class UTCDateTime(TypeDecorator):
    """Always stores/returns timezone-aware UTC datetimes."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime not allowed")
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


metadata = MetaData()

stations = Table(
    "stations", metadata,
    Column("id", String(64), primary_key=True),
    Column("kind", String(8), nullable=False),  # water | rain
    Column("source", String(32), nullable=False),
    Column("simulated", Boolean, nullable=False, default=False),
    Column("name", String(200), nullable=False),
    Column("lat", Float), Column("lon", Float),
    Column("amphoe", String(100)), Column("tumbon", String(100)), Column("agency", String(100)),
    Column("bank_level", Float),          # lowest bank, m MSL
    Column("ground_level", Float),
    Column("official_critical", Float),   # critical level from source, m MSL (if provided)
    Column("source_situation", Integer),  # source's own 1..5 class (reference only)
    # latest snapshot (denormalised for fast reads)
    Column("level_msl", Float), Column("prev_level_msl", Float),
    Column("rain_1h", Float), Column("rain_24h", Float),
    Column("observed_at", UTCDateTime), Column("received_at", UTCDateTime),
    Column("updated_at", UTCDateTime),
)

water_readings = Table(
    "water_readings", metadata,
    Column("station_id", String(64), ForeignKey("stations.id"), primary_key=True),
    Column("observed_at", UTCDateTime, primary_key=True),
    Column("received_at", UTCDateTime, nullable=False),
    Column("level_msl", Float, nullable=False),
)

rainfall_readings = Table(
    "rainfall_readings", metadata,
    Column("station_id", String(64), ForeignKey("stations.id"), primary_key=True),
    Column("observed_at", UTCDateTime, primary_key=True),
    Column("received_at", UTCDateTime, nullable=False),
    Column("rain_1h", Float), Column("rain_24h", Float),
)

station_thresholds = Table(
    "station_thresholds", metadata,
    Column("station_id", String(64), ForeignKey("stations.id"), primary_key=True),
    Column("watch_msl", Float, nullable=False),
    Column("high_msl", Float, nullable=False),
    Column("critical_msl", Float, nullable=False),
    Column("verified", Boolean, nullable=False, default=False),
    Column("note", Text),
    Column("updated_at", UTCDateTime, nullable=False),
)

station_state = Table(
    "station_state", metadata,
    Column("station_id", String(64), primary_key=True),
    Column("last_risk", String(16)),
    Column("peak_risk", String(16)),
    Column("peak_at", UTCDateTime),
    Column("last_rapid_alert_at", UTCDateTime),
    Column("last_rain_alert_at", UTCDateTime),
    Column("stale_alerted", Boolean, nullable=False, default=False),
)

alerts = Table(
    "alerts", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("created_at", UTCDateTime, nullable=False, index=True),
    Column("kind", String(16), nullable=False),  # risk | rapid | rain | stale | official | test
    Column("station_id", String(64)),
    Column("station_name", String(200)),
    Column("risk", String(16)),
    Column("title", String(300), nullable=False),
    Column("body", Text, nullable=False),
    Column("simulated", Boolean, nullable=False, default=False),
    Column("official", Boolean, nullable=False, default=False),
)

push_subscriptions = Table(
    "push_subscriptions", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("endpoint", Text, nullable=False, unique=True),
    Column("p256dh", String(200), nullable=False),
    Column("auth", String(100), nullable=False),
    Column("created_at", UTCDateTime, nullable=False),
    Column("last_success_at", UTCDateTime),
    Column("failures", Integer, nullable=False, default=0),
)

notification_preferences = Table(
    "notification_preferences", metadata,
    Column("subscription_id", Integer, ForeignKey("push_subscriptions.id", ondelete="CASCADE"), primary_key=True),
    Column("stations", Text, nullable=False, default="[]"),  # JSON list; empty = all stations
    Column("min_level", String(16), nullable=False, default="watch"),
    Column("notify_rain", Boolean, nullable=False, default=True),
)

notification_logs = Table(
    "notification_logs", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("alert_id", Integer, index=True),
    Column("subscription_id", Integer),
    Column("status", String(16), nullable=False),  # sent | failed | expired
    Column("error", Text),
    Column("created_at", UTCDateTime, nullable=False),
)

announcements = Table(
    "announcements", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("created_at", UTCDateTime, nullable=False),
    Column("title", String(300), nullable=False),
    Column("body", Text, nullable=False),
    Column("severity", String(16), nullable=False, default="info"),  # info | watch | high | critical
    Column("active", Boolean, nullable=False, default=True),
    Column("expires_at", UTCDateTime),
)

data_source_health = Table(
    "data_source_health", metadata,
    Column("source", String(32), primary_key=True),
    Column("last_attempt_at", UTCDateTime),
    Column("last_success_at", UTCDateTime),
    Column("last_error", Text),
    Column("records", Integer, default=0),
    Column("consecutive_failures", Integer, nullable=False, default=0),
)

Index("ix_stations_kind", stations.c.kind)
Index("ix_water_obs", water_readings.c.station_id, water_readings.c.observed_at.desc())

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        kwargs = {}
        if config.DATABASE_URL.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        elif config.SERVERLESS:
            from sqlalchemy.pool import NullPool  # no long-lived connections in short-lived functions
            kwargs["poolclass"] = NullPool
        else:
            kwargs["pool_pre_ping"] = True
        _engine = create_engine(config.DATABASE_URL, **kwargs)
        if config.DATABASE_URL.startswith("sqlite"):
            @event.listens_for(_engine, "connect")
            def _pragmas(dbapi_conn, _):  # noqa: ANN001
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA foreign_keys=ON")
                cur.close()
    return _engine


def reset_engine():
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def init_db():
    metadata.create_all(get_engine())


def _insert(table):
    return (pg_insert if get_engine().dialect.name == "postgresql" else sqlite_insert)(table)


def upsert(conn, table, values: dict, pk: list[str], update: list[str] | None = None):
    stmt = _insert(table).values(**values)
    cols = update if update is not None else [c for c in values if c not in pk]
    if cols:
        stmt = stmt.on_conflict_do_update(index_elements=pk, set_={c: stmt.excluded[c] for c in cols})
    else:
        stmt = stmt.on_conflict_do_nothing(index_elements=pk)
    return conn.execute(stmt)


def insert_ignore(conn, table, values: dict, pk: list[str]):
    return conn.execute(_insert(table).values(**values).on_conflict_do_nothing(index_elements=pk))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
