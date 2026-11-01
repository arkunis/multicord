import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect x="8" y="8" width="496" height="496" rx="138" fill="#1b2118"/><g transform="translate(62 110) scale(8.8)" fill="none"><path d="M5 27V13c0-8 11-8 11 0v10-10c0-8 12-8 12 0v10-10c0-8 11-8 11 0v14" stroke="#b9d8b2" stroke-width="5" stroke-linecap="round"/></g></svg>');
await mkdir('desktop/assets',{recursive:true});await sharp(svg).png().toFile('desktop/assets/multicord.png');
const sizes=[16,32,48,64,128,256],images=await Promise.all(sizes.map(size=>sharp(svg).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
images.forEach((image,i)=>{const at=6+i*16;header[at]=sizes[i]===256?0:sizes[i];header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(image.length,at+8);header.writeUInt32LE(offset,at+12);offset+=image.length;});
await writeFile('desktop/assets/multicord.ico',Buffer.concat([header,...images]));console.log('Icône Multicord générée.');
