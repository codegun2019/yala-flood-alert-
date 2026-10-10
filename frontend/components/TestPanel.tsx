"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, CircleCheck, CircleX, Send, Volume2, VolumeX, Vibrate } from "lucide-react";
import { api } from "@/lib/api";
import { isStandalone } from "@/lib/install";
import { currentSubscription } from "@/lib/push";
import { playAlert, setSoundEnabled, soundEnabled, unlockAudio } from "@/lib/sound";

interface Diag {
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
  sw: boolean;
  subscribed: boolean;
}

export default function TestPanel({ refreshKey }: { refreshKey: number }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [sound, setSound] = useState(true);
  const [delay, setDelay] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    setDiag({
      permission: "Notification" in window ? Notification.permission : "unsupported",
      standalone: isStandalone(),
      sw: !!reg,
      subscribed: !!(await currentSubscription().catch(() => null)),
    });
  };

  useEffect(() => {
    setSound(soundEnabled());
    check();
  }, [refreshKey]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const hear = (sev: "test" | "watch" | "high" | "critical", label: string) => {
    unlockAudio();
    const ok = playAlert(sev);
    setHeard(ok ? `กำลังเล่นเสียง: ${label}` : "เล่นเสียงไม่ได้ — ตรวจสอบว่าไม่ได้ปิดเสียงเครื่อง/โหมดเงียบ แล้วลองกดอีกครั้ง");
  };

  const sendTest = async () => {
    unlockAudio(); // inside the tap, so the in-app chime can also play when the push arrives
    setResult(null);
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (!sub) throw new Error("ยังไม่ได้เปิดการแจ้งเตือนบนเครื่องนี้ (กด “เปิดการแจ้งเตือน” ด้านบนก่อน)");
      if (delay > 0) {
        for (let s = delay; s > 0; s--) {
          setCount(s);
          await new Promise((r) => (timer.current = setTimeout(r, 1000) as any));
        }
        setCount(null);
      }
      const r = await api<{ status: string; error: string | null }>("/api/push/test", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
      setResult(
        r.status === "sent"
          ? { ok: true, text: "ส่งถึงบริการแจ้งเตือนของเครื่องแล้ว — ควรเห็นแจ้งเตือนบนจอภายใน 1–10 วินาที พร้อมเสียงของเครื่อง" }
          : { ok: false, text: `ส่งไม่สำเร็จ: ${r.error ?? r.status}` }
      );
    } catch (e: any) {
      setCount(null);
      setResult({ ok: false, text: String(e?.message ?? e).replace(/^\d{3}\s/, "") });
    } finally {
      setBusy(false);
      check();
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Send size={20} className="text-sky-700" /> ทดสอบการแจ้งเตือน</h2>

      {diag && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
          <Check ok={diag.permission === "granted"} label={`สิทธิ์แจ้งเตือน: ${diag.permission === "granted" ? "อนุญาต" : diag.permission === "denied" ? "ถูกบล็อก" : "ยังไม่ได้อนุญาต"}`} />
          <Check ok={diag.sw} label={diag.sw ? "Service Worker พร้อม" : "Service Worker ยังไม่ทำงาน"} />
          <Check ok={diag.subscribed} label={diag.subscribed ? "สมัครรับแจ้งเตือนแล้ว" : "ยังไม่ได้สมัครรับแจ้งเตือน"} />
          <Check ok={diag.standalone} warnOnly label={diag.standalone ? "เปิดจากไอคอนแอป" : "เปิดในเบราว์เซอร์ (iPhone ต้องเปิดจากไอคอน)"} />
        </ul>
      )}

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <div className="text-sm font-semibold">1) ลองฟังเสียงเตือนในแอป</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-semibold">
          <button onClick={() => hear("test", "ทดสอบ")} className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 ring-1 ring-slate-200"><Volume2 size={16} /> เสียงทดสอบ</button>
          <button onClick={() => hear("watch", "เฝ้าระวัง")} className="rounded-xl bg-yellow-100 py-2.5 text-yellow-900">เฝ้าระวัง</button>
          <button onClick={() => hear("high", "เสี่ยงสูง")} className="rounded-xl bg-orange-100 py-2.5 text-orange-900">เสี่ยงสูง</button>
          <button onClick={() => hear("critical", "วิกฤต (ไซเรน)")} className="flex items-center justify-center gap-1.5 rounded-xl bg-red-100 py-2.5 text-red-900"><Vibrate size={16} /> วิกฤต (ไซเรน)</button>
        </div>
        {heard && <p className="mt-2 text-xs text-slate-600">{heard}</p>}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundEnabled(e.target.checked); if (e.target.checked) unlockAudio(); }} />
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} เล่นเสียงเตือนเมื่อเปิดแอปค้างไว้และมีแจ้งเตือนเข้า
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <div className="text-sm font-semibold">2) ส่งแจ้งเตือนจริงมาที่เครื่องนี้</div>
        <p className="mt-1 text-xs text-slate-600">ส่งผ่านระบบเดียวกับการเตือนจริง (ถึงเครื่องนี้เครื่องเดียว) แนะนำให้เลือก “หลัง 10 วินาที” แล้วล็อกหน้าจอ เพื่อดูว่าเด้งบนหน้าจอล็อกจริง</p>
        <div className="mt-2 flex gap-2 text-sm">
          {[0, 10].map((d) => (
            <button key={d} onClick={() => setDelay(d)} className={`flex-1 rounded-xl py-2 font-semibold ${delay === d ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {d === 0 ? "ส่งทันที" : "หลัง 10 วินาที"}
            </button>
          ))}
        </div>
        <button disabled={busy} onClick={sendTest} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 py-3 font-bold text-white disabled:opacity-50">
          <BellRing size={18} /> {count != null ? `จะส่งใน ${count} วินาที… (ล็อกจอได้เลย)` : busy ? "กำลังส่ง…" : "ส่งแจ้งเตือนทดสอบ"}
        </button>
        {result && (
          <p className={`mt-2 flex items-start gap-2 rounded-lg p-2.5 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
            {result.ok ? <CircleCheck size={18} className="mt-0.5 shrink-0" /> : <CircleX size={18} className="mt-0.5 shrink-0" />} {result.text}
          </p>
        )}
      </div>

      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">ไม่เห็นแจ้งเตือน หรือไม่มีเสียง? ตรวจสอบตามนี้</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>เสียงแจ้งเตือนตอนปิดแอป คือ <b>เสียงแจ้งเตือนมาตรฐานของเครื่อง</b> เว็บกำหนดเสียงเองไม่ได้ — ต้องไม่เปิดโหมดเงียบ/ห้ามรบกวน และเปิดเสียงระบบ</li>
          <li><b>iPhone:</b> ตั้งค่า → การแจ้งเตือน → Yala Flood → เปิด “เสียง” และ “หน้าจอล็อก” · ต้องเปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4+)</li>
          <li><b>Android:</b> ตั้งค่า → แอป → Chrome (หรือ Yala Flood) → การแจ้งเตือน → เปิดเสียงและการสั่น · ปิดโหมดประหยัดแบตที่จำกัด Chrome เบื้องหลัง</li>
          <li>เสียงไซเรนและเสียงปิ๊บในปุ่มด้านบน ใช้ได้เฉพาะตอน <b>เปิดแอปค้างอยู่</b> เท่านั้น</li>
        </ul>
      </details>
    </section>
  );
}

function Check({ ok, label, warnOnly }: { ok: boolean; label: string; warnOnly?: boolean }) {
  return (
    <li className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${ok ? "bg-emerald-50 text-emerald-800" : warnOnly ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
      {ok ? <CircleCheck size={14} className="shrink-0" /> : <CircleX size={14} className="shrink-0" />}
      <span>{label}</span>
    </li>
  );
}
