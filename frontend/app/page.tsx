"use client";
import dynamic from "next/dynamic";
import { BellRing, Building2, Maximize2, Play, Cctv, CloudRain, Droplets, ExternalLink, FlaskConical, LocateFixed, MapPinned, Megaphone, Phone, RefreshCw, Share2, ShieldAlert, TriangleAlert, Waves, WifiOff, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { distanceKm, fmtAge, fmtHM, fmtTime, num, RISK_META, RISK_ORDER } from "@/lib/format";
import { currentSubscription, loadPrefs, type Prefs, registerSW, updatePrefs } from "@/lib/push";
import type { Announcement, CctvInfo, RainStation, SourceHealth, WaterStation } from "@/lib/types";
import { RiskBadge, Trend } from "@/components/Badges";
import NotifyPanel from "@/components/NotifyPanel";
import RainPanel from "@/components/RainPanel";
import InstallCard from "@/components/InstallCard";
import StationSheet from "@/components/StationSheet";
import { playAlert, soundEnabled, unlockAudio } from "@/lib/sound";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-slate-200" /> });

type Tab = "status" | "map" | "rain" | "cctv" | "notify";
const TABS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "status", icon: Waves, label: "สถานการณ์" },
  { id: "map", icon: MapPinned, label: "แผนที่" },
  { id: "rain", icon: CloudRain, label: "ฝน" },
  { id: "cctv", icon: Cctv, label: "CCTV" },
  { id: "notify", icon: BellRing, label: "แจ้งเตือน" },
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
  const nearest = useMemo(() => {
    if (!me) return null;
    return water
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => ({ s, d: distanceKm(me, [s.lat!, s.lon!]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
  }, [me, water]);
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
      <header className="pt-safe sticky top-0 z-30 bg-gradient-to-r from-sky-800 to-sky-600 px-4 pb-3 pt-3 text-white shadow">
        <div className="flex items-center justify-between">
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
        <p className="mt-1 text-xs opacity-90">
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

            <section className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 font-bold"><LocateFixed size={18} className="text-sky-700" /> ติดตามสถานการณ์น้ำใกล้บ้านฉัน</div>
                  <div className="text-xs text-slate-500">ใช้ตำแหน่งในเครื่องเพื่อหาสถานีที่ใกล้ที่สุด (ไม่ส่งตำแหน่งไปเก็บที่เซิร์ฟเวอร์)</div>
                </div>
                <button onClick={locate} className="shrink-0 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white">ค้นหา</button>
              </div>
              {geoMsg && <p className="mt-2 text-sm text-slate-600">{geoMsg}</p>}
              {nearest && (
                <ul className="mt-2 space-y-1.5">
                  {nearest.map(({ s, d }) => (
                    <li key={s.id}>
                      <button onClick={() => setSelected(s.id)} className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-2.5 text-left">
                        <span className="text-sm"><b>{s.name}</b><br /><span className="text-xs text-slate-500">ห่าง {d.toFixed(1)} กม.</span></span>
                        <RiskBadge risk={s.risk} size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!loaded && [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />)}
            {loaded && water.length === 0 && !netErr && <p className="rounded-2xl bg-white p-4 text-sm text-slate-600">ยังไม่มีข้อมูลสถานี — ระบบกำลังรอข้อมูลรอบแรกจากแหล่งต้นทาง</p>}

            <section className="space-y-2">
              {sorted.map((s) => (
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
            </section>
          </>
        )}

        {tab === "map" && (
          <>
            <MapView water={water} rain={rain} me={me} onSelect={setSelected} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(["normal", "watch", "high", "critical", "stale", "unknown"] as const).map((r) => (
                <span key={r} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded-full ${RISK_META[r].dot}`} />{RISK_META[r].label}</span>
              ))}
              <button onClick={locate} className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-700 px-3 py-1.5 text-white"><LocateFixed size={14} /> ตำแหน่งฉัน</button>
            </div>
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

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center py-2 text-xs ${tab === t.id ? "font-bold text-sky-700" : "text-slate-500"}`}>
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
        <div>
          <iframe
            ref={frame}
            src={cam.url}
            title={cam.name}
            className="h-[68dvh] min-h-[420px] w-full border-0 bg-slate-900"
            allow="fullscreen; autoplay; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
          <div className="flex gap-2 p-3">
            <button onClick={() => frame.current?.requestFullscreen?.().catch(() => {})} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold"><Maximize2 size={16} /> เต็มจอ</button>
            <a href={cam.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold"><ExternalLink size={16} /> เปิดในแท็บใหม่</a>
            <button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold">ปิด</button>
          </div>
          <p className="px-4 pb-3 text-xs text-slate-500">ถ้าภาพไม่ขึ้น ให้กด “เปิดในแท็บใหม่” · ภาพ CCTV ใช้ดูประกอบเท่านั้น ไม่แทนค่าระดับน้ำที่ตรวจวัด</p>
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
