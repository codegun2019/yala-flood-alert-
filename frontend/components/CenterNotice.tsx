import { Building, Phone } from "lucide-react";
import { fmtTime } from "@/lib/format";
import type { CenterStatus } from "@/lib/types";

const STATE = {
  closed: { label: "ศูนย์ช่วยเหลือ", cls: "border-slate-300 bg-white text-slate-800", icon: "bg-slate-100 text-slate-600" },
  standby: { label: "เตรียมพร้อมเปิดศูนย์", cls: "border-amber-400 bg-amber-50 text-amber-950", icon: "bg-amber-200 text-amber-900" },
  open: { label: "เปิดศูนย์ช่วยเหลือแล้ว", cls: "border-emerald-400 bg-emerald-50 text-emerald-950", icon: "bg-emerald-200 text-emerald-900" },
} as const;

/** สถานะศูนย์ช่วยเหลือ — แสดงเฉพาะเมื่อผู้ดูแลระบบประกาศไว้เท่านั้น (ไม่มีค่าเริ่มต้น) */
export default function CenterNotice({ status }: { status: CenterStatus | null }) {
  if (!status) return null;
  const m = STATE[status.state];
  return (
    <section className={`rounded-2xl border p-3 ${m.cls}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${m.icon}`}><Building size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold opacity-70">{m.label}</div>
          <div className="font-bold leading-snug">{status.text}</div>
          {status.detail && <p className="mt-0.5 whitespace-pre-line text-sm">{status.detail}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
            {status.phone && <a href={`tel:${status.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1 font-semibold underline"><Phone size={12} /> {status.phone}</a>}
            <span>ประกาศโดยผู้ดูแลระบบ · อัปเดต {fmtTime(status.updated_at)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
