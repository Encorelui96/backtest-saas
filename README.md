# Backtest Lab

Backteste des stratégies de scalp, day trading et swing sur la crypto, le forex, l'or et le Nasdaq, et suis-les en direct.

En ligne : https://backtest-lab-rnt9.onrender.com

## Ce que fait l'application

- **Marchés** : toutes les paires crypto de Binance ; forex (9 paires), or (XAUUSD) et Nasdaq 100 (QQQ) avec Twelve Data ; Nasdaq 100 en future (NAS100) avec Databento.
- **Stratégie en français** : tu décris ta stratégie, l'IA (Claude) la traduit en règles, liste les choix qu'elle a faits et pose des questions si quelque chose est flou. Sans clé API, un constructeur visuel et 11 modèles permettent de tout faire à la main.
- **Règles riches** : prix, moyennes mobiles, RSI, ATR, Bollinger, MACD, stochastique, ADX, Supertrend, Keltner, Ichimoku, SAR parabolique, OBV, MFI, z-score, VWAP ; plus haut/bas sur N bougies, niveaux de la veille et de la semaine précédente, points pivots, range d'une plage horaire ; figures de bougies (inside bar, avalement, pin bar) ; heure et jour. Conditions ET / OU, croisements, valeurs passées, indicateurs d'une unité de temps supérieure (sans regarder le futur).
- **Gestion du trade** : stop en %, en ATR ou sous le dernier plus bas ; objectif en %, ATR ou R ; stop suiveur ; point mort ; durée maximale ; fenêtre horaire ; jours autorisés ; fermeture à heure fixe ; risque par trade.
- **Réalisme** : entrée à l'ouverture de la bougie suivante, stop avant objectif quand les deux sont touchés, gaps, frais, spread, glissement, financement.
- **Résultats** : rendement, rendement annuel, baisse maximale, profit factor, gain moyen en R, Sharpe, courbe du capital, graphique de chaque trade, résultats par année, export CSV.
- **Analyse et risque** : résultats par heure, jour, sens et motif de sortie, excursions des trades, taux de réussite nécessaire, et pour chaque niveau de risque par trade la baisse probable, les séries de pertes et la fraction de Kelly, avec des constats écrits.
- **Robustesse** : test statistique de l'avantage, étude puis validation sur la suite de l'historique, Monte Carlo, réglages voisins, frais doublés, avec un verdict en 4 contrôles.
- **Challenge prop firm** : chance de réussite selon le risque par trade, sur l'historique réel, en Monte Carlo et comparé au hasard. Les règles sont modifiables.
- **Live** : cours en temps réel (WebSocket Binance pour la crypto, mise à jour toutes les 5 minutes pour les autres marchés), signaux de la stratégie, état de chaque condition et position simulée, recalculés à chaque clôture de bougie.
- **Partage** : lien public d'un rapport, que son auteur peut retirer.
- **Compte** : mot de passe, Google, lien de connexion par e-mail (avec Resend) ; copie de ses données et suppression du compte depuis `/compte`.

## Lancer en local

Il faut Node.js 22 ou plus récent et Docker (pour Postgres).

```bash
npm install
cp .env.example .env.local
docker compose up -d
```

Dans `.env.local`, mets une longue chaîne au hasard dans `BETTER_AUTH_SECRET`. Les autres valeurs sont expliquées dans `.env.example`. Puis :

```bash
npm run db:migrate
npm run dev
```

Et dans un deuxième terminal, le processus qui calcule les backtests :

```bash
npm run worker
```

Ouvre http://localhost:3000 et crée un compte. Sans clé Resend, le lien de connexion par e-mail s'affiche dans le terminal de `npm run dev`. Pour avoir l'offre Pro et la page `/admin`, copie l'identifiant affiché sur `/compte` dans `ADMIN_USER_IDS`, puis relance le serveur.

## Mettre en ligne sur Render

Le fichier `render.yaml` crée tout d'un coup : le site, le processus de calcul et la base Postgres, à Francfort.

1. Sur render.com : **New**, puis **Blueprint**, puis choisis le dépôt `backtest-saas`.
2. Render demande les valeurs marquées `sync: false`. Mets ta clé dans `ANTHROPIC_API_KEY` si tu l'as. Les autres peuvent rester vides.
3. Clique sur **Deploy Blueprint**. `BETTER_AUTH_SECRET` et `DATABASE_URL` sont remplis automatiquement, et l'adresse du site est reprise pour la connexion.
4. Une fois les trois éléments au vert, ouvre l'adresse du service `backtest-lab` et crée ton compte avec un mot de passe.
5. Administrateur : copie l'identifiant affiché sur `/compte` dans `ADMIN_USER_IDS`, dans l'onglet **Environment** du service web. `ADMIN_EMAILS` ne compte qu'une fois l'adresse confirmée, donc seulement avec Resend.

Autres réglages du service web :

- forex, or et Nasdaq : `TWELVEDATA_API_KEY`, et `DATABENTO_API_KEY` pour NAS100 ;
- e-mails (confirmation d'adresse, mot de passe oublié, lien de connexion) : `RESEND_API_KEY` et `EMAIL_FROM` ;
- Google : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, avec l'adresse de retour `https://<ton-domaine>/api/auth/callback/google` déclarée chez Google ;
- ton propre domaine : `BETTER_AUTH_URL=https://ton-domaine` et `SITE_URL=https://ton-domaine` ;
- plafond de traductions IA par jour pour tout le site : `AI_DAILY_CAP` (200 par défaut). Fixe aussi une limite de dépense sur console.anthropic.com.

Pour plus de calcul, augmente le nombre d'instances du worker : la file distribue les backtests entre elles.

## Offres et quotas

Définis dans `src/lib/plans.ts` :

| Offre | Prix | Backtests / mois | Traductions IA / mois | Unité minimale | Tests simultanés |
|---|---|---|---|---|---|
| Découverte | gratuit | 5 | 3 | 1h | 1 |
| Trader | 15 € / mois | 100 | 50 | 1m | 2 |
| Pro | 39 € / mois | 1 000 | 400 | 1m | 3 |

L'unité minimale s'applique aussi au suivi d'une stratégie sur la page Live. L'IA est aussi limitée à 5 traductions par minute et par compte, et à `AI_DAILY_CAP` par jour pour tout le site. Le paiement (Stripe) n'est pas encore branché : pour changer l'offre d'un compte, mets la ligne `plans` à jour en base. La page `/tarifs` compte les intérêts pour chaque offre.

## Sécurité

- Les réponses de l'API ne sont jamais mises en cache (`Cache-Control: private, no-store`).
- Toute requête qui modifie quelque chose doit venir des pages du site (contrôle de l'en-tête `Origin` dans `src/proxy.ts`).
- En-têtes de sécurité (CSP, HSTS, etc.) dans `next.config.ts`.
- Limites par minute sur les routes coûteuses, et quota de téléchargement des cours par fournisseur.
- Les erreurs inattendues renvoient un message générique avec une référence ; le détail reste dans les logs du serveur.

## Tests

```bash
npm test
npx tsc --noEmit
npm run lint
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/lib/engine` | Moteur : indicateurs, évaluation des règles, simulation des trades, statistiques, analyse, robustesse, prop firm. Pur TypeScript, sans dépendance serveur. |
| `src/lib/strategy` | Format des stratégies (schéma Zod partagé avec l'IA), libellés, modèles. |
| `src/lib/server` | Postgres, comptes, quotas, file de calcul, bougies partagées (un bloc compressé par mois), fournisseurs de données, appel à Claude. |
| `src/worker` | Le processus qui calcule les backtests de la file. |
| `db/schema.sql` | Tables de l'application ; `scripts/migrate.ts` les crée avec celles de la connexion. |
| `src/app/api` | Routes API. |
| `src/proxy.ts` | Contrôle de l'origine des requêtes de l'API. |
| `src/components` | Interface. |

## Prochaines étapes prévues

- Paiement des offres avec Stripe.
- Envoi des e-mails avec Resend (confirmation d'adresse, mot de passe oublié).
- Alertes de signal (Telegram ou e-mail), déjà prévues dans les offres.
- Optimisation de paramètres avec validation glissante (walk-forward).
