# Comptes et récupération

## Créer un compte

Sur l’accueil, choisir **Créer un compte**. Renseigner un pseudo, un e-mail et un mot de passe confirmé. Le mot de passe comporte au moins 10 caractères ; la limite de 72 octets évite toute troncature par bcrypt (certains caractères Unicode occupent plusieurs octets). Les adresses sont normalisées en minuscules et uniques. La vérification de propriété de l’e-mail n’est pas encore implémentée.

La session est conservée dans un cookie HttpOnly. Les jetons de session sont hachés dans la base. Une ancienne session explorateur peut être convertie au moment de l’inscription, mais aucun nouvel explorateur n’est créé.

## Mot de passe oublié — mode local actif

1. Depuis **Se connecter**, choisir **Mot de passe oublié ?**.
2. Saisir l’adresse du compte puis **Recevoir un lien**.
3. Dans le projet, ouvrir le dossier privé `data/mail` et le fichier JSON le plus récent correspondant à l’adresse.
4. Dans le champ `text`, copier le lien et l’ouvrir dans le navigateur.
5. Renseigner et confirmer le nouveau mot de passe, puis se reconnecter.

Un fichier n’est créé que si le compte existe. La réponse de l’API reste identique pour les adresses inconnues afin de ne pas divulguer les inscriptions. Le lien expire après 30 minutes. Un nouveau lien invalide le précédent. Une réinitialisation réussie ferme toutes les sessions du compte et ne connecte pas automatiquement l’utilisateur.

**Aucun e-mail n’est envoyé sur internet dans ce mode.** Les fichiers sont réservés à l’administrateur local, exclus de Git, et contiennent des liens confidentiels à supprimer lorsqu’ils ne servent plus. Ils ne sont pas accessibles par l’API ni inclus dans la compilation du client. Le jeton n’est conservé qu’en empreinte SHA-256 dans PostgreSQL ; la valeur brute est uniquement dans l’e-mail.

Le lien utilise un fragment `#reset=…`, qui n’est pas envoyé dans les requêtes HTTP. L’interface le retire de la barre d’adresse dès son chargement. Pour recommencer après un rechargement, rouvrir le lien depuis l’e-mail local.

## Modifier son mot de passe

Dans **Paramètres → Mot de passe et sécurité**, renseigner le mot de passe actuel et confirmer le nouveau. Les anciennes sessions et les liens de récupération sont révoqués ; une nouvelle session est créée pour le navigateur courant.

## Serveurs

- Aucun serveur n’est créé automatiquement.
- Chaque compte peut posséder **5 serveurs au maximum**.
- Rejoindre une autre communauté par invitation ne compte pas dans ces cinq créations.
- Le compteur est affiché dans le formulaire de création. La limite est contrôlée dans une transaction, avec verrouillage du propriétaire sur PostgreSQL, pour empêcher le contournement par créations simultanées.
- Les deux anciens serveurs ont été retirés à la demande de l’utilisateur. La migration `user-created-servers-v1` s’exécute une seule fois ; les serveurs créés après cette mise à jour restent présents aux redémarrages. Les sauvegardes privées sont dans `data/backups`.

## Activer plus tard les vrais e-mails

Configurer dans `.env` :

```dotenv
APP_ORIGIN=https://votre-domaine.example
SMTP_HOST=smtp.votre-fournisseur.example
SMTP_PORT=587
SMTP_USER=votre-utilisateur
SMTP_PASSWORD=votre-secret
MAIL_FROM=Multicord <bonjour@votre-domaine.example>
```

Le port 587 utilise STARTTLS obligatoire ; le port 465 utilise TLS dès la connexion. Les certificats sont vérifiés. L’origine des liens provient de la configuration et jamais de l’en-tête Host de la requête. Le mode fichier est désactivé si une origine publique est définie. Sans SMTP configuré dans ce cas, l’API indique que l’envoi est indisponible.

L’envoi SMTP est implémenté mais n’a pas été testé avec un fournisseur réel. Pour une exploitation publique, prévoir une file d’envoi durable, des alertes d’échec de remise et une politique de conservation des e-mails locaux. Actuellement la remise est traitée par le processus Node après la réponse HTTP ; un arrêt du processus peut interrompre un envoi.

Référence de conception : [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Identifiant public

Le pseudo n’est pas unique : un code stable de quatre lettres/chiffres est attribué automatiquement. Le compte est retrouvé par son identifiant complet `Pseudo#E12K` pour les amis et les MP. Voir [le guide des amis et messages](AMIS-ET-MESSAGES.md).

## Page Paramètres et copie rapide

Le profil, l’adresse e-mail, l’identifiant et la sécurité sont réunis dans une page du contenu principal de l’application. L’ouvrir avec la roue dentée du bloc du compte, en bas de la barre latérale. **Revenir à mon espace** retrouve la discussion précédente ; les brouillons restent présents.

Pour copier l’identifiant complet `Pseudo#CODE`, cliquer directement sur le bloc pseudo en bas à gauche, ou sur l’identifiant dans la page Paramètres. Une confirmation visuelle indique la réussite de la copie. Le texte copié reprend le pseudo actuel immédiatement après un enregistrement.

## Photo de profil

Dans **Paramètres → Infos du compte → Photo de profil**, choisir une image, vérifier l’aperçu et cliquer sur **Enregistrer la photo**. **Annuler** abandonne la sélection ; **Retirer ma photo** rétablit les initiales. JPG, PNG et WebP fixes sont acceptés, jusqu’à 5 Mo et 20 millions de pixels.

Le serveur recadre et réencode l’image en WebP 512 × 512, sans métadonnées. La photo est conservée dans la base de données et suit le compte après reconnexion. Elle apparaît dans les messages, les listes d’amis, les membres, le panneau de compte et les vignettes vocales sans caméra. Les sessions et contacts connectés reçoivent la mise à jour.
