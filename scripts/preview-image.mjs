// SPDX-License-Identifier: GPL-3.0-or-later
// The only binary source exception is one reviewed static gameplay preview. No EXIF/XMP/ICC/animation/extra chunks.
export function inspectWebP(bytes){
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw Error('Invalid preview container');
 let at=12,width=0,height=0,images=0;const chunks=[];
 while(at<bytes.length){
  if(at+8>bytes.length)throw Error('Truncated preview chunk');
  const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),end=at+8+length;
  if(end>bytes.length||!['VP8 ','VP8L','VP8X','ALPH'].includes(kind))throw Error('Unsupported preview metadata or chunk');
  const b=bytes.subarray(at+8,end);chunks.push(kind);
  if(kind==='VP8X'){
   if(length!==10||(b[0]&~16)!==0)throw Error('Preview metadata or animation flags');
   width=b.readUIntLE(4,3)+1;height=b.readUIntLE(7,3)+1;
  }else if(kind==='VP8 '){
   if(length<10||b[3]!==0x9d||b[4]!==1||b[5]!==0x2a)throw Error('Invalid preview frame');
   width=b.readUInt16LE(6)&0x3fff;height=b.readUInt16LE(8)&0x3fff;images++;
  }else if(kind==='VP8L'){
   if(length<5||b[0]!==0x2f)throw Error('Invalid lossless preview');
   const bits=b.readUInt32LE(1);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;images++;
  }
  at=end+(length%2);
 }
 if(at!==bytes.length||images!==1||width!==1920||height!==1080)throw Error('Unexpected preview layout');
 return {width,height,chunks};
}
