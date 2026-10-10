"use client";
import { Bookmark, BookmarkCheck, Home, LocateFixed, MapPin, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RainBadge, RiskBadge } from "@/components/Badges";
import { areaOptions, assess, coarse, loadPlaces, MAX_PLACES, savePlaces, type Place } from "@/lib/area";
import { num, RISK_META } from "@/lib/format";
import type { RainStation, WaterStation } from "@/lib/types";

const VERDICT_BOX: Record<string, string> = {
  critical: "border-red-400 bg-red-50", high: "border-orange-400 bg-orange-50", watch: "border-yellow-400 bg-yellow-50",
  normal: "border-emerald-300 bg-emerald-50", stale: "border-slate-400 bg-slate-100", unknown: "border-slate-300 bg-slate-50",
};

const label = (p: Place) => p.label;

export default function MyArea({ water, rain, onSelect }: { water: WaterStation[]; rain: RainStation[]; onSelect: (id: string) => void }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [active, setActive] = useState<Place | null>(null); // พื้นที่ที่กำลังดู (อาจยังไม่ได้บันทึก)
  const [picking, setPicking] = useState(false);
  const [amphoe, setAmphoe] = useState("");
  const [tumbon, setTumbon] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const p = loadPlaces();
    setPlaces(p);
    if (p[0]) setActive(p[0]);
  }, []);

  const options = useMemo(() => areaOptions(water, rain), [water, rain]);
  const result = useMemo(() => (active ? assess(active, water, rain) : null), [active, water, rain]);
  const saved = active ? places.some((p) => p.id === active.id) : false;

  const persist = (next: Place[]) => { setPlaces(next); savePlaces(next); };

  const locate = () => {
    setMsg("กำลังค้นหาตำแหน่ง…");
    if (!navigator.geolocation) return setMsg("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = coarse(p.coords.latitude), lon = coarse(p.coords.longitude);
        setActive({ id: `gps:${lat},${lon}`, label: "ตำแหน่งของฉัน", lat, lon });
        setPicking(false);
        setMsg(null);
      },
      () => setMsg("ไม่สามารถระบุตำแหน่งได้ — อนุญาตการเข้าถึงตำแหน่ง หรือเลือกตำบลแทน"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const choose = () => {
    if (!amphoe) return;
    const t = tumbon || undefined;
    setActive({ id: `area:${amphoe}/${t ?? ""}`, label: t ? `ต.${t} อ.${amphoe}` : `อ.${amphoe}`, amphoe, tumbon: t });
    setPicking(false);
    setMsg(null);
  };

  const toggleSave = () => {
    if (!active) return;
    if (saved) return persist(places.filter((p) => p.id !== active.id));
    if (places.length >= MAX_PLACES) return setMsg(`บันทึกได้สูงสุด ${MAX_PLACES} แห่ง ลบอันเก่าก่อน`);
    const name = active.id.startsWith("gps:") ? "ตำแหน่งที่บันทึก" : active.label;
    persist([...places, { ...active, label: name }]);
    setMsg(null);
  };

  const tumbons = options.find((o) => o.amphoe === amphoe)?.tumbons ?? [];

  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5 font-bold"><Home size={18} className="text-sky-700" /> น้ำท่วมใกล้บ้านฉันไหม?</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={locate} className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white">
          <LocateFixed size={16} /> ตรวจใกล้ฉัน
        </button>
        <button onClick={() => setPicking((v) => !v)} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold ${picking ? "border-sky-700 bg-sky-50 text-sky-800" : "border-slate-300 text-slate-700"}`}>
          <MapPin size={16} /> เลือกตำบล
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">ตำแหน่งที่เลือกประมวลผลในเครื่องและเก็บในเครื่องคุณเท่านั้น ไม่ส่งไปเซิร์ฟเวอร์</p>

      {picking && (
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <select value={amphoe} onChange={(e) => { setAmphoe(e.target.value); setTumbon(""); }} className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="">อำเภอ</option>
            {options.map((o) => <option key={o.amphoe} value={o.amphoe}>{o.amphoe}</option>)}
          </select>
          <select value={tumbon} onChange={(e) => setTumbon(e.target.value)} disabled={!amphoe} className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100">
            <option value="">ทั้งอำเภอ</option>
            {tumbons.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={choose} disabled={!amphoe} className="rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white disabled:opacity-40">ดู</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}

      {places.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 text-xs font-semibold text-slate-500">พื้นที่ของฉัน</div>
          <div className="flex flex-wrap gap-1.5">
            {places.map((p) => {
              const a = assess(p, water, rain);
              const on = active?.id === p.id;
              return (
                <button key={p.id} onClick={() => setActive(p)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? "border-sky-700 bg-sky-50 font-semibold" : "border-slate-300 bg-white"}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${RISK_META[a.verdict].dot}`} />
                  {label(p)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {active && result && (
        <div className={`mt-3 rounded-xl border-2 p-3 ${VERDICT_BOX[result.verdict]}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{active.label}</div>
              <div className="font-bold leading-snug">{result.headline}</div>
            </div>
            <RiskBadge risk={result.verdict} size="sm" />
          </div>
          {result.note && <p className="mt-1 text-xs text-slate-600">{result.note}</p>}

          {result.water.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {result.water.map(({ s, km }) => (
                <li key={s.id}>
                  <button onClick={() => onSelect(s.id)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/80 p-2 text-left">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="text-xs text-slate-500">
                        {num(s.level_msl)} ม.รทก.{km != null && ` · ห่าง ${km.toFixed(1)} กม.`}
                        {s.margin_to_critical != null && (s.margin_to_critical > 0 ? ` · เหลือ ${num(s.margin_to_critical)} ม. ถึงวิกฤต` : ` · เกินวิกฤต ${num(-s.margin_to_critical)} ม.`)}
                      </span>
                    </span>
                    <RiskBadge risk={s.risk} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white/80 p-2 text-sm">
            <span>ฝนสะสม 24 ชม.{result.rain24 != null ? ` สูงสุด ${num(result.rain24, 0)} มม.` : " — ไม่มีข้อมูล"}</span>
            <RainBadge level={result.rainLevel} />
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            เป็นการสรุปจากสถานีวัดรอบๆ ไม่ใช่การยืนยันว่าบ้านคุณท่วมหรือไม่ — สังเกตสภาพจริง ฟังประกาศทางการ และอพยพเมื่อเจ้าหน้าที่แจ้ง
          </p>

          <div className="mt-2 flex gap-2">
            <button onClick={toggleSave} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold ring-1 ring-slate-300">
              {saved ? <><BookmarkCheck size={16} className="text-sky-700" /> บันทึกแล้ว (แตะเพื่อลบ)</> : <><Bookmark size={16} /> บันทึกเป็นพื้นที่ของฉัน</>}
            </button>
            {!saved && <button onClick={() => setActive(null)} aria-label="ปิด" className="grid w-10 place-items-center rounded-xl bg-white ring-1 ring-slate-300"><X size={16} /></button>}
            {saved && <button onClick={() => { persist(places.filter((p) => p.id !== active.id)); setActive(null); }} aria-label="ลบ" className="grid w-10 place-items-center rounded-xl bg-white text-red-600 ring-1 ring-slate-300"><Trash2 size={16} /></button>}
          </div>
        </div>
      )}
    </section>
  );
}
