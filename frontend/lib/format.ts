import type { RainLevel, Risk } from "./types";

export const RISK_META: Record<Risk, { label: string; color: string; bg: string; ring: string; dot: string; hex: string; desc: string }> = {
  normal: { label: "ปกติ", color: "text-emerald-800", bg: "bg-emerald-100", ring: "ring-emerald-300", dot: "bg-emerald-500", hex: "#10b981", desc: "ระดับน้ำอยู่ในเกณฑ์ปกติ" },
  watch: { label: "เฝ้าระวัง", color: "text-yellow-900", bg: "bg-yellow-100", ring: "ring-yellow-400", dot: "bg-yellow-400", hex: "#eab308", desc: "ระดับน้ำเริ่มสูงขึ้น" },
  high: { label: "เสี่ยงสูง", color: "text-orange-900", bg: "bg-orange-100", ring: "ring-orange-400", dot: "bg-orange-500", hex: "#f97316", desc: "ใกล้เกณฑ์อันตราย" },
  critical: { label: "วิกฤต", color: "text-red-900", bg: "bg-red-100", ring: "ring-red-400", dot: "bg-red-600", hex: "#dc2626", desc: "ถึงเกณฑ์อันตราย" },
  stale: { label: "ข้อมูลล่าช้า", color: "text-slate-800", bg: "bg-slate-200", ring: "ring-slate-400", dot: "bg-slate-500", hex: "#64748b", desc: "ข้อมูลหยุดอัปเดต — ห้ามตีความว่าปกติ" },
  unknown: { label: "ไม่มีเกณฑ์/ข้อมูล", color: "text-slate-700", bg: "bg-slate-100", ring: "ring-slate-300", dot: "bg-slate-400", hex: "#94a3b8", desc: "ประเมินระดับความเสี่ยงไม่ได้" },
};

export const RISK_ORDER: Record<Risk, number> = { critical: 5, high: 4, watch: 3, stale: 2, unknown: 1, normal: 0 };

export const RAIN_META: Record<RainLevel, { label: string; cls: string }> = {
  normal: { label: "ปกติ", cls: "bg-emerald-100 text-emerald-800" },
  heavy: { label: "ฝนหนัก", cls: "bg-orange-100 text-orange-900" },
  very_heavy: { label: "ฝนหนักมาก", cls: "bg-red-100 text-red-900" },
  stale: { label: "ข้อมูลล่าช้า", cls: "bg-slate-200 text-slate-800" },
  unknown: { label: "ไม่มีข้อมูล", cls: "bg-slate-100 text-slate-700" },
};

export const TREND_META = {
  rising: { label: "เพิ่มขึ้น", cls: "text-red-600" },
  falling: { label: "ลดลง", cls: "text-emerald-600" },
  steady: { label: "ทรงตัว", cls: "text-slate-500" },
} as const;

const TZ = "Asia/Bangkok";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso)) + " น.";
}

export function fmtHM(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) + " น.";
}

export function fmtAge(min: number | null | undefined): string {
  if (min == null) return "-";
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${Math.round(min)} นาทีที่แล้ว`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ชม. ${Math.round(min % 60)} นาทีที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export const num = (v: number | null | undefined, d = 2) => (v == null ? "-" : v.toFixed(d));

export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const THRESHOLD_SOURCE: Record<string, string> = {
  admin_verified: "เกณฑ์ที่ศูนย์เฝ้าระวังตรวจสอบแล้ว",
  admin: "เกณฑ์ที่ผู้ดูแลตั้งเอง (ยังไม่รับรอง)",
  official: "เกณฑ์วิกฤตจากแหล่งข้อมูลต้นทาง",
  bank_default: "เกณฑ์เริ่มต้นจากระดับตลิ่ง (ยังไม่ได้รับรอง)",
};
