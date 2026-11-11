const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const tree=[{id:'0',title:'',children:[{id:'1',title:'Bookmarks bar',children:[
  {id:'2',title:'Video models',children:[{id:'3',title:'Video model',url:'https://github.com/team/video?utm_source=chrome'},
    {id:'4',title:'Duplicate',url:'https://github.com/team/video'}, {id:'5',title:'Bad link',url:'javascript:alert(1)'}]},
  {id:'6',title:'Image models',children:[{id:'7',title:'Image model',url:'https://example.com/image'}]}]}]}];
function setup(initial={}) {
  const memory=structuredClone(initial),tabs=new Map(),operations=[],permissions={allowed:true};let nextTab=20,nextWindow=100,closed=false,mode='ok';
  let blocker=null,readbacks=0;
  const context={URL,Date,crypto:require('node:crypto').webcrypto,structuredClone,
    setTimeout:fn=>{setImmediate(fn);return 1;},clearTimeout(){},
    resizeGatherSnapshot:async value=>value,
    chrome:{runtime:{id:'test',onStartup:{addListener(){}}},permissions:{contains:async()=>permissions.allowed},
      debugger:{attach:async target=>operations.push('attach:'+target.tabId),detach:async target=>operations.push('detach:'+target.tabId),sendCommand:async(target,command)=>{
        operations.push(command);
        if(command==='Page.captureScreenshot'){
          operations.push('snapshot');if(mode==='readback'&&readbacks++<2)throw new Error('image readback failed');
          if(mode==='cancel')throw new Error('Debugger is not attached to the tab');
          if(mode==='screenshot-error')throw new Error('Capture denied');
          return {data:'dGVzdA=='};
        }
        return {};
      }},
      storage:{local:{get:async key=>({[key]:structuredClone(memory[key])}),set:async value=>Object.assign(memory,structuredClone(value))}},
      bookmarks:{getTree:async()=>structuredClone(tree)},alarms:{create(){},clear(){},onAlarm:{addListener(){}}},
      windows:{update:async()=>operations.push('focus'),create:async()=>{operations.push('window');const tab={id:++nextTab,windowId:++nextWindow,url:'about:blank',status:'complete'};tabs.set(tab.id,tab);return {id:tab.windowId,tabs:[tab]};}},
      tabs:{create:async options=>{assert.equal(options.active,false);operations.push('background-tab');const tab={id:++nextTab,windowId:1,url:'about:blank',status:'complete'};tabs.set(tab.id,tab);return {...tab};},get:async id=>{if(!tabs.has(id)||closed)throw new Error('No tab');return {...tabs.get(id)};},
        update:async(id,value)=>{if(blocker)await blocker;if(value.active===true)operations.push('activate');Object.assign(tabs.get(id),value);if(mode==='redirect')tabs.get(id).url='https://example.com/login';if(mode==='timeout')tabs.get(id).status='loading';operations.push('navigate');return {...tabs.get(id)};},
        query:async({windowId})=>[...tabs.values()].filter(tab=>tab.windowId===windowId).map(tab=>({...tab,id:mode==='switch'?999:tab.id})),
        remove:async id=>{operations.push('remove');tabs.delete(id);},
        captureVisibleTab:async()=>{operations.push('snapshot');if(mode==='readback'&&readbacks++<2)throw new Error('Failed to capture tab: image readback failed');if(mode==='screenshot-error')throw new Error('Capture denied');return 'data:image/jpeg;base64,dGVzdA==';}},
      scripting:{executeScript:async config=>{
        if(config.args)return [];
        if(mode==='blocked')return [{result:{title:'Sign in to continue',text:'Please log in to this website.'}}];
        return [{result:{title:'A video model',description:'Text-to-video generation model with open weights.',text:'A video model that generates detailed clips from text prompts. Run the model locally with open weights.'}}];
      }}}};
  vm.createContext(context);
  for(const file of ['storage.js','page-analysis.js','bookmark-model.js','bookmark-background.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {context,memory,operations,permissions,tabs,model:context.GatherBookmarks,queue:context.GatherBookmarkImport,
    mode:value=>mode=value,close:()=>closed=true,block:promise=>blocker=promise};
}
async function finish(s) {
  for(let n=0;n<150;n++){await new Promise(resolve=>setImmediate(resolve));const state=await s.queue.state();if(state?.status==='complete'||state?.status==='paused'||state?.status==='stopped')return state;}
  throw new Error('Queue did not settle');
}
test('folder selection includes descendants, merges duplicates, and rejects unsafe URLs',()=>{
  const s=setup(),scan=s.model.scan(tree,['2']);
  assert.equal(scan.links.length,1);assert.equal(scan.duplicates,1);assert.equal(scan.unsupported,1);
  assert.equal(scan.links[0].url,'https://github.com/team/video');assert.deepEqual([...scan.links[0].folders],['Bookmarks bar / Video models']);
  assert.deepEqual([...scan.links[0].titles],['Video model','Duplicate']);
  assert.equal(s.model.scan(tree,[]).links.length,0);assert.equal(s.model.scan(tree,null).links.length,2);
  assert.deepEqual([...s.model.folders(tree).find(folder=>folder.id==='2').parents],['1']);
});
test('plans count new links, preserve existing screenshots, and require no network for links-only import',async()=>{
  const s=setup({'gather-library-v1':{version:1,items:[{id:'existing',title:'Keep my title',url:'https://github.com/team/video',screenshot:'existing',note:'Keep note',topic:'My topic',topicMethod:'manual'}],boards:[]}});
  const preview=await s.queue.preview({folders:null,capture:true});
  assert.equal(preview.summary.newCount,1);assert.equal(preview.summary.existingCount,1);assert.equal(preview.summary.captureCount,1);
  const job=await s.queue.start({folders:null,capture:false});assert.equal(job.status,'complete');assert.equal(s.operations.length,0);
  const data=await s.context.GatherStore.read();assert.equal(data.items.length,2);
  const existing=data.items.find(item=>item.id==='existing');assert.equal(existing.title,'Keep my title');assert.equal(existing.note,'Keep note');assert.equal(existing.screenshot,'existing');
  assert.ok(existing.bookmarkFolders.includes('Bookmarks bar / Video models'));assert.ok(existing.tags.includes('Video models'));
});
test('queue imports links first, then captures snapshots and recognizes topics',async()=>{
  const s=setup();await s.queue.start({folders:['2'],capture:true});
  assert.equal((await s.context.GatherStore.read()).items.length,1);
  const job=await finish(s);assert.equal(job.entries[0].status,'done');assert.equal(job.status,'complete');
  const [item]=(await s.context.GatherStore.read()).items;
  assert.match(item.screenshot,/^data:image\/jpeg/);assert.equal(item.topic,'Text-to-video models');
  assert.ok(item.tags.includes('Video models'));assert.ok(s.operations.includes('remove'));
});
test('blocked and failed snapshot pages stay in the library without a misleading preview',async()=>{
  for(const mode of ['blocked','screenshot-error']){
    const s=setup();s.mode(mode);await s.queue.start({folders:['2'],capture:true});const job=await finish(s);
    assert.equal(job.entries[0].status,'failed');assert.ok(job.entries[0].error);
    assert.equal((await s.context.GatherStore.read()).items[0].screenshot,undefined);
  }
});
test('failed pages can be retried without duplicate library entries',async()=>{
  const s=setup();s.mode('blocked');await s.queue.start({folders:['2'],capture:true});await finish(s);
  s.mode('ok');await s.queue.action({action:'retry'});const job=await finish(s);
  assert.equal(job.entries[0].status,'done');assert.equal((await s.context.GatherStore.read()).items.length,1);
});
test('pause and resume preserve pending captures, stop never removes imported links',async()=>{
  const s=setup();let release;const hold=new Promise(resolve=>release=resolve);s.block(hold);
  await s.queue.start({folders:null,capture:true});
  await s.queue.action({action:'pause'});release();await finish(s);await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await s.queue.state()).status,'paused');assert.equal((await s.context.GatherStore.read()).items.length,2);
  s.block(null);await s.queue.action({action:'resume'});const job=await finish(s);
  assert.equal(job.entries.filter(e=>e.status==='done').length,2);
});
test('stopping while a page loads leaves a reusable stopped queue and keeps the library',async()=>{
  const s=setup();let release;s.block(new Promise(resolve=>release=resolve));
  await s.queue.start({folders:null,capture:true});await s.queue.action({action:'stop'});release();await finish(s);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await s.queue.state()).entries.some(e=>e.status==='pending'),false);
  assert.equal((await s.context.GatherStore.read()).items.length,2);
  await s.queue.start({folders:['2'],capture:false});assert.equal((await s.queue.state()).status,'complete');
});
test('interrupted imports restart paused and reset an in-flight entry for explicit resume',async()=>{
  const s=setup({'gather-bookmark-import-v1':{id:'job',status:'running',entries:[{id:'a',status:'capturing'}],tabId:null,windowId:null}});
  const job=await s.queue.state();assert.equal(job.status,'paused');assert.equal(job.entries[0].status,'pending');
});
test('permissions, empty selection, and a conflicting queue are rejected before navigation',async()=>{
  const s=setup();s.permissions.allowed=false;
  await assert.rejects(s.queue.start({folders:null,capture:true}),/website access/);assert.equal(s.operations.length,0);
  s.permissions.allowed=true;await assert.rejects(s.queue.start({folders:[],capture:false}),/No supported links/);
  assert.equal(s.operations.length,0);
});
test('folder names are searchable without changing website categories',async()=>{
  const s=setup();await s.queue.start({folders:['2'],capture:false});
  vm.runInContext(fs.readFileSync('library-search.js','utf8'),s.context);
  const item=(await s.context.GatherStore.read()).items[0];
  assert.equal(item.website,'GitHub');assert.equal(s.context.GatherSearch.matches(item,'Bookmarks bar'),true);
});
test('redirects and timeouts are review states and never get the destination screenshot',async()=>{
  for(const mode of ['redirect','timeout']){
    const s=setup();s.mode(mode);
    if(mode==='timeout'){let now=0;s.context.Date=class extends Date{static now(){return now+=2000;}};}
    await s.queue.start({folders:['2'],capture:true});const job=await finish(s);
    assert.equal(job.entries[0].status,'failed');assert.match(job.entries[0].error,mode==='redirect'?/redirected/:/too long/);
    assert.equal(s.operations.includes('snapshot'),false);
  }
});
test('closing the background capture tab pauses work without opening replacement windows',async()=>{
  const s=setup();let release;s.block(new Promise(resolve=>release=resolve));
  await s.queue.start({folders:null,capture:true});
  for(let n=0;n<10&&!s.operations.includes('background-tab');n++)await new Promise(resolve=>setImmediate(resolve));
  s.close();release();const job=await finish(s);
  assert.equal(job.status,'paused');assert.equal(s.operations.filter(op=>op==='background-tab').length,1);assert.equal(s.operations.includes('window'),false);
  assert.equal(job.entries.filter(entry=>entry.status==='pending').length,1);
  assert.equal((await s.context.GatherStore.read()).items.length,2);
});
test('capture enrichment keeps manual topics, notes, and bookmark folder tags',async()=>{
  const s=setup({'gather-library-v1':{version:1,items:[{id:'existing',title:'My video tool',url:'https://github.com/team/video',note:'For my project',topic:'My custom topic',topicMethod:'manual',tags:['favorite tool']}],boards:[]}});
  await s.queue.start({folders:['2'],capture:true});await finish(s);
  const [item]=(await s.context.GatherStore.read()).items;
  assert.equal(item.topic,'My custom topic');assert.equal(item.topicMethod,'manual');assert.equal(item.note,'For my project');
  assert.ok(item.tags.includes('Video models'));assert.ok(item.tags.includes('favorite tool'));assert.ok(item.screenshot);
});
test('website groups count unique links and combine known website subdomains',()=>{
  const s=setup();
  const nodes=[{id:'root',children:[{id:'1',url:'https://reddit.com/r/ai/comments/a',title:'Post'},
    {id:'2',url:'https://old.reddit.com/r/ai/comments/b',title:'Other post'},
    {id:'3',url:'https://github.com/team/model',title:'Model'},
    {id:'4',url:'https://github.com/team/model?utm_source=bookmark',title:'Duplicate'}]}];
  const all=s.model.scan(nodes,null);
  assert.equal(all.websites.find(site=>site.name==='Reddit').count,2);
  assert.equal(all.websites.find(site=>site.name==='GitHub').count,1);
  const reddit=s.model.scan(nodes,null,['Reddit']);assert.equal(reddit.links.length,2);assert.equal(reddit.duplicates,0);
  assert.equal(s.model.scan(nodes,null,[]).links.length,0);
});
test('website and folder selections intersect in previews and the actual import',async()=>{
  const s=setup();
  let result=await s.queue.preview({folders:null,websites:['GitHub'],capture:true});
  assert.equal(result.summary.newCount,1);assert.equal(result.summary.captureCount,1);
  assert.equal(result.websites.length,2);
  result=await s.queue.preview({folders:['6'],websites:['GitHub'],capture:false});assert.equal(result.summary.total,0);
  await s.queue.start({folders:null,websites:['GitHub'],capture:false});
  const data=await s.context.GatherStore.read();assert.equal(data.items.length,1);assert.equal(data.items[0].website,'GitHub');
});
test('empty and invalid website selections cannot import links accidentally',async()=>{
  const s=setup();
  await assert.rejects(s.queue.start({folders:null,websites:[],capture:false}),/No supported links/);
  await assert.rejects(s.queue.preview({folders:null,websites:'GitHub',capture:false}),/valid websites/);
  assert.equal((await s.context.GatherStore.read()).items.length,0);
});
test('background capture retries readback without focusing any window and always detaches',async()=>{
  const s=setup();s.mode('readback');await s.queue.start({folders:['2'],capture:true});const job=await finish(s);
  assert.equal(job.entries[0].status,'done');assert.equal(s.operations.filter(op=>op==='snapshot').length,3);
  assert.equal(s.operations.includes('focus'),false);assert.equal(s.operations.filter(op=>op.startsWith('detach:')).length,1);
  assert.equal(s.operations.includes('activate'),false);assert.equal(s.operations.includes('window'),false);
  assert.equal((await s.context.GatherStore.read()).items[0].previewStatus,'ready');
});
test('another active tab does not affect a screenshot addressed to the owned capture tab',async()=>{
  const s=setup();s.mode('switch');await s.queue.start({folders:['2'],capture:true});const job=await finish(s);
  assert.equal(job.entries[0].status,'done');assert.equal(s.operations.includes('focus'),false);
  assert.ok(s.operations.includes('Page.captureScreenshot'));
});
test('background screenshot errors detach the debugger and keep the original link',async()=>{
  const s=setup();s.mode('screenshot-error');await s.queue.start({folders:['2'],capture:true});await finish(s);
  assert.equal(s.operations.filter(op=>op.startsWith('detach:')).length,1);
  assert.equal((await s.context.GatherStore.read()).items.length,1);
});
test('cancelling the debugging session pauses rather than repeatedly attaching',async()=>{
  const s=setup();s.mode('cancel');await s.queue.start({folders:null,capture:true});const job=await finish(s);
  assert.equal(job.status,'paused');assert.equal(job.entries.filter(entry=>entry.status==='pending').length,2);
  assert.equal(s.operations.filter(op=>op.startsWith('attach:')).length,1);
});
test('a failed capture records its reason on the library entry for Cover Flow',async()=>{
  const s=setup();s.mode('screenshot-error');await s.queue.start({folders:['2'],capture:true});await finish(s);
  const [item]=(await s.context.GatherStore.read()).items;
  assert.equal(item.previewStatus,'failed');assert.match(item.previewError,/Capture denied/);assert.equal(item.screenshot,undefined);
});
test('missing previews can be captured from the library without reimporting bookmarks',async()=>{
  const s=setup();await s.queue.start({folders:null,capture:false});
  const before=await s.context.GatherStore.read(),id=before.items[0].id;
  await s.queue.missing({ids:[id]});const job=await finish(s);
  assert.equal(job.entries.length,1);assert.equal(job.entries[0].status,'done');
  const after=await s.context.GatherStore.read();assert.equal(after.items.length,before.items.length);
  assert.ok(after.items.find(item=>item.id===id).screenshot);assert.equal(after.items.find(item=>item.id!==id).screenshot,undefined);
});
