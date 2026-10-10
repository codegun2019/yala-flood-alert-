"use client";
import { useEffect, useState } from "react";

export type InstallKind = "standalone" | "prompt" | "ios" | "in-app" | "android-manual" | "none";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
let wired = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function detect(): InstallKind {
  if (typeof window === "undefined") return "none";
  if (isStandalone()) return "standalone";
  const ua = navigator.userAgent;
  if (/Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(ua)) return "in-app";
  if (deferred) return "prompt";
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Android/i.test(ua)) return "android-manual";
  return "none";
}

export function useInstall() {
  const [kind, setKind] = useState<InstallKind>("none");
  useEffect(() => {
    wire();
    const upd = () => setKind(detect());
    upd();
    listeners.add(upd);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", upd);
    return () => {
      listeners.delete(upd);
      mq.removeEventListener?.("change", upd);
    };
  }, []);

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    listeners.forEach((l) => l());
    return outcome;
  };
  return { kind, install };
}

if (typeof window !== "undefined") wire(); // attach as early as possible so beforeinstallprompt is never missed
