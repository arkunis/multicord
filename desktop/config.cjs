const {URL}=require('node:url');
function validateServerUrl(value){
 if(typeof value!=='string'||value.length>2048)throw new Error('Adresse du serveur invalide.');
 let url;try{url=new URL(value.trim());}catch{throw new Error('Indiquez une adresse complète, par exemple https://multicord.exemple.fr.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(local&&url.protocol==='http:')))throw new Error('Utilisez une origine HTTPS, sans identifiants ni chemin. HTTP est réservé à localhost.');
 return url.origin;
}
// Serveurs déjà utilisés (8 au plus), du plus récent au plus ancien.
function validateRecent(list){if(!Array.isArray(list))return [];const out=[];for(const item of list){try{const url=validateServerUrl(item?.url);if(!out.some(x=>x.url===url))out.push({url,lastUsed:typeof item.lastUsed==='string'?item.lastUsed.slice(0,40):''});}catch{}if(out.length>=8)break;}return out;}
function validateConfig(value={}){const mode=['remote','official'].includes(value.mode)?value.mode:'local';let serverUrl='http://localhost:3000';try{serverUrl=validateServerUrl(value.serverUrl||serverUrl);}catch(error){if(mode==='remote')throw error;}return {mode,serverUrl,localPort:Number.isInteger(value.localPort)&&value.localPort>=1024&&value.localPort<=65535?value.localPort:3000,closeToTray:value.closeToTray!==false,recent:validateRecent(value.recent)};}
module.exports={validateServerUrl,validateConfig};
