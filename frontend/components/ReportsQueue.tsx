"use client";
import { Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import type { CitizenReport } from "@/lib/types";

type St = "pending" | "approved" | "rejected";
const LABEL: Record<St, string> = { pending: "รอตรวจ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ" };

/** คิวตรวจรายงานจากประชาชน — ต้องอนุมัติก่อนจึงแสดงสาธารณะ (รูปโหลดด้วยสิทธิ์แอดมินเท่านั้น) */
export default function ReportsQueue({ token, onDone }: { token: string; onDone: (m: string) => void }) {
  const [st, setSt] = useState<St>("pending");
  const [rows, setRows] = useState<CitizenReport[]>([]);
  const [pics, setPics] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    api<{ reports: CitizenReport[] }>(`/api/admin/reports?status=${st}`, { admin: token }).then((r) => setRows(r.reports)).catch(() => setRows([]));
  }, [token, st]);
  useEffect(load, [load]);

  useEffect(() => {
    let dead = false;
    const urls: string[] = [];
    (async () => {
      for (const r of rows) {
        if (!r.has_photo || pics[r.id]) continue;
        try {
          const res = await fetch(`/api/admin/reports/${r.id}/photo`, { headers: { "X-Admin-Token": token } });
          if (!res.ok) continue;
          const u = URL.createObjectURL(await res.blob());
          urls.push(u);
          if (!dead) setPics((p) => ({ ...p, [r.id]: u }));
        } catch {}
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, token]);

  const review = async (id: number, action: "approve" | "reject") => {
    try { await api(`/api/admin/reports/${id}/review`, { method: "POST", admin: token, body: JSON.stringify({ action }) }); onDone(action === "approve" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"); load(); }
    catch (e: any) { onDone("ไม่สำเร็จ: " + e.message); }
  };
  const del = async (id: number) => {
    if (!confirm("ลบรายงานนี้ถาวร?")) return;
    await api(`/api/admin/reports/${id}`, { method: "DELETE", admin: token }).catch(() => {});
    onDone("ลบแล้ว"); load();
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">รายงานจากประชาชน</h2>
      <p className="text-xs text-slate-500">ตรวจรูป/ข้อความก่อนอนุมัติ: ไม่มีใบหน้า ป้ายทะเบียน ข้อมูลส่วนตัว หรือโฆษณา · อนุมัติแล้วแสดง 12 ชม. · ไม่กระทบระดับเตือน/แจ้งเตือนอัตโนมัติ</p>
      <div className="mt-2 flex gap-1.5">
        {(Object.keys(LABEL) as St[]).map((k) => (
          <button key={k} onClick={() => setSt(k)} className={`rounded-full px-3 py-1 text-sm ${st === k ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{LABEL[k]}</button>
        ))}
      </div>
      {rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">ไม่มีรายการ</p> : (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <div className="text-sm"><b>{r.depth_label}</b> · {fmtTime(r.created_at)} · <a className="text-sky-800 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lon}`}>{r.lat}, {r.lon}</a></div>
              {r.note && <p className="mt-0.5 text-sm text-slate-700">{r.note}</p>}
              {r.has_photo && (pics[r.id] ? <img src={pics[r.id]} alt="รูปที่ส่งมา" className="mt-2 max-h-56 rounded-xl" /> : <div className="mt-2 h-24 animate-pulse rounded-xl bg-slate-100" />)}
              <div className="mt-2 flex gap-2">
                {st !== "approved" && <button onClick={() => review(r.id, "approve")} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"><Check size={15} /> อนุมัติ</button>}
                {st === "pending" && <button onClick={() => review(r.id, "reject")} className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-1.5 text-sm font-semibold"><X size={15} /> ปฏิเสธ</button>}
                <button onClick={() => del(r.id)} className="ml-auto inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm text-red-700"><Trash2 size={15} /> ลบ</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
