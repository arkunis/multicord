import React,{useEffect,useState} from 'react';
import {ArrowRight,MonitorDown,Globe} from 'lucide-react';
import Logo from './Logo';

// Page d'accueil d'un lien https://…/invite/CODE ouvert dans un navigateur : tente d'ouvrir
// l'application Windows (multicord://invite/CODE), sinon permet de continuer sur le web.
export default function InviteLanding({children}){
 const code=location.pathname.match(/^\/invite\/([A-Za-z0-9]{6,32})\/?$/)?.[1];
 const [web,setWeb]=useState(()=>!code||!!window.multicordDesktop);
 useEffect(()=>{if(!web)location.href=`multicord://invite/${code}`;},[]);
 if(web)return children;
 return <div className="invite-landing"><section><span className="invite-landing-logo"><Logo/></span><span className="eyebrow">INVITATION MULTICORD</span><h1>On vous attend !</h1><p>Vous avez été invité à rejoindre un serveur avec le code</p><strong className="invite-landing-code">{code}</strong>
  <a className="invite-landing-primary" href={`multicord://invite/${code}`}><MonitorDown size={17}/> Ouvrir dans l’application</a>
  <button className="invite-landing-secondary" onClick={()=>setWeb(true)}><Globe size={16}/> Continuer dans le navigateur <ArrowRight size={15}/></button>
  <small>Rien ne s’ouvre ? Installez Multicord pour Windows, ou continuez simplement dans le navigateur. Sur mobile, utilisez le navigateur en attendant l’application.</small></section></div>;
}
