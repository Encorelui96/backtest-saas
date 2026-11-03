import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { LegalPage, Section } from "@/components/legal-page";
import { pageLang } from "@/lib/i18n/page";

export async function generateMetadata({ params }: PageProps<"/[lang]/conditions">): Promise<Metadata> {
  const { lang } = await pageLang(params);
  return { title: lang === "en" ? "Terms of use · Backtest Lab" : "Conditions d'utilisation · Backtest Lab" };
}

export default async function ConditionsPage({ params }: PageProps<"/[lang]/conditions">) {
  const { lang } = await pageLang(params);
  return lang === "en" ? <English /> : <French />;
}

function French() {
  return (
    <LegalPage title="Conditions d'utilisation" intro="En créant un compte, tu acceptes ces conditions. Elles sont écrites pour être lues : si un point n'est pas clair, écris-nous.">
      <Section title="1. Ce qu'est Backtest Lab">
        <p>
          Backtest Lab simule des stratégies de trading sur des cours passés (cryptos, forex, or, Nasdaq 100) et en mesure les résultats et la robustesse. Il n&apos;exécute
          aucun ordre, ne détient aucun fonds et n&apos;est relié à aucun compte de courtage.
        </p>
      </Section>

      <Section title="2. Pas de conseil en investissement">
        <p>
          Un backtest décrit ce qui se serait passé, pas ce qui se passera. Les résultats ne promettent aucun gain futur et ne sont pas un conseil en investissement. Les
          décisions que tu prends sur les marchés sont sous ta seule responsabilité. Le trading, surtout avec un effet de levier (CFD, futures), peut faire perdre plus que
          prévu.
        </p>
      </Section>

      <Section title="3. Ton compte">
        <ul>
          <li>Le service est réservé aux personnes majeures.</li>
          <li>Un compte par personne, avec une adresse e-mail qui t&apos;appartient.</li>
          <li>Garde ton mot de passe pour toi : ce qui se fait avec ton compte est réputé fait par toi.</li>
        </ul>
      </Section>

      <Section title="4. Les offres et leurs limites">
        <p>
          L&apos;offre Découverte est gratuite. Chaque offre fixe un nombre de backtests et de traductions par l&apos;IA par mois, détaillé dans la page{" "}
          <Link href="/tarifs">Tarifs</Link>. Les offres payantes ne sont pas encore ouvertes : leurs conditions de vente (prix, paiement, rétractation, résiliation) seront
          publiées avant l&apos;ouverture du paiement. Si les limites d&apos;une offre changent, le changement est annoncé à l&apos;avance.
        </p>
      </Section>

      <Section title="5. La traduction par l'IA">
        <p>
          Quand tu décris une stratégie en français, elle est traduite en règles par un modèle d&apos;intelligence artificielle (Claude, d&apos;Anthropic). L&apos;IA peut se
          tromper : relis les règles et la liste des choix faits par l&apos;IA avant de lancer un test. Le constructeur de règles manuel marche sans IA.
        </p>
      </Section>

      <Section title="6. Les données de marché">
        <p>
          Les cours viennent de Binance, Twelve Data et Databento. Ils peuvent contenir des erreurs, des retards ou des trous. Le forex, l&apos;or et les indices ferment le
          week-end. Le Nasdaq 100 est suivi par le contrat future NQ en continu, qui saute légèrement à chaque changement d&apos;échéance. Ces données servent à ta
          simulation personnelle : tu ne peux pas les extraire en masse, les revendre ni les redistribuer.
        </p>
      </Section>

      <Section title="7. Ce qui n'est pas permis">
        <ul>
          <li>Contourner les limites d&apos;une offre, par exemple avec plusieurs comptes ou des scripts.</li>
          <li>Perturber le service, tenter d&apos;accéder aux données d&apos;autres comptes ou à des parties non publiques.</li>
          <li>Revendre ou partager l&apos;accès à ton compte.</li>
        </ul>
        <p>En cas d&apos;abus, le compte peut être suspendu, après un avertissement quand c&apos;est possible.</p>
      </Section>

      <Section title="8. Disponibilité et responsabilité">
        <p>
          Le service est fourni tel quel, avec le soin d&apos;un service sérieux mais sans garantie de disponibilité permanente : il peut être interrompu pour maintenance ou
          en cas de panne d&apos;un prestataire. L&apos;éditeur ne peut pas être tenu responsable des pertes subies sur les marchés à partir de résultats de simulation, ni
          des erreurs des données fournies par des tiers.
        </p>
      </Section>

      <Section title="9. Ce qui t'appartient">
        <p>
          Tes stratégies et leurs descriptions restent les tiennes. Tu autorises Backtest Lab à les conserver et à les traiter uniquement pour te fournir le service. Quand
          tu partages un rapport, toute personne qui a le lien peut le consulter, jusqu&apos;à ce que tu retires le lien. Le logiciel, le nom et le design du site restent la
          propriété de l&apos;éditeur.
        </p>
      </Section>

      <Section title="10. Arrêter">
        <p>
          Tu peux supprimer ton compte à tout moment dans <Link href="/compte">Mon compte</Link> : tout est effacé. Le détail est dans la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section title="11. Changements et droit applicable">
        <p>
          Ces conditions peuvent évoluer ; un changement important est annoncé dans le site avant de s&apos;appliquer. Elles sont soumises au droit français. En cas de
          désaccord, cherchons d&apos;abord une solution amiable ; à défaut, les tribunaux français sont compétents, sous réserve des règles protégeant les consommateurs.
        </p>
      </Section>
    </LegalPage>
  );
}

/** Courtesy translation: the French page prevails. */
function English() {
  return (
    <LegalPage
      lang="en"
      legal
      title="Terms of use"
      intro="By creating an account, you accept these terms. They are written to be read: if something isn't clear, write to us."
    >
      <Section title="1. What Backtest Lab is">
        <p>
          Backtest Lab simulates trading strategies on past prices (crypto, forex, gold, Nasdaq 100) and measures their results and robustness. It executes no orders, holds
          no funds and isn&apos;t connected to any brokerage account.
        </p>
      </Section>

      <Section title="2. No investment advice">
        <p>
          A backtest describes what would have happened, not what will happen. The results promise no future gains and are not investment advice. The decisions you make
          on the markets are your sole responsibility. Trading, especially with leverage (CFDs, futures), can lose more than expected.
        </p>
      </Section>

      <Section title="3. Your account">
        <ul>
          <li>The service is for adults only.</li>
          <li>One account per person, with an email address that belongs to you.</li>
          <li>Keep your password to yourself: what is done with your account is deemed done by you.</li>
        </ul>
      </Section>

      <Section title="4. Plans and their limits">
        <p>
          The Starter plan is free. Each plan sets a number of backtests and AI translations per month, detailed on the <Link href="/tarifs">Pricing</Link> page. Paid plans
          aren&apos;t open yet: their terms of sale (price, payment, withdrawal, cancellation) will be published before payment opens. If a plan&apos;s limits change, the
          change is announced in advance.
        </p>
      </Section>

      <Section title="5. AI translation">
        <p>
          When you describe a strategy in plain words, it is turned into rules by an artificial intelligence model (Claude, by Anthropic). The AI can make mistakes: read the
          rules and the list of choices the AI made before running a test. The manual rule builder works without AI.
        </p>
      </Section>

      <Section title="6. Market data">
        <p>
          Prices come from Binance, Twelve Data and Databento. They may contain errors, delays or gaps. Forex, gold and indices close at the weekend. The Nasdaq 100 is
          tracked through the continuous NQ futures contract, which jumps slightly at each roll. This data is for your personal simulation: you may not extract it in bulk,
          resell it or redistribute it.
        </p>
      </Section>

      <Section title="7. What isn't allowed">
        <ul>
          <li>Getting around a plan&apos;s limits, for example with several accounts or scripts.</li>
          <li>Disrupting the service, or trying to access other accounts&apos; data or non-public parts.</li>
          <li>Reselling or sharing access to your account.</li>
        </ul>
        <p>In case of abuse, the account may be suspended, after a warning when possible.</p>
      </Section>

      <Section title="8. Availability and liability">
        <p>
          The service is provided as is, with the care of a serious service but without a guarantee of permanent availability: it may be interrupted for maintenance or if a
          provider fails. The publisher can&apos;t be held liable for losses suffered on the markets based on simulation results, nor for errors in data supplied by third
          parties.
        </p>
      </Section>

      <Section title="9. What belongs to you">
        <p>
          Your strategies and their descriptions remain yours. You allow Backtest Lab to keep and process them only to provide you with the service. When you share a report,
          anyone with the link can view it, until you withdraw the link. The software, the name and the design of the site remain the publisher&apos;s property.
        </p>
      </Section>

      <Section title="10. Stopping">
        <p>
          You can delete your account at any time in <Link href="/compte">My account</Link>: everything is erased. The details are in the{" "}
          <Link href="/confidentialite">privacy policy</Link>.
        </p>
      </Section>

      <Section title="11. Changes and governing law">
        <p>
          These terms may change; a significant change is announced on the site before it applies. They are governed by French law. In case of disagreement, let&apos;s first
          look for an amicable solution; failing that, the French courts have jurisdiction, subject to the rules protecting consumers.
        </p>
      </Section>
    </LegalPage>
  );
}
