import { ExternalLink, Phone } from "lucide-react";

const EMERGENCY = [
  { n: "1784", label: "ปภ.", sub: "ภัยพิบัติ / ขอความช่วยเหลือ", tone: "bg-red-600" },
  { n: "191", label: "ตำรวจ", sub: "เหตุด่วนเหตุร้าย", tone: "bg-blue-700" },
  { n: "1669", label: "การแพทย์ฉุกเฉิน", sub: "เจ็บป่วยฉุกเฉิน", tone: "bg-emerald-700" },
  { n: "199", label: "ดับเพลิง", sub: "เพลิงไหม้ / กู้ภัย", tone: "bg-orange-600" },
  { n: "1193", label: "ตำรวจทางหลวง", sub: "ถนนขาด / น้ำท่วมทางหลวง", tone: "bg-slate-700" },
] as const;

// เว็บไซต์หน่วยงานหลักเท่านั้น (ไม่ลิงก์ลึก เพื่อไม่ให้ลิงก์เสียเมื่อเว็บปรับโครงสร้าง)
const LINKS = [
  { href: "https://www.thaiwater.net", name: "ThaiWater (สสน.)", desc: "ระดับน้ำ ฝน ข้อมูลน้ำทั่วประเทศ" },
  { href: "https://www.tmd.go.th", name: "กรมอุตุนิยมวิทยา", desc: "พยากรณ์อากาศ ประกาศเตือนภัยทางการ" },
  { href: "https://www.disaster.go.th", name: "กรมป้องกันและบรรเทาสาธารณภัย", desc: "ประกาศ/แจ้งเตือนภัยพิบัติทางการ" },
  { href: "https://www.rid.go.th", name: "กรมชลประทาน", desc: "สถานการณ์น้ำ เขื่อน อ่างเก็บน้ำ" },
  { href: "https://www.windy.com/6.54/101.28?rain,6.540,101.280,9", name: "Windy", desc: "แผนที่ฝน/ลม (บริการภายนอก)" },
] as const;

/** เบอร์ฉุกเฉินแบบการ์ด + ลิงก์ไปแหล่งข้อมูลทางการ — เมื่อขัดแย้งกับระบบนี้ ให้ยึดประกาศของหน่วยงานเป็นหลัก */
export default function ResourcesCard() {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-3 shadow-sm">
      <div>
        <h2 className="font-bold">เบอร์ฉุกเฉิน</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {EMERGENCY.map((e, i) => (
            <a key={e.n} href={`tel:${e.n}`} className={`flex items-center gap-2 rounded-xl p-2.5 text-white ${e.tone} ${i === 0 ? "col-span-2" : ""}`}>
              <Phone size={18} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-lg font-extrabold leading-tight tabular-nums">{e.n} <span className="text-sm font-semibold">{e.label}</span></span>
                <span className="block text-[11px] opacity-90">{e.sub}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
      <div>
        <h2 className="font-bold">แหล่งข้อมูลทางการ</h2>
        <ul className="mt-1 divide-y divide-slate-100">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sky-800">{l.name}</span>
                  <span className="block text-xs text-slate-500">{l.desc}</span>
                </span>
                <ExternalLink size={16} className="shrink-0 text-slate-400" />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">ลิงก์ไปยังเว็บไซต์ภายนอก หากข้อมูลไม่ตรงกับระบบนี้ ให้ยึดประกาศอย่างเป็นทางการของหน่วยงานนั้นเป็นหลัก</p>
      </div>
    </section>
  );
}
