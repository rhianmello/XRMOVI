'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'xrmovi-local-assistant.css'),'utf8');
const js=fs.readFileSync(path.join(root,'xrmovi-local-assistant.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('compact guide uses a dedicated flexible content region with independent lesson scroll',()=>{
 assert.match(js,/class="xrm-assistant-content"/);
 assert.match(js,/class="xrm-assistant-chat-details"/);
 assert.match(css,/\.xrm-local-assistant \.xrm-assistant-content\s*\{[^}]*flex:1 1 auto;[^}]*min-height:0;/s);
 assert.match(css,/\.xrm-local-assistant \.xrm-assistant-lesson\s*\{[^}]*max-height:none;[^}]*overflow-y:auto;/s);
 assert.match(css,/\.xrm-local-assistant \.xrm-assistant-panel\s*\{[^}]*max-height:calc\(100dvh - 105px\);[^}]*overflow:hidden;/s);
});
test('voice training closes duplicate conversation and retains fixed input',()=>{
 assert.match(js,/chatDetails\.open = false;/);
 assert.match(js,/panel\.classList\.add\('is-teaching'\);/);
 assert.match(js,/let voiceRate = 2;/);
 assert.match(js,/utterance\.rate = voiceRate;/);
 assert.match(css,/\.xrm-local-assistant \.xrm-assistant-form\s*\{[^}]*flex:0 0 auto;/s);
 assert.match(css,/\.xrm-local-assistant \.xrm-assistant-orb\s*\{[^}]*width:48px;/s);
});
test('mobile assistant scales to viewport, and css/js versions avoid stale cache',()=>{
 assert.match(css,/@media \(max-width:420px\)/);
 assert.match(css,/@media \(max-height:520px\)/);
 assert.match(html,/xrmovi-local-assistant\.css\?v=[0-9a-z-]+/);
 assert.match(html,/xrmovi-local-assistant\.js\?v=[0-9a-z-]+/);
});
