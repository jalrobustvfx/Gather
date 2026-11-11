importScripts('storage.js','page-analysis.js','backup-client.js','companion-model.js','companion-background.js','bookmark-model.js','bookmark-background.js');
async function readPage(url){
  const normalized=GatherStore.normalizeUrl(url),origin=new URL(normalized).origin+'/*';
  if(!await chrome.permissions.contains({origins:[origin]}))throw new Error('Website access was not granted.');
  const response=await fetch(normalized,{credentials:'omit',signal:AbortSignal.timeout(10000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('html'))throw new Error('This page could not be read.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(size<1500000){const {done,value}=await reader.read();if(done)break;chunks.push(value);size+=value.length;}}finally{await reader.cancel();}
  const all=new Uint8Array(Math.min(size,1500000));let offset=0;for(const chunk of chunks){const part=chunk.slice(0,all.length-offset);all.set(part,offset);offset+=part.length;if(offset>=all.length)break;}
  return GatherAnalysis.extractHtml(new TextDecoder().decode(all));
}
async function saveLink(message){
  const url=GatherStore.normalizeUrl(message.url);
  if((await GatherStore.read()).items.some(i=>GatherStore.normalizeUrl(i.url)===url))throw new Error('This link is already in your collection.');
  let page=message.snapshot;
  if(!page)try{page=await readPage(url);}catch{page={unavailable:true};}
  return GatherStore.save({...GatherAnalysis.analyze(page,url),source:message.source||'',note:message.note||'',screenshot:message.screenshot||undefined,capturedAt:message.screenshot?new Date().toISOString():undefined,status:'inbox',favorite:false});
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!['gather-preview','gather-save','gather-capture','gather-companion-capture','gather-companion-configure','gather-bookmarks-tree','gather-bookmarks-preview','gather-bookmarks-import','gather-bookmarks-state','gather-bookmarks-action','gather-bookmarks-missing'].includes(message?.type))return;
  const extensionPage=typeof sender.url==='string'&&sender.url.startsWith('chrome-extension://'+chrome.runtime.id+'/');
  if(sender.tab && !extensionPage && (message.type!=='gather-companion-capture'||sender.frameId && sender.frameId!==0))return;
  (async()=>{try{
    if(message.type.startsWith('gather-bookmarks-')) {
      const action=message.type.slice('gather-bookmarks-'.length);
      const result=action==='tree'?await GatherBookmarkImport.tree():action==='preview'?await GatherBookmarkImport.preview(message):action==='import'?await GatherBookmarkImport.start(message):action==='action'?await GatherBookmarkImport.action(message):action==='missing'?await GatherBookmarkImport.missing(message):await GatherBookmarkImport.state();
      respond({ok:true,result});
    }else if(message.type==='gather-companion-configure')respond({ok:true,...await GatherCompanionBackground.configure()});
    else if(message.type==='gather-companion-capture'){
      if(!sender.tab?.id)throw new Error('Open a website and click your companion there.');
      const prefs=GatherCompanion.normalize((await chrome.storage.local.get(GatherCompanion.key))[GatherCompanion.key]);
      if(!prefs.enabled)throw new Error('Your companion is turned off.');
      respond({ok:true,item:await capturePage(sender.tab.id)});
    }else if(message.type==='gather-preview')respond({ok:true,page:await readPage(message.url)});
    else if(message.type==='gather-capture')respond({ok:true,item:await capturePage()});
    else respond({ok:true,item:await saveLink(message)});
  }catch(error){respond({ok:false,error:error.message});}})();
  return true;
});

async function captureEffect(tabId,text,done=false){
  try{await chrome.scripting.executeScript({target:{tabId},args:[text,done],func:(message,finished)=>{
    document.getElementById('gather-capture-feedback')?.remove();
    const host=document.createElement('div');host.id='gather-capture-feedback';host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
    style.textContent=':host{all:initial}.border{position:fixed;inset:5px;border:3px solid #ffe329;animation:flash .6s ease-out both;box-shadow:inset 0 0 60px #ffe32922}.message{position:fixed;top:24px;right:24px;background:#f9f5e9;color:#171814;border:2px solid #171814;box-shadow:5px 5px 0 #171814;padding:16px 23px;font:700 13px Arial;max-width:330px}.mark{color:#e84624;margin-right:8px}@keyframes flash{from{opacity:0;transform:scale(.98)}50%{opacity:1}to{opacity:.5;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.border{animation:none}}';
    shadow.append(style);const border=document.createElement('div');border.className='border';const box=document.createElement('div');box.className='message';box.textContent='✳ Gather · '+message;shadow.append(border,box);document.documentElement.append(host);setTimeout(()=>host.remove(),finished?3500:18000);
  }});}catch{}
}
const capturingTabs = new Set();
async function capturePage(expectedTabId){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab||!/^https?:/.test(tab.url||''))throw new Error('Open a website first. Chrome internal pages cannot be captured.');
  if(expectedTabId!==undefined && tab.id!==expectedTabId)throw new Error('The active tab changed. Click your companion on the page you want to save.');
  if(capturingTabs.has(tab.id))throw new Error('This page is already being captured.');
  capturingTabs.add(tab.id);
  try{return await captureTab(tab);}finally{capturingTabs.delete(tab.id);}
}
async function resizeGatherSnapshot(screenshot){
    if(globalThis.OffscreenCanvas&&globalThis.createImageBitmap){
      const blob=await(await fetch(screenshot)).blob(),bitmap=await createImageBitmap(blob),ratio=Math.min(1,1440/bitmap.width);
      const canvas=new OffscreenCanvas(Math.round(bitmap.width*ratio),Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const bytes=new Uint8Array(await(await canvas.convertToBlob({type:'image/jpeg',quality:.6})).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);screenshot='data:image/jpeg;base64,'+btoa(binary);
    }
  return screenshot;
}
async function captureTab(tab){
  const url=GatherStore.normalizeUrl(tab.url);
  let screenshot;
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},args:[true],func:async hidden=>{
      const host=document.getElementById('gather-companion');
      if(host) {host.style.setProperty('visibility',hidden?'hidden':'visible','important');
        // Restore in the page even if the extension worker stops mid-capture.
        setTimeout(()=>host.style.setProperty('visibility','visible','important'),8000);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
      document.getElementById('gather-capture-feedback')?.remove();
    }});
    // Capture before injecting feedback, so the saved image is the unaltered page.
    screenshot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:55});
    screenshot=await resizeGatherSnapshot(screenshot);
  }catch{/* Saving readable content still works if screenshot capture is restricted. */}
  finally {try{await chrome.scripting.executeScript({target:{tabId:tab.id},args:[false],func:()=>document.getElementById('gather-companion')?.style.setProperty('visibility','visible','important')});}catch{}}
  await captureEffect(tab.id,'Captured. Reading & organizing…');
  try{
    let snapshot;
    try{const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      const meta=name=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
      const copy=(document.querySelector('main,article,[role="main"]')||document.body)?.cloneNode(true);copy?.querySelectorAll('script,style,nav,header,footer,aside,noscript,svg,#gather-capture-feedback,#gather-companion').forEach(el=>el.remove());
      return {title:meta('og:title')||document.title,description:meta('og:description')||meta('description'),headings:[...document.querySelectorAll('h1,h2')].slice(0,12).map(el=>el.textContent),text:copy?.textContent?.slice(0,24000)||'',excerpt:[...copy?.querySelectorAll('p')||[]].map(el=>el.textContent.trim()).find(t=>t.length>60)||'',selection:window.getSelection()?.toString().slice(0,2000)||''};
    }});snapshot=result.result;}catch{snapshot={title:tab.title||'',unavailable:true};}
    // Discard a capture if the user navigated during the capture.
    const current=await chrome.tabs.get(tab.id);if(GatherStore.normalizeUrl(current.url)!==url)throw new Error('The page changed during capture. Try again.');
    const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});
    if(active?.id!==tab.id)throw new Error('The active tab changed during capture. Try again.');
    const existing=(await GatherStore.read()).items.find(i=>GatherStore.normalizeUrl(i.url)===url);
    const analyzed=GatherAnalysis.analyze(snapshot,url);
    const item=await GatherStore.save(existing?{...existing,...analyzed,screenshot:screenshot||existing.screenshot,capturedAt:new Date().toISOString()}:{...analyzed,screenshot,capturedAt:new Date().toISOString(),note:snapshot.selection||'',status:'inbox',favorite:false});
    await captureEffect(tab.id,`Saved to ${item.website} / ${item.topic}${screenshot?'':' (page text only)'}`,true);
    return item;
  }catch(error){await captureEffect(tab.id,error.message,true);throw error;}
}
chrome.commands?.onCommand.addListener(async command=>{
  if(command!=='capture-page')return;
  try{await capturePage();await chrome.action.setBadgeText({text:'✓'});}catch{await chrome.action.setBadgeText({text:'!'});}
  setTimeout(()=>chrome.action.setBadgeText({text:''}),2500);
});
chrome.runtime.onInstalled.addListener(()=>chrome.contextMenus.create({id:'gather-save',title:'Save link to Gather',contexts:['link']}));
chrome.contextMenus.onClicked.addListener(async info=>{
  if(info.menuItemId!=='gather-save')return;
  try{
    try{await GatherAnalysis.requestAccess(GatherStore.normalizeUrl(info.linkUrl));}catch{}
    const item=await saveLink({url:info.linkUrl,source:info.pageUrl,note:info.selectionText});
    await chrome.action.setBadgeText({text:item.analysisStatus==='complete'?'✓':'?'});
    await chrome.action.setBadgeBackgroundColor({color:'#00a99b'});
  }catch{await chrome.action.setBadgeText({text:'!'});}
  setTimeout(()=>chrome.action.setBadgeText({text:''}),2500);
});
