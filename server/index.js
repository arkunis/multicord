import express from 'express';
import { createServer } from 'node:http';
import { randomUUID, randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { openDatabase, initializeApplication } from './db.js';
import { installAuth } from './auth.js';
import { initializeHandles } from './identity.js';
import { installAvatars } from './avatars.js';
import { installSocial } from './social.js';
import { accessRoles,canSeeChannel,ensureDefaultRoles,permissionsFor } from './permissions.js';
import {DEFAULT_PERMISSIONS} from '../shared/permissions.js';
import {installServerManagement} from './server-management.js';
import {createPresence} from './presence.js';
import {installAttachments,claimAttachments,withAttachments} from './attachments.js';
import {installModeration,isInstanceAdmin} from './moderation.js';
import {installLegal,instanceInfo} from './legal.js';
import { createSettingsStore } from './settings-store.js';

const db = await openDatabase();
await initializeApplication(db);
await initializeHandles(db);
await ensureDefaultRoles(db);
const app = express();
// Derrière un proxy HTTPS (Caddy, Nginx…), TRUST_PROXY=1 fait lire la vraie adresse des visiteurs (limites anti-abus par IP).
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 64000, allowRequest: (req, callback) => {
  callback(null, !req.headers.origin || req.headers.origin === (process.env.APP_ORIGIN || `http://${req.headers.host}`));
} });
const rooms = new Map();
const online = new Map();
const limits = new Map();
app.use(express.json({ limit: '32kb' }));
app.use((req,res,next) => {
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  if (['POST','PUT','DELETE','PATCH'].includes(req.method) && req.headers.origin && req.headers.origin !== (process.env.APP_ORIGIN || `${req.protocol}://${req.headers.host}`)) return res.status(403).json({error:'Origine non autorisée.'});
  next();
});
function rate(key, max=40) {
  const now=Date.now(); const entry=limits.get(key);
  if (!entry || entry.until<now) { limits.set(key,{count:1,until:now+60000}); return true; }
  return ++entry.count<=max;
}
setInterval(()=>{ for(const [k,v] of limits) if(v.until<Date.now()) limits.delete(k); },60000).unref();
const {authenticate,publicUser,tokenFrom,tokenHash}=installAuth(app,{db,io,rate});
app.get('/api/health',(_req,res)=>res.json({service:'multicord',api:1}));
installLegal(app);
app.use('/api',async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  const user=await authenticate(tokenFrom(req));
  if(!user?.email)return res.status(401).json({error:'Connectez-vous pour accéder à Multicord.'});
  if(user.suspended_at)return res.status(403).json({error:'Votre compte est suspendu.',suspended:true});
  req.user=user;next();
});
const settings=createSettingsStore(db);
const presenceOf=createPresence({io,online,settings});
const social=installSocial(app,{db,io,online,rate,settings,presenceOf});
installAttachments(app,{db,rate,channelFor:(...a)=>channelFor(...a)});
installModeration(app,{db,io,rate,channelFor:(...a)=>channelFor(...a),emitChannel:(...a)=>emitChannel(...a)});
// Liste des membres visibles en ligne et leur présence (en ligne, absent, ne pas déranger).
async function presenceMap(userIds){const statuses={};for(const id of userIds){const p=await presenceOf(id);if(p)statuses[id]=p;}return statuses;}
app.get('/api/account/settings',async(req,res)=>res.json(await settings.get(req.user.id)));
app.get('/api/account/export',async(req,res)=>res.json({exportedAt:new Date().toISOString(),profile:publicUser(req.user),settings:await settings.get(req.user.id),messages:await db.all('SELECT id,channel_id,content,created_at FROM messages WHERE user_id=$1 ORDER BY created_at',[req.user.id]),directMessages:await db.all('SELECT id,conversation_id,content,created_at FROM direct_messages WHERE sender_id=$1 ORDER BY created_at',[req.user.id])}));
app.patch('/api/account/settings',async(req,res)=>{
  try{const value=await settings.patch(req.user.id,req.body);await social.notifyContacts(req.user.id);for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[req.user.id]))await emitPresence(m.server_id);io.to(`user:${req.user.id}`).emit('settings:changed',value);res.json(value);}catch(e){if(/Préférence|Valeur/.test(e.message))return res.status(400).json({error:e.message});throw e;}
});
const member = (user,server) => db.one('SELECT user_id FROM memberships WHERE user_id=$1 AND server_id=$2',[user,server]);
async function channelFor(user,id,permission) { const channel=await db.one('SELECT channels.* FROM channels JOIN memberships ON memberships.server_id=channels.server_id WHERE channels.id=$1 AND memberships.user_id=$2',[id,user]);if(!channel)return null;const p=await permissionsFor(db,user,channel.server_id);return (!permission||p?.[permission])&&await canSeeChannel(db,user,channel,p)?channel:null; }
// Les messages d'un salon privé ne partent qu'aux sockets autorisées à le voir.
async function emitChannel(ch,event,payload,except){
  if(!(await accessRoles(db,ch)).length) return (except?except.to(`server:${ch.server_id}`):io.to(`server:${ch.server_id}`)).emit(event,payload);
  for(const s of await io.in(`server:${ch.server_id}`).fetchSockets()) if(s.id!==except?.id&&await canSeeChannel(db,s.data.user.id,ch)) s.emit(event,payload);
}
// Mentions : <@id> pour une personne, <@&id> pour un rôle, @everyone pour tout le salon.
// Sans le droit dédié, @everyone et les rôles restent du texte simple et ne notifient personne.
async function resolveMentions(userId,ch,content){
  const p=await permissionsFor(db,userId,ch.server_id),roles=await db.all('SELECT id,name,mentionable FROM server_roles WHERE server_id=$1 AND is_default=0',[ch.server_id]);
  let text=content;
  // Un rôle « mentionnable » peut être notifié par tout le monde ; les autres demandent le droit dédié.
  if(!p?.mentionEveryone)text=text.replace(/@everyone/g,'@\u200beveryone');
  text=text.replace(/<@&([\w:-]+)>/g,(m,id)=>{const r=roles.find(x=>x.id===id);return r&&(p?.mentionEveryone||r.mentionable)?m:'@'+(r?.name||'rôle');});
  const wanted=new Set([...text.matchAll(/<@([\w-]+)>/g)].map(m=>m[1]));
  if(p?.mentionEveryone&&/@everyone/.test(text))for(const m of await db.all('SELECT user_id FROM memberships WHERE server_id=$1',[ch.server_id]))wanted.add(m.user_id);
  {
    const roleIds=[...text.matchAll(/<@&([\w:-]+)>/g)].map(m=>m[1]);
    for(const id of roleIds)for(const m of await db.all('SELECT user_id FROM server_member_roles WHERE server_id=$1 AND role_id=$2',[ch.server_id,id]))wanted.add(m.user_id);
  }
  wanted.delete(userId);const targets=[];
  for(const id of wanted)if(await member(id,ch.server_id)&&await canSeeChannel(db,id,ch))targets.push(id);
  return {text,targets};
}
// Ajoute l'aperçu du message cité (ou « supprimé ») et décode l'origine d'un message transféré.
// Réactions regroupées par emoji, dans l'ordre où elles ont été ajoutées.
async function reactionsOf(ids){
  if(!ids.length)return {};
  const rows=await db.all(`SELECT message_id,user_id,emoji FROM message_reactions WHERE message_id IN (${ids.map((_,i)=>'$'+(i+1)).join(',')}) ORDER BY created_at`,ids),out={};
  for(const r of rows){const list=out[r.message_id]||=[];let e=list.find(x=>x.emoji===r.emoji);if(!e)list.push(e={emoji:r.emoji,users:[]});e.users.push(r.user_id);}
  return out;
}
async function withReplies(list){
  const reactions=await reactionsOf(list.map(m=>m.id));
  const ids=[...new Set(list.map(m=>m.reply_to).filter(Boolean))];
  const rows=ids.length?await db.all(`SELECT messages.id,messages.user_id,messages.content,users.username,users.color,users.avatar,(SELECT COUNT(*) FROM attachments WHERE attachments.message_id=messages.id) AS files FROM messages JOIN users ON users.id=messages.user_id WHERE messages.id IN (${ids.map((_,i)=>'$'+(i+1)).join(',')})`,ids):[];
  return list.map(m=>{const r=m.reply_to&&rows.find(x=>x.id===m.reply_to);let forwarded=null;try{forwarded=m.forwarded?JSON.parse(m.forwarded):null;}catch{}
    return {...m,forwarded,reactions:reactions[m.id]||[],reply:m.reply_to?(r?{id:r.id,user_id:r.user_id,username:r.username,color:r.color,avatar:r.avatar,content:String(r.content).slice(0,200),files:Number(r.files)}:{deleted:true}):null};});
}
// Copie les pièces jointes d'un message vers un autre (transfert).
async function copyAttachments(tx,files,target){for(const f of files)await tx.run('INSERT INTO attachments (id,uploader_id,channel_id,conversation_id,message_id,direct_message_id,name,mime,size,data,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),target.userId,target.channelId||null,target.conversationId||null,target.messageId||null,target.directMessageId||null,f.name,f.mime,f.size,f.data,new Date().toISOString()]);}
// Ajouter (PUT) ou retirer (DELETE) sa réaction ; 20 emojis différents au plus par message.
const EMOJI=/^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\u20e3]{1,16}$/u;
for(const method of ['put','delete'])app[method]('/api/messages/:id/reactions/:emoji',async(req,res)=>{
  const m=await db.one('SELECT id,channel_id FROM messages WHERE id=$1',[req.params.id]),ch=m&&await channelFor(req.user.id,m.channel_id,'sendMessages');
  if(!ch) return res.status(404).json({error:'Message introuvable.'});
  const emoji=req.params.emoji;if(!EMOJI.test(emoji)||!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(emoji)) return res.status(400).json({error:'Réaction invalide.'});
  if(!rate(`react:${req.user.id}`,60)) return res.status(429).json({error:'Trop de réactions. Patientez un instant.'});
  if(method==='put'){const kinds=await db.all('SELECT DISTINCT emoji FROM message_reactions WHERE message_id=$1',[m.id]);if(kinds.length>=20&&!kinds.some(k=>k.emoji===emoji)) return res.status(409).json({error:'20 réactions différentes au maximum par message.'});
    await db.run('INSERT INTO message_reactions (message_id,user_id,emoji,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[m.id,req.user.id,emoji,new Date().toISOString()]);}
  else await db.run('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3',[m.id,req.user.id,emoji]);
  const change={id:m.id,channel_id:m.channel_id,reactions:(await reactionsOf([m.id]))[m.id]||[]};await emitChannel(ch,'message:reactions',change);res.json(change);
});
app.patch('/api/messages/:id',async(req,res)=>{
  const m=await db.one('SELECT * FROM messages WHERE id=$1',[req.params.id]),ch=m&&await channelFor(req.user.id,m.channel_id);
  if(!ch) return res.status(404).json({error:'Message introuvable.'});
  if(m.user_id!==req.user.id) return res.status(403).json({error:'Vous ne pouvez modifier que vos propres messages.'});
  const content=req.body.content,files=Number((await db.one('SELECT COUNT(*) AS n FROM attachments WHERE message_id=$1',[m.id])).n);
  if(typeof content!=='string'||content.length>4000||(!content.trim()&&!files)) return res.status(400).json({error:'Message de 1 à 4 000 caractères requis.'});
  if(!rate(`edit:${req.user.id}`,40)) return res.status(429).json({error:'Trop de modifications. Patientez un instant.'});
  const {text}=await resolveMentions(req.user.id,ch,content.trim()),edited_at=new Date().toISOString();
  await db.run('UPDATE messages SET content=$1,edited_at=$2 WHERE id=$3',[text,edited_at,m.id]);
  const change={id:m.id,channel_id:m.channel_id,content:text,edited_at};await emitChannel(ch,'message:edited',change);res.json(change);
});
// Transfert d'un message vers des salons du même serveur et/ou en privé à des membres de ce serveur.
app.post('/api/messages/:id/forward',async(req,res)=>{
  const src=await db.one('SELECT messages.*,users.username FROM messages JOIN users ON users.id=messages.user_id WHERE messages.id=$1',[req.params.id]),from=src&&await channelFor(req.user.id,src.channel_id);
  if(!from) return res.status(404).json({error:'Message introuvable.'});
  const {channels=[],users=[],comment=''}=req.body;
  if(!Array.isArray(channels)||!Array.isArray(users)||[...channels,...users].some(x=>typeof x!=='string')||typeof comment!=='string'||comment.length>2000) return res.status(400).json({error:'Destinataires invalides.'});
  if(!channels.length&&!users.length||channels.length+users.length>5) return res.status(400).json({error:'Choisissez de 1 à 5 destinataires.'});
  if(!rate(`forward:${req.user.id}`,20)) return res.status(429).json({error:'Trop de transferts. Patientez une minute.'});
  const targets=[];
  for(const id of new Set(channels)){const ch=await channelFor(req.user.id,id,'sendMessages');if(!ch||ch.server_id!==from.server_id) return res.status(403).json({error:'Vous ne pouvez pas écrire dans l’un des salons choisis.'});targets.push(ch);}
  for(const id of new Set(users)){if(id===req.user.id||!await member(id,from.server_id)) return res.status(400).json({error:'Une des personnes choisies n’est pas membre de ce serveur.'});}
  const server=await db.one('SELECT name FROM servers WHERE id=$1',[from.server_id]),files=await db.all('SELECT * FROM attachments WHERE message_id=$1',[src.id]);
  const origin=JSON.stringify({author:src.username,author_id:src.user_id,channel:from.name,server:server.name,created_at:src.created_at});
  const current=await db.one('SELECT * FROM users WHERE id=$1',[req.user.id]);
  const post=async(ch,content,forwarded)=>{const msg={id:randomUUID(),channel_id:ch.id,user_id:req.user.id,content,created_at:new Date().toISOString(),edited_at:null,reply_to:null,reply_ping:0,forwarded,username:current.username,color:current.color,avatar:current.avatar,pinned_at:null};
    await db.transaction(async tx=>{await tx.run('INSERT INTO messages (id,channel_id,user_id,content,created_at,forwarded) VALUES ($1,$2,$3,$4,$5,$6)',[msg.id,ch.id,req.user.id,content,msg.created_at,forwarded]);if(forwarded)await copyAttachments(tx,files,{userId:req.user.id,channelId:ch.id,messageId:msg.id});});
    await emitChannel(ch,'message',(await withReplies(await withAttachments(db,[msg])))[0]);};
  let failed=0;
  for(const ch of targets){await post(ch,src.content,origin);if(comment.trim())await post(ch,(await resolveMentions(req.user.id,ch,comment.trim())).text,null);}
  for(const id of new Set(users)){try{await social.sendDirect(req.user.id,id,{content:src.content,forwarded:origin,files});if(comment.trim())await social.sendDirect(req.user.id,id,{content:comment.trim()});}catch(e){if(!e.status)throw e;failed++;}}
  res.json({ok:true,failed});
});
async function visibleChannels(user,serverId){
  const p=await permissionsFor(db,user,serverId),channels=await db.all('SELECT * FROM channels WHERE server_id=$1 ORDER BY position,name',[serverId]),access=await db.all('SELECT channel_roles.* FROM channel_roles JOIN channels ON channels.id=channel_roles.channel_id WHERE channels.server_id=$1',[serverId]);
  const result=[];for(const c of channels)if(await canSeeChannel(db,user,c,p))result.push({...c,roles:access.filter(a=>a.channel_id===c.id).map(a=>a.role_id)});return result;
}
// Catégories visibles : publiques, accessibles par rôle, ou toutes pour qui gère les salons.
async function visibleCategories(user,serverId){
  const p=await permissionsFor(db,user,serverId),mine=new Set((await db.all('SELECT role_id FROM server_member_roles WHERE server_id=$1 AND user_id=$2',[serverId,user])).map(r=>r.role_id));
  const categories=await db.all('SELECT * FROM channel_categories WHERE server_id=$1 ORDER BY position,name',[serverId]),access=await db.all('SELECT category_roles.* FROM category_roles JOIN channel_categories c ON c.id=category_roles.category_id WHERE c.server_id=$1',[serverId]);
  return categories.map(c=>({...c,roles:access.filter(a=>a.category_id===c.id).map(a=>a.role_id)})).filter(c=>!c.roles.length||p?.manageChannels||c.roles.some(r=>mine.has(r)));
}
app.get('/api/bootstrap',async(req,res)=>res.json({user:publicUser(req.user),instanceAdmin:isInstanceAdmin(req.user),instance:instanceInfo(),servers:await db.all('SELECT servers.*,server_profiles.icon,server_profiles.banner FROM servers LEFT JOIN server_profiles ON server_profiles.server_id=servers.id JOIN memberships ON servers.id=memberships.server_id WHERE memberships.user_id=$1 ORDER BY servers.created_at',[req.user.id]),publicUrl:process.env.PUBLIC_URL||null,rtc:{iceServers:[{urls:'stun:stun.l.google.com:19302'},...(process.env.TURN_URL?[{urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL}]:[])]}}));
async function publishProfile(updated){
  for(const socket of io.sockets.sockets.values())if(socket.data.user.id===updated.id)socket.data.user=updated;
  const targets=[`user:${updated.id}`];
  const contacts=await db.all('SELECT user_a,user_b FROM friendships WHERE user_a=$1 OR user_b=$1 UNION SELECT user_a,user_b FROM direct_conversations WHERE user_a=$1 OR user_b=$1',[updated.id]);
  for(const c of contacts)targets.push(`user:${c.user_a}`,`user:${c.user_b}`);
  for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[updated.id])){targets.push(`server:${m.server_id}`);emitRooms(m.server_id);}
  const {email,registered,...profile}=updated;
  io.to([...new Set(targets)]).emit('profile:changed',profile);
  await social.notifyContacts(updated.id);
}
installAvatars(app,{db,rate,publicUser,publishProfile});
app.patch('/api/profile',async(req,res)=>{
  const name=req.body.username;
  if(typeof name!=='string'||!name.trim()||name.length>32||name.includes('#')) return res.status(400).json({error:'Pseudo de 1 à 32 caractères requis, sans #.'});
  await db.run('UPDATE users SET username=$1 WHERE id=$2',[name.trim(),req.user.id]);
  const updated=publicUser(await db.one('SELECT users.*,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.id=$1',[req.user.id]));
  await publishProfile(updated);
  res.json(updated);
});
installServerManagement(app,{db,io,rate,onMemberRemoved:async(server,userId,action)=>{
  for(const socket of [...io.sockets.sockets.values()].filter(s=>s.data.user?.id===userId)){
    if(rooms.get(socket.data.voice)?.serverId===server.id){socket.emit('voice:ended',{reason:'Vous avez quitté l’appel : vous ne faites plus partie de ce serveur.'});await leaveVoice(socket);}
    socket.leave(`server:${server.id}`);
  }
  io.to(`user:${userId}`).emit('server:removed',{serverId:server.id,name:server.name,action});await emitPresence(server.id);emitRooms(server.id);
},onVoiceMute:async(serverId,userId,muted)=>{
  for(const socket of io.sockets.sockets.values())if(socket.data.user?.id===userId&&rooms.get(socket.data.voice)?.serverId===serverId)socket.data.serverMuted=muted;
  io.to(`user:${userId}`).emit('voice:server-mute',{serverId,muted});emitRooms(serverId);
},onPermissionsChanged:async id=>{
  for(const socket of io.sockets.sockets.values()){const room=rooms.get(socket.data.voice);if(room?.serverId!==id)continue;
    const ch=await db.one('SELECT * FROM channels WHERE id=$1',[socket.data.voice]);
    if(!ch){socket.emit('voice:ended',{reason:'Ce salon vocal a été supprimé.'});await leaveVoice(socket);}
    else if(!(await permissionsFor(db,socket.data.user.id,id))?.connectVoice||!await canSeeChannel(db,socket.data.user.id,ch)){socket.emit('voice:ended',{reason:'Votre rôle ne permet plus de rejoindre cet appel.'});await leaveVoice(socket);}}
  emitRooms(id);
}});
app.get('/api/servers/:id',async(req,res)=>{
  if(!await member(req.user.id,req.params.id)) return res.status(403).json({error:'Ce serveur est privé.'});
  const members=await db.all('SELECT users.id,users.username,users.color,users.avatar,user_handles.discriminator,p.nickname,p.voice_muted,up.status,up.status_expires FROM users JOIN memberships ON users.id=memberships.user_id JOIN user_handles ON user_handles.user_id=users.id LEFT JOIN server_member_profiles p ON p.server_id=memberships.server_id AND p.user_id=users.id LEFT JOIN user_profiles up ON up.user_id=users.id WHERE memberships.server_id=$1',[req.params.id]);
  const roles=await db.all('SELECT id,name,color,is_default,position,hoist,mentionable FROM server_roles WHERE server_id=$1 ORDER BY position DESC,id',[req.params.id]);
  const assignments=await db.all('SELECT user_id,role_id FROM server_member_roles WHERE server_id=$1',[req.params.id]);
  res.json({permissions:await permissionsFor(db,req.user.id,req.params.id),roles,categories:await visibleCategories(req.user.id,req.params.id),channels:await visibleChannels(req.user.id,req.params.id),members:members.map(({status,status_expires,...m})=>({...m,status:status_expires&&status_expires<new Date().toISOString()?'':status||'',roles:assignments.filter(a=>a.user_id===m.id).map(a=>a.role_id)})),...(s=>({online:Object.keys(s),statuses:s}))(await presenceMap(members.map(m=>m.id))),rooms:roomState().filter(r=>rooms.get(r.channel)?.serverId===req.params.id)});
});
app.post('/api/servers',async(req,res)=>{
  const name=req.body.name;
  if(typeof name!=='string'||!name.trim()||name.length>48) return res.status(400).json({error:'Nom de serveur requis (48 caractères maximum).'});
  if(!rate(`server:${req.user.id}`,10)) return res.status(429).json({error:'Trop de créations.'});
  const server={id:randomUUID(),name:name.trim(),description:'Votre espace, vos idées, vos personnes.',color:req.body.color||'#b9d8b2',owner_id:req.user.id,created_at:new Date().toISOString()};
  if(!/^#[a-fA-F0-9]{6}$/.test(server.color)) server.color='#b9d8b2';
  const created=await db.transaction(async tx=>{
    await tx.run('UPDATE users SET id=id WHERE id=$1',[req.user.id]);
    const count=await tx.one('SELECT COUNT(*) AS n FROM servers WHERE owner_id=$1',[req.user.id]);
    if(Number(count.n)>=5)return false;
    await tx.run('INSERT INTO servers VALUES ($1,$2,$3,$4,$5,$6)',Object.values(server));
    await tx.run('INSERT INTO memberships VALUES ($1,$2)',[server.id,req.user.id]);
    await tx.run('INSERT INTO server_roles (id,server_id,name,color,permissions,is_default,position) VALUES ($1,$2,$3,$4,$5,$6,$7)',[server.id+':everyone',server.id,'@tout le monde','#96aa88',JSON.stringify(DEFAULT_PERMISSIONS),1,0]);
    for(const [index,[category,name,type]] of [['Le coin discussion','général','text'],['On se retrouve','Le lounge','voice']].entries()){const id=randomUUID();await tx.run('INSERT INTO channel_categories (id,server_id,name,position) VALUES ($1,$2,$3,$4)',[id,server.id,category,index]);await tx.run('INSERT INTO channels (id,server_id,name,type,description,category_id,position) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),server.id,name,type,'Bienvenue dans votre nouvel espace.',id,0]);}
    return true;
  });
  if(!created)return res.status(409).json({error:'Vous possédez déjà 5 serveurs. La limite de création est atteinte.'});
  res.json(server);
});
app.post('/api/servers/:id/channels',async(req,res)=>{
  const server=await db.one('SELECT * FROM servers WHERE id=$1',[req.params.id]);
  if(!(await permissionsFor(db,req.user.id,req.params.id))?.manageChannels) return res.status(403).json({error:'Vous ne pouvez pas gérer les salons de ce serveur.'});
  const {name,type}=req.body,category=req.body.category_id||null;
  if(typeof name!=='string'||!name.trim()||name.length>40||!['text','voice'].includes(type)) return res.status(400).json({error:'Nom et type de salon invalides.'});
  if(category&&!await db.one('SELECT id FROM channel_categories WHERE id=$1 AND server_id=$2',[category,server.id])) return res.status(400).json({error:'Catégorie introuvable.'});
  const last=await db.one('SELECT MAX(position) AS n FROM channels WHERE server_id=$1 AND '+(category?'category_id=$2':'category_id IS NULL'),category?[server.id,category]:[server.id]);
  const channel={id:randomUUID(),server_id:server.id,name:name.trim(),type,description:'',category_id:category,position:Number(last?.n??-1)+1};
  await db.run('INSERT INTO channels (id,server_id,name,type,description,category_id,position) VALUES ($1,$2,$3,$4,$5,$6,$7)',Object.values(channel));
  io.to(`server:${server.id}`).emit('channels:changed');
  res.json(channel);
});
// 8 caractères sans glyphes ambigus (0/O, 1/l/I) : facile à dicter et à recopier.
const INVITE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const INVITE_CODE=/^[A-Za-z0-9]{8}$/;
const newInviteCode=()=>Array.from({length:8},()=>INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');
app.post('/api/servers/:id/invite',async(req,res)=>{
  if(!(await permissionsFor(db,req.user.id,req.params.id))?.inviteMembers) return res.status(403).json({error:'Vous ne pouvez pas créer d’invitation.'});
  const existing=await db.one('SELECT code FROM invites WHERE server_id=$1',[req.params.id]);
  if(existing&&INVITE_CODE.test(existing.code)) return res.json({code:existing.code});
  // Les anciens liens hexadécimaux de 24 caractères sont remplacés par un code court.
  for(let attempt=0;attempt<5;attempt++){
    const code=newInviteCode();
    if(await db.one('SELECT code FROM invites WHERE code=$1',[code])) continue;
    await db.transaction(async tx=>{await tx.run('DELETE FROM invites WHERE server_id=$1',[req.params.id]);await tx.run('INSERT INTO invites VALUES ($1,$2,$3)',[code,req.params.id,new Date().toISOString()]);});
    return res.json({code});
  }
  res.status(503).json({error:'Impossible de générer une invitation. Réessayez.'});
});
app.get('/api/invites/:code',async(req,res)=>{
  const invite=await db.one('SELECT servers.id,servers.name,servers.description,servers.color FROM invites JOIN servers ON servers.id=invites.server_id WHERE invites.code=$1',[req.params.code]);
  if(!invite) return res.status(404).json({error:'Invitation introuvable ou expirée.'});
  const count=await db.one('SELECT COUNT(*) AS n FROM memberships WHERE server_id=$1',[invite.id]);
  res.json({code:req.params.code,server:invite,members:Number(count.n),joined:!!await member(req.user.id,invite.id)});
});
app.post('/api/invites/:code',async(req,res)=>{
  const invite=await db.one('SELECT * FROM invites WHERE code=$1',[req.params.code]);
  if(!invite) return res.status(404).json({error:'Invitation introuvable.'});
  if(await db.one('SELECT user_id FROM server_bans WHERE server_id=$1 AND user_id=$2',[invite.server_id,req.user.id])) return res.status(403).json({error:'Vous avez été banni de ce serveur.'});
  await db.run('INSERT INTO memberships VALUES ($1,$2) ON CONFLICT DO NOTHING',[invite.server_id,req.user.id]);
  io.to(`server:${invite.server_id}`).emit('server:updated',{serverId:invite.server_id});
  res.json({server_id:invite.server_id});
});
app.get('/api/channels/:id/messages',async(req,res)=>{
  if(!await channelFor(req.user.id,req.params.id)) return res.status(403).json({error:'Accès refusé.'});
  const messages=await db.all('SELECT messages.*,users.username,users.color,users.avatar,message_pins.pinned_at FROM messages JOIN users ON users.id=messages.user_id LEFT JOIN message_pins ON message_pins.message_id=messages.id WHERE messages.channel_id=$1 ORDER BY messages.created_at DESC LIMIT 100',[req.params.id]);
  res.json(await withReplies(await withAttachments(db,messages.reverse())));
});
app.get('/api/channels/:id/pins',async(req,res)=>{
  if(!await channelFor(req.user.id,req.params.id)) return res.status(403).json({error:'Accès refusé.'});
  res.json(await withReplies(await withAttachments(db,await db.all('SELECT messages.*,users.username,users.color,users.avatar,message_pins.pinned_at FROM message_pins JOIN messages ON messages.id=message_pins.message_id JOIN users ON users.id=messages.user_id WHERE message_pins.channel_id=$1 ORDER BY message_pins.pinned_at DESC',[req.params.id]))));
});
app.get('/api/servers/:id/search',async(req,res)=>{
  if(!await member(req.user.id,req.params.id)) return res.status(403).json({error:'Ce serveur est privé.'});
  const q=typeof req.query.q==='string'?req.query.q.trim().toLocaleLowerCase('fr'):'';
  if(!q||q.length>100) return res.json({messages:[]});
  if(!rate(`search:${req.user.id}`,60)) return res.status(429).json({error:'Trop de recherches. Patientez un instant.'});
  const pattern='%'+q.replace(/[!%_]/g,c=>'!'+c)+'%',visible=new Set((await visibleChannels(req.user.id,req.params.id)).map(c=>c.id));
  res.json({messages:(await db.all("SELECT messages.*,users.username,users.color,users.avatar,channels.name AS channel_name,channels.type AS channel_type FROM messages JOIN channels ON channels.id=messages.channel_id JOIN users ON users.id=messages.user_id WHERE channels.server_id=$1 AND (LOWER(messages.content) LIKE $2 ESCAPE '!' OR LOWER(users.username) LIKE $2 ESCAPE '!') ORDER BY messages.created_at DESC LIMIT 200",[req.params.id,pattern])).filter(m=>visible.has(m.channel_id)).slice(0,50)});
});
function validStreams(ids){return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<=128))].slice(0,2):[];}
function roomState() { return [...rooms.entries()].map(([channel,r])=>({channel,host:r.host,members:[...r.members].map(id=>{const u=io.sockets.sockets.get(id)?.data.user;return {socketId:id,id:u?.id,username:u?.username,color:u?.color,avatar:u?.avatar,serverMuted:!!io.sockets.sockets.get(id)?.data.serverMuted};})})); }
function voiceMembers(channel){const room=rooms.get(channel);return room?[...room.members].map(id=>{const s=io.sockets.sockets.get(id);return {...s?.data.user,socketId:id,streamIds:s?.data.streamIds||[],serverMuted:!!s?.data.serverMuted};}).map(({email,registered,...u})=>u):[];}
function emitRooms(serverId) { io.to(`server:${serverId}`).emit('rooms',{serverId,rooms:roomState().filter(r=>rooms.get(r.channel)?.serverId===serverId)});for(const [channel,room]of rooms)if(room.serverId===serverId)for(const sid of room.members)io.to(sid).emit('voice:members',{members:voiceMembers(channel)}); }
async function emitPresence(serverId) {
  const members=await db.all('SELECT user_id FROM memberships WHERE server_id=$1',[serverId]);
  const statuses=await presenceMap(members.map(m=>m.user_id));
  io.to(`server:${serverId}`).emit('presence',{serverId,online:Object.keys(statuses),statuses});
}
async function leaveVoice(socket) {
  const id=socket.data.voice; const room=rooms.get(id); socket.data.voice=null;
  if(!room) return;
  if(room.host===socket.id) {
    for(const sid of room.members) { const peer=io.sockets.sockets.get(sid); if(peer) {peer.data.voice=null;peer.emit('voice:ended',{reason:'L’hôte a quitté l’appel. Reconnexion avec un nouvel hôte…',rejoin:true});} }
    rooms.delete(id);
  } else { room.members.delete(socket.id); io.to(room.host).emit('voice:peer-left',{peer:socket.id}); }
  emitRooms(room.serverId);
}
io.use(async(socket,next)=>{try{const user=await authenticate(tokenFrom(socket.request));if(!user?.email||user.suspended_at) return next(new Error('Session expirée'));socket.data.user=publicUser(user);socket.data.sessionHash=tokenHash(tokenFrom(socket.request));next();}catch{next(new Error('Connexion impossible'));}});
io.on('connection',async socket=>{
  const user=socket.data.user;
  socket.join(`user:${user.id}`);
  const listen=(name,handler)=>socket.on(name,(...args)=>Promise.resolve().then(()=>handler(...args)).catch(err=>{
    console.error(`Socket ${name}: ${err.message}`);const ack=args.at(-1);if(typeof ack==='function') ack({error:'Action impossible. Réessayez.'});
  }));
  socket.use((packet,next)=>{
    const [event,payload]=packet;const ack=packet.at(-1);
    let valid=rate(`packet:${socket.id}`,1500);
    if(event==='server:watch') valid=valid&&typeof payload==='string'&&payload.length<128;
    if(['message:send','typing','voice:join'].includes(event)) valid=valid&&payload&&typeof payload.channel==='string'&&payload.channel.length<128;
    if(event==='voice:signal') valid=valid&&payload&&typeof payload.to==='string'&&payload.to.length<128&&
      ((!payload.description)||(typeof payload.description.sdp==='string'&&payload.description.sdp.length<48000&&['offer','answer'].includes(payload.description.type)))&&
      ((!payload.candidate)||(typeof payload.candidate==='object'&&typeof payload.candidate.candidate==='string'));
    if(!valid){if(typeof ack==='function')ack({error:'Requête invalide ou trop fréquente.'});return;}
    next();
  });
  if(!online.has(user.id)) online.set(user.id,new Set()); online.get(user.id).add(socket.id);
  listen('server:watch',async(id,ack)=>{if(await member(user.id,id)) {socket.join(`server:${id}`);await emitPresence(id);ack?.({ok:true});}});
  listen('message:send',async({channel,content,attachments,replyTo,replyPing},ack)=>{
    try {
      // Un message peut n'être qu'un fichier : le texte devient alors facultatif.
      const files=Array.isArray(attachments)?attachments:[];
      if(typeof content!=='string'||content.length>4000||(!content.trim()&&!files.length)) return ack?.({error:'Message de 1 à 4 000 caractères requis.'});
      if(!rate(`msg:${user.id}`,40)) return ack?.({error:'Un peu de patience : trop de messages.'});
      const ch=await channelFor(user.id,channel,'sendMessages'); if(!ch) return ack?.({error:'Salon inaccessible.'});
      const current=await db.one('SELECT * FROM users WHERE id=$1',[user.id]);
      const reply=typeof replyTo==='string'?await db.one('SELECT id,user_id FROM messages WHERE id=$1 AND channel_id=$2',[replyTo,channel]):null;
      if(replyTo&&!reply) return ack?.({error:'Le message auquel vous répondez n’existe plus.'});
      const {text,targets}=await resolveMentions(user.id,ch,content.trim());
      // Répondre mentionne l'auteur du message visé, sauf si l'option est coupée.
      const ping=!!reply&&replyPing!==false;
      if(ping&&reply.user_id!==user.id&&!targets.includes(reply.user_id)&&await member(reply.user_id,ch.server_id)&&await canSeeChannel(db,reply.user_id,ch))targets.push(reply.user_id);
      const msg={id:randomUUID(),channel_id:channel,user_id:user.id,content:text,created_at:new Date().toISOString(),edited_at:null,reply_to:reply?.id||null,reply_ping:ping?1:0,forwarded:null,username:current.username,color:current.color,avatar:current.avatar,pinned_at:null};
      try{msg.attachments=await db.transaction(async tx=>{await tx.run('INSERT INTO messages (id,channel_id,user_id,content,created_at,reply_to,reply_ping) VALUES ($1,$2,$3,$4,$5,$6,$7)',[msg.id,channel,user.id,msg.content,msg.created_at,msg.reply_to,msg.reply_ping]);return claimAttachments(tx,{userId:user.id,ids:files,channelId:channel,messageId:msg.id});});}
      catch(e){if(e.status)return ack?.({error:e.message});throw e;}
      await emitChannel(ch,'message',(await withReplies([msg]))[0]);ack?.({ok:true});
      const serverName=(await db.one('SELECT name FROM servers WHERE id=$1',[ch.server_id]))?.name;
      for(const id of targets)io.to(`user:${id}`).emit('mention',{serverId:ch.server_id,serverName,channelId:ch.id,channelName:ch.name,channelType:ch.type,messageId:msg.id,author:current.username,content:msg.content});
    } catch { ack?.({error:'Le message n’a pas pu être envoyé.'}); }
  });
  listen('typing',async({channel})=>{if(!rate(`typing:${socket.id}`,30)) return; const ch=await channelFor(user.id,channel,'sendMessages'); if(ch) await emitChannel(ch,'typing',{channel,username:user.username},socket);});
  listen('voice:join',async({channel,streamIds},ack)=>{
    const ch=await channelFor(user.id,channel,'connectVoice');
    if(!ch||ch.type!=='voice') return ack?.({error:'Salon vocal inaccessible.'});
    if(rooms.get(channel)?.members.size>=8) return ack?.({error:'Ce salon est limité à 8 personnes pendant cette phase de test.'});
    // Un seul appel par compte : une ancienne connexion (onglet fermé, réseau perdu non encore détecté) est libérée.
    for(const other of io.sockets.sockets.values())if(other.id!==socket.id&&other.data.user?.id===user.id&&other.data.voice){other.emit('voice:ended',{reason:'Vous avez rejoint un appel depuis une autre connexion.'});await leaveVoice(other);}
    await leaveVoice(socket);
    let room=rooms.get(channel);
    if(!room){room={host:socket.id,members:new Set(),serverId:ch.server_id};rooms.set(channel,room);}
    room.members.add(socket.id);socket.data.voice=channel;
    socket.data.serverMuted=!!(await db.one('SELECT voice_muted FROM server_member_profiles WHERE server_id=$1 AND user_id=$2',[ch.server_id,user.id]))?.voice_muted;
    socket.data.streamIds=validStreams(streamIds);
    ack?.({host:room.host,isHost:room.host===socket.id,members:voiceMembers(channel)});
    if(room.host!==socket.id) io.to(room.host).emit('voice:peer-joined',{peer:socket.id});
    emitRooms(ch.server_id);
  });
  listen('voice:media',({streamIds}={})=>{const room=rooms.get(socket.data.voice);if(!room||!rate(`media:${socket.id}`,30))return;socket.data.streamIds=validStreams(streamIds);emitRooms(room.serverId);});
  listen('voice:signal',({to,description,candidate})=>{
    const room=rooms.get(socket.data.voice);
    if(!rate(`signal:${socket.id}`,500)||!room||!room.members.has(to)||to===socket.id||(room.host!==socket.id&&room.host!==to)) return;
    io.to(to).emit('voice:signal',{from:socket.id,description,candidate});
  });
  listen('voice:speaking',({speaking}={})=>{const room=rooms.get(socket.data.voice);if(!room||!rate(`speaking:${socket.id}`,240))return;io.to(`server:${room.serverId}`).emit('voice:speaking',{socketId:socket.id,speaking:speaking===true&&!socket.data.serverMuted});});
  // Inactivité signalée par l'application : passe en « Absent » si toutes les connexions le sont.
  listen('presence:away',async({away}={})=>{if(typeof away!=='boolean'||socket.data.away===away||!rate(`away:${socket.id}`,30))return;socket.data.away=away;await social.notifyContacts(user.id);for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[user.id]))await emitPresence(m.server_id);});
  listen('voice:leave',()=>leaveVoice(socket));
  listen('disconnect',async()=>{
    await leaveVoice(socket);online.get(user.id)?.delete(socket.id);if(!online.get(user.id)?.size) online.delete(user.id);
    await social.notifyContacts(user.id);
    for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[user.id])) await emitPresence(m.server_id);
  });
  // Register call/message handlers before the first database await: clients may emit immediately after connect.
  try{
  await social.notifyContacts(user.id);
  for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[user.id])) {socket.join(`server:${m.server_id}`);await emitPresence(m.server_id);}
  }catch(error){console.error('Initialisation présence : '+error.message);}

});
app.use('/api',(_req,res)=>res.status(404).json({error:'Route inconnue.'}));
if(process.argv.includes('--production')) { app.use(express.static(resolve('dist'))); app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html'))); }
else {const {createServer}=await import('vite'); const vite=await createServer({server:{middlewareMode:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/data/**']}},appType:'spa'});app.use(vite.middlewares);}
app.use((err,req,res,next)=>{if(err.type==='entity.too.large')return res.status(413).json({error:'Le fichier est trop volumineux (5 Mo maximum pour une photo).'});console.error(err.message);if(!res.headersSent) res.status(500).json({error:'Une erreur interne est survenue.'});});
const port=Number(process.env.PORT||3000);
http.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Multicord → http://localhost:${http.address().port} (${process.env.DATABASE_URL?'PostgreSQL':'SQLite local'})`));
