# STØRM SYSTEM v2 — Discord + Site Web

Un seul projet Node.js lance :
- le bot Discord STØRM SYSTEM ;
- les tickets 100 % DM avec salon staff miroir ;
- le site public STØRM PVP ;
- le panel staff sécurisé par connexion Discord ;
- annonces Discord + site ;
- giveaways ;
- annonces streams ;
- statut FiveM « En cours de développement », puis online/offline quand tu l'activeras.

## Installation Gamost (mise à jour de ton bot actuel)

1. SAUVEGARDE ton `.env` et ton dossier `data/` actuel.
2. Décompresse le ZIP à la racine, en remplaçant les fichiers du projet.
3. Ne remplace pas ton `.env` existant par `.env.example`.
4. Ajoute les nouvelles lignes de `.env.example` à ton `.env`.
5. Dans la console : `npm install`
6. Main file : `src/index.js`
7. Redémarre le serveur.

## OAuth Discord pour le panel staff

Dans Discord Developer Portal > OAuth2 :
- ajoute comme Redirect URL : `TON_PUBLIC_URL/auth/discord/callback`
- récupère le Client Secret et mets-le dans `DISCORD_CLIENT_SECRET`.

Le staff autorisé est le rôle défini avec `/setup staff_role:@TonRole`.
Le propriétaire du serveur Discord est également accepté.

## URL publique

Gamost doit exposer le port `PORT` de ton application Node.js via une URL HTTP/HTTPS. Mets cette URL exacte dans `PUBLIC_URL`.

## FiveM

Laisse le statut `En cours de développement` activé dans le panel tant que le serveur n'est pas ouvert.
Plus tard, désactive-le et renseigne `FIVEM_STATUS_URL` (par exemple `http://IP:PORT/info.json`) pour online/offline.

## Sécurité GitHub

`.env` est ignoré par Git. Ne publie jamais : token Discord, Client Secret, Session Secret, clé Cfx.re, mots de passe ou clés API.

## Panel staff : publications et modération

Après mise à jour, redémarrer `npm start` et recharger le navigateur. Aucun service ou dépendance supplémentaire n’est nécessaire.

Les destinations sont imposées côté serveur, depuis le panel comme pour `/annonce` et `/giveaway` :

| Publication | Salon Discord |
| --- | --- |
| Annonces | `1564691828312375449` |
| Giveaways | `1568295438610858024` |
| Statut de développement | `1564691848222613644` |
| Patch notes | `1564739753222475807` |

Dans **Serveur**, enregistrer le statut publie ou actualise le même message Discord. Le bouton de publication permet aussi de synchroniser le statut déjà enregistré. Le bot doit pouvoir voir le salon, envoyer des messages et lire l’historique pour retrouver son message.

Dans **Patch notes**, remplir les rubriques souhaitées, une entrée par ligne. Les rubriques vides sont omises. L’aperçu conserve les sauts de ligne Discord. La date utilise `Europe/Paris` ; la première version est `v1.0.0`, puis le dernier numéro augmente à chaque publication réussie (`v1.0.1`, etc.). Le message est limité à 2 000 caractères. Les notes apparaissent également sur le site public. Une version devenue obsolète est refusée pour éviter deux publications concurrentes avec le même numéro.

### Accès au panel

Le propriétaire Discord a toujours tous les droits. Lors de la première configuration, lui seul peut ouvrir **Accès & rôles**. L’ancien rôle défini par `/setup` conserve les fonctionnalités opérationnelles jusqu’à l’enregistrement de la matrice des rôles. Après cet enregistrement, seuls les rôles explicitement configurés donnent accès au panel ; leurs permissions s’additionnent. Une liste vide réserve l’accès au propriétaire. Les rôles sont vérifiés sur Discord à chaque requête, même si la session existe déjà.

Le droit **Configurer les accès staff** permet de déléguer tous les droits ; le réserver aux responsables. Les permissions du panel contrôlent les tickets, annonces, giveaways, streams, patch notes, statut et chaque famille de sanction. Elles ne modifient pas les permissions Discord des rôles ni les permissions des commandes slash existantes.

### Modération

Le panel permet de bannir, débannir, expulser, avertir, appliquer ou retirer un mute temporaire (timeout Discord, de 1 minute à 28 jours). Saisir l’identifiant du membre et un motif, puis confirmer. Le staff doit avoir la permission native Discord correspondante et être au-dessus du membre ciblé. Le bot doit aussi disposer des permissions et du rang nécessaires. Le propriétaire, le bot et soi-même sont protégés. Le débannissement exige la permission Discord de bannissement ; le membre étant absent, il n’a pas de rôle à comparer.

Les actions réussies sont conservées dans un journal (1 000 dernières entrées ; les 100 plus récentes sont affichées). Un avertissement est enregistré même si le membre refuse les DM. Données et messages publiés restent dans `data/state.json` ; les accès sont dans `data/config.json`. Sauvegarder ce dossier.

### Validation locale

```sh
npm run check
node --check src/panel.js
node --check public/admin.js
node --check public/app.js
node --test test/*.test.js
```

Les tests utilisent un client Discord simulé et des requêtes HTTP locales : aucun vrai message, aucune sanction, aucune modification des données de production. Le bot réel exige toujours les variables documentées plus haut. `PUBLIC_URL` doit correspondre à l’origine du navigateur et au callback OAuth pour les opérations du panel.
