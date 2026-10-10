import { distanceKm, RISK_ORDER } from "./format";
import type { RainLevel, RainStation, Risk, WaterStation } from "./types";

/** พื้นที่ที่ผู้ใช้บันทึกไว้ — เก็บในเครื่อง (localStorage) เท่านั้น ไม่ส่งไปเซิร์ฟเวอร์ */
export interface Place {
  id: string;
  label: string;
  amphoe?: string;
  tumbon?: string;
  /** พิกัดปัดเป็น ~1 กม. เพื่อความเป็นส่วนตัว */
  lat?: number;
  lon?: number;
}

const KEY = "yala-places";
export const MAX_PLACES = 5;
const NEAR_KM = 10;

export const loadPlaces = (): Place[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, MAX_PLACES) : [];
  } catch {
    return [];
  }
};
export const savePlaces = (p: Place[]) => localStorage.setItem(KEY, JSON.stringify(p.slice(0, MAX_PLACES)));

// แหล่งข้อมูลสะกดชื่อตำบลไม่ตรงกันบางแห่ง
const norm = (s: string | null | undefined) => (s ?? "").replace("สะเต็ง", "สะเตง").trim();

export interface Option { amphoe: string; tumbons: string[] }

/** รายการอำเภอ/ตำบลที่มีสถานีวัดอยู่จริง */
export function areaOptions(water: WaterStation[], rain: RainStation[]): Option[] {
  const m = new Map<string, Set<string>>();
  for (const s of [...water, ...rain]) {
    const a = norm(s.amphoe);
    if (!a) continue;
    if (!m.has(a)) m.set(a, new Set());
    const t = norm(s.tumbon);
    if (t) m.get(a)!.add(t);
  }
  return [...m.entries()]
    .map(([amphoe, t]) => ({ amphoe, tumbons: [...t].sort((x, y) => x.localeCompare(y, "th")) }))
    .sort((x, y) => x.amphoe.localeCompare(y.amphoe, "th"));
}

export interface Assessment {
  verdict: Risk;
  headline: string;
  note: string | null;
  water: { s: WaterStation; km: number | null }[];
  rain: { s: RainStation; km: number | null }[];
  rainLevel: RainLevel;
  rain24: number | null;
}

/**
 * ประเมินภาพรวมของพื้นที่จากสถานีรอบๆ ข้อมูลล่าช้า "ไม่เคย" ถูกนับเป็นปกติ
 * และผลนี้ไม่ใช่การยืนยันว่าบ้านของผู้ใช้ท่วมหรือไม่
 */
export function assess(place: Place, water: WaterStation[], rain: RainStation[]): Assessment {
  const me: [number, number] | null = place.lat != null && place.lon != null ? [place.lat, place.lon] : null;
  const km = (s: { lat: number | null; lon: number | null }) => (me && s.lat != null && s.lon != null ? distanceKm(me, [s.lat, s.lon]) : null);

  let w: WaterStation[] = [];
  let r: RainStation[] = [];
  let note: string | null = null;

  if (me) {
    const byDist = <T extends { lat: number | null; lon: number | null }>(xs: T[]) =>
      xs.filter((x) => km(x) != null).sort((a, b) => km(a)! - km(b)!);
    w = byDist(water).filter((s) => km(s)! <= NEAR_KM);
    r = byDist(rain).filter((s) => km(s)! <= NEAR_KM);
    if (!w.length) { w = byDist(water).slice(0, 3); note = `ไม่มีสถานีวัดน้ำในรัศมี ${NEAR_KM} กม. แสดง 3 สถานีที่ใกล้ที่สุดแทน`; }
    if (!r.length) r = byDist(rain).slice(0, 3);
  } else {
    const a = norm(place.amphoe);
    const t = norm(place.tumbon);
    const inA = <T extends { amphoe: string | null }>(xs: T[]) => xs.filter((x) => norm(x.amphoe) === a);
    if (t) {
      w = inA(water).filter((s) => norm(s.tumbon) === t);
      r = inA(rain).filter((s) => norm(s.tumbon) === t);
    }
    if (!w.length) {
      w = inA(water);
      if (t) note = `ไม่มีสถานีวัดน้ำใน ต.${t} ใช้ข้อมูลสถานีใน อ.${a} แทน`;
    }
    if (!r.length) r = inA(rain);
  }

  // ผลรวมของระดับน้ำ: เอาสถานีที่เสี่ยงที่สุด; ปกติได้ก็ต่อเมื่อไม่มีสถานีล่าช้าปนอยู่
  const measured = w.filter((s) => s.risk !== "unknown");
  let verdict: Risk;
  if (!w.length || !measured.length) verdict = "unknown";
  else {
    const worst = measured.reduce((p, c) => (RISK_ORDER[c.risk] > RISK_ORDER[p.risk] ? c : p));
    verdict = worst.risk;
  }

  const worstRain = r.filter((x) => x.rain_level !== "stale" && x.rain_level !== "unknown")
    .reduce<RainStation | null>((p, c) => (!p || (c.rain_24h ?? 0) > (p.rain_24h ?? 0) ? c : p), null);
  const rainLevel: RainLevel = worstRain?.rain_level ?? ("unknown");
  const rain24 = worstRain?.rain_24h ?? null;

  const headline =
    verdict === "critical" ? "มีสถานีในพื้นที่ถึงระดับวิกฤต" :
    verdict === "high" ? "มีสถานีในพื้นที่เสี่ยงสูง" :
    verdict === "watch" ? "มีสถานีในพื้นที่ที่ต้องเฝ้าระวัง" :
    verdict === "stale" ? "ข้อมูลสถานีในพื้นที่ล่าช้า — ยังสรุปไม่ได้ว่าปลอดภัย" :
    verdict === "normal" ? "สถานีวัดน้ำในพื้นที่ยังอยู่ในเกณฑ์ปกติ" :
    "ยังประเมินพื้นที่นี้ไม่ได้ (ไม่มีข้อมูลหรือไม่มีเกณฑ์)";

  const order = (a: WaterStation, b: WaterStation) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || (km(a) ?? 0) - (km(b) ?? 0);
  return {
    verdict, headline, note,
    water: [...w].sort(order).slice(0, 4).map((s) => ({ s, km: km(s) })),
    rain: r.slice(0, 3).map((s) => ({ s, km: km(s) })),
    rainLevel, rain24,
  };
}

/** ปัดพิกัดเป็น ~1 กม. (ทศนิยม 2 ตำแหน่ง) */
export const coarse = (v: number) => Math.round(v * 100) / 100;
