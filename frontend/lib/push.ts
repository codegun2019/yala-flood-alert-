import { api } from "./api";

export type PushSupport = "ok" | "unsupported" | "ios-needs-install" | "denied";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  if (isIOS && !standalone) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

function b64ToU8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export interface Prefs {
  stations: string[];
  min_level: "watch" | "high" | "critical";
  notify_rain: boolean;
}

export async function subscribe(prefs: Prefs): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("ไม่ได้รับอนุญาตให้แจ้งเตือน");
  const reg = (await registerSW())!;
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/api/push/public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON(), ...prefs }) });
  localStorage.setItem("yala-prefs", JSON.stringify(prefs));
}

export async function updatePrefs(prefs: Prefs): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return subscribe(prefs);
  await api("/api/alerts/preferences", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint, ...prefs }) });
  localStorage.setItem("yala-prefs", JSON.stringify(prefs));
}

export async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
  localStorage.removeItem("yala-prefs");
}

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem("yala-prefs") || "");
    if (p && Array.isArray(p.stations)) return p;
  } catch {}
  return { stations: [], min_level: "watch", notify_rain: true };
}
