// Présence visible d'un compte : null (hors ligne ou invisible), 'online', 'idle' ou 'dnd'.
// « En ligne » devient « Absent » quand toutes ses connexions sont inactives depuis un moment.
export function createPresence({io,online,settings}){
  return async function presenceOf(userId){
    if(!online.has(userId))return null;
    const prefs=await settings.get(userId);
    if(!prefs.showOnline||prefs.presence==='invisible')return null;
    if(prefs.presence!=='online')return prefs.presence;
    const sockets=[...online.get(userId)].map(id=>io.sockets.sockets.get(id)).filter(Boolean);
    return sockets.length&&sockets.every(s=>s.data.away)?'idle':'online';
  };
}
