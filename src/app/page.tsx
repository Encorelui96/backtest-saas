import { Home } from "@/components/home";
import { PLANS } from "@/lib/plans";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** What the product is and costs, as structured data for search engines and AI assistants. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  inLanguage: "fr",
  description:
    "Outil de backtest en ligne : décris ta stratégie de trading en français, teste-la sur des années de cours (cryptos, forex, or, Nasdaq 100) avec frais et glissement, puis vérifie sa robustesse et tes chances de réussir un challenge prop firm.",
  offers: Object.values(PLANS).map((p) => ({ "@type": "Offer", name: p.label, price: p.monthly, priceCurrency: "EUR" })),
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <Home />
    </>
  );
}
