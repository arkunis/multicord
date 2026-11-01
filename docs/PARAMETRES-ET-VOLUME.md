# Paramètres et volume des participants

La roue dentée ouvre une page dédiée. Sa navigation remplace les colonnes de l’espace de discussion, avec recherche des catégories sur ordinateur et onglets défilants sur mobile. Le bouton **Se déconnecter** reste visible dans cette navigation.

## Réglages disponibles

- **Compte** : pseudo, code permanent, copie en un clic de `Pseudo#CODE`, e-mail masqué et statut actif.
- **Sécurité** : changement du mot de passe et accès aux sessions.
- **Appareils connectés** : sessions actives, indication de la session courante, navigateur déclaré et date de connexion. Déconnecter une session révoque son cookie et sa connexion Socket.IO, sans fermer les autres sessions. Les anciennes sessions sont prises en charge ; leur ancien navigateur n’est pas connu.
- **Confidentialité** : présence en ligne masquée, liste des personnes bloquées et export JSON du profil, des préférences et des messages envoyés. Masquer sa présence ne masque pas sa participation aux appels.
- **Messagerie** : MP ouverts à tous, aux amis uniquement ou à personne ; demandes d’amis ouvertes à tous, aux membres de serveurs communs ou à personne. Les restrictions sont vérifiées côté serveur et s’appliquent aux nouveaux messages dans les conversations existantes. L’historique reste consultable par ses participants.
- **Notifications** : alertes intégrées pour les MP reçus dans un autre onglet ou lorsque l’on consulte un serveur, aperçu facultatif, son et volume, badge de l’accueil. Il ne s’agit pas de notifications système ni de notifications push hors connexion.
- **Voix et vidéo** : périphériques locaux, volume du micro de 0 à 200 %, volume reçu de 0 à 100 %, réduction du bruit, annulation d’écho, gain automatique et résolution souhaitée de la caméra. Le microphone et le traitement du son s’appliquent au prochain appel ; le gain et le volume reçu changent pendant l’appel. La résolution s’applique à la prochaine activation de la caméra. Le navigateur et le matériel déterminent les fonctions disponibles.
- **Apparence et accessibilité** : palettes sauge/ardoise, taille des messages, densité, animations réduites et contraste renforcé.

Les préférences sont conservées dans `user_settings` (PostgreSQL ou SQLite). Elles sont synchronisées avec les autres sessions connectées du compte. Les identifiants des périphériques et les volumes individuels restent dans le stockage local du navigateur, par compte : les appareils ne partagent pas les mêmes périphériques.

Les fonctions non implémentées, notamment téléphone/SMS, double authentification, centre familial et abonnements payants, ne sont pas présentées comme actives.

## Régler une personne pendant l’appel

Dans le salon courant, cliquer sur un participant dans la liste vocale, sur **Volume des participants** près de la connexion vocale ou utiliser les curseurs du panneau d’appel. Les mêmes commandes sont accessibles via **Voix et vidéo → Régler chaque participant** pendant un appel.

Chaque personne dispose d’un curseur **0 à 100 %**, d’une coupure **pour moi** et d’un bouton de réinitialisation. Le réglage est immédiat, sans effet sur les autres auditeurs ni sur le micro de cette personne. Il suit l’identifiant interne du compte, même après un changement de pseudo. Le volume final est le produit du volume individuel et du volume général reçu ; la coupure globale a priorité.

Le serveur transmet les identités des participants et leurs identifiants de flux uniquement aux membres de l’appel. Cela permet d’associer les pistes relayées par l’hôte à la bonne personne. Le même réglage s’applique aux flux de cette personne. L’écoute audio continue lorsque l’on ouvre les amis, les paramètres ou un autre serveur.

## Vérification locale

- `npm test` : tests HTTP/Socket.IO, quotas, sessions, permissions, identité des flux et migrations.
- `$env:TEST_POSTGRES='1'; node --env-file=.env --test tests/integration.test.js` : schéma PostgreSQL temporaire isolé, supprimé à la fin.
- En mode développement, `/tests/media.html` : trois participants WebRTC avec sons et vidéos synthétiques, sans matériel personnel.
- `/tests/volume.html` : deux sons synthétiques très faibles utilisant les véritables composants de lecture et de contrôle du volume. Le bouton de lecture des valeurs indique le volume réellement appliqué à chaque élément audio.

Les diagnostics sont réservés au développement et ne sont pas inclus dans `dist`.
