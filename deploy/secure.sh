#!/bin/sh
# Sécurise un VPS Ubuntu/Debian pour Multicord, en une commande (à lancer en root) :
#   sh /opt/multicord/deploy/secure.sh
# - mises à jour de sécurité automatiques ;
# - pare-feu : seuls SSH, le site (80/443) et le relais d'appels (3478, 49160-49200/udp) restent ouverts ;
# - fail2ban : bannit les adresses qui essaient de deviner le mot de passe SSH ;
# - SSH par clé uniquement, si une clé est déjà installée (sinon rien n'est changé, pour ne pas vous bloquer dehors).
# Le script peut être relancé sans risque.
set -e

if [ "$(id -u)" -ne 0 ]; then echo "À lancer en root : sudo sh $0" >&2; exit 1; fi
if ! command -v apt-get >/dev/null 2>&1; then echo "Ce script est prévu pour Ubuntu ou Debian." >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive

echo "==> Mise à jour du système"
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ufw fail2ban unattended-upgrades

echo "==> Mises à jour de sécurité automatiques"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

echo "==> Pare-feu"
ssh_port=$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}')
ssh_port=${ssh_port:-22}
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$ssh_port/tcp" comment 'SSH' >/dev/null
ufw allow 80,443/tcp comment 'Multicord (HTTPS)' >/dev/null
ufw allow 443/udp comment 'Multicord (HTTP/3)' >/dev/null
ufw allow 3478 comment 'Relais TURN' >/dev/null
ufw allow 49160:49200/udp comment 'Relais TURN (flux)' >/dev/null
ufw --force enable >/dev/null

echo "==> Protection contre les tentatives de connexion (fail2ban)"
cat > /etc/fail2ban/jail.d/multicord.local <<EOF
[sshd]
enabled = true
port = $ssh_port
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban

echo "==> SSH"
has_key=no
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  if [ -s "$f" ] && grep -qE '^(ssh-|ecdsa-|sk-)' "$f"; then has_key=yes; fi
done
if [ "$has_key" = yes ]; then
  cat > /etc/ssh/sshd_config.d/10-multicord.conf <<'EOF'
# Ajouté par Multicord (deploy/secure.sh) : connexion par clé uniquement.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    ssh_status="connexion par clé uniquement (mots de passe refusés)"
  else
    rm -f /etc/ssh/sshd_config.d/10-multicord.conf
    ssh_status="inchangé : la configuration SSH n'a pas pu être validée"
  fi
else
  ssh_status="INCHANGÉ : aucune clé SSH installée, les mots de passe restent acceptés (voir deploy/README.md, étape 1)"
fi

echo
echo "Terminé."
echo "  Mises à jour automatiques : actives"
echo "  Pare-feu : actif (SSH sur le port $ssh_port, 80/443, 3478, 49160-49200/udp)"
echo "  fail2ban : actif"
echo "  SSH : $ssh_status"
echo
echo "Avant de fermer cette session, vérifiez dans un AUTRE terminal que « ssh root@IP_DU_VPS » fonctionne toujours."
