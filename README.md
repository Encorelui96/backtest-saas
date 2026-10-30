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

Il faut Node.js 22 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis colle ta clé ANTHROPIC_API_KEY si tu en as une
npm run dev
```

Ouvre http://localhost:3000.

Les bougies téléchargées sont gardées dans `data/app.db` : le premier test d'un symbole prend quelques secondes (jusqu'à une minute en 1m), les suivants sont immédiats.

## Tests

```bash
npm test
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/lib/engine` | Moteur : indicateurs, évaluation des règles, simulation des trades, statistiques, robustesse, prop firm. Pur TypeScript, sans dépendance serveur. |
| `src/lib/strategy` | Format des stratégies (schéma Zod partagé avec l'IA), libellés, modèles. |
| `src/lib/server` | Données Binance et cache SQLite, stratégies et backtests enregistrés, appel à Claude. |
| `src/app/api` | Routes API. |
| `src/components` | Interface. |

## Prochaines étapes prévues

- Forex : ajouter un fournisseur de données (Twelve Data, OANDA…) à côté de Binance.
- Comptes utilisateurs et abonnements (Stripe). Les tables ont déjà une colonne `user_id`.
- Optimisation de paramètres avec validation glissante (walk-forward).
