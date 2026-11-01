import {DEFAULT_SETTINGS} from '../shared/settings.js';
import {applyTheme} from './themes';
export {DEFAULT_SETTINGS};
export function readLocal(key,fallback={}){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}}
export function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function applyPreferences(p){const root=document.documentElement;root.dataset.theme=p.theme;applyTheme(p.theme);root.classList.toggle('reduce-motion',p.reducedMotion);root.classList.toggle('high-contrast',p.highContrast);root.classList.toggle('compact-messages',p.compact);root.style.setProperty('--message-font',p.messageFont+'px');}
