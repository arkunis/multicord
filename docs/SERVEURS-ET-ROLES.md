# Serveurs : personnalisation, rôles et droits

Depuis un serveur, ouvrir **Paramètres du serveur** sous le bouton d’invitation. La page comprend Vue d’ensemble, Rôles et permissions, Membres, Salons et Invitations.

## Personnalisation

Le créateur, ou un membre disposant de **Personnaliser le serveur**, peut modifier son nom, sa description et sa couleur, ainsi que son icône et sa bannière. Les images JPG, PNG et WebP fixes sont limitées à 5 Mo et 20 millions de pixels. Elles sont orientées, recadrées et réencodées en WebP sans métadonnées : 512 × 512 pour l’icône, 1440 × 480 pour la bannière. Les images sont conservées dans la base de données et accessibles aux membres connectés du serveur.

Les modifications sont transmises aux sessions connectées. L’icône apparaît dans le rail et l’en-tête ; la bannière personnalise l’accueil du serveur.

## Rôles et permissions

Chaque serveur possède automatiquement un rôle **@tout le monde**. Il permet par défaut d’écrire, de rejoindre le vocal et de créer des invitations. Il ne permet pas de gérer le serveur, les salons ou les messages des autres.

Le créateur peut créer jusqu’à 39 rôles supplémentaires, choisir leurs noms et couleurs, modifier leurs permissions et les attribuer aux membres. La gestion des rôles et leur attribution restent réservées au créateur dans cette version. Le créateur conserve toujours tous les droits.

Six permissions sont effectives :

- Envoyer des messages.
- Rejoindre les salons vocaux.
- Créer des invitations.
- Gérer les salons : création, nom et sujet.
- Modérer les messages : supprimer les messages d’autres membres avec confirmation dans l’interface.
- Personnaliser le serveur : nom, description, couleur, images et révocation des invitations.

Les autorisations s’additionnent : une permission autorisée par **@tout le monde** ou par l’un des rôles attribués est accordée. Pour réserver un droit à certains rôles, le désactiver dans **@tout le monde**, puis l’activer dans les rôles concernés. Il n’y a pas de refus prioritaire ni de surcharge par salon dans cette version. Tous les membres peuvent consulter les salons et leur historique.

Les droits sont vérifiés par l’API et Socket.IO, indépendamment de l’affichage des boutons. Le retrait du droit vocal déconnecte les participants concernés ; si l’hôte perd ce droit, son appel prend fin. Le rôle de base ne peut pas être supprimé. Un rôle d’un autre serveur ne peut pas être attribué ici. La suppression d’un rôle retire ses attributions.

Les rôles personnalisés apparaissent dans la liste des membres ; en présence de plusieurs rôles, le plus récemment créé fournit la couleur et l’étiquette principales. L’ordre visuel n’accorde aucun droit supplémentaire.

## Invitations

Les membres autorisés peuvent obtenir et copier le lien actuel. Un membre avec **Personnaliser le serveur** peut révoquer ce lien, puis en générer un nouveau. La révocation ne retire pas les membres déjà présents. Les liens n’ont pas encore de durée ou de nombre d’utilisations configurable.

## Portée actuelle

Les réglages sont enregistrés dans PostgreSQL ou SQLite, avec relations entre rôles, adhésions et serveurs. Il n’y a pas encore de catégories de salons, de permissions spécifiques à un salon, de transfert de propriété, d’expulsion/bannissement, de journal d’audit ni de délégation de la gestion des rôles.
