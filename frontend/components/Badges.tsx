import { CircleHelp, CloudLightning, CloudRain, Eye, Minus, OctagonAlert, ShieldCheck, TrendingDown, TrendingUp, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { RAIN_META, RISK_META, TREND_META } from "@/lib/format";
import type { RainLevel, Risk } from "@/lib/types";

export const RISK_ICON: Record<Risk, LucideIcon> = {
  normal: ShieldCheck,
  watch: Eye,
  high: TriangleAlert,
  critical: OctagonAlert,
  stale: WifiOff,
  unknown: CircleHelp,
};

export function RiskBadge({ risk, size = "md" }: { risk: Risk; size?: "sm" | "md" | "lg" }) {
  const m = RISK_META[risk];
  const Icon = RISK_ICON[risk];
  const pad = size === "lg" ? "px-3 py-1.5 text-base gap-2" : size === "sm" ? "px-2 py-0.5 text-xs gap-1" : "px-2.5 py-1 text-sm gap-1.5";
  const ic = size === "lg" ? 18 : size === "sm" ? 13 : 15;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${m.bg} ${m.color} ${m.ring} ${pad}`}>
      <Icon size={ic} strokeWidth={2.4} aria-hidden />
      {m.label}
    </span>
  );
}

export function RainBadge({ level }: { level: RainLevel }) {
  const m = RAIN_META[level];
  const Icon = level === "very_heavy" ? CloudLightning : CloudRain;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {m.label}
    </span>
  );
}

const TREND_ICON = { rising: TrendingUp, falling: TrendingDown, steady: Minus } as const;

export function Trend({ trend }: { trend: "rising" | "falling" | "steady" | null }) {
  if (!trend) return <span className="text-slate-400">-</span>;
  const t = TREND_META[trend];
  const Icon = TREND_ICON[trend];
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${t.cls}`}>
      <Icon size={15} strokeWidth={2.4} aria-hidden />
      {t.label}
    </span>
  );
}
