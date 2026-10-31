import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Nouveautés · Backtest Lab",
  description: "Ce qui a changé dans Backtest Lab, du plus récent au plus ancien.",
};

/** Newest first. Add a line each time something visible ships: users see the product moving. */
const CHANGES: { month: string; items: { title: string; text: string }[] }[] = [
  {
    month: "Octobre 2026",
    items: [
      { title: "Partage d'un rapport", text: "Un lien public vers un backtest, à coller dans Discord, X ou un message, avec un aperçu de ses résultats. Tu peux le retirer à tout moment." },
      { title: "Accueil personnalisé", text: "Deux questions à l'inscription règlent le mode Débutant ou Expert et le marché de ta première stratégie." },
      { title: "Questions fréquentes", text: "Ce que fait Backtest Lab, pour qui, à quel prix, et une comparaison honnête avec TradingView, un tableur ou le backtest à la main." },
      { title: "Page Tarifs", text: "Les offres Découverte, Trader et Pro, au mois ou à l'année avec 2 mois offerts, et un avertissement quand ton quota du mois approche." },
      { title: "Tes données", text: "Télécharge tout ce que Backtest Lab garde sur toi, ou supprime ton compte en deux clics, depuis « Mon compte »." },
      { title: "Connexion par mot de passe", text: "Crée ton compte avec ton e-mail et un mot de passe, sans attendre de lien par e-mail." },
      { title: "Bandeau des marchés", text: "Bitcoin, or, EUR/USD, Nasdaq 100, Ether et Solana défilent ensemble sur le tableau de bord." },
      { title: "Mode Débutant allégé", text: "Cinq étapes, les règles résumées en français, et un verdict simple pour chaque test : prometteuse, fragile, perdante." },
      { title: "Forex, or et Nasdaq", text: "Neuf paires de forex, l'or (XAU/USD) et le Nasdaq 100 (future NQ, presque 24 h/24) rejoignent les cryptos." },
      { title: "Un « ? » partout", text: "Chaque réglage a sa définition et à quoi il sert, et la page Apprendre explique les mots du trading pas à pas." },
      { title: "Traduction par l'IA plus fiable", text: "Ta stratégie en français est vérifiée puis corrigée automatiquement quand la première traduction n'est pas valable." },
    ],
  },
];

export default function NouveautesPage() {
  return (
    <LegalPage title="Nouveautés" intro="Ce qui a changé dans Backtest Lab, du plus récent au plus ancien. Une idée ou un manque ? Dis-le-nous : c'est ce qui décide de la suite." updated={false}>
      {CHANGES.map((c) => (
        <section key={c.month} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{c.month}</h2>
          <ul className="flex flex-col gap-2">
            {c.items.map((i) => (
              <li key={i.title} className="rounded-lg border border-line bg-panel px-4 py-3">
                <div className="font-medium">{i.title}</div>
                <p className="mt-0.5 text-muted">{i.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </LegalPage>
  );
}
