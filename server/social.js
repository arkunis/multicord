import { randomUUID } from 'node:crypto';
import { identity, findHandle } from './identity.js';
import { claimAttachments, withAttachments } from './attachments.js';

const pair=(a,b)=>[a,b].sort();
async function lockPair(tx,a,b){for(const id of pair(a,b))await tx.run('UPDATE users SET id=id WHERE id=$1',[id]);}
const parseForwarded=m=>{let forwarded=null;try{forwarded=m.forwarded?JSON.parse(m.forwarded):null;}catch{}return {...m,forwarded};};
export function installSocial(app,{db,io,online,rate,settings,presenceOf}){
  const notify=(...ids)=>{for(const id of new Set(ids))io.to(`user:${id}`).emit('social:changed');};
  const blocked=(tx,a,b)=>tx.one('SELECT blocker_id FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[a,b]);
  async function allowed(tx,sender,recipient,kind){
    const row=await tx.one('SELECT data FROM user_settings WHERE user_id=$1',[recipient]);let prefs={};try{prefs=JSON.parse(row?.data||'{}');}catch{}
    const policy=prefs[kind]||'everyone';if(policy==='everyone')return true;if(policy==='none')return false;
    if(kind==='dmPolicy'){const [a,b]=pair(sender,recipient);return !!await tx.one("SELECT user_a FROM friendships WHERE user_a=$1 AND user_b=$2 AND status='accepted'",[a,b]);}
    return !!await tx.one('SELECT a.server_id FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=$2',[sender,recipient]);
  }
  const isOnline=async id=>!!await presenceOf(id);
  const person=async id=>{const u=await db.one('SELECT users.id,users.username,users.color,users.avatar,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.id=$1',[id]);return u?{...identity(u),online:await isOnline(id)}:null;};
  const conversationFor=(user,id)=>db.one('SELECT * FROM direct_conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',[id,user]);
  async function notifyContacts(userId){
    const contacts=await db.all('SELECT user_a,user_b FROM friendships WHERE user_a=$1 OR user_b=$1 UNION SELECT user_a,user_b FROM direct_conversations WHERE user_a=$1 OR user_b=$1',[userId]);
    notify(userId,...contacts.map(r=>r.user_a===userId?r.user_b:r.user_a));
  }
  app.get('/api/social',async(req,res)=>{
    const id=req.user.id;
    const rows=await db.all(`SELECT u.id,u.username,u.color,u.avatar,h.discriminator,f.requester_id,f.status FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END JOIN user_handles h ON h.user_id=u.id WHERE f.user_a=$1 OR f.user_b=$1 ORDER BY u.username`,[id]);
    const conversations=await db.all(`SELECT c.*,u.id AS peer_id,u.username,u.color,u.avatar,h.discriminator,
      (SELECT content FROM direct_messages WHERE conversation_id=c.id ORDER BY position DESC LIMIT 1) AS last_content,
      COALESCE((SELECT created_at FROM direct_messages WHERE conversation_id=c.id ORDER BY position DESC LIMIT 1),c.created_at) AS last_at,
      (SELECT COUNT(*) FROM direct_messages WHERE conversation_id=c.id AND sender_id<>$1 AND position>CASE WHEN c.user_a=$1 THEN c.read_a ELSE c.read_b END) AS unread
      FROM direct_conversations c JOIN users u ON u.id=CASE WHEN c.user_a=$1 THEN c.user_b ELSE c.user_a END JOIN user_handles h ON h.user_id=u.id WHERE c.user_a=$1 OR c.user_b=$1 ORDER BY last_at DESC`,[id]);
    const visibility=new Map(await Promise.all([...rows,...conversations].map(async u=>[u.peer_id||u.id,await presenceOf(u.peer_id||u.id)])));
    const decorate=u=>({...identity(u),online:!!visibility.get(u.id),presence:visibility.get(u.id)||null});
    const blocks=await db.all('SELECT u.id,u.username,u.color,u.avatar,h.discriminator FROM user_blocks b JOIN users u ON u.id=b.blocked_id JOIN user_handles h ON h.user_id=u.id WHERE b.blocker_id=$1',[id]);
    res.json({friends:rows.filter(r=>r.status==='accepted').map(decorate),incoming:rows.filter(r=>r.status==='pending'&&r.requester_id!==id).map(decorate),outgoing:rows.filter(r=>r.status==='pending'&&r.requester_id===id).map(decorate),blocked:blocks.map(decorate),conversations:conversations.map(c=>({id:c.id,peer:decorate({...c,id:c.peer_id}),last_content:c.last_content,last_at:c.last_at,unread:Number(c.unread)}))});
  });
  app.post('/api/friends',async(req,res)=>{
    if(!rate(`friend:${req.user.id}`,20))return res.status(429).json({error:'Trop de demandes. Réessayez dans une minute.'});
    const peer=await findHandle(db,req.body.handle);
    if(!peer)return res.status(404).json({error:'Personne ne correspond à cet identifiant. Utilisez le pseudo complet, par exemple Alex#E12K.'});
    const id=req.user.id;if(peer.id===id)return res.status(400).json({error:'C’est votre propre identifiant.'});
    const [a,b]=pair(id,peer.id);
    const result=await db.transaction(async tx=>{
      await lockPair(tx,a,b);
      if(!await allowed(tx,id,peer.id,'friendRequests'))return {error:'Cette personne limite les demandes d’amis.',status:403};
      if(await blocked(tx,a,b))return {error:'Cette interaction n’est pas disponible.',status:403};
      const current=await tx.one('SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b]);
      if(current)return {error:current.status==='accepted'?'Cette personne est déjà dans vos amis.':current.requester_id===id?'Votre demande est déjà envoyée.':'Cette personne vous a déjà envoyé une demande. Acceptez-la dans les demandes reçues.',status:409};
      await tx.run('INSERT INTO friendships VALUES ($1,$2,$3,$4,$5)',[a,b,id,'pending',new Date().toISOString()]);return {ok:true};
    });
    if(result.error)return res.status(result.status).json({error:result.error});
    notify(id,peer.id);res.json({message:'Demande d’ami envoyée.',peer});
  });
  app.post('/api/friends/:id/accept',async(req,res)=>{
    const id=req.user.id,peer=req.params.id,[a,b]=pair(id,peer);
    const accepted=await db.transaction(async tx=>{
      await lockPair(tx,a,b);
      const request=await tx.one('SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b]);
      if(!request||request.status!=='pending'||request.requester_id===id||await blocked(tx,a,b))return false;
      await tx.run('UPDATE friendships SET status=$1 WHERE user_a=$2 AND user_b=$3',['accepted',a,b]);return true;
    });
    if(!accepted)return res.status(404).json({error:'Aucune demande reçue à accepter.'});
    notify(id,peer);res.json({ok:true});
  });
  app.delete('/api/friends/:id',async(req,res)=>{
    const [a,b]=pair(req.user.id,req.params.id);
    await db.transaction(async tx=>{await lockPair(tx,a,b);await tx.run('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b]);});
    notify(a,b);res.json({ok:true});
  });
  app.post('/api/blocks/:id',async(req,res)=>{
    const id=req.user.id,peer=req.params.id;
    if(peer===id||!await person(peer))return res.status(400).json({error:'Compte invalide.'});
    await db.transaction(async tx=>{await lockPair(tx,id,peer);await tx.run('INSERT INTO user_blocks VALUES ($1,$2) ON CONFLICT DO NOTHING',[id,peer]);const [a,b]=pair(id,peer);await tx.run('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b]);});
    notify(id,peer);res.json({ok:true});
  });
  app.delete('/api/blocks/:id',async(req,res)=>{await db.transaction(async tx=>{await lockPair(tx,req.user.id,req.params.id);await tx.run('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[req.user.id,req.params.id]);});notify(req.user.id,req.params.id);res.json({ok:true});});
  // Carte de profil : visible pour soi, ses contacts et les membres d'un serveur commun.
  app.get('/api/users/:id/card',async(req,res)=>{
    const me=req.user.id,id=req.params.id,target=await person(id);if(!target)return res.status(404).json({error:'Profil introuvable.'});
    const [a,b]=pair(me,id);
    const link=me===id||await db.one('SELECT a.server_id FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=$2',[me,id])||await db.one('SELECT user_a FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b])||await db.one('SELECT id FROM direct_conversations WHERE user_a=$1 AND user_b=$2',[a,b]);
    if(!link)return res.status(404).json({error:'Profil introuvable.'});
    const profile=await db.one('SELECT bio,status,banner_color,pronouns,status_expires FROM user_profiles WHERE user_id=$1',[id])||{bio:'',status:'',banner_color:null,pronouns:'',status_expires:null};
    if(profile.status_expires&&profile.status_expires<new Date().toISOString()){profile.status='';profile.status_expires=null;}
    const created=await db.one('SELECT created_at FROM users WHERE id=$1',[id]);
    const server=typeof req.query.server==='string'&&await db.one('SELECT a.server_id FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.server_id=$1 AND a.user_id=$2 AND b.user_id=$3',[req.query.server,me,id]);
    const serverProfile=server?await db.one('SELECT nickname,bio,pronouns FROM server_member_profiles WHERE server_id=$1 AND user_id=$2',[req.query.server,id]):null;
    const friendship=me===id?null:await db.one('SELECT requester_id,status FROM friendships WHERE user_a=$1 AND user_b=$2',[a,b]);
    const mutualFriends=me===id?[]:await db.all(`SELECT u.id,u.username,u.color,u.avatar,h.discriminator FROM users u JOIN user_handles h ON h.user_id=u.id WHERE u.id IN (SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END FROM friendships WHERE (user_a=$1 OR user_b=$1) AND status='accepted') AND u.id IN (SELECT CASE WHEN user_a=$2 THEN user_b ELSE user_a END FROM friendships WHERE (user_a=$2 OR user_b=$2) AND status='accepted') ORDER BY u.username`,[me,id]);
    const servers=me===id?{n:0}:await db.one('SELECT COUNT(*) AS n FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=$2',[me,id]);
    res.json({...target,...profile,created_at:created?.created_at,serverProfile:serverProfile||(server?{nickname:null,bio:'',pronouns:''}:null),friendship:me===id?'self':!friendship?'none':friendship.status==='accepted'?'friends':friendship.requester_id===me?'outgoing':'incoming',mutualFriends:mutualFriends.slice(0,3).map(identity),mutualFriendCount:mutualFriends.length,mutualServerCount:Number(servers.n),blocked:me!==id&&!!await blocked(db,me,id)});
  });
  // Mise à jour partielle : seuls les champs envoyés changent.
  app.patch('/api/profile/card',async(req,res)=>{
    const current=await db.one('SELECT bio,status,banner_color,pronouns,status_expires FROM user_profiles WHERE user_id=$1',[req.user.id])||{bio:'',status:'',banner_color:null,pronouns:'',status_expires:null};
    const v={...current,...Object.fromEntries(Object.entries(req.body).filter(([k])=>k in current))};
    if(typeof v.bio!=='string'||v.bio.length>190||typeof v.status!=='string'||v.status.length>60||typeof v.pronouns!=='string'||v.pronouns.length>40||(v.banner_color!==null&&!(typeof v.banner_color==='string'&&/^#[0-9a-fA-F]{6}$/.test(v.banner_color)))||(v.status_expires!==null&&(typeof v.status_expires!=='string'||Number.isNaN(Date.parse(v.status_expires)))))return res.status(400).json({error:'Bio (190), statut (60), pronoms (40), couleur et date d’expiration valides requis.'});
    const value={bio:v.bio.trim(),status:v.status.trim(),banner_color:v.banner_color,pronouns:v.pronouns.trim(),status_expires:v.status.trim()&&v.status_expires?new Date(v.status_expires).toISOString():null};
    await db.run('INSERT INTO user_profiles (user_id,bio,status,banner_color,pronouns,status_expires) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET bio=$2,status=$3,banner_color=$4,pronouns=$5,status_expires=$6',[req.user.id,value.bio,value.status,value.banner_color,value.pronouns,value.status_expires]);
    for(const m of await db.all('SELECT server_id FROM memberships WHERE user_id=$1',[req.user.id]))io.to(`server:${m.server_id}`).emit('members:changed',{serverId:m.server_id});
    res.json(value);
  });
  app.post('/api/direct',async(req,res)=>{
    if(!rate(`direct-open:${req.user.id}`,30))return res.status(429).json({error:'Trop de nouvelles conversations. Réessayez dans une minute.'});
    const peer=await findHandle(db,req.body.handle);
    if(!peer)return res.status(404).json({error:'Identifiant introuvable. Saisissez le pseudo et le code après #.'});
    if(peer.id===req.user.id)return res.status(400).json({error:'Vous ne pouvez pas ouvrir une conversation avec vous-même.'});
    const [a,b]=pair(req.user.id,peer.id);
    const result=await db.transaction(async tx=>{
      await lockPair(tx,a,b);
      if(await blocked(tx,a,b)||!await allowed(tx,req.user.id,peer.id,'dmPolicy'))return null;
      let conversation=await tx.one('SELECT id FROM direct_conversations WHERE user_a=$1 AND user_b=$2',[a,b]);
      if(!conversation){conversation={id:randomUUID()};await tx.run('INSERT INTO direct_conversations (id,user_a,user_b,created_at) VALUES ($1,$2,$3,$4)',[conversation.id,a,b,new Date().toISOString()]);}
      return conversation;
    });
    if(!result)return res.status(403).json({error:'Cette interaction n’est pas disponible.'});
    notify(a,b);res.json({...result,peer:{...peer,online:await isOnline(peer.id)}});
  });
  app.get('/api/direct/:id/messages',async(req,res)=>{
    const conversation=await conversationFor(req.user.id,req.params.id);
    if(!conversation)return res.status(404).json({error:'Conversation privée introuvable.'});
    const before=Number(req.query.before||2147483647);
    if(!Number.isInteger(before)||before<1)return res.status(400).json({error:'Position de message invalide.'});
    const messages=await db.all('SELECT m.*,u.username,u.color,u.avatar,h.discriminator FROM direct_messages m JOIN users u ON u.id=m.sender_id JOIN user_handles h ON h.user_id=u.id WHERE conversation_id=$1 AND position<$2 ORDER BY position DESC LIMIT 100',[conversation.id,before]);
    const peerId=conversation.user_a===req.user.id?conversation.user_b:conversation.user_a;
    res.json({id:conversation.id,peer:await person(peerId),messages:(await withAttachments(db,messages.reverse(),true)).map(parseForwarded),blocked:!!await blocked(db,req.user.id,peerId)});
  });
  app.post('/api/direct/:id/messages',async(req,res)=>{
    const content=req.body.content,files=Array.isArray(req.body.attachments)?req.body.attachments:[];
    if(typeof content!=='string'||content.length>4000||(!content.trim()&&!files.length))return res.status(400).json({error:'Message de 1 à 4 000 caractères requis.'});
    if(!rate(`direct-message:${req.user.id}`,40))return res.status(429).json({error:'Trop de messages. Réessayez dans une minute.'});
    const conversation=await conversationFor(req.user.id,req.params.id);
    if(!conversation)return res.status(404).json({error:'Conversation privée introuvable.'});
    const peer=conversation.user_a===req.user.id?conversation.user_b:conversation.user_a;
    let message;try{message=await db.transaction(async tx=>{
      await lockPair(tx,req.user.id,peer);
      if(await blocked(tx,req.user.id,peer)||!await allowed(tx,req.user.id,peer,'dmPolicy'))return null;
      await tx.run('UPDATE direct_conversations SET id=id WHERE id=$1',[conversation.id]);
      const last=await tx.one('SELECT COALESCE(MAX(position),0) AS n FROM direct_messages WHERE conversation_id=$1',[conversation.id]);
      const msg={id:randomUUID(),conversation_id:conversation.id,sender_id:req.user.id,content:content.trim(),created_at:new Date().toISOString(),position:Number(last.n)+1};
      await tx.run('INSERT INTO direct_messages (id,conversation_id,sender_id,content,created_at,position) VALUES ($1,$2,$3,$4,$5,$6)',Object.values(msg));
      const field=conversation.user_a===req.user.id?'read_a':'read_b';
      await tx.run(`UPDATE direct_conversations SET ${field}=$1 WHERE id=$2`,[msg.position,conversation.id]);
      return {...msg,attachments:await claimAttachments(tx,{userId:req.user.id,ids:files,conversationId:conversation.id,messageId:msg.id,direct:true})};
    });}catch(e){if(e.status)return res.status(e.status).json({error:e.message});throw e;}
    if(!message)return res.status(403).json({error:'Cette interaction n’est pas disponible.'});
    const current=await person(req.user.id);
    const result={...message,username:current.username,color:current.color,avatar:current.avatar,discriminator:current.discriminator};
    io.to(`user:${req.user.id}`).to(`user:${peer}`).emit('direct:message',result);res.json(result);
  });
  app.post('/api/direct/:id/read',async(req,res)=>{
    const conversation=await conversationFor(req.user.id,req.params.id);
    if(!conversation)return res.status(404).json({error:'Conversation privée introuvable.'});
    const position=req.body.position;
    if(!Number.isInteger(position)||position<0)return res.status(400).json({error:'Position invalide.'});
    const last=await db.one('SELECT COALESCE(MAX(position),0) AS n FROM direct_messages WHERE conversation_id=$1',[conversation.id]);
    const read=Math.min(position,Number(last.n)),field=conversation.user_a===req.user.id?'read_a':'read_b';
    await db.run(`UPDATE direct_conversations SET ${field}=CASE WHEN ${field}<$1 THEN $1 ELSE ${field} END WHERE id=$2`,[read,conversation.id]);
    notify(req.user.id);res.json({ok:true});
  });
  // Modifier son propre message privé.
  app.patch('/api/direct/messages/:id',async(req,res)=>{
    const m=await db.one('SELECT * FROM direct_messages WHERE id=$1',[req.params.id]),conversation=m&&await conversationFor(req.user.id,m.conversation_id);
    if(!conversation)return res.status(404).json({error:'Message introuvable.'});
    if(m.sender_id!==req.user.id)return res.status(403).json({error:'Vous ne pouvez modifier que vos propres messages.'});
    const content=req.body.content,files=Number((await db.one('SELECT COUNT(*) AS n FROM attachments WHERE direct_message_id=$1',[m.id])).n);
    if(typeof content!=='string'||content.length>4000||(!content.trim()&&!files))return res.status(400).json({error:'Message de 1 à 4 000 caractères requis.'});
    const change={id:m.id,conversation_id:m.conversation_id,content:content.trim(),edited_at:new Date().toISOString()};
    await db.run('UPDATE direct_messages SET content=$1,edited_at=$2 WHERE id=$3',[change.content,change.edited_at,m.id]);
    io.to(`user:${conversation.user_a}`).to(`user:${conversation.user_b}`).emit('direct:edited',change);res.json(change);
  });
  // Envoi en privé utilisé par le transfert : mêmes règles que l'envoi normal (blocages, confidentialité).
  async function sendDirect(fromId,toId,{content,forwarded=null,files=[]}){
    const [a,b]=pair(fromId,toId);
    const message=await db.transaction(async tx=>{
      await lockPair(tx,a,b);
      if(await blocked(tx,a,b)||!await allowed(tx,fromId,toId,'dmPolicy'))throw Object.assign(new Error('Cette personne n’accepte pas vos messages privés.'),{status:403});
      let conversation=await tx.one('SELECT id FROM direct_conversations WHERE user_a=$1 AND user_b=$2',[a,b]);
      if(!conversation){conversation={id:randomUUID()};await tx.run('INSERT INTO direct_conversations (id,user_a,user_b,created_at) VALUES ($1,$2,$3,$4)',[conversation.id,a,b,new Date().toISOString()]);}
      const last=await tx.one('SELECT COALESCE(MAX(position),0) AS n FROM direct_messages WHERE conversation_id=$1',[conversation.id]);
      const msg={id:randomUUID(),conversation_id:conversation.id,sender_id:fromId,content,created_at:new Date().toISOString(),position:Number(last.n)+1};
      await tx.run('INSERT INTO direct_messages (id,conversation_id,sender_id,content,created_at,position,forwarded) VALUES ($1,$2,$3,$4,$5,$6,$7)',[...Object.values(msg),forwarded]);
      await tx.run(`UPDATE direct_conversations SET ${a===fromId?'read_a':'read_b'}=$1 WHERE id=$2`,[msg.position,conversation.id]);
      for(const f of files)await tx.run('INSERT INTO attachments (id,uploader_id,conversation_id,direct_message_id,name,mime,size,data,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),fromId,conversation.id,msg.id,f.name,f.mime,f.size,f.data,new Date().toISOString()]);
      return {...msg,forwarded};
    });
    const current=await person(fromId),[decorated]=await withAttachments(db,[message],true);
    io.to(`user:${fromId}`).to(`user:${toId}`).emit('direct:message',parseForwarded({...decorated,username:current.username,color:current.color,avatar:current.avatar,discriminator:current.discriminator}));notify(a,b);
  }
  return {notifyContacts,notify,sendDirect};
}
