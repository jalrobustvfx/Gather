// Browser-only UI fixture. All bookmarks, tabs, storage and capture results are test data.
(() => {
  const memory={'gather-backup-connection':{enabled:false,id:'fixture'}},listeners=[],tabs=new Map();let tabId=100;
  if(new URLSearchParams(location.search).has('search-demo'))memory['gather-library-v1']={version:1,boards:[],workflows:[],items:[{
    id:'search-demo',url:'https://example.com/video-toolkit',title:'Open video toolkit',description:'A toolkit for video experiments.',
    category:'Video & Audio',topic:'Text-to-video models',status:'inbox',createdAt:'2026-11-08T00:00:00Z',
    pageSignals:{headings:['Usage guide'],text:'Use the model for short video clips. Supports temporal consistency across frames, optical flow guidance, and local inference. These details are stored from the captured page.'}
  }]};
  const nodes=[{id:'0',title:'',children:[{id:'bar',title:'Bookmarks bar',children:[
    {id:'video',title:'Video models',children:[{id:'a',title:'Open video model',url:'https://github.com/demo/video'},{id:'b',title:'Blocked page example',url:'https://example.com/blocked'}]},
    {id:'image',title:'Image models',children:[{id:'c',title:'Image editor',url:'https://example.com/editor'},
      {id:'d',title:'AI discussion',url:'https://reddit.com/r/ai/comments/demo'},
      {id:'e',title:'Model tutorial',url:'https://youtube.com/watch?v=demo'}]}]}]}];
  const event={addListener(){}};
  globalThis.resizeGatherSnapshot=async value=>value;
  globalThis.chrome={runtime:{id:'gather-ui-test',getManifest:()=>({version:'0.8.0',permissions:['storage','unlimitedStorage','debugger'],optional_permissions:['bookmarks'],optional_host_permissions:['<all_urls>']}),onStartup:event,onInstalled:event,sendMessage:async message=>{
    try {
      const action=message.type.replace('gather-bookmarks-',''), service=GatherBookmarkImport;
      return {ok:true,result:await(action==='tree'?service.tree():action==='preview'?service.preview(message):action==='import'?service.start(message):action==='action'?service.action(message):action==='missing'?service.missing(message):service.state())};
    }catch(error){return {ok:false,error:error.message};}
  }},permissions:{request:async()=>true,contains:async()=>true},
  storage:{local:{get:async key=>({[key]:structuredClone(memory[key])}),set:async values=>{
    const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:memory[key],newValue:structuredClone(value)};memory[key]=structuredClone(value);}
    listeners.forEach(fn=>fn(changes,'local'));
  }},onChanged:{addListener:fn=>listeners.push(fn)}},
  debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(target,command)=>command==='Page.captureScreenshot'?{data:'dGVzdA=='}:{}},
  alarms:{onAlarm:event,create(){},clear(){}},bookmarks:{getTree:async()=>structuredClone(nodes)},
  windows:{create:async()=>{const tab={id:++tabId,windowId:200,url:'about:blank',status:'complete'};tabs.set(tab.id,tab);return {id:200,tabs:[tab]};}},
  tabs:{create:async()=>{const tab={id:++tabId,windowId:200,url:'about:blank',status:'complete'};tabs.set(tab.id,tab);return {...tab};},get:async id=>{if(!tabs.has(id))throw new Error('No tab');return {...tabs.get(id)};},
    update:async(id,value)=>Object.assign(tabs.get(id),value),query:async({windowId})=>[...tabs.values()].filter(tab=>tab.windowId===windowId),remove:async id=>tabs.delete(id),
    captureVisibleTab:async()=> 'data:image/jpeg;base64,dGVzdA=='},
  scripting:{executeScript:async config=>config.args?[]:[{result:tabs.get(config.target.tabId)?.url.includes('blocked')?
    {title:'Sign in to continue',text:'Sign in required.'}:{title:'Open video model',description:'A text-to-video generation model.',text:'Generate video clips from text prompts using this open video model with downloadable weights.'}}]}};
})();
