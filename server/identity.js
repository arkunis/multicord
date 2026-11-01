import { randomInt } from 'node:crypto';

export const identity = user => ({ id:user.id,username:user.username,color:user.color,avatar:user.avatar||null,discriminator:user.discriminator,handle:`${user.username}#${user.discriminator}` });
export async function ensureHandle(db,userId) {
  const current=await db.one('SELECT discriminator FROM user_handles WHERE user_id=$1',[userId]);
  if(current)return current.discriminator;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for(let attempt=0;attempt<100;attempt++){
    let code='';for(let i=0;i<4;i++)code+=alphabet[randomInt(alphabet.length)];
    if(!/[A-Z]/.test(code)||!/[0-9]/.test(code))continue;
    const added=await db.one('INSERT INTO user_handles (user_id,discriminator) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING discriminator',[userId,code]);
    if(added)return added.discriminator;
    const concurrent=await db.one('SELECT discriminator FROM user_handles WHERE user_id=$1',[userId]);
    if(concurrent)return concurrent.discriminator;
  }
  throw new Error('Impossible d’attribuer un identifiant unique. Réessayez.');
}
export async function initializeHandles(db) {
  for(const user of await db.all('SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM user_handles)'))await ensureHandle(db,user.id);
}
export async function findHandle(db,value) {
  if(typeof value!=='string'||value.length>50)return null;
  const separator=value.lastIndexOf('#');
  if(separator<1)return null;
  const name=value.slice(0,separator).trim().normalize('NFKC').toLowerCase();
  const code=value.slice(separator+1).trim().toUpperCase();
  if(!/^[A-Z0-9]{4}$/.test(code))return null;
  const user=await db.one('SELECT users.id,users.username,users.color,users.avatar,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE user_handles.discriminator=$1 AND users.email IS NOT NULL',[code]);
  return user&&user.username.normalize('NFKC').toLowerCase()===name?identity(user):null;
}
