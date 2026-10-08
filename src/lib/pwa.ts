"use client";
/**
 * Installing FocusLog as an app (no app store).
 *
 * Android & desktop Chrome/Edge fire `beforeinstallprompt` once, early — we keep it so an
 * "Install" button can show the real install dialog later. iPhone/iPad never fire it: there
 * the only way is Safari → Share → Add to Home Screen, so we show those steps instead.
 */
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once, as early as possible (app start). Registers the service worker too. */
export function initPwa() {
  if (typeof window === "undefined" || (window as unknown as { __flPwa?: boolean }).__flPwa) return;
  (window as unknown as { __flPwa?: boolean }).__flPwa = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
  if ("serviceWorker" in navigator) {
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

export type Platform = "ios" | "android" | "desktop";
export type InstallState = {
  /** Running as the installed app right now. */
  standalone: boolean;
  /** Just installed in this browser session. */
  installed: boolean;
  /** A one-tap install dialog is available (Android / desktop Chrome, Edge). */
  canPrompt: boolean;
  platform: Platform;
  /** iPhone/iPad, but not in Safari — Add to Home Screen only works from Safari there. */
  iosNotSafari: boolean;
  /** Not a browser that can install apps (e.g. Firefox on desktop). */
  unsupported: boolean;
};

function detect(): InstallState {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const iosNotSafari = ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const firefoxDesktop = !android && !ios && /Firefox\//.test(ua);
  return {
    standalone,
    installed: installedNow,
    canPrompt: !!deferred,
    platform: ios ? "ios" : android ? "android" : "desktop",
    iosNotSafari,
    unsupported: firefoxDesktop,
  };
}

export function useInstall() {
  const [state, setState] = useState<InstallState | null>(null);
  useEffect(() => {
    initPwa();
    const update = () => setState(detect());
    update();
    listeners.add(update);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", update);
    return () => {
      listeners.delete(update);
      mq.removeEventListener?.("change", update);
    };
  }, []);

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    const e = deferred;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null; // the event can only be used once
    emit();
    return outcome;
  };

  return { state, install };
}
