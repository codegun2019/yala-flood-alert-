export type Risk = "normal" | "watch" | "high" | "critical" | "stale" | "unknown";
export type RainLevel = "normal" | "heavy" | "very_heavy" | "stale" | "unknown";

export interface Thresholds {
  watch: number;
  high: number;
  critical: number;
  source: "admin_verified" | "admin" | "official" | "bank_default";
}

export interface WaterStation {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  amphoe: string | null;
  tumbon: string | null;
  agency: string | null;
  simulated: boolean;
  level_msl: number | null;
  bank_level: number | null;
  observed_at: string | null;
  received_at: string | null;
  source_situation: number | null;
  thresholds: Thresholds | null;
  risk: Risk;
  last_known_risk: Risk | null;
  reason: string;
  trend: "rising" | "falling" | "steady" | null;
  rate_m_per_h: number | null;
  rapid_rise: boolean;
  margin_to_critical: number | null;
  age_minutes: number | null;
}

export interface RainStation {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  amphoe: string | null;
  agency: string | null;
  simulated: boolean;
  rain_1h: number | null;
  rain_24h: number | null;
  observed_at: string | null;
  rain_level: RainLevel;
  reason: string;
  age_minutes: number | null;
}

export interface SourceHealth {
  source: string;
  ok: boolean;
  last_success_at: string | null;
  age_minutes: number | null;
  consecutive_failures: number;
  simulated: boolean;
}

export interface Announcement {
  id: number;
  created_at: string;
  title: string;
  body: string;
  severity: "info" | "watch" | "high" | "critical";
}

export interface AlertRow {
  id: number;
  created_at: string;
  kind: string;
  station_name: string | null;
  risk: string | null;
  title: string;
  body: string;
  official: boolean;
  simulated: boolean;
}

export interface CctvInfo {
  cameras: { id: string; name: string; url: string; embed: boolean; note: string }[];
  sources: { name: string; url: string }[];
}
