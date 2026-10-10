"use client";
import { Camera, Megaphone } from "lucide-react";
import { useState } from "react";
import { fmtTime } from "@/lib/format";
import type { CitizenReport } from "@/lib/types";

/** รายงานจากประชาชนที่ผู้ดูแลตรวจเบื้องต้นแล้ว — ไม่ใช่ข้อมูลทางการ และไม่ถูกนำไปคำนวณระดับเตือน */
export default function ReportList({ reports, onNew }: { reports: CitizenReport[]; onNew: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">รายงานจากประชาชน <span className="text-xs font-normal text-slate-500">(12 ชม.ล่าสุด)</span></h2>
        <button onClick={onNew} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white"><Megaphone size={14} /> แจ้งน้ำท่วม</button>
      </div>
      {reports.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">ยังไม่มีรายงานที่ผ่านการตรวจสอบในช่วง 12 ชั่วโมงที่ผ่านมา</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {reports.map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-sm bg-orange-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">น้ำท่วม{r.depth_label} <span className="text-xs font-normal text-slate-500">· {fmtTime(r.created_at)}</span></div>
                  {r.note && <p className="text-sm text-slate-700">{r.note}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <a href={`https://www.google.com/maps?q=${r.lat},${r.lon}`} target="_blank" rel="noopener noreferrer" className="text-sky-800 underline">ดูตำแหน่ง</a>
                    {r.has_photo && (
                      <button onClick={() => setOpen(open === r.id ? null : r.id)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700"><Camera size={14} /> {open === r.id ? "ซ่อนรูป" : "ดูรูป"}</button>
                    )}
                  </div>
                  {open === r.id && <img src={`/api/reports/${r.id}/photo`} alt="รูปจากผู้รายงาน" loading="lazy" className="mt-2 max-h-64 w-full rounded-xl object-cover" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">ข้อมูลจากประชาชน ไม่ระบุชื่อ ตรวจเบื้องต้นโดยผู้ดูแลระบบ <b>ไม่ใช่ข้อมูลทางการ</b> และไม่ถูกนำไปคำนวณระดับเตือน — ตำแหน่งอาจคลาดเคลื่อน</p>
    </section>
  );
}
