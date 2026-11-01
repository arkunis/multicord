export const DEFAULT_SETTINGS=Object.freeze({theme:'dark',messageFont:12,compact:false,reducedMotion:false,highContrast:false,dmPolicy:'everyone',friendRequests:'everyone',showOnline:true,presence:'online',dmNotifications:true,notificationSounds:false,notificationVolume:50,notificationPreview:true,unreadBadges:true,inputVolume:100,outputVolume:100,noiseSuppression:true,noiseReduction:'advanced',echoCancellation:true,autoGainControl:true,cameraQuality:'720'});
const enums={theme:['dark','forest','ocean','glacier','midnight','lavender','rose','ember','amber','graphite','light'],presence:['online','idle','dnd','invisible'],noiseReduction:['off','standard','advanced'],dmPolicy:['everyone','friends','none'],friendRequests:['everyone','shared-server','none'],cameraQuality:['480','720','1080']};
const ranges={messageFont:[12,18],notificationVolume:[0,100],inputVolume:[0,200],outputVolume:[0,100]};
export function validateSettings(patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Préférences invalides.');
  for(const [key,value]of Object.entries(patch)){
    if(!Object.hasOwn(DEFAULT_SETTINGS,key))throw new Error('Préférence inconnue : '+key);
    if(enums[key]&&!enums[key].includes(value))throw new Error('Valeur invalide : '+key);
    if(ranges[key]&&(!Number.isInteger(value)||value<ranges[key][0]||value>ranges[key][1]))throw new Error('Valeur hors limites : '+key);
    if(typeof DEFAULT_SETTINGS[key]==='boolean'&&typeof value!=='boolean')throw new Error('Valeur invalide : '+key);
  }
  return patch;
}
