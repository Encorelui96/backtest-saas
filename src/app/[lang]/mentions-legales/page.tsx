import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { Fill, LegalPage, Section } from "@/components/legal-page";
import { EDITOR, HOST } from "@/lib/legal";
import { pageLang } from "@/lib/i18n/page";

export async function generateMetadata({ params }: PageProps<"/[lang]/mentions-legales">): Promise<Metadata> {
  const { lang } = await pageLang(params);
  return { title: lang === "en" ? "Legal notice · Backtest Lab" : "Mentions légales · Backtest Lab" };
}

export default async function MentionsLegalesPage({ params }: PageProps<"/[lang]/mentions-legales">) {
  const { lang } = await pageLang(params);
  return lang === "en" ? <English /> : <French />;
}

function French() {
  return (
    <LegalPage title="Mentions légales">
      <Section title="Éditeur du site">
        <ul>
          <li>
            Nom ou raison sociale : <Fill value={EDITOR.name} />
          </li>
          <li>
            Statut : <Fill value={EDITOR.status} />
          </li>
          <li>
            SIREN / RCS : <Fill value={EDITOR.siren} />
          </li>
          <li>
            Adresse : <Fill value={EDITOR.address} />
          </li>
          <li>
            Contact : {EDITOR.email ? <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a> : <Fill value="" />}
          </li>
          <li>
            Directeur de la publication : <Fill value={EDITOR.director} />
          </li>
        </ul>
      </Section>

      <Section title="Hébergement">
        <p>
          Le site, les calculs et la base de données sont hébergés par {HOST.name}, {HOST.address} (<a href={HOST.site}>{HOST.site.replace("https://", "")}</a>), sur des
          serveurs situés à {HOST.dataLocation}.
        </p>
      </Section>

      <Section title="Données de marché">
        <p>
          Les cours viennent de fournisseurs tiers : Binance pour les cryptos, Twelve Data pour le forex, l&apos;or et QQQ, Databento pour le Nasdaq 100 (contrat future NQ de
          CME Group). Ils sont fournis pour un usage personnel de simulation et ne peuvent pas être revendus ni redistribués.
        </p>
      </Section>

      <Section title="Avertissement">
        <p>
          Backtest Lab est un outil de simulation. Les résultats sont calculés sur des données passées : ils ne promettent aucun gain futur et ne constituent pas un conseil
          en investissement. Trader des cryptos, du forex, de l&apos;or ou des indices, surtout avec un effet de levier, comporte un risque élevé de perte en capital.
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          Le logiciel, le nom Backtest Lab, les textes et le design du site appartiennent à l&apos;éditeur. Les stratégies que tu crées restent les tiennes (voir les{" "}
          <Link href="/conditions">conditions d&apos;utilisation</Link>).
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Ce que le site collecte, pourquoi et comment exercer tes droits est expliqué dans la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}

/** Courtesy translation: the French page prevails. */
function English() {
  return (
    <LegalPage lang="en" legal title="Legal notice">
      <Section title="Publisher">
        <ul>
          <li>
            Name or company name: <Fill lang="en" value={EDITOR.name} />
          </li>
          <li>
            Legal status: <Fill lang="en" value={EDITOR.status} />
          </li>
          <li>
            SIREN / RCS: <Fill lang="en" value={EDITOR.siren} />
          </li>
          <li>
            Address: <Fill lang="en" value={EDITOR.address} />
          </li>
          <li>
            Contact: {EDITOR.email ? <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a> : <Fill lang="en" value="" />}
          </li>
          <li>
            Publication director: <Fill lang="en" value={EDITOR.director} />
          </li>
        </ul>
      </Section>

      <Section title="Hosting">
        <p>
          The site, the calculations and the database are hosted by {HOST.name}, San Francisco, California, United States (
          <a href={HOST.site}>{HOST.site.replace("https://", "")}</a>), on servers located in Frankfurt (Germany).
        </p>
      </Section>

      <Section title="Market data">
        <p>
          Prices come from third-party providers: Binance for crypto, Twelve Data for forex, gold and QQQ, Databento for the Nasdaq 100 (CME Group&apos;s NQ futures
          contract). They are provided for personal simulation use and may not be resold or redistributed.
        </p>
      </Section>

      <Section title="Warning">
        <p>
          Backtest Lab is a simulation tool. Results are computed on past data: they promise no future gains and are not investment advice. Trading crypto, forex, gold or
          indices, especially with leverage, carries a high risk of losing capital.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          The software, the Backtest Lab name, the texts and the design of the site belong to the publisher. The strategies you create remain yours (see the{" "}
          <Link href="/conditions">terms of use</Link>).
        </p>
      </Section>

      <Section title="Personal data">
        <p>
          What the site collects, why, and how to exercise your rights is explained in the <Link href="/confidentialite">privacy policy</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
