"use client";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/misc";
import { fetcher } from "@/lib/fetcher";
import { useEffect } from "react";
import { initPwa } from "@/lib/pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => initPwa(), []); // catch the install prompt early
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: (e) => (e as { status?: number })?.status !== 401, errorRetryCount: 3 }}>
        <TooltipProvider>
          {children}
          <Toaster position="top-center" toastOptions={{ className: "!rounded-xl !border !text-[13px]" }} />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
