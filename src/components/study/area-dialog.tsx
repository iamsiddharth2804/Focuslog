"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { iconFor } from "@/components/area-icon";
import { api } from "@/lib/fetcher";
import { AREA_COLORS, AREA_ICONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type AreaFormValue = { id?: string; name: string; description: string | null; icon: string; color: string; weeklyGoalMinutes: number | null };

export function AreaDialog({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: AreaFormValue; onSaved: (area: { id: string }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>(AREA_ICONS[0]);
  const [color, setColor] = useState<string>(AREA_COLORS[0]);
  const [weekly, setWeekly] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setIcon(initial?.icon ?? AREA_ICONS[0]);
    setColor(initial?.color ?? AREA_COLORS[Math.floor(Math.random() * AREA_COLORS.length)]!);
    setWeekly(initial?.weeklyGoalMinutes ? String(+(initial.weeklyGoalMinutes / 60).toFixed(1)) : "");
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the study area a name.");
    const hours = weekly.trim() ? Number(weekly) : null;
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 168)) return toast.error("Weekly goal must be between 0 and 168 hours.");
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, icon, color, weeklyGoalMinutes: hours ? Math.round(hours * 60) : null };
      const area = initial?.id
        ? await api<{ id: string }>(`/api/study-areas/${initial.id}`, { method: "PATCH", body })
        : await api<{ id: string }>("/api/study-areas", { body });
      toast.success(initial?.id ? "Study area updated" : "Study area created");
      onSaved(area);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial?.id ? "Edit study area" : "Create study area"} description="A subject, course or project you want to track time for.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="area-name">
            <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="DSA" maxLength={80} autoFocus />
          </Field>
          <Field label="Description" htmlFor="area-desc">
            <Textarea id="area-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Data Structures and Algorithms" rows={2} />
          </Field>
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Icon</p>
            <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Icon">
              {AREA_ICONS.map((ic) => {
                const I = iconFor(ic);
                return (
                  <button type="button" key={ic} role="radio" aria-checked={icon === ic} aria-label={ic} onClick={() => setIcon(ic)}
                    className={cn("flex h-10 items-center justify-center rounded-lg border transition-colors", icon === ic ? "border-transparent" : "hover:bg-muted")}
                    style={icon === ic ? { background: `${color}1F`, color, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}>
                    <I className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Color</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
              {AREA_COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                  className={cn("size-8 rounded-full ring-offset-2 ring-offset-card transition-shadow", color === c && "ring-2")}
                  style={{ background: c, ["--tw-ring-color" as string]: c }} />
              ))}
            </div>
          </div>
          <Field label="Weekly goal" htmlFor="area-weekly" hint="Optional. Hours per week for this subject.">
            <div className="flex items-center gap-2">
              <Input id="area-weekly" type="number" min={0} max={168} step={0.5} value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="10" className="w-28" />
              <span className="text-[13px] text-muted-foreground">hours / week</span>
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : initial?.id ? "Save" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
