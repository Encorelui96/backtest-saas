import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav, NavFallback } from "@/components/nav";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const FOOTER_LINKS = [
  { href: "/tarifs", label: "Tarifs" },
  { href: "/questions", label: "Questions fréquentes" },
  { href: "/nouveautes", label: "Nouveautés" },
  { href: "/apprendre", label: "Apprendre" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions", label: "Conditions d'utilisation" },
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Backtest Lab",
  description: "Backteste tes stratégies de scalp, day et swing trading sur les cryptos, le forex, l'or et le Nasdaq, avant d'y mettre ton argent.",
  openGraph: { siteName: SITE_NAME, locale: "fr_FR", type: "website" },
  twitter: { card: "summary_large_image" },
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
        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 pt-6 pb-28 text-[11px] leading-relaxed text-muted sm:px-4 md:pb-6">
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Liens du pied de page">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>
          <p>
            Backtest Lab est un outil de simulation. Les résultats sont calculés sur des données passées : ils ne promettent aucun gain futur et ne constituent pas un conseil
            en investissement. Trader des cryptos, du forex, de l&apos;or ou des indices, surtout avec un effet de levier, comporte un risque élevé de perte en capital.
          </p>
        </footer>
      </body>
    </html>
  );
}
