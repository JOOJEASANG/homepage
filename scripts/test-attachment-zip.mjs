import assert from 'node:assert/strict';
import { buildAttachmentZip } from '../assets/js/pages/admin/attachment-zip.js';
const zip=await buildAttachmentZip([{name:'자료.pdf',blob:new Blob(['123456789'])},{name:'자료.pdf',blob:new Blob(['abc'])},{name:'../test.txt',blob:new Blob([''])}]);
const bytes=new Uint8Array(await zip.arrayBuffer()), v=new DataView(bytes.buffer), decoder=new TextDecoder();
assert.equal(v.getUint32(0,true),0x04034b50);
assert.equal(v.getUint32(14,true),0xcbf43926);
assert.equal(v.getUint16(6,true),0x800);
const e=bytes.length-22;
assert.equal(v.getUint32(e,true),0x06054b50);
assert.equal(v.getUint16(e+10,true),3);
let central=v.getUint32(e+16,true);
const names=[];
for(let i=0;i<3;i++){
  assert.equal(v.getUint32(central,true),0x02014b50);
  const length=v.getUint16(central+28,true);
  names.push(decoder.decode(bytes.slice(central+46,central+46+length)));
  const offset=v.getUint32(central+42,true);
  assert.equal(v.getUint32(offset,true),0x04034b50);
  central+=46+length;
}
assert.deepEqual(names,['자료.pdf','자료 (2).pdf','_test.txt']);
assert.equal(central,e);
console.log('Attachment ZIP structure/CRC/UTF-8 tests passed');
