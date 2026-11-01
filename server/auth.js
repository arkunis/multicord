import { randomUUID, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { mailMode, sendResetEmail } from './mail.js';
import { identity, ensureHandle } from './identity.js';

export function installAuth(app, { db, io, rate }) {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const publicUser = u => ({ ...identity(u),email:u.email,registered:!!u.email });
  const tokenFrom = req => (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('mc_session='))?.slice(11);
  const authenticate = token => token ? db.one('SELECT users.*,user_handles.discriminator FROM users JOIN sessions ON sessions.user_id=users.id JOIN user_handles ON user_handles.user_id=users.id WHERE sessions.token=$1 AND sessions.expires_at>$2',[hash(token),new Date().toISOString()]) : null;
  const validEmail = email => typeof email==='string' && email.length<=254 && /^\S+@\S+\.\S+$/.test(email);
  const validPassword = password => typeof password==='string' && password.length>=10 && Buffer.byteLength(password,'utf8')<=72;
  const passwordError = 'Choisissez un mot de passe d’au moins 10 caractères (72 octets maximum).';
  async function session(res,user,expectedPassword,req) {
    user.discriminator=await ensureHandle(db,user.id);
    const token=randomBytes(32).toString('hex');
    const values=[hash(token),user.id,new Date(Date.now()+30*86400000).toISOString()];
    if(expectedPassword){
      const issued=await db.transaction(async tx=>{
        await tx.run('UPDATE users SET id=id WHERE id=$1',[user.id]);
        const current=await tx.one('SELECT password FROM users WHERE id=$1',[user.id]);
        if(current?.password!==expectedPassword)return false;
        await tx.run('INSERT INTO sessions VALUES ($1,$2,$3)',values);return true;
      });
      if(!issued)return null;
    }else await db.run('INSERT INTO sessions VALUES ($1,$2,$3)',values);
    const now=new Date().toISOString();
    await db.run('INSERT INTO session_details VALUES ($1,$2,$3,$4,$5)',[randomUUID(),hash(token),String(req?.headers['user-agent']||'Navigateur inconnu').slice(0,512),now,now]);
    res.cookie('mc_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.APP_ORIGIN?.startsWith('https:'),maxAge:30*86400000});
    return publicUser(user);
  }
  function disconnect(userId) {for(const socket of io.sockets.sockets.values())if(socket.data.user?.id===userId)socket.disconnect(true);}
  app.get('/api/auth/session',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const user=await authenticate(tokenFrom(req));res.json({user:user?.email?publicUser(user):null});
  });
  app.post('/api/auth/register',async(req,res)=>{
    if(!rate(`auth:${req.ip}`,20))return res.status(429).json({error:'Trop de tentatives. Réessayez dans une minute.'});
    const {email,password,username}=req.body;
    if(!validEmail(email))return res.status(400).json({error:'Indiquez un e-mail valide.'});
    if(!validPassword(password))return res.status(400).json({error:passwordError});
    if(typeof username!=='string'||!username.trim()||username.trim().length>32||username.includes('#'))return res.status(400).json({error:'Choisissez un pseudo de 1 à 32 caractères, sans #.'});
    // Sur une instance publique (REQUIRE_TERMS=1), l'acceptation des conditions est obligatoire et datée.
    if(process.env.REQUIRE_TERMS==='1'&&req.body.acceptTerms!==true)return res.status(400).json({error:'Acceptez les conditions d’utilisation et la politique de confidentialité pour créer un compte.'});
    const normalized=email.trim().toLowerCase();
    if(await db.one('SELECT id FROM users WHERE email=$1',[normalized]))return res.status(409).json({error:'Un compte utilise déjà cette adresse e-mail.'});
    const guest=await authenticate(tokenFrom(req));
    const user={id:guest&&!guest.email?guest.id:randomUUID(),username:username.trim(),email:normalized,color:'#b9d8b2'};
    const encrypted=await bcrypt.hash(password,12);
    try{await db.run('INSERT INTO users (id,username,email,password,color,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET username=$2,email=$3,password=$4',[user.id,user.username,normalized,encrypted,user.color,new Date().toISOString()]);}
    catch(error){if(error.code==='23505'||error.code?.startsWith('SQLITE_CONSTRAINT'))return res.status(409).json({error:'Un compte utilise déjà cette adresse e-mail.'});throw error;}
    if(guest){await db.run('DELETE FROM sessions WHERE user_id=$1',[guest.id]);disconnect(guest.id);}
    if(req.body.acceptTerms===true)await db.run('UPDATE users SET terms_accepted_at=$1 WHERE id=$2',[new Date().toISOString(),user.id]);
    res.json(await session(res,user,undefined,req));
  });
  app.post('/api/auth/login',async(req,res)=>{
    if(!rate(`auth:${req.ip}`,20))return res.status(429).json({error:'Trop de tentatives. Réessayez dans une minute.'});
    const {email,password}=req.body;
    if(!validEmail(email)||typeof password!=='string'||!password.length||Buffer.byteLength(password)>72)return res.status(401).json({error:'E-mail ou mot de passe incorrect.'});
    const user=await db.one('SELECT * FROM users WHERE email=$1',[email.trim().toLowerCase()]);
    const fallback='$2b$12$C6UzMDM.H6dfI/f/IKcEe.5csYm8TQQhHWAKCbFHBNoU04gyE5N1G';
    const valid=await bcrypt.compare(password,user?.password||fallback);
    if(!user||!valid)return res.status(401).json({error:'E-mail ou mot de passe incorrect.'});
    if(user.suspended_at)return res.status(403).json({error:`Ce compte est suspendu${user.suspended_reason?` (${user.suspended_reason})`:''}.${process.env.INSTANCE_CONTACT?` Pour contester : ${process.env.INSTANCE_CONTACT}.`:''}`});
    const result=await session(res,user,user.password,req);
    if(!result)return res.status(401).json({error:'Le mot de passe a été modifié. Reconnectez-vous.'});
    res.json(result);
  });
  app.post('/api/auth/forgot-password',async(req,res)=>{
    const email=req.body.email;
    if(!validEmail(email))return res.status(400).json({error:'Indiquez un e-mail valide.'});
    if(!rate(`forgot:${req.ip}`,6))return res.status(429).json({error:'Trop de demandes. Réessayez dans une minute.'});
    const mode=mailMode();
    if(mode==='unavailable')return res.status(503).json({error:'L’envoi des e-mails n’est pas encore configuré. Contactez l’administrateur.'});
    const response={message:'Si un compte correspond à cette adresse, un lien valable 30 minutes sera envoyé.',delivery:mode};
    // Réponse identique et découplée du traitement pour ne pas révéler les comptes.
    res.json(response);
    try{
      const normalized=email.trim().toLowerCase();
      if(!rate(`forgot-email:${hash(normalized)}`,3))return;
      const user=await db.one('SELECT id FROM users WHERE email=$1',[normalized]);
      if(!user)return;
      const token=randomBytes(32).toString('hex');
      await db.transaction(async tx=>{
        await tx.run('UPDATE users SET id=id WHERE id=$1',[user.id]);
        await tx.run('DELETE FROM password_resets WHERE user_id=$1 OR expires_at<$2',[user.id,new Date().toISOString()]);
        await tx.run('INSERT INTO password_resets VALUES ($1,$2,$3)',[hash(token),user.id,new Date(Date.now()+30*60000).toISOString()]);
      });
      await sendResetEmail(normalized,token);
    }catch{console.error('Échec de remise d’un e-mail de récupération. Vérifiez la configuration mail.');}
  });
  app.post('/api/auth/reset-password',async(req,res)=>{
    if(!rate(`reset:${req.ip}`,12))return res.status(429).json({error:'Trop de tentatives. Réessayez dans une minute.'});
    const {token,password}=req.body;
    if(typeof token!=='string'||!(/^[a-f0-9]{64}$/).test(token))return res.status(400).json({error:'Lien invalide ou expiré. Demandez un nouveau lien.'});
    if(!validPassword(password))return res.status(400).json({error:passwordError});
    const reset=await db.one('SELECT user_id FROM password_resets WHERE token=$1 AND expires_at>$2',[hash(token),new Date().toISOString()]);
    if(!reset)return res.status(400).json({error:'Lien invalide ou expiré. Demandez un nouveau lien.'});
    const encrypted=await bcrypt.hash(password,12);
    const changed=await db.transaction(async tx=>{
      await tx.run('UPDATE users SET id=id WHERE id=$1',[reset.user_id]);
      const fresh=await tx.one('SELECT user_id FROM password_resets WHERE token=$1 AND expires_at>$2',[hash(token),new Date().toISOString()]);
      if(!fresh)return false;
      await tx.run('UPDATE users SET password=$1 WHERE id=$2',[encrypted,reset.user_id]);
      await tx.run('DELETE FROM password_resets WHERE user_id=$1',[reset.user_id]);
      await tx.run('DELETE FROM sessions WHERE user_id=$1',[reset.user_id]);return true;
    });
    if(!changed)return res.status(400).json({error:'Lien invalide ou déjà utilisé.'});
    disconnect(reset.user_id);res.clearCookie('mc_session').json({message:'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.'});
  });
  app.post('/api/logout',async(req,res)=>{
    const token=tokenFrom(req);const user=await authenticate(token);
    if(token)await db.run('DELETE FROM sessions WHERE token=$1',[hash(token)]);
    if(user)for(const socket of io.sockets.sockets.values())if(socket.data.sessionHash===hash(token))socket.disconnect(true);
    res.clearCookie('mc_session').json({ok:true});
  });
  app.post('/api/account/password',async(req,res)=>{
    const user=await authenticate(tokenFrom(req));
    if(!user?.email)return res.status(401).json({error:'Connectez-vous pour modifier votre mot de passe.'});
    if(!rate(`change-password:${user.id}`,6))return res.status(429).json({error:'Trop de tentatives. Réessayez dans une minute.'});
    const {currentPassword,password}=req.body;
    if(typeof currentPassword!=='string'||Buffer.byteLength(currentPassword)>72||!await bcrypt.compare(currentPassword,user.password))return res.status(400).json({error:'Le mot de passe actuel est incorrect.'});
    if(!validPassword(password))return res.status(400).json({error:passwordError});
    const encrypted=await bcrypt.hash(password,12);
    await db.transaction(async tx=>{
      await tx.run('UPDATE users SET password=$1 WHERE id=$2',[encrypted,user.id]);
      await tx.run('DELETE FROM sessions WHERE user_id=$1',[user.id]);
      await tx.run('DELETE FROM password_resets WHERE user_id=$1',[user.id]);
    });
    disconnect(user.id);await session(res,user,undefined,req);res.json({message:'Mot de passe modifié. Les autres sessions ont été fermées.'});
  });
  app.get('/api/account/sessions',async(req,res)=>{
    const token=tokenFrom(req),user=await authenticate(token);if(!user?.email)return res.status(401).json({error:'Connectez-vous.'});
    const current=hash(token),now=new Date().toISOString();
    await db.run('UPDATE session_details SET last_seen=$1 WHERE token=$2',[now,current]);
    const rows=await db.all('SELECT s.token,s.expires_at,d.id,d.user_agent,d.created_at,d.last_seen FROM sessions s LEFT JOIN session_details d ON d.token=s.token WHERE s.user_id=$1 AND s.expires_at>$2',[user.id,now]);
    for(const row of rows)if(!row.id){row.id=randomUUID();row.user_agent='Ancienne session';row.created_at=null;row.last_seen=null;await db.run('INSERT INTO session_details VALUES ($1,$2,$3,$4,$5) ON CONFLICT(token) DO NOTHING',[row.id,row.token,row.user_agent,now,now]);const detail=await db.one('SELECT id FROM session_details WHERE token=$1',[row.token]);row.id=detail.id;}
    res.json(rows.map(({token,...row})=>({...row,current:token===current})));
  });
  app.delete('/api/account/sessions/:id',async(req,res)=>{
    const user=await authenticate(tokenFrom(req));if(!user?.email)return res.status(401).json({error:'Connectez-vous.'});
    const row=await db.one('SELECT s.token FROM sessions s JOIN session_details d ON d.token=s.token WHERE d.id=$1 AND s.user_id=$2',[req.params.id,user.id]);
    if(!row)return res.status(404).json({error:'Session introuvable.'});
    await db.run('DELETE FROM sessions WHERE token=$1',[row.token]);for(const socket of io.sockets.sockets.values())if(socket.data.sessionHash===row.token)socket.disconnect(true);
    const current=row.token===hash(tokenFrom(req));if(current)res.clearCookie('mc_session');res.json({ok:true,current});
  });
  return {authenticate,publicUser,tokenFrom,tokenHash:hash};
}
