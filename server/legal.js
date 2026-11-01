// Pages légales de l'instance (conditions, confidentialité, mentions) et informations publiques.
// Les textes sont des modèles : l'hébergeur complète son identité dans .env et doit les faire relire.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const env=(key,label)=>process.env[key]?.trim()?esc(process.env[key].trim()):`<mark>[${label} — à compléter dans ${key}]</mark>`;
export const instanceInfo=()=>({name:process.env.INSTANCE_NAME?.trim()||'Multicord',contact:process.env.INSTANCE_CONTACT?.trim()||null,requireTerms:process.env.REQUIRE_TERMS==='1',source:process.env.SOURCE_URL||'https://github.com/arkunis/multicord'});
const updated=()=>esc(process.env.LEGAL_UPDATED||'1er novembre 2026');

const PAGES={
 conditions:{title:'Conditions d’utilisation',body:()=>{const i=instanceInfo();return `
<p>Les présentes conditions encadrent l’utilisation du service <strong>${esc(i.name)}</strong>, une instance du logiciel libre Multicord exploitée par ${env('INSTANCE_OPERATOR','nom de l’exploitant')}. En créant un compte, vous les acceptez.</p>
<h2>1. Le service</h2><p>Le service permet de créer des serveurs et des salons, d’échanger des messages et des fichiers, et de passer des appels vocaux et vidéo. Il est fourni gratuitement, « en l’état », sans garantie de disponibilité. Il peut évoluer, être interrompu pour maintenance ou fermer, en prévenant les utilisateurs dans la mesure du possible.</p>
<h2>2. Votre compte</h2><p>Vous devez avoir au moins 15 ans, ou l’accord de vos parents si vous êtes plus jeune. Vous fournissez une adresse e-mail valide et gardez votre mot de passe secret ; vous êtes responsable de l’usage de votre compte. Vous pouvez le supprimer à tout moment depuis les paramètres (« Données et confidentialité »).</p>
<h2>3. Règles de conduite</h2><p>Il est interdit de publier, partager ou transmettre :</p><ul>
<li>des contenus illégaux, notamment pédocriminels, faisant l’apologie du terrorisme ou des crimes contre l’humanité, ou incitant à la haine ou à la violence en raison de l’origine, de la religion, du sexe, de l’orientation sexuelle, du handicap ;</li>
<li>du harcèlement, des menaces, la divulgation d’informations personnelles d’autrui sans son accord ;</li>
<li>des contenus sexuels impliquant des personnes non consentantes ou visibles par des mineurs ;</li>
<li>des contenus portant atteinte aux droits d’auteur ou aux marques d’autrui ;</li>
<li>du spam, des arnaques, des logiciels malveillants, ou toute tentative de perturber le service ou d’accéder aux comptes d’autrui ;</li>
<li>l’usurpation de l’identité d’une personne ou d’une organisation.</li></ul>
<h2>4. Vos contenus</h2><p>Vous restez propriétaire de ce que vous publiez et en êtes responsable. Vous autorisez seulement l’exploitant à les stocker et à les afficher aux personnes à qui vous les destinez, le temps nécessaire au fonctionnement du service. Les fichiers joints sont limités à 5 Mo.</p>
<h2>5. Signalement et modération</h2><p>Chacun peut signaler un message ou un compte depuis l’application (bouton « Signaler »). Les signalements de contenus manifestement illicites sont examinés par l’exploitant ; les modérateurs de chaque serveur traitent aussi ceux de leur serveur. Un contenu contraire à ces conditions ou à la loi peut être supprimé et un compte suspendu, avec une indication du motif. Vous pouvez contester une décision en écrivant à ${env('INSTANCE_CONTACT','adresse de contact')}.</p>
<h2>6. Fin d’utilisation</h2><p>Vous pouvez supprimer votre compte à tout moment. L’exploitant peut suspendre ou supprimer un compte en cas de manquement grave ou répété à ces conditions, ou sur demande d’une autorité.</p>
<h2>7. Responsabilité</h2><p>Les échanges ont lieu entre utilisateurs ; l’exploitant n’intervient pas sur leur contenu en dehors de la modération. Sa responsabilité est limitée à ce que permet la loi.</p>
<h2>8. Modifications et droit applicable</h2><p>Ces conditions peuvent être modifiées ; les changements importants seront annoncés. Elles sont soumises au droit français.</p>`;}},
 confidentialite:{title:'Politique de confidentialité',body:()=>{const i=instanceInfo();return `
<p>Cette politique explique quelles données le service <strong>${esc(i.name)}</strong> traite et pourquoi. Le responsable de traitement est ${env('INSTANCE_OPERATOR','nom de l’exploitant')}, joignable à ${env('INSTANCE_CONTACT','adresse de contact')}.</p>
<h2>Données traitées</h2><ul>
<li><strong>Compte</strong> : adresse e-mail, pseudo et identifiant, mot de passe (jamais stocké en clair : seule une empreinte irréversible est conservée), photo, bio, statut et pronoms si vous les renseignez.</li>
<li><strong>Contenus</strong> : messages, réactions, fichiers joints, serveurs et salons que vous créez.</li>
<li><strong>Relations</strong> : amis, blocages, appartenance aux serveurs, rôles.</li>
<li><strong>Technique</strong> : sessions de connexion (appareil, navigateur, dates), préférences. Votre adresse IP est utilisée de façon temporaire pour la sécurité (limitation des tentatives) et n’est pas conservée dans la base.</li>
<li><strong>Signalements</strong> : le motif et une copie du contenu signalé.</li></ul>
<h2>Pourquoi</h2><p>Pour fournir le service que vous demandez en créant un compte (exécution du contrat), le sécuriser et lutter contre les abus (intérêt légitime), et répondre aux obligations légales d’un hébergeur. Aucune donnée n’est vendue, ni utilisée pour de la publicité ou du profilage. L’application ne contient aucun traceur.</p>
<h2>Qui y a accès</h2><p>Les autres utilisateurs voient ce que vous leur rendez visible (profil, messages dans les salons et conversations où ils se trouvent). L’exploitant et son hébergeur technique (${env('INSTANCE_HOSTING','hébergeur')}) y ont accès pour faire fonctionner le service. Les données sont stockées : ${env('INSTANCE_DATA_LOCATION','pays de stockage')}.</p>
<p><strong>Appels</strong> : l’audio, la vidéo et le partage d’écran passent directement entre les participants, via la personne qui héberge l’appel, et ne sont pas enregistrés. Pour cela, votre adresse IP est visible des participants de l’appel ; un relais (TURN) de l’exploitant peut être utilisé quand les réseaux l’imposent. La réduction du bruit fonctionne sur votre appareil.</p>
<h2>Durées de conservation</h2><ul>
<li>Compte et contenus : tant que le compte existe. À la suppression du compte, les données personnelles sont effacées immédiatement ; les messages déjà envoyés restent affichés sous le nom « Compte supprimé », et les serveurs que vous avez créés sont supprimés.</li>
<li>Sessions : 30 jours au plus.</li>
<li>Fichiers ajoutés mais jamais envoyés : effacés au bout d’une heure.</li>
<li>Signalements traités : conservés le temps nécessaire au suivi et aux éventuelles demandes des autorités.</li></ul>
<h2>Cookies et stockage local</h2><p>Un seul cookie est utilisé : celui de votre session, indispensable pour rester connecté. L’application garde aussi localement quelques préférences (thème, dernier salon ouvert, e-mail si vous l’avez demandé). Aucun cookie publicitaire ou de mesure d’audience.</p>
<h2>Vos droits</h2><p>Vous pouvez accéder à vos données et les télécharger (Paramètres › Données et confidentialité), les corriger, supprimer votre compte, vous opposer à un traitement ou en demander la limitation en écrivant à ${env('INSTANCE_CONTACT','adresse de contact')}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
<h2>Sécurité</h2><p>Connexions chiffrées (HTTPS), mots de passe conservés sous forme d’empreinte irréversible, accès restreints. Le code du logiciel est public et vérifiable : <a href="${esc(i.source)}">${esc(i.source)}</a>.</p>`;}},
 mentions:{title:'Mentions légales',body:()=>{const i=instanceInfo();return `
<h2>Éditeur du service</h2><p>${env('INSTANCE_OPERATOR','nom ou raison sociale, adresse')}<br>Contact : ${env('INSTANCE_CONTACT','adresse de contact')}<br>Directeur de la publication : ${env('INSTANCE_PUBLISHER','nom du directeur de la publication')}</p>
<h2>Hébergement</h2><p>${env('INSTANCE_HOSTING','nom, adresse et téléphone de l’hébergeur')}</p>
<h2>Logiciel</h2><p>${esc(i.name)} fonctionne avec Multicord, logiciel libre distribué sous licence GNU AGPL-3.0. Conformément à cette licence, le code source est disponible : <a href="${esc(i.source)}">${esc(i.source)}</a>.</p>
<h2>Signaler un contenu</h2><p>Depuis l’application, utilisez le bouton « Signaler » d’un message ou d’un profil. Vous pouvez aussi écrire à ${env('INSTANCE_CONTACT','adresse de contact')} en précisant le contenu concerné, sa localisation et le motif.</p>`;}},
};

export function installLegal(app){
 app.get('/api/instance',(_req,res)=>res.json(instanceInfo()));
 app.get('/legal/:page',(req,res,next)=>{
  const page=PAGES[req.params.page];if(!page)return next();const i=instanceInfo();
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'");
  res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title} — ${esc(i.name)}</title><style>
body{margin:0;background:#171918;color:#d4dccb;font:16px/1.65 system-ui,'Segoe UI',sans-serif}main{max-width:760px;margin:0 auto;padding:40px 18px 64px}a{color:#b9d8b2}
h1{font-size:30px;color:#eef0e6;margin:0 0 6px}h2{font-size:19px;color:#eef0e6;margin:30px 0 8px}.updated{color:#8f9d82;font-size:13px;margin:0 0 26px}
nav{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:30px;font-size:14px}nav a{text-decoration:none;color:#9fb193}nav a[aria-current]{color:#eef0e6;font-weight:600}
ul{padding-left:22px}li{margin:4px 0}mark{background:#e0b06030;color:#f0cf8f;padding:0 4px;border-radius:4px}</style></head><body><main>
<nav><a href="/">← ${esc(i.name)}</a>${Object.entries(PAGES).map(([key,p])=>`<a href="/legal/${key}"${key===req.params.page?' aria-current="page"':''}>${p.title}</a>`).join('')}</nav>
<h1>${page.title}</h1><p class="updated">Dernière mise à jour : ${updated()}</p>${page.body()}</main></body></html>`);
 });
}
