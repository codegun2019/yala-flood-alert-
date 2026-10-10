"use client";
import { Megaphone, MonitorCog, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtAge, fmtTime, num, RISK_META, THRESHOLD_SOURCE } from "@/lib/format";
import { HELP_KIND, type Announcement, type HelpPoint, type WaterStation } from "@/lib/types";
import { RiskBadge } from "@/components/Badges";
import ReportsQueue from "@/components/ReportsQueue";

interface AdminStation extends WaterStation {
  override: { watch_msl: number; high_msl: number; critical_msl: number; verified: boolean; note: string | null } | null;
}
interface Overview {
  now: string;
  poll_seconds: number;
  stale_minutes: number;
  subscriptions: number;
  notifications_24h: Record<string, number>;
  stations: AdminStation[];
  sources: { source: string; last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; consecutive_failures: number; records: number }[];
  defaults: { watch_margin_m: number; high_margin_m: number };
}

export default function Admin() {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<AdminStation | null>(null);

  const load = useCallback(async (t: string) => {
    try {
      setData(await api<Overview>("/api/admin/system-status", { admin: t }));
      setAnns((await api<{ announcements: Announcement[] }>("/api/announcements")).announcements);
      setToken(t);
      sessionStorage.setItem("yala-admin", t);
      setMsg(null);
    } catch (e: any) {
      setData(null);
      setToken("");
      sessionStorage.removeItem("yala-admin");
      setMsg(String(e.message).startsWith("401") ? "โทเคนไม่ถูกต้อง" : "เชื่อมต่อไม่ได้: " + e.message);
    }
  }, []);

  useEffect(() => {
    const t = sessionStorage.getItem("yala-admin");
    if (t) load(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      await load(token);
    } catch (e: any) {
      setMsg("ไม่สำเร็จ: " + e.message);
    }
  };

  if (!token || !data) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-bold">ศูนย์เฝ้าระวังน้ำท่วมยะลา — ผู้ดูแล</h1>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); load(input.trim()); }}>
          <input type="password" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Admin token" className="w-full rounded-xl border border-slate-300 p-3" />
          <button className="w-full rounded-xl bg-sky-700 py-3 font-semibold text-white">เข้าสู่ระบบ</button>
        </form>
        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        <p className="mt-6 text-xs text-slate-500">โทเคนอยู่ที่ <code>data/admin_token.txt</code> บนเซิร์ฟเวอร์ (หรือตัวแปร ADMIN_TOKEN) — สำหรับใช้งานจริงควรเปลี่ยนเป็น Supabase Auth</p>
      </div>
    );
  }

  const staleSrc = data.sources.some((s) => s.consecutive_failures > 0);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold"><MonitorCog size={24} className="text-sky-700" /> ศูนย์เฝ้าระวังน้ำท่วมยะลา — Admin</h1>
        <div className="flex gap-2 text-sm">
          <a href="/" className="rounded-full bg-slate-200 px-3 py-1.5">หน้าประชาชน</a>
          <button className="rounded-full bg-slate-200 px-3 py-1.5" onClick={() => { sessionStorage.removeItem("yala-admin"); setToken(""); setData(null); }}>ออก</button>
        </div>
      </div>
      {msg && <div className="rounded-xl bg-sky-100 p-3 text-sm text-sky-900">{msg}</div>}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">สถานะระบบ</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat k="ผู้สมัครแจ้งเตือน" v={String(data.subscriptions)} />
          <Stat k="ส่งสำเร็จ 24 ชม." v={String(data.notifications_24h.sent ?? 0)} />
          <Stat k="ส่งไม่สำเร็จ 24 ชม." v={String((data.notifications_24h.failed ?? 0) + (data.notifications_24h.expired ?? 0))} bad={(data.notifications_24h.failed ?? 0) > 0} />
          <Stat k="รอบดึงข้อมูล" v={`${data.poll_seconds / 60} นาที`} />
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th>แหล่งข้อมูล</th><th>สำเร็จล่าสุด</th><th>ล้มเหลวติดกัน</th><th>ข้อผิดพลาด</th></tr></thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.source} className="border-t border-slate-100">
                <td className="py-1.5 font-semibold">{s.source}</td>
                <td>{fmtTime(s.last_success_at)}</td>
                <td className={s.consecutive_failures ? "font-bold text-red-600" : ""}>{s.consecutive_failures}</td>
                <td className="max-w-[16rem] truncate text-xs text-red-700" title={s.last_error ?? ""}>{s.last_error ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {staleSrc && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-red-700"><TriangleAlert size={16} /> มีแหล่งข้อมูลที่ดึงไม่สำเร็จ</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => act(() => api("/api/admin/collect", { method: "POST", admin: token }), "ดึงข้อมูลและประเมินใหม่แล้ว")}>ดึงข้อมูลตอนนี้</button>
          <button className="rounded-xl bg-slate-200 px-4 py-2 text-sm" onClick={() => { if (confirm(`ส่งข้อความทดสอบถึงผู้สมัครทั้งหมด ${data.subscriptions} เครื่อง?`)) act(async () => { const r = await api<{ sent: number; recipients: number }>("/api/admin/test-push", { method: "POST", admin: token, body: JSON.stringify({}) }); setMsg(`ส่งทดสอบ ${r.sent}/${r.recipients}`); }, "ส่งทดสอบแล้ว"); }}>ส่งแจ้งเตือนทดสอบ</button>
        </div>
      </section>

      <ReportsQueue token={token} onDone={(m) => setMsg(m)} />
      <HelpPointsForm token={token} onDone={(m) => setMsg(m)} />
      <CenterForm token={token} onDone={(m) => setMsg(m)} />
      <AnnouncementForm token={token} onDone={(m) => { setMsg(m); load(token); }} />
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">ประกาศที่กำลังแสดง</h2>
        {anns.length === 0 && <p className="mt-1 text-sm text-slate-500">ไม่มี</p>}
        {anns.map((a) => (
          <div key={a.id} className="mt-2 flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <div><b>{a.title}</b> <span className="text-xs text-slate-500">({a.severity}, {fmtTime(a.created_at)})</span><p className="whitespace-pre-line">{a.body}</p></div>
            <button className="shrink-0 rounded-lg bg-red-100 px-3 py-1 text-red-800" onClick={() => act(() => api(`/api/admin/announcements/${a.id}`, { method: "DELETE", admin: token }), "ยกเลิกประกาศแล้ว")}>ถอน</button>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">สถานีวัดน้ำและเกณฑ์เตือนภัย</h2>
        <p className="text-xs text-slate-500">เกณฑ์เริ่มต้น: เฝ้าระวัง = ตลิ่ง − {data.defaults.watch_margin_m} ม., เสี่ยงสูง = ตลิ่ง − {data.defaults.high_margin_m} ม., วิกฤต = ตลิ่ง (ยังไม่ได้รับรอง) — ควรตั้งเกณฑ์จริงที่ผ่านการตรวจสอบรายสถานี</p>
        <div className="mt-2 divide-y divide-slate-100">
          {data.stations.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {num(s.level_msl)} ม. · {fmtAge(s.age_minutes)} · {s.thresholds ? `${num(s.thresholds.watch)} / ${num(s.thresholds.high)} / ${num(s.thresholds.critical)}` : "ไม่มีเกณฑ์"}
                  {s.thresholds && ` · ${THRESHOLD_SOURCE[s.thresholds.source]}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2"><RiskBadge risk={s.risk} size="sm" /><button className="rounded-lg bg-slate-100 px-3 py-1.5" onClick={() => setEdit(s)}>ตั้งเกณฑ์</button></div>
            </div>
          ))}
        </div>
      </section>

      {edit && <ThresholdModal s={edit} token={token} onClose={() => setEdit(null)} onDone={(m) => { setEdit(null); setMsg(m); load(token); }} />}
    </div>
  );
}

function Stat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className={`text-xl font-bold ${bad ? "text-red-600" : ""}`}>{v}</div></div>;
}

function AnnouncementForm({ token, onDone }: { token: string; onDone: (m: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "watch" | "high" | "critical">("info");
  const [hours, setHours] = useState(12);
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    if (push && !confirm("ส่งประกาศนี้เป็นการแจ้งเตือนถึงผู้สมัครทุกคนทันที ยืนยันหรือไม่?")) return;
    setBusy(true);
    try {
      const r = await api<{ recipients: number; sent: number }>("/api/admin/announcements", { method: "POST", admin: token, body: JSON.stringify({ title, body, severity, expires_in_hours: hours, push }) });
      setTitle(""); setBody("");
      onDone(`เผยแพร่ประกาศแล้ว${push ? ` (ส่ง ${r.sent}/${r.recipients})` : ""}`);
    } catch (e: any) { onDone("ไม่สำเร็จ: " + e.message); } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1.5 font-bold"><Megaphone size={18} className="text-red-700" /> ประกาศเตือนภัยอย่างเป็นทางการ</h2>
      <p className="text-xs text-slate-500">แยกจากการเตือนอัตโนมัติ — ผู้อ่านจะเห็นป้าย “ประกาศอย่างเป็นทางการ” ใช้เฉพาะข้อความที่ผ่านการอนุมัติจากหน่วยงานที่มีอำนาจ</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อ" className="mt-2 w-full rounded-xl border border-slate-300 p-2.5" maxLength={300} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="รายละเอียด" rows={3} className="mt-2 w-full rounded-xl border border-slate-300 p-2.5" maxLength={4000} />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className="rounded-lg border border-slate-300 p-2">
          <option value="info">ข้อมูล</option><option value="watch">เฝ้าระวัง</option><option value="high">เสี่ยงสูง</option><option value="critical">วิกฤต</option>
        </select>
        <label>แสดงนาน <input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 p-1.5" /> ชม.</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> ส่งแจ้งเตือน Push</label>
      </div>
      <button disabled={busy} onClick={submit} className="mt-3 rounded-xl bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">เผยแพร่ประกาศ</button>
    </section>
  );
}

function ThresholdModal({ s, token, onClose, onDone }: { s: AdminStation; token: string; onClose: () => void; onDone: (m: string) => void }) {
  const cur = s.override ?? (s.thresholds ? { watch_msl: s.thresholds.watch, high_msl: s.thresholds.high, critical_msl: s.thresholds.critical, verified: false, note: "" } : { watch_msl: 0, high_msl: 0, critical_msl: 0, verified: false, note: "" });
  const [w, setW] = useState(String(cur.watch_msl));
  const [h, setH] = useState(String(cur.high_msl));
  const [c, setC] = useState(String(cur.critical_msl));
  const [verified, setVerified] = useState(cur.verified);
  const [note, setNote] = useState(cur.note ?? "");
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const [nw, nh, nc] = [Number(w), Number(h), Number(c)];
    if ([nw, nh, nc].some(Number.isNaN)) return setErr("กรอกตัวเลขให้ครบ");
    if (!(nw < nh && nh < nc)) return setErr("ต้องกำหนด เฝ้าระวัง < เสี่ยงสูง < วิกฤต");
    try {
      await api(`/api/admin/thresholds/${s.id}`, { method: "PUT", admin: token, body: JSON.stringify({ watch_msl: nw, high_msl: nh, critical_msl: nc, verified, note: note || null }) });
      onDone("บันทึกเกณฑ์แล้ว");
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{s.name}</h3>
        <p className="text-xs text-slate-500">ระดับปัจจุบัน {num(s.level_msl)} ม.รทก. · ตลิ่ง {num(s.bank_level)} ม.</p>
        {([["เฝ้าระวัง ≥", w, setW, "watch"], ["เสี่ยงสูง ≥", h, setH, "high"], ["วิกฤต ≥", c, setC, "critical"]] as const).map(([label, val, set, k]) => (
          <label key={k} className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span style={{ color: RISK_META[k].hex }} className="font-semibold">{label} (ม.รทก.)</span>
            <input type="number" step="0.01" value={val} onChange={(e) => set(e.target.value)} className="w-32 rounded-lg border border-slate-300 p-2 text-right" />
          </label>
        ))}
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> ผ่านการตรวจสอบ/รับรองแล้ว</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ/แหล่งอ้างอิงเกณฑ์" className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={save} className="flex-1 rounded-xl bg-sky-700 py-2.5 font-semibold text-white">บันทึก</button>
          {s.override && <button onClick={async () => { await api(`/api/admin/thresholds/${s.id}`, { method: "DELETE", admin: token }); onDone("กลับไปใช้เกณฑ์เริ่มต้นแล้ว"); }} className="rounded-xl bg-slate-200 px-3 text-sm">รีเซ็ต</button>}
          <button onClick={onClose} className="rounded-xl bg-slate-100 px-3 text-sm">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function CenterForm({ token, onDone }: { token: string; onDone: (m: string) => void }) {
  const [state, setState] = useState<"closed" | "standby" | "open">("closed");
  const [text, setText] = useState("ยังไม่เปิดศูนย์ช่วยเหลืออย่างเป็นทางการในจังหวัดยะลา");
  const [detail, setDetail] = useState("");
  const [phone, setPhone] = useState("1784");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    api<{ status: { state: string; text: string } | null }>("/api/center-status").then((r) => setCurrent(r.status ? `${r.status.state}: ${r.status.text}` : null)).catch(() => {});
  }, [busy]);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api("/api/admin/center-status", { method: "PUT", admin: token, body: JSON.stringify({ state, text, detail: detail || null, phone: phone || null }) });
      onDone("บันทึกสถานะศูนย์ช่วยเหลือแล้ว");
    } catch (e: any) { onDone("ไม่สำเร็จ: " + e.message); } finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await api("/api/admin/center-status", { method: "DELETE", admin: token }); onDone("ซ่อนสถานะศูนย์ช่วยเหลือแล้ว"); }
    catch (e: any) { onDone("ไม่สำเร็จ: " + e.message); } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">สถานะศูนย์ช่วยเหลือ (แสดงบนหน้าแรก)</h2>
      <p className="text-xs text-slate-500">ถ้าไม่ตั้งค่า หน้าแรกจะไม่แสดงอะไรเลย — ตั้งเฉพาะข้อมูลที่หน่วยงานยืนยันแล้ว {current && <b className="text-slate-700">· ตอนนี้: {current}</b>}</p>
      <select value={state} onChange={(e) => setState(e.target.value as any)} className="mt-2 w-full rounded-xl border border-slate-300 p-2.5">
        <option value="closed">ยังไม่เปิดศูนย์</option><option value="standby">เตรียมพร้อมเปิดศูนย์</option><option value="open">เปิดศูนย์แล้ว</option>
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="ข้อความหลัก" className="mt-2 w-full rounded-xl border border-slate-300 p-2.5" />
      <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} rows={2} placeholder="รายละเอียด (ไม่บังคับ) เช่น สถานที่ เวลา" className="mt-2 w-full rounded-xl border border-slate-300 p-2.5" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="เบอร์โทร (ไม่บังคับ)" className="mt-2 w-full rounded-xl border border-slate-300 p-2.5" />
      <div className="mt-3 flex gap-2">
        <button disabled={busy} onClick={save} className="rounded-xl bg-sky-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">บันทึก</button>
        <button disabled={busy} onClick={clear} className="rounded-xl bg-slate-200 px-5 py-2.5 font-semibold disabled:opacity-50">ซ่อนป้าย</button>
      </div>
    </section>
  );
}

function HelpPointsForm({ token, onDone }: { token: string; onDone: (m: string) => void }) {
  const [list, setList] = useState<(HelpPoint & { active: boolean })[]>([]);
  const [kind, setKind] = useState<HelpPoint["kind"]>("shelter");
  const [name, setName] = useState("");
  const [amphoe, setAmphoe] = useState("");
  const [tumbon, setTumbon] = useState("");
  const [coord, setCoord] = useState(""); // วางจาก Google Maps: "6.5400, 101.2800"
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ points: (HelpPoint & { active: boolean })[] }>("/api/admin/help-points", { admin: token }).then((r) => setList(r.points)).catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  const add = async () => {
    const m = coord.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!name.trim() || !m) return onDone("กรอกชื่อและพิกัด (วางจาก Google Maps เช่น 6.5400, 101.2800)");
    setBusy(true);
    try {
      await api("/api/admin/help-points", { method: "POST", admin: token, body: JSON.stringify({ kind, name, amphoe: amphoe || null, tumbon: tumbon || null, lat: Number(m[1]), lon: Number(m[2]), phone: phone || null, detail: detail || null }) });
      setName(""); setCoord(""); setPhone(""); setDetail(""); setTumbon("");
      onDone("เพิ่มจุดช่วยเหลือแล้ว"); load();
    } catch (e: any) { onDone("ไม่สำเร็จ: " + e.message); } finally { setBusy(false); }
  };
  const del = async (id: number) => {
    if (!confirm("ลบจุดช่วยเหลือนี้?")) return;
    await api(`/api/admin/help-points/${id}`, { method: "DELETE", admin: token }).catch(() => {});
    onDone("ลบแล้ว"); load();
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">จุดช่วยเหลือ (ศูนย์พักพิง / จุดแพทย์ / จุดแจกของ)</h2>
      <p className="text-xs text-slate-500">ระบบไม่มีข้อมูลตั้งต้น — เพิ่มเฉพาะจุดที่หน่วยงานยืนยันแล้ว และลบเมื่อปิดให้บริการ</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as HelpPoint["kind"])} className="col-span-2 rounded-xl border border-slate-300 p-2.5">
          {Object.entries(HELP_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="ชื่อสถานที่" className="col-span-2 rounded-xl border border-slate-300 p-2.5" />
        <input value={amphoe} onChange={(e) => setAmphoe(e.target.value)} placeholder="อำเภอ" className="rounded-xl border border-slate-300 p-2.5" />
        <input value={tumbon} onChange={(e) => setTumbon(e.target.value)} placeholder="ตำบล" className="rounded-xl border border-slate-300 p-2.5" />
        <input value={coord} onChange={(e) => setCoord(e.target.value)} placeholder="พิกัด เช่น 6.5400, 101.2800" className="col-span-2 rounded-xl border border-slate-300 p-2.5" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="เบอร์โทร" className="col-span-2 rounded-xl border border-slate-300 p-2.5" />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} rows={2} placeholder="รายละเอียด เช่น รับได้กี่คน เวลาเปิด" className="col-span-2 rounded-xl border border-slate-300 p-2.5" />
      </div>
      <button disabled={busy} onClick={add} className="mt-3 rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">เพิ่มจุดช่วยเหลือ</button>
      {list.map((p) => (
        <div key={p.id} className="mt-2 flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="min-w-0"><b>{p.name}</b> <span className="text-xs text-slate-500">({HELP_KIND[p.kind].label}{p.phone && ` · ${p.phone}`})</span></div>
          <button className="shrink-0 rounded-lg bg-red-100 px-3 py-1 text-red-800" onClick={() => del(p.id)}>ลบ</button>
        </div>
      ))}
    </section>
  );
}
