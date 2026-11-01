export async function copyText(text) {
  if(typeof text!=='string'||!text)throw new Error('L’identifiant est encore en cours de chargement.');
  try {
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  }catch{/* Certains navigateurs permettent uniquement la copie liée au clic. */}
  const focused=document.activeElement;
  const selection=window.getSelection();
  const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
  const field=document.createElement('textarea');
  field.value=text;field.readOnly=true;field.tabIndex=-1;
  field.setAttribute('aria-hidden','true');
  Object.assign(field.style,{position:'fixed',opacity:'0',left:'-9999px',top:'0'});
  document.body.append(field);
  try{field.focus({preventScroll:true});field.select();if(!document.execCommand('copy'))throw new Error('La copie a échoué. Sélectionnez votre identifiant pour le copier.');}
  finally{field.remove();focused?.focus?.({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}
}
