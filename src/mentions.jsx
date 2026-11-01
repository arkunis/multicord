import React,{useRef,useState} from 'react';
import {AtSign,Users} from 'lucide-react';
import ProfilePicture from './ProfilePicture';

// Format stocké : <@id> (personne), <@&id> (rôle), @everyone. Le texte tapé affiche des noms lisibles.
const TOKEN=/<@(&?)([\w:-]{1,80})>|@everyone/g;

// lookup : {user(id) → {name,color}?, role(id) → {name,color}?}
export function renderMentions(text,lookup,onUser){
 const out=[];let last=0,key=0;
 for(const m of String(text).matchAll(TOKEN)){
  if(m.index>last)out.push(text.slice(last,m.index));
  if(m[0]==='@everyone')out.push(<span key={key++} className="mention everyone">@everyone</span>);
  else if(m[1]){const r=lookup.role?.(m[2]);out.push(<span key={key++} className="mention role" style={r?{'--mention-color':r.color}:undefined}>@{r?.name||'rôle supprimé'}</span>);}
  else{const u=lookup.user?.(m[2]);out.push(<span key={key++} className="mention" role={onUser&&u?'button':undefined} tabIndex={onUser&&u?0:undefined} onClick={onUser&&u?e=>onUser(e,m[2]):undefined}>@{u?.name||'utilisateur inconnu'}</span>);}
  last=m.index+m[0].length;
 }
 if(last<text.length)out.push(text.slice(last));
 return out;
}
export const plainMentions=(text,lookup={})=>String(text||'').replace(TOKEN,(all,role,id)=>all==='@everyone'?all:'@'+((role?lookup.role?.(id):lookup.user?.(id))?.name||(role?'rôle':'quelqu’un')));
export function mentionsUser(text,userId,roleIds=[]){
 for(const m of String(text).matchAll(TOKEN)){if(m[0]==='@everyone')return true;if(!m[1]&&m[2]===userId)return true;if(m[1]&&roleIds.includes(m[2]))return true;}
 return false;
}

// Suggestions au fil de la frappe après « @ ». candidates : [{key,label,detail,token,user?,color?,kind}]
export function useMentionPicker({text,setText,candidates,inputRef}){
 const [state,setState]=useState(null),picked=useRef([]);
 const matches=state?candidates.filter(c=>c.search.includes(state.query)):[],options=[...matches.filter(c=>c.kind==='user').slice(0,8),...matches.filter(c=>c.kind!=='user').slice(0,6)];
 function track(value,caret){const before=value.slice(0,caret),m=before.match(/(?:^|\s)@([^\s@<>]{0,32})$/);setState(m?{start:caret-m[1].length-1,end:caret,query:m[1].toLocaleLowerCase('fr'),index:0}:null);}
 function choose(o){
  const value=text.slice(0,state.start)+'@'+o.label+' '+text.slice(state.end),caret=state.start+o.label.length+2;
  if(!picked.current.some(p=>p.token===o.token))picked.current.push(o);
  setText(value);setState(null);
  requestAnimationFrame(()=>{const el=inputRef.current;if(el){el.focus();el.setSelectionRange(caret,caret);}});
 }
 return {
  onChange(e){track(e.target.value,e.target.selectionStart);},
  onSelect(e){if(state)track(e.target.value,e.target.selectionStart);},
  // true si la touche a été utilisée par le sélecteur
  onKeyDown(e){
   if(!state||!options.length)return false;
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=options.length;setState(s=>({...s,index:(s.index+(e.key==='ArrowDown'?1:n-1))%n}));return true;}
   if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();choose(options[Math.min(state.index,options.length-1)]);return true;}
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setState(null);return true;}
   return false;
  },
  encode(value){let out=value;for(const o of [...picked.current].sort((a,b)=>b.label.length-a.label.length))out=out.split('@'+o.label).join(o.token);return out;},
  reset(){picked.current=[];setState(null);},
  picker:state&&options.length>0&&<div className="mention-picker" role="listbox" aria-label="Mentionner">{options.map((o,i)=><React.Fragment key={o.key}>{(i===0||options[i-1].kind==='user')!==(o.kind==='user')||i===0?<span className={`mention-picker-title ${i>0?'separated':''}`}>{o.kind==='user'?'Membres':'Rôles'}</span>:null}<button type="button" role="option" aria-selected={i===state.index} key={o.key} className={i===state.index?'active':''} onMouseDown={e=>{e.preventDefault();choose(o);}} onMouseEnter={()=>setState(s=>({...s,index:i}))}>{o.user?<ProfilePicture user={o.user} style={{width:24,height:24,borderRadius:'50%',fontSize:9,color:'#293029'}}>{o.online&&<i/>}</ProfilePicture>:<span className="mention-picker-icon" style={{color:o.color}}>{o.kind==='everyone'?<Users size={14}/>:<AtSign size={14}/>}</span>}<strong style={o.kind==='role'?{color:o.color}:undefined}>{o.kind==='user'?o.label:'@'+o.label}</strong><small>{o.detail}</small></button></React.Fragment>)}</div>
 };
}
export function userCandidate(u,name,online=false){return {key:'u:'+u.id,kind:'user',online,label:name||u.username,detail:`${u.username}#${u.discriminator}`,token:`<@${u.id}>`,user:u,search:`${name||''} ${u.username} ${u.username}#${u.discriminator}`.toLocaleLowerCase('fr')};}
export function roleCandidate(r){return {key:'r:'+r.id,kind:'role',label:r.name,detail:'Notifier tous les membres ayant ce rôle et qui peuvent voir ce salon',token:`<@&${r.id}>`,color:r.color,search:r.name.toLocaleLowerCase('fr')};}
export const everyoneCandidate={key:'everyone',kind:'everyone',label:'everyone',detail:'Notifier tous les membres qui peuvent voir ce salon',token:'@everyone',search:'everyone tout le monde'};
