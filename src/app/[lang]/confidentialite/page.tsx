import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { Fill, LegalPage, Section } from "@/components/legal-page";
import { EDITOR, HOST } from "@/lib/legal";
import { pageLang } from "@/lib/i18n/page";

export async function generateMetadata({ params }: PageProps<"/[lang]/confidentialite">): Promise<Metadata> {
  const { lang } = await pageLang(params);
  return lang === "en"
    ? { title: "Privacy · Backtest Lab", description: "The data Backtest Lab collects, why, where it is hosted and how to get it back or erase it." }
    : { title: "Confidentialité · Backtest Lab", description: "Les données que Backtest Lab collecte, pourquoi, chez qui elles sont hébergées et comment les récupérer ou les effacer." };
}

export default async function ConfidentialitePage({ params }: PageProps<"/[lang]/confidentialite">) {
  const { lang } = await pageLang(params);
  return lang === "en" ? <English /> : <French />;
}

function French() {
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
            <strong>Tes réponses</strong>, si tu en donnes : la question de satisfaction, les offres qui t&apos;intéressent dans la page Tarifs et les paires que tu demandes.
          </li>
        </ul>
        <p>
          Le choix Débutant / Expert est gardé dans ton navigateur et n&apos;est jamais envoyé au serveur.
        </p>
      </Section>

      <Section title="Pourquoi">
        <ul>
          <li>Faire fonctionner le service que tu demandes : ton compte, tes tests, tes rapports (exécution du contrat).</li>
          <li>T&apos;écrire quand un test de plus de 2 minutes se termine ou échoue : tu peux le désactiver dans Compte (intérêt légitime).</li>
          <li>Protéger le service : limiter les tentatives de connexion et les abus, appliquer les quotas (intérêt légitime).</li>
          <li>
            L&apos;améliorer : des statistiques internes, comme la part des inscrits qui lancent un premier test, calculées sur l&apos;ensemble des comptes (intérêt
            légitime).
          </li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p>
          Le cookie qui te garde connecté, indispensable au service, et, si tu choisis une langue avec les boutons FR / EN, un cookie qui la retient. C&apos;est
          pourquoi aucun bandeau ne te demande ton accord. Aucun cookie de publicité ni de mesure d&apos;audience.
        </p>
      </Section>

      <Section title="Qui d'autre les voit">
        <ul>
          <li>
            <strong>{HOST.name}</strong> héberge le site et la base de données, sur des serveurs à {HOST.dataLocation}.
          </li>
          <li>
            <strong>Resend</strong> envoie les e-mails du service : il reçoit ton adresse et le contenu du message, comme les résultats clés d&apos;un test terminé.
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
          {HOST.name}, Resend et Anthropic sont des sociétés américaines. Les transferts éventuels hors de l&apos;Union européenne sont encadrés par les garanties prévues par le
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

/** Courtesy translation: the French page prevails. */
function English() {
  const email = EDITOR.email ? <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a> : <Fill lang="en" value="" />;
  return (
    <LegalPage
      lang="en"
      legal
      title="Privacy policy"
      intro="Backtest Lab collects the minimum needed to run your account and your tests. No advertising, no data resale, no third-party tracking tool."
    >
      <Section title="Who is responsible for your data">
        <p>
          The publisher of the site: <Fill lang="en" value={EDITOR.name} />, reachable at {email}. See the <Link href="/mentions-legales">legal notice</Link>.
        </p>
      </Section>

      <Section title="What is collected">
        <ul>
          <li>
            <strong>Your account</strong>: your email address, a name taken from that address, your password (stored in a scrambled form that can&apos;t be turned back
            into the password) and your sign-up date.
          </li>
          <li>
            <strong>Your sessions</strong>: for each signed-in device, the IP address and the type of browser, kept while the session is open (30 days at most).
          </li>
          <li>
            <strong>What you create</strong>: your strategies (rules and description text) and your backtests (settings and results).
          </li>
          <li>
            <strong>Your usage</strong>: the number of backtests and AI translations, to apply the limits of your plan, and what each translation consumed.
          </li>
          <li>
            <strong>Your answers</strong>, if you give any: the satisfaction question, the plans you&apos;re interested in on the Pricing page and the pairs you request.
          </li>
        </ul>
        <p>The Beginner / Expert choice is kept in your browser and is never sent to the server.</p>
      </Section>

      <Section title="Why">
        <ul>
          <li>Running the service you ask for: your account, your tests, your reports (performance of the contract).</li>
          <li>Writing to you when a test of more than 2 minutes ends or fails: you can turn this off in Account (legitimate interest).</li>
          <li>Protecting the service: limiting sign-in attempts and abuse, applying quotas (legitimate interest).</li>
          <li>Improving it: internal statistics, such as the share of sign-ups who run a first test, computed over all accounts (legitimate interest).</li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p>
          The cookie that keeps you signed in, which the service needs, and, if you choose a language with the FR / EN buttons, a cookie that remembers it. That&apos;s why
          no banner asks for your consent. No advertising or audience measurement cookie.
        </p>
      </Section>

      <Section title="Who else sees it">
        <ul>
          <li>
            <strong>{HOST.name}</strong> hosts the site and the database, on servers in Frankfurt (Germany).
          </li>
          <li>
            <strong>Resend</strong> sends the service&apos;s emails: it receives your address and the content of the message, such as the key results of a finished test.
          </li>
          <li>
            <strong>Anthropic</strong> (the Claude AI) receives the strategy text you ask to translate, without your email or your name. Under its commercial terms,
            Anthropic doesn&apos;t use data received through its API to train its models. Don&apos;t write personal information in your descriptions.
          </li>
          <li>
            <strong>Binance</strong>: the price ticker and the Live page connect straight from your browser to Binance&apos;s public price feeds, which then see your IP
            address as with any site you visit.
          </li>
          <li>
            <strong>Twelve Data and Databento</strong> only receive price requests (market, dates) sent by our servers, with no data about you.
          </li>
          <li>
            <strong>People you give a share link to</strong> see the rules and results of that backtest, without your name or email. You can withdraw the link at any time
            from the report; it then leads nowhere.
          </li>
        </ul>
        <p>
          {HOST.name}, Resend and Anthropic are US companies. Any transfers outside the European Union are covered by the safeguards provided for by the GDPR (the European
          Commission&apos;s standard contractual clauses or the EU–US Data Privacy Framework), according to each provider&apos;s commitments.
        </p>
      </Section>

      <Section title="How long">
        <p>
          As long as your account exists. When you delete it, your account, your strategies, your backtests and your usage history are erased from the database at once.
          The host&apos;s backup copies then disappear as they are renewed.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access your data, correct it, erase it, get a copy of it, object to processing or ask for it to be restricted. Two buttons in{" "}
          <Link href="/compte">My account</Link> do it right away: “Download my data” and “Delete my account”. For anything else, write to {email}. If you believe your
          rights aren&apos;t respected, you can complain to the CNIL, the French data protection authority (<a href="https://www.cnil.fr">cnil.fr</a>).
        </p>
      </Section>

      <Section title="Security">
        <p>
          Encrypted connection (HTTPS), passwords never stored in clear text, data kept apart by account and sign-in attempts limited. In the event of a risky data breach,
          the CNIL and the people concerned will be informed as the law requires.
        </p>
      </Section>
    </LegalPage>
  );
}
