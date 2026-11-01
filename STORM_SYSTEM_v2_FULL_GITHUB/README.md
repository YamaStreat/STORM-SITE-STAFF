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
