# Validation — 31 octobre 2026

- `npm test` : 7 tests d’intégration réussis, base SQLite temporaire et serveur réel.
- `npm run build` : compilation Vite réussie.
- `npm install` : audit initial, aucune vulnérabilité signalée pour les 123 paquets installés.
- Création de serveur et salons par défaut vérifiée depuis le navigateur.
- Rendus de bureau et d’écran étroit inspectés ; aperçu conservé dans `apercu-multicord.png`.
- Diagnostic dans Chromium via `tests/media.html` : trois RTCPeerConnection réelles avec audio synthétique et vidéo canvas, connexions établies, paquets audio reçus et vidéo décodée pour chaque participant.
- Coupure et réactivation de caméra d’un invité : renégociation et relais vérifiés.
- Partage d’écran synthétique : réception chez l’hôte et l’autre invité ; arrêt et retrait du flux vérifiés.
- Départ d’un invité : retrait de ses flux chez les autres ; départ de l’hôte : événement de fin d’appel vérifié.
- La dernière exécution du diagnostic utilise le backend final avec validation des paquets Socket.IO.
- La version de production est servie sur le port 3000 ; contrôle HTTP 200 effectué.

- Mise à jour Aiven : connexion PostgreSQL réelle vérifiée, TLS 1.3 avec CA et nom d’hôte validés, pool limité à cinq connexions.
- Lecture et écriture PostgreSQL vérifiées dans une transaction annulée, sans données de test résiduelles.
- Migration SQLite → Aiven validée dans une transaction : 5 utilisateurs, 2 serveurs, 10 salons, 4 messages, 6 adhésions, 1 session et 1 invitation. Source SQLite conservée intacte.
- `npm test` après configuration Aiven : 10 tests réussis, dont trois tests de configuration du pool et de validation TLS.

## Mise à jour comptes et serveurs utilisateurs

- 17 tests locaux réussis : inscription/connexion, comptes obligatoires, aucun serveur automatique, invitations, messages, quotas de cinq propriétaires sous concurrence, jetons de récupération hachés, expiration, usage unique sous concurrence, changement de mot de passe et révocation des sessions.
- 12 tests d’intégration également réussis sur PostgreSQL Aiven réel, dans un schéma temporaire isolé et supprimé après exécution.
- Migration de nettoyage validée une seule fois ; les créations ultérieures survivent aux appels d’initialisation suivants. Sauvegarde privée des deux anciens serveurs conservée dans `data/backups` avant leur retrait.
- Interface inspectée dans le navigateur en vue étroite et en vue de bureau. Inscription, accueil vide, création d’un serveur, compteur, paramètres, déconnexion, demande de récupération et ouverture du lien vérifiés sur une instance de test isolée. Aucun faux compte ajouté à la base principale.
- Prise en charge vérifiée d’un lien de récupération ouvert dans un onglet déjà présent ; retrait du jeton de la barre d’adresse après lecture.
- Mode e-mail local actif conformément au choix de l’utilisateur ; le transport SMTP réel n’a pas été testé.
- Compilation de production réussie. Capture de l’accueil : `comptes-multicord.png`.

Non vérifié : matériel réel (micro/caméra/sélecteur de partage), fonctionnement entre appareils ou réseaux différents, TURN réel, reverse proxy HTTPS, charge importante et déploiement public. L’application est une alpha web locale, sans installateur natif.

## Amis et messages privés — 1er novembre 2026

- 25 tests locaux réussis, dont attribution des codes aux anciens comptes, stabilité après redémarrage et changement de pseudo, pseudos identiques, demandes/acceptation/refus/annulation, conversations uniques par paire, isolation face à un troisième compte, échanges temps réel, ordre d’envoi concurrent, pagination, non-lus et blocage.
- 19 tests d’intégration également réussis sur Aiven, dans un schéma de test isolé puis supprimé.
- Contrôle navigateur avec deux sessions synthétiques distinctes, nommées Alex : demande d’ami reçue et acceptée, liste mise à jour des deux côtés, ouverture de MP, échange aller-retour, badge non lu puis disparition après lecture.
- Vue de bureau et conversation au format 390 × 844 vérifiées. Captures conservées dans `amis-multicord.png` et `messages-prives-multicord.png`.
- Compilation de production réussie. Identifiants attribués aux comptes Aiven existants ; contrainte d’unicité vérifiée.
- Aucun faux compte ni message de test ajouté à la base principale : les essais UI utilisent une base SQLite isolée, et les essais Aiven un schéma temporaire distinct.
- Le formulaire d’inscription déjà ouvert dans l’onglet principal n’a pas été rechargé pour conserver sa saisie en cours. La nouvelle version est servie et se charge à la prochaine actualisation.

## Page Paramètres et copie rapide — 1er novembre 2026

- Profil et sécurité déplacés de la fenêtre modale vers une page intégrée au contenu principal.
- Compilation Vite validée ; pas de modification des API ni du schéma de base de données.
- Vérification navigateur sur une base de test isolée : ouverture de la page, enregistrement du pseudo, maintien du code et copie du nouvel identifiant.
- Contenu du presse-papiers vérifié après les clics sur le bloc pseudo et sur l’identifiant de la page ; les deux contiennent exactement `Pseudo#CODE`.
- Brouillon de MP conservé après ouverture des paramètres puis retour à la discussion. Les MP cachés par les paramètres ne sont pas automatiquement marqués lus.
- Rendu bureau et 390 × 844 inspectés. Capture de référence : `parametres-multicord.png`.

## Paramètres étendus et volume individuel — 1er novembre 2026

- Navigation de l’accueil unifiée : rail de serveurs, une seule colonne Amis/MP, puis conversation. Les salons remplacent cette colonne lorsqu’un serveur est sélectionné. Le passage par les paramètres conserve le brouillon.
- Paramètres dans une page complète, neuf catégories, recherche, e-mail masqué, identifiant copiable et véritable bouton de déconnexion visible.
- 28 tests locaux réussis ; 22 tests d’intégration PostgreSQL réussis dans un schéma temporaire supprimé. Nouveaux contrôles : fusion de préférences sous concurrence, validation, restrictions de contact, export des messages envoyés, présence masquée, révocation ciblée des sessions et roster vocal réservé aux participants.
- Une course à la connexion Socket.IO a été corrigée : les commandes sont enregistrées avant la première attente en base, pour recevoir un événement émis immédiatement après connexion.
- Sauvegarde du volume général au clavier vérifiée dans l’interface puis après rechargement. Les préférences du compte de test ont ensuite été rétablies à 100 %.
- Diagnostic navigateur de volume : voix A à 30 % et voix B à 100 % ; coupure individuelle A à 0 sans modifier B ; volume général à 50 % donnant B à 0,5 ; coupure globale activant muted sur les deux lecteurs. Aucun accès au micro réel.
- Diagnostic WebRTC à trois réussi : association des flux relayés à leur participant, paquets audio, vidéo décodée, caméra arrêtée/réactivée, partage arrêté et départs.
- Interface de bureau et largeur 390 px inspectées ; absence de débordement horizontal vérifiée. Captures : parametres-multicord.png, parametres-voix-multicord.png, parametres-mobile-multicord.png.
- Les préférences personnelles des comptes principaux n’ont pas été modifiées par les essais. Les diagnostics utilisent la base SQLite de test ; aucun faux utilisateur ajouté à la base principale Aiven.
- Non vérifié : matériel réel, périphérique de sortie réel, appel entre réseaux différents, charge importante. Le choix de sortie dépend du navigateur ; les notifications sonores peuvent dépendre de ses règles de lecture automatique.
- Déploiement local vérifié sur l’instance PostgreSQL du port 3000 : navigation unifiée et nouvelle page Voix et vidéo visibles sur le compte existant, sans modifier ses préférences. Le vrai bouton Se déconnecter a été actionné sur le compte synthétique de test et a bien affiché l’écran de connexion.

## Photos, personnalisation des serveurs et rôles — 1er novembre 2026

- 30 tests locaux réussis et 24 tests d’intégration réussis sur PostgreSQL Aiven dans un schéma temporaire supprimé en fin d’exécution.
- Import de photo, conversion WebP 512 × 512, retrait des métadonnées, diffusion aux contacts, présence dans les membres et les anciens messages, remplacement et retrait contrôlés. Refus des SVG et des fichiers trop volumineux, lecture des avatars réservée aux comptes connectés.
- Personnalisation du serveur : nom, description, couleur, icône et bannière ; normalisation des images et refus de lecture par un non-membre.
- Rôles : création par le propriétaire, prévention de l’escalade des droits, impossibilité d’attribuer un rôle d’un autre serveur ou à un non-membre, protection du rôle de base, autorisations cumulées, révocation des permissions et arrêt vocal effectif.
- Droits de création et modification des salons, suppression des messages par un modérateur, contrôle des invitations et révocation du lien vérifiés via les API réelles et Socket.IO.
- Contrôle navigateur sur une base SQLite isolée : aperçu et enregistrement d’une photo synthétique, persistance après rechargement, modification du nom et de la description d’un serveur, import d’icône et de bannière, création d’un rôle Modérateurs avec deux droits puis attribution à un deuxième membre synthétique.
- Aucune photo ni préférence du compte principal modifiée par les tests. Captures : photo-profil-multicord.png et roles-multicord.png.
- Vérification de la largeur 390 px : paramètres des rôles utilisables sans débordement horizontal ; capture roles-mobile-multicord.png.
- Compilation finale réussie et instance PostgreSQL du port 3000 redémarrée. Le bouton Changer la photo est visible dans les paramètres du compte existant ; aucune image personnelle n’a été ajoutée automatiquement.

## Invitations courtes, vue vocale, recherche et épingles — 1er novembre 2026

- Codes d’invitation de 8 caractères (alphabet sans glyphes ambigus), liens `/invite/CODE`, aperçu avant d’adhérer ; les anciens codes hexadécimaux sont remplacés à la prochaine génération. Liens `multicord://invite/CODE` gérés par l’application Windows (démarrage ou instance déjà ouverte) ; l’enregistrement du protocole est réservé à l’application installée.
- Partage d’écran Windows réécrit : sélecteur Multicord puis capture directe de la source (`chromeMediaSourceId`). L’erreur « Invalid capture constraints » ne se reproduit plus ; capture vérifiée en 1920 × 1080 dans Electron, tuile « Votre écran » visible dans l’appel.
- Fenêtre « accès aux périphériques » supprimée : autorisations micro/caméra/capture accordées uniquement à l’origine Multicord connectée dans la fenêtre principale. Vérifié : `getUserMedia` audio sans boîte de dialogue.
- Vue vocale : clic sur un salon vocal = affichage + connexion ; navigation vers les salons texte sans quitter l’appel ; discussion propre à chaque salon vocal. Bannière du salon texte retirée ; icône de serveur à initiales recentrée.
- Recherche serveur (messages + membres, insensible à la casse, `%`/`_` échappés) et épingles (50 par salon, droit dédié « Épingler des messages », désactivé par défaut).
- 33 tests SQLite réussis. Essais Electron sur une base SQLite isolée (port 3999) avec un compte synthétique ; aucune donnée ajoutée à la base Aiven, dont seule la table `message_pins` est créée au redémarrage de l’instance du port 3000.
- Non vérifié : appel réel à plusieurs machines, application mobile (inexistante pour l’instant : les liens ouvrent la version web sur mobile).
