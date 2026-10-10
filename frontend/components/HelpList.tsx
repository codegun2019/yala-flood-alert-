"use client";
import { Navigation, Phone } from "lucide-react";
import { useMemo } from "react";
import { distanceKm, fmtTime } from "@/lib/format";
import { HELP_KIND, type HelpPoint } from "@/lib/types";

/** รายการจุดช่วยเหลือ (ศูนย์พักพิง ฯลฯ) ที่ผู้ดูแลระบบกรอกไว้ — เรียงตามระยะทางเมื่อมีตำแหน่งผู้ใช้ */
export default function HelpList({ points, me }: { points: HelpPoint[]; me: [number, number] | null }) {
  const rows = useMemo(() => {
    const r = points.map((p) => ({ p, km: me ? distanceKm(me, [p.lat, p.lon]) : null }));
    return r.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.p.kind.localeCompare(b.p.kind) || a.p.name.localeCompare(b.p.name, "th"));
  }, [points, me]);

  if (!points.length) {
    return <p className="rounded-2xl bg-white p-3 text-sm text-slate-500 shadow-sm">ยังไม่มีข้อมูลจุดช่วยเหลือ (ศูนย์พักพิง/จุดแพทย์) — ผู้ดูแลระบบจะเพิ่มเมื่อมีข้อมูลที่ยืนยันแล้ว กรณีฉุกเฉินโทร ปภ. 1784</p>;
  }
  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm">
      <h2 className="font-bold">จุดช่วยเหลือ {me && <span className="text-xs font-normal text-slate-500">(เรียงจากใกล้ตำแหน่งคุณ)</span>}</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map(({ p, km }) => {
          const k = HELP_KIND[p.kind];
          return (
            <li key={p.id} className="py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: k.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {k.label}{[p.tumbon && `ต.${p.tumbon}`, p.amphoe && `อ.${p.amphoe}`].filter(Boolean).length > 0 && " · " + [p.tumbon && `ต.${p.tumbon}`, p.amphoe && `อ.${p.amphoe}`].filter(Boolean).join(" ")}
                    {km != null && ` · ห่าง ${km.toFixed(1)} กม.`}
                  </div>
                  {p.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{p.detail}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                    {p.phone && <a href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800"><Phone size={14} /> {p.phone}</a>}
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-800"><Navigation size={14} /> นำทาง</a>
                    <span className="text-[11px] text-slate-400">อัปเดต {fmtTime(p.updated_at)}</span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">ข้อมูลกรอกโดยผู้ดูแลระบบ สถานะอาจเปลี่ยนได้ — โทรยืนยันกับหน่วยงานก่อนเดินทาง</p>
    </section>
  );
}
