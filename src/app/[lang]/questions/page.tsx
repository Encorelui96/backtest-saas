import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { LegalPage, Section } from "@/components/legal-page";
import { FAQ_CONTENT } from "@/lib/learn/faq";
import { pageLang } from "@/lib/i18n/page";

export async function generateMetadata({ params }: PageProps<"/[lang]/questions">): Promise<Metadata> {
  const { t } = await pageLang(params);
  return {
    title: t("Questions fréquentes · Backtest Lab"),
    description: t("Ce que fait Backtest Lab, pour qui, sur quels marchés, à quel prix, et en quoi il diffère de TradingView, d'un tableur ou du backtest à la main."),
  };
}

export default async function QuestionsPage({ params }: PageProps<"/[lang]/questions">) {
  const { lang, t } = await pageLang(params);
  const { faq: FAQ, comparison: COMPARISON } = FAQ_CONTENT[lang];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <LegalPage lang={lang} title={t("Questions fréquentes")} intro={t("Ce que fait Backtest Lab, pour qui, sur quels marchés et à quel prix.")} updated={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {FAQ.map((f) => (
        <Section key={f.q} title={f.q}>
          <p>{f.a}</p>
        </Section>
      ))}

      <Section title={t("Backtest Lab, TradingView, un tableur ou le backtest à la main ?")}>
        <p>{t("Chaque méthode a ses forces. Voici une comparaison honnête pour choisir celle qui te convient.")}</p>
        <div className="flex flex-col gap-2">
          {COMPARISON.map((c) => (
            <div key={c.tool} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className="font-semibold">{c.tool}</div>
              <p className="mt-1">
                <span className="text-up">{t("Points forts : ")}</span>
                {c.good}
              </p>
              <p className="mt-1">
                <span className="text-warn">{t("Limites : ")}</span>
                {c.limits}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-fg/85">
        {t("Envie d'essayer ? ")}
        <Link href="/connexion?mode=signup" className="text-accent hover:underline">
          {t("Crée un compte gratuit")}
        </Link>
        {t(", ou découvre d'abord ")}
        <Link href="/apprendre" className="text-accent hover:underline">
          {t("les mots du trading expliqués simplement")}
        </Link>
        .
      </p>
    </LegalPage>
  );
}
