import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Clock,Search,X} from 'lucide-react';
import {ALL_EMOJIS,EMOJI_CATEGORIES} from './emojiData';

const RECENT_KEY='mc-emoji-recent',fold=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const readRecent=()=>{try{return JSON.parse(localStorage.getItem(RECENT_KEY))||[];}catch{return [];}};

// Sélecteur d'emojis : recherche (nom ou mot français), catégories, récents. Maj + clic pour en ajouter plusieurs.
export default function EmojiPicker({onPick,onClose,className=''}){
 const [query,setQuery]=useState(''),[hover,setHover]=useState(null),[recent,setRecent]=useState(readRecent);
 const box=useRef(),body=useRef(),sections=useRef({});
 useEffect(()=>{const close=e=>{if(e.key==='Escape'||(e.type==='pointerdown'&&!box.current?.contains(e.target)&&!e.target.closest?.('[data-emoji-toggle]')))onClose();};window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);};},[]);
 const byChar=useMemo(()=>new Map(ALL_EMOJIS.map(e=>[e.char,e])),[]);
 const q=fold(query.trim().replace(/:/g,''));
 const groups=q?[{id:'search',label:'Résultats',emojis:ALL_EMOJIS.filter(e=>fold(e.search).includes(q))}]
  :[...(recent.length?[{id:'recent',label:'Fréquemment utilisés',emojis:recent.map(c=>byChar.get(c)).filter(Boolean)}]:[]),...EMOJI_CATEGORIES];
 function pick(e,event){const next=[e.char,...recent.filter(c=>c!==e.char)].slice(0,27);setRecent(next);try{localStorage.setItem(RECENT_KEY,JSON.stringify(next));}catch{}onPick(e.char);if(!event.shiftKey)onClose();}
 const shown=hover||groups[0]?.emojis[0];
 return <div className={`emoji-picker ${className}`} ref={box} role="dialog" aria-label="Choisir un emoji">
  <div className="emoji-picker-head"><label className="emoji-picker-search"><Search size={15}/><input autoFocus placeholder=":smirk: ou un mot (rire, cœur, jeu…)" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Effacer la recherche" onClick={()=>setQuery('')}><X size={14}/></button>}</label></div>
  <div className="emoji-picker-main">
   {!q&&<nav className="emoji-picker-nav">{groups.map(g=><button key={g.id} title={g.label} aria-label={g.label} onClick={()=>sections.current[g.id]?.scrollIntoView({block:'start'})}>{g.id==='recent'?<Clock size={17}/>:g.emojis[0]?.char}</button>)}</nav>}
   <div className="emoji-picker-body" ref={body}>
    {groups.map(g=><section key={g.id} ref={el=>{sections.current[g.id]=el;}}><h4>{g.label}</h4><div className="emoji-picker-grid">{g.emojis.map(e=><button key={g.id+e.char} title={`:${e.name}:`} aria-label={e.name.replace(/_/g,' ')} onMouseEnter={()=>setHover(e)} onFocus={()=>setHover(e)} onClick={ev=>pick(e,ev)}>{e.char}</button>)}</div></section>)}
    {q&&!groups[0].emojis.length&&<p className="emoji-picker-empty">Aucun emoji ne correspond à « {query} ».</p>}
   </div>
  </div>
  <footer className="emoji-picker-foot">{shown&&<><span>{shown.char}</span><strong>:{shown.name}:</strong></>}<small>Maj + clic pour en ajouter plusieurs</small></footer>
 </div>;
}
