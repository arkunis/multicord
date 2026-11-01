import React,{useState} from 'react';
import {Bold,Code,EyeOff,Italic,Quote,Strikethrough,Underline} from 'lucide-react';

// Mise en forme façon Markdown : **gras**, *italique*, __souligné__, ~~barré~~, `code`, ```bloc```, > citation, ||spoiler||.
const INLINE=/(`+)([^`]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\|\|([\s\S]+?)\|\||\*(?!\s)([^*]+?)\*|(?<![\w])_(?!\s)([^_]+?)_(?![\w])|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function Spoiler({children}){const [open,setOpen]=useState(false);return <span className={`md-spoiler ${open?'open':''}`} role="button" tabIndex={0} title={open?undefined:'Afficher le spoiler'} onClick={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Enter')setOpen(true);}}>{children}</span>;}

function inline(text,leaf,key){
 const out=[];let last=0,n=0;
 for(const m of text.matchAll(INLINE)){
  if(m.index>last)out.push(...leaf(text.slice(last,m.index),`${key}t${n}`));
  const k=`${key}m${n++}`;
  if(m[2]!==undefined)out.push(<code key={k} className="md-code">{m[2]}</code>);
  else if(m[3]!==undefined)out.push(<strong key={k}>{inline(m[3],leaf,k)}</strong>);
  else if(m[4]!==undefined)out.push(<u key={k}>{inline(m[4],leaf,k)}</u>);
  else if(m[5]!==undefined)out.push(<s key={k}>{inline(m[5],leaf,k)}</s>);
  else if(m[6]!==undefined)out.push(<Spoiler key={k}>{inline(m[6],leaf,k)}</Spoiler>);
  else if(m[7]!==undefined||m[8]!==undefined)out.push(<em key={k}>{inline(m[7]??m[8],leaf,k)}</em>);
  else out.push(<a key={k} className="md-link" href={m[9]} target="_blank" rel="noreferrer noopener">{m[9]}</a>);
  last=m.index+m[0].length;
 }
 if(last<text.length)out.push(...leaf(text.slice(last),`${key}t${n}`));
 return out;
}
// leaf(texte) gère ce qui reste (mentions) et renvoie une liste de nœuds.
export function renderRich(text,leaf=t=>[t]){
 const keyed=(t,k)=>leaf(t).map((node,i)=>typeof node==='string'?node:React.cloneElement(node,{key:`${k}-${i}`}));
 const out=[];const parts=String(text).split(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/i);
 parts.forEach((part,i)=>{
  if(i%2){out.push(<code key={'b'+i} className="md-codeblock">{part.replace(/\n$/,'')}</code>);return;}
  const lines=part.split('\n');let quote=[];
  const flushQuote=k=>{if(quote.length){out.push(<span key={k} className="md-quote">{inline(quote.join('\n'),keyed,k)}</span>);quote=[];}};
  lines.forEach((line,j)=>{
   const k=`p${i}l${j}`;
   if(/^> ?/.test(line)){quote.push(line.replace(/^> ?/,''));return;}
   flushQuote(k+'q');
   out.push(...inline(line,keyed,k));
   if(j<lines.length-1)out.push('\n');
  });
  flushQuote(`p${i}end`);
 });
 return out;
}

const FORMATS=[['bold','Gras (Ctrl+B)',Bold,'**'],['italic','Italique (Ctrl+I)',Italic,'*'],['underline','Souligné (Ctrl+U)',Underline,'__'],['strike','Barré',Strikethrough,'~~'],['quote','Citation',Quote,'> '],['code','Code',Code,'`'],['spoiler','Spoiler',EyeOff,'||']];
// Entoure la sélection (ou retire la mise en forme si elle y est déjà).
export function applyFormat(id,text,start,end){
 const [, , , mark]=FORMATS.find(f=>f[0]===id),selected=text.slice(start,end);
 if(id==='quote'){const lineStart=text.lastIndexOf('\n',start-1)+1,block=text.slice(lineStart,end),quoted=block.split('\n').every(l=>l.startsWith('> '));const next=quoted?block.replace(/^> /gm,''):block.replace(/^/gm,'> ');return {text:text.slice(0,lineStart)+next+text.slice(end),start:lineStart,end:lineStart+next.length};}
 const m=id==='code'&&selected.includes('\n')?'```':mark,open=id==='code'&&m==='```'?'```\n':m,close=id==='code'&&m==='```'?'\n```':m;
 if(text.slice(start-open.length,start)===open&&text.slice(end,end+close.length)===close)return {text:text.slice(0,start-open.length)+selected+text.slice(end+close.length),start:start-open.length,end:end-open.length};
 return {text:text.slice(0,start)+open+selected+close+text.slice(end),start:start+open.length,end:end+open.length};
}
export function formatShortcut(e){if(!(e.ctrlKey||e.metaKey)||e.altKey)return null;return {b:'bold',i:'italic',u:'underline'}[e.key.toLowerCase()]||null;}

// Barre affichée au-dessus de la zone de saisie quand du texte est sélectionné.
export function FormatToolbar({onFormat}){
 return <div className="format-toolbar" role="toolbar" aria-label="Mise en forme">{FORMATS.map(([id,label,Icon],i)=><React.Fragment key={id}>{(i===4||i===5)&&<i/>}<button type="button" title={label} aria-label={label} onMouseDown={e=>{e.preventDefault();onFormat(id);}}><Icon size={15}/></button></React.Fragment>)}</div>;
}
