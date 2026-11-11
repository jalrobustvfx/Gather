const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, '../storage.js'), 'utf8');
function store(extension = false, withAnalysis = false, memory = new Map()) {
  const context = { URL, crypto: require('node:crypto').webcrypto, localStorage: { getItem:k=>memory.get(k), setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k) } };
  if(extension)context.chrome={runtime:{id:'test'},storage:{local:{get:async k=>({[k]:memory.has(k)?structuredClone(memory.get(k)):undefined}),set:async obj=>Object.entries(obj).forEach(([k,v])=>memory.set(k,structuredClone(v)))}}};
  vm.createContext(context);
  if(withAnalysis)vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../page-analysis.js'),'utf8'),context);
  vm.runInContext(code,context);return context.GatherStore;
}
for(const extension of [false,true]) {
  test(`save, edit, and duplicate protection (${extension?'extension':'web'})`,async()=>{
    const s=store(extension); assert.equal((await s.read()).items.length,0);
    const first=await s.save({url:'https://example.com/?utm_source=reddit#intro',title:'Example',note:'Original',favorite:true});
    assert.equal(first.url,'https://example.com');assert.ok(first.id);
    await assert.rejects(()=>s.save({url:'https://example.com',title:'Duplicate'}),/already/);
    const updated=await s.save({id:first.id,url:first.url,title:'Updated'});
    assert.equal(updated.favorite,true);assert.equal(updated.note,'Original');assert.equal(updated.createdAt,first.createdAt);
    assert.equal((await s.read()).items.length,1);assert.equal((await s.read()).items[0].title,'Updated');
  });
  test(`reject dangerous URL protocols (${extension?'extension':'web'})`,async()=>{
    const s=store(extension);for(const url of ['javascript:alert(1)','file:///secret','data:text/html,hello'])await assert.rejects(()=>s.save({url,title:'Unsafe'}),/http/);
    assert.equal((await s.read()).items.length,0);
  });
}
test('tracking removal preserves meaningful URL parameters',()=>{
  assert.equal(store().normalizeUrl('https://example.com/search?q=canvas&utm_medium=post&fbclid=123'),'https://example.com/search?q=canvas');
});
test('website grouping recognizes subdomains and stays independent of topics',async()=>{
  const s=store();assert.equal(s.sourceInfo('https://old.reddit.com/r/ai/comments/abc/model').website,'Reddit');assert.equal(s.sourceInfo('https://new.reddit.com/r/ai/comments/abc/model').pageType,'Post');
  const item=await s.save({url:'https://github.com/team/model',title:'Video model',category:'Research',topic:'Video generation'});assert.equal(item.website,'GitHub');assert.equal(item.topic,'Video generation');assert.equal(item.pageType,'Repository');
});
test('old broad topics become specific without losing captures or arrangements',async()=>{
  const s=store(false,true),saved=await s.save({url:'https://github.com/team/model',title:'Wan 2.2 image-to-video model',category:'Research',topic:'Research',screenshot:'data:image/jpeg;base64,dGVzdA=='});
  const data=await s.read();data.canvas={[saved.id]:{x:123,y:456,w:320}};await s.write(data);
  const restored=await s.read();assert.equal(restored.items[0].topic,'Image-to-video models');assert.ok(restored.items[0].modelNames.includes('Wan 2.2'));assert.equal(restored.items[0].screenshot,saved.screenshot);assert.equal(restored.canvas[saved.id].x,123);
});
test('manually edited topics are preserved during automatic topic upgrades',async()=>{
  const s=store(false,true);await s.save({url:'https://example.com/model',title:'Wan image-to-video model',category:'Research',topic:'Research',topicMethod:'manual'});
  assert.equal((await s.read()).items[0].topic,'Research');
});
test('recreating the extension context preserves imported links and screenshots',async()=>{
  const memory=new Map(),before=store(true,false,memory);
  await before.save({url:'https://example.com/imported',title:'Imported bookmark',screenshot:'data:image/jpeg;base64,dGVzdA=='});
  const after=store(true,false,memory),data=await after.read();
  assert.equal(data.items.length,1);assert.equal(data.items[0].title,'Imported bookmark');assert.ok(data.items[0].screenshot);
});
test('an old tab cannot overwrite newer imports with an empty cached library',async()=>{
  const memory=new Map(),old=store(true,false,memory),importer=store(true,false,memory);
  const stale=await old.read();await importer.save({url:'https://example.com/imported',title:'New import'});
  await assert.rejects(old.write(stale),/changed in another tab/);
  assert.equal((await importer.read()).items.length,1);
});
test('missing primary storage recovers the saved safety copy after reload',async()=>{
  const memory=new Map(),s=store(true,false,memory);
  await s.save({url:'https://example.com',title:'Keep this'});memory.delete('gather-library-v1');
  const reload=store(true,false,memory);assert.equal((await reload.read()).items.length,1);assert.equal(reload.recovered,true);
  const data=await reload.read();data.items[0].note='Recovered';await reload.write(data);
  assert.equal((await store(true,false,memory).read()).items[0].note,'Recovered');
});
test('a corrupt browser library uses recovery rather than presenting an empty collection',async()=>{
  const memory=new Map(),s=store(false,false,memory);await s.save({url:'https://example.com',title:'Keep this'});
  memory.set('gather-library-v1','broken JSON');assert.equal((await store(false,false,memory).read()).items.length,1);
  memory.delete('gather-library-recovery-v1');await assert.rejects(store(false,false,memory).read(),/unreadable/);
});
test('intentional deletions persist without discarding the last populated safety copy',async()=>{
  const memory=new Map(),s=store(true,false,memory);await s.save({url:'https://example.com',title:'Keep recovery'});
  const data=await s.read();data.items=[];await s.write(data);assert.equal((await s.read()).items.length,0);
  assert.equal(memory.get('gather-library-recovery-v1').data.items.length,1);
});
