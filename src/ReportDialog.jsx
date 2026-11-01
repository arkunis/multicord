import React,{useState} from 'react';
import {Flag,LoaderCircle} from 'lucide-react';
import {post} from './api';

export const REASONS=[['illegal','Contenu illégal','Terrorisme, pédocriminalité, incitation à la haine…'],['harassment','Harcèlement ou haine','Insultes, menaces, acharnement'],['sexual','Contenu sexuel ou violent','Images choquantes, contenu non sollicité'],['minors','Mise en danger de mineurs','Tout contenu exploitant ou ciblant des mineurs'],['spam','Spam ou arnaque','Publicité abusive, hameçonnage, liens malveillants'],['impersonation','Usurpation d’identité','Se fait passer pour quelqu’un d’autre'],['other','Autre','Autre problème']];

// Fenêtre de signalement d'un message (salon ou privé) ou d'un compte.
export default function ReportDialog({target,serverId,onDone,onCancel,onError}){
 const [reason,setReason]=useState(''),[details,setDetails]=useState(''),[faith,setFaith]=useState(false),[busy,setBusy]=useState(false);
 async function send(e){e.preventDefault();setBusy(true);try{await post('/reports',{kind:target.kind,targetId:target.id,reason,details,goodFaith:faith,serverId});onDone();}catch(err){onError(err.message);}finally{setBusy(false);}}
 return <form className="report-dialog" onSubmit={send}>
  {target.preview&&<blockquote className="report-preview"><strong>{target.author}</strong>{target.preview}</blockquote>}
  <fieldset><legend>Pourquoi signalez-vous {target.kind==='user'?'ce compte':'ce message'} ?</legend>
   {REASONS.map(([id,label,hint])=><label key={id} className={`report-reason ${reason===id?'chosen':''}`}><input type="radio" name="reason" value={id} checked={reason===id} onChange={()=>setReason(id)}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}
  </fieldset>
  <label className="report-details">PRÉCISIONS (FACULTATIF)<textarea rows={3} maxLength={2000} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Contexte utile pour la modération : ce qui pose problème, depuis quand…"/></label>
  {reason==='illegal'&&<label className="report-faith"><input type="checkbox" checked={faith} onChange={e=>setFaith(e.target.checked)}/> Je déclare de bonne foi que les informations de ce signalement sont exactes.</label>}
  <p className="hint">{target.kind==='direct_message'?'Ce signalement est transmis à l’hébergeur de ce serveur Multicord.':'Ce signalement est transmis aux modérateurs du serveur et à l’hébergeur de ce serveur Multicord.'} La personne signalée ne saura pas que c’est vous.</p>
  <div className="category-editor-actions"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary danger-button" disabled={busy||!reason||(reason==='illegal'&&!faith)}>{busy?<LoaderCircle className="spin" size={16}/>:<Flag size={15}/>} Envoyer le signalement</button></div>
 </form>;
}
