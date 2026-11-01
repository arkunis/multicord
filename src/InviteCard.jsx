import React,{useEffect,useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {api} from './api';

export const inviteCodeIn=text=>String(text||'').match(/\/invite\/([A-Za-z0-9]{6,32})\b/)?.[1];

// Carte affichée sous un message contenant un lien d'invitation : nom du serveur et bouton pour rejoindre.
export default function InviteCard({code,onOpen}){
 const [preview,setPreview]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;api(`/invites/${encodeURIComponent(code)}`).then(p=>active&&setPreview(p)).catch(()=>active&&setFailed(true));return()=>{active=false;};},[code]);
 if(failed)return <div className="invite-card invalid"><span className="invite-card-label">INVITATION</span><strong>Cette invitation n’est plus valable.</strong></div>;
 return <div className="invite-card"><span className="invite-card-label">INVITATION À REJOINDRE UN SERVEUR</span><div className="invite-card-body"><span className="invite-card-icon" style={{background:preview?.server.color||'#3a4436'}}>{preview?.server.name.slice(0,2).toUpperCase()}</span><span><strong>{preview?.server.name||'Chargement…'}</strong>{preview&&<small>{preview.members} membre{preview.members>1?'s':''}</small>}</span><button disabled={!preview} onClick={()=>onOpen(code)}>{preview?.joined?'Ouvrir':'Rejoindre'} <ArrowRight size={14}/></button></div></div>;
}
