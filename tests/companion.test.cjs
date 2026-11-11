const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){
  const memory={},calls=[],events={};
  const context={chrome:{storage:{local:{get:async key=>({[key]:memory[key]}),set:async values=>Object.assign(memory,values)}},
    runtime:{onInstalled:{addListener:fn=>events.install=fn},onStartup:{addListener:fn=>events.start=fn}},
    permissions:{contains:async()=>true,onRemoved:{addListener:fn=>events.removed=fn}},
    tabs:{query:async()=>[{id:7},{id:8}]},scripting:{getRegisteredContentScripts:async()=>[],
      unregisterContentScripts:async arg=>calls.push(['unregister',arg]),registerContentScripts:async arg=>calls.push(['register',arg]),
      executeScript:async arg=>calls.push(['inject',arg])}}};
  vm.createContext(context);
  for(const file of ['companion-model.js','companion-background.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {context,memory,calls,events,model:context.GatherCompanion,configure:context.GatherCompanionBackground.configure};
}
test('companion preferences default to off and validate character and corner',()=>{
  const s=setup();const prefs=s.model.normalize({enabled:'yes',character:'<script>',corner:'top',animations:false});
  assert.equal(prefs.enabled,false);assert.equal(prefs.character,'robot');assert.equal(prefs.corner,'right');assert.equal(prefs.animations,false);
  assert.equal(s.model.normalize(null).enabled,false);
  assert.equal(s.model.characters.length,3);
  for(const pet of s.model.characters){const svg=s.model.svg(pet.id);assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|(?:href|src)=|onload/);}
});
test('enabling registers persistent top-frame scripts and updates already open pages',async()=>{
  const s=setup();s.memory[s.model.key]={enabled:true,character:'dog'};
  assert.equal((await s.configure()).enabled,true);
  const registration=s.calls.find(([type])=>type==='register')[1][0];
  assert.equal(registration.persistAcrossSessions,true);assert.equal(registration.allFrames,false);
  assert.deepEqual([...registration.js],['companion-model.js','companion-content.js']);
  assert.equal(s.calls.filter(([type])=>type==='inject').length,2);
});
test('disabling unregisters the persistent content script',async()=>{
  const s=setup();s.context.chrome.scripting.getRegisteredContentScripts=async()=>[{id:'gather-companion'}];
  await s.configure();
  assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'unregister');
});
test('missing permissions preserve the enabled preference without injecting pages',async()=>{
  const s=setup();s.memory[s.model.key]={enabled:true};s.context.chrome.permissions.contains=async()=>false;
  await assert.rejects(s.configure(),/website access/);
  assert.equal(s.memory[s.model.key].enabled,true);assert.equal(s.calls.length,0);
});
test('a restricted tab does not prevent companions from appearing on other pages',async()=>{
  const s=setup();s.memory[s.model.key]={enabled:true};
  s.context.chrome.scripting.executeScript=async config=>{if(config.target.tabId===7)throw new Error('Restricted');s.calls.push(['inject',config]);};
  assert.equal((await s.configure()).enabled,true);
  assert.equal(s.calls.filter(([type])=>type==='inject').length,1);
});
