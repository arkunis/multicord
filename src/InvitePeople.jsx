import React,{useEffect,useState} from 'react';
import {Check,ChevronDown,Copy,LoaderCircle,Search,Send} from 'lucide-react';
import {api,post} from './api';
import {copyText} from './clipboard';
import ProfilePicture from './ProfilePicture';

// Fenêtre « Inviter des amis » : amis et personnes déjà contactées en privé, puis lien et code à partager.
export default function InvitePeople({server,code,url,memberIds,onNotify,onError}){
 const [contacts,setContacts]=useState(null),[query,setQuery]=useState(''),[sent,setSent]=useState({}),[open,setOpen]=useState({invite:true,members:false});
 useEffect(()=>{api('/social').then(data=>{const blocked=new Set(data.blocked.map(b=>b.id)),seen=new Map();
  for(const f of data.friends)seen.set(f.id,{...f,friend:true});
  for(const c of data.conversations)if(!seen.has(c.peer.id))seen.set(c.peer.id,{...c.peer,friend:false});
  setContacts([...seen.values()].filter(p=>!blocked.has(p.id)).sort((a,b)=>b.online-a.online||a.username.localeCompare(b.username,'fr')));}).catch(e=>onError(e.message));},[]);
 async function invite(p){
  setSent(s=>({...s,[p.id]:'sending'}));
  try{const conversation=await post('/direct',{handle:`${p.username}#${p.discriminator}`});await post(`/direct/${conversation.id}/messages`,{content:`Rejoins-moi sur ${server.name} ! ${url}`});setSent(s=>({...s,[p.id]:'sent'}));}
  catch(e){setSent(s=>({...s,[p.id]:undefined}));onError(e.message);}
 }
 const q=query.trim().toLocaleLowerCase('fr'),match=p=>!q||`${p.username}#${p.discriminator}`.toLocaleLowerCase('fr').includes(q);
 const outside=(contacts||[]).filter(p=>!memberIds.includes(p.id)&&match(p)),inside=(contacts||[]).filter(p=>memberIds.includes(p.id)&&match(p));
 const row=(p,member)=><div className="invite-person" key={p.id}><ProfilePicture user={p} style={{width:36,height:36,color:'#293029',fontSize:12}}>{p.online&&<i/>}</ProfilePicture><span><strong>{p.username}</strong><small>{p.username}#{p.discriminator}{p.friend?' · ami':''}</small></span>
  {member?<span className="invite-person-state">Déjà membre</span>:<button className={sent[p.id]==='sent'?'sent':''} disabled={!!sent[p.id]} onClick={()=>invite(p)}>{sent[p.id]==='sending'?<LoaderCircle className="spin" size={14}/>:sent[p.id]==='sent'?<><Check size={14}/> Envoyé</>:<><Send size={13}/> Inviter</>}</button>}</div>;
 const section=(key,label,list,member)=>list.length>0&&<><button className="invite-section" aria-expanded={open[key]} onClick={()=>setOpen(o=>({...o,[key]:!o[key]}))}>{label} <span>{list.length}</span><ChevronDown size={13} className={open[key]?'':'closed'}/></button>{open[key]&&list.map(p=>row(p,member))}</>;
 return <div className="invite-people">
  <label className="invite-search"><Search size={15}/><input autoFocus placeholder="Rechercher des amis" aria-label="Rechercher des amis" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="invite-people-list">{!contacts?<p className="hint"><LoaderCircle className="spin" size={14}/> Chargement de vos contacts…</p>:<>
   {section('invite','Inviter sur le serveur',outside,false)}
   {section('members','Déjà sur le serveur',inside,true)}
   {!outside.length&&!inside.length&&<p className="hint">{q?'Personne ne correspond à cette recherche.':'Vos amis et les personnes avec qui vous discutez apparaîtront ici. Partagez le lien ci-dessous en attendant.'}</p>}
  </>}</div>
  <div className="invite-share"><strong>Ou envoyer un lien ou un code d’invitation</strong>
   <div className="copy-field"><input readOnly value={url} aria-label="Lien d’invitation" onFocus={e=>e.target.select()}/><button className="invite-copy" onClick={()=>copyText(url).then(()=>onNotify('Lien d’invitation copié.')).catch(e=>onError(e.message))}><Copy size={14}/> Copier</button></div>
   <div className="invite-code-line"><span>Code</span><strong>{code}</strong><button onClick={()=>copyText(code).then(()=>onNotify('Code copié : '+code)).catch(e=>onError(e.message))}><Copy size={13}/> Copier le code</button></div>
   <small>Le lien reste valable tant qu’il n’est pas révoqué dans les paramètres du serveur.</small>
  </div>
 </div>;
}
