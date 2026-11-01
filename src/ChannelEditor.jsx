import React,{useState} from 'react';
import {Check,Globe,Lock} from 'lucide-react';

// Fenêtre « Modifier le salon » : nom, sujet et accès réservé à certains rôles.
export default function ChannelEditor({channel,categories=[],roles,busy,onSave,onCancel}){
 const choices=roles.filter(r=>!r.is_default);
 const [name,setName]=useState(channel.name),[description,setDescription]=useState(channel.description||''),[selected,setSelected]=useState(channel.roles||[]),[restricted,setRestricted]=useState(!!channel.roles?.length),[category,setCategory]=useState(channel.category_id||'');
 const parent=categories.find(c=>c.id===category);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const invalid=!name.trim()||(restricted&&!selected.length);
 return <form className="channel-editor" onSubmit={e=>{e.preventDefault();if(!invalid)onSave({name,description,roles:restricted?selected:[],category_id:category||null});}}>
  <label>NOM DU SALON<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} required autoFocus/></label>
  {channel.type==='text'&&<label>SUJET DU SALON<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={300} rows={3} placeholder="De quoi parle-t-on ici ?"/></label>}
  {categories.length>0&&<label className="channel-category-select">CATÉGORIE<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Aucune catégorie</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}{c.roles?.length?' 🔒':''}</option>)}</select></label>}
  <span className="channel-editor-title">QUI PEUT ACCÉDER À CE SALON ?</span>
  <div className="choice-buttons"><button type="button" className={restricted?'':'chosen'} onClick={()=>setRestricted(false)}><Globe size={16}/> {parent?.roles?.length?'Comme la catégorie':'Tout le monde'}</button><button type="button" className={restricted?'chosen':''} disabled={!choices.length} onClick={()=>setRestricted(true)}><Lock size={16}/> Rôles choisis</button></div>
  {!restricted&&parent?.roles?.length>0&&<p className="hint">Ce salon reprend l’accès de la catégorie privée « {parent.name} ».</p>}{!choices.length&&<p className="hint">Créez d’abord des rôles dans les paramètres du serveur pour rendre ce salon privé.</p>}
  {restricted&&<><div className="member-role-options channel-role-options">{choices.map(r=><label key={r.id} className="role-assignment"><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)}/><span className="role-chip" style={{'--role-color':r.color}}><i/>{r.name}</span></label>)}</div><p className="hint">Seuls les membres ayant l’un de ces rôles verront ce salon. Le créateur du serveur et les membres qui gèrent les salons y ont toujours accès.</p></>}
  <button className="primary" disabled={busy||invalid}><Check size={16}/> Enregistrer</button><button type="button" className="secondary" onClick={onCancel}>Annuler</button>
 </form>;
}
