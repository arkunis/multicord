let config={};
const url=document.querySelector('#server-url'),feedback=document.querySelector('#feedback'),button=document.querySelector('#submit');
const officialInput=document.querySelector('input[name=mode][value=official]'),list=document.querySelector('#recent-list');
const sync=()=>{url.disabled=document.querySelector('input[name=mode]:checked').value!=='remote';};
// Serveurs récents : un clic remplit l'adresse et sélectionne « serveur distant ».
function renderRecent(recent){
 list.replaceChildren();document.querySelector('#recent').hidden=!recent.length;
 for(const item of recent){
  const li=document.createElement('li'),pick=document.createElement('button'),forget=document.createElement('button');
  pick.type='button';pick.className='recent-pick';pick.textContent=new URL(item.url).host;pick.title=item.url;
  if(item.lastUsed){const when=document.createElement('small');when.textContent=new Date(item.lastUsed).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});pick.append(when);}
  pick.addEventListener('click',()=>{const official=config.official&&item.url===config.official.url;document.querySelector(`input[name=mode][value=${official?'official':'remote'}]`).checked=true;if(!official)url.value=item.url;sync();});
  forget.type='button';forget.className='recent-forget';forget.textContent='×';forget.title='Retirer de la liste';forget.setAttribute('aria-label','Retirer '+item.url+' de la liste');
  forget.addEventListener('click',async()=>renderRecent(await window.multicordDesktop.forgetServer(item.url)||[]));
  li.append(pick,forget);list.append(li);
 }
}
window.multicordDesktop.configuration().then(value=>{if(!value)return;config=value;
 if(value.official){document.querySelector('#official-name').textContent=value.official.name;}else{officialInput.disabled=true;document.querySelector('#official-hint').textContent='Bientôt disponible.';document.querySelector('#official-option').classList.add('unavailable');}
 const mode=value.mode==='official'&&!value.official?'local':value.mode;document.querySelector(`input[name=mode][value=${mode}]`).checked=true;
 url.value=value.mode==='remote'?value.serverUrl:'';sync();document.querySelector('#tray').checked=value.closeToTray;feedback.textContent=value.error;renderRecent((value.recent||[]).filter(r=>!value.official||r.url!==value.official.url||true));});
document.querySelectorAll('input[name=mode]').forEach(input=>input.addEventListener('change',sync));
document.querySelector('#connection').addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;feedback.textContent='Connexion en cours…';const mode=document.querySelector('input[name=mode]:checked').value;try{const result=await window.multicordDesktop.saveConfiguration({mode,serverUrl:url.value||'http://localhost:3000',closeToTray:document.querySelector('#tray').checked,localPort:config.localPort});if(result?.error)feedback.textContent=result.error;}catch{feedback.textContent='La connexion a échoué.';}button.disabled=false;});
