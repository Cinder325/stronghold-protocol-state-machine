// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {inspectWebP} from '../scripts/preview-image.mjs';
import {auditRelease} from '../scripts/audit-release.mjs';
const root=path.resolve(import.meta.dirname,'..'),image=fs.readFileSync(path.join(root,'docs/media/public-addon-preview.webp'));
test('reviewed gameplay preview is static 1080p and carries no ancillary metadata',()=>{
 const p=inspectWebP(image);assert.equal(p.width,1920);assert.equal(p.height,1080);assert(!p.chunks.some(s=>/EXIF|XMP|ICCP|ANIM/.test(s)));
 const metadata=Buffer.alloc(12);metadata.write('EXIF');metadata.writeUInt32LE(4,4);metadata.write('test',8);
 const bad=Buffer.concat([image,metadata]);bad.writeUInt32LE(bad.length-8,4);assert.throws(()=>inspectWebP(bad),/metadata|chunk/);
 assert.throws(()=>inspectWebP(Buffer.concat([image,Buffer.from('extra')])),/container/);
});
test('binary audit exception requires exact path and reviewed matching hash, other image files stay forbidden',t=>{
 const base=fs.realpathSync(os.tmpdir()),folder=fs.mkdtempSync(path.join(base,'addon-preview-'));
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(folder)),base);fs.rmSync(folder,{recursive:true,force:true});});
 fs.mkdirSync(path.join(folder,'docs/media'),{recursive:true});fs.writeFileSync(path.join(folder,'docs/media/public-addon-preview.webp'),image);
 const receipt=path.join(folder,'docs/media/PREVIEW.json'),record={sha256:createHash('sha256').update(image).digest('hex'),privacyReviewed:true};fs.writeFileSync(receipt,JSON.stringify(record));assert(auditRelease({root:folder}).ok);
 fs.writeFileSync(receipt,JSON.stringify({...record,sha256:'0'.repeat(64)}));assert(auditRelease({root:folder}).failures.some(f=>f.code==='PREVIEW_IMAGE_REVIEW_FAILED'));
 fs.writeFileSync(receipt,JSON.stringify(record));fs.writeFileSync(path.join(folder,'docs/media/another.webp'),image);assert(auditRelease({root:folder}).failures.some(f=>f.file.endsWith('another.webp')&&f.code==='FILE_TYPE_NOT_ALLOWLISTED'));
});
