import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FocusLog", template: "%s · FocusLog" },
  description: "Track your study day honestly — every focus block, break and distraction.",
  applicationName: "FocusLog",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  // iPhone "Add to Home Screen": open full-screen with its own name.
  appleWebApp: { capable: true, title: "FocusLog", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#101312" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
