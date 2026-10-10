# YALA FLOOD ALERT — เฝ้าระวังและแจ้งเตือนน้ำท่วมยะลา

PWA (Next.js) + FastAPI + SQLAlchemy (SQLite dev / PostgreSQL-Supabase prod) + Web Push (VAPID).

## รัน (dev)

```bash
# 1) backend  (ดึงข้อมูลจริงจาก เทศบาลนครยะลา + ThaiWater ทุก 5 นาที)
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000

# 2) frontend
cd frontend && npm install && npm run dev      # http://localhost:3000  (/api/* proxy -> :8000)
```

- Admin: http://localhost:3000/admin — โทเคนอยู่ที่ `data/admin_token.txt` (หรือตั้ง `ADMIN_TOKEN`)
- ทดสอบ logic: `cd backend && ../.venv/bin/python -m pytest`
- ข้อมูลจำลอง: `DATA_SOURCES=mock` (ติดป้าย "จำลอง" และ **ไม่ส่ง push จริงเด็ดขาด**)
- ใช้ Supabase: ตั้ง `DATABASE_URL=postgresql+psycopg://...`

## หลักความปลอดภัยที่ฝังในระบบ
- ข้อมูลล่าช้า (> `STALE_MINUTES`=180) / ขาด / ไม่มีเกณฑ์ → **ไม่เคยแสดงเป็น "ปกติ"**
- เกณฑ์รายสถานี (admin override > เกณฑ์วิกฤตจากต้นทาง > ตลิ่งต่ำสุด) — เกณฑ์เริ่มต้นติดป้าย "ยังไม่ได้รับรอง"
- การเตือนอัตโนมัติ แยกจาก "ประกาศทางการ" ทั้งใน UI, push และฐานข้อมูล
- กันแจ้งเตือนซ้ำ (เฉพาะเมื่อระดับสูงขึ้น + cooldown กัน flapping), ฝนหนักรวมเป็นข้อความเดียว
- API ไม่ถูก cache ใน service worker

## แหล่งข้อมูล (`DATA_SOURCES`, ค่าเริ่มต้น `yala_city,thaiwater`)
| adapter | ข้อมูล | หมายเหตุ |
|---|---|---|
| `yala_city` | ระดับน้ำ/ตลิ่ง/ท้องน้ำ + ฝน 1 ชม./24 ชม. ของเทศบาลนครยะลา (~15 สถานีน้ำ, ~9 สถานีฝน) | ใช้ endpoint เดียวกับหน้าเว็บ telemeter ของเทศบาล (`cddp-smartcity-api.localgov.ai`) ไม่ต้องล็อกอิน แต่ **ไม่มีเอกสาร/ข้อตกลงการใช้งานอย่างเป็นทางการ** — ควรขออนุญาตเทศบาลก่อนใช้งานจริง |
| `thaiwater` | สถานีน้ำ/ฝนของ สสน. และหน่วยงานอื่นในจังหวัดยะลา | Open API สาธารณะ |
| `mock` | ข้อมูลจำลอง | ไม่ส่ง push จริง |

CCTV: แสดงเป็นลิงก์ไป `yala-cctv.localth.ai` เท่านั้น (สตรีมใช้ token จากบริการภายนอก จึงไม่ฝัง/proxy)

## Adapter ข้อมูล
`backend/app/sources/` — เพิ่มแหล่งใหม่ (เช่น API เทศบาลนครยะลา เมื่อได้สิทธิ์) โดย implement `fetch() -> (list[WaterObs], list[RainObs])` แล้วลงทะเบียนใน `sources/__init__.py`

## ทดสอบบนมือถือจริง (ติดตั้งแอป + Push ต้องใช้ HTTPS)
```bash
./scripts/phone-test.sh   # build production + เปิด Cloudflare quick tunnel -> ได้ลิงก์ https://....trycloudflare.com (สาธารณะชั่วคราว, Ctrl+C เพื่อปิด)
```
เปิดลิงก์บนมือถือ -> ติดตั้งแอป -> แท็บ "แจ้งเตือน" -> เปิดการแจ้งเตือน -> "ส่งแจ้งเตือนทดสอบ"
(เสียงตอนปิดแอปเป็นเสียงแจ้งเตือนของเครื่อง เว็บกำหนดเสียงเองไม่ได้; เสียงไซเรนในแอปเล่นได้เฉพาะตอนเปิดแอปค้างไว้)
