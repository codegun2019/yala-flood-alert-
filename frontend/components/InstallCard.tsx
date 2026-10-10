"use client";
import { useEffect, useState } from "react";
import { Copy, Download, EllipsisVertical, Plus, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { useInstall } from "@/lib/install";

const KEY = "yala-install-dismissed";
const DAYS = 7;

function recentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < DAYS * 864e5;
  } catch {
    return false;
  }
}

export default function InstallCard({ variant = "banner" }: { variant?: "banner" | "inline" }) {
  const { kind, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setHidden(variant === "banner" && recentlyDismissed()), [variant]);

  if (kind === "standalone") {
    return variant === "inline" ? (
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
        <Smartphone size={18} /> ติดตั้งแอปบนเครื่องนี้แล้ว
      </p>
    ) : null;
  }
  if (kind === "none" || hidden) return null;

  const dismiss = () => {
    localStorage.setItem(KEY, String(Date.now()));
    setHidden(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-700 to-cyan-600 p-3.5 text-white shadow">
        {variant === "banner" && (
          <button onClick={dismiss} aria-label="ซ่อน" className="absolute right-2 top-2 rounded-full p-1 text-white/80 hover:bg-white/20"><X size={16} /></button>
        )}
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl shadow ring-1 ring-white/40" />
          <div className="min-w-0 flex-1 pr-4">
            {kind === "in-app" ? (
              <>
                <div className="font-bold leading-tight">เปิดด้วย Safari / Chrome ก่อน</div>
                <div className="text-xs text-white/90">เบราว์เซอร์ในแอป (เช่น LINE) ติดตั้งแอปและรับแจ้งเตือนไม่ได้</div>
              </>
            ) : (
              <>
                <div className="font-bold leading-tight">ติดตั้งแอป YALA FLOOD ALERT</div>
                <div className="text-xs text-white/90">เปิดจากหน้าจอโฮมได้ทันที และรับแจ้งเตือนน้ำท่วมแม้ปิดเว็บ</div>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {kind === "prompt" && (
            <button onClick={() => install()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-2.5 font-bold text-sky-800">
              <Download size={18} /> ติดตั้งแอป
            </button>
          )}
          {(kind === "ios" || kind === "android-manual") && (
            <button onClick={() => setSheet(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-2.5 font-bold text-sky-800">
              <SquarePlus size={18} /> วิธีเพิ่มลงหน้าจอโฮม
            </button>
          )}
          {kind === "in-app" && (
            <button onClick={copyLink} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-2.5 font-bold text-sky-800">
              <Copy size={18} /> {copied ? "คัดลอกลิงก์แล้ว — ไปวางใน Safari/Chrome" : "คัดลอกลิงก์เว็บ"}
            </button>
          )}
        </div>
      </section>

      {sheet && (
        <div className="fixed inset-0 z-[1100] flex items-end bg-black/60 sm:items-center sm:justify-center" onClick={() => setSheet(false)}>
          <div className="pb-safe w-full rounded-t-3xl bg-white p-5 text-slate-900 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold">{kind === "ios" ? "ติดตั้งบน iPhone / iPad" : "ติดตั้งบน Android"}</h3>
              <button onClick={() => setSheet(false)} aria-label="ปิด" className="rounded-full bg-slate-100 p-2"><X size={18} /></button>
            </div>
            {kind === "ios" ? (
              <ol className="mt-4 space-y-4">
                <Step n={1} icon={<Share size={22} />}>กดปุ่ม <b>แชร์</b> ที่แถบด้านล่าง (หรือด้านบน) ของ Safari</Step>
                <Step n={2} icon={<SquarePlus size={22} />}>เลื่อนลงแล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></Step>
                <Step n={3} icon={<Plus size={22} />}>กด <b>“เพิ่ม”</b> แล้วเปิดแอปจากไอคอนบนหน้าจอโฮม</Step>
              </ol>
            ) : (
              <ol className="mt-4 space-y-4">
                <Step n={1} icon={<EllipsisVertical size={22} />}>กดเมนู <b>⋮</b> มุมขวาบนของ Chrome</Step>
                <Step n={2} icon={<Download size={22} />}>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></Step>
                <Step n={3} icon={<Plus size={22} />}>ยืนยัน แล้วเปิดแอปจากไอคอนบนหน้าจอ</Step>
              </ol>
            )}
            {kind === "ios" && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                ต้องใช้ iOS 16.4 ขึ้นไป และต้อง <b>เปิดจากไอคอนบนหน้าจอโฮม</b> เท่านั้น จึงจะเปิดการแจ้งเตือนได้
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-700 text-sm font-bold text-white">{n}</span>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-sky-700">{icon}</span>
      <span className="text-sm leading-snug">{children}</span>
    </li>
  );
}
