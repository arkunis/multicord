import express from 'express';
import {randomUUID} from 'node:crypto';

// Pièces jointes : envoyées avant le message (5 Mo max), puis rattachées au message à l'envoi.
// Les fichiers sont stockés en base, comme les avatars, et servis seulement aux personnes qui voient le salon ou la conversation.
export const MAX_ATTACHMENT=5*1024*1024,MAX_PER_MESSAGE=5;
// Types affichés directement dans l'application ; tout le reste est servi en téléchargement.
const INLINE=new Set(['image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav','audio/wave','audio/webm','audio/mp4','audio/x-m4a','audio/aac','audio/flac','video/mp4','video/webm']);
const cleanName=name=>String(name||'fichier').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,120)||'fichier';
const cleanType=type=>/^[\w.+-]+\/[\w.+-]+$/.test(type||'')?type.toLowerCase():'application/octet-stream';
export const attachmentUrl=a=>`/api/attachments/${a.id}/${encodeURIComponent(a.name)}`;
const publicAttachment=a=>({id:a.id,name:a.name,type:a.mime,size:Number(a.size),url:attachmentUrl(a)});

export function installAttachments(app,{db,rate,channelFor}){
 const conversationOf=(userId,id)=>db.one('SELECT id FROM direct_conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',[id,userId]);
 const raw=express.raw({type:()=>true,limit:MAX_ATTACHMENT});
 app.post('/api/attachments',(req,res,next)=>raw(req,res,err=>err?res.status(err.type==='entity.too.large'?413:400).json({error:err.type==='entity.too.large'?'Fichier trop lourd : 5 Mo maximum.':'Fichier illisible.'}):next()),async(req,res)=>{
  const {channel,conversation}=req.query;
  if(!rate(`upload:${req.user.id}`,30))return res.status(429).json({error:'Trop de fichiers envoyés. Patientez une minute.'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Fichier vide.'});
  if(typeof channel==='string'){if(!await channelFor(req.user.id,channel,'sendMessages'))return res.status(403).json({error:'Vous ne pouvez pas envoyer de fichier dans ce salon.'});}
  else if(typeof conversation==='string'){if(!await conversationOf(req.user.id,conversation))return res.status(403).json({error:'Conversation introuvable.'});}
  else return res.status(400).json({error:'Destination du fichier manquante.'});
  let name='fichier';try{name=decodeURIComponent(req.get('X-File-Name')||'fichier');}catch{}
  const a={id:randomUUID(),name:cleanName(name),mime:cleanType(req.get('Content-Type')),size:req.body.length};
  // Les fichiers jamais envoyés dans un message sont effacés au bout d'une heure.
  await db.run('DELETE FROM attachments WHERE message_id IS NULL AND direct_message_id IS NULL AND created_at<$1',[new Date(Date.now()-36e5).toISOString()]);
  await db.run('INSERT INTO attachments (id,uploader_id,channel_id,conversation_id,name,mime,size,data,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.id,req.user.id,typeof channel==='string'?channel:null,typeof conversation==='string'?conversation:null,a.name,a.mime,a.size,req.body.toString('base64'),new Date().toISOString()]);
  res.json(publicAttachment(a));
 });
 app.get('/api/attachments/:id/:name',async(req,res)=>{
  const a=await db.one('SELECT * FROM attachments WHERE id=$1',[req.params.id]);
  const allowed=a&&(a.channel_id?await channelFor(req.user.id,a.channel_id):await conversationOf(req.user.id,a.conversation_id));
  if(!allowed||(!a.message_id&&!a.direct_message_id&&a.uploader_id!==req.user.id))return res.status(404).json({error:'Fichier introuvable.'});
  const inline=INLINE.has(a.mime);
  res.set({'Content-Type':inline||a.mime==='application/pdf'?a.mime:'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=86400','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`});
  res.send(Buffer.from(a.data,'base64'));
 });
}
// Rattache les fichiers envoyés par l'auteur à son message ; refuse ceux d'une autre destination ou déjà utilisés.
export async function claimAttachments(tx,{userId,ids,channelId,conversationId,messageId,direct}){
 if(!ids?.length)return [];
 if(!Array.isArray(ids)||ids.length>MAX_PER_MESSAGE||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Object.assign(new Error(`${MAX_PER_MESSAGE} fichiers maximum par message.`),{status:400});
 const rows=[];
 for(const id of ids){
  const a=await tx.one('SELECT id,name,mime,size FROM attachments WHERE id=$1 AND uploader_id=$2 AND message_id IS NULL AND direct_message_id IS NULL AND '+(direct?'conversation_id=$3':'channel_id=$3'),[id,userId,direct?conversationId:channelId]);
  if(!a)throw Object.assign(new Error('Un fichier joint est introuvable. Ajoutez-le de nouveau.'),{status:400});
  await tx.run(`UPDATE attachments SET ${direct?'direct_message_id':'message_id'}=$1 WHERE id=$2`,[messageId,id]);rows.push(publicAttachment(a));
 }
 return rows;
}
// Ajoute la liste des pièces jointes (sans leur contenu) à chaque message.
export async function withAttachments(db,messages,direct=false){
 if(!messages.length)return messages;
 const column=direct?'direct_message_id':'message_id',ids=messages.map(m=>m.id);
 const rows=await db.all(`SELECT id,name,mime,size,${column} AS owner FROM attachments WHERE ${column} IN (${ids.map((_,i)=>'$'+(i+1)).join(',')}) ORDER BY created_at`,ids);
 return messages.map(m=>({...m,attachments:rows.filter(r=>r.owner===m.id).map(publicAttachment)}));
}
