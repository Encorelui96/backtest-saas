import { Home } from "@/components/home";
import { PLANS } from "@/lib/plans";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { pageLang } from "@/lib/i18n/page";
import type { Lang, T } from "@/lib/i18n";

/** What the product is and costs, as structured data for search engines and AI assistants. */
const jsonLd = (lang: Lang, t: T) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: `${SITE_URL}${lang === "en" ? "/en" : ""}`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  inLanguage: lang,
  description: t(
    "Outil de backtest en ligne : décris ta stratégie de trading en français, teste-la sur des années de cours (cryptos, forex, or, Nasdaq 100) avec frais et glissement, puis vérifie sa robustesse et tes chances de réussir un challenge prop firm.",
  ),
  offers: Object.values(PLANS).map((p) => ({ "@type": "Offer", name: t(p.label), price: p.monthly, priceCurrency: "EUR" })),
});

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang, t } = await pageLang(params);
  const JSON_LD = jsonLd(lang, t);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <Home />
    </>
  );
}
