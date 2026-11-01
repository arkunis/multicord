import React,{useState} from 'react';
import {Lock} from 'lucide-react';

// Création ou modification d'une catégorie. Privée : seuls les rôles choisis la voient, et ses salons sans réglage propre en héritent.
export default function CategoryEditor({category,roles,busy,onSave,onCancel}){
 const choices=roles.filter(r=>!r.is_default);
 const [name,setName]=useState(category?.name||''),[restricted,setRestricted]=useState(!!category?.roles?.length),[selected,setSelected]=useState(category?.roles||[]);
 const invalid=!name.trim()||(restricted&&!selected.length);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 return <form className="channel-editor category-editor" onSubmit={e=>{e.preventDefault();if(!invalid)onSave({name,roles:restricted?selected:[]});}}>
  <label>NOM DE LA CATÉGORIE<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="Nouvelle catégorie" required autoFocus/></label>
  <div className="preference-row category-private"><div><strong><Lock size={13}/> Catégorie privée</strong><p>Seuls les rôles sélectionnés pourront la voir. Les salons de cette catégorie reprennent automatiquement ce réglage, sauf s’ils ont leurs propres rôles.</p></div><input type="checkbox" role="switch" aria-label="Catégorie privée" checked={restricted} disabled={!choices.length} onChange={e=>setRestricted(e.target.checked)}/></div>
  {!choices.length&&<p className="hint">Créez d’abord des rôles dans les paramètres du serveur pour rendre une catégorie privée.</p>}
  {restricted&&<div className="member-role-options channel-role-options">{choices.map(r=><label key={r.id} className="role-assignment"><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)}/><span className="role-chip" style={{'--role-color':r.color}}><i/>{r.name}</span></label>)}</div>}
  <div className="category-editor-actions"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={busy||invalid}>{category?'Enregistrer':'Créer la catégorie'}</button></div>
 </form>;
}
