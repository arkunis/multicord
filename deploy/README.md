# Héberger Multicord sur un VPS

Ce dossier installe en une commande :

- **Multicord** (comptes, messages, salons, fichiers, interface web) ;
- **Caddy**, qui obtient et renouvelle tout seul le certificat HTTPS (Let’s Encrypt) ;
- **coturn**, le relais TURN qui permet aux appels de passer entre réseaux stricts (4G, box, entreprises) ;
- en option, **PostgreSQL** sur le même serveur.

Compter une trentaine de minutes la première fois.

## 1. Louer le VPS

N’importe quel hébergeur convient (Hetzner, OVH, Scaleway, Infomaniak…). Pour un groupe d’amis :

- **Ubuntu 24.04**, 2 vCPU, 2 à 4 Go de mémoire, 20 Go de disque ;
- à partir d’environ 4 à 6 € par mois.

Notez l’**adresse IP publique** du VPS et connectez-vous en SSH :

```bash
ssh root@ADRESSE_IP
```

## 2. Choisir l’adresse du serveur

- **Avec un nom de domaine** : créez chez votre registrar un enregistrement DNS **A** `multicord.mondomaine.fr` vers l’IP du VPS.
- **Sans nom de domaine** (gratuit) : utilisez l’IP avec des tirets suivie de `.sslip.io`. Pour l’IP `203.0.113.10`, l’adresse est `203-0-113-10.sslip.io`. Elle fonctionne immédiatement, HTTPS compris.

## 3. Installer Docker et récupérer Multicord

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
git clone https://github.com/arkunis/multicord.git /opt/multicord
cd /opt/multicord/deploy
cp .env.example .env
```

## 4. Remplir `.env`

```bash
nano .env
```

- `DOMAIN` : l’adresse choisie à l’étape 2, sans `https://`.
- `PUBLIC_IP` : l’IP du VPS.
- `TURN_PASSWORD` : un mot de passe long. Pour en générer un : `openssl rand -hex 24`.
- **Base de données**, une option au choix :
  1. **Rien à remplir** : SQLite, stocké dans un volume Docker. C’est le plus simple, et largement suffisant pour un groupe d’amis.
  2. **PostgreSQL sur le VPS** : renseignez `POSTGRES_PASSWORD` et `DATABASE_URL=postgresql://multicord:LE_MEME_MOT_DE_PASSE@postgres:5432/multicord`, puis lancez avec `--profile local-db` (étape 6).
  3. **PostgreSQL hébergé** (Aiven, Supabase…) : collez l’URL dans `DATABASE_URL`. Si l’hébergeur fournit un certificat CA, copiez-le dans `deploy/certs/ca.pem` et ajoutez `DATABASE_SSL_CA_FILE=/app/certs/ca.pem`.

Le fichier `.env` et le dossier `certs/` ne sont jamais envoyés sur GitHub.

## 5. Ouvrir les ports

Sur le VPS :

```bash
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 443/udp
ufw allow 3478
ufw allow 49160:49200/udp
ufw enable
```

Si votre hébergeur propose aussi un pare-feu dans son interface web, ouvrez-y les mêmes ports.

## 6. Démarrer

```bash
docker compose up -d --build
# ou, avec PostgreSQL sur le VPS :
docker compose --profile local-db up -d --build
```

La première construction prend quelques minutes. Pour suivre le démarrage :

```bash
docker compose logs -f multicord caddy
```

Ouvrez ensuite `https://VOTRE_ADRESSE` dans un navigateur : la page de connexion de Multicord doit s’afficher, avec le cadenas HTTPS.

## 7. Inviter vos amis

1. Chacun installe Multicord depuis [le site](https://arkunis.github.io/multicord/).
2. Dans l’application : menu **Multicord › Connexion au serveur…**, puis **Serveur distant**, et saisir `https://VOTRE_ADRESSE`.
3. Créez votre serveur et partagez le lien d’invitation : il utilise automatiquement votre adresse publique.

Sur un autre ordinateur ou un téléphone, `https://VOTRE_ADRESSE` s’ouvre aussi directement dans le navigateur.

## Mettre à jour le serveur

```bash
cd /opt/multicord/deploy
sh update.sh
```

Le script récupère la dernière version et reconstruit le serveur. Les données (volumes Docker) sont conservées.

## Sauvegarder

- **SQLite** :
  ```bash
  docker compose cp multicord:/app/data ./sauvegarde-$(date +%F)
  ```
- **PostgreSQL sur le VPS** :
  ```bash
  docker compose exec postgres pg_dump -U multicord multicord > sauvegarde-$(date +%F).sql
  ```
- **PostgreSQL hébergé** : utilisez les sauvegardes proposées par l’hébergeur.

Copiez régulièrement ces sauvegardes hors du VPS.

## Reprendre des données existantes

Pour garder une base PostgreSQL hébergée existante (par exemple Aiven), utilisez simplement l’option 3 : le VPS repart avec les mêmes comptes, serveurs et messages.

Arrêtez alors le serveur qui tournait sur votre PC (`npm start`), pour qu’une seule instance utilise la base. Puis passez votre application en **Serveur distant**.

## En cas de problème

- **Pas de HTTPS** : vérifiez que l’adresse pointe bien vers l’IP du VPS et que les ports 80 et 443 sont ouverts, puis consultez `docker compose logs caddy`.
- **Les appels ne se connectent pas entre certains réseaux** : vérifiez `PUBLIC_IP`, les ports 3478 et 49160 à 49200 en UDP, puis `docker compose logs turn`.
- **État des services** : `docker compose ps`.
