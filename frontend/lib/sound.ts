// In-app alert sounds (Web Audio) + vibration. Only plays while the page is open;
// background notifications use the phone's own notification sound.
type Sev = "watch" | "high" | "critical" | "official" | "rapid" | "test" | string;

let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem("yala-sound") !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(v: boolean) {
  localStorage.setItem("yala-sound", v ? "on" : "off");
}

/** Browsers only allow audio after a user gesture; call from a tap handler. */
export function unlockAudio(): boolean {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    // iOS needs a (silent) sound started inside the gesture
    const b = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(0);
    return ctx.state !== "closed";
  } catch {
    return false;
  }
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function playAlert(sev: Sev): boolean {
  if (!ctx || ctx.state !== "running") return false;
  if (sev === "critical") {
    for (let i = 0; i < 8; i++) tone(i % 2 ? 700 : 980, i * 0.32, 0.3, "sawtooth", 0.35); // siren
  } else if (sev === "high" || sev === "official" || sev === "rapid") {
    for (let i = 0; i < 3; i++) tone(880, i * 0.28, 0.2, "square", 0.22);
  } else if (sev === "test") {
    [660, 880, 1100].forEach((f, i) => tone(f, i * 0.22, 0.4, "sine", 0.4)); // friendly chime
  } else {
    for (let i = 0; i < 2; i++) tone(620, i * 0.3, 0.22, "triangle", 0.3);
  }
  try {
    navigator.vibrate?.(sev === "critical" ? [600, 150, 600, 150, 600] : sev === "test" ? [250, 100, 250] : [350, 120, 350]);
  } catch {}
  return true;
}
