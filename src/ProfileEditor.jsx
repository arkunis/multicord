import React,{useEffect,useState} from 'react';
import {Check,LoaderCircle,Smile,X} from 'lucide-react';
import {api} from './api';
import ProfilePicture from './ProfilePicture';
import AvatarEditor from './AvatarEditor';

const EMOJIS='😀 😎 🎮 🎧 ☕ 🍕 💤 🔥 🎉 💚 🚀 📚 🏃 🌙 🤔 👀 🎵 ✨'.split(' ');
const pad=n=>String(n).padStart(2,'0');
// Choix d'expiration du statut, calculés au moment de l'ouverture.
function expiryChoices(){
 const now=new Date(),tomorrow=new Date(now.getTime()+864e5),endOfDay=new Date(now);endOfDay.setHours(23,59,59,0);
 return [['never','Ne pas effacer',null],['30m','Effacer dans 30 minutes',new Date(now.getTime()+18e5)],['1h','Effacer dans 1 heure',new Date(now.getTime()+36e5)],['4h','Effacer dans 4 heures',new Date(now.getTime()+144e5)],['today','Effacer ce soir',endOfDay],['tomorrow',`Effacer demain à ${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`,tomorrow]];
}

// Aperçu partagé : bannière, avatar, bulle de statut, nom, identifiant et pronoms.
export function ProfilePreview({user,banner,status,name,pronouns,bio,compact}){
 return <div className={`profile-preview ${compact?'compact':''}`}><div className="profile-preview-banner" style={{background:banner||user.color}}/><div className="profile-preview-head"><ProfilePicture user={user} style={{width:compact?72:96,height:compact?72:96,borderRadius:'50%',color:'#293029',fontSize:compact?24:32}}><i/></ProfilePicture>{status!==undefined&&<div className={`profile-card-bubble ${status?'':'empty'}`}>{status||'Quoi de neuf ?'}</div>}</div>
  <div className="profile-preview-body"><h3>{name||user.username}</h3><span className="profile-preview-handle">{user.username}#{user.discriminator}{pronouns&&<> • {pronouns}</>}</span>{bio&&<p>{bio}</p>}</div></div>;
}

// Fenêtre « Définir ton statut ».
export function StatusModal({user,card,onClose,onSaved,onError}){
 const choices=expiryChoices(),[text,setText]=useState(card.status||''),[expiry,setExpiry]=useState(card.status_expires?'keep':'tomorrow'),[busy,setBusy]=useState(false),[emoji,setEmoji]=useState(false);
 const options=card.status_expires?[['keep',`Garder l’expiration (${new Date(card.status_expires).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'})})`,new Date(card.status_expires)],...choices]:choices;
 async function save(value){setBusy(true);try{const at=options.find(o=>o[0]===expiry)?.[2];const next=await api('/profile/card',{method:'PATCH',body:JSON.stringify({status:value,status_expires:value&&at?at.toISOString():null})});onSaved(next);onClose();}catch(e){onError(e.message);}finally{setBusy(false);}}
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="status-modal" role="dialog" aria-modal="true" aria-label="Définir ton statut">
  <header><h2>Définir ton statut</h2><button className="status-modal-close" aria-label="Fermer" onClick={onClose}><X size={20}/></button></header>
  <ProfilePreview compact user={user} banner={card.banner_color} status={text} pronouns={card.pronouns}/>
  <form onSubmit={e=>{e.preventDefault();save(text.trim());}}>
   <label htmlFor="status-text">Statut</label>
   <div className="status-input"><button type="button" aria-label="Ajouter un emoji" aria-expanded={emoji} onClick={()=>setEmoji(!emoji)}><Smile size={20}/></button><input id="status-text" autoFocus maxLength={60} placeholder="Je viens juste de monter de niveau dans…" value={text} onChange={e=>setText(e.target.value)}/>{text&&<button type="button" aria-label="Vider le statut" onClick={()=>setText('')}><X size={15}/></button>}
    {emoji&&<div className="status-emoji">{EMOJIS.map(e=><button type="button" key={e} onClick={()=>{setText(t=>(t+e).slice(0,60));setEmoji(false);}}>{e}</button>)}</div>}</div>
   <footer><select aria-label="Expiration du statut" value={expiry} onChange={e=>setExpiry(e.target.value)}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>{card.status&&<button type="button" className="status-clear" disabled={busy} onClick={()=>save('')}>Effacer</button>}<button className="status-save" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:'Enregistrer'}</button></footer>
  </form>
 </section></div>;
}

// Éditeur complet : profil principal (visible partout) ou profil propre à un serveur.
export default function ProfileEditor({user,server,initialTab,canNickname,onClose,onUserChange,onNotify,onError}){
 const [tab,setTab]=useState(server?initialTab:'main'),[card,setCard]=useState(null),[busy,setBusy]=useState(false);
 const [main,setMain]=useState(null),[local,setLocal]=useState(null);
 useEffect(()=>{api(`/users/${user.id}/card${server?`?server=${server.id}`:''}`).then(c=>{setCard(c);setMain({username:user.username,pronouns:c.pronouns||'',bio:c.bio||'',banner_color:c.banner_color||user.color});setLocal({nickname:c.serverProfile?.nickname||'',pronouns:c.serverProfile?.pronouns||'',bio:c.serverProfile?.bio||''});}).catch(e=>{onError(e.message);onClose();});},[]);
 async function save(){setBusy(true);try{
  if(tab==='main'){if(main.username.trim()!==user.username)onUserChange(await api('/profile',{method:'PATCH',body:JSON.stringify({username:main.username})}));const next=await api('/profile/card',{method:'PATCH',body:JSON.stringify({pronouns:main.pronouns,bio:main.bio,banner_color:main.banner_color})});setCard(c=>({...c,...next}));onNotify('Profil principal enregistré.');}
  else{const next=await api(`/servers/${server.id}/profile`,{method:'PATCH',body:JSON.stringify(local)});setCard(c=>({...c,serverProfile:next}));onNotify(`Profil sur ${server.name} enregistré.`);}
 }catch(e){onError(e.message);}finally{setBusy(false);}}
 const field=(state,set,key,label,max,hint,multiline,placeholder)=>{const Field=multiline?'textarea':'input';return <label className="profile-editor-field"><span>{label}</span>{hint&&<small>{hint}</small>}<Field value={state[key]} maxLength={max} rows={multiline?4:undefined} placeholder={placeholder} onChange={e=>set(s=>({...s,[key]:e.target.value}))}/><em>{state[key].length}/{max}</em></label>;};
 const preview=card&&(tab==='main'?{name:main.username,pronouns:main.pronouns,bio:main.bio,banner:main.banner_color}:{name:local.nickname||main.username,pronouns:local.pronouns||main.pronouns,bio:local.bio||main.bio,banner:main.banner_color});
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="profile-editor" role="dialog" aria-modal="true" aria-label="Modifier le profil">
  <button className="status-modal-close profile-editor-close" aria-label="Fermer" onClick={onClose}><X size={20}/></button>
  {!card?<div className="profile-card-loading"><LoaderCircle className="spin" size={20}/></div>:<>
   <aside><ProfilePreview user={user} banner={preview.banner} status={card.status} name={preview.name} pronouns={preview.pronouns} bio={preview.bio}/><p className="profile-editor-note">{tab==='main'?'Ton profil principal est visible par tout le monde.':`Visible uniquement par les membres de ${server.name}. Les champs vides reprennent ton profil principal.`}</p></aside>
   <div className="profile-editor-form">
    <nav>{[['main','Profil principal'],...(server?[['server',`Profil sur ${server.name}`]]:[])].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='main'?<>
     {field(main,setMain,'username','Nom d’affichage',32,'Ton identifiant garde le même code après #.')}
     {field(main,setMain,'pronouns','Pronoms',40,null,false,'Ajoute tes pronoms')}
     {field(main,setMain,'bio','À propos de moi',190,null,true,'Parle un peu de toi…')}
     <label className="profile-editor-field color"><span>Couleur de la bannière</span><input type="color" value={main.banner_color} onChange={e=>setMain(s=>({...s,banner_color:e.target.value}))}/></label>
     <AvatarEditor user={user} onUserChange={onUserChange}/>
    </>:<>
     {canNickname?field(local,setLocal,'nickname','Pseudo sur le serveur',32,null,false,main.username):<p className="settings-hint">Ton rôle ne permet pas de changer de pseudo sur ce serveur.</p>}
     {field(local,setLocal,'pronouns','Pronoms sur le serveur',40,null,false,main.pronouns||'Reprend tes pronoms principaux')}
     {field(local,setLocal,'bio','Bio sur le serveur',190,null,true,main.bio||'Reprend ta bio principale')}
    </>}
    <div className="profile-editor-actions"><button className="secondary" onClick={onClose}>Fermer</button><button className="primary" disabled={busy||(tab==='main'&&!main.username.trim())} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:<><Check size={16}/> Enregistrer</>}</button></div>
   </div>
  </>}
 </section></div>;
}
