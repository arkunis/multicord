import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {CalendarDays,Check,Copy,Ellipsis,LoaderCircle,Palette,Pencil,Plus,Send,UserCheck,UserPlus,Volume2,X} from 'lucide-react';
import {api,post} from './api';
import {copyText} from './clipboard';
import ProfilePicture from './ProfilePicture';

// Fiche profil ouverte au clic sur un membre. Les champs du profil par serveur remplacent ceux du profil principal.
export default function ProfileCard({userId,anchor,member,server,roles,myRank,canManageRoles,online,voice,refresh,onClose,onEditProfile,onEditStatus,onOpenVoice,onMenu,onRoles,onNotify,onError}){
 const [card,setCard]=useState(null),[message,setMessage]=useState(''),[adding,setAdding]=useState(false),[editMenu,setEditMenu]=useState(false),[busy,setBusy]=useState(false),[position,setPosition]=useState({left:-9999,top:0});
 const box=useRef(),bannerTimer=useRef();
 useEffect(()=>{let active=true;api(`/users/${userId}/card${server?`?server=${server.id}`:''}`).then(c=>active&&setCard(c)).catch(e=>{onError(e.message);onClose();});return()=>{active=false;};},[userId,refresh]);
 useLayoutEffect(()=>{const el=box.current;if(!el)return;const w=el.offsetWidth,h=el.offsetHeight,gap=12;
  let left=anchor.left-w-gap;if(left<8)left=Math.min(anchor.right+gap,innerWidth-w-8);
  setPosition({left,top:Math.max(8,Math.min(anchor.top-20,innerHeight-h-8))});},[card,adding,editMenu,anchor,voice?.members.length]);
 useEffect(()=>{const close=e=>{if(e.key==='Escape'||(e.type==='pointerdown'&&!box.current?.contains(e.target)))onClose();};window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);};},[]);
 const self=card?.friendship==='self',local=card?.serverProfile,name=member?.nickname||card?.username,bio=local?.bio||card?.bio,pronouns=local?.pronouns||card?.pronouns;
 async function saveBanner(value){try{await api('/profile/card',{method:'PATCH',body:JSON.stringify({banner_color:value})});}catch(e){onError(e.message);}}
 async function send(e){e.preventDefault();const text=message.trim();if(!text)return;setBusy(true);try{const conversation=await post('/direct',{handle:card.handle});await post(`/direct/${conversation.id}/messages`,{content:text});setMessage('');onNotify(`Message envoyé à ${name}.`);}catch(err){onError(err.message);}finally{setBusy(false);}}
 async function befriend(){setBusy(true);try{await post('/friends',{handle:card.handle});setCard(c=>({...c,friendship:c.friendship==='incoming'?'friends':'outgoing'}));onNotify(card.friendship==='incoming'?'Vous êtes maintenant amis.':'Demande d’ami envoyée.');}catch(e){onError(e.message);}finally{setBusy(false);}}
 const memberRoles=member?(roles||[]).filter(r=>member.roles.includes(r.id)):[],addable=(roles||[]).filter(r=>!r.is_default&&!member?.roles.includes(r.id)&&r.position<myRank);
 return <div className="profile-card" ref={box} role="dialog" aria-label={`Profil de ${name||''}`} style={position}>
  {!card?<div className="profile-card-loading"><LoaderCircle className="spin" size={18}/></div>:<>
   <div className="profile-card-banner" style={{background:card.banner_color||card.color}}>
    <div className="profile-card-tools">
     {self&&<label className="profile-card-tool" title="Couleur de la bannière"><Palette size={15}/><input type="color" aria-label="Couleur de la bannière" value={card.banner_color||card.color} onChange={e=>{const value=e.target.value;setCard(c=>({...c,banner_color:value}));clearTimeout(bannerTimer.current);bannerTimer.current=setTimeout(()=>saveBanner(value),600);}}/></label>}
     {!self&&!card.blocked&&card.friendship!=='friends'&&<button className="profile-card-tool" title={card.friendship==='outgoing'?'Demande envoyée':card.friendship==='incoming'?'Accepter la demande d’ami':'Ajouter en ami'} disabled={busy||card.friendship==='outgoing'} onClick={befriend}>{card.friendship==='outgoing'?<Check size={15}/>:<UserPlus size={15}/>}</button>}
     {!self&&card.friendship==='friends'&&<span className="profile-card-tool" title="Vous êtes amis"><UserCheck size={15}/></span>}
     {member&&<button className="profile-card-tool" title="Plus d’options" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onMenu({clientX:r.left,clientY:r.bottom+4,preventDefault(){},stopPropagation(){}});}}><Ellipsis size={15}/></button>}
    </div>
   </div>
   <div className="profile-card-head">
    <ProfilePicture user={card} style={{width:84,height:84,borderRadius:'50%',color:'#293029',fontSize:28}}>{online&&<i className={typeof online==='string'?`presence-${online}`:undefined}/>}</ProfilePicture>
    {self?<button className={`profile-card-bubble ${card.status?'':'empty'}`} title="Définir ton statut" onClick={()=>onEditStatus(card)}>{card.status||<><Plus size={13}/> Quoi de neuf ?</>}</button>
     :card.status&&<div className="profile-card-bubble">{card.status}</div>}
   </div>
   <div className="profile-card-body">
    <h3>{name}</h3>
    <div className="profile-card-idline"><button className="profile-card-handle" title="Copier l’identifiant" onClick={()=>copyText(card.handle).then(()=>onNotify('Identifiant copié.')).catch(e=>onError(e.message))}>{card.handle}<Copy size={11}/></button>{pronouns&&<span>• {pronouns}</span>}</div>
    {bio?<p className="profile-card-bio">{bio}</p>:self&&<button className="profile-card-add" onClick={()=>onEditProfile('main')}><Plus size={13}/> Ajouter une bio</button>}
    {card.created_at&&<div className="profile-card-since"><CalendarDays size={13}/> Membre depuis le {new Date(card.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</div>}
    {!self&&(card.mutualFriendCount>0||card.mutualServerCount>0)&&<div className="profile-card-mutual">{card.mutualFriends.length>0&&<span className="profile-card-faces">{card.mutualFriends.map(f=><ProfilePicture key={f.id} user={f} style={{width:18,height:18,borderRadius:'50%',fontSize:7,color:'#293029'}}/>)}</span>}{[card.mutualFriendCount>0&&`${card.mutualFriendCount} ami${card.mutualFriendCount>1?'s':''} en commun`,card.mutualServerCount>0&&`${card.mutualServerCount} serveur${card.mutualServerCount>1?'s':''} en commun`].filter(Boolean).join(' • ')}</div>}
    {voice&&<div className="profile-card-voice"><span className="profile-card-voice-title">Dans un salon vocal</span><div><span className="profile-card-faces">{voice.members.slice(0,4).map(m=><ProfilePicture key={m.socketId} user={m} style={{width:26,height:26,borderRadius:'50%',fontSize:9,color:'#293029'}}/>)}</span><span><strong><Volume2 size={13}/> {voice.channelName}</strong><small>dans {server?.name}</small></span></div><button onClick={onOpenVoice}>{voice.joined?'Afficher l’appel':'Ouvrir le salon vocal'}</button></div>}
    {member&&(memberRoles.length>0||canManageRoles)&&<div className="profile-card-roles">{memberRoles.map(r=><span key={r.id} className="profile-card-role" style={{'--role-color':r.color}}><i/>{r.name}{canManageRoles&&r.position<myRank&&<button aria-label={`Retirer ${r.name}`} onClick={()=>onRoles(member.roles.filter(x=>x!==r.id))}><X size={11}/></button>}</span>)}
     {canManageRoles&&addable.length>0&&<span className="profile-card-role-add"><button aria-label="Ajouter un rôle" title="Ajouter un rôle" aria-expanded={adding} onClick={()=>setAdding(!adding)}><Plus size={13}/></button>{adding&&<span className="profile-card-role-menu">{addable.map(r=><button key={r.id} onClick={()=>{onRoles([...member.roles,r.id]);setAdding(false);}}><i style={{background:r.color}}/>{r.name}</button>)}</span>}</span>}</div>}
    {self?<div className="profile-card-edit-wrap">{editMenu&&<div className="profile-card-edit-menu">{server&&<button onClick={()=>onEditProfile('server')}><strong>Modifier le profil par serveur</strong><small>Visible uniquement par les membres de ce serveur</small></button>}<button onClick={()=>onEditProfile('main')}><strong>Modifier le profil principal</strong><small>Profil par défaut, visible par n’importe qui</small></button></div>}<button className="profile-card-primary" aria-expanded={editMenu} onClick={()=>server?setEditMenu(!editMenu):onEditProfile('main')}><Pencil size={15}/> Modifier le profil</button></div>
     :!card.blocked&&<form className="profile-card-message" onSubmit={send}><input value={message} maxLength={4000} disabled={busy} placeholder={`Envoyer un message à @${name}`} aria-label={`Envoyer un message à ${name}`} onChange={e=>setMessage(e.target.value)}/>{message.trim()&&<button aria-label="Envoyer" disabled={busy}><Send size={15}/></button>}</form>}
   </div>
  </>}
 </div>;
}
