import {DEFAULT_PERMISSIONS,PERMISSIONS} from '../shared/permissions.js';
export async function ensureDefaultRoles(db){await db.run("INSERT INTO server_roles (id,server_id,name,color,permissions,is_default,position) SELECT id || ':everyone',id,'@tout le monde','#96aa88',$1,1,0 FROM servers WHERE 1=1 ON CONFLICT DO NOTHING",[JSON.stringify(DEFAULT_PERMISSIONS)]);}
export async function permissionsFor(db,userId,serverId){
 const server=await db.one('SELECT owner_id FROM servers WHERE id=$1',[serverId]);
 if(!server||!await db.one('SELECT user_id FROM memberships WHERE server_id=$1 AND user_id=$2',[serverId,userId]))return null;
 if(server.owner_id===userId)return Object.fromEntries(Object.keys(PERMISSIONS).map(key=>[key,true]));
 const roles=await db.all('SELECT r.permissions,r.is_default FROM server_roles r WHERE r.server_id=$1 AND (r.is_default=1 OR r.id IN (SELECT role_id FROM server_member_roles WHERE server_id=$1 AND user_id=$2))',[serverId,userId]);
 const result=Object.fromEntries(Object.keys(PERMISSIONS).map(key=>[key,false]));
 // Un droit ajouté après la création du rôle de base prend sa valeur par défaut.
 for(const r of roles){let p={};try{p=JSON.parse(r.permissions);}catch{}for(const key of Object.keys(result))if(p[key]===true||(r.is_default&&!(key in p)&&DEFAULT_PERMISSIONS[key]))result[key]=true;}
 return result;
}
// Un salon sans rôle associé est ouvert à tous ; sinon seuls ces rôles (plus le créateur et les gestionnaires de salons) le voient.
// Un salon sans rôle propre reprend ceux de sa catégorie (catégorie privée).
export async function accessRoles(db,channel){
 const own=await db.all('SELECT role_id FROM channel_roles WHERE channel_id=$1',[channel.id]);
 if(own.length||!channel.category_id)return own.map(r=>r.role_id);
 return (await db.all('SELECT role_id FROM category_roles WHERE category_id=$1',[channel.category_id])).map(r=>r.role_id);
}
export async function canSeeChannel(db,userId,channel,permissions){
 const p=permissions??await permissionsFor(db,userId,channel.server_id);if(!p)return false;
 const roles=await accessRoles(db,channel);
 if(!roles.length||p.manageChannels)return true;
 return !!await db.one(`SELECT role_id FROM server_member_roles WHERE server_id=$1 AND user_id=$2 AND role_id IN (${roles.map((_,i)=>'$'+(i+3)).join(',')})`,[channel.server_id,userId,...roles]);
}
