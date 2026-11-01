import React,{useEffect,useRef,useState} from 'react';
import {AtSign,CornerUpRight,Forward,Hash,Plus,Search,SmilePlus,Volume2,X} from 'lucide-react';
import ProfilePicture from './ProfilePicture';

// Ligne « en réponse à » au-dessus d'un message ; clic = aller au message cité.
export function ReplyHeader({reply,name,onJump}){
 if(reply.deleted)return <div className="message-reply deleted"><CornerUpRight size={13}/><em>Message original supprimé</em></div>;
 return <button className="message-reply" onClick={onJump} title="Aller au message"><CornerUpRight size={13}/><ProfilePicture user={reply} style={{width:16,height:16,borderRadius:'50%',fontSize:6,color:'#293029'}}/><strong style={{color:reply.color}}>{name}</strong><span>{reply.content||(reply.files?'Pièce jointe':'')}</span></button>;
}
// Contenu d'un message transféré, avec son origine.
export function ForwardedBlock({origin,children}){
 return <div className="message-forwarded"><span className="message-forwarded-label"><Forward size={12}/> Transféré</span>{children}<small>De {origin.author}{origin.channel?<> · #{origin.channel}</>:null}{origin.server?<> · {origin.server}</>:null} · {new Date(origin.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</small></div>;
}
// Réactions sous un message : clic pour ajouter ou retirer la sienne.
export function Reactions({reactions,me,nameOf,onToggle,onAdd}){
 if(!reactions?.length)return null;
 return <div className="message-reactions">{reactions.map(r=>{const mine=r.users.includes(me),names=r.users.slice(0,6).map(nameOf).join(', ')+(r.users.length>6?` et ${r.users.length-6} autre(s)`:'');
  return <button key={r.emoji} className={mine?'mine':''} aria-pressed={mine} title={`${names} : ${r.emoji}`} onClick={()=>onToggle(r.emoji,!mine)}><span>{r.emoji}</span><b>{r.users.length}</b></button>;})}
  <button className="message-reactions-add" data-emoji-toggle title="Ajouter une réaction" aria-label="Ajouter une réaction" onClick={onAdd}><SmilePlus size={15}/></button></div>;
}
// Modification en place : Entrée enregistre, Échap annule.
export function EditBox({initial,onSave,onCancel}){
 const [text,setText]=useState(initial),ref=useRef();
 useEffect(()=>{const el=ref.current;el.focus();el.setSelectionRange(el.value.length,el.value.length);el.style.height=Math.min(el.scrollHeight,240)+'px';},[]);
 return <div className="message-edit"><textarea ref={ref} value={text} maxLength={4000} rows={1} aria-label="Modifier le message" onChange={e=>{setText(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,240)+'px';}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();onSave(text);}}}/><small>Échap pour <button onClick={onCancel}>annuler</button> · Entrée pour <button onClick={()=>onSave(text)}>enregistrer</button></small></div>;
}
// Barre « Réponse à … » au-dessus de la zone de saisie, avec la mention activable.
export function ReplyBar({name,ping,onPing,onCancel}){
 return <div className="reply-bar"><span>Réponse à <strong>{name}</strong></span><button className={ping?'on':''} aria-pressed={ping} title={ping?'La personne sera notifiée':'La personne ne sera pas notifiée'} onClick={onPing}><AtSign size={13}/> {ping?'ACTIVÉ':'DÉSACTIVÉ'}</button><button aria-label="Annuler la réponse" onClick={onCancel}><X size={15}/></button></div>;
}
// Fenêtre de transfert : salons du serveur et membres (en privé), jusqu'à 5 destinataires.
export function ForwardPanel({message,channels,members,busy,onSend,onCancel}){
 const [query,setQuery]=useState(''),[picked,setPicked]=useState([]),[comment,setComment]=useState('');
 const q=query.trim().toLocaleLowerCase('fr'),match=s=>!q||s.toLocaleLowerCase('fr').includes(q);
 const toggle=key=>setPicked(p=>p.includes(key)?p.filter(x=>x!==key):p.length>=5?p:[...p,key]);
 const row=(key,icon,label,detail)=><label key={key} className={`forward-row ${picked.includes(key)?'picked':''}`}>{icon}<span><strong>{label}</strong>{detail&&<small>{detail}</small>}</span><input type="checkbox" checked={picked.includes(key)} disabled={!picked.includes(key)&&picked.length>=5} onChange={()=>toggle(key)}/></label>;
 const shownChannels=channels.filter(c=>match(c.name)),shownMembers=members.filter(m=>match(`${m.name} ${m.username}#${m.discriminator}`));
 return <div className="forward-panel">
  <div className="forward-preview">{message.content?message.content.slice(0,160):`${message.attachments?.length||0} pièce(s) jointe(s)`}</div>
  <label className="invite-search"><Search size={15}/><input autoFocus placeholder="Rechercher un salon ou une personne" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="forward-list">
   {shownChannels.length>0&&<><span className="forward-section">SALONS</span>{shownChannels.map(c=>row('c:'+c.id,c.type==='voice'?<Volume2 size={18}/>:<Hash size={18}/>,c.name,c.type==='voice'?'Discussion du salon vocal':null))}</>}
   {shownMembers.length>0&&<><span className="forward-section">MESSAGES PRIVÉS</span>{shownMembers.map(m=>row('u:'+m.id,<ProfilePicture user={m} style={{width:26,height:26,borderRadius:'50%',fontSize:9,color:'#293029'}}/>,m.name,`${m.username}#${m.discriminator}`))}</>}
   {!shownChannels.length&&!shownMembers.length&&<p className="hint">Aucun résultat.</p>}
  </div>
  <input className="forward-comment" placeholder="Ajouter un message (facultatif)" maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/>
  <div className="category-editor-actions"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={busy||!picked.length} onClick={()=>onSend({channels:picked.filter(k=>k.startsWith('c:')).map(k=>k.slice(2)),users:picked.filter(k=>k.startsWith('u:')).map(k=>k.slice(2)),comment})}><Forward size={15}/> Envoyer{picked.length>1?` (${picked.length})`:''}</button></div>
 </div>;
}
export const QUICK_REACTIONS=['👍','❤️','😂'];
export {Plus};
