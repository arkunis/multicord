// Recalcule la taille et l'empreinte SHA-512 des fichiers cités dans latest.yml.
// Nécessaire après la signature : signer un exe modifie son contenu, et electron-updater refuse un fichier dont l'empreinte diffère.
// Usage : node scripts/refresh-update-manifest.mjs <dossier contenant latest.yml et les exe>
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const dir=path.resolve(process.argv[2]||'release'),manifest=path.join(dir,'latest.yml');
const lines=(await readFile(manifest,'utf8')).split(/\r?\n/),cache=new Map();
async function info(name){
 if(!cache.has(name)){const data=await readFile(path.join(dir,name));cache.set(name,{sha512:createHash('sha512').update(data).digest('base64'),size:data.length});}
 return cache.get(name);
}
let current=null,top=lines.find(l=>/^path:/.test(l))?.replace(/^path:\s*/,'').trim();
for(let i=0;i<lines.length;i++){
 const line=lines[i];
 const url=line.match(/^\s*-\s*url:\s*(.+)$/);if(url){current=url[1].trim();continue;}
 if(/^\S/.test(line))current=null;
 const field=line.match(/^(\s*)(sha512|size):/);if(!field)continue;
 const file=field[1]?current:top;if(!file)continue;
 const value=await info(file);lines[i]=`${field[1]}${field[2]}: ${value[field[2]]}`;
}
await writeFile(manifest,lines.join('\n'));
console.log(`latest.yml mis à jour pour ${[...cache.keys()].join(', ')}`);
