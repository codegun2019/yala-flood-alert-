"use client";
import { BellRing, Share } from "lucide-react";
import { RISK_ICON } from "./Badges";
import InstallCard from "./InstallCard";
import TestPanel from "./TestPanel";
import { unlockAudio } from "@/lib/sound";
import { RISK_META } from "@/lib/format";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { currentSubscription, loadPrefs, pushSupport, type Prefs, subscribe, unsubscribe, updatePrefs } from "@/lib/push";
import type { AlertRow, WaterStation } from "@/lib/types";

export default function NotifyPanel({ water, prefs, setPrefs }: { water: WaterStation[]; prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const [support, setSupport] = useState<ReturnType<typeof pushSupport>>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<AlertRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setSupport(pushSupport());
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => {});
    api<{ alerts: AlertRow[] }>("/api/alerts?limit=30").then((d) => setHistory(d.alerts)).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<void>, ok: string) => {
    unlockAudio();
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e: any) {
      setMsg("ไม่สำเร็จ: " + (e?.message ?? e));
    } finally {
      setBusy(false);
      setSubscribed(!!(await currentSubscription().catch(() => null)));
      setTick((t) => t + 1);
    }
  };

  const toggleStation = (id: string) => {
    const s = prefs.stations.includes(id) ? prefs.stations.filter((x) => x !== id) : [...prefs.stations, id];
    setPrefs({ ...prefs, stations: s });
  };

  return (
    <div className="space-y-4">
      <InstallCard variant="inline" />
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold"><BellRing size={22} className="text-sky-700" /> รับแจ้งเตือนบนมือถือ</h2>
        {support === "ios-needs-install" && (
          <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            iPhone ต้องใช้ iOS 16.4 ขึ้นไป: กดปุ่ม <b>แชร์</b> (<Share size={14} className="inline -mt-0.5" />) → <b>เพิ่มลงในหน้าจอโฮม</b> แล้วเปิดแอปจากไอคอนบนหน้าจอโฮม จึงจะเปิดการแจ้งเตือนได้
          </p>
        )}
        {support === "unsupported" && <p className="mt-2 rounded-xl bg-slate-100 p-3 text-sm">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน ลองใช้ Chrome (Android) หรือ Safari (iOS 16.4+)</p>}
        {support === "denied" && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">การแจ้งเตือนถูกบล็อกไว้ ให้เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์ก่อน</p>}

        <div className="mt-3">
          <div className="text-sm font-semibold">แจ้งเตือนเมื่อระดับความเสี่ยงถึง</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["watch", "high", "critical"] as const).map((l) => (
              <button key={l} onClick={() => setPrefs({ ...prefs, min_level: l })}
                className={`flex items-center justify-center gap-1 rounded-xl border py-2 text-sm font-semibold ${prefs.min_level === l ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white"}`}>
                <RiskBadgeLite level={l} />
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={prefs.notify_rain} onChange={(e) => setPrefs({ ...prefs, notify_rain: e.target.checked })} className="h-5 w-5" />
          แจ้งเตือนฝนตกหนัก
        </label>

        <div className="mt-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>สถานีที่ติดตาม {prefs.stations.length === 0 && <span className="font-normal text-slate-500">(ทั้งหมด)</span>}</span>
            {prefs.stations.length > 0 && <button className="text-sky-700" onClick={() => setPrefs({ ...prefs, stations: [] })}>ล้าง</button>}
          </div>
          <div className="mt-1 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {water.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-5 w-5" checked={prefs.stations.includes(s.id)} onChange={() => toggleStation(s.id)} />
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-slate-500">{s.amphoe}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">การแจ้งเตือน “ข้อมูลสถานีหยุดอัปเดต” จะส่งเฉพาะสถานีที่คุณเลือกเองเท่านั้น</p>
        </div>

        <div className="mt-4 flex gap-2">
          {!subscribed ? (
            <button disabled={busy || support !== "ok"} onClick={() => run(() => subscribe(prefs), "เปิดการแจ้งเตือนแล้ว")}
              className="flex-1 rounded-xl bg-sky-700 py-3 font-semibold text-white disabled:opacity-40">เปิดการแจ้งเตือน</button>
          ) : (
            <>
              <button disabled={busy} onClick={() => run(() => updatePrefs(prefs), "บันทึกการตั้งค่าแล้ว")} className="flex-1 rounded-xl bg-sky-700 py-3 font-semibold text-white">บันทึกการตั้งค่า</button>
              <button disabled={busy} onClick={() => run(unsubscribe, "ยกเลิกการแจ้งเตือนแล้ว")} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold">ยกเลิก</button>
            </>
          )}
        </div>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
        <p className="mt-3 text-xs text-slate-500">ไม่รับประกันว่าการแจ้งเตือนจะถึงอุปกรณ์ทุกเครื่องทันที ควรเปิดดูหน้านี้และติดตามประกาศทางการควบคู่กัน</p>
      </section>

      <TestPanel refreshKey={tick} />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">ประวัติการแจ้งเตือน</h2>
        {history.length === 0 && <p className="mt-2 text-sm text-slate-500">ยังไม่มีประวัติการแจ้งเตือน</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {history.map((a) => (
            <li key={a.id} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{a.title}</span>
                <span className="shrink-0 text-xs text-slate-500">{fmtTime(a.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${a.official ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-600"}`}>
                {a.official ? "ประกาศทางการ" : "แจ้งเตือนอัตโนมัติ"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RiskBadgeLite({ level }: { level: "watch" | "high" | "critical" }) {
  const Icon = RISK_ICON[level];
  return (
    <>
      <Icon size={15} /> {RISK_META[level].label}
    </>
  );
}
