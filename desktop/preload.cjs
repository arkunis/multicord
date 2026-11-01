const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('multicordDesktop',Object.freeze({
 version:()=>ipcRenderer.invoke('desktop:version'),
 connection:()=>ipcRenderer.invoke('desktop:connection'),
 configuration:()=>ipcRenderer.invoke('desktop:configuration'),
 saveConfiguration:value=>ipcRenderer.invoke('desktop:save-configuration',value),
 notify:value=>ipcRenderer.invoke('desktop:notify',value),
 sources:()=>ipcRenderer.invoke('desktop:sources'),
 chooseSource:id=>ipcRenderer.invoke('desktop:choose-source',id),
 pickScreen:()=>ipcRenderer.invoke('desktop:pick-screen'),
 takeInvite:()=>ipcRenderer.invoke('desktop:take-invite'),
 updateState:()=>ipcRenderer.invoke('desktop:update-state'),
 installUpdate:()=>ipcRenderer.invoke('desktop:install-update'),
 onUpdate:callback=>{const listener=()=>callback();ipcRenderer.on('desktop:update',listener);return ()=>ipcRenderer.removeListener('desktop:update',listener);},
 onInvite:callback=>{const listener=()=>callback();ipcRenderer.on('desktop:invite-ready',listener);return ()=>ipcRenderer.removeListener('desktop:invite-ready',listener);}
}));
