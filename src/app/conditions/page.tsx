import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";

export const metadata: Metadata = { title: "Conditions d'utilisation · Backtest Lab" };

export default function ConditionsPage() {
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
          Tes stratégies et leurs descriptions restent les tiennes. Tu autorises Backtest Lab à les conserver et à les traiter uniquement pour te fournir le service. Le
          logiciel, le nom et le design du site restent la propriété de l&apos;éditeur.
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
