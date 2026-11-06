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

Dans **Patch notes**, remplir les rubriques souhaitées, une entrée par ligne. Les rubriques vides sont omises. L’aperçu conserve les sauts de ligne Discord. La date utilise `Europe/Paris` ; la première version est `v1.0.0`, puis le dernier numéro augmente à chaque publication réussie (`v1.0.1`, etc.). Le message est limité à 2 000 caractères. Chaque nouveau patch note mentionne uniquement le rôle `1568307263695749201`. Les nouveaux giveaways, créés depuis le panel ou `/giveaway`, mentionnent uniquement le rôle `1568307516197179534`. Les autres mentions contenues dans le texte ne déclenchent pas de notification de rôle ou @everyone. Pour notifier ces rôles, ils doivent être mentionnables ou le bot doit disposer du droit Discord de mentionner tous les rôles dans ces salons. Les notes apparaissent également sur le site public. Une version devenue obsolète est refusée pour éviter deux publications concurrentes avec le même numéro.

### Accès au panel

Le propriétaire Discord a toujours tous les droits. Lors de la première configuration, lui seul peut ouvrir **Accès & rôles**. L’ancien rôle défini par `/setup` conserve les fonctionnalités opérationnelles jusqu’à l’enregistrement de la matrice des rôles. Après cet enregistrement, seuls les rôles explicitement configurés donnent accès au panel ; leurs permissions s’additionnent. Une liste vide réserve l’accès au propriétaire. Les rôles sont vérifiés sur Discord à chaque requête, même si la session existe déjà. L’enregistrement ne modifie que les rôles édités ; les permissions des autres rôles sont conservées. Les changements non enregistrés sont préservés lors d’un changement d’onglet. Après une mise à jour, utiliser Ctrl+F5 : les anciens formulaires qui remplacent toute la matrice sont refusés pour protéger les autres rôles.

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

### Éditeur de rôles ACCÈS V3

Dans Accès & rôles, sélectionner le rôle dans « Rôle à modifier ». Un seul rôle est affiché à la fois. Chaque rôle possède ses propres boutons « Enregistrer ce rôle » et « Retirer ce rôle ». Ces boutons envoient une requête dédiée à son identifiant ; les requêtes groupées sont refusées. Les cases des autres rôles ne sont pas modifiées. Le retrait concerne uniquement l’accès au panel, pas la suppression du rôle sur Discord.

Après déploiement, le texte « ACCES V3 » doit être visible sous l’éditeur. Les fichiers admin ne sont plus mis en cache par l’application et le script possède une URL versionnée.

## Page de connexion staff

Le lien « Panel staff » ouvre `/staff` : page dédiée avec fond bleu nuit, carte de connexion centrale, logos STØRM et bouton Discord. Les visiteurs non connectés arrivant directement sur le panel sont renvoyés sur cette page. La vérification des rôles côté serveur reste obligatoire ; la page ne donne aucun droit supplémentaire. Un compte déjà autorisé peut accéder au panel depuis le même bouton.

Les liens des deux logos fournis sont dans `public/branding.json`. Au démarrage, l’application tente de télécharger et vérifier les PNG pour les conserver dans `public/assets/storm-round.png` et `public/assets/storm-wordmark.png`. Une copie existante est réutilisée. Une erreur de téléchargement ne bloque pas le bot ou le site. Le navigateur utilise les images locales en priorité, puis les liens Discord. Les liens Discord étant temporaires, conserver les copies locales ; il est aussi possible de déposer manuellement les PNG originaux à ces deux chemins.

Pour déployer cette page, transférer les dossiers `src/` et `public/` complets, notamment `src/branding.js`, `public/branding.json` et les fichiers `public/staff.*`. Redémarrer ensuite l’application. Les logos réels doivent être contrôlés sur Gamost ; le CDN Discord est refusé par le réseau de l’environnement de développement.

## Identité visuelle du panel

Le panel reprend les logos de `public/branding.json`, avec priorité aux copies locales déjà téléchargées. Le logo horizontal apparaît dans la navigation ; le logo rond apparaît dans le dashboard et la carte de statut. `public/admin-theme.css` contient le thème bleu nuit et les adaptations mobiles, sans modifier le site public. `public/admin-branding.js` charge les logos et conserve une alternative textuelle si les images sont indisponibles.

Le dashboard affiche le nom du staff, la connexion Discord, l’heure de dernière actualisation (Paris), les raccourcis autorisés et les cinq dernières annonces/patch notes accessibles selon ses permissions. Les autorisations et l’éditeur ACCÈS V3 restent inchangés. Transférer le dossier `public/` complet pour inclure les nouveaux fichiers de thème et de logos du panel.

## Pages communautaires et nouveaux outils staff

Les nouvelles pages publiques sont accessibles depuis l’accueil :

| Page | Adresse |
| --- | --- |
| Suivi du développement | `/developpement` |
| Règlement | `/reglement` |
| Présentation et captures | `/serveur` |
| Questions fréquentes | `/faq` |
| Candidatures staff et suivi privé | `/candidatures` |

Dans **Pages publiques**, l’équipe autorisée modifie les étapes et leur statut, les règles, la présentation, les particularités du serveur, la FAQ, les liens HTTPS des captures et l’ouverture des candidatures. Les textes initiaux sont des bases éditables. Aucune image de gameplay ni date d’ouverture n’a été inventée : ajouter les véritables captures et informations depuis cet écran. Une sauvegarde obsolète est refusée si un autre membre a publié un changement entre-temps.

### Candidatures

Une connexion Discord et l’appartenance au serveur sont nécessaires pour candidater. Le formulaire demande la motivation, l’expérience, les disponibilités et l’acceptation du règlement. Une candidature active par compte ; délai de 24 heures entre les envois. Les réponses sont visibles uniquement par les responsables disposant du droit **Étudier les candidatures staff**. Le candidat voit uniquement ses propres statuts et les retours qui lui sont adressés. Les décisions possibles sont « En cours d’étude », « Acceptée » et « Refusée » ; les décisions finales demandent un retour écrit. Accepter une candidature ne modifie pas automatiquement les rôles Discord.

### Fiches membres, journal et statistiques

**Fiches membres** recherche un pseudo (10 résultats maximum) ou un identifiant Discord. Le droit associé permet de lire les avertissements, les sanctions et les résumés des tickets/contestations. L’ouverture de la conversation elle-même exige toujours le droit Tickets. L’historique local d’un ancien membre reste consultable par son identifiant.

**Journal** enregistre les écritures réussies du panel, y compris les modifications des accès, les décisions de recrutement, les pages, les brouillons, les sanctions et les publications. Les annonces et créations de giveaways depuis les commandes Discord sont également enregistrées. Il conserve les 5 000 dernières actions, avec recherche sur les 200 premières correspondances. Il commence au déploiement de cette version et ne reconstruit pas les anciennes actions. Les corps privés des formulaires et les secrets ne sont jamais copiés dans ce journal.

**Statistiques** affiche les dossiers ouverts, ceux sans première réponse du staff, le délai moyen de première réponse, le délai moyen de clôture et les ouvertures/clôtures par jour sur 7 ou 30 jours (Paris). Les messages du bot ne comptent pas comme réponses du staff. Les moyennes affichent leur nombre de dossiers mesurés ; sans mesure disponible, elles restent indiquées comme absentes. Les anciens dossiers sans horodatage exploitable ne produisent pas de délai inventé.

### Brouillons et validation

Les éditeurs Annonces et Patch notes permettent d’enregistrer un brouillon. Le cycle est : brouillon → soumission → validation par un responsable → publication. Les corrections demandées renvoient le contenu en brouillon. Une modification d’un contenu validé retire sa validation ; les versions obsolètes sont refusées. Un auteur ne peut pas valider son propre contenu, sauf le propriétaire. Une publication utilise le contenu enregistré et validé, et ne peut être republiée depuis le même brouillon. Les mentions de rôle et les salons précédemment configurés sont conservés.

Pour les annonces et patch notes du panel, les rédacteurs sans droit de validation passent par ce cycle. Le propriétaire et les responsables disposant de **Valider les publications** peuvent publier directement, s’ils disposent aussi de la permission de publication correspondante. Ce cycle ne change pas les autorisations natives des commandes Discord.

Le propriétaire attribue les nouveaux droits dans **Accès & rôles** : pages publiques, candidatures, fiches membres, journal, statistiques, rédaction et validation des brouillons. Les rôles déjà configurés explicitement ne reçoivent pas automatiquement ces droits supplémentaires.

### Déploiement et données

Transférer les dossiers `src/` et `public/` complets, puis redémarrer et recharger le navigateur. Aucune nouvelle dépendance n’est nécessaire. Garder `.env`, `data/` et les logos locaux. Les nouvelles données sont ajoutées à `data/state.json` sans supprimer les tickets, annonces ou sanctions existants. Sauvegarder ce dossier régulièrement, notamment avant une mise à jour.

Les candidatures, contenus éditoriaux et brouillons ne sont pas purgés automatiquement ; les limites sont respectivement 2 000 candidatures et 1 000 brouillons, avec refus d’un nouvel enregistrement au-delà plutôt que suppression silencieuse. Ces limites conviennent à un petit serveur ; prévoir un stockage dédié et une politique d’archivage pour un usage plus important.
