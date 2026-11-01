import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function mailMode() {
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) return 'smtp';
  if (process.env.MAIL_TRANSPORT === 'file' && !process.env.APP_ORIGIN) return 'local';
  return 'unavailable';
}
export async function sendResetEmail(to, token) {
  const origin = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
  const url = new URL(origin);
  if (process.env.APP_ORIGIN && url.protocol !== 'https:') throw new Error('Les e-mails publics nécessitent APP_ORIGIN en HTTPS.');
  url.hash = `reset=${token}`;
  const message = {
    from: process.env.MAIL_FROM || 'Multicord <local@multicord.invalid>', to,
    subject: 'Multicord — Réinitialiser votre mot de passe',
    text: `Vous avez demandé un nouveau mot de passe pour Multicord.\n\nOuvrez ce lien dans les 30 minutes :\n${url.toString()}\n\nCe lien est personnel et utilisable une seule fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail. Votre mot de passe reste inchangé.\n`
  };
  if (mailMode() === 'local') {
    const folder = process.env.MAIL_OUTBOX_DIR || 'data/mail';
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(message, null, 2), { mode: 0o600 });
    return;
  }
  if (mailMode() !== 'smtp') throw new Error('Envoi e-mail non configuré.');
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    tls: { rejectUnauthorized: true }, connectionTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true
  });
  await transport.sendMail(message);
}
