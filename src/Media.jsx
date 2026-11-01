import React,{useRef,useState,useEffect} from 'react';
import {Volume2,VolumeX} from 'lucide-react';
import ProfilePicture from './ProfilePicture';
// Un seul contexte audio pour toute la lecture des participants.
let playback;
const playbackContext=()=>{if(!playback||playback.state==='closed')playback=new AudioContext();playback.resume().catch(()=>{});return playback;};
export function RemoteAudio({stream,deaf,volume,outputDevice}){
 const ref=useRef(),gain=useRef();
 // Chromium ne lit un flux WebRTC distant via Web Audio que s'il est aussi rattaché à un élément (muet).
 useEffect(()=>{const element=ref.current;element.srcObject=stream;element.play().catch(()=>{});if(!stream.getAudioTracks().length)return()=>{element.srcObject=null;};const ctx=playbackContext(),source=ctx.createMediaStreamSource(stream),node=ctx.createGain();source.connect(node).connect(ctx.destination);gain.current=node;return()=>{source.disconnect();node.disconnect();gain.current=null;element.srcObject=null;};},[stream]);
 useEffect(()=>{if(gain.current)gain.current.gain.value=deaf?0:volume;},[volume,deaf,stream]);
 useEffect(()=>{const ctx=playbackContext();if(ctx.setSinkId)ctx.setSinkId(outputDevice||'').catch(()=>{});},[outputDevice]);
 return <audio ref={ref} autoPlay muted/>;
}
// Réglage du volume d'un participant directement sur sa tuile (pour soi seulement).
export function TileVolume({name,value={volume:100,muted:false},onChange}){
 const [open,setOpen]=useState(false),box=useRef();
 useEffect(()=>{if(!open)return;const close=e=>{if(e.key==='Escape'||(e.type==='pointerdown'&&!box.current?.contains(e.target)))setOpen(false);};window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);};},[open]);
 const volume=value.volume??100;
 return <div className={`tile-volume ${open?'open':''} ${value.muted?'muted':''}`} ref={box}><button className="tile-volume-toggle" aria-label={`Volume de ${name}`} title={`Volume de ${name}`} aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{value.muted?<VolumeX size={16}/>:<Volume2 size={16}/>}{volume!==100&&!value.muted&&<small>{volume} %</small>}</button>
  {open&&<div className="tile-volume-panel" role="dialog" aria-label={`Volume de ${name}`}><span>Volume de l’utilisateur<strong>{value.muted?'Muet':`${volume} %`}</strong></span><input type="range" min="0" max="200" step="5" value={volume} aria-label={`Volume de ${name}`} onChange={e=>onChange({...value,volume:Number(e.target.value),muted:false})}/><label><input type="checkbox" checked={!!value.muted} onChange={e=>onChange({...value,muted:e.target.checked})}/> Rendre muet (pour moi)</label>{(volume!==100||value.muted)&&<button className="tile-volume-reset" onClick={()=>onChange({volume:100,muted:false})}>Réinitialiser</button>}</div>}
 </div>;
}
export default function Media({stream,muted=false,deaf=false,label,volume=1,outputDevice,user,screen=false,speaking=false,controls=null}) {
  const ref=useRef();const [video,setVideo]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el||!stream){setVideo(false);return;}el.srcObject=stream;const sync=()=>setVideo(stream.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted));sync();stream.addEventListener('addtrack',sync);stream.addEventListener('removetrack',sync);const timer=setInterval(sync,700);el.play().catch(()=>{});return()=>{clearInterval(timer);stream.removeEventListener('addtrack',sync);stream.removeEventListener('removetrack',sync);el.srcObject=null;};},[stream]);
  useEffect(()=>{if(ref.current)ref.current.volume=volume;},[volume]);
  useEffect(()=>{const el=ref.current;if(el?.setSinkId)el.setSinkId(outputDevice||'').catch(()=>{});},[outputDevice]);
  return <div className={`media-tile ${video?'has-video':''} ${screen?'screen-tile':''} ${speaking?'speaking':''}`}><video ref={ref} autoPlay playsInline muted={muted||deaf}/>{!video&&<ProfilePicture className="media-avatar" user={user||{username:label}}/>}<span className="media-label"><Volume2 size={14}/>{label}</span>{controls}</div>;
}
