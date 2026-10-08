"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, MoreVertical, PlusSquare, Share, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useInstall, type InstallState } from "@/lib/pwa";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "focuslog:install-banner-dismissed";

/** Settings section body: install button, or the right steps for this phone. */
export function InstallApp() {
  const { state, install } = useInstall();
  const [steps, setSteps] = useState(false);
  if (!state) return <div className="h-16" />;

  if (state.standalone || state.installed) {
    return (
      <p className="flex items-center gap-2 text-[14px]">
        <CheckCircle2 className="size-4 text-primary" />
        {state.standalone ? "You're using the installed app." : "Installed — open FocusLog from your home screen or app list."}
      </p>
    );
  }

  const go = async () => {
    if (!state.canPrompt) return setSteps(true);
    const r = await install();
    if (r === "accepted") toast.success("FocusLog is installed — find it on your home screen.");
  };

  return (
    <div className="space-y-4">
      <ul className="grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-3">
        <Perk>Its own icon on your home screen</Perk>
        <Perk>Opens full-screen, no browser bars</Perk>
        <Perk>Free — no app store, updates itself</Perk>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={go} disabled={state.unsupported}>
          <Download /> {state.canPrompt ? "Install FocusLog" : "How to install"}
        </Button>
        {state.unsupported && <span className="text-[12px] text-muted-foreground">This browser can&apos;t install apps — open FocusLog in Chrome, Edge or Safari.</span>}
      </div>
      <InstallSteps open={steps} onOpenChange={setSteps} state={state} />
    </div>
  );
}

/** Small nudge on phones, until installed or dismissed. */
export function InstallBanner() {
  const { state, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  const [steps, setSteps] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (!state || hidden || state.standalone || state.installed || state.platform === "desktop" || state.unsupported) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  const go = async () => {
    if (!state.canPrompt) return setSteps(true);
    const r = await install();
    if (r === "accepted") toast.success("Installed — find FocusLog on your home screen.");
  };

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border bg-card p-3 lg:hidden">
      <img src="/icons/icon-192.png" alt="" className="size-10 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-tight">Get the FocusLog app</p>
        <p className="text-[12px] text-muted-foreground">Free · on your home screen in seconds</p>
      </div>
      <Button size="sm" onClick={go}>Install</Button>
      <button onClick={dismiss} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss">
        <X className="size-4" />
      </button>
      <InstallSteps open={steps} onOpenChange={setSteps} state={state} />
    </div>
  );
}

function InstallSteps({ open, onOpenChange, state }: { open: boolean; onOpenChange: (o: boolean) => void; state: InstallState }) {
  const ios = state.platform === "ios";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Install FocusLog" description={ios ? "On iPhone and iPad, apps like this are added from Safari." : "Takes a few seconds — no app store needed."}>
        {ios && state.iosNotSafari ? (
          <ol className="space-y-3 text-[14px]">
            <Step n={1}>Copy this page&apos;s address.</Step>
            <Step n={2}>Open it in <b>Safari</b> — iPhone only allows Add to Home Screen from Safari.</Step>
            <Step n={3}>Then follow the steps shown there.</Step>
          </ol>
        ) : ios ? (
          <ol className="space-y-3 text-[14px]">
            <Step n={1}>
              Tap the <b>Share</b> button <Share className="mx-0.5 inline size-4 -translate-y-px" /> at the bottom of Safari (top on iPad).
            </Step>
            <Step n={2}>
              Scroll down and tap <b>Add to Home Screen</b> <PlusSquare className="mx-0.5 inline size-4 -translate-y-px" />.
            </Step>
            <Step n={3}>Tap <b>Add</b>. FocusLog appears on your home screen.</Step>
          </ol>
        ) : state.platform === "android" ? (
          <ol className="space-y-3 text-[14px]">
            <Step n={1}>
              Tap the browser menu <MoreVertical className="mx-0.5 inline size-4 -translate-y-px" /> (top right in Chrome).
            </Step>
            <Step n={2}>
              Tap <b>Install app</b> or <b>Add to Home screen</b>.
            </Step>
            <Step n={3}>Confirm. FocusLog appears with your other apps.</Step>
          </ol>
        ) : (
          <ol className="space-y-3 text-[14px]">
            <Step n={1}>
              Look for the install icon <Smartphone className="mx-0.5 inline size-4 -translate-y-px" /> at the right end of the address bar, or open the browser menu.
            </Step>
            <Step n={2}>
              Choose <b>Install FocusLog</b> (Chrome) or <b>Apps → Install this site as an app</b> (Edge).
            </Step>
            <Step n={3}>It opens in its own window and appears in your apps.</Step>
          </ol>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="tnum inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-primary">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2")}>
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
      {children}
    </li>
  );
}
