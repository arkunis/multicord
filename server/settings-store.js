import { DEFAULT_SETTINGS,validateSettings } from '../shared/settings.js';
export function createSettingsStore(db){
  const cache=new Map();
  async function get(id){if(cache.has(id))return cache.get(id);const row=await db.one('SELECT data FROM user_settings WHERE user_id=$1',[id]);let stored={};try{stored=row?validateSettings(JSON.parse(row.data)):{};}catch{}const value={...DEFAULT_SETTINGS,...stored};cache.set(id,value);return value;}
  async function patch(id,changes){validateSettings(changes);const result=await db.transaction(async tx=>{await tx.run('UPDATE users SET id=id WHERE id=$1',[id]);const row=await tx.one('SELECT data FROM user_settings WHERE user_id=$1',[id]);let stored={};try{stored=row?validateSettings(JSON.parse(row.data)):{};}catch{}const data={...DEFAULT_SETTINGS,...stored,...changes};await tx.run('INSERT INTO user_settings VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET data=$2,updated_at=$3',[id,JSON.stringify(data),new Date().toISOString()]);return data;});cache.set(id,result);return result;}
  return {get,patch};
}
