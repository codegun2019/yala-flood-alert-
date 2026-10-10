"use client";
import { Code2, ExternalLink, Mail, MessageCircle, Phone, ShieldAlert, UserRound } from "lucide-react";
import { APP_INFO, DEVELOPER } from "@/lib/developer";

function Facebook({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.9c-.3 0-1.3-.2-2.4-.2-2.5 0-4.1 1.5-4.1 4.2v2.6H7.6v3.3h2.8V22h3.1z" />
    </svg>
  );
}

function ContactRow({ icon: Icon, label, href, color }: { icon: React.ComponentType<{ size?: number }>; label: string; href: string; color: string }) {
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 active:bg-slate-100">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${color}`}><Icon size={20} /></span>
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      <ExternalLink size={16} className="shrink-0 text-slate-400" />
    </a>
  );
}

export default function DeveloperPanel() {
  const d = DEVELOPER;
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-4 bg-gradient-to-br from-sky-800 to-cyan-500 p-5 text-white">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/20 ring-2 ring-white/40"><UserRound size={34} /></span>
          <div className="min-w-0">
            <div className="text-xs opacity-90">ผู้พัฒนาระบบ</div>
            <div className="text-xl font-extrabold leading-tight">{d.name ?? APP_INFO.name}</div>
            {d.role && <div className="text-sm opacity-95">{d.role}</div>}
          </div>
        </div>
        {d.bio && <p className="px-5 pt-4 text-sm leading-relaxed text-slate-700">{d.bio}</p>}
        <div className="space-y-2 p-4">
          <ContactRow icon={Facebook} label={d.facebookLabel} href={d.facebookUrl} color="bg-[#1877f2]" />
          {d.line && <ContactRow icon={MessageCircle} label="LINE" href={d.line} color="bg-[#06c755]" />}
          {d.phone && <ContactRow icon={Phone} label={d.phone} href={`tel:${d.phone}`} color="bg-emerald-600" />}
          {d.email && <ContactRow icon={Mail} label={d.email} href={`mailto:${d.email}`} color="bg-rose-500" />}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 font-bold"><Code2 size={18} className="text-sky-700" /> เกี่ยวกับระบบ</h2>
        <div className="mt-2 text-sm text-slate-700">
          <b>{APP_INFO.name}</b> เวอร์ชัน {APP_INFO.version} — ระบบเฝ้าระวังระดับน้ำและปริมาณน้ำฝนจังหวัดยะลา พร้อมแจ้งเตือนผ่านมือถือ
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {APP_INFO.stack.map((s) => <span key={s} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">{s}</span>)}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
          {APP_INFO.credits.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>

      <p className="flex items-start gap-1.5 px-1 text-xs leading-relaxed text-slate-500">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        ระดับเตือนในระบบคำนวณอัตโนมัติจากข้อมูลสถานี ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ กรณีฉุกเฉินโทร ปภ. 1784 · ตำรวจ 191 · การแพทย์ 1669
      </p>
    </div>
  );
}
