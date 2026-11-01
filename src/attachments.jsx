import React,{useEffect,useState} from 'react';
import {Download,File,FileAudio,FileText,FileVideo,LoaderCircle,Paperclip,X} from 'lucide-react';

export const MAX_FILE=5*1024*1024,MAX_FILES=5;
export const formatSize=n=>n<1024?`${n} o`:n<1048576?`${(n/1024).toFixed(n<10240?1:0)} Ko`:`${(n/1048576).toFixed(1)} Mo`;
const kindOf=type=>/^image\/(png|jpeg|gif|webp)$/.test(type)?'image':/^audio\//.test(type)?'audio':/^video\/(mp4|webm)$/.test(type)?'video':type==='application/pdf'?'pdf':'file';

// Fichiers en attente d'envoi : envoyés au serveur dès l'ajout (coller, glisser-déposer ou bouton +).
export function useAttachments({target,onError}){
 const [items,setItems]=useState([]),key=target?.channel||target?.conversation;
 useEffect(()=>{setItems(old=>{old.forEach(i=>i.preview&&URL.revokeObjectURL(i.preview));return [];});},[key]);
 async function upload(item,file){
  try{
   const query=target.channel?`channel=${encodeURIComponent(target.channel)}`:`conversation=${encodeURIComponent(target.conversation)}`;
   const response=await fetch(`/api/attachments?${query}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name||'fichier')},body:file});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Envoi du fichier impossible.');
   setItems(list=>list.map(i=>i.key===item.key?{...i,...data,uploading:false}:i));
  }catch(e){setItems(list=>list.filter(i=>i.key!==item.key));onError(`${file.name} : ${e.message}`);}
 }
 function add(fileList){
  if(!target)return;
  const files=[...fileList].filter(f=>f.size>0);if(!files.length)return;
  const room=MAX_FILES-items.length;if(room<=0)return onError(`${MAX_FILES} fichiers maximum par message.`);
  if(files.length>room)onError(`${MAX_FILES} fichiers maximum par message : seuls les ${room} premiers sont ajoutés.`);
  for(const file of files.slice(0,room)){
   if(file.size>MAX_FILE){onError(`${file.name} est trop lourd (${formatSize(file.size)}). Limite : 5 Mo.`);continue;}
   const item={key:crypto.randomUUID(),name:file.name||'fichier',size:file.size,type:file.type,uploading:true,preview:kindOf(file.type)==='image'?URL.createObjectURL(file):null};
   setItems(list=>[...list,item]);upload(item,file);
  }
 }
 const remove=key=>setItems(list=>{const gone=list.find(i=>i.key===key);if(gone?.preview)URL.revokeObjectURL(gone.preview);return list.filter(i=>i.key!==key);});
 return {
  ids:items.filter(i=>!i.uploading).map(i=>i.id),uploading:items.some(i=>i.uploading),count:items.length,
  clear(){setItems(list=>{list.forEach(i=>i.preview&&URL.revokeObjectURL(i.preview));return [];});},
  onPaste(e){const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();add(files);}},
  dropProps:{onDragOver:e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();},onDrop:e=>{if(e.dataTransfer.files.length){e.preventDefault();add(e.dataTransfer.files);}}},
  button:<label className={`composer-attach ${target?'':'disabled'}`} title="Joindre un fichier (5 Mo max)" aria-label="Joindre un fichier"><Paperclip size={18}/><input type="file" multiple disabled={!target} onChange={e=>{add(e.target.files);e.target.value='';}}/></label>,
  preview:items.length>0&&<div className="attach-pending">{items.map(i=><div className="attach-chip" key={i.key}>{i.preview?<img src={i.preview} alt=""/>:<span className="attach-chip-icon"><FileIcon type={i.type}/></span>}<span><strong>{i.name}</strong><small>{i.uploading?'Envoi…':formatSize(i.size)}</small></span>{i.uploading?<LoaderCircle className="spin" size={15}/>:<button type="button" aria-label={`Retirer ${i.name}`} onClick={()=>remove(i.key)}><X size={14}/></button>}</div>)}</div>,
 };
}
function FileIcon({type}){const k=kindOf(type);return k==='pdf'?<FileText size={22}/>:k==='audio'?<FileAudio size={22}/>:k==='video'?<FileVideo size={22}/>:<File size={22}/>;}

// Une image qui finit de charger agrandit le message : on reste collé en bas si on y était déjà.
function keepBottom(e){let el=e.currentTarget.parentElement;while(el&&!(el.scrollHeight>el.clientHeight&&/auto|scroll/.test(getComputedStyle(el).overflowY)))el=el.parentElement;if(el&&el.scrollHeight-el.scrollTop-el.clientHeight<e.currentTarget.offsetHeight+160)el.scrollTop=el.scrollHeight;}
// Pièces jointes d'un message : images en vignette, lecteurs audio/vidéo, carte de téléchargement sinon.
export function Attachments({items,onImage}){
 return <div className="attachments">{items.map(a=>{const k=kindOf(a.type);
  if(k==='image')return <button key={a.id} className="attachment-image" title={a.name} onClick={()=>onImage(a)}><img src={a.url} alt={a.name} onLoad={keepBottom}/></button>;
  if(k==='video')return <video key={a.id} className="attachment-video" src={a.url} controls preload="metadata"/>;
  return <div key={a.id} className={`attachment-file ${k}`}><span className="attachment-file-icon"><FileIcon type={a.type}/></span><span><a href={a.url} download={a.name}>{a.name}</a><small>{formatSize(a.size)}</small></span><a className="attachment-download" href={a.url} download={a.name} aria-label={`Télécharger ${a.name}`} title="Télécharger"><Download size={17}/></a>{k==='audio'&&<audio src={a.url} controls preload="metadata"/>}</div>;
 })}</div>;
}
// Image en grand, fermée par clic ou Échap.
export function ImageViewer({image,onClose}){
 useEffect(()=>{const esc=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[]);
 return <div className="image-viewer" role="dialog" aria-label={image.name} onClick={onClose}><img src={image.url} alt={image.name} onClick={e=>e.stopPropagation()}/><div className="image-viewer-bar" onClick={e=>e.stopPropagation()}><span>{image.name} · {formatSize(image.size)}</span><a href={image.url} download={image.name}><Download size={15}/> Télécharger</a><button onClick={onClose}><X size={15}/> Fermer</button></div></div>;
}
