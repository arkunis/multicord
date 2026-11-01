import React,{useEffect,useState} from 'react';
import {Radio,Settings2} from 'lucide-react';
import Logo from './Logo';
import './desktop.css';
export default function DesktopShell({children}){
 const bridge=window.multicordDesktop,[version,setVersion]=useState('');
 useEffect(()=>{bridge?.version().then(info=>setVersion(info?.version||''));},[]);
 if(!bridge)return children;
 return <div className="desktop-shell"><header className="desktop-titlebar"><span className="desktop-wordmark"><Logo/> multicord<span>· {version||'Windows'}</span></span><button onClick={()=>bridge.connection()} title="Choisir le serveur Multicord"><Radio size={12}/><span>Connexion</span><Settings2 size={12}/></button></header><div className="desktop-content">{children}</div></div>;
}
