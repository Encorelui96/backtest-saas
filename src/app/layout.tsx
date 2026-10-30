import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav, NavFallback } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Backtest Lab",
  description: "Backteste tes stratégies de scalp, day et swing trading sur les cours crypto en direct.",
  appleWebApp: { capable: true, title: "Backtest Lab", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#121722",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={<NavFallback />}>
          <Nav />
        </Suspense>
        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 sm:px-4 md:pt-6">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-3 pt-6 pb-28 text-[11px] leading-relaxed text-muted sm:px-4 md:pb-6">
          Backtest Lab est un outil de simulation. Les résultats sont calculés sur des données passées : ils ne promettent aucun gain futur et ne
          constituent pas un conseil en investissement. Trader des crypto-actifs comporte un risque de perte en capital.
        </footer>
      </body>
    </html>
  );
}
