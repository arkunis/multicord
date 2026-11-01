// Topologie en étoile : chaque invité se connecte à l'hôte. L'hôte retransmet
// les pistes reçues aux autres invités. Aucun média ne traverse Socket.IO.
import {createNoiseFilter} from './noiseFilter';

export class VoiceSession {
  constructor(socket, config, update, onError, onLost) {
    this.socket = socket; this.config = config; this.update = update; this.onError = onError; this.onLost = onLost;
    this.peers = new Map(); this.remote = new Map(); this.incoming = new Map();
    this.local = null; this.screen = null; this.isHost = false; this.active = false;this.members=[];this.preferences={};this.devices={};
    this.roster=({members})=>{this.members=members;this.emit();};socket.on('voice:members',this.roster);
    this.signal = this.onSignal.bind(this);
    this.joined = ({peer}) => this.createPeer(peer);
    this.left = ({peer}) => this.removePeer(peer);
    socket.on('voice:signal', this.signal); socket.on('voice:peer-joined', this.joined); socket.on('voice:peer-left', this.left);
  }
  async join(channel, syntheticStream = null) {
    if (!syntheticStream && !navigator.mediaDevices?.getUserMedia) throw new Error('Le micro nécessite HTTPS ou localhost.');
    const p=this.preferences;
    this.local = syntheticStream || await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:p.echoCancellation!==false,noiseSuppression:(p.noiseReduction||'advanced')==='standard',autoGainControl:p.autoGainControl!==false,...(this.devices.input?{deviceId:{exact:this.devices.input}}:{})},video:false});
    if(!syntheticStream){this.raw=this.local;this.audioContext=new AudioContext({sampleRate:48000});await this.audioContext.resume();this.gain=this.audioContext.createGain();this.gain.gain.value=(p.inputVolume??100)/100;const destination=this.audioContext.createMediaStreamDestination();
      // Anti-bruit avancé (RNNoise) entre le micro et le gain ; en cas d'échec, le micro reste utilisable sans filtre.
      let source=this.audioContext.createMediaStreamSource(this.raw);
      if((p.noiseReduction||'advanced')==='advanced'){try{this.noise=await createNoiseFilter(this.audioContext);source.connect(this.noise.input);source=this.noise.output;}catch{this.onError('Anti-bruit avancé indisponible : le micro fonctionne sans filtre.');}}
      source.connect(this.gain).connect(destination);this.local=destination.stream;this.analyser=this.audioContext.createAnalyser();this.analyser.fftSize=512;this.gain.connect(this.analyser);}
    const result = await new Promise((resolve,reject) => this.socket.timeout(8000).emit('voice:join',{channel,streamIds:[this.local.id]},(err,data)=>err?reject(new Error('Le serveur vocal ne répond pas.')):resolve(data)));
    if(result.error) { this.local.getTracks().forEach(t=>t.stop()); throw new Error(result.error); }
    this.active = true; this.isHost = result.isHost; this.host = result.host;this.members=result.members||[];
    this.emit();this.watchSpeaking();
  }
  // Détection de parole sur son propre micro (après le gain, micro coupé = silence) ; seul le changement d'état est envoyé.
  watchSpeaking() {
    if(!this.analyser) return;
    const data=new Float32Array(this.analyser.fftSize);let last=0;
    this.speakingTimer=setInterval(()=>{
      this.analyser.getFloatTimeDomainData(data);let sum=0;for(const v of data) sum+=v*v;
      const now=Date.now(),enabled=this.local?.getAudioTracks().some(t=>t.enabled);
      if(enabled&&Math.sqrt(sum/data.length)>0.015) last=now;
      const speaking=now-last<350;
      if(speaking!==this.speaking){this.speaking=speaking;this.socket.emit('voice:speaking',{speaking});}
    },100);
  }
  emit() { this.update({local:this.local, screen:this.screen, remote:[...this.remote.entries()].map(([id,stream])=>({id,stream,owner:this.members.find(m=>m.streamIds.includes(id))})),members:this.members,isHost:this.isHost}); }
  announce(){this.socket.emit('voice:media',{streamIds:[this.local?.id,this.screen?.id].filter(Boolean)});}
  createPeer(id) {
    if(this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(this.config);
    const state = {pc,makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],polite:!this.isHost};
    this.peers.set(id,state);
    for(const track of this.local?.getTracks()||[]) pc.addTrack(track,this.local);
    if(this.screen) for(const track of this.screen.getTracks()) pc.addTrack(track,this.screen);
    if(this.isHost) for(const [owner,streams] of this.incoming) if(owner!==id) for(const stream of streams.values()) for(const track of stream.getTracks()) pc.addTrack(track,stream);
    pc.onicecandidate = ({candidate}) => {if(candidate) this.socket.emit('voice:signal',{to:id,candidate});};
    pc.onnegotiationneeded = async () => {
      try { state.makingOffer=true; await pc.setLocalDescription(); this.socket.emit('voice:signal',{to:id,description:pc.localDescription}); }
      catch(e) {if(this.active) this.onError(`Négociation audio : ${e.message}`);}
      finally {state.makingOffer=false;}
    };
    pc.ontrack = ({track,streams}) => {
      const stream=streams[0]||new MediaStream([track]);
      if(!this.incoming.has(id)) this.incoming.set(id,new Map());
      this.incoming.get(id).set(stream.id,stream);this.remote.set(stream.id,stream);
      if(this.isHost) for(const [other,s] of this.peers) if(other!==id && !s.pc.getSenders().some(x=>x.track?.id===track.id)) s.pc.addTrack(track,stream);
      const changed=()=>{this.emit();};
      track.onunmute=changed; track.onmute=changed;track.onended=changed;
      stream.addEventListener('removetrack',({track:removed})=>{
        if(this.isHost) for(const [other,{pc:connection}] of this.peers) if(other!==id) for(const sender of connection.getSenders()) if(sender.track===removed) connection.removeTrack(sender);
        if(!stream.getTracks().length) this.remote.delete(stream.id);
        this.emit();
      });
      this.emit();
    };
    // Connexion perdue : l'hôte libère l'invité (qui se reconnectera), l'invité relance la connexion à l'appel.
    pc.onconnectionstatechange = () => {
      clearTimeout(state.lostTimer);
      if(pc.connectionState==='disconnected') state.lostTimer=setTimeout(()=>{if(pc.connectionState!=='connected')this.lost(id);},8000);
      if(pc.connectionState==='failed') this.lost(id);
    };
    return state;
  }
  lost(id) {
    if(!this.active||!this.peers.has(id)) return;
    if(this.isHost) {this.removePeer(id);return;}
    if(this.onLost) this.onLost(); else this.onError('Connexion média impossible. Un serveur TURN peut être nécessaire sur ce réseau.');
  }
  async onSignal({from,description,candidate}) {
    if(!this.active) return;
    const s=this.createPeer(from); const pc=s.pc;
    try {
      if(description) {
        const ready=!s.makingOffer&&(pc.signalingState==='stable'||s.settingAnswer);
        const collision=description.type==='offer'&&!ready;
        s.ignoreOffer=!s.polite&&collision;
        if(s.ignoreOffer) return;
        s.settingAnswer=description.type==='answer';
        await pc.setRemoteDescription(description);s.settingAnswer=false;
        for(const c of s.candidates.splice(0)) await pc.addIceCandidate(c);
        if(description.type==='offer') { await pc.setLocalDescription();this.socket.emit('voice:signal',{to:from,description:pc.localDescription}); }
      } else if(candidate) {
        if(!pc.remoteDescription) s.candidates.push(candidate);
        else try {await pc.addIceCandidate(candidate);} catch(e) {if(!s.ignoreOffer) throw e;}
      }
    } catch(e) {if(this.active) this.onError(`Connexion média : ${e.message}`);}
  }
  mute(value) { this.local?.getAudioTracks().forEach(t=>t.enabled=!value); }
  configure(preferences,devices){this.preferences=preferences;this.devices=devices;if(this.gain)this.gain.gain.value=(preferences.inputVolume??100)/100;}
  async camera(value) {
    if(value) {
      const height=Number(this.preferences.cameraQuality||720);
      const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:Math.round(height*16/9)},height:{ideal:height},...(this.devices.camera?{deviceId:{exact:this.devices.camera}}:{})},audio:false});
      const track=media.getVideoTracks()[0];this.local.addTrack(track);
      for(const {pc} of this.peers.values()) pc.addTrack(track,this.local);
    } else {
      for(const track of this.local.getVideoTracks()) {
        for(const {pc} of this.peers.values()) for(const sender of pc.getSenders()) if(sender.track===track) pc.removeTrack(sender);
        this.local.removeTrack(track);track.stop();
      }
    }
    this.emit();
  }
  async share() {
    if(this.screen) {this.stopShare();return false;}
    const desktop=window.multicordDesktop;
    if(desktop?.pickScreen) {
      // Application Windows : sélecteur Multicord puis capture directe de la source choisie.
      const source=await desktop.pickScreen();
      if(!source) return false;
      this.screen=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:source,maxWidth:1920,maxHeight:1080,maxFrameRate:30}}});
    } else {
      if(!navigator.mediaDevices.getDisplayMedia) throw new Error('Le partage d’écran n’est pas disponible dans ce navigateur.');
      try { this.screen=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false}); }
      catch(e) { if(['NotAllowedError','AbortError'].includes(e.name)) return false; throw e; }
    }
    if(!this.active) { this.screen.getTracks().forEach(t=>t.stop()); this.screen=null; return false; }
    const track=this.screen.getVideoTracks()[0];
    for(const {pc} of this.peers.values()) pc.addTrack(track,this.screen);
    track.onended=()=>this.stopShare();this.announce();this.emit();return true;
  }
  stopShare() {
    if(!this.screen) return;
    for(const track of this.screen.getTracks()) {for(const {pc} of this.peers.values()) for(const sender of pc.getSenders()) if(sender.track===track) pc.removeTrack(sender);track.stop();}
    this.screen=null;this.announce();this.emit();
  }
  removePeer(id) {
    const streams=this.incoming.get(id);
    if(streams) for(const stream of streams.values()) {
      this.remote.delete(stream.id);
      for(const [other,{pc}] of this.peers) if(other!==id) for(const sender of pc.getSenders()) if(stream.getTracks().includes(sender.track)) pc.removeTrack(sender);
    }
    this.incoming.delete(id);this.peers.get(id)?.pc.close();this.peers.delete(id);this.emit();
  }
  destroy() {
    clearInterval(this.speakingTimer);this.active=false; this.socket.emit('voice:leave');
    this.socket.off('voice:members',this.roster);
    this.socket.off('voice:signal',this.signal);this.socket.off('voice:peer-joined',this.joined);this.socket.off('voice:peer-left',this.left);
    this.local?.getTracks().forEach(t=>t.stop());this.screen?.getTracks().forEach(t=>t.stop());
    this.noise?.destroy();this.raw?.getTracks().forEach(t=>t.stop());this.audioContext?.close().catch(()=>{});
    for(const s of this.peers.values()) {clearTimeout(s.lostTimer);s.pc.close();}this.peers.clear();this.remote.clear();
  }
}
