import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file,root));
const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));

function assertPng(path, dimension) {
  const bytes=read('pwa/'+path);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature: '+path);
  assert.equal(bytes.readUInt32BE(16),dimension,'PNG width: '+path);
  assert.equal(bytes.readUInt32BE(20),dimension,'PNG height: '+path);
  assert.ok(bytes.length>1000,'Brand icon must be real artwork, not tiny placeholder: '+path);
}
test('raster icon files are valid, square and sized for Chromium and Apple',()=>{
  assertPng('icon-192.png',192);
  assertPng('icon-512.png',512);
  assertPng('icon-maskable-512.png',512);
  assertPng('apple-touch-icon.png',180);
});
test('web manifest advertises PNG fallbacks and keeps original SVG icons',()=>{
  for(const [filename,size,purpose] of [
   ['icon-192.png','192x192','any'],
   ['icon-512.png','512x512','any'],
   ['icon-maskable-512.png','512x512','maskable']
  ]){
    assert.ok(manifest.icons.some(x=>x.src.startsWith('/pwa/'+filename)&&x.sizes===size&&x.type==='image/png'&&x.purpose===purpose),filename);
  }
  assert.ok(manifest.icons.some(x=>x.type==='image/svg+xml'&&x.purpose==='any'));
  assert.ok(manifest.icons.some(x=>x.type==='image/svg+xml'&&x.purpose==='maskable'));
  assert.equal(manifest.start_url,'/v3/');
  assert.equal(manifest.id,'/v3/');
  assert.equal(manifest.display,'standalone');
});
test('landing and fleet dashboard both have iOS touch icon and manifest',()=>{
  for(const path of ['index.html','v3/index.html']){
    const html=read(path).toString('utf8');
    assert.match(html,/<link rel="manifest" href="\/manifest\.webmanifest">/);
    assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="\/pwa\/apple-touch-icon\.png\?v=20261115">/);
  }
});
test('PWA keeps first-party route and online-first behavior for financial content',()=>{
  const sw=read('sw.js').toString('utf8');
  assert.match(sw,/event\.request\.mode!=='navigate'/);
  assert.match(sw,/fetch\(event\.request\)\.catch/);
  assert.doesNotMatch(sw,/caches\.open|cache\.put\(/);
});
