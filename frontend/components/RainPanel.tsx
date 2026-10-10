"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtAge, num } from "@/lib/format";
import type { RainStation } from "@/lib/types";
import { RainBadge } from "./Badges";
import Chart from "./Chart";

const hf = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

export default function RainPanel({ rain }: { rain: RainStation[] }) {
  const sorted = useMemo(() => [...rain].sort((a, b) => (b.rain_24h ?? -1) - (a.rain_24h ?? -1)), [rain]);
  const [sel, setSel] = useState<string | null>(null);
  const [pts, setPts] = useState<{ t: string; rain_1h: number | null; rain_24h: number | null }[]>([]);
  const max24 = Math.max(100, ...rain.map((r) => r.rain_24h ?? 0));

  useEffect(() => {
    if (!sel) return;
    api<{ points: typeof pts }>(`/api/rainfall/history?station_id=${encodeURIComponent(sel)}&hours=48`).then((d) => setPts(d.points)).catch(() => setPts([]));
  }, [sel]);

  const option = useMemo(() => ({
    grid: { left: 40, right: 40, top: 24, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "time", axisLabel: { formatter: (v: number) => hf.format(new Date(v)), hideOverlap: true } },
    yAxis: [{ type: "value", name: "24 ชม.", nameTextStyle: { fontSize: 10 } }, { type: "value", name: "1 ชม.", nameTextStyle: { fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: "สะสม 24 ชม. (มม.)", type: "line", showSymbol: false, areaStyle: { opacity: 0.12 }, lineStyle: { color: "#0b5cad" }, itemStyle: { color: "#0b5cad" }, data: pts.filter((p) => p.rain_24h != null).map((p) => [new Date(p.t).getTime(), p.rain_24h]) },
      { name: "1 ชม. (มม.)", type: "bar", yAxisIndex: 1, itemStyle: { color: "#f97316" }, data: pts.filter((p) => p.rain_1h != null).map((p) => [new Date(p.t).getTime(), p.rain_1h]) },
    ],
  }), [pts]);

  return (
    <div className="space-y-2">
      {sorted.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">ยังไม่มีข้อมูลฝน</p>}
      {sorted.map((r) => (
        <div key={r.id} className="rounded-2xl bg-white p-3 shadow-sm">
          <button className="w-full text-left" onClick={() => setSel(sel === r.id ? null : r.id)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold leading-tight">{r.name}</div>
                <div className="text-xs text-slate-500">{[r.amphoe && `อ.${r.amphoe}`, r.agency].filter(Boolean).join(" · ")}</div>
              </div>
              <RainBadge level={r.rain_level} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-500">1 ชม. </span><b className="tabular-nums">{num(r.rain_1h, 1)}</b> มม.</div>
              <div><span className="text-slate-500">24 ชม. </span><b className="tabular-nums">{num(r.rain_24h, 1)}</b> มม.</div>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, ((r.rain_24h ?? 0) / max24) * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500">{fmtAge(r.age_minutes)}{r.simulated && " · ข้อมูลจำลอง"}</div>
          </button>
          {sel === r.id && (pts.length >= 2 ? <Chart option={option} height={200} /> : <p className="py-4 text-center text-xs text-slate-500">ข้อมูลย้อนหลังยังไม่พอสำหรับแสดงกราฟ</p>)}
        </div>
      ))}
      <p className="px-1 text-xs text-slate-500">เกณฑ์ฝน (ปรับได้): ≥ 35 มม./วัน = ฝนหนัก, ≥ 90 มม./วัน = ฝนหนักมาก, 1 ชม. ≥ 30 มม. = ตกหนัก</p>
    </div>
  );
}
