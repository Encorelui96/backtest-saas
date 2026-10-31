import type { Metadata } from "next";
import Link from "next/link";
import { Fill, LegalPage, Section } from "@/components/legal-page";
import { EDITOR, HOST } from "@/lib/legal";

export const metadata: Metadata = { title: "Mentions légales · Backtest Lab" };

export default function MentionsLegalesPage() {
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
