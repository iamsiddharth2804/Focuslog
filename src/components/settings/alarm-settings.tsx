"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, BellRing, Music2, Play, Sun, Volume2, VolumeX } from "lucide-react";
import { wakeLockSupported } from "@/hooks/use-wake-lock";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ALARM,
  getAlarmPrefs,
  LENGTH_LABEL,
  notificationPermission,
  onAlarmPrefsChange,
  playAlarmNow,
  prefsFor,
  requestNotifications,
  setAlarmPrefs,
  SOUND_LABEL,
  type AlarmLength,
  type AlarmPrefs,
  type AlarmSound,
} from "@/lib/alarm";
import { cn } from "@/lib/utils";

const SOUND_ICON: Record<AlarmSound, typeof Bell> = { buzzer: BellRing, bell: Bell, chime: Music2, off: VolumeX };
const SOUND_HINT: Record<AlarmSound, string> = {
  buzzer: "Loud alarm-clock beeps",
  bell: "Two warm bell strikes",
  chime: "Soft two-note chime",
  off: "Silent",
};

export function useAlarmPrefs(): AlarmPrefs {
  const [p, setP] = useState<AlarmPrefs>(DEFAULT_ALARM);
  useEffect(() => {
    setP(getAlarmPrefs());
    return onAlarmPrefsChange(() => setP(getAlarmPrefs()));
  }, []);
  return p;
}

export function AlarmSettings() {
  const prefs = useAlarmPrefs();
  const [perm, setPerm] = useState<ReturnType<typeof notificationPermission>>("default");
  const [awakeOk, setAwakeOk] = useState(true);
  useEffect(() => {
    setPerm(notificationPermission());
    setAwakeOk(wakeLockSupported());
  }, []);

  const update = (next: Partial<AlarmPrefs>, preview = false) => {
    const merged = setAlarmPrefs(next);
    if (preview && merged.sound !== "off") playAlarmNow(merged, { preview: true });
  };

  const toggleNotify = async () => {
    if (prefs.notify) return update({ notify: false });
    const p = await requestNotifications();
    setPerm(p);
    if (p === "granted") {
      update({ notify: true });
      toast.success("Notifications on — you'll get one when a timer ends.");
    } else if (p === "denied") {
      toast.error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
    } else if (p === "unsupported") {
      toast.error("This browser doesn't support notifications.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[13px] font-medium">Sound when a focus session ends</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Alarm sound">
          {(Object.keys(SOUND_LABEL) as AlarmSound[]).map((s) => {
            const Icon = SOUND_ICON[s];
            const on = prefs.sound === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update({ sound: s }, true)}
                className={cn("flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors", on ? "border-primary bg-accent" : "hover:bg-muted")}
              >
                <Icon className={cn("size-4", on ? "text-primary" : "text-muted-foreground")} />
                <span className="text-[14px] font-medium">{SOUND_LABEL[s]}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{SOUND_HINT[s]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Tap a sound to hear it.</p>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium">Sound when a break ends</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Break end sound">
          {(["same", "buzzer", "bell", "chime", "off"] as const).map((s) => {
            const on = prefs.breakSound === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  const merged = setAlarmPrefs({ breakSound: s });
                  const play = s === "same" ? merged.sound : s;
                  if (play !== "off") playAlarmNow({ ...merged, sound: play }, { preview: true });
                }}
                className={cn("h-8 rounded-lg border px-3 text-[13px]", on ? "border-primary bg-accent font-medium" : "hover:bg-muted")}
              >
                {s === "same" ? `Same (${SOUND_LABEL[prefs.sound]})` : SOUND_LABEL[s]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Pick a different sound to know by ear whether it&apos;s time to rest or time to get back to it.</p>
      </div>

      <div className={cn("grid gap-5 sm:grid-cols-2", prefs.sound === "off" && "pointer-events-none opacity-50")}>
        <div>
          <label htmlFor="alarm-vol" className="mb-2 flex items-center justify-between text-[13px] font-medium">
            Volume <span className="tnum font-normal text-muted-foreground">{Math.round(prefs.volume * 100)}%</span>
          </label>
          <div className="flex items-center gap-3">
            <Volume2 className="size-4 shrink-0 text-muted-foreground" />
            <input
              id="alarm-vol"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={prefs.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              onPointerUp={() => playAlarmNow(getAlarmPrefs(), { preview: true })}
              onKeyUp={() => playAlarmNow(getAlarmPrefs(), { preview: true })}
              className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium">Rings for</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Alarm length">
            {(Object.keys(LENGTH_LABEL) as AlarmLength[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={prefs.length === l}
                onClick={() => update({ length: l })}
                className={cn("h-8 rounded-lg border px-3 text-[13px]", prefs.length === l ? "border-primary bg-accent font-medium" : "hover:bg-muted")}
              >
                {LENGTH_LABEL[l]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Any tap or key press stops it.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => playAlarmNow(getAlarmPrefs())} disabled={prefs.sound === "off"}>
          <Play /> Test full alarm
        </Button>
      </div>

      <div className="space-y-4 border-t pt-5">
        <Row
          title="Notification when a timer ends"
          hint={
            perm === "denied"
              ? "Blocked in your browser. Open the site settings (the icon left of the address bar) and allow notifications."
              : perm === "unsupported"
                ? "Not supported in this browser."
                : "Shows up even when you're in another tab or app — FocusLog just needs to stay open."
          }
          checked={prefs.notify && perm === "granted"}
          onChange={toggleNotify}
          disabled={perm === "unsupported"}
          icon={prefs.notify && perm === "granted" ? Bell : BellOff}
        />
        <Row title="Vibrate (phones)" hint="Buzzes your phone when a timer ends, on phones that support it." checked={prefs.vibrate} onChange={() => update({ vibrate: !prefs.vibrate })} icon={BellRing} />
        <Row
          title="Keep screen on during a timer"
          hint={awakeOk ? "Stops your screen from locking while a focus or break counts down, so the alarm can ring. Turns off when you pause or the timer ends." : "Not supported in this browser."}
          checked={prefs.keepAwake && awakeOk}
          onChange={() => update({ keepAwake: !prefs.keepAwake })}
          disabled={!awakeOk}
          icon={Sun}
        />
      </div>

      <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
        These settings are saved on this device, so your phone and laptop can sound different. The alarm works while FocusLog is open
        — even in another tab. On phones, keep FocusLog open with the screen on (the switch above does that for you).
      </p>
    </div>
  );
}

function Row({ title, hint, checked, onChange, disabled, icon: Icon }: { title: string; hint: string; checked: boolean; onChange: () => void; disabled?: boolean; icon: typeof Bell }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-[14px] font-medium">{title}</p>
          <p className="text-[12px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onChange}
        className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/25")}
      >
        <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-card shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

/** One line under the timer: which alarm will sound, with quick access to notifications. */
export function AlarmStatus({ blockType = "FOCUS" }: { blockType?: string }) {
  const prefs = prefsFor(useAlarmPrefs(), blockType);
  const [perm, setPerm] = useState<ReturnType<typeof notificationPermission>>("default");
  useEffect(() => setPerm(notificationPermission()), []);
  const Icon = prefs.sound === "off" ? VolumeX : SOUND_ICON[prefs.sound];
  const canAsk = !prefs.notify && perm !== "denied" && perm !== "unsupported";

  const enable = async () => {
    const p = await requestNotifications();
    setPerm(p);
    if (p === "granted") {
      setAlarmPrefs({ notify: true });
      toast.success("You'll get a notification when the timer ends.");
    } else if (p === "denied") toast.error("Notifications are blocked for this site in your browser settings.");
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
      <Link href="/settings#sound" className="inline-flex items-center gap-1.5 hover:text-foreground">
        <Icon className="size-3.5" />
        {prefs.sound === "off" ? "Sound off" : `${SOUND_LABEL[prefs.sound]} at the end`}
        {prefs.notify && perm === "granted" && " · notification on"}
      </Link>
      {canAsk && (
        <button type="button" onClick={enable} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Bell className="size-3.5" /> Notify me too
        </button>
      )}
    </div>
  );
}
