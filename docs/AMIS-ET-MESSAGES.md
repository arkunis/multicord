# Amis, identifiants et messages privés

Chaque compte dispose d’un identifiant complet comme **Alex#E12K**.

- **Alex** est le pseudo affiché. Plusieurs personnes peuvent choisir exactement le même pseudo.
- **E12K** est un code automatique de quatre caractères, composé de lettres majuscules et de chiffres. Il est unique parmi les comptes de cette instance et ne change pas lorsqu’on modifie son pseudo.
- Le pseudo et le code sont tous deux nécessaires pour ajouter une personne ou commencer une conversation. La saisie n’est pas sensible à la casse ; les accents et le reste du pseudo doivent correspondre.
- L’identifiant complet change donc uniquement dans sa partie pseudo si le compte est renommé. Les amitiés et conversations existantes restent attachées à l’identifiant interne du compte.

Les comptes créés avant cette mise à jour reçoivent automatiquement un code. Leurs comptes, mots de passe, sessions, serveurs et messages existants sont conservés.

## Trouver et partager son identifiant

Cliquer sur le logo Multicord pour ouvrir l’accueil **Amis et messages**. L’identifiant se trouve dans la colonne des messages privés, dans l’accueil vide et dans les **Paramètres** du profil. Un bouton permet de le copier. Le code apparaît également sous le pseudo dans la barre du compte.

Dans un serveur, cliquer sur un membre pour voir son identifiant complet, le copier, l’ajouter en ami ou lui envoyer un message privé.

## Amis

1. Cliquer sur **Ajouter un ami**.
2. Saisir l’identifiant complet de la personne, par exemple `Alex#E12K`.
3. Envoyer la demande.
4. Le destinataire la retrouve dans **Demandes** et peut l’accepter ou la refuser.

L’expéditeur peut annuler une demande envoyée. Une amitié acceptée apparaît chez les deux personnes, avec les filtres **Tous** et **En ligne**. On peut retirer un ami depuis la liste. Une demande croisée ne s’accepte pas automatiquement : accepter la demande reçue.

## Messages privés

Cliquer sur l’icône de message d’un ami, sur **Nouveau message privé**, ou sur **Message privé** dans la fiche d’un membre. Pour une nouvelle conversation par saisie, utiliser l’identifiant complet.

Il est possible de commencer une conversation sans être déjà amis. Les messages sont persistants et transmis en temps réel aux sessions des deux participants. Un autre compte ne peut ni consulter, ni écrire dans leur conversation. Une seule conversation est créée par paire de comptes, même si les deux personnes l’ouvrent simultanément.

Les non-lus sont comptés par position de message, sans dépendre d’horodatages susceptibles d’être identiques. Ils sont marqués lus lorsque la conversation est ouverte et la page visible. Les 100 derniers messages sont chargés initialement ; **Voir les messages précédents** permet de remonter l’historique. Après une reconnexion du transport, l’interface recharge la fin de l’historique.

La taille maximale d’un message est de 4 000 caractères. Entrée envoie le message ; Maj + Entrée insère une nouvelle ligne.

## Bloquer une personne

Le bouton **Bloquer** de l’en-tête de la conversation empêche les messages et les demandes d’ami dans les deux sens. L’amitié ou la demande existante est retirée. L’historique reste consultable par les deux participants. Le déblocage se fait depuis la conversation ou l’onglet **Bloqués** ; il ne restaure pas automatiquement l’amitié.

## Stockage et portée

Les identifiants sont dans `user_handles`, les amitiés dans `friendships`, les blocages dans `user_blocks`, et les conversations/messages privés dans `direct_conversations` / `direct_messages`. Les contraintes uniques et les transactions protègent les codes, les paires de participants et l’ordre des messages sous concurrence.

La présence en ligne utilise les connexions Socket.IO du processus actuel. Les MP sont privés au sens des contrôles d’accès de l’application ; ils ne disposent pas d’un chiffrement de bout en bout. Les pièces jointes et appels privés ne font pas partie de cette mise à jour.

## Navigation unifiée

À l’accueil, une seule barre latérale contient la recherche de conversation, Amis et les messages privés. Le rail de serveurs se trouve à sa gauche. Les contrôles du compte, du micro, du son reçu et des paramètres sont regroupés en bas. L’ancienne colonne intermédiaire et son encart de présentation ont été retirés.

La recherche filtre les conversations existantes. Entrée avec un identifiant complet ouvre la conversation ; une saisie partielle peut être complétée dans le formulaire de nouveau message. Sur téléphone, le bouton de menu ouvre cette même navigation et sélectionner une conversation referme le volet. Dans un serveur, la barre latérale affiche ses salons.
