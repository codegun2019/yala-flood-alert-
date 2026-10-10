"use client";
import dynamic from "next/dynamic";
import { BellRing, Code2, Eye, Building2, Maximize2, Play, Cctv, CloudRain, Droplets, ExternalLink, FlaskConical, LocateFixed, MapPinned, Megaphone, Phone, RefreshCw, Share2, ShieldAlert, TriangleAlert, Waves, WifiOff, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtAge, fmtHM, fmtTime, num, RISK_META, RISK_ORDER } from "@/lib/format";
import { currentSubscription, loadPrefs, type Prefs, registerSW, updatePrefs } from "@/lib/push";
import type { Announcement, CctvInfo, CenterStatus, CitizenReport, HelpPoint, RainStation, SourceHealth, WaterStation } from "@/lib/types";
import { RiskBadge, Trend } from "@/components/Badges";
import NotifyPanel from "@/components/NotifyPanel";
import RainPanel from "@/components/RainPanel";
import InstallCard from "@/components/InstallCard";
import StationSheet from "@/components/StationSheet";
import { playAlert, soundEnabled, unlockAudio } from "@/lib/sound";

import HelpList from "@/components/HelpList";
import ResourcesCard from "@/components/ResourcesCard";
import ReportList from "@/components/ReportList";
import ReportForm from "@/components/ReportForm";
import ForecastCard from "@/components/ForecastCard";
import CenterNotice from "@/components/CenterNotice";
import MyArea from "@/components/MyArea";
import DeveloperPanel from "@/components/DeveloperPanel";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-slate-200" /> });

type Tab = "status" | "map" | "rain" | "cctv" | "notify" | "dev";
const TABS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "status", icon: Waves, label: "สถานการณ์" },
  { id: "map", icon: MapPinned, label: "แผนที่" },
  { id: "rain", icon: CloudRain, label: "ฝน" },
  { id: "cctv", icon: Cctv, label: "CCTV" },
  { id: "notify", icon: BellRing, label: "แจ้งเตือน" },
  { id: "dev", icon: Code2, label: "ผู้พัฒนา" },
];

const SHARE_TEXT = `เทศบาลนครยะลา ให้ประชาชนติดตามสถานการณ์น้ำยะลาได้ตลอด 24 ชั่วโมง ตรวจสอบปริมาณน้ำ ปริมาณน้ำฝน และระดับน้ำผ่านกล้อง CCTV

ข้อมูลระดับน้ำและปริมาณน้ำฝน: https://is.gd/mPwwP8
กล้องวงจรปิด (CCTV): https://yala-cctv.localth.ai/

ขอบคุณข้อมูลและระบบติดตามสถานการณ์ โดย เทศบาลนครยะลา Yalacity`;

const SEV_CLS = { info: "bg-blue-50 border-blue-300 text-blue-950", watch: "bg-yellow-50 border-yellow-400 text-yellow-950", high: "bg-orange-50 border-orange-400 text-orange-950", critical: "bg-red-50 border-red-500 text-red-950" };

export default function Home() {
  const [tab, setTab] = useState<Tab>("status");
  const [water, setWater] = useState<WaterStation[]>([]);
  const [rain, setRain] = useState<RainStation[]>([]);
  const [health, setHealth] = useState<SourceHealth[]>([]);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [cctv, setCctv] = useState<CctvInfo | null>(null);
  const [help, setHelp] = useState<HelpPoint[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [reporting, setReporting] = useState(false);
  const [center, setCenter] = useState<CenterStatus | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [netErr, setNetErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ stations: [], min_level: "watch", notify_rain: true });

  const refresh = useCallback(async () => {
    try {
      const [w, r, a] = await Promise.all([
        api<{ now: string; stations: WaterStation[]; source_health: SourceHealth[] }>("/api/water/latest"),
        api<{ stations: RainStation[] }>("/api/rainfall/latest"),
        api<{ announcements: Announcement[] }>("/api/announcements"),
      ]);
      setWater(w.stations);
      setRain(r.stations);
      setHealth(w.source_health);
      setAnns(a.announcements);
      api<{ points: HelpPoint[] }>("/api/help-points").then((h) => setHelp(h.points)).catch(() => {});
      api<{ reports: CitizenReport[] }>("/api/reports").then((r) => setReports(r.reports)).catch(() => {});
      api<{ status: CenterStatus | null }>("/api/center-status").then((c) => setCenter(c.status)).catch(() => {});
      setFetchedAt(w.now);
      setNetErr(false);
    } catch {
      setNetErr(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  const [toast, setToast] = useState<{ title: string; body: string; severity: string } | null>(null);

  // tab shortcut (?tab=map) from the home-screen icon long-press menu / notification tap
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as Tab);
  }, []);

  // unlock audio on first tap; play in-app alert when a push arrives while the app is open
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type !== "push-alert") return;
      if (soundEnabled()) playAlert(ev.data.severity);
      setToast({ title: ev.data.title, body: ev.data.body, severity: ev.data.severity });
      setTimeout(() => setToast(null), 12000);
      refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [refresh]);

  useEffect(() => {
    setPrefs(loadPrefs());
    registerSW().catch(() => {});
    api<CctvInfo>("/api/cctv").then(setCctv).catch(() => {});
    refresh();
    const t = setInterval(refresh, 60_000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const sorted = useMemo(
    () => [...water].sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || a.name.localeCompare(b.name, "th")),
    [water]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    water.forEach((s) => (c[s.risk] = (c[s.risk] || 0) + 1));
    return c;
  }, [water]);
  const [showAll, setShowAll] = useState(false);
  // สถานีที่ต้องจับตา: เสี่ยง/ข้อมูลล่าช้า/น้ำขึ้นเร็ว หรือกำลังขึ้นและเหลือไม่ถึง 5 ม. ก่อนวิกฤต
  const attention = useMemo(
    () => sorted.filter((s) => ["critical", "high", "watch", "stale"].includes(s.risk) || s.rapid_rise ||
      (s.trend === "rising" && s.margin_to_critical != null && s.margin_to_critical < 5)),
    [sorted]
  );
  const watchList = useMemo(() => {
    if (attention.length) return attention.slice(0, 6);
    return sorted.filter((s) => s.margin_to_critical != null).sort((a, b) => a.margin_to_critical! - b.margin_to_critical!).slice(0, 3);
  }, [attention, sorted]);
  const sel = water.find((s) => s.id === selected) ?? null;
  const heavyRain = rain.filter((r) => r.rain_level === "heavy" || r.rain_level === "very_heavy");
  const unhealthy = health.length === 0 ? loaded && !netErr : health.some((h) => !h.ok);
  const simulated = water.some((s) => s.simulated) || rain.some((s) => s.simulated);

  const locate = () => {
    setGeoMsg("กำลังค้นหาตำแหน่ง…");
    if (!navigator.geolocation) return setGeoMsg("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMe([p.coords.latitude, p.coords.longitude]);
        setGeoMsg(null);
      },
      () => setGeoMsg("ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const [shared, setShared] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `${SHARE_TEXT}\n\nติดตามบนมือถือ + รับแจ้งเตือน: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "YALA FLOOD ALERT", text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {}
  };

  const toggleFollow = async (id: string) => {
    const stations = prefs.stations.includes(id) ? prefs.stations.filter((x) => x !== id) : [...prefs.stations, id];
    const next = { ...prefs, stations };
    setPrefs(next);
    localStorage.setItem("yala-prefs", JSON.stringify(next));
    if (await currentSubscription().catch(() => null)) updatePrefs(next).catch(() => {});
    else if (stations.includes(id)) {
      setSelected(null);
      setTab("notify");
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-24">
      <header className="sticky top-0 z-30 overflow-hidden rounded-b-[28px] bg-gradient-to-br from-sky-900 via-sky-700 to-cyan-500 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white shadow-lg shadow-sky-900/25">
        {/* ลายน้ำกระเซ็น (splash) ตกแต่งส่วนหัว */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 100" preserveAspectRatio="xMaxYMin slice" fill="none">
          <g transform="translate(-60 0)">
          <g stroke="white" strokeOpacity="0.22" strokeWidth="1.5">
            <ellipse cx="338" cy="30" rx="26" ry="9" />
            <ellipse cx="338" cy="30" rx="48" ry="17" strokeOpacity="0.15" />
            <ellipse cx="338" cy="30" rx="72" ry="26" strokeOpacity="0.09" />
          </g>
          <g fill="white" fillOpacity="0.2">
            <path d="M338 2c5 8 9 13 9 18a9 9 0 1 1-18 0c0-5 4-10 9-18z" />
            <circle cx="300" cy="14" r="3.5" />
            <circle cx="372" cy="12" r="2.5" />
            <circle cx="358" cy="54" r="3" fillOpacity="0.14" />
            <circle cx="312" cy="58" r="2" fillOpacity="0.14" />
          </g>
          </g>
          <path d="M0 92c40-10 80 8 120 0s80-10 120 0 80 8 120 0 30-4 40-2v10H0z" fill="white" fillOpacity="0.1" />
        </svg>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30"><Droplets size={24} strokeWidth={2.2} /></span>
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-wide">YALA FLOOD ALERT</h1>
              <p className="text-xs opacity-90">เฝ้าระวังน้ำท่วมจังหวัดยะลา 24 ชั่วโมง</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={share} aria-label="แชร์" className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><Share2 size={18} /></button>
            <button onClick={refresh} aria-label="รีเฟรช" className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><RefreshCw size={18} /></button>
          </div>
        </div>
        <p className="relative mt-1 text-xs opacity-90">
          ข้อมูลอัปเดตล่าสุด: {fmtHM(fetchedAt)} {health[0]?.last_success_at && `· ดึงจากต้นทางเมื่อ ${fmtAge(health[0].age_minutes)}`}
        </p>
      </header>

      <main className="space-y-3 px-3 pt-3">
        <InstallCard />
        {shared && <Banner tone="amber"><span>คัดลอกข้อความสำหรับแชร์แล้ว</span></Banner>}
        {netErr && (
          <Banner tone="red" icon={WifiOff}>
            เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน {fetchedAt && `(ล่าสุด ${fmtHM(fetchedAt)})`}
          </Banner>
        )}
        {!netErr && unhealthy && (
          <Banner tone="amber" icon={TriangleAlert}>ระบบดึงข้อมูลจากแหล่งต้นทางไม่สำเร็จหรือล่าช้า สถานะที่แสดงอาจไม่ใช่ปัจจุบัน — อย่าตีความว่าปลอดภัย</Banner>
        )}
        {simulated && <Banner tone="purple" icon={FlaskConical}>ระบบกำลังใช้ข้อมูลจำลองเพื่อทดสอบ — ไม่ใช่สถานการณ์จริง</Banner>}

        {anns.map((a) => (
          <div key={a.id} className={`rounded-2xl border-2 p-3 ${SEV_CLS[a.severity]}`}>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide"><Megaphone size={14} /> ประกาศอย่างเป็นทางการจากศูนย์เฝ้าระวัง · {fmtTime(a.created_at)}</div>
            <div className="mt-0.5 font-bold">{a.title}</div>
            <p className="whitespace-pre-line text-sm">{a.body}</p>
          </div>
        ))}

        {tab === "status" && (
          <>
            <section className="grid grid-cols-4 gap-2 text-center">
              {(["critical", "high", "watch", "normal"] as const).map((r) => (
                <div key={r} className={`rounded-2xl p-2 ${RISK_META[r].bg} ${RISK_META[r].color}`}>
                  <div className="text-2xl font-extrabold tabular-nums">{counts[r] || 0}</div>
                  <div className="text-xs font-semibold">{RISK_META[r].label}</div>
                </div>
              ))}
            </section>
            {(counts.stale || counts.unknown) && (
              <p className="px-1 text-xs text-slate-600">
                ยังมี {counts.stale ? `${counts.stale} สถานีข้อมูลล่าช้า` : ""}{counts.stale && counts.unknown ? " และ " : ""}{counts.unknown ? `${counts.unknown} สถานีที่ยังประเมินความเสี่ยงไม่ได้` : ""} (ไม่นับเป็น “ปกติ”)
              </p>
            )}
            {heavyRain.length > 0 && (
              <button onClick={() => setTab("rain")} className="flex w-full items-center gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-3 text-left text-sm text-orange-950">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-200"><CloudRain size={22} /></span>
                <span><b>ฝนตกหนัก {heavyRain.length} สถานี</b> — ฝนสะสม 24 ชม. สูงสุด {num(Math.max(...heavyRain.map((r) => r.rain_24h ?? 0)), 0)} มม. · แตะเพื่อดูรายละเอียด</span>
              </button>
            )}

            <CenterNotice status={center} />
            <MyArea water={water} rain={rain} onSelect={setSelected} />
            <ForecastCard />

            {!loaded && [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />)}
            {loaded && water.length === 0 && !netErr && <p className="rounded-2xl bg-white p-4 text-sm text-slate-600">ยังไม่มีข้อมูลสถานี — ระบบกำลังรอข้อมูลรอบแรกจากแหล่งต้นทาง</p>}

            {loaded && water.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <h2 className="flex items-center gap-1.5 font-bold"><Eye size={18} className="text-sky-700" /> {showAll ? `สถานีทั้งหมด (${sorted.length})` : attention.length ? "สถานีที่ต้องจับตา" : "สถานีที่ใกล้เกณฑ์วิกฤตที่สุด"}</h2>
                  {!showAll && attention.length > 0 && <span className="text-xs text-slate-500">{attention.length} จาก {sorted.length} สถานี</span>}
                </div>
                {!showAll && attention.length === 0 && <p className="px-1 text-xs text-slate-600">ขณะนี้ไม่มีสถานีที่เสี่ยงหรือน้ำกำลังขึ้นใกล้เกณฑ์ — แสดง 3 สถานีที่เหลือระยะถึงวิกฤตน้อยที่สุดแทน</p>}
                {(showAll ? sorted : watchList).map((s) => (
                <button key={s.id} onClick={() => setSelected(s.id)}
                  className={`block w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ${RISK_META[s.risk].ring} ${netErr ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-500">{[s.amphoe && `อ.${s.amphoe}`, s.agency].filter(Boolean).join(" · ")}</div>
                    </div>
                    <RiskBadge risk={s.risk} size="sm" />
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-bold tabular-nums">{num(s.level_msl)}</span>
                      <span className="ml-1 text-xs text-slate-500">ม.รทก.</span>
                    </div>
                    <div className="text-right text-xs">
                      <Trend trend={s.trend} />
                      <div className="text-slate-500">
                        {s.margin_to_critical != null ? (s.margin_to_critical > 0 ? `เหลือ ${num(s.margin_to_critical)} ม. ถึงวิกฤต` : `เกินวิกฤต ${num(-s.margin_to_critical)} ม.`) : "ไม่มีเกณฑ์"}
                      </div>
                    </div>
                  </div>
                  <div className={`mt-1.5 text-xs ${s.risk === "stale" ? "font-semibold text-slate-700" : "text-slate-500"}`}>
                    {s.risk === "stale" || s.risk === "unknown" ? s.reason + " · " : ""}ข้อมูลเวลา {fmtTime(s.observed_at)}{s.simulated && " · จำลอง"}
                  </div>
                  {prefs.stations.includes(s.id) && <div className="mt-1 flex items-center gap-1 text-xs text-sky-700"><BellRing size={12} /> กำลังติดตาม</div>}
                </button>
                ))}
                {sorted.length > watchList.length && (
                  <button onClick={() => setShowAll((v) => !v)} className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-sky-800 shadow-sm ring-1 ring-slate-200">
                    {showAll ? "แสดงเฉพาะสถานีที่ต้องจับตา" : `ดูสถานีทั้งหมด (${sorted.length})`}
                  </button>
                )}
              </section>
            )}
            <ResourcesCard />
          </>
        )}

        {tab === "map" && (
          <>
            <MapView water={water} rain={rain} help={help} reports={reports} me={me} onSelect={setSelected} />
            {geoMsg && <p className="px-1 text-sm text-slate-600">{geoMsg}</p>}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(["normal", "watch", "high", "critical", "stale", "unknown"] as const).map((r) => (
                <span key={r} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded-full ${RISK_META[r].dot}`} />{RISK_META[r].label}</span>
              ))}
              <button onClick={locate} className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-700 px-3 py-1.5 text-white"><LocateFixed size={14} /> ตำแหน่งฉัน</button>
            </div>
            <ReportList reports={reports} onNew={() => setReporting(true)} />
            <HelpList points={help} me={me} />
          </>
        )}

        {tab === "rain" && <RainPanel rain={rain} />}

        {tab === "cctv" && (
          <div className="space-y-3">
            {cctv?.cameras.map((c) => (
              <CctvCard key={c.id} cam={c} />
            ))}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-1.5 font-bold"><Building2 size={18} className="text-sky-700" /> แหล่งข้อมูลต้นทาง</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {cctv?.sources.map((s) => (
                  <li key={s.url}>
                    <a className="flex items-center justify-between gap-2 py-2.5 text-sky-800" href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.name} <ExternalLink size={15} className="shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">ภาพ CCTV ใช้ดูสถานการณ์ประกอบเท่านั้น ไม่สามารถแทนค่าระดับน้ำที่ตรวจวัดได้</p>
            </section>
          </div>
        )}

        {tab === "dev" && <DeveloperPanel />}
        {tab === "notify" && <NotifyPanel water={water} prefs={prefs} setPrefs={(p) => { setPrefs(p); }} />}

        <footer className="space-y-2 px-1 pb-4 pt-2 text-xs leading-relaxed text-slate-500">
          <p>ขอบคุณข้อมูลและระบบติดตามสถานการณ์ โดย <b>เทศบาลนครยะลา (Yalacity)</b> และข้อมูลเสริมจาก ThaiWater (สสน.) · ระดับสถานีคำนวณอัตโนมัติ ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><Phone size={12} /> ฉุกเฉิน:</span>
            <a className="underline" href="tel:1784">ปภ. 1784</a>
            <a className="underline" href="tel:191">ตำรวจ 191</a>
            <a className="underline" href="tel:1669">การแพทย์ 1669</a>
          </p>
          <a className="inline-flex items-center gap-1 underline" href="/admin"><ShieldAlert size={12} /> เจ้าหน้าที่ศูนย์เฝ้าระวัง</a>
        </footer>
      </main>
      {reporting && <ReportForm water={water} rain={rain} onClose={() => { setReporting(false); }} />}

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center py-2 text-[11px] ${tab === t.id ? "font-bold text-sky-700" : "text-slate-500"}`}>
              <t.icon size={22} strokeWidth={tab === t.id ? 2.5 : 2} />
              <span className="mt-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {toast && (
        <div className="pt-safe fixed inset-x-0 top-0 z-[1200] px-3 pt-3" onClick={() => setToast(null)}>
          <div className={`mx-auto max-w-2xl rounded-2xl p-4 shadow-2xl ${toast.severity === "critical" ? "bg-red-600 text-white" : toast.severity === "high" ? "bg-orange-500 text-white" : "bg-slate-900 text-white"}`}>
            <div className="flex items-center gap-2 font-bold"><BellRing size={18} /> {toast.title}</div>
            <p className="mt-1 whitespace-pre-line text-sm opacity-95">{toast.body}</p>
          </div>
        </div>
      )}

      {sel && <StationSheet station={sel} followed={prefs.stations.includes(sel.id)} onToggleFollow={() => toggleFollow(sel.id)} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: "red" | "amber" | "purple"; icon?: LucideIcon; children: React.ReactNode }) {
  const cls = { red: "bg-red-600 text-white", amber: "bg-amber-100 text-amber-950 border border-amber-400", purple: "bg-purple-100 text-purple-900 border border-purple-300" }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm font-semibold ${cls}`}>
      {Icon && <Icon size={18} className="mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

function CctvCard({ cam }: { cam: CctvInfo["cameras"][number] }) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // กันหน้าเว็บเลื่อนซ้อนตอนดูกล้องเต็มจอ
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700"><Cctv size={26} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold">{cam.name}</div>
          <div className="text-sm text-slate-600">{cam.note}</div>
        </div>
      </div>
      {cam.embed && !open && (
        <div className="px-4 pb-4">
          <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 py-3 font-semibold text-white">
            <Play size={18} fill="currentColor" /> ดูกล้องบนหน้านี้
          </button>
        </div>
      )}
      {cam.embed && open && (
        // เต็มหน้าจอ: ระบบกล้องของเทศบาลออกแบบมาให้ใช้เต็มจอ (มีรายการกล้องอยู่ด้านล่าง) ถ้าเป็นกรอบเล็กจะมองไม่เห็นตัวเลือก
        <div className="fixed inset-0 z-[1100] flex h-dvh flex-col bg-slate-900">
          <div className="pt-safe flex items-center gap-2 bg-slate-900 px-3 pb-2 pt-2 text-white">
            <Cctv size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{cam.name}</span>
            <button onClick={() => frame.current?.requestFullscreen?.().catch(() => {})} aria-label="เต็มจอ" className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Maximize2 size={17} /></button>
            <a href={cam.url} target="_blank" rel="noopener noreferrer" aria-label="เปิดในแท็บใหม่" title="ถ้าภาพไม่ขึ้น ให้เปิดในแท็บใหม่" className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><ExternalLink size={17} /></a>
            <button onClick={() => setOpen(false)} className="flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-slate-900"><X size={16} /> ปิด</button>
          </div>
          <iframe
            ref={frame}
            src={cam.url}
            title={cam.name}
            className="min-h-0 w-full flex-1 border-0 bg-slate-900"
            allow="fullscreen; autoplay; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {!cam.embed && (
        <a href={cam.url} target="_blank" rel="noopener noreferrer" className="mx-4 mb-4 flex items-center justify-center gap-2 rounded-xl bg-sky-700 py-3 font-semibold text-white">
          เปิดกล้อง <ExternalLink size={16} />
        </a>
      )}
    </section>
  );
}
