const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function client(extension=false,allowed=true){
  const memory={},requests=[],alarms={};
  const data={version:1,items:[{url:'https://example.com',screenshot:'snapshot'}],boards:[],workflows:[{id:'flow'}]};
  const context={URL,JSON,crypto:require('node:crypto').webcrypto,AbortSignal,setTimeout,clearTimeout,
    GatherStore:{read:async()=>data,write:async value=>{for(const key of Object.keys(data))delete data[key];Object.assign(data,value);}},localStorage:{getItem:key=>memory[key]||null,setItem:(key,value)=>memory[key]=value},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({running:true})};}};
  if(extension)context.chrome={runtime:{id:'extension',onInstalled:{addListener(){}},onStartup:{addListener(){}}},
    alarms:{onAlarm:{addListener:fn=>alarms.handler=fn},create(){}},permissions:{request:async()=>allowed},
    storage:{local:{get:async key=>({[key]:memory[key]}),set:async values=>Object.assign(memory,values)}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('backup-client.js','utf8'),context);
  return {context,requests,memory,alarms,data,backup:context.GatherBackup};
}
test('backup sync is opt-in until the collection is connected',async()=>{
  const c=client();await c.backup.sync();assert.equal(c.requests.length,0);
  await c.backup.connect();assert.equal(c.requests.length,1);
  assert.deepEqual(c.requests[0].body.data.items,[{url:'https://example.com',screenshot:'snapshot'}]);
  assert.deepEqual(c.requests[0].body.data.workflows,[{id:'flow'}]);
});
test('connection reuses the collection identity instead of multiplying backups',async()=>{
  const c=client();await c.backup.connect();await c.backup.connect();
  assert.equal(c.requests[0].body.id,c.requests[1].body.id);
});
test('extension needs localhost permission and labels its own collection',async()=>{
  const denied=client(true,false);await assert.rejects(denied.backup.connect(),/Allow/);assert.equal(denied.requests.length,0);
  const c=client(true);await c.backup.connect();
  const stage=c.requests.find(request=>request.url.endsWith('/stage'));assert.equal(stage.body.extension,true);assert.match(stage.url,/127.0.0.1/);
  assert.equal(typeof c.alarms.handler,'function');
});
test('a fresh extension restores an external copy including text and screenshots before staging',async()=>{
  const c=client(true);Object.assign(c.data,{items:[],workflows:[],boards:[],_revision:0});
  const saved={version:1,items:[{url:'https://example.com',title:'Recovered',screenshot:'data:image/jpeg;base64,dGVzdA==',pageSignals:{text:'remembered keyword'}}],boards:[],workflows:[],_revision:20};
  const requests=[];
  c.context.fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});return {ok:true,json:async()=>url.endsWith('/recovery')?{libraries:[{id:'original',items:1}]}:url.endsWith('/restore')?{id:'original',data:saved}:{running:true}};};
  await c.backup.sync();assert.equal(c.data.items.length,1);assert.equal(c.data.items[0].screenshot,saved.items[0].screenshot);
  assert.equal(c.data.items[0].pageSignals.text,'remembered keyword');
  assert.equal(requests.find(request=>request.url.endsWith('/stage')).body.id,'original');
  assert.equal(c.memory['gather-backup-connection'].id,'original');
});
test('multiple recovery copies require a choice and an empty install never stages over them',async()=>{
  const c=client(true);Object.assign(c.data,{items:[],workflows:[],boards:[],_revision:0});
  const urls=[];c.context.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>({libraries:[{id:'one'},{id:'two'}]})};};
  await assert.rejects(c.backup.sync(),/Several saved libraries/);assert.equal(urls.some(url=>url.endsWith('/stage')),false);
});
test('recovery never overwrites a populated library',async()=>{
  const c=client(true);await assert.rejects(c.backup.restore('one'),/already has data/);assert.equal(c.requests.length,0);
});
test('static preview falls back to the local Gather service',async()=>{
  const c=client();let attempts=0;
  c.context.fetch=async url=>{attempts++;return url.startsWith('/')?{status:501}:{ok:true,json:async()=>({running:true})};};
  assert.equal((await c.backup.api('state')).running,true);assert.equal(attempts,2);
});
test('server failures remain visible and do not report backup success',async()=>{
  const c=client();c.context.fetch=async()=>({ok:false,status:422,json:async()=>({error:'Drive is full'})});
  await assert.rejects(c.backup.api('run'),/Drive is full/);
});
