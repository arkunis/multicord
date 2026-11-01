import React,{useEffect,useState} from 'react';
import {Ban,Check,LoaderCircle,MessageSquareOff,ShieldAlert,Trash2,UserX,X} from 'lucide-react';
import {api,post} from './api';

const DECISIONS={dismiss:'Rejeté',resolve:'Classé',delete_content:'Contenu supprimé',suspend_user:'Compte suspendu'};
const KINDS={message:'Message',direct_message:'Message privé',user:'Compte'};
const when=d=>new Date(d).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

// Signalements : ceux d'un serveur (serverId) pour ses modérateurs, ou toute l'instance pour l'hébergeur.
export default function ModerationPanel({serverId,admin,onNotice,onError}){
 const [tab,setTab]=useState('open'),[items,setItems]=useState(null),[note,setNote]=useState({}),[busy,setBusy]=useState(null);
 const query=serverId?`server=${encodeURIComponent(serverId)}&`:'';
 const load=()=>{setItems(null);(tab==='suspended'?api('/admin/suspended'):api(`/reports?${query}status=${tab}`)).then(setItems).catch(e=>onError(e.message));};
 useEffect(load,[tab,serverId]);
 async function decide(r,decision){setBusy(r.id+decision);try{await post(`/reports/${r.id}/decision`,{decision,note:note[r.id]||''});onNotice(`Signalement ${DECISIONS[decision].toLowerCase()}.`);load();}catch(e){onError(e.message);}finally{setBusy(null);}}
 async function unsuspend(u){setBusy(u.id);try{await post(`/admin/users/${u.id}/unsuspend`);onNotice(`${u.username} peut de nouveau se connecter.`);load();}catch(e){onError(e.message);}finally{setBusy(null);}}
 return <section className="settings-card moderation-panel">
  <div className="moderation-tabs">{[['open','À traiter'],['handled','Traités'],...(admin?[['suspended','Comptes suspendus']]:[])].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
  {!items?<p className="settings-hint"><LoaderCircle className="spin" size={14}/> Chargement…</p>
   :!items.length?<p className="settings-hint">{tab==='open'?'Aucun signalement en attente. Tout va bien !':tab==='handled'?'Aucun signalement traité pour le moment.':'Aucun compte suspendu.'}</p>
   :tab==='suspended'?items.map(u=><div className="moderation-item" key={u.id}><div className="moderation-head"><strong>{u.username}#{u.discriminator}</strong><time>Suspendu le {when(u.suspended_at)}</time></div>{u.suspended_reason&&<p className="moderation-reason">Motif : {u.suspended_reason}</p>}<div className="moderation-actions"><button className="secondary" disabled={!!busy} onClick={()=>unsuspend(u)}><Check size={14}/> Lever la suspension</button></div></div>)
   :items.map(r=><article className="moderation-item" key={r.id}>
     <div className="moderation-head"><span className={`moderation-kind ${r.reason}`}><ShieldAlert size={13}/> {r.reasonLabel}</span><span className="moderation-meta">{KINDS[r.kind]}{r.snapshot.server?` · ${r.snapshot.server}`:''}{r.snapshot.channel?` · #${r.snapshot.channel}`:''}</span><time>{when(r.created_at)}</time></div>
     <blockquote><strong>{r.snapshot.author}{r.snapshot.handle?` (${r.snapshot.handle})`:''}</strong>{r.snapshot.content||r.snapshot.bio||r.snapshot.status||<em>Profil signalé</em>}{r.snapshot.files?.length>0&&<small>Fichiers : {r.snapshot.files.join(', ')}</small>}</blockquote>
     {r.details&&<p className="moderation-reason">« {r.details} »</p>}
     {admin&&r.reporter&&<p className="moderation-reporter">Signalé par {r.reporter}</p>}
     {tab==='open'?<><input className="moderation-note" placeholder="Note ou motif de la décision (facultatif)" maxLength={1000} value={note[r.id]||''} onChange={e=>setNote(n=>({...n,[r.id]:e.target.value}))}/>
      <div className="moderation-actions">
       {r.kind!=='user'&&(r.kind==='message'||admin)&&<button className="secondary danger" disabled={!!busy} onClick={()=>decide(r,'delete_content')}><Trash2 size={14}/> Supprimer le message</button>}
       {admin&&<button className="secondary danger" disabled={!!busy} onClick={()=>decide(r,'suspend_user')}><UserX size={14}/> Suspendre le compte</button>}
       <button className="secondary" disabled={!!busy} onClick={()=>decide(r,'resolve')}><Check size={14}/> Classer</button>
       <button className="secondary" disabled={!!busy} onClick={()=>decide(r,'dismiss')}><X size={14}/> Rejeter</button>
      </div></>
     :<p className="moderation-decision">{DECISIONS[r.decision]||r.status}{r.handled_at?` le ${when(r.handled_at)}`:''}{r.note?` — ${r.note}`:''}</p>}
    </article>)}
 </section>;
}
export {Ban,MessageSquareOff};
