"use client";
import { CloudSun, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Chart from "@/components/Chart";
import { api } from "@/lib/api";
import { fmtHM, num } from "@/lib/format";
import type { RainForecast } from "@/lib/types";

const LEVEL_CLS: Record<RainForecast["summary"]["level"], string> = {
  none: "bg-slate-100 text-slate-700", light: "bg-sky-100 text-sky-900", moderate: "bg-blue-100 text-blue-900",
  heavy: "bg-orange-100 text-orange-900", very_heavy: "bg-red-100 text-red-900",
};
const hour = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
const barColor = (mm: number) => (mm >= 30 ? "#dc2626" : mm >= 10 ? "#f97316" : mm >= 2 ? "#2563eb" : "#93c5fd");

/** พยากรณ์ฝน 24 ชม. ข้างหน้า (แบบจำลอง Open-Meteo — ไม่ใช่ประกาศทางการ) ซ่อนตัวเองเมื่อดึงไม่ได้ */
export default function ForecastCard({ lat, lon }: { lat?: number; lon?: number }) {
  const [f, setF] = useState<RainForecast | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : "";
    api<RainForecast>(`/api/forecast/rain${q}`).then((d) => { setF(d); setFailed(false); }).catch(() => setFailed(true));
    const t = setInterval(() => api<RainForecast>(`/api/forecast/rain${q}`).then(setF).catch(() => {}), 30 * 60_000);
    return () => clearInterval(t);
  }, [lat, lon]);

  const option = useMemo(() => {
    if (!f) return {};
    return {
      grid: { left: 30, right: 8, top: 14, bottom: 24 },
      tooltip: {
        trigger: "axis",
        formatter: (p: { dataIndex: number }[]) => {
          const h = f.hours[p[0].dataIndex];
          return `${hour.format(new Date(h.t))} น.<br/>ฝน ${h.mm.toFixed(1)} มม.${h.prob != null ? `<br/>โอกาสฝน ${h.prob}%` : ""}`;
        },
      },
      xAxis: { type: "category", data: f.hours.map((h) => hour.format(new Date(h.t)).slice(0, 2)), axisLabel: { interval: 2, fontSize: 10 }, axisTick: { show: false } },
      yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: "dashed" } } },
      series: [{ type: "bar", barWidth: "70%", data: f.hours.map((h) => ({ value: h.mm, itemStyle: { color: barColor(h.mm), borderRadius: [3, 3, 0, 0] } })) }],
    };
  }, [f]);

  if (failed && !f) return null;
  if (!f) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />;
  const s = f.summary;

  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold"><CloudSun size={18} className="text-sky-700" /> พยากรณ์ฝน 24 ชั่วโมงข้างหน้า</div>
          <div className="mt-0.5 text-sm">
            รวมประมาณ <b>{num(s.total_mm, 0)} มม.</b> · โอกาสฝนสูงสุด {s.max_prob}%
            {s.peak_at && <> · ตกหนักสุด ~{hour.format(new Date(s.peak_at))} น. ({num(s.peak_mm, 0)} มม./ชม.)</>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${LEVEL_CLS[s.level]}`}>{s.label}</span>
      </div>
      <Chart option={option} height={150} />
      <p className="flex items-start gap-1 text-[11px] leading-relaxed text-slate-500">
        <Info size={12} className="mt-0.5 shrink-0" />
        พยากรณ์จากแบบจำลองสภาพอากาศ ({f.source}) คลาดเคลื่อนได้ ไม่ใช่ประกาศของกรมอุตุนิยมวิทยา · อัปเดต {fmtHM(f.generated_at)}{f.stale && " · ข้อมูลเก่า (ดึงใหม่ไม่สำเร็จ)"}
      </p>
    </section>
  );
}
