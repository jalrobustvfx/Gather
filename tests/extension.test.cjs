const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function extension(){
  const memory={};let listener;
  const chrome={runtime:{id:'gather-test',onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener(){}}},permissions:{contains:async()=>true},storage:{local:{get:async key=>({[key]:structuredClone(memory[key])}),set:async values=>Object.assign(memory,structuredClone(values))}},contextMenus:{onClicked:{addListener(){}},create(){}},action:{}};
  const context={chrome,URL,Date,AbortSignal,TextDecoder,Uint8Array,crypto:require('node:crypto').webcrypto,setTimeout,fetch:async()=>{throw new Error('offline');}};
  vm.createContext(context);context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  return {context,memory,send:(message,extra={})=>new Promise(resolve=>listener(message,{id:chrome.runtime.id,...extra},resolve)),listener:()=>listener};
}
test('extension saves recognized content from an active page with no other fields',async()=>{
  const e=extension();const response=await e.send({type:'gather-save',url:'https://fresh.example',snapshot:{title:'Sound Studio',description:'An audio and video editing workspace.'}});
  assert.equal(response.ok,true);assert.equal(response.item.category,'Video & Audio');assert.ok(response.item.tags.includes('audio'));assert.equal((await e.context.GatherStore.read()).items.length,1);
});
test('extension retains the link with a review state when reading fails',async()=>{
  const e=extension();const response=await e.send({type:'gather-save',url:'https://fresh.example'});
  assert.equal(response.ok,true);assert.equal(response.item.title,'fresh.example');assert.equal(response.item.analysisStatus,'unavailable');
});
test('extension refuses duplicates and invalid protocols',async()=>{
  const e=extension();await e.send({type:'gather-save',url:'https://fresh.example'});
  assert.match((await e.send({type:'gather-save',url:'https://fresh.example/?utm_source=test'})).error,/already/);
  assert.equal((await e.send({type:'gather-save',url:'javascript:alert(1)'})).ok,false);
});
test('extension ignores messages from another sender',()=>{
  const e=extension();let called=false;assert.equal(e.listener()({type:'gather-save',url:'https://example.com'},{id:'untrusted'},()=>called=true),undefined);assert.equal(called,false);
});
test('shortcut capture stores a screenshot, source website, specific topic, and selected context',async()=>{
  const e=extension();const tab={id:7,windowId:1,url:'https://github.com/team/video-model',title:'Open video model'};
  e.context.chrome.tabs={query:async()=>[tab],get:async()=>tab,captureVisibleTab:async()=> 'data:image/jpeg;base64,dGVzdA=='};
  e.context.chrome.scripting={executeScript:async config=>config.args?[]:[{result:{title:'Open video model',description:'Text-to-video generation with open weights.',text:'Run a video model locally.',selection:'Use this for product shots.'}}]};
  const response=await e.send({type:'gather-capture'});
  assert.equal(response.ok,true);assert.equal(response.item.website,'GitHub');assert.equal(response.item.pageType,'Repository');assert.equal(response.item.topic,'Text-to-video models');assert.match(response.item.screenshot,/^data:image\/jpeg/);assert.equal(response.item.note,'Use this for product shots.');
  await e.send({type:'gather-capture'});assert.equal((await e.context.GatherStore.read()).items.length,1);
});
test('capture refuses to attach an image to a page that navigated mid-capture',async()=>{
  const e=extension();e.context.chrome.tabs={query:async()=>[{id:7,windowId:1,url:'https://example.com/first'}],get:async()=>({url:'https://example.com/second'}),captureVisibleTab:async()=> 'data:image/jpeg;base64,dGVzdA=='};
  e.context.chrome.scripting={executeScript:async config=>config.args?[]:[{result:{title:'First'}}]};
  assert.equal((await e.send({type:'gather-capture'})).ok,false);assert.equal((await e.context.GatherStore.read()).items.length,0);
});

function capturedPage(e){
  const tab={id:7,windowId:1,url:'https://github.com/team/video-model',title:'Video model'};
  const executions=[];
  e.context.chrome.tabs={query:async()=>[tab],get:async()=>tab,captureVisibleTab:async()=> 'data:image/jpeg;base64,dGVzdA=='};
  e.context.chrome.scripting={executeScript:async config=>{executions.push(config);return config.args?[]:[{result:{title:'Open video model',description:'Text-to-video generation.'}}];}};
  return {tab,executions};
}
test('companion capture saves the sender page and hides itself from the snapshot',async()=>{
  const e=extension();const {tab,executions}=capturedPage(e);
  e.memory['gather-companion-v1']={enabled:true,character:'cat'};
  const response=await e.send({type:'gather-companion-capture'},{tab,frameId:0});
  assert.equal(response.ok,true);assert.equal(response.item.website,'GitHub');
  assert.match(response.item.screenshot,/^data:image\/jpeg/);
  assert.equal(executions[0].args[0],true);assert.equal(executions[1].args[0],false);
});
test('disabled companions and requests from a different active tab cannot capture',async()=>{
  const e=extension();const {tab}=capturedPage(e);
  let response=await e.send({type:'gather-companion-capture'},{tab,frameId:0});
  assert.equal(response.ok,false);assert.match(response.error,/turned off/);
  e.memory['gather-companion-v1']={enabled:true};
  response=await e.send({type:'gather-companion-capture'},{tab:{...tab,id:9},frameId:0});
  assert.equal(response.ok,false);assert.match(response.error,/active tab changed/);
  assert.equal((await e.context.GatherStore.read()).items.length,0);
});
test('content scripts cannot configure companions or use the privileged save path',()=>{
  const e=extension();
  for(const type of ['gather-companion-configure','gather-capture','gather-save','gather-bookmarks-tree','gather-bookmarks-import','gather-bookmarks-action']){
    let called=false;
    assert.equal(e.listener()({type},{id:e.context.chrome.runtime.id,tab:{id:7},frameId:0},()=>called=true),undefined);
    assert.equal(called,false);
  }
  assert.equal(e.listener()({type:'gather-companion-capture'},{id:e.context.chrome.runtime.id,tab:{id:7},frameId:3},()=>{}),undefined);
});
test('capture rejects switching tabs during the screenshot instead of saving the wrong preview',async()=>{
  const e=extension();capturedPage(e);
  e.context.chrome.tabs.query=async options=>[{id:options.windowId?8:7,windowId:1,url:'https://github.com/team/video-model'}];
  const response=await e.send({type:'gather-capture'});
  assert.equal(response.ok,false);assert.match(response.error,/active tab changed during/);
  assert.equal((await e.context.GatherStore.read()).items.length,0);
});
test('bookmark controls accept trusted extension pages even when Chrome supplies a sender tab',async()=>{
  const e=extension();
  const response=await e.send({type:'gather-bookmarks-state'},{url:'chrome-extension://gather-test/index.html',tab:{id:7},frameId:0});
  assert.equal(response.ok,true);assert.equal(response.result,null);
});


test('capture visibility recovers in the page even if the worker never restores it',async()=>{
  const e=extension();const {executions}=capturedPage(e);await e.send({type:'gather-capture'});
  const timers=[],host={style:{setProperty(key,value){this[key]=value;}}};
  const page={document:{getElementById:id=>id==='gather-companion'?host:null},
    setTimeout:(fn,delay)=>timers.push({fn,delay}),requestAnimationFrame:fn=>fn()};
  vm.createContext(page);
  await vm.runInContext(`(${executions[0].func.toString()})(true)`,page);
  assert.equal(host.style.visibility,'hidden');assert.equal(timers[0].delay,8000);
  timers[0].fn();assert.equal(host.style.visibility,'visible');
});
