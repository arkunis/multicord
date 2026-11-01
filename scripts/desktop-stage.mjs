import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),stage=path.resolve(root,'desktop-stage');
if(path.dirname(stage)!==root||path.basename(stage)!=='desktop-stage')throw new Error('Dossier de compilation invalide.');
console.log('Préparation dans '+stage);await rm(stage,{recursive:true,force:true});await mkdir(path.join(stage,'app'),{recursive:true});await mkdir(path.join(stage,'backend'),{recursive:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
for(const file of ['main.cjs','preload.cjs','config.cjs','loading.html','connection.html','connection.js','capture.html','capture.js','ui.css','assets','official.json'])await cp(path.join('desktop',file),path.join(stage,'app',file),{recursive:true});
await mkdir(path.join(stage,'app','node_modules'),{recursive:true});
await writeFile(path.join(stage,'app','package.json'),JSON.stringify({name:'multicord',productName:'Multicord',version:pkg.version,description:'Vos communautés, vos conversations et vos appels.',author:'Multicord',main:'main.cjs',private:true,dependencies:{'electron-updater':pkg.devDependencies['electron-updater']}},null,2));
for(const folder of ['server','shared','dist'])await cp(folder,path.join(stage,'backend',folder),{recursive:true});
await cp('package-lock.json',path.join(stage,'backend','package-lock.json'));await writeFile(path.join(stage,'backend','package.json'),JSON.stringify(pkg,null,2));
const npm=process.platform==='win32'?'npm.cmd':'npm';const result=spawnSync(npm,['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(stage,'backend'),stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)throw new Error('Installation des dépendances embarquées échouée.');
// Module de mise à jour automatique, installé dans l'application elle-même.
const updater=spawnSync(npm,['install','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--no-package-lock'],{cwd:path.join(stage,'app'),stdio:'inherit',shell:process.platform==='win32'});if(updater.status!==0)throw new Error('Installation du module de mise à jour impossible.');
console.log('Sources et dépendances préparées. Aucun .env ni dossier data inclus.');
