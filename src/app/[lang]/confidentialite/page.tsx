import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { Fill, LegalPage, Section } from "@/components/legal-page";
import { EDITOR, HOST } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Confidentialité · Backtest Lab",
  description: "Les données que Backtest Lab collecte, pourquoi, chez qui elles sont hébergées et comment les récupérer ou les effacer.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Backtest Lab collecte le minimum nécessaire pour faire fonctionner ton compte et tes tests. Pas de publicité, pas de revente de données, pas d'outil de suivi tiers."
    >
      <Section title="Qui est responsable de tes données">
        <p>
          L&apos;éditeur du site : <Fill value={EDITOR.name} />, joignable à {EDITOR.email ? <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a> : <Fill value="" />}. Voir les{" "}
          <Link href="/mentions-legales">mentions légales</Link>.
        </p>
      </Section>

      <Section title="Ce qui est collecté">
        <ul>
          <li>
            <strong>Ton compte</strong> : ton adresse e-mail, un nom tiré de cette adresse, ton mot de passe (enregistré sous une forme brouillée qui ne permet pas de le
            retrouver) et ta date d&apos;inscription.
          </li>
          <li>
            <strong>Tes connexions</strong> : pour chaque appareil connecté, l&apos;adresse IP et le type de navigateur, gardés tant que la session est ouverte (30 jours au
            plus).
          </li>
          <li>
            <strong>Ce que tu crées</strong> : tes stratégies (règles et texte de description) et tes backtests (réglages et résultats).
          </li>
          <li>
            <strong>Ton utilisation</strong> : le nombre de backtests et de traductions par l&apos;IA, pour appliquer les limites de ton offre, et ce que chaque traduction a
            consommé.
          </li>
          <li>
            <strong>Tes réponses</strong>, si tu en donnes : la question de satisfaction et les offres qui t&apos;intéressent dans la page Tarifs.
          </li>
        </ul>
        <p>
          Le choix Débutant / Expert est gardé dans ton navigateur et n&apos;est jamais envoyé au serveur.
        </p>
      </Section>

      <Section title="Pourquoi">
        <ul>
          <li>Faire fonctionner le service que tu demandes : ton compte, tes tests, tes rapports (exécution du contrat).</li>
          <li>Protéger le service : limiter les tentatives de connexion et les abus, appliquer les quotas (intérêt légitime).</li>
          <li>
            L&apos;améliorer : des statistiques internes, comme la part des inscrits qui lancent un premier test, calculées sur l&apos;ensemble des comptes (intérêt
            légitime).
          </li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p>
          Un seul cookie : celui qui te garde connecté. Il est indispensable au service, c&apos;est pourquoi aucun bandeau ne te demande ton accord. Aucun cookie de
          publicité ni de mesure d&apos;audience.
        </p>
      </Section>

      <Section title="Qui d'autre les voit">
        <ul>
          <li>
            <strong>{HOST.name}</strong> héberge le site et la base de données, sur des serveurs à {HOST.dataLocation}.
          </li>
          <li>
            <strong>Anthropic</strong> (l&apos;IA Claude) reçoit le texte de stratégie que tu demandes de traduire, sans ton e-mail ni ton nom. D&apos;après ses conditions
            commerciales, Anthropic n&apos;utilise pas les données reçues par son API pour entraîner ses modèles. N&apos;écris pas d&apos;informations personnelles dans tes
            descriptions.
          </li>
          <li>
            <strong>Binance</strong> : le bandeau des cours et la page Live se connectent directement depuis ton navigateur aux flux de cours publics de Binance, qui voit
            alors ton adresse IP comme pour tout site visité.
          </li>
          <li>
            <strong>Twelve Data et Databento</strong> ne reçoivent que des demandes de cours (marché, dates) envoyées par nos serveurs, sans aucune donnée te concernant.
          </li>
          <li>
            <strong>Les personnes à qui tu donnes un lien de partage</strong> voient les règles et les résultats de ce backtest, sans ton nom ni ton e-mail. Tu peux retirer
            le lien à tout moment depuis le rapport ; il ne mène alors plus nulle part.
          </li>
        </ul>
        <p>
          {HOST.name} et Anthropic sont des sociétés américaines. Les transferts éventuels hors de l&apos;Union européenne sont encadrés par les garanties prévues par le
          RGPD (clauses contractuelles types de la Commission européenne ou cadre de protection des données UE–États-Unis), selon les engagements de chaque prestataire.
        </p>
      </Section>

      <Section title="Combien de temps">
        <p>
          Tant que ton compte existe. Quand tu le supprimes, ton compte, tes stratégies, tes backtests et ton historique d&apos;utilisation sont effacés immédiatement de la
          base. Les copies de sauvegarde de l&apos;hébergeur disparaissent ensuite au fil de leur renouvellement.
        </p>
      </Section>

      <Section title="Tes droits">
        <p>
          Tu peux accéder à tes données, les corriger, les effacer, en obtenir une copie, t&apos;opposer à un traitement ou demander sa limitation. Deux boutons dans{" "}
          <Link href="/compte">Mon compte</Link> le font tout de suite : « Télécharger mes données » et « Supprimer mon compte ». Pour le reste, écris à{" "}
          {EDITOR.email ? <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a> : <Fill value="" />}. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la
          CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Connexion chiffrée (HTTPS), mots de passe jamais stockés en clair, données séparées par compte et tentatives de connexion limitées. En cas de violation de données
          à risque, la CNIL et les personnes concernées seront prévenues comme le prévoit la loi.
        </p>
      </Section>
    </LegalPage>
  );
}
