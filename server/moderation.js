import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {permissionsFor} from './permissions.js';

// Motifs de signalement proposés dans l'application.
export const REPORT_REASONS={illegal:'Contenu illégal',harassment:'Harcèlement ou haine',sexual:'Contenu sexuel ou violent',minors:'Mise en danger de mineurs',spam:'Spam ou arnaque',impersonation:'Usurpation d’identité',other:'Autre'};
// Administrateurs de l'instance (hébergeur) : adresses e-mail séparées par des virgules dans INSTANCE_ADMINS.
export const isInstanceAdmin=user=>!!user?.email&&(process.env.INSTANCE_ADMINS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};

export function installModeration(app,{db,io,rate,channelFor,emitChannel}){
 const safe=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
 const disconnect=userId=>{for(const s of io.sockets.sockets.values())if(s.data.user?.id===userId)s.disconnect(true);};
 const parse=r=>{let snapshot={};try{snapshot=JSON.parse(r.snapshot);}catch{}return {...r,snapshot,reasonLabel:REPORT_REASONS[r.reason]||r.reason};};

 // Signaler un message de salon, un message privé ou un compte. Une copie du contenu est conservée comme preuve.
 app.post('/api/reports',safe(async(req,res)=>{
  const {kind,targetId,reason,details='',goodFaith}=req.body;
  if(!['message','direct_message','user'].includes(kind)||typeof targetId!=='string'||!Object.hasOwn(REPORT_REASONS,reason)||typeof details!=='string'||details.length>2000)fail(400,'Signalement incomplet.');
  if(reason==='illegal'&&goodFaith!==true)fail(400,'Confirmez que votre signalement est fait de bonne foi.');
  if(!rate(`report:${req.user.id}`,10))fail(429,'Trop de signalements. Patientez une minute.');
  let snapshot,targetUser,serverId=null;
  if(kind==='message'){
   const m=await db.one('SELECT messages.*,users.username FROM messages JOIN users ON users.id=messages.user_id WHERE messages.id=$1',[targetId]);
   const ch=m&&await channelFor(req.user.id,m.channel_id);if(!ch)fail(404,'Message introuvable.');
   const server=await db.one('SELECT name FROM servers WHERE id=$1',[ch.server_id]),files=await db.all('SELECT name FROM attachments WHERE message_id=$1',[m.id]);
   snapshot={content:m.content,author:m.username,authorId:m.user_id,channel:ch.name,channelId:ch.id,server:server?.name,created_at:m.created_at,files:files.map(f=>f.name)};targetUser=m.user_id;serverId=ch.server_id;
  }else if(kind==='direct_message'){
   const m=await db.one('SELECT m.*,u.username FROM direct_messages m JOIN users u ON u.id=m.sender_id JOIN direct_conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND (c.user_a=$2 OR c.user_b=$2)',[targetId,req.user.id]);
   if(!m)fail(404,'Message introuvable.');const files=await db.all('SELECT name FROM attachments WHERE direct_message_id=$1',[m.id]);
   snapshot={content:m.content,author:m.username,authorId:m.sender_id,conversation:m.conversation_id,created_at:m.created_at,files:files.map(f=>f.name)};targetUser=m.sender_id;
  }else{
   const u=await db.one('SELECT users.id,users.username,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.id=$1',[targetId]);
   if(!u)fail(404,'Compte introuvable.');const profile=await db.one('SELECT bio,status FROM user_profiles WHERE user_id=$1',[u.id]);
   snapshot={author:u.username,authorId:u.id,handle:`${u.username}#${u.discriminator}`,bio:profile?.bio||'',status:profile?.status||''};targetUser=u.id;
   serverId=typeof req.body.serverId==='string'&&await db.one('SELECT a.server_id FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.server_id=$1 AND a.user_id=$2 AND b.user_id=$3',[req.body.serverId,req.user.id,u.id])?req.body.serverId:null;
  }
  if(targetUser===req.user.id)fail(400,'Vous ne pouvez pas vous signaler vous-même.');
  if(await db.one("SELECT id FROM reports WHERE reporter_id=$1 AND kind=$2 AND target_id=$3 AND status='open'",[req.user.id,kind,targetId]))fail(409,'Vous avez déjà signalé ce contenu. Il est en cours d’examen.');
  const id=randomUUID();
  await db.run('INSERT INTO reports (id,reporter_id,kind,target_id,target_user_id,server_id,reason,details,snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,req.user.id,kind,targetId,targetUser,serverId,reason,details.trim(),JSON.stringify(snapshot),new Date().toISOString()]);
  res.json({ok:true,id});
 }));

 // Liste : l'instance entière pour ses administrateurs, ou les messages d'un serveur pour ses modérateurs.
 async function scopeOf(req,serverId){
  if(isInstanceAdmin(req.user)&&!serverId)return {admin:true};
  if(typeof serverId!=='string')fail(403,'Accès réservé aux administrateurs de l’instance.');
  if(!(await permissionsFor(db,req.user.id,serverId))?.manageMessages)fail(403,'Accès réservé aux modérateurs de ce serveur.');
  return {serverId};
 }
 app.get('/api/reports',safe(async(req,res)=>{
  const scope=await scopeOf(req,req.query.server),status=req.query.status==='handled'?'handled':'open';
  const where=status==='open'?"r.status='open'":"r.status<>'open'";
  const rows=scope.admin
   ?await db.all(`SELECT r.*,u.username AS reporter FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE ${where} ORDER BY r.created_at DESC LIMIT 200`)
   :await db.all(`SELECT r.* FROM reports r WHERE r.server_id=$1 AND r.kind<>'direct_message' AND ${where} ORDER BY r.created_at DESC LIMIT 200`,[scope.serverId]);
  // Les modérateurs d'un serveur ne voient pas qui a signalé ; l'hébergeur oui.
  res.json(rows.map(parse).map(r=>scope.admin?r:{...r,reporter_id:null}));
 }));
 // Décision : classer, rejeter, supprimer le contenu ; suspendre le compte (hébergeur uniquement).
 app.post('/api/reports/:id/decision',safe(async(req,res)=>{
  const report=await db.one('SELECT * FROM reports WHERE id=$1',[req.params.id]);if(!report)fail(404,'Signalement introuvable.');
  const {decision,note=''}=req.body;if(!['dismiss','resolve','delete_content','suspend_user'].includes(decision)||typeof note!=='string'||note.length>1000)fail(400,'Décision invalide.');
  const scope=await scopeOf(req,isInstanceAdmin(req.user)?undefined:report.server_id);
  if(!scope.admin&&(report.server_id!==scope.serverId||report.kind==='direct_message'))fail(403,'Accès refusé.');
  if(decision==='suspend_user'&&!scope.admin)fail(403,'Seul l’hébergeur peut suspendre un compte.');
  if(decision==='delete_content'){
   if(report.kind==='message'){const m=await db.one('SELECT id,channel_id FROM messages WHERE id=$1',[report.target_id]);if(m){const ch=await db.one('SELECT * FROM channels WHERE id=$1',[m.channel_id]);await db.run('DELETE FROM messages WHERE id=$1',[m.id]);if(ch)await emitChannel(ch,'message:deleted',{id:m.id,channel_id:m.channel_id});}}
   else if(report.kind==='direct_message'&&scope.admin){const m=await db.one('SELECT m.id,c.user_a,c.user_b,m.conversation_id FROM direct_messages m JOIN direct_conversations c ON c.id=m.conversation_id WHERE m.id=$1',[report.target_id]);if(m){await db.run('DELETE FROM direct_messages WHERE id=$1',[m.id]);io.to(`user:${m.user_a}`).to(`user:${m.user_b}`).emit('direct:deleted',{id:m.id,conversation_id:m.conversation_id});}}
   else fail(400,'Ce signalement ne porte pas sur un message.');
  }
  if(decision==='suspend_user'){
   if(!report.target_user_id)fail(400,'Aucun compte visé.');if(isInstanceAdmin(await db.one('SELECT email FROM users WHERE id=$1',[report.target_user_id])))fail(400,'Un administrateur de l’instance ne peut pas être suspendu.');
   await db.run('UPDATE users SET suspended_at=$1,suspended_reason=$2 WHERE id=$3',[new Date().toISOString(),note.trim()||REPORT_REASONS[report.reason],report.target_user_id]);
   await db.run('DELETE FROM sessions WHERE user_id=$1',[report.target_user_id]);disconnect(report.target_user_id);
  }
  // Les autres signalements ouverts sur le même contenu sont traités en même temps.
  const now=new Date().toISOString();
  await db.run("UPDATE reports SET status=$1,decision=$2,note=$3,handled_by=$4,handled_at=$5 WHERE (id=$6 OR (kind=$7 AND target_id=$8)) AND status='open'",[decision==='dismiss'?'dismissed':'resolved',decision,note.trim(),req.user.id,now,report.id,report.kind,report.target_id]);
  res.json({ok:true});
 }));
 // Comptes suspendus (hébergeur) et levée de suspension.
 app.get('/api/admin/suspended',safe(async(req,res)=>{if(!isInstanceAdmin(req.user))fail(403,'Accès refusé.');res.json(await db.all('SELECT users.id,users.username,users.suspended_at,users.suspended_reason,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.suspended_at IS NOT NULL ORDER BY users.suspended_at DESC'));}));
 app.post('/api/admin/users/:id/unsuspend',safe(async(req,res)=>{if(!isInstanceAdmin(req.user))fail(403,'Accès refusé.');await db.run('UPDATE users SET suspended_at=NULL,suspended_reason=NULL WHERE id=$1',[req.params.id]);res.json({ok:true});}));

 // Suppression de compte (droit à l'effacement) : mot de passe requis. Les serveurs créés sont supprimés,
 // les données personnelles effacées ; les messages déjà envoyés restent, signés « Compte supprimé ».
 app.delete('/api/account',safe(async(req,res)=>{
  const {password}=req.body||{};const user=await db.one('SELECT * FROM users WHERE id=$1',[req.user.id]);
  if(typeof password!=='string'||!user?.password||!await bcrypt.compare(password,user.password))fail(403,'Mot de passe incorrect.');
  const owned=await db.all('SELECT id,name FROM servers WHERE owner_id=$1',[user.id]);
  const members=owned.length?await db.all(`SELECT server_id,user_id FROM memberships WHERE server_id IN (${owned.map((_,i)=>'$'+(i+1)).join(',')})`,owned.map(s=>s.id)):[];
  await db.transaction(async tx=>{
   for(const s of owned)await tx.run('DELETE FROM servers WHERE id=$1',[s.id]);
   for(const sql of ['DELETE FROM memberships WHERE user_id=$1','DELETE FROM friendships WHERE user_a=$1 OR user_b=$1','DELETE FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1','DELETE FROM user_settings WHERE user_id=$1','DELETE FROM user_avatars WHERE user_id=$1','DELETE FROM user_profiles WHERE user_id=$1','DELETE FROM message_reactions WHERE user_id=$1','DELETE FROM password_resets WHERE user_id=$1','DELETE FROM sessions WHERE user_id=$1'])await tx.run(sql,[user.id]);
   await tx.run("UPDATE users SET username='Compte supprimé',email=NULL,password=NULL,avatar=NULL,color='#7f8b74',deleted_at=$1 WHERE id=$2",[new Date().toISOString(),user.id]);
  });
  for(const s of owned)for(const m of members.filter(x=>x.server_id===s.id&&x.user_id!==user.id))io.to(`user:${m.user_id}`).emit('server:removed',{serverId:s.id,name:s.name,action:'deleted'});
  disconnect(user.id);res.clearCookie('mc_session').json({ok:true,deletedServers:owned.length});
 }));
}
