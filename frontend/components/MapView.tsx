"use client";
import { useEffect, useRef, useState } from "react";
import { CloudRain, LifeBuoy, Megaphone, Pause, Play, Radar } from "lucide-react";
import L from "leaflet";
import { RISK_META, num } from "@/lib/format";
import { HELP_KIND, type CitizenReport, type HelpPoint, type RainStation, type WaterStation } from "@/lib/types";

const DROP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';

const YALA: [number, number] = [6.54, 101.28];
// lucide "cloud-rain" glyph
const RAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>';

interface Frame { time: number; path: string }
const RADAR_API = "https://api.rainviewer.com/public/weather-maps.json";
const hm = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });

export default function MapView({
  water, rain, help = [], reports = [], me, onSelect,
}: { water: WaterStation[]; rain: RainStation[]; help?: HelpPoint[]; reports?: CitizenReport[]; me: [number, number] | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [showRain, setShowRain] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [showReports, setShowReports] = useState(true);

  // ---- เรดาร์ฝน (RainViewer) — ปิดไว้เป็นค่าเริ่มต้น; เปิดแล้วเบราว์เซอร์จะเรียกบริการภายนอกโดยตรง
  const [showRadar, setShowRadar] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [host, setHost] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [radarErr, setRadarErr] = useState(false);
  const radar = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!showRadar) return;
    let dead = false;
    const load = () =>
      fetch(RADAR_API).then((r) => r.json()).then((d) => {
        if (dead) return;
        const past: Frame[] = (d.radar?.past ?? []).slice(-8);
        if (!past.length) throw new Error("no frames");
        setHost(d.host); setFrames(past); setIdx(past.length - 1); setRadarErr(false);
      }).catch(() => !dead && setRadarErr(true));
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { dead = true; clearInterval(t); };
  }, [showRadar]);

  useEffect(() => {
    if (!showRadar || !playing || frames.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), 800);
    return () => clearInterval(t);
  }, [showRadar, playing, frames.length]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!showRadar || !frames.length) {
      if (radar.current) { m.removeLayer(radar.current); radar.current = null; }
      return;
    }
    const url = `${host}${frames[idx].path}/256/{z}/{x}/{y}/6/1_1.png`;
    if (!radar.current) {
      // ภาพเรดาร์ฟรีมีความละเอียดสูงสุดที่ซูม 7 — ซูมมากกว่านั้นจะขยายภาพ
      radar.current = L.tileLayer(url, { opacity: 0.6, maxNativeZoom: 7, maxZoom: 18, zIndex: 300, attribution: '<a href="https://www.rainviewer.com">RainViewer</a>' }).addTo(m);
    } else radar.current.setUrl(url);
  }, [showRadar, frames, host, idx]);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView(YALA, 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g || !map.current) return;
    g.clearLayers();
    const pts: [number, number][] = [];
    for (const s of water) {
      if (s.lat == null || s.lon == null) continue;
      const m = RISK_META[s.risk];
      pts.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], {
        zIndexOffset: 1000 + (s.risk === "critical" ? 500 : s.risk === "high" ? 300 : s.risk === "watch" ? 100 : 0),
        icon: L.divIcon({
          className: "",
          html: `<div style="width:30px;height:30px;border-radius:9999px;background:${m.hex};display:grid;place-items:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">${DROP_SVG}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }),
      })
        .bindTooltip(`${s.name}<br/>${m.label} · ${num(s.level_msl)} ม.`)
        .on("click", () => onSelect(s.id))
        .addTo(g);
    }
    for (const s of showRain ? rain : []) {
      if (s.lat == null || s.lon == null) continue;
      if (s.rain_level === "stale" || s.rain_level === "unknown") continue; // outdated rain must not clutter or mislead
      const heavy = s.rain_level === "very_heavy" || s.rain_level === "heavy";
      L.marker([s.lat, s.lon], {
        zIndexOffset: heavy ? 200 : 0,
        icon: L.divIcon({ className: "", html: `<div style="width:24px;height:24px;border-radius:9999px;background:${heavy ? "#f97316" : "#0ea5e9"};opacity:${heavy ? 1 : 0.8};display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${RAIN_SVG}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      })
        .bindTooltip(`${s.name}<br/>ฝน 24 ชม. ${s.rain_24h ?? "-"} มม.`)
        .addTo(g);
    }
    for (const h of showHelp ? help : []) {
      const k = HELP_KIND[h.kind];
      L.marker([h.lat, h.lon], {
        zIndexOffset: 700,
        icon: L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:8px;background:${k.color};display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);color:#fff;font-weight:800;font-size:15px;line-height:1">+</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      })
        .bindTooltip(`${h.name}<br/>${k.label}${h.phone ? " · " + h.phone : ""}`)
        .addTo(g);
    }
    for (const r of showReports ? reports : []) {
      L.marker([r.lat, r.lon], {
        zIndexOffset: 600,
        icon: L.divIcon({ className: "", html: `<div style="width:24px;height:24px;border-radius:6px;transform:rotate(45deg);background:#f97316;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);display:grid;place-items:center"><span style="transform:rotate(-45deg);color:#fff;font-weight:800;font-size:13px;line-height:1">!</span></div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      })
        .bindTooltip(`รายงานจากประชาชน (ไม่ใช่ข้อมูลทางการ)<br/>น้ำท่วม${r.depth_label}${r.note ? "<br/>" + r.note.replace(/[<>&]/g, "") : ""}`)
        .addTo(g);
    }
    if (me) L.circleMarker(me, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("ตำแหน่งของคุณ").addTo(g);
    if (pts.length && !(map.current as any)._fitted) {
      map.current.fitBounds(L.latLngBounds(pts).pad(0.25));
      (map.current as any)._fitted = true;
    }
  }, [water, rain, help, reports, me, onSelect, showRain, showHelp, showReports]);

  useEffect(() => {
    if (me && map.current) map.current.setView(me, 12);
  }, [me]);

  return (
    <div className="relative">
      <div ref={el} className="h-[calc(100dvh-230px)] min-h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200" />
      <button
        onClick={() => setShowRain((v) => !v)}
        className={`absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow ${showRain ? "bg-sky-700 text-white" : "bg-white text-slate-700"}`}
      >
        <CloudRain size={16} /> ฝน
      </button>
      {help.length > 0 && (
        <button
          onClick={() => setShowHelp((v) => !v)}
          className={`absolute right-3 top-[6.5rem] z-[500] inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow ${showHelp ? "bg-emerald-700 text-white" : "bg-white text-slate-700"}`}
        >
          <LifeBuoy size={16} /> จุดช่วยเหลือ
        </button>
      )}
      {reports.length > 0 && (
        <button
          onClick={() => setShowReports((v) => !v)}
          className={`absolute right-3 top-[9.5rem] z-[500] inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow ${showReports ? "bg-orange-600 text-white" : "bg-white text-slate-700"}`}
        >
          <Megaphone size={16} /> รายงาน
        </button>
      )}
      <button
        onClick={() => setShowRadar((v) => !v)}
        className={`absolute right-3 top-14 z-[500] inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow ${showRadar ? "bg-sky-700 text-white" : "bg-white text-slate-700"}`}
      >
        <Radar size={16} /> เรดาร์
      </button>
      {showRadar && (
        <div className="absolute inset-x-3 bottom-3 z-[500] rounded-xl bg-white/95 p-2 text-xs shadow">
          {radarErr ? (
            <span className="text-red-700">โหลดภาพเรดาร์ไม่สำเร็จ ลองใหม่ภายหลัง</span>
          ) : frames.length === 0 ? (
            <span className="text-slate-600">กำลังโหลดภาพเรดาร์…</span>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setPlaying((v) => !v)} aria-label={playing ? "หยุด" : "เล่น"} className="grid h-8 w-8 place-items-center rounded-full bg-sky-700 text-white">
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <input type="range" min={0} max={frames.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="min-w-0 flex-1" />
                <b className="shrink-0 tabular-nums">{hm.format(new Date(frames[idx].time * 1000))} น.</b>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">
                ภาพเรดาร์ย้อนหลังประมาณ {Math.round((frames[frames.length - 1].time - frames[0].time) / 60)} นาที จาก RainViewer (รวมหลายแหล่ง ความละเอียดต่ำ ไม่ใช่เรดาร์ทางการ) · สีเข้มขึ้น = ฝนแรงขึ้น
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
