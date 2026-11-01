import express from 'express';
import {randomUUID} from 'node:crypto';
import {normalizeImage} from './avatars.js';
import {permissionsFor} from './permissions.js';
import {validatePermissions} from '../shared/permissions.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const color=value=>typeof value==='string'&&/^#[a-fA-F0-9]{6}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max;

export function installServerManagement(app,{db,io,rate,onPermissionsChanged,onMemberRemoved,onVoiceMute}){
 const safe=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
 const serverFor=(tx,id)=>tx.one('SELECT servers.*,server_profiles.icon,server_profiles.banner FROM servers LEFT JOIN server_profiles ON server_profiles.server_id=servers.id WHERE servers.id=$1',[id]);
 async function edit(req,permission,fn){return db.transaction(async tx=>{
  const id=req.params.id;await tx.run('UPDATE servers SET id=id WHERE id=$1',[id]);
  const server=await serverFor(tx,id),permissions=await permissionsFor(tx,req.user.id,id);
  if(!permissions||(permission==='owner'?server.owner_id!==req.user.id:permission==='member'?false:!permissions[permission]))fail(403,'Vous ne disposez pas des droits nécessaires.');
  return fn(tx,server);
 });}
 async function changed(id,permissions=false){if(permissions)await onPermissionsChanged(id);io.to(`server:${id}`).emit('server:updated',{serverId:id,server:await serverFor(db,id)});}
 app.get('/api/servers/:id/manage',safe(async(req,res)=>{
  const permissions=await permissionsFor(db,req.user.id,req.params.id);if(!permissions)fail(403,'Ce serveur est privé.');
  const server=await serverFor(db,req.params.id),roles=await db.all('SELECT * FROM server_roles WHERE server_id=$1 ORDER BY position DESC,id',[server.id]);
  const members=await db.all('SELECT u.id,u.username,u.avatar,u.color,h.discriminator,p.nickname FROM users u JOIN memberships m ON m.user_id=u.id JOIN user_handles h ON h.user_id=u.id LEFT JOIN server_member_profiles p ON p.server_id=m.server_id AND p.user_id=u.id WHERE m.server_id=$1 ORDER BY u.username',[server.id]);
  const assignments=await db.all('SELECT user_id,role_id FROM server_member_roles WHERE server_id=$1',[server.id]);
  res.json({server,permissions,owner:server.owner_id===req.user.id,roles:roles.map(r=>({...r,permissions:JSON.parse(r.permissions)})),members:members.map(m=>({...m,roles:assignments.filter(a=>a.user_id===m.id).map(a=>a.role_id)}))});
 }));
 app.patch('/api/servers/:id',safe(async(req,res)=>{
  const {name,description,color:accent}=req.body;
  if(!text(name,48)||typeof description!=='string'||description.length>300||!color(accent))fail(400,'Nom (48 caractères), description (300 caractères) et couleur valides requis.');
  const updated=await edit(req,'manageServer',async tx=>{await tx.run('UPDATE servers SET name=$1,description=$2,color=$3 WHERE id=$4',[name.trim(),description.trim(),accent,req.params.id]);return serverFor(tx,req.params.id);});
  await changed(req.params.id);res.json(updated);
 }));
 app.put('/api/servers/:id/assets/:kind',express.raw({type:()=>true,limit:'5mb'}),safe(async(req,res)=>{
  const {id,kind}=req.params;if(!['icon','banner'].includes(kind))fail(404,'Image inconnue.');
  const p=await permissionsFor(db,req.user.id,id);if(!p?.manageServer)fail(403,'Accès refusé.');
  if(!rate(`server-image:${req.user.id}`,15))fail(429,'Trop de changements. Réessayez dans une minute.');
  let output;try{if(!Buffer.isBuffer(req.body)||!req.body.length)throw new Error();output=await normalizeImage(req.body,kind);}catch{fail(400,'Image JPG, PNG ou WebP fixe requise (5 Mo et 20 millions de pixels maximum).');}
  const version=randomUUID(),url=`/api/servers/${id}/assets/${kind}?v=${version}`;
  const updated=await edit(req,'manageServer',async tx=>{
   await tx.run('INSERT INTO server_assets VALUES ($1,$2,$3,$4) ON CONFLICT(server_id,kind) DO UPDATE SET version=$3,data=$4',[id,kind,version,output.toString('base64')]);
   await tx.run('INSERT INTO server_profiles (server_id) VALUES ($1) ON CONFLICT DO NOTHING',[id]);
   await tx.run(`UPDATE server_profiles SET ${kind}=$1 WHERE server_id=$2`,[url,id]);return serverFor(tx,id);
  });await changed(id);res.json(updated);
 }));
 app.delete('/api/servers/:id/assets/:kind',safe(async(req,res)=>{
  const {id,kind}=req.params;if(!['icon','banner'].includes(kind))fail(404,'Image inconnue.');
  const updated=await edit(req,'manageServer',async tx=>{await tx.run('DELETE FROM server_assets WHERE server_id=$1 AND kind=$2',[id,kind]);await tx.run(`UPDATE server_profiles SET ${kind}=NULL WHERE server_id=$1`,[id]);return serverFor(tx,id);});await changed(id);res.json(updated);
 }));
 app.get('/api/servers/:id/assets/:kind',safe(async(req,res)=>{
  if(!await permissionsFor(db,req.user.id,req.params.id))fail(403,'Ce serveur est privé.');
  const row=await db.one('SELECT version,data FROM server_assets WHERE server_id=$1 AND kind=$2',[req.params.id,req.params.kind]);if(!row||row.version!==req.query.v)fail(404,'Image indisponible.');res.type('image/webp').send(Buffer.from(row.data,'base64'));
 }));
 app.post('/api/servers/:id/roles',safe(async(req,res)=>{
  const {name,color:accent}=req.body;if(!text(name,32)||!color(accent))fail(400,'Nom de rôle (32 caractères) et couleur valides requis.');
  let permissions;try{permissions=validatePermissions(req.body.permissions);}catch{fail(400,'Permissions invalides.');}
  const role=await edit(req,'owner',async(tx,server)=>{
   const count=await tx.one('SELECT COUNT(*) AS n,MAX(position) AS top FROM server_roles WHERE server_id=$1',[server.id]);if(Number(count.n)>=40)fail(409,'Limite de 40 rôles atteinte.');
   const r={id:randomUUID(),server_id:server.id,name:name.trim(),color:accent,permissions:JSON.stringify(permissions),is_default:0,position:Number(count.top)+1};await tx.run('INSERT INTO server_roles (id,server_id,name,color,permissions,is_default,position) VALUES ($1,$2,$3,$4,$5,$6,$7)',Object.values(r));
   const flags={hoist:req.body.hoist===true?1:0,mentionable:req.body.mentionable===true?1:0};await tx.run('UPDATE server_roles SET hoist=$1,mentionable=$2 WHERE id=$3',[flags.hoist,flags.mentionable,r.id]);return {...r,...flags,permissions};
  });await changed(req.params.id,true);res.json(role);
 }));
 app.patch('/api/servers/:id/roles/:role',safe(async(req,res)=>{
  const {name,color:accent}=req.body;if(!text(name,32)||!color(accent))fail(400,'Nom et couleur de rôle invalides.');
  let permissions;try{permissions=validatePermissions(req.body.permissions);}catch{fail(400,'Permissions invalides.');}
  const role=await edit(req,'owner',async(tx,server)=>{
   const current=await tx.one('SELECT * FROM server_roles WHERE id=$1 AND server_id=$2',[req.params.role,server.id]);if(!current)fail(404,'Rôle introuvable.');
   if(current.is_default&&name!=='@tout le monde')fail(400,'Le rôle de base ne peut pas être renommé.');
   const hoist=current.is_default?0:req.body.hoist===true?1:0,mentionable=current.is_default?0:req.body.mentionable===true?1:0;
   await tx.run('UPDATE server_roles SET name=$1,color=$2,permissions=$3,hoist=$4,mentionable=$5 WHERE id=$6',[name.trim(),accent,JSON.stringify(permissions),hoist,mentionable,current.id]);return {...current,name:name.trim(),color:accent,permissions,hoist,mentionable};
  });await changed(req.params.id,true);res.json(role);
 }));
 // Ordre des rôles, du plus haut au plus bas : il fixe la hiérarchie de modération.
 app.put('/api/servers/:id/roles/order',safe(async(req,res)=>{
  const ids=req.body.roles;if(!Array.isArray(ids)||ids.length>40||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail(400,'Ordre des rôles invalide.');
  await edit(req,'owner',async(tx,server)=>{
   const current=(await tx.all('SELECT id FROM server_roles WHERE server_id=$1 AND is_default=0',[server.id])).map(r=>r.id);
   if(current.length!==ids.length||current.some(id=>!ids.includes(id)))fail(400,'La liste doit contenir chaque rôle une seule fois.');
   for(const [index,id]of ids.entries())await tx.run('UPDATE server_roles SET position=$1 WHERE id=$2',[ids.length-index,id]);
  });await changed(req.params.id,true);res.json({ok:true});
 }));
 app.delete('/api/servers/:id/roles/:role',safe(async(req,res)=>{
  await edit(req,'owner',async(tx,server)=>{const role=await tx.one('SELECT is_default FROM server_roles WHERE id=$1 AND server_id=$2',[req.params.role,server.id]);if(!role)fail(404,'Rôle introuvable.');if(role.is_default)fail(400,'Le rôle de base ne peut pas être supprimé.');await tx.run('DELETE FROM server_roles WHERE id=$1',[req.params.role]);});await changed(req.params.id,true);res.json({ok:true});
 }));
 // Hiérarchie : on ne peut agir que sur un membre dont le rôle le plus haut est sous le sien ; le créateur est hors d’atteinte.
 async function rank(tx,server,userId){if(server.owner_id===userId)return Infinity;const r=await tx.one('SELECT MAX(r.position) AS top FROM server_roles r JOIN server_member_roles m ON m.role_id=r.id WHERE m.server_id=$1 AND m.user_id=$2',[server.id,userId]);return Number(r?.top||0);}
 async function target(tx,server,req,{self=false}={}){
  const id=req.params.user;if(!await tx.one('SELECT user_id FROM memberships WHERE server_id=$1 AND user_id=$2',[server.id,id]))fail(404,'Membre introuvable.');
  if(id===req.user.id){if(!self)fail(400,'Vous ne pouvez pas faire cela sur vous-même.');return id;}
  if(id===server.owner_id)fail(403,'Le créateur du serveur ne peut pas être visé.');
  if(await rank(tx,server,req.user.id)<=await rank(tx,server,id))fail(403,'Ce membre a un rôle égal ou supérieur au vôtre.');return id;
 }
 const memberChanged=id=>io.to(`server:${id}`).emit('members:changed',{serverId:id});
 app.put('/api/servers/:id/members/:user/roles',safe(async(req,res)=>{
  const ids=req.body.roles;if(!Array.isArray(ids)||ids.length>40||ids.some(id=>typeof id!=='string'))fail(400,'Liste de rôles invalide.');
  await edit(req,'manageRoles',async(tx,server)=>{
   const user=await target(tx,server,req,{self:true}),mine=await rank(tx,server,req.user.id),wanted=new Set(ids);
   const current=new Set((await tx.all('SELECT role_id FROM server_member_roles WHERE server_id=$1 AND user_id=$2',[server.id,user])).map(r=>r.role_id));
   for(const id of new Set([...wanted,...current])){
    const role=await tx.one('SELECT position FROM server_roles WHERE id=$1 AND server_id=$2 AND is_default=0',[id,server.id]);if(!role){if(wanted.has(id))fail(400,'Ce rôle ne peut pas être attribué ici.');continue;}
    if(wanted.has(id)!==current.has(id)&&Number(role.position)>=mine)fail(403,'Vous ne pouvez pas attribuer ou retirer un rôle égal ou supérieur au vôtre.');
   }
   await tx.run('DELETE FROM server_member_roles WHERE server_id=$1 AND user_id=$2',[server.id,user]);
   for(const id of wanted)await tx.run('INSERT INTO server_member_roles VALUES ($1,$2,$3)',[server.id,user,id]);
  });await changed(req.params.id,true);res.json({ok:true});
 }));
 app.patch('/api/servers/:id/members/:user/nickname',safe(async(req,res)=>{
  const nickname=req.body.nickname;if(typeof nickname!=='string'||nickname.trim().length>32)fail(400,'Pseudo de 32 caractères maximum.');
  await edit(req,req.params.user===req.user.id?'changeNickname':'manageNicknames',async(tx,server)=>{
   const user=await target(tx,server,req,{self:true});
   await tx.run('INSERT INTO server_member_profiles (server_id,user_id,nickname) VALUES ($1,$2,$3) ON CONFLICT(server_id,user_id) DO UPDATE SET nickname=$3',[server.id,user,nickname.trim()||null]);
  });memberChanged(req.params.id);res.json({nickname:nickname.trim()||null});
 }));
 app.patch('/api/servers/:id/profile',safe(async(req,res)=>{
  const {nickname,bio,pronouns}=req.body;
  if(typeof nickname!=='string'||nickname.trim().length>32||typeof bio!=='string'||bio.length>190||typeof pronouns!=='string'||pronouns.trim().length>40)fail(400,'Pseudo (32), bio (190) et pronoms (40 caractères) valides requis.');
  const value=await edit(req,'member',async(tx,server)=>{
   const p=await permissionsFor(tx,req.user.id,server.id),current=await tx.one('SELECT nickname FROM server_member_profiles WHERE server_id=$1 AND user_id=$2',[server.id,req.user.id]);
   const nick=nickname.trim()||null;if(nick!==(current?.nickname||null)&&!p.changeNickname)fail(403,'Votre rôle ne permet pas de changer de pseudo sur ce serveur.');
   await tx.run('INSERT INTO server_member_profiles (server_id,user_id,nickname,bio,pronouns) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(server_id,user_id) DO UPDATE SET nickname=$3,bio=$4,pronouns=$5',[server.id,req.user.id,nick,bio.trim(),pronouns.trim()]);
   return {nickname:nick,bio:bio.trim(),pronouns:pronouns.trim()};
  });memberChanged(req.params.id);res.json(value);
 }));
 app.put('/api/servers/:id/members/:user/voice-mute',safe(async(req,res)=>{
  if(typeof req.body.muted!=='boolean')fail(400,'État muet invalide.');
  await edit(req,'muteMembers',async(tx,server)=>{
   const user=await target(tx,server,req);
   await tx.run('INSERT INTO server_member_profiles (server_id,user_id,voice_muted) VALUES ($1,$2,$3) ON CONFLICT(server_id,user_id) DO UPDATE SET voice_muted=$3',[server.id,user,req.body.muted?1:0]);
  });await onVoiceMute(req.params.id,req.params.user,req.body.muted);memberChanged(req.params.id);res.json({ok:true});
 }));
 for(const [action,permission]of [['kick','kickMembers'],['ban','banMembers']])app.post(`/api/servers/:id/members/:user/${action}`,safe(async(req,res)=>{
  const server=await edit(req,permission,async(tx,server)=>{
   const user=await target(tx,server,req);
   if(action==='ban')await tx.run('INSERT INTO server_bans VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[server.id,user,req.user.id,new Date().toISOString()]);
   await tx.run('DELETE FROM memberships WHERE server_id=$1 AND user_id=$2',[server.id,user]);return server;
  });
  await onMemberRemoved(server,req.params.user,action);memberChanged(server.id);res.json({ok:true});
 }));
 app.get('/api/servers/:id/bans',safe(async(req,res)=>{
  const p=await permissionsFor(db,req.user.id,req.params.id);if(!p?.banMembers)fail(403,'Accès refusé.');
  res.json(await db.all('SELECT b.user_id,b.created_at,u.username,u.avatar,u.color,h.discriminator FROM server_bans b JOIN users u ON u.id=b.user_id JOIN user_handles h ON h.user_id=u.id WHERE b.server_id=$1 ORDER BY b.created_at DESC',[req.params.id]));
 }));
 app.delete('/api/servers/:id/bans/:user',safe(async(req,res)=>{await edit(req,'banMembers',tx=>tx.run('DELETE FROM server_bans WHERE server_id=$1 AND user_id=$2',[req.params.id,req.params.user]));res.json({ok:true});}));
 app.delete('/api/servers/:id/invite',safe(async(req,res)=>{await edit(req,'manageServer',tx=>tx.run('DELETE FROM invites WHERE server_id=$1',[req.params.id]));res.json({ok:true});}));
 app.patch('/api/channels/:channel',safe(async(req,res)=>{
  const channel=await db.one('SELECT * FROM channels WHERE id=$1',[req.params.channel]);if(!channel)fail(404,'Salon introuvable.');req.params.id=channel.server_id;
  if(!text(req.body.name,40)||typeof req.body.description!=='string'||req.body.description.length>300)fail(400,'Nom (40 caractères) et description (300 caractères) requis.');
  const roles=req.body.roles;if(roles!==undefined&&(!Array.isArray(roles)||roles.length>40||roles.some(id=>typeof id!=='string')))fail(400,'Liste de rôles invalide.');
  const category=req.body.category_id;if(category!==undefined&&category!==null&&typeof category!=='string')fail(400,'Catégorie invalide.');
  const updated=await edit(req,'manageChannels',async tx=>{
   await tx.run('UPDATE channels SET name=$1,description=$2 WHERE id=$3',[req.body.name.trim(),req.body.description.trim(),channel.id]);
   if(category!==undefined&&category!==channel.category_id){if(category&&!await tx.one('SELECT id FROM channel_categories WHERE id=$1 AND server_id=$2',[category,channel.server_id]))fail(400,'Catégorie introuvable.');const last=await tx.one('SELECT MAX(position) AS n FROM channels WHERE server_id=$1 AND '+(category?'category_id=$2':'category_id IS NULL'),category?[channel.server_id,category]:[channel.server_id]);await tx.run('UPDATE channels SET category_id=$1,position=$2 WHERE id=$3',[category,Number(last?.n??-1)+1,channel.id]);}
   if(roles){for(const id of new Set(roles))if(!await tx.one('SELECT id FROM server_roles WHERE id=$1 AND server_id=$2 AND is_default=0',[id,channel.server_id]))fail(400,'Ce rôle n’existe pas sur ce serveur.');
    await tx.run('DELETE FROM channel_roles WHERE channel_id=$1',[channel.id]);for(const id of new Set(roles))await tx.run('INSERT INTO channel_roles VALUES ($1,$2)',[channel.id,id]);}
   return {...channel,name:req.body.name.trim(),description:req.body.description.trim(),category_id:category===undefined?channel.category_id:category,roles:(await tx.all('SELECT role_id FROM channel_roles WHERE channel_id=$1',[channel.id])).map(r=>r.role_id)};
  });
  if(roles||category!==undefined)await onPermissionsChanged(channel.server_id);io.to(`server:${channel.server_id}`).emit('channels:changed');res.json(updated);
 }));
 // Catégories : nom et accès réservé à des rôles (les salons sans rôle propre en héritent).
 const categoryBody=(body)=>{const {name,roles}=body;if(!text(name,40))fail(400,'Nom de catégorie de 1 à 40 caractères requis.');if(!Array.isArray(roles)||roles.length>40||roles.some(id=>typeof id!=='string'))fail(400,'Liste de rôles invalide.');return {name:name.trim(),roles:[...new Set(roles)]};};
 async function setCategoryRoles(tx,serverId,id,roles){for(const r of roles)if(!await tx.one('SELECT id FROM server_roles WHERE id=$1 AND server_id=$2 AND is_default=0',[r,serverId]))fail(400,'Ce rôle n’existe pas sur ce serveur.');await tx.run('DELETE FROM category_roles WHERE category_id=$1',[id]);for(const r of roles)await tx.run('INSERT INTO category_roles VALUES ($1,$2)',[id,r]);}
 // Ordre complet des salons après un glisser-déposer : chaque salon avec sa catégorie (ou null), dans l'ordre affiché.
 app.put('/api/servers/:id/channels/order',safe(async(req,res)=>{
  const items=req.body.channels;if(!Array.isArray(items)||items.length>500||items.some(i=>!i||typeof i.id!=='string'||(i.category_id!==null&&typeof i.category_id!=='string')))fail(400,'Ordre des salons invalide.');
  let moved=false;
  await edit(req,'manageChannels',async(tx,server)=>{
   const channels=await tx.all('SELECT id,category_id FROM channels WHERE server_id=$1',[server.id]),categories=new Set((await tx.all('SELECT id FROM channel_categories WHERE server_id=$1',[server.id])).map(c=>c.id));
   if(channels.length!==items.length||new Set(items.map(i=>i.id)).size!==items.length||channels.some(c=>!items.some(i=>i.id===c.id)))fail(400,'La liste doit contenir chaque salon une seule fois.');
   const positions={};
   for(const item of items){if(item.category_id&&!categories.has(item.category_id))fail(400,'Catégorie introuvable.');const key=item.category_id||'';positions[key]=(positions[key]??-1)+1;
    if(channels.find(c=>c.id===item.id).category_id!==item.category_id)moved=true;
    await tx.run('UPDATE channels SET category_id=$1,position=$2 WHERE id=$3',[item.category_id,positions[key],item.id]);}
  });
  // Changer de catégorie peut changer qui voit le salon (accès hérité).
  if(moved)await onPermissionsChanged(req.params.id);io.to(`server:${req.params.id}`).emit('channels:changed');res.json({ok:true});
 }));
 app.post('/api/servers/:id/categories',safe(async(req,res)=>{
  const body=categoryBody(req.body);
  const category=await edit(req,'manageChannels',async(tx,server)=>{
   const count=await tx.one('SELECT COUNT(*) AS n,MAX(position) AS top FROM channel_categories WHERE server_id=$1',[server.id]);if(Number(count.n)>=30)fail(409,'Limite de 30 catégories atteinte.');
   const c={id:randomUUID(),server_id:server.id,name:body.name,position:Number(count.top??-1)+1};await tx.run('INSERT INTO channel_categories (id,server_id,name,position) VALUES ($1,$2,$3,$4)',Object.values(c));
   await setCategoryRoles(tx,server.id,c.id,body.roles);return {...c,roles:body.roles};
  });io.to(`server:${req.params.id}`).emit('channels:changed');res.json(category);
 }));
 app.patch('/api/categories/:category',safe(async(req,res)=>{
  const current=await db.one('SELECT * FROM channel_categories WHERE id=$1',[req.params.category]);if(!current)fail(404,'Catégorie introuvable.');req.params.id=current.server_id;
  const body=categoryBody(req.body);
  await edit(req,'manageChannels',async tx=>{await tx.run('UPDATE channel_categories SET name=$1 WHERE id=$2',[body.name,current.id]);await setCategoryRoles(tx,current.server_id,current.id,body.roles);});
  await onPermissionsChanged(current.server_id);io.to(`server:${current.server_id}`).emit('channels:changed');res.json({...current,...body});
 }));
 app.delete('/api/categories/:category',safe(async(req,res)=>{
  const current=await db.one('SELECT * FROM channel_categories WHERE id=$1',[req.params.category]);if(!current)fail(404,'Catégorie introuvable.');req.params.id=current.server_id;
  // Les salons ne sont pas supprimés : ils remontent hors catégorie.
  await edit(req,'manageChannels',async tx=>{await tx.run('UPDATE channels SET category_id=NULL WHERE category_id=$1',[current.id]);await tx.run('DELETE FROM channel_categories WHERE id=$1',[current.id]);});
  await onPermissionsChanged(current.server_id);io.to(`server:${current.server_id}`).emit('channels:changed');res.json({ok:true});
 }));
 app.delete('/api/channels/:channel',safe(async(req,res)=>{
  const channel=await db.one('SELECT * FROM channels WHERE id=$1',[req.params.channel]);if(!channel)fail(404,'Salon introuvable.');req.params.id=channel.server_id;
  await edit(req,'manageChannels',async tx=>{
   if(channel.type==='text'&&Number((await tx.one("SELECT COUNT(*) AS n FROM channels WHERE server_id=$1 AND type='text'",[channel.server_id])).n)<=1)fail(409,'Le serveur doit garder au moins un salon textuel.');
   await tx.run('DELETE FROM channels WHERE id=$1',[channel.id]);
  });
  await onPermissionsChanged(channel.server_id);io.to(`server:${channel.server_id}`).emit('channels:changed');res.json({ok:true});
 }));
 app.delete('/api/messages/:message',safe(async(req,res)=>{
  const message=await db.one('SELECT m.*,c.server_id FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.id=$1',[req.params.message]);if(!message)fail(404,'Message introuvable.');req.params.id=message.server_id;
  await edit(req,message.user_id===req.user.id?'member':'manageMessages',tx=>tx.run('DELETE FROM messages WHERE id=$1',[message.id]));io.to(`server:${message.server_id}`).emit('message:deleted',{id:message.id,channel_id:message.channel_id});res.json({ok:true});
 }));
 async function pin(req,res,pinned){
  const message=await db.one('SELECT m.id,m.channel_id,c.server_id FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.id=$1',[req.params.message]);if(!message)fail(404,'Message introuvable.');req.params.id=message.server_id;
  const pinned_at=pinned?new Date().toISOString():null;
  await edit(req,'pinMessages',async tx=>{
   if(!pinned)return tx.run('DELETE FROM message_pins WHERE message_id=$1',[message.id]);
   const count=await tx.one('SELECT COUNT(*) AS n FROM message_pins WHERE channel_id=$1',[message.channel_id]);if(Number(count.n)>=50)fail(409,'Ce salon a déjà 50 messages épinglés.');
   await tx.run('INSERT INTO message_pins VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[message.id,message.channel_id,req.user.id,pinned_at]);
  });
  io.to(`server:${message.server_id}`).emit('message:pinned',{id:message.id,channel_id:message.channel_id,pinned_at});res.json({ok:true,pinned_at});
 }
 app.post('/api/messages/:message/pin',safe((req,res)=>pin(req,res,true)));
 app.delete('/api/messages/:message/pin',safe((req,res)=>pin(req,res,false)));
}
