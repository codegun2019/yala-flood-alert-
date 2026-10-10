"use client";
import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, FlaskConical, Info as InfoIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtAge, fmtTime, num, RISK_META, THRESHOLD_SOURCE } from "@/lib/format";
import type { WaterStation } from "@/lib/types";
import { RiskBadge, Trend } from "./Badges";
import Chart from "./Chart";

interface History {
  thresholds: WaterStation["thresholds"];
  points: { t: string; v: number }[];
}

const SOURCE_CLASS: Record<number, string> = { 1: "น้อยวิกฤต", 2: "น้อย", 3: "ปกติ", 4: "มาก", 5: "ล้นตลิ่ง" };

const tf = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hf = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

export default function StationSheet({
  station, followed, onToggleFollow, onClose,
}: { station: WaterStation; followed: boolean; onToggleFollow: () => void; onClose: () => void }) {
  const [hours, setHours] = useState(48);
  const [hist, setHist] = useState<History | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setHist(null);
    setErr(null);
    api<History>(`/api/water/history?station_id=${encodeURIComponent(station.id)}&hours=${hours}`)
      .then(setHist)
      .catch((e) => setErr(String(e.message)));
  }, [station.id, hours]);

  const option = useMemo(() => {
    if (!hist) return {};
    const th = hist.thresholds;
    const lines = th
      ? [
          { yAxis: th.watch, name: "เฝ้าระวัง", color: RISK_META.watch.hex },
          { yAxis: th.high, name: "เสี่ยงสูง", color: RISK_META.high.hex },
          { yAxis: th.critical, name: "วิกฤต", color: RISK_META.critical.hex },
        ]
      : [];
    return {
      grid: { left: 46, right: 56, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis",
        formatter: (p: any) => `${tf.format(new Date(p[0].value[0]))} น.<br/><b>${Number(p[0].value[1]).toFixed(2)}</b> ม.รทก.`,
      },
      xAxis: { type: "time", axisLabel: { formatter: (v: number) => hf.format(new Date(v)), hideOverlap: true } },
      yAxis: { type: "value", scale: true, axisLabel: { formatter: (v: number) => v.toFixed(1) } },
      series: [
        {
          type: "line", showSymbol: hist.points.length < 40, smooth: false, lineStyle: { width: 2.5, color: "#0b5cad" }, itemStyle: { color: "#0b5cad" },
          areaStyle: { color: "rgba(11,92,173,0.10)" },
          data: hist.points.map((p) => [new Date(p.t).getTime(), p.v]),
          markLine: {
            symbol: "none", silent: true,
            data: lines.map((l) => ({ yAxis: l.yAxis, lineStyle: { color: l.color, type: "dashed" }, label: { formatter: l.name, color: l.color, position: "insideEndTop" } })),
          },
        },
      ],
    };
  }, [hist]);

  const m = RISK_META[station.risk];
  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-safe sm:max-w-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-tight">{station.name}</h2>
            <p className="text-sm text-slate-500">{[station.tumbon && `ต.${station.tumbon}`, station.amphoe && `อ.${station.amphoe}`, station.agency].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="rounded-full bg-slate-100 p-2"><X size={20} /></button>
        </div>

        <div className={`mt-4 rounded-2xl p-4 ${m.bg}`}>
          <div className="flex items-center justify-between">
            <RiskBadge risk={station.risk} size="lg" />
            <Trend trend={station.trend} />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-bold tabular-nums">{num(station.level_msl)}</span>
            <span className="pb-1 text-sm">ม.รทก.</span>
          </div>
          <p className="mt-1 text-sm">{station.reason}</p>
          {station.risk === "stale" && station.last_known_risk && (
            <p className="mt-1 text-sm font-semibold">ค่าล่าสุดที่ได้รับอยู่ในระดับ “{RISK_META[station.last_known_risk].label}” — ควรตรวจสอบจากแหล่งอื่น</p>
          )}
          <p className="mt-2 text-xs opacity-80">ข้อมูลเวลา {fmtTime(station.observed_at)} ({fmtAge(station.age_minutes)})</p>
        </div>

        {station.simulated && <p className="mt-3 flex items-center gap-2 rounded-lg bg-purple-100 p-2 text-sm font-semibold text-purple-900"><FlaskConical size={16} /> ข้อมูลจำลองเพื่อทดสอบระบบ ไม่ใช่สถานการณ์จริง</p>}

        <div className="mt-4 flex items-center justify-between">
          <h3 className="font-semibold">กราฟระดับน้ำ</h3>
          <div className="flex gap-1 text-sm">
            {[24, 48, 168].map((h) => (
              <button key={h} onClick={() => setHours(h)} className={`rounded-full px-3 py-1 ${hours === h ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                {h === 168 ? "7 วัน" : `${h} ชม.`}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-red-600">โหลดกราฟไม่สำเร็จ: {err}</p>}
        {hist && hist.points.length < 2 && <p className="py-6 text-center text-sm text-slate-500">ยังมีข้อมูลย้อนหลังไม่พอสำหรับแสดงกราฟ (ระบบเริ่มเก็บข้อมูลตั้งแต่เปิดใช้งาน)</p>}
        {hist && hist.points.length >= 2 && <Chart option={option} />}

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Info k="ระดับตลิ่งต่ำสุด" v={station.bank_level != null ? `${num(station.bank_level)} ม.` : "ไม่มีข้อมูล"} />
          <Info k="เหลืออีกถึงวิกฤต" v={station.margin_to_critical != null ? `${num(station.margin_to_critical)} ม.` : "-"} />
          <Info k="อัตราการเปลี่ยน" v={station.rate_m_per_h != null ? `${station.rate_m_per_h > 0 ? "+" : ""}${num(station.rate_m_per_h)} ม./ชม.` : "-"} />
          <Info k="สถานะจากต้นทาง" v={station.source_situation != null ? SOURCE_CLASS[station.source_situation] ?? String(station.source_situation) : "-"} />
        </dl>
        {station.thresholds && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="font-semibold">เกณฑ์ของสถานีนี้ (ม.รทก.)</div>
            <div className="mt-1 flex gap-3">
              <span style={{ color: RISK_META.watch.hex }}>เฝ้าระวัง ≥ {num(station.thresholds.watch)}</span>
              <span style={{ color: RISK_META.high.hex }}>สูง ≥ {num(station.thresholds.high)}</span>
              <span style={{ color: RISK_META.critical.hex }}>วิกฤต ≥ {num(station.thresholds.critical)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{THRESHOLD_SOURCE[station.thresholds.source]}</p>
          </div>
        )}

        <button onClick={onToggleFollow} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold ${followed ? "bg-slate-200" : "bg-sky-700 text-white"}`}>
          {followed ? <><Check size={18} /> กำลังติดตามสถานีนี้ (กดเพื่อเลิก)</> : <><BellRing size={18} /> ติดตามสถานีนี้</>}
        </button>
        <p className="mt-2 flex items-start justify-center gap-1 text-center text-xs text-slate-500"><InfoIcon size={13} className="mt-0.5 shrink-0" />การเตือนอัตโนมัติมาจากข้อมูลสถานี ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ</p>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}
