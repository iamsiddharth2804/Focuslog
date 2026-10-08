"use client";
import { useEffect } from "react";

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: "release", cb: () => void) => void };

/**
 * Keep the screen on while `active` (Screen Wake Lock API — Chrome/Edge, Android, Safari 16.4+).
 * Phones silence web pages once they lock, so this is what lets the alarm ring on a phone.
 * The browser drops the lock whenever the tab is hidden; we take it again when you come back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!active || !wl) return;
    let lock: Sentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await wl.request("screen");
        if (stopped) void lock.release();
      } catch {
        /* low battery mode or not allowed — the timer still works */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      if (lock && !lock.released) void lock.release().catch(() => undefined);
    };
  }, [active]);
}

export function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}
