import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Backtest Lab",
  description: "Backteste tes stratégies de scalp, day et swing trading sur les cours crypto en direct.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-panel">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-fg">
              Backtest<span className="text-accent">Lab</span>
            </Link>
            <Link href="/" className="text-muted hover:text-fg">Tableau de bord</Link>
            <Link href="/strategies/new" className="text-muted hover:text-fg">Nouvelle stratégie</Link>
            <Link href="/live" className="text-muted hover:text-fg">Live</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
