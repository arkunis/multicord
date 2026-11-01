import React,{useState} from 'react';
import {Smile} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import {FormatToolbar,applyFormat,formatShortcut} from './richText';
import {applyShortcodes,emoticonBeforeCaret} from './emojiData';

// Outils communs aux zones de saisie : mise en forme de la sélection, emojis, :raccourcis:.
export function useComposerTools({text,setText,inputRef}){
 const [selected,setSelected]=useState(false),[emoji,setEmoji]=useState(false);
 const restore=(start,end)=>requestAnimationFrame(()=>{const el=inputRef.current;if(el){el.focus();el.setSelectionRange(start,end);setSelected(start!==end);}});
 function format(id){const el=inputRef.current;if(!el)return;const next=applyFormat(id,text,el.selectionStart,el.selectionEnd);setText(next.text);restore(next.start,next.end);}
 function insert(value){const el=inputRef.current,start=el?el.selectionStart:text.length,end=el?el.selectionEnd:text.length;setText(text.slice(0,start)+value+text.slice(end));restore(start+value.length,start+value.length);}
 return {
  // À appeler après setText dans le onChange de la zone de saisie.
  onChange(e){const next=emoticonBeforeCaret(e.target.value,e.target.selectionStart);if(next){setText(next.text);restore(next.caret,next.caret);}},
  onSelect(e){setSelected(e.target.selectionStart!==e.target.selectionEnd);},
  onKeyDown(e){const id=formatShortcut(e);if(!id)return false;e.preventDefault();format(id);return true;},
  prepare:value=>applyShortcodes(value),
  reset(){setSelected(false);},
  toolbar:selected&&<FormatToolbar onFormat={format}/>,
  emojiButton:<button type="button" className={`composer-emoji ${emoji?'active':''}`} data-emoji-toggle aria-label="Ajouter un emoji" title="Ajouter un emoji" aria-expanded={emoji} onClick={()=>setEmoji(o=>!o)}><Smile size={20}/></button>,
  emojiPicker:emoji&&<EmojiPicker onPick={insert} onClose={()=>setEmoji(false)}/>,
 };
}
