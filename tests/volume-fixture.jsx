import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Media,{RemoteAudio} from '../src/Media';
import ParticipantVolume,{effectiveVolume} from '../src/ParticipantVolume';
import '../src/style.css';
import '../src/settings.css';
const people=[{id:'voice-a',username:'Camille',discriminator:'E12K',handle:'Camille#E12K'},{id:'voice-b',username:'Alex',discriminator:'B34M',handle:'Alex#B34M'}];
function Diagnostic(){
 const [streams,setStreams]=useState([]),[volumes,setVolumes]=useState({}),[deaf,setDeaf]=useState(false),[master,setMaster]=useState(100),[result,setResult]=useState('Prêt — aucun accès au microphone ou à la caméra.');
 useEffect(()=>()=>streams.forEach(s=>s.getTracks().forEach(t=>t.stop())),[streams]);
 function start(){const context=new AudioContext();const source=context.createOscillator(),gain=context.createGain();gain.gain.value=0.005;source.connect(gain);const destinations=[context.createMediaStreamDestination(),context.createMediaStreamDestination()];destinations.forEach(d=>gain.connect(d));source.start();context.resume();setStreams(destinations.map(d=>d.stream));}
 return <main style={{maxWidth:760,margin:'30px auto',padding:24}}><h1>Volume par participant</h1><p>Diagnostic local utilisant les vrais composants de l’application et deux sons synthétiques très faibles.</p>{!streams.length&&<button className="primary" onClick={start}>Démarrer les flux synthétiques</button>}<div className="media-grid">{streams.map((s,i)=><Media key={s.id} stream={s} muted deaf={deaf} label={people[i].handle} volume={effectiveVolume(master,volumes[people[i].id])}/>)}</div>{streams.map((s,i)=><RemoteAudio key={'audio-'+s.id} stream={s} deaf={deaf} volume={effectiveVolume(master,volumes[people[i].id])}/>)}<ParticipantVolume members={people} userId="self" values={volumes} onChange={(id,value)=>setVolumes(p=>({...p,[id]:value}))}/><label>Volume général<input aria-label="Volume général" type="range" min="0" max="100" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label><button className="secondary" onClick={()=>setDeaf(!deaf)}>{deaf?'Réactiver le son global':'Couper le son global'}</button><button className="secondary" onClick={()=>{const values=[...document.querySelectorAll('audio')].map(v=>({volume:v.volume,muted:v.muted}));setResult(JSON.stringify(values));}}>Lire les volumes appliqués aux lecteurs</button><p role="status">{result}</p></main>;
}
createRoot(document.getElementById('root')).render(<Diagnostic/>);
