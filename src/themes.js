// Thèmes de couleur : la feuille de style d'origine (Sauge) est recolorée à la volée.
// Les verts (accent et fonds teintés) prennent la teinte du thème ; les rouges, ors et images restent intacts.
export const THEMES=[
 {id:'dark',label:'Sauge',hint:'Le vert d’origine de Multicord'},
 {id:'forest',label:'Forêt',hue:138,accent:1.7,tint:1.5,hint:'Un vert plus franc'},
 {id:'ocean',label:'Océan',hue:188,accent:1.6,tint:2,hint:'Turquoise et bleu profond'},
 {id:'glacier',label:'Glacier',hue:208,accent:1.9,tint:1.3,hint:'Bleu clair et frais'},
 {id:'midnight',label:'Minuit',hue:226,accent:1.4,tint:2.2,hint:'Ardoise bleutée'},
 {id:'lavender',label:'Lavande',hue:262,accent:1.4,tint:1.8,hint:'Violet doux'},
 {id:'rose',label:'Rose',hue:335,accent:1.5,tint:1.6,hint:'Rose poudré'},
 {id:'ember',label:'Braise',hue:12,accent:1.8,tint:1.6,hint:'Rouge chaud'},
 {id:'amber',label:'Ambre',hue:38,accent:2,tint:1.8,hint:'Miel et cuivre'},
 {id:'graphite',label:'Graphite',hue:0,accent:0,tint:0,hint:'Noir et gris, sans couleur'},
 {id:'light',label:'Clair',hue:109,accent:1.2,tint:1,light:true,hint:'Fond clair pour la journée'},
];
export const THEME_IDS=THEMES.map(t=>t.id);

function toHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;if(max===min)return [0,0,l];const d=max-min,s=l>.5?d/(2-max-min):d/(max+min);const h=max===r?((g-b)/d+(g<b?6:0)):max===g?(b-r)/d+2:(r-g)/d+4;return [h*60,s,l];}
function toRgb(h,s,l){const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>Math.round(255*(l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1))));return [f(0),f(8),f(4)];}
function recolor(r,g,b,alpha,theme){
 let [h,s,l]=toHsl(r,g,b);
 if((h>=55&&h<=175)||s<.05){h=theme.hue;s=Math.min(1,s*(s>.2?theme.accent:theme.tint));}
 // Thème clair : on inverse la luminosité, sauf les ombres noires transparentes.
 if(theme.light&&!(alpha<1&&l<.02))l=1-l;
 return toRgb(h,s,l);
}
export function transformCss(css,theme){
 const out=(c,a)=>a===undefined||a>=1?`rgb(${c.join(', ')})`:`rgba(${c.join(', ')}, ${a})`;
 return css.replace(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/g,(_,r,g,b,a)=>out(recolor(+r,+g,+b,a===undefined?1:+a,theme),a===undefined?undefined:+a))
  .replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi,(_,hex)=>{const x=hex.length<5?[...hex].map(c=>c+c).join(''):hex;const [r,g,b]=[0,2,4].map(i=>parseInt(x.slice(i,i+2),16)),a=x.length===8?Math.round(parseInt(x.slice(6),16)/2.55)/100:undefined;return out(recolor(r,g,b,a??1,theme),a);});
}
// Couleurs d'aperçu d'un thème : fond, panneau, accent.
export function swatch(id){const t=THEMES.find(x=>x.id===id);return ['#171918','#262d24','#b9d8b2'].map(c=>t?.hue===undefined?c:transformCss(c,t));}

let originals=null;const cache=new Map();
export function applyTheme(id){
 const theme=THEMES.find(t=>t.id===id)||THEMES[0];
 try{localStorage.setItem('mc-theme',theme.id);}catch{}
 const own=[...document.styleSheets].filter(s=>s.ownerNode?.id!=='theme-sheet');
 if(!originals){originals=[];for(const sheet of own){try{originals.push([...sheet.cssRules].map(r=>r.cssText).join('\n'));}catch{}}}
 let node=document.getElementById('theme-sheet');
 if(theme.hue===undefined){node?.remove();for(const s of own)s.disabled=false;return;}
 if(!cache.has(theme.id))cache.set(theme.id,transformCss(originals.join('\n'),theme));
 if(!node){node=document.createElement('style');node.id='theme-sheet';document.head.appendChild(node);}
 node.textContent=cache.get(theme.id);
 for(const sheet of own){try{if(sheet.cssRules)sheet.disabled=true;}catch{}}
}
