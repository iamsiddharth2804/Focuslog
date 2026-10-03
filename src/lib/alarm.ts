"use client";
/**
 * Timer alarm — sounds, scheduling, notifications.
 *
 * Why the audio clock: browsers throttle timers (setInterval/setTimeout) in background tabs,
 * sometimes to once a minute, so "check every second" alarms ring late. Sounds scheduled on
 * an AudioContext play at the exact time, background tab or not. So the moment a block
 * starts or resumes we pre-schedule its alarm, and a silent marker at the same instant tells
 * the app "time's up" (its `ended` event isn't throttled like timers are).
 *
 * Browsers only allow audio after the user has interacted with the page — `unlockAudio()`
 * runs on every click/keypress, and Start/Resume are clicks, so it's always unlocked in time.
 */

export type AlarmSound = "buzzer" | "bell" | "chime" | "off";
export type AlarmLength = "short" | "medium" | "long";
export type AlarmPrefs = { sound: AlarmSound; volume: number; length: AlarmLength; notify: boolean; vibrate: boolean };

export const DEFAULT_ALARM: AlarmPrefs = { sound: "buzzer", volume: 0.8, length: "medium", notify: false, vibrate: true };
export const SOUND_LABEL: Record<AlarmSound, string> = { buzzer: "Buzzer", bell: "Bell", chime: "Chime", off: "Off" };
export const LENGTH_LABEL: Record<AlarmLength, string> = { short: "Short · ~2 s", medium: "Medium · ~5 s", long: "Long · ~12 s" };
const RINGS: Record<AlarmLength, number> = { short: 1, medium: 3, long: 7 };

/* ───────── Preferences (per device: your phone and laptop can differ) ───────── */

const KEY = "focuslog:alarm";
const EVENT = "focuslog-alarm-prefs";

export function getAlarmPrefs(): AlarmPrefs {
  if (typeof window === "undefined") return DEFAULT_ALARM;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ALARM;
    const p = { ...DEFAULT_ALARM, ...JSON.parse(raw) } as AlarmPrefs;
    p.volume = Math.min(1, Math.max(0, Number(p.volume) || 0));
    if (!(p.sound in SOUND_LABEL)) p.sound = DEFAULT_ALARM.sound;
    if (!(p.length in RINGS)) p.length = DEFAULT_ALARM.length;
    return p;
  } catch {
    return DEFAULT_ALARM;
  }
}

export function setAlarmPrefs(next: Partial<AlarmPrefs>) {
  const merged = { ...getAlarmPrefs(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* private mode — keep working with defaults */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return merged;
}

export function onAlarmPrefsChange(cb: () => void) {
  const storage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", storage); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", storage);
  };
}

/* ───────── Audio ───────── */

let ctx: AudioContext | null = null;
let ringing: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

/** Call from any user gesture. Browsers keep audio locked until the page has been interacted with. */
export async function unlockAudio(): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === "running";
}

export function audioReady() {
  return !!ctx && ctx.state === "running";
}

/** Silence an alarm that is ringing right now. */
export function stopRinging() {
  if (!ringing || !ctx) return;
  const g = ringing;
  ringing = null;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
  setTimeout(() => g.disconnect(), 200);
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t0: number, dur: number, peak: number, decay = false) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else {
    g.gain.setValueAtTime(peak, t0 + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** One ring of a sound starting at t0. Returns its length in seconds. */
function ring(c: AudioContext, out: AudioNode, sound: AlarmSound, t0: number): number {
  if (sound === "buzzer") {
    // Classic alarm-clock "beep-beep-beep-beep": square wave, softened slightly.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    lp.connect(out);
    for (let i = 0; i < 4; i++) tone(c, lp, "square", 880, t0 + i * 0.22, 0.13, 0.32);
    return 1.3;
  }
  if (sound === "bell") {
    // A struck bell: fundamental plus inharmonic partials, long decay — two strikes.
    for (const [k, at] of [[0, 0], [1, 0.6]] as const) {
      const base = k === 0 ? 784 : 659;
      tone(c, out, "sine", base, t0 + at, 1.6, 0.5, true);
      tone(c, out, "sine", base * 2.76, t0 + at, 0.9, 0.12, true);
      tone(c, out, "sine", base * 5.4, t0 + at, 0.4, 0.05, true);
    }
    return 2.2;
  }
  if (sound === "chime") {
    tone(c, out, "sine", 880, t0, 0.9, 0.35, true);
    tone(c, out, "sine", 1318.5, t0 + 0.22, 0.9, 0.35, true);
    return 1.6;
  }
  return 0;
}

/**
 * Schedule an alarm `inSeconds` from now. `onFire` runs at that moment (even in a background
 * tab). Returns a cancel function, or null if audio isn't available/unlocked yet — callers
 * then fall back to ringing when their own check notices the timer hit zero.
 */
export function scheduleAlarm(inSeconds: number, prefs: AlarmPrefs, onFire: () => void): (() => void) | null {
  const c = audio();
  if (!c || c.state !== "running") return null;
  const t = c.currentTime + Math.max(0, inSeconds);

  const master = c.createGain();
  master.gain.value = prefs.sound === "off" ? 0 : prefs.volume;
  master.connect(c.destination);
  if (prefs.sound !== "off") {
    let at = t;
    for (let i = 0; i < RINGS[prefs.length]; i++) at += ring(c, master, prefs.sound, at) + 0.35;
  }

  // Silent marker: its "ended" event is our precise "time's up" signal.
  const marker = c.createConstantSource();
  const mute = c.createGain();
  mute.gain.value = 0;
  marker.connect(mute).connect(c.destination);
  let cancelled = false;
  marker.onended = () => {
    if (cancelled) return;
    ringing = master;
    onFire();
  };
  marker.start(t);
  marker.stop(t + 0.01);

  return () => {
    cancelled = true;
    try {
      marker.stop();
    } catch {
      /* already stopped */
    }
    master.disconnect();
    mute.disconnect();
  };
}

/** Ring right now (preview, or fallback when nothing was pre-scheduled). */
export function playAlarmNow(prefs: AlarmPrefs, opts: { preview?: boolean } = {}) {
  const c = audio();
  if (!c || prefs.sound === "off") return;
  if (c.state === "suspended") void c.resume();
  stopRinging();
  const master = c.createGain();
  master.gain.value = prefs.volume;
  master.connect(c.destination);
  let at = c.currentTime + 0.05;
  const rings = opts.preview ? 1 : RINGS[prefs.length];
  for (let i = 0; i < rings; i++) at += ring(c, master, prefs.sound, at) + 0.35;
  ringing = master;
}

/* ───────── Notifications & vibration ───────── */

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p === "granted") void registerWorker();
  return p;
}

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** System notification. Uses the service worker where available (required on Android). */
export async function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const options: NotificationOptions & { renotify?: boolean } = { body, tag: "focuslog-timer", renotify: true, icon: "/icon.svg", badge: "/icon.svg" };
  try {
    const reg = (await navigator.serviceWorker?.getRegistration("/")) ?? (await registerWorker());
    if (reg) return void (await reg.showNotification(title, options));
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some mobile browsers only allow worker notifications */
  }
}

export function vibrate() {
  try {
    navigator.vibrate?.([300, 120, 300, 120, 600]);
  } catch {
    /* unsupported */
  }
}
