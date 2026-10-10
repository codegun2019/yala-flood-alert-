"use client";
import { useEffect, useRef, useState } from "react";
import { CloudRain } from "lucide-react";
import L from "leaflet";
import { RISK_META, num } from "@/lib/format";
import type { RainStation, WaterStation } from "@/lib/types";

const DROP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';

const YALA: [number, number] = [6.54, 101.28];
// lucide "cloud-rain" glyph
const RAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>';

export default function MapView({
  water, rain, me, onSelect,
}: { water: WaterStation[]; rain: RainStation[]; me: [number, number] | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [showRain, setShowRain] = useState(true);

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
    if (me) L.circleMarker(me, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("ตำแหน่งของคุณ").addTo(g);
    if (pts.length && !(map.current as any)._fitted) {
      map.current.fitBounds(L.latLngBounds(pts).pad(0.25));
      (map.current as any)._fitted = true;
    }
  }, [water, rain, me, onSelect, showRain]);

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
    </div>
  );
}
