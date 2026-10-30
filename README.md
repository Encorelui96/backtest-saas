# Backtest Lab

Backteste des stratégies de scalp, day trading et swing sur les cours crypto de Binance, et suis-les en direct.

## Ce que fait l'application

- **Stratégie en français** : tu décris ta stratégie, l'IA (Claude) la traduit en règles, liste les choix qu'elle a faits et pose des questions si quelque chose est flou. Sans clé API, un constructeur visuel et 5 modèles permettent de tout faire à la main.
- **Règles riches** : prix, MM, MME, RSI, ATR, Bollinger, MACD, stochastique, ADX, ROC, IBS, VWAP, plus haut/bas sur N bougies, niveaux de la veille, heure et jour ; conditions ET / OU, croisements, valeurs passées, indicateurs d'une unité de temps supérieure (sans regarder le futur).
- **Gestion du trade** : stop en %, en ATR ou sous le dernier plus bas ; objectif en %, ATR ou R ; stop suiveur ; point mort ; durée maximale ; fenêtre horaire ; jours autorisés ; fermeture à heure fixe ; risque par trade.
- **Réalisme** : entrée à l'ouverture de la bougie suivante, stop avant objectif quand les deux sont touchés, gaps, frais, spread, glissement, financement.
- **Résultats** : rendement, rendement annuel, baisse maximale, profit factor, gain moyen en R, Sharpe, courbe du capital, graphique de chaque trade, résultats par année, export CSV.
- **Robustesse** : test statistique de l'avantage, étude puis validation sur la suite de l'historique, Monte Carlo, réglages voisins, frais doublés, avec un verdict en 4 contrôles.
- **Challenge prop firm** : chance de réussite selon le risque par trade, sur l'historique réel, en Monte Carlo et comparé au hasard. Les règles sont modifiables.
- **Live** : cours en temps réel (WebSocket Binance), signaux de la stratégie, état de chaque condition et position simulée, recalculés à chaque clôture de bougie.

## Lancer en local

Il faut Node.js 22 ou plus récent et Docker (pour Postgres).

```bash
npm install
cp .env.example .env.local
docker compose up -d
```

Dans `.env.local`, mets `DATABASE_URL=postgres://postgres:postgres@localhost:5432/backtest`, une longue chaîne au hasard dans `BETTER_AUTH_SECRET`, et ton e-mail dans `ADMIN_EMAILS` pour avoir l'offre Pro. Puis :

```bash
npm run db:migrate
npm run dev
```

Et dans un deuxième terminal, le processus qui calcule les backtests :

```bash
npm run worker
```

Ouvre http://localhost:3000 et connecte-toi : sans clé Resend, le lien de connexion s'affiche dans le terminal de `npm run dev`.

## Mettre en ligne sur Render

Le fichier `render.yaml` crée tout d'un coup : le site, le processus de calcul et la base Postgres, à Francfort.

1. Sur render.com : **New**, puis **Blueprint**, puis choisis le dépôt `backtest-saas`.
2. Render demande les valeurs marquées `sync: false` : mets ton e-mail dans `ADMIN_EMAILS`, et ta clé dans `ANTHROPIC_API_KEY` si tu l'as. Les autres peuvent rester vides.
3. Clique sur **Deploy Blueprint**. `BETTER_AUTH_SECRET` et `DATABASE_URL` sont remplis automatiquement, et l'adresse du site est reprise pour la connexion.
4. Une fois les trois éléments au vert, ouvre l'adresse du service `backtest-lab`. Tant que Resend n'est pas configuré, le lien de connexion s'affiche dans les **Logs** du service web.

Avec ton propre domaine, ajoute `BETTER_AUTH_URL=https://ton-domaine` dans l'onglet **Environment** du service web.

## Mettre en ligne sur Railway

1. Crée un projet Railway depuis le dépôt GitHub, puis ajoute une base **Postgres** au projet.
2. **Service web** (créé avec le dépôt) : il lit `railway.json` (build, migrations avant chaque déploiement, démarrage). Dans *Settings > Networking*, génère un domaine.
3. **Service worker** : ajoute un deuxième service depuis le même dépôt. Dans *Settings > Config-as-code*, indique `railway.worker.json`.
4. Variables, sur les deux services : `DATABASE_URL` (référence `${{Postgres.DATABASE_URL}}`), `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_EMAILS`. Sur le web seulement : `BETTER_AUTH_URL` (l'adresse publique du site), `RESEND_API_KEY` et `EMAIL_FROM`, et si tu veux Google : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, avec l'adresse de retour `https://<ton-domaine>/api/auth/callback/google` déclarée chez Google.

Pour plus de calcul, augmente le nombre de répliques du worker : la file distribue les backtests entre eux.

## Offres et quotas

Définis dans `src/lib/server/quotas.ts` :

| Offre | Backtests / mois | Traductions IA / mois | Unité minimale | Tests simultanés |
|---|---|---|---|---|
| Découverte | 5 | 3 | 1h | 1 |
| Trader | 100 | 50 | 1m | 2 |
| Pro | 1 000 | 400 | 1m | 3 |

L'IA est aussi limitée à 5 traductions par minute et par compte. Le paiement (Stripe) n'est pas encore branché : pour changer l'offre d'un compte, mets la ligne `plans` à jour en base.

## Tests

```bash
npm test
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/lib/engine` | Moteur : indicateurs, évaluation des règles, simulation des trades, statistiques, robustesse, prop firm. Pur TypeScript, sans dépendance serveur. |
| `src/lib/strategy` | Format des stratégies (schéma Zod partagé avec l'IA), libellés, modèles. |
| `src/lib/server` | Postgres, comptes, quotas, file de calcul, bougies partagées (un bloc compressé par mois), appel à Claude. |
| `src/worker` | Le processus qui calcule les backtests de la file. |
| `db/schema.sql` | Tables de l'application ; `scripts/migrate.ts` les crée avec celles de la connexion. |
| `src/app/api` | Routes API. |
| `src/components` | Interface. |

## Prochaines étapes prévues

- Forex : ajouter un fournisseur de données (Twelve Data, OANDA…) à côté de Binance.
- Paiement des offres avec Stripe.
- Alertes de signal sur Telegram.
- Optimisation de paramètres avec validation glissante (walk-forward).
