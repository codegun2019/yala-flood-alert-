"""End-to-end check of the Web Push pipeline without a real phone.

A local HTTP server plays the browser vendor's push service. We subscribe with a
real P-256 key pair + auth secret (exactly what a browser generates), send through
push.deliver_results(), then decrypt what arrived with the subscriber's private key.
"""
import base64
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import http_ece
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["YALA_DATA_DIR"] = str(Path(__file__).resolve().parents[1] / "data_test")
os.environ["DATABASE_URL"] = f"sqlite:///{os.environ['YALA_DATA_DIR']}/t.db"

from app import db, push  # noqa: E402
from app.db import push_subscriptions, utcnow  # noqa: E402

b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731


class Capture(BaseHTTPRequestHandler):
    received: list = []
    status = 201

    def do_POST(self):  # noqa: N802
        n = int(self.headers.get("Content-Length", 0))
        Capture.received.append((self.path, dict(self.headers), self.rfile.read(n)))
        self.send_response(Capture.status)
        self.end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture()
def env():
    Capture.received, Capture.status = [], 201
    srv = HTTPServer(("127.0.0.1", 0), Capture)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    db.reset_engine()
    db.init_db()
    pub_key = push.ensure_vapid()
    priv = ec.generate_private_key(ec.SECP256R1())
    auth = os.urandom(16)
    p256dh = b64(priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    eng = db.get_engine()
    with eng.begin() as c:
        c.execute(push_subscriptions.delete())
        sid = c.execute(push_subscriptions.insert().values(
            endpoint=f"http://127.0.0.1:{srv.server_port}/push/abc", p256dh=p256dh, auth=b64(auth),
            created_at=utcnow(), failures=0)).inserted_primary_key[0]
    sub = {"id": sid, "endpoint": f"http://127.0.0.1:{srv.server_port}/push/abc", "p256dh": p256dh, "auth": b64(auth)}
    yield eng, sub, priv, auth, pub_key
    srv.shutdown()


def test_payload_is_decryptable_and_vapid_signed(env):
    eng, sub, priv, auth, pub_key = env
    res = push.deliver_results(eng, None, [sub], "🔴 วิกฤต — ทดสอบ", "ระดับน้ำ 20.15 ม.", "/?tab=notify", "t1", "critical")
    assert res[0][1] == "sent", res
    path, headers, body = Capture.received[0]
    headers = {k.lower(): v for k, v in headers.items()}

    plain = http_ece.decrypt(body, private_key=priv, auth_secret=auth, version="aes128gcm")
    data = json.loads(plain.decode())
    assert data["title"] == "🔴 วิกฤต — ทดสอบ" and data["severity"] == "critical" and data["url"] == "/?tab=notify"

    assert headers["urgency"] == "high"                      # critical wakes the phone
    assert headers["content-encoding"] == "aes128gcm"
    assert headers["authorization"].startswith("vapid t=") and f"k={pub_key}" in headers["authorization"]
    assert int(headers["ttl"]) > 0

    # the VAPID JWT is a valid ES256 signature by our key, addressed to this push service, not expired
    auth_hdr = headers["authorization"]
    token = auth_hdr.split("t=")[1].split(",")[0]
    h, pl, sig = token.split(".")
    unb64 = lambda x: base64.urlsafe_b64decode(x + "=" * (-len(x) % 4))  # noqa: E731
    claims = json.loads(unb64(pl))
    assert claims["aud"] == sub["endpoint"].rsplit("/push/", 1)[0]
    assert claims["exp"] > __import__("time").time() and claims["sub"].startswith("mailto:")
    raw = unb64(sig)
    assert len(raw) == 64
    from cryptography.hazmat.primitives import hashes  # noqa: PLC0415
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature  # noqa: PLC0415
    vapid_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), unb64(pub_key))
    vapid_pub.verify(encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
                     f"{h}.{pl}".encode(), ec.ECDSA(hashes.SHA256()))  # raises if invalid


def test_normal_alerts_use_normal_urgency(env):
    eng, sub, *_ = env
    push.deliver_results(eng, None, [sub], "t", "b", severity="watch")
    assert {k.lower(): v for k, v in Capture.received[0][1].items()}["urgency"] == "normal"


def test_expired_subscription_is_removed(env):
    eng, sub, *_ = env
    Capture.status = 410
    res = push.deliver_results(eng, None, [sub], "t", "b")
    assert res[0][1] == "expired"
    with eng.connect() as c:
        assert c.execute(push_subscriptions.select()).first() is None


def test_server_error_is_retried_then_reported_failed(env, monkeypatch):
    eng, sub, *_ = env
    monkeypatch.setattr(push.time, "sleep", lambda s: None)
    Capture.status = 503
    res = push.deliver_results(eng, None, [sub], "t", "b")
    assert res[0][1] == "failed" and len(Capture.received) == 2   # one retry
    with eng.connect() as c:
        assert c.execute(push_subscriptions.select()).first().failures == 1
