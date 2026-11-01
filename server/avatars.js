import express from 'express';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';

export async function normalizeImage(data,kind='icon'){
 const image=sharp(data,{limitInputPixels:20000000,failOn:'warning'}),metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1)throw new Error('Format invalide.');
 return image.rotate().resize(kind==='banner'?1440:512,kind==='banner'?480:512,{fit:'cover',position:'centre'}).webp({quality:85}).toBuffer();
}
export function installAvatars(app,{db,rate,publicUser,publishProfile}){
 app.put('/api/profile/avatar',express.raw({type:()=>true,limit:'5mb'}),async(req,res)=>{
  if(!rate(`avatar:${req.user.id}`,10))return res.status(429).json({error:'Trop de changements de photo. Réessayez dans une minute.'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Choisissez une image JPG, PNG ou WebP.'});
  let output;
  try{
   output=await normalizeImage(req.body);
  }catch{return res.status(400).json({error:'Image invalide. Utilisez un JPG, PNG ou WebP fixe (5 Mo, 20 millions de pixels maximum).'});}
  const version=randomUUID(),avatar=`/api/avatars/${req.user.id}?v=${version}`;
  const user=await db.transaction(async tx=>{
   await tx.run('UPDATE users SET avatar=$1 WHERE id=$2',[avatar,req.user.id]);
   await tx.run('INSERT INTO user_avatars VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET version=$2,data=$3',[req.user.id,version,output.toString('base64')]);
   return tx.one('SELECT users.*,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.id=$1',[req.user.id]);
  });
  const updated=publicUser(user);await publishProfile(updated);res.json(updated);
 });
 app.delete('/api/profile/avatar',async(req,res)=>{
  const user=await db.transaction(async tx=>{
   await tx.run('UPDATE users SET avatar=NULL WHERE id=$1',[req.user.id]);await tx.run('DELETE FROM user_avatars WHERE user_id=$1',[req.user.id]);
   return tx.one('SELECT users.*,user_handles.discriminator FROM users JOIN user_handles ON user_handles.user_id=users.id WHERE users.id=$1',[req.user.id]);
  });
  const updated=publicUser(user);await publishProfile(updated);res.json(updated);
 });
 app.get('/api/avatars/:id',async(req,res)=>{
  const row=await db.one('SELECT version,data FROM user_avatars WHERE user_id=$1',[req.params.id]);
  if(!row||req.query.v!==row.version)return res.status(404).json({error:'Photo indisponible.'});
  res.type('image/webp').send(Buffer.from(row.data,'base64'));
 });
}
