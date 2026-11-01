import {NoiseGateWorkletNode,RnnoiseWorkletNode,loadRnnoise} from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorklet from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline';
import gateWorklet from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url&no-inline';
import rnnoiseWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasm from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

// Anti-bruit avancé : RNNoise (réseau de neurones qui ne garde que la voix) puis une porte de bruit
// qui coupe le souffle résiduel entre les phrases. Le contexte audio doit tourner à 48 kHz.
export async function createNoiseFilter(context){
 const wasmBinary=await loadRnnoise({url:rnnoiseWasm,simdUrl:rnnoiseSimdWasm});
 await context.audioWorklet.addModule(rnnoiseWorklet);
 await context.audioWorklet.addModule(gateWorklet);
 const rnnoise=new RnnoiseWorkletNode(context,{wasmBinary,maxChannels:1});
 const gate=new NoiseGateWorkletNode(context,{openThreshold:-52,closeThreshold:-58,holdMs:220,maxChannels:1});
 rnnoise.connect(gate);
 return {input:rnnoise,output:gate,destroy(){try{rnnoise.disconnect();gate.disconnect();rnnoise.destroy();}catch{}}};
}
