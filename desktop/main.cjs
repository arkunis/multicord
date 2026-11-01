const {app,BrowserWindow,Menu,Tray,dialog,ipcMain,shell,utilityProcess,desktopCapturer,Notification,nativeTheme,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {parseEnv}=require('node:util');
const {pathToFileURL}=require('node:url');
const {validateConfig,validateServerUrl}=require('./config.cjs');
app.setName('Multicord');app.setAppUserModelId('fr.multicord.desktop');nativeTheme.themeSource='dark';
if(process.env.MULTICORD_DESKTOP_DATA_DIR)app.setPath('userData',path.resolve(process.env.MULTICORD_DESKTOP_DATA_DIR));
const gotLock=app.requestSingleInstanceLock();if(!gotLock){app.quit();}else{app.whenReady().then(start).catch(()=>dialog.showErrorBox('Multicord','Impossible de démarrer Multicord. Vérifiez la configuration du serveur.'));}
const dataDir=app.getPath('userData'),configPath=path.join(dataDir,'connection.json'),icon=path.join(__dirname,'assets','multicord.ico');
const localPage=name=>pathToFileURL(path.join(__dirname,name+'.html')).href;
let main,control,picker,tray,backend,origin,quitting=false,config,pendingCapture,captureSources=[],startup=0,lastNotification=0,pendingInvite=null;
fs.mkdirSync(dataDir,{recursive:true});
try{config=validateConfig(JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,'')));}catch{config=validateConfig();}
const isTrusted=event=>main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&!!origin&&event.senderFrame.url.startsWith(origin+'/');
const isControl=event=>control&&!control.isDestroyed()&&event.sender===control.webContents&&event.senderFrame.url===localPage('connection');
const preferences={preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true};
function sameOrigin(value){try{return new URL(value).origin===origin;}catch{return false;}}
function show(){if(main&&!main.isDestroyed()){if(main.isMinimized())main.restore();main.show();main.focus();}}
async function stopBackend(){const child=backend;if(!child)return;await new Promise(resolve=>{const timer=setTimeout(resolve,2500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});if(backend===child)backend=null;}
// Liens multicord://invite/CODE : ouverts depuis le navigateur, transmis à l'interface.
const inviteFrom=argv=>{for(const arg of argv||[]){try{const url=new URL(arg);const code=url.protocol==='multicord:'&&url.hostname==='invite'?url.pathname.replace(/^\/+|\/+$/g,''):'';if(/^[A-Za-z0-9]{6,32}$/.test(code))return code;}catch{}}return null;};
function deliverInvite(code){if(!code)return;pendingInvite=code;if(main&&!main.isDestroyed()&&origin)main.webContents.send('desktop:invite-ready');}
// Seule l'application installée s'enregistre (l'installateur NSIS déclare aussi le protocole) : un lancement de développement ne détourne pas les liens.
if(app.isPackaged)app.setAsDefaultProtocolClient('multicord');
pendingInvite=inviteFrom(process.argv);
app.on('second-instance',(_event,argv)=>{show();deliverInvite(inviteFrom(argv));});app.on('activate',show);
app.on('open-url',(event,url)=>{event.preventDefault();deliverInvite(inviteFrom([url]));show();});
// Le dernier serveur ouvert vit dans le stockage local : on l’écrit sur disque avant de quitter ou de masquer la fenêtre.
const flushStorage=()=>{try{session.defaultSession.flushStorageData();}catch{}};
app.on('before-quit',()=>{quitting=true;flushStorage();backend?.kill();pendingCapture?.(null);pendingCapture=null;});
app.on('window-all-closed',()=>{if(!tray)app.quit();});
function restrict(win){win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});win.webContents.on('will-attach-webview',event=>event.preventDefault());win.webContents.on('will-navigate',(event,url)=>{if(win===main&&origin&&url.startsWith(origin+'/'))return;event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);});}
async function healthy(url){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200),redirect:'error'});const d=await r.json();return r.ok&&d.service==='multicord'&&d.api===1;}catch{return false;}}
async function freePort(preferred){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>{const next=net.createServer();next.once('error',reject);next.listen(0,'127.0.0.1',()=>{const port=next.address().port;next.close(()=>resolve(port));});});server.listen(preferred,'127.0.0.1',()=>server.close(()=>resolve(preferred)));});}
async function localBackend(){
 const preferred=`http://localhost:${config.localPort}`;if(await healthy(preferred))return {url:preferred,mode:'existing'};
 const port=await freePort(config.localPort),url=`http://localhost:${port}`;
 let privateEnv={};try{privateEnv=parseEnv(fs.readFileSync(path.join(dataDir,'backend.env'),'utf8'));}catch{}
 const allowed=['DATABASE_URL','DATABASE_SSL_CA_FILE','DATABASE_POOL_MAX','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','TURN_URL','TURN_USERNAME','TURN_CREDENTIAL'];
 const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
 for(const key of allowed)if(privateEnv[key])env[key]=privateEnv[key];
 Object.assign(env,{PORT:String(port),HOST:'127.0.0.1',SQLITE_PATH:path.join(dataDir,'multicord.db'),MAIL_TRANSPORT:'file',MAIL_OUTBOX_DIR:path.join(dataDir,'mail')});
 // The backend is bundled outside app.asar so native modules and Node's SQLite work normally.
 const root=app.isPackaged?path.join(process.resourcesPath,'backend'):path.join(__dirname,'..');
 const child=utilityProcess.fork(path.join(root,'server','index.js'),['--production'],{cwd:root,env,stdio:'pipe',serviceName:'Multicord — service local'});backend=child;
 let died=false;child.once('exit',()=>{died=true;if(backend===child)backend=null;if(!quitting&&origin===url){origin=null;openConnection('Le service local s’est arrêté. Relancez la connexion.');}});
 // Drain output without exposing credentials or database errors in the renderer.
 backend.stdout?.on('data',()=>{});backend.stderr?.on('data',()=>{});
 for(let i=0;i<100&&!died;i++){if(await healthy(url))return {url,mode:'embedded'};await new Promise(resolve=>setTimeout(resolve,150));}
 backend?.kill();backend=null;throw new Error('Le service local ne démarre pas. Vérifiez backend.env dans le dossier de données.');
}
function setupSession(session){
 const grants=new Set();
 // L'application installée est la seule page servie dans cette fenêtre : le micro, la caméra et la
 // capture d'écran sont accordés sans boîte de dialogue, uniquement pour l'origine Multicord connectée.
 const allowed=['clipboard-sanitized-write','speaker-selection','display-capture','media','fullscreen'];
 session.setPermissionCheckHandler((contents,permission,requestOrigin)=>contents===main?.webContents&&sameOrigin(requestOrigin)&&allowed.includes(permission));
 session.setPermissionRequestHandler((contents,permission,callback,details)=>{
  if(contents!==main?.webContents||!origin||details.isMainFrame===false||!contents.getURL().startsWith(origin+'/'))return callback(false);
  callback(allowed.includes(permission));
 });
 session.setDisplayMediaRequestHandler((request,callback)=>{
  if(!origin||!sameOrigin(request.securityOrigin)||!main)return callback({});
  openPicker(source=>callback(source?{video:source}:{}));
 });
 session.webRequest.onHeadersReceived((details,callback)=>{
  if(origin&&details.url.startsWith(origin+'/'))callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ${origin.replace(/^http/,'ws')}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'`]}});else callback({});
 });
}
async function openPicker(resolve){
 if(pendingCapture||picker)return resolve(null);
 pendingCapture=resolve;
 try{captureSources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:360,height:200},fetchWindowIcons:false});
  picker=new BrowserWindow({width:850,height:650,minWidth:600,minHeight:430,parent:main,modal:true,title:'Multicord — partager un écran',icon,backgroundColor:'#1b2118',autoHideMenuBar:true,webPreferences:preferences});restrict(picker);picker.on('closed',()=>{picker=null;captureSources=[];pendingCapture?.(null);pendingCapture=null;});await picker.loadFile(path.join(__dirname,'capture.html'));
 }catch{pendingCapture?.(null);pendingCapture=null;picker?.close();}
}
async function connect(){
 const attempt=++startup;try{
  let result;if(config.mode==='remote'){const url=validateServerUrl(config.serverUrl);if(!await healthy(url))throw new Error('Ce serveur Multicord est inaccessible. Vérifiez son adresse et sa connexion.');result={url,mode:'remote'};}else result=await localBackend();
  if(attempt!==startup||quitting)return;
  origin=result.url;await main.loadURL(origin+'/');show();
  fs.writeFileSync(path.join(dataDir,'startup.json'),JSON.stringify({status:'ready',mode:result.mode,origin,electron:process.versions.electron,node:process.versions.node},null,2));
 }catch(error){if(!quitting)openConnection(error.message);}
}
function openConnection(error=''){
 if(control&&!control.isDestroyed()){control.show();return;}
 control=new BrowserWindow({width:650,height:620,minWidth:540,minHeight:530,parent:main,modal:!!main,title:'Multicord — connexion',icon,backgroundColor:'#1b2118',autoHideMenuBar:true,webPreferences:preferences});restrict(control);control.initialError=error;control.on('closed',()=>{control=null;});control.loadFile(path.join(__dirname,'connection.html'));
}
async function start(){
 main=new BrowserWindow({width:1380,height:900,minWidth:760,minHeight:560,show:false,title:'Multicord',icon,backgroundColor:'#1b2118',titleBarStyle:'hidden',titleBarOverlay:{color:'#141a13',symbolColor:'#b9d8b2',height:36},webPreferences:{...preferences,partition:'persist:multicord',backgroundThrottling:false}});restrict(main);setupSession(main.webContents.session);
 main.on('close',flushStorage);main.on('hide',flushStorage);main.on('blur',flushStorage);
 main.on('close',event=>{if(!quitting&&config.closeToTray&&tray){event.preventDefault();main.hide();}});
 main.webContents.on('page-title-updated',event=>{event.preventDefault();main.setTitle('Multicord');});
 main.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{if(isMainFrame&&code!==-3&&origin&&url.startsWith(origin))openConnection('La connexion au serveur a été interrompue.');});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Multicord',submenu:[{label:'Afficher Multicord',click:show},{label:'Connexion au serveur…',click:()=>openConnection()},{label:'Fermer dans la zone de notification',type:'checkbox',checked:config.closeToTray,click:item=>{config.closeToTray=item.checked;fs.writeFileSync(configPath,JSON.stringify(config,null,2));}},{label:'Dossier des données locales',click:()=>shell.openPath(dataDir)},{type:'separator'},{label:'Quitter',accelerator:'Control+Shift+Q',click:()=>app.quit()}]},{label:'Affichage',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
 try{tray=new Tray(icon);tray.setToolTip('Multicord');tray.setContextMenu(Menu.buildFromTemplate([{label:'Ouvrir Multicord',click:show},{label:'Connexion au serveur…',click:()=>openConnection()},{type:'separator'},{label:'Quitter Multicord',click:()=>app.quit()}]));tray.on('double-click',show);}catch{}
 await main.loadFile(path.join(__dirname,'loading.html'));show();await connect();
}
ipcMain.handle('desktop:version',event=>{if(!isTrusted(event))return null;return {version:app.getVersion(),platform:process.platform};});
ipcMain.handle('desktop:connection',event=>{if(isTrusted(event))openConnection();});
ipcMain.handle('desktop:pick-screen',event=>isTrusted(event)?new Promise(resolve=>openPicker(source=>resolve(source?source.id:null))):null);
ipcMain.handle('desktop:take-invite',event=>{if(!isTrusted(event))return null;const code=pendingInvite;pendingInvite=null;return code;});
ipcMain.handle('desktop:configuration',event=>{if(!isControl(event))return null;return {...config,error:control.initialError||''};});
ipcMain.handle('desktop:save-configuration',async(event,value)=>{
 if(!isControl(event))return {error:'Accès refusé.'};
  try{const next=validateConfig(value);if(next.mode==='remote'&&!await healthy(next.serverUrl))throw new Error('Le serveur est inaccessible ou ne correspond pas à Multicord.');config=next;fs.writeFileSync(configPath,JSON.stringify(config,null,2));origin=null;await stopBackend();control.close();await main.loadFile(path.join(__dirname,'loading.html'));connect();return {ok:true};}catch(error){return {error:error.message};}
});
ipcMain.handle('desktop:notify',(event,value)=>{
 if(!isTrusted(event)||!value||typeof value.title!=='string'||typeof value.body!=='string'||main.isFocused()||Date.now()-lastNotification<2000||!Notification.isSupported())return false;
 lastNotification=Date.now();const notification=new Notification({title:value.title.slice(0,80),body:value.body.slice(0,240),icon,silent:true});notification.on('click',show);notification.show();return true;
});
ipcMain.handle('desktop:sources',event=>picker&&event.sender===picker.webContents&&event.senderFrame.url===localPage('capture')?captureSources.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()})):[]);
ipcMain.handle('desktop:choose-source',(event,id)=>{
 if(!picker||event.sender!==picker.webContents||event.senderFrame.url!==localPage('capture'))return false;
 const source=captureSources.find(s=>s.id===id);if(!source&&id!==null)return false;const callback=pendingCapture;pendingCapture=null;callback?.(source||null);picker.close();return true;
});
