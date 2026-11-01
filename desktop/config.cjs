const {URL}=require('node:url');
function validateServerUrl(value){
 if(typeof value!=='string'||value.length>2048)throw new Error('Adresse du serveur invalide.');
 let url;try{url=new URL(value.trim());}catch{throw new Error('Indiquez une adresse complète, par exemple https://multicord.exemple.fr.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(local&&url.protocol==='http:')))throw new Error('Utilisez une origine HTTPS, sans identifiants ni chemin. HTTP est réservé à localhost.');
 return url.origin;
}
function validateConfig(value={}){const mode=value.mode==='remote'?'remote':'local';let serverUrl='http://localhost:3000';try{serverUrl=validateServerUrl(value.serverUrl||serverUrl);}catch(error){if(mode==='remote')throw error;}return {mode,serverUrl,localPort:Number.isInteger(value.localPort)&&value.localPort>=1024&&value.localPort<=65535?value.localPort:3000,closeToTray:value.closeToTray!==false};}
module.exports={validateServerUrl,validateConfig};
