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

Une connexion Discord et l’appartenance au serveur sont nécessaires pour candidater. Le formulaire demande la motivation, l’expérience, les disponibilités et l’acceptation du règlement. Une candidature active par compte ; aucun délai après une décision finale, pour permettre les tests et une nouvelle candidature immédiate. Les réponses sont visibles uniquement par les responsables disposant du droit **Étudier les candidatures staff**. Le candidat voit uniquement ses propres statuts et les retours qui lui sont adressés. Les décisions possibles sont « En cours d’étude », « Acceptée » et « Refusée » ; le retour écrit est facultatif. Accepter une candidature ne modifie pas automatiquement les rôles Discord.

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

## Règlement FiveM / Discord et recrutements par poste

Le règlement STØRM comporte 18 sections : respect, sécurité et vie privée sur Discord ; salons, publicité et vocaux ; combat PVP, triche, bugs, zones protégées, véhicules, déconnexions et événements sur FiveM ; preuves, sanctions, contestations et neutralité du staff. Il est organisé en quatre rubriques sur `/reglement`. Le modèle générique initial est remplacé automatiquement s’il n’a pas été personnalisé. Les règles déjà personnalisées sont conservées ; dans **Pages publiques**, le bouton **Charger le règlement FiveM & Discord** permet de charger le nouveau modèle dans l’éditeur avant publication.

### Ouvrir Helpeur ou Animateur

Dans **Candidatures**, un responsable disposant du nouveau droit **Ouvrir, fermer et annoncer les recrutements** ouvre ou ferme séparément **Helpeur** et **Animateur**. Le formulaire public n’accepte que les postes ouverts et vérifie à nouveau leur disponibilité au moment d’enregistrer la candidature.

- Salon des annonces d’ouverture : `1568410724605239326`.
- Salon des résultats : `1568419705893687459`.
- Rôle mentionné lors d’une ouverture ou d’une nouvelle annonce volontaire : `1564827474099966103`.
- L’annonce affiche les deux états et les liens directs `/candidatures?type=helper` et `/candidatures?type=animator` pour les postes ouverts.
- La première sauvegarde des réglages synchronise l’annonce, même lorsque l’ancien recrutement général était déjà ouvert.
- Une sauvegarde sans changement ne renvoie pas inutilement l’annonce. **Renvoyer l’annonce actuelle** permet une nouvelle publication volontaire.
- Une fermeture est annoncée sans mentionner le rôle. Si Discord est indisponible, une fermeture seule reste appliquée au site, avec un avertissement dans le panel. Une ouverture qui ne peut pas être annoncée est refusée et doit être retentée.

Les réglages d’ouverture ont leur propre version et ne sont plus modifiables indirectement par la sauvegarde des pages publiques. Le texte d’accueil reste éditable dans Pages publiques. Le bot doit pouvoir voir le salon et y envoyer des messages ; pour notifier le rôle, celui-ci doit être mentionnable ou le bot doit avoir la permission Discord correspondante. `PUBLIC_URL` doit contenir l’adresse publique courante du site, notamment après un changement de tunnel.

### Formulaire et notifications

La candidature demande le poste, la motivation, l’expérience, les disponibilités, une estimation du nombre d’heures par semaine et une mise en situation adaptée au rôle. Le compte Discord est vérifié, le règlement doit être accepté, et la limite d’une candidature active par compte reste applicable. Les anciennes candidatures générales sont conservées et restent traitables.

Un MP est tenté à la réception et à la prise en charge. Les MP d’acceptation ou de refus sont envoyés uniquement avec la publication explicite des résultats. Chaque message comporte le poste, la référence du dossier et le lien du suivi ; les décisions incluent le retour privé du staff. Les messages trop longs sont découpés. Un échec de MP ne supprime jamais la candidature ni la décision. Le panel affiche le statut du dernier MP et permet de le retenter. Le suivi privé sur le site reste disponible si le candidat refuse les MP.

### Résultats groupés

Cliquer sur **Accepter** ou **Refuser** prépare la décision et retire le dossier de la liste **À traiter**, sans MP ni annonce Discord. Le panneau **Publier les résultats en attente** affiche les noms, identifiants et postes, séparés en acceptés et refusés. Les candidats ne voient pas cette décision préparée avant publication. Le retour au candidat est facultatif.

Le bouton **Publier** envoie uniquement les décisions affichées et sélectionnées lors du clic : une annonce groupée dans `1568419705893687459`, puis un MP individuel avec le retour privé. Il n’existe plus de publication automatique au démarrage ou chaque minute. Les annonces d’ouverture restent dans `1568410724605239326` avec le rôle précédemment configuré.

Les envois confirmés sont mémorisés. En cas d’échec, un nouveau clic reprend le traitement sans republier les annonces confirmées. Les MP échoués restent visibles dans les résultats en attente avec l’indication « Annonce déjà envoyée · MP à retenter ». La publication d’une ancienne liste devenue obsolète est refusée et demande de recharger l’aperçu. Les motifs ne sont jamais affichés dans l’annonce publique. La file et les états d’envoi restent dans `data/state.json` et sont conservés au redémarrage, sans déclencher d’envoi.

Le délai de 24 heures a été retiré. Une seule candidature à traiter par compte reste autorisée : après une acceptation ou un refus préparé, il est possible de candidater de nouveau immédiatement. Aucun rôle staff n’est attribué automatiquement. Les tests utilisent Discord simulé ; vérifier les permissions du bot et les liens publics sur Gamost avant la première annonce réelle.

## Catégories du panel et annonces Discord illustrées

Le menu est organisé en six catégories : **Vue d’ensemble**, **Support & joueurs**, **Modération**, **Publications**, **Recrutements**, **Configuration**. Les catégories dont aucun outil n’est autorisé sont masquées ; chaque bouton conserve sa vérification de permission. Sur mobile, les catégories restent séparées dans la navigation horizontale.

Les annonces d’ouverture des recrutements et le message de statut du serveur utilisent désormais un embed aux couleurs STØRM, le logo rond, le logo horizontal et des boutons vers les pages utiles. L’ouverture détaille chaque poste, ses missions, les conditions de candidature et le suivi, en conservant le salon et la mention du rôle configurés. Le message de développement distingue clairement la préparation du serveur de sa disponibilité réelle ; désactiver le mode développement n’annonce pas une disponibilité FiveM non vérifiée.

Les PNG locaux `public/assets/storm-round.png` et `public/assets/storm-wordmark.png` sont joints aux messages lorsque disponibles, pour que leurs images restent hébergées dans Discord. Si une copie locale manque, les liens d’origine sont utilisés. Le bot doit disposer des permissions **Intégrer des liens** et **Joindre des fichiers** dans les salons concernés. Conserver les fichiers de `public/assets/` pendant la mise à jour.

Pour actualiser un ancien message : utiliser **Renvoyer l’annonce actuelle** dans Candidatures et **Publier / actualiser le message Discord** dans Serveur. Le message de statut existant est modifié sans doublon ; ses anciennes pièces jointes sont remplacées à chaque actualisation.

## Bienvenue et acceptation du règlement

Le bot publie ou actualise au démarrage :

- Un message d’accueil avec les logos STØRM dans `1564691566722031767`.
- Le règlement complet dans `1564691736893202473`, réparti en plusieurs messages pour respecter les limites Discord. Le dernier contient **J’accepte le règlement**.

À chaque arrivée d’un membre humain, il attribue le rôle d’attente `1569015388514164822`, puis envoie un message de bienvenue personnalisé. L’acceptation du bouton officiel attribue d’abord le rôle membre `1564827474099966103`, puis retire le rôle d’attente. Si l’attribution échoue, le rôle d’attente n’est pas retiré. En cas d’échec partiel, le membre peut cliquer de nouveau. Un bouton copié, ancien ou utilisé dans un autre salon/serveur ne donne aucun rôle.

**À configurer avant de redémarrer :** dans Discord Developer Portal → application → Bot → Privileged Gateway Intents, activer **Server Members Intent**. Le code demande maintenant cet intent pour recevoir les arrivées. Le bot doit avoir **Gérer les rôles** et son rôle doit être placé au-dessus des deux rôles concernés. Dans les salons d’accueil et de règlement, autoriser Voir le salon, Lire l’historique, Envoyer des messages, Intégrer des liens et Joindre des fichiers. Le rôle d’attente doit pouvoir voir le règlement et cliquer sur ses boutons ; configurer les accès aux autres salons selon le rôle membre souhaité.

La commande administrateur **`/accueil`** publie ou actualise ces messages à la demande, sans dépendre de `/setup`. Les identifiants des messages sont conservés dans `data/state.json` et réutilisés après redémarrage pour éviter les doublons. Les règles personnalisées enregistrées dans Pages publiques sont utilisées ; sinon, le règlement FiveM/Discord détaillé par défaut est publié. Après une modification du règlement ou des logos, `/accueil` permet de les synchroniser.

Cette mise à jour ne distribue pas rétroactivement de rôle d’attente à tous les membres existants. Ils peuvent accepter le règlement via le bouton officiel. Les tests utilisent des membres et messages simulés ; le premier envoi réel aura lieu au démarrage du bot sur Gamost.
