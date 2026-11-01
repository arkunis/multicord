// Installs this workstation's server configuration privately. Never called by packaging.
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
const directory=path.join(process.env.APPDATA,'Multicord'),destination=path.join(directory,'backend.env');
try{await access(destination);console.log('Configuration privée existante conservée.');process.exit(0);}catch{}
const input=parseEnv(await readFile('.env','utf8')),result={};
for(const key of ['DATABASE_URL','DATABASE_POOL_MAX','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','TURN_URL','TURN_USERNAME','TURN_CREDENTIAL'])if(input[key])result[key]=input[key];
await mkdir(directory,{recursive:true});
if(input.DATABASE_SSL_CA_FILE){const ca=path.join(directory,'database-ca.pem');await copyFile(path.resolve(input.DATABASE_SSL_CA_FILE),ca);result.DATABASE_SSL_CA_FILE=ca.replaceAll('\\','/');}
await writeFile(destination,Object.entries(result).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
console.log('Configuration serveur conservée hors du logiciel, dans le dossier privé Multicord de cette machine.');
