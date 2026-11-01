# Multicord

Première version fonctionnelle d’une application communautaire : serveurs, salons, messages en temps réel et appels hébergés par les participants. Interface française anthracite / sauge, responsive, avec illustration originale générée.

## Démarrer sous Windows

Prérequis : **Node.js 24 LTS** (SQLite intégré). Double-cliquer sur **Lancer Multicord.cmd**, ou :

```powershell
npm install
npm run dev
```

Ouvrir **http://localhost:3000**. Le serveur doit rester lancé. C’est une application web locale ; cette version ne fournit pas d’installateur `.exe`.

L’accueil propose une inscription et une connexion par e-mail et mot de passe. Aucun compte invité ni serveur de démonstration n’est créé automatiquement. Un nouveau compte arrive dans un espace vide pour créer ou rejoindre ses communautés. Les comptes restent sur cette instance de Multicord.

La création est limitée à **5 serveurs possédés par compte**, avec un contrôle transactionnel côté serveur qui résiste aux requêtes simultanées. Rejoindre un serveur d’un autre utilisateur ne consomme pas ce quota.

Le parcours **mot de passe oublié** fonctionne actuellement en mode local : les e-mails sont enregistrés dans `data/mail`, sans envoi sur internet. Voir [le guide des comptes et de récupération](docs/COMPTES.md).

## Fonctionnalités livrées

- **Amis et messages privés** : pseudos libres avec identifiant unique `Pseudo#E12K`, demandes d’ami, acceptation/refus, présence, conversations persistantes en temps réel, non-lus et blocage. Voir [le guide](docs/AMIS-ET-MESSAGES.md).

- Création de serveurs privés (5 maximum par propriétaire) et adhésions persistantes. Invitations par **code de 8 caractères** (lettres majuscules/minuscules et chiffres, sans 0/O/1/l/I) ou par lien `https://…/invite/CODE`. Ouvert dans un navigateur, le lien propose d’ouvrir l’application Windows (`multicord://invite/CODE`, protocole déclaré par l’installateur) ou de continuer sur le web. Définir `PUBLIC_URL` dans `.env` pour que les liens utilisent le domaine public plutôt que l’adresse locale.
- Salons texte / vocaux ; création réservée au propriétaire du serveur.
- Messages persistants, diffusion Socket.IO, recherche serveur (messages de tous les salons et membres), messages épinglés (droit « Épingler des messages »), indicateur de saisie, compteur des nouveaux messages, emojis et mentions textuelles.
- Profil, inscription, connexion, déconnexion, changement de mot de passe et récupération par lien de 30 minutes à usage unique ; mots de passe bcrypt et sessions HttpOnly. La réinitialisation invalide les anciennes sessions.
- Vocal WebRTC en étoile : audio, caméra, partage d’écran, micro coupé, son reçu coupé, arrivée/départ des participants. Cliquer un salon vocal ouvre la vue d’appel (tuiles des participants, discussion du salon vocal) ; on peut naviguer dans les autres salons sans quitter l’appel, et le bandeau « Connexion vocale » ramène à l’appel. Dans l’application Windows, micro, caméra et capture d’écran sont accordés sans fenêtre de confirmation pour le serveur Multicord connecté.
- **Le créateur de la session d’appel (premier participant à rejoindre un salon vide) devient l’hôte**, même s’il n’est pas le propriétaire du serveur. Son navigateur reçoit et retransmet les flux aux invités. Les médias ne passent pas par le serveur Node. Le départ ou la déconnexion de l’hôte termine l’appel. Limite initiale : huit participants, à ajuster selon la connexion et le matériel de l’hôte.
- Thème original et vues mobile / bureau. Visuel : `public/orbit-banner.png`, prompt dans `docs/IMAGE-PROMPT.md`.

## Quelle base de données gratuite ?

**Recommandation cible : PostgreSQL.** Les relations utilisateurs / communautés / adhésions / salons / messages s’y prêtent bien ; transactions, index et intégrité référentielle facilitent la croissance. PostgreSQL est libre et gratuit. Son hébergement n’est pas automatiquement gratuit : [licence officielle](https://www.postgresql.org/about/licence/).

**Pour démarrer sans administration : Supabase Free**, qui fournit PostgreSQL hébergé. Au 31 octobre 2026, la page tarifaire annonce notamment 500 Mo de base par projet pour l’offre gratuite ; quotas, suspension d’inactivité et limites doivent être vérifiés avant ouverture publique : [tarifs officiels](https://supabase.com/pricing). Le gratuit ne doit pas être considéré comme illimité.

Cette version utilise **SQLite par défaut** pour être utilisable immédiatement, gratuitement et sans compte cloud. Le même dépôt prend aussi en charge PostgreSQL grâce à l’adaptateur `server/db.js` :

```powershell
Copy-Item .env.example .env
docker compose up -d
```

Dans `.env`, ajouter (mot de passe de développement local du compose) :

```dotenv
DATABASE_URL=postgresql://multicord:multicord-local-dev@localhost:5432/multicord
```

Puis relancer `npm run dev`. Pour Supabase, utiliser la chaîne de connexion serveur fournie par le projet ; conserver les paramètres SSL recommandés par Supabase. Ne pas désactiver la validation des certificats. L’URL ne doit jamais être exposée au client. Les tables sont initialisées au lancement. **Le changement d’URL crée une base distincte ; les données SQLite ne sont pas migrées automatiquement.** L’adaptateur PostgreSQL a été vérifié sur une instance Aiven réelle, en lecture/écriture et avec TLS 1.3.

### Configuration Aiven active

L’instance locale est désormais configurée avec PostgreSQL Aiven via `.env` (ignoré par Git), avec la CA dans `data/aiven-ca.pem` (également ignorée). `DATABASE_SSL_CA_FILE` active la vérification complète du certificat et du nom d’hôte ; `DATABASE_POOL_MAX=5` laisse des connexions disponibles pour la console sur les 15 de cette instance. Aucun identifiant n’est inclus dans le code client.

Les données SQLite ont initialement été transférées vers Aiven. À la demande de l’utilisateur, les deux anciens serveurs et les profils de démonstration ont ensuite été retirés ; une sauvegarde privée des anciens serveurs se trouve dans `data/backups`. Les comptes réels restent présents. Le fichier SQLite historique est également conservé intact. Les modifications effectuées après la bascule sont enregistrées dans Aiven ; les deux bases ne se synchronisent pas.

Pour réutiliser l’outil de migration sur une autre destination déjà initialisée, **arrêter l’application avant** puis lancer :

```powershell
node --env-file=.env scripts/migrate-sqlite.js
```

L’outil importe dans une transaction PostgreSQL, laisse la source en lecture seule et n’écrase pas les lignes déjà présentes. Ne pas réimporter le fichier SQLite historique après le nettoyage des serveurs : cela restaurerait les anciens serveurs. La copie historique est une sauvegarde, pas une source à synchroniser.

La console Aiven consultée affiche le niveau **Developer** et un essai de plateforme de 30 jours. Cette configuration ne constitue pas une confirmation de gratuité permanente. Le forfait [Free officiel](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier) est distinct et doit être sélectionné si l’objectif est de rester gratuit ; aucune modification d’abonnement n’a été effectuée.

## Appels sur internet

Le créateur héberge les médias, mais un serveur central reste nécessaire pour l’authentification, la messagerie et la signalisation. Tous les utilisateurs doivent ouvrir **la même instance** : deux installations locales indépendantes ne communiquent pas.

- `localhost` autorise l’accès aux périphériques pendant le développement. Sur une adresse LAN ou un domaine, fournir **HTTPS** pour le micro, la caméra et le partage d’écran.
- Les liens d’invitation utilisent `PUBLIC_URL` (sinon l’origine courante). Un lien `localhost` ne fonctionne que sur la machine de celui qui l’ouvre : définir `PUBLIC_URL` avec le domaine HTTPS public pour inviter des personnes à distance.
- STUN Google est configuré. Certains NAT / pare-feu imposent un relais **TURN**. Configurer `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` dans `.env`. Un serveur coturn auto-hébergé n’a pas de coût de licence, mais sa bande passante et son hébergement peuvent coûter de l’argent. Les identifiants TURN transmis aux clients doivent être temporaires en production ; la version 1.0 prend des identifiants statiques.
- Le débit montant et les ressources de l’hôte limitent le nombre de participants. Le relais s’effectue dans le navigateur de l’hôte ; l’hôte a donc accès aux médias des invités. Ne pas revendiquer un chiffrement de bout en bout excluant l’hôte.
- Les appels ne sont pas enregistrés. Si l’hôte quitte l’appel ou perd la connexion, les participants se reconnectent automatiquement et l’un d’eux devient le nouvel hôte.

## Préparer un déploiement

```powershell
npm run build
npm start
```

Configurer un reverse proxy HTTPS avec support WebSocket, `APP_ORIGIN` égal à l’origine publique exacte, un volume durable pour `data/` ou une base PostgreSQL, et un service TURN pour les réseaux restrictifs. Le port par défaut est 3000. Les cookies deviennent Secure lorsque `APP_ORIGIN` commence par `https:`.

Le backend est conçu pour **un seul processus** : présences et appels en mémoire. Plusieurs instances nécessiteront un adaptateur Socket.IO partagé et un état de session vocal partagé.

Avant une ouverture publique à grande échelle, restent à prévoir : e-mail vérifié, envoi SMTP réel pour la récupération, expiration des invitations, stockage objet pour les pièces jointes (elles sont aujourd’hui en base, 5 Mo maximum chacune), historique des salons paginé (100 derniers messages) et identifiants TURN temporaires. La version 1.0 n’est pas un remplacement complet de Discord.

## Passage aux serveurs média dédiés

Garder PostgreSQL pour les données et Node / Socket.IO pour le contrôle. Remplacer le transport `VoiceSession` par un **SFU** (par exemple LiveKit ou mediasoup) derrière une interface de session. Il faudra déployer ce service, créer des jetons d’accès serveur et gérer les permissions des salons ; cette migration est préparée par la séparation du code, mais n’est pas implémentée. La base de données ne doit pas transporter les flux audio/vidéo.

## Vérifications

```powershell
npm test
npm run build
```

Les tests utilisent une base temporaire et un vrai serveur HTTP / Socket.IO. Le parcours complet peut également être testé sur Aiven dans un schéma temporaire isolé et supprimé à la fin : `node --env-file=.env --test tests/integration.test.js` avec `TEST_POSTGRES=1` dans l’environnement. Ils couvrent les sessions, les accès privés, les invitations, l’envoi et la persistance des messages, la signalisation vocale, le départ de l’hôte, l’inscription, la connexion, les quotas de propriété, les liens de récupération, la révocation des sessions et le rejet des origines étrangères.

Pour vérifier les médias dans un navigateur sans utiliser le micro / la caméra réels, lancer une instance de développement isolée :

```powershell
$env:PORT='3001'
$env:SQLITE_PATH='data/media-test.db'
npm run dev
```

Ouvrir **http://127.0.0.1:3001/tests/media.html**, puis « Tester audio et vidéo à trois ». Utiliser `127.0.0.1` évite de partager les cookies du site `localhost`. Ce diagnostic génère des tons et des vidéos canvas, crée trois sessions WebRTC réelles, vérifie paquets audio et images vidéo décodées, la coupure/réactivation de caméra, un partage synthétique, les départs et le relais par l’hôte. Il n’est pas inclus dans la compilation de production. Il ne remplace pas une validation sur plusieurs appareils et réseaux, ni les essais matériels du micro, de la caméra et du sélecteur de partage d’écran.

La négociation WebRTC suit le schéma [Perfect negotiation de MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).

## Personnalisation et volume vocal

La page Paramètres propose compte, sécurité, appareils connectés, confidentialité, permissions de messagerie, notifications, voix/vidéo, apparence et accessibilité. Le bouton de déconnexion reste visible. Les réglages du compte sont persistants ; les volumes individuels et les périphériques sont mémorisés localement par compte.

Pendant un appel, cliquer sur un participant ou sur **Volume des participants** pour régler sa voix de **0 à 100 %**, la couper uniquement pour soi ou rétablir son volume. L’audio continue pendant la navigation. Voir [le guide des paramètres et du volume](docs/PARAMETRES-ET-VOLUME.md).

Les comptes et les serveurs peuvent désormais recevoir leurs propres images. Les serveurs disposent aussi de rôles personnalisés, de six permissions vérifiées côté serveur, d’une attribution aux membres, de réglages des salons et d’une révocation des liens d’invitation. Voir [serveurs et rôles](docs/SERVEURS-ET-ROLES.md).

## Licence

Multicord est un logiciel libre distribué sous la licence **GNU Affero General Public License v3.0 ou ultérieure** (voir [LICENSE](LICENSE)). Toute personne qui héberge une version modifiée de Multicord pour d’autres utilisateurs doit leur donner accès au code source de cette version.

## Politique de signature de code

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Les exécutables Windows publiés dans les [releases](https://github.com/arkunis/multicord/releases) sont construits automatiquement par GitHub Actions depuis ce dépôt (`.github/workflows/windows-release.yml`), puis signés par SignPath. Aucun binaire construit sur un poste personnel n’est signé.

- Auteurs et relecteurs (committers, reviewers) : [arkunis](https://github.com/arkunis)
- Approbation des signatures (approvers) : [arkunis](https://github.com/arkunis)

### Confidentialité

Multicord ne transmet aucune information à d’autres systèmes que le serveur Multicord auquel l’utilisateur choisit de se connecter (comptes, messages, fichiers joints, présence) et, pendant un appel, aux autres participants (audio, vidéo, partage d’écran). L’application ne contient ni publicité, ni pistage, ni télémétrie. La réduction du bruit fonctionne entièrement sur l’ordinateur de l’utilisateur.
