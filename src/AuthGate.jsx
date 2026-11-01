import Logo from './Logo';
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { api, post } from './api';

const EMAIL_KEY='mc-remember-email';
const savedEmail=()=>{try{return localStorage.getItem(EMAIL_KEY)||'';}catch{return '';}};
export default function AuthGate({children}) {
  const [rememberEmail,setRememberEmail]=useState(true);
  const [resetToken,setResetToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('reset'));
  const [mode,setMode]=useState(resetToken?'reset':'login'),[user,setUser]=useState(null),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[show,setShow]=useState(false),[delivery,setDelivery]=useState('');
  useEffect(()=>{
    api('/auth/session').then(data=>setUser(data.user)).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{
    const readReset=()=>{
      const token=new URLSearchParams(location.hash.slice(1)).get('reset');
      if(!token)return;
      setResetToken(token);setMode('reset');setError('');setSuccess('');setDelivery('');
      history.replaceState({},'',location.pathname+location.search);
    };
    readReset();window.addEventListener('hashchange',readReset);
    return()=>window.removeEventListener('hashchange',readReset);
  },[]);
  const changeMode=next=>{setMode(next);setError('');setSuccess('');setDelivery('');setShow(false);};
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('');setSuccess('');
    const values=Object.fromEntries(new FormData(event.currentTarget));
    try {
      if((mode==='register'||mode==='reset')&&values.password!==values.confirm)throw new Error('Les deux mots de passe ne correspondent pas.');
      if(mode==='forgot') {
        const result=await post('/auth/forgot-password',{email:values.email});setSuccess(result.message);setDelivery(result.delivery);
      } else if(mode==='reset') {
        const result=await post('/auth/reset-password',{token:resetToken,password:values.password});
        setUser(null);setMode('login');setSuccess(result.message);
      } else { const result=await post(`/auth/${mode}`,values);try{if(rememberEmail)localStorage.setItem(EMAIL_KEY,values.email);else localStorage.removeItem(EMAIL_KEY);}catch{}setUser(result); }
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  if(loading)return <div className="auth-loading"><LoaderCircle className="spin"/> Ouverture de votre univers…</div>;
  if(user&&mode!=='reset')return children;
  const titles={login:'Heureux de vous revoir.',register:'Votre place est ici.',forgot:'On vous aide à revenir.',reset:'Un nouveau départ.'};
  const subtitles={login:'Retrouvez vos personnes, vos idées et vos conversations.',register:'Un compte, et tout un univers à créer ensemble.',forgot:'Indiquez l’adresse e-mail associée à votre compte.',reset:'Choisissez un nouveau mot de passe pour votre compte.'};
  return <main className="auth-layout"><aside className="auth-story"><a className="auth-wordmark" href="/"><Logo/>multicord<span>.</span><small>1.2</small></a><div className="auth-story-copy"><span className="eyebrow">VOTRE ESPACE, VOS CONNEXIONS</span><h1>Un endroit à vous.<br/><span>Des moments<br/>ensemble.</span></h1><p>Les communautés commencent par une rencontre.<br/>La vôtre commence ici.</p><div className="auth-story-tags"><span>Discuter.</span><span>Créer.</span><span>Se retrouver.</span></div></div><footer>Un peu de vous. Beaucoup de liens.</footer></aside>
  <section className="auth-form-panel"><div className="auth-form-card"><div className="auth-emblem">{mode==='forgot'?<Mail/>:mode==='reset'?<KeyRound/>:<span><Logo/></span>}</div>
    <h2>{titles[mode]}</h2><p className="muted">{subtitles[mode]}</p>
    {['login','register'].includes(mode)&&<div className="auth-tabs"><button type="button" className={mode==='login'?'selected':''} onClick={()=>changeMode('login')}>Se connecter</button><button type="button" className={mode==='register'?'selected':''} onClick={()=>changeMode('register')}>Créer un compte</button></div>}
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {success&&<div className="auth-success" role="status"><Check size={17}/><span>{success}</span></div>}
    {delivery==='local'&&<div className="local-mail-note"><Mail size={18}/><span><strong>Mode e-mail local</strong>Si le compte existe, l’e-mail est enregistré dans le dossier privé <code>data/mail</code> du projet. Ouvrez le fichier le plus récent et utilisez le lien qu’il contient. Aucun e-mail n’est envoyé sur internet.</span></div>}
    <form onSubmit={submit} key={mode}>
      {mode==='register'&&<><label>VOTRE PSEUDO<input name="username" autoComplete="nickname" placeholder="Comment vous appelle-t-on ?" minLength={1} maxLength={32} required autoFocus/></label><p className="signup-handle-note">Votre pseudo peut être partagé. Un code unique, comme #E12K, sera ajouté automatiquement à votre identifiant.</p></>}
      {mode!=='reset'&&<label>ADRESSE E-MAIL<input name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" maxLength={254} required defaultValue={mode==='login'||mode==='forgot'?savedEmail():''} autoFocus={mode!=='register'&&!(mode==='login'&&savedEmail())}/></label>}
      {mode!=='forgot'&&<label>{mode==='reset'?'NOUVEAU MOT DE PASSE':'MOT DE PASSE'}<div className="password-input"><input name="password" type={show?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Votre mot de passe':'Au moins 10 caractères'} minLength={mode==='login'?1:10} maxLength={72} required autoFocus={mode==='reset'||(mode==='login'&&!!savedEmail())}/><button type="button" title={show?'Masquer le mot de passe':'Afficher le mot de passe'} onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
      {['register','reset'].includes(mode)&&<label>CONFIRMER LE MOT DE PASSE<input name="confirm" type={show?'text':'password'} autoComplete="new-password" placeholder="Une deuxième fois, pour être sûr" minLength={10} maxLength={72} required/></label>}
      {(mode==='login'||mode==='register')&&<label className="remember-email"><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)}/> Se souvenir de mon e-mail sur cet appareil</label>}
      {mode==='login'&&<button className="forgot-link" type="button" onClick={()=>changeMode('forgot')}>Mot de passe oublié ?</button>}
      <button className="primary auth-submit" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/> Un instant…</>:<>{mode==='login'?'Entrer dans mon univers':mode==='register'?'Créer mon compte':mode==='forgot'?'Recevoir un lien':'Enregistrer mon mot de passe'}<ArrowRight size={17}/></>}</button>
    </form>
    {['forgot','reset'].includes(mode)&&<button className="auth-back" onClick={()=>changeMode('login')}><ArrowLeft size={15}/> Revenir à la connexion</button>}
    {mode==='reset'&&<button className="text-link" onClick={()=>changeMode('forgot')}>Mon lien a expiré, en demander un autre</button>}
    <p className="auth-footnote"><ShieldCheck size={14}/> Votre compte. Vos communautés. Votre espace.</p>
  </div><span className="auth-panel-footer">MULTICORD · UN ENDROIT POUR SE RETROUVER</span></section></main>;
}
