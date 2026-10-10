"use client";
import { Camera, CheckCircle2, LocateFixed, Phone, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { areaOptions, coarse } from "@/lib/area";
import { shrinkToJpegBase64 } from "@/lib/image";
import type { RainStation, WaterStation } from "@/lib/types";

const DEPTHS = [
  { id: "ankle", label: "ข้อเท้า", sub: "≤ 20 ซม." },
  { id: "knee", label: "เข่า", sub: "~50 ซม." },
  { id: "waist", label: "เอว", sub: "~1 ม." },
  { id: "above", label: "สูงกว่าเอว", sub: "> 1 ม." },
] as const;

/** แบบฟอร์มรายงานน้ำท่วมจากประชาชน — ส่งแล้วต้องรอผู้ดูแลอนุมัติก่อนจึงแสดงสาธารณะ */
export default function ReportForm({ water, rain, onClose }: { water: WaterStation[]; rain: RainStation[]; onClose: () => void }) {
  const [loc, setLoc] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [amphoe, setAmphoe] = useState("");
  const [tumbon, setTumbon] = useState("");
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]["id"]>("knee");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ok, setOk] = useState(false); // ยืนยันเงื่อนไข
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const options = useMemo(() => areaOptions(water, rain), [water, rain]);
  const tumbons = options.find((o) => o.amphoe === amphoe)?.tumbons ?? [];

  const gps = () => {
    setMsg("กำลังค้นหาตำแหน่ง…");
    navigator.geolocation?.getCurrentPosition(
      (p) => { setLoc({ lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000, label: "ตำแหน่งปัจจุบันของคุณ" }); setMsg(null); },
      () => setMsg("ระบุตำแหน่งไม่ได้ — เลือกอำเภอ/ตำบลแทน"),
      { timeout: 15000, maximumAge: 60000 }
    );
  };

  const pickArea = (a: string, t: string) => {
    setAmphoe(a); setTumbon(t);
    const norm = (x: string | null | undefined) => (x ?? "").replace("สะเต็ง", "สะเตง");
    const pts = [...water, ...rain].filter((s) => s.lat != null && s.lon != null && norm(s.amphoe) === a && (!t || norm(s.tumbon) === t));
    if (!pts.length) return setLoc(null);
    const lat = pts.reduce((x, s) => x + s.lat!, 0) / pts.length, lon = pts.reduce((x, s) => x + s.lon!, 0) / pts.length;
    setLoc({ lat: coarse(lat), lon: coarse(lon), label: t ? `ต.${t} อ.${a} (ประมาณ)` : `อ.${a} (ประมาณ)` });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b64 = await shrinkToJpegBase64(f);
      setPhoto(b64);
      setPreview(`data:image/jpeg;base64,${b64}`);
      setMsg(null);
    } catch { setMsg("ประมวลผลรูปไม่สำเร็จ ลองรูปอื่น"); }
  };

  const submit = async () => {
    if (!loc || !ok) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/reports", { method: "POST", body: JSON.stringify({ lat: loc.lat, lon: loc.lon, depth, note: note.trim() || null, photo_b64: photo, website }) });
      setDone(true);
    } catch (e: any) {
      setMsg(/429/.test(e.message) ? "ส่งบ่อยเกินไป กรุณารอสักครู่" : "ส่งไม่สำเร็จ: " + (e.message || "ลองใหม่ภายหลัง"));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1150] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-extrabold">รายงานน้ำท่วมในพื้นที่</h2>
          <button onClick={onClose} aria-label="ปิด" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"><X size={18} /></button>
        </div>

        {done ? (
          <div className="mt-4 space-y-3 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
            <p className="font-bold">ส่งรายงานแล้ว — รอผู้ดูแลตรวจสอบ</p>
            <p className="text-sm text-slate-600">รายงานจะ <b>ยังไม่แสดงสาธารณะ</b> จนกว่าผู้ดูแลจะอนุมัติ และจะแสดงนานไม่เกิน 12 ชั่วโมง</p>
            <button onClick={onClose} className="rounded-xl bg-sky-700 px-6 py-2.5 font-semibold text-white">ปิด</button>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-950">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <div>
                <b>ฟอร์มนี้ไม่ใช่การขอความช่วยเหลือฉุกเฉิน</b> ไม่มีใครตอบกลับทันที ถ้าอยู่ในอันตราย โทรเลย:
                <div className="mt-1 flex flex-wrap gap-2">
                  <a href="tel:1784" className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-semibold text-white"><Phone size={13} /> ปภ. 1784</a>
                  <a href="tel:191" className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-semibold text-white"><Phone size={13} /> 191</a>
                  <a href="tel:1669" className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-semibold text-white"><Phone size={13} /> 1669</a>
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm font-bold">1. ตำแหน่ง</div>
            <button onClick={gps} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"><LocateFixed size={16} /> ใช้ตำแหน่งปัจจุบัน</button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select value={amphoe} onChange={(e) => pickArea(e.target.value, "")} className="rounded-xl border border-slate-300 bg-white p-2 text-sm">
                <option value="">หรือเลือกอำเภอ</option>{options.map((o) => <option key={o.amphoe}>{o.amphoe}</option>)}
              </select>
              <select value={tumbon} onChange={(e) => pickArea(amphoe, e.target.value)} disabled={!amphoe} className="rounded-xl border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-100">
                <option value="">ตำบล</option>{tumbons.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {loc && <p className="mt-1 text-sm text-emerald-700">✓ {loc.label}</p>}

            <div className="mt-3 text-sm font-bold">2. ระดับน้ำ</div>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {DEPTHS.map((d) => (
                <button key={d.id} onClick={() => setDepth(d.id)} className={`rounded-xl border p-2 text-center text-sm ${depth === d.id ? "border-sky-700 bg-sky-50 font-bold" : "border-slate-300"}`}>
                  {d.label}<div className="text-[10px] font-normal text-slate-500">{d.sub}</div>
                </button>
              ))}
            </div>

            <div className="mt-3 text-sm font-bold">3. รายละเอียด (ไม่บังคับ)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="เช่น น้ำท่วมถนนหน้าตลาด รถเล็กผ่านไม่ได้" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
            <p className="text-[11px] text-slate-500">ห้ามใส่ลิงก์ เบอร์โทร หรือชื่อบัญชี</p>

            <div className="mt-3 text-sm font-bold">4. รูปถ่าย (ไม่บังคับ)</div>
            <label className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-400 py-3 text-sm font-semibold text-slate-700">
              <Camera size={18} /> {preview ? "เปลี่ยนรูป" : "ถ่าย/เลือกรูป"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {preview && <img src={preview} alt="ตัวอย่างรูป" className="mt-2 max-h-48 w-full rounded-xl object-cover" />}
            <p className="text-[11px] text-slate-500">ระบบย่อรูปและลบข้อมูลตำแหน่งที่ฝังในรูปให้อัตโนมัติ · อย่าถ่ายติดใบหน้าบุคคล ป้ายทะเบียน หรือข้อมูลส่วนตัว</p>

            {/* honeypot: ซ่อนจากผู้ใช้จริง */}
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />
              <span>ฉันยืนยันว่าข้อมูลเป็นความจริง ไม่มีข้อมูลส่วนตัวของผู้อื่นในรูป และยินยอมให้แสดงรายงานนี้ต่อสาธารณะ (ไม่ระบุชื่อ) หลังผู้ดูแลอนุมัติ</span>
            </label>
            {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
            <button disabled={!loc || !ok || busy} onClick={submit} className="mt-3 w-full rounded-xl bg-red-700 py-3 font-bold text-white disabled:opacity-40">ส่งรายงาน</button>
            <p className="mt-2 text-[11px] text-slate-500">รายงานจากประชาชนไม่ใช่ข้อมูลทางการ และไม่ถูกนำไปคำนวณระดับเตือนหรือส่งแจ้งเตือนอัตโนมัติ</p>
          </>
        )}
      </div>
    </div>
  );
}
