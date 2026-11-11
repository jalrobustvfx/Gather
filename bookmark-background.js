globalThis.GatherBookmarkImport = (() => {
  const key = GatherBookmarks.key;
  let running = false, preparing = false, job = null;
  const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function save() {await chrome.storage.local.set({[key]:job});}
  async function load() {if(!job)job=(await chrome.storage.local.get(key))[key]||null;return job;}
  async function state() {
    await load();
    if (job?.status==='running' && !running) {
      job.status='paused';job.message='Capture was interrupted. Resume to continue.';
      job.entries.forEach(entry=>{if(entry.status==='capturing')entry.status='pending';});
      await cleanup();await save();
    }
    return job;
  }
  async function tree() {
    if(!await chrome.permissions.contains({permissions:['bookmarks']}))throw new Error('Allow bookmark access to choose folders.');
    return chrome.bookmarks.getTree();
  }
  function selection(ids) {
    if(ids!==null && (!Array.isArray(ids)||ids.some(id=>typeof id!=='string')))throw new Error('Choose bookmark folders first.');
    return ids;
  }
  function websites(value) {
    if(value===undefined||value===null)return null;
    if(!Array.isArray(value)||value.some(site=>typeof site!=='string'))throw new Error('Choose valid websites.');
    return value;
  }
  async function preview(body) {
    const nodes=await tree(),scanned=GatherBookmarks.scan(nodes,selection(body.folders),websites(body.websites));
    return {folders:GatherBookmarks.folders(nodes),websites:scanned.websites,summary:GatherBookmarks.plan(scanned,await GatherStore.read(),body.capture!==false)};
  }
  async function start(body) {
    if(preparing||running)throw new Error('An import is already running. Pause it before starting another.');
    preparing=true;
    try {
      await state();
      if(job?.entries.some(e=>['pending','capturing'].includes(e.status)))throw new Error('Finish the current queue or choose Stop queue before importing another selection.');
      const capture=body.capture!==false;
      if(capture&&!chrome.debugger)throw new Error('Reload Gather to enable background capture permission. Your saved links are kept.');
      if(capture&&!await chrome.permissions.contains({origins:['<all_urls>']}))throw new Error('Allow website access to capture bookmark previews.');
      const scanned=GatherBookmarks.scan(await tree(),selection(body.folders),websites(body.websites));
      if(!scanned.links.length)throw new Error('No supported links in the selected folders.');
      if(scanned.links.length>10000)throw new Error('Choose folders containing at most 10,000 unique links per import.');
      // One library write imports every link before any website is opened.
      const data=await GatherStore.read(), known=new Map(data.items.map(item=>[GatherStore.normalizeUrl(item.url),item]));
      const summary=GatherBookmarks.plan(scanned,data,capture), entries=[];
      for(const link of scanned.links) {
        let item=known.get(link.url);
        if(!item){item={...GatherAnalysis.analyze({title:link.title,unavailable:true},link.url),
          title:link.title,id:crypto.randomUUID(),createdAt:new Date().toISOString(),status:'inbox',favorite:false};data.items.push(item);known.set(link.url,item);}
        item.bookmarkFolders=[...new Set([...(item.bookmarkFolders||[]),...link.folders])];
        item.bookmarkTitles=[...new Set([...(item.bookmarkTitles||[]),...link.titles])];
        item.tags=[...new Set([...(item.tags||[]),...link.folders.map(path=>path.split(' / ').at(-1))])];
        item.bookmarkImportedAt=new Date().toISOString();
        if(capture&&!item.screenshot)entries.push({id:crypto.randomUUID(),itemId:item.id,url:link.url,title:link.title,status:'pending',error:''});
      }
      await GatherStore.write(data);
      job={id:crypto.randomUUID(),createdAt:Date.now(),summary,entries,status:entries.length?'paused':'complete',
        message:entries.length?'Links imported. Preparing snapshots…':'Bookmark links imported.',windowId:null,tabId:null};
      await save();
      if(entries.length)await resume();
      return job;
    } finally {preparing=false;}
  }
  async function cleanup() {
    if(!job?.tabId)return;
    const tabId=job.tabId,windowId=job.windowId;
    job.tabId=null;job.windowId=null;
    try {
      const tab=await chrome.tabs.get(tabId);
      const ownedUrl=tab.url==='about:blank'||(job.captureUrl&&GatherStore.normalizeUrl(tab.url)===job.captureUrl);
      if(tab.windowId===windowId&&ownedUrl)await chrome.tabs.remove(tabId);
    }catch{}
  }
  function check() {if(job.status!=='running')throw new Error('Queue paused.');}
  async function ready(tabId, url) {
    const deadline=Date.now()+20000;
    while(Date.now()<deadline) {
      check();
      const tab=await chrome.tabs.get(tabId);
      if(tab.windowId!==job.windowId)throw new Error('The capture tab was moved.');
      if(tab.status==='complete' && tab.url && !tab.pendingUrl) {
        const actual=new URL(tab.url);
        if(!['http:','https:'].includes(actual.protocol))throw new Error('Chrome could not open this page.');
        // Do not attach screenshots after redirects to another URL: it might be a login or unrelated page.
        if(GatherStore.normalizeUrl(tab.url)!==url)throw new Error('This page redirected. Open it and capture manually after reviewing the destination.');
        await wait(1500);check();return;
      }
      await wait(500);
    }
    throw new Error('This page took too long to load. Retry it later.');
  }
  async function capture(entry) {
    check();
    if(!job.tabId) {
      const tab=await chrome.tabs.create({url:'about:blank',active:false});
      job.windowId=tab.windowId;job.tabId=tab.id;
      if(!job.tabId)throw new Error('Could not create the background capture tab.');
      await save();
    }
    const tabId=job.tabId;
    const before=await chrome.tabs.get(tabId);
    if(before.windowId!==job.windowId)throw new Error('The capture tab was moved.');
    job.captureUrl=entry.url;
    await chrome.tabs.update(tabId,{url:entry.url,active:false,muted:true});
    await ready(tabId,entry.url);check();
    const [result]=await chrome.scripting.executeScript({target:{tabId},func:async()=>{
      const images=[...document.images].filter(image=>image.getBoundingClientRect().top<innerHeight).slice(0,12);
      await Promise.race([Promise.all([document.fonts?.ready,...images.map(image=>image.decode().catch(()=>{}))]),new Promise(resolve=>setTimeout(resolve,1500))]);
      const meta=name=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
      const copy=(document.querySelector('main,article,[role="main"]')||document.body)?.cloneNode(true);
      copy?.querySelectorAll('script,style,nav,header,footer,aside,noscript,svg,#gather-companion,#gather-capture-feedback').forEach(el=>el.remove());
      return {title:meta('og:title')||document.title,description:meta('og:description')||meta('description'),
        headings:[...document.querySelectorAll('h1,h2')].slice(0,12).map(el=>el.textContent),text:copy?.textContent?.slice(0,24000)||''};
    }});
    const page=result?.result;
    if(!page || GatherBookmarks.blocked(page) || (String(page.text||'').trim().length<40&&!page.description?.trim()))throw new Error('This page is empty, requires sign-in, or blocked automatic capture. Open it to review.');
    let screenshot;
    try {
      // Capture a rendered page surface directly; never focus or activate a user window.
      if(!chrome.debugger)throw new Error('Reload Gather to enable background capture permission.');
      await chrome.scripting.executeScript({target:{tabId},args:[true],func:async()=>{
        for(const id of ['gather-companion','gather-capture-feedback']) {
          const element=document.getElementById(id);
          if(element) {element.style.setProperty('visibility','hidden','important');setTimeout(()=>element.style.setProperty('visibility','visible','important'),8000);}
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }});
      const target={tabId};let attached=false;
      try {
        await chrome.debugger.attach(target,'1.3');attached=true;
        await chrome.debugger.sendCommand(target,'Page.enable');
        await chrome.debugger.sendCommand(target,'Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        for(let attempt=0;attempt<3;attempt++) {
          check();
          const tab=await chrome.tabs.get(tabId);
          if(tab.windowId!==job.windowId||GatherStore.normalizeUrl(tab.url)!==entry.url||tab.pendingUrl)throw new Error('The page changed during capture. Retry it.');
          try {
            const result=await chrome.debugger.sendCommand(target,'Page.captureScreenshot',{format:'jpeg',quality:65,fromSurface:true,captureBeyondViewport:false});
            if(!result?.data)throw new Error('Chrome did not return a screenshot.');
            screenshot='data:image/jpeg;base64,'+result.data;break;
          }catch(error) {
            if(!/readback|unable to capture|screenshot/i.test(error.message)||attempt===2)throw error;
            await wait(700*(attempt+1));
          }
        }
      }finally{
        if(attached)try{await chrome.debugger.detach(target);}catch{}
      }
      screenshot=await resizeGatherSnapshot(screenshot);
    } finally {
      try {await chrome.scripting.executeScript({target:{tabId},args:[false],func:()=>{
        for(const id of ['gather-companion','gather-capture-feedback'])document.getElementById(id)?.style.setProperty('visibility','visible','important');
      }});}catch{}
    }
    check();
    const current=await chrome.tabs.get(tabId);
    if(current.windowId!==job.windowId || GatherStore.normalizeUrl(current.url)!==entry.url || current.pendingUrl)throw new Error('The page changed during capture. Retry it.');
    if(!/^data:image\/jpeg;base64,/.test(screenshot||''))throw new Error('Chrome did not return a snapshot.');
    const existing=(await GatherStore.read()).items.find(item=>item.id===entry.itemId);
    if(!existing)throw new Error('This link was removed from the library.');
    const analyzed=GatherAnalysis.analyze(page,entry.url);
    if(analyzed.analysisStatus==='unavailable')throw new Error('This page needs review before a snapshot can be saved.');
    await GatherStore.save({...existing,...analyzed,
      ...(existing.topicMethod==='manual'?{topic:existing.topic,topicMethod:'manual',topicVersion:existing.topicVersion}:{}),
      tags:[...new Set([...(existing.tags||[]),...(analyzed.tags||[])])],screenshot,capturedAt:new Date().toISOString(),previewStatus:'ready',previewError:''});
  }
  async function missing(body) {
    if(!chrome.debugger)throw new Error('Reload Gather to enable background capture permission. Your saved links are kept.');
    if(body.ids!==undefined&&(!Array.isArray(body.ids)||body.ids.some(id=>typeof id!=='string')))throw new Error('Choose saved pages to capture.');
    if(preparing)throw new Error('An import is being prepared. Try again shortly.');
    if(!await chrome.permissions.contains({origins:['<all_urls>']}))throw new Error('Allow website access to capture previews.');
    await state();
    if(running&&job.status!=='running')throw new Error('The previous capture is finishing. Try again in a moment.');
    const data=await GatherStore.read(),ids=body.ids?new Set(body.ids):null;
    const wanted=data.items.filter(item=>(!ids||ids.has(item.id))&&!item.screenshot);
    if(!wanted.length)throw new Error('These pages already have snapshots.');
    if(!job||!job.entries.some(entry=>['pending','capturing'].includes(entry.status))) {
      job={id:crypto.randomUUID(),createdAt:Date.now(),entries:[],status:'paused',message:'Preparing missing previews…',windowId:null,tabId:null};
    }
    for(const item of wanted) {
      let entry=job.entries.find(entry=>entry.itemId===item.id);
      if(entry&&['pending','capturing'].includes(entry.status))continue;
      if(entry){entry.status='pending';entry.error='';}
      else job.entries.push({id:crypto.randomUUID(),itemId:item.id,url:item.url,title:item.title,status:'pending',error:''});
    }
    await save();if(!running)await resume();return job;
  }
  async function resume() {
    await load();
    if(!job)throw new Error('Import bookmark links first.');
    if(running)return job;
    if(!job.entries.some(entry=>entry.status==='pending'))return job;
    if(!chrome.debugger)throw new Error('Reload Gather to enable background capture permission. Your saved links are kept.');
    if(!await chrome.permissions.contains({origins:['<all_urls>']}))throw new Error('Allow website access to resume snapshots.');
    if(running)return job;
    running=true;job.status='running';job.message='Capturing page previews…';
    try {await save();}catch(error){running=false;job.status='paused';throw error;}
    chrome.alarms.create('gather-bookmark-recovery',{periodInMinutes:1});
    (async()=>{
      try {
        while(job.status==='running') {
          const entry=job.entries.find(entry=>entry.status==='pending');
          if(!entry)break;
          entry.status='capturing';entry.error='';await save();
          try {await capture(entry);entry.status='done';}
          catch(error) {
            if(job.status!=='running'){entry.status=job.status==='stopped'?'skipped':'pending';break;}
            if(/debugger is not attached|not attached to the tab|canceled by user|cancelled by user|another debugger/i.test(error.message)) {
              entry.status='pending';job.status='paused';job.message='Background capture was disconnected or is in use. Resume when you are ready.';await save();break;
            }
            entry.status='failed';entry.error=error.message;
            try {
              const item=(await GatherStore.read()).items.find(item=>item.id===entry.itemId);
              if(item&&!item.screenshot)await GatherStore.save({...item,previewStatus:'failed',previewError:entry.error,previewAttemptedAt:new Date().toISOString()});
            }catch{}
            // A closed/moved capture tab pauses the queue instead of opening more windows.
            try {const tab=await chrome.tabs.get(job.tabId);if(tab.windowId!==job.windowId)throw new Error('Moved');}
            catch {job.status='paused';job.message='The background capture tab was closed or moved. Resume to create a new one.';await cleanup();}
          }
          await save();
        }
        if(job.status==='running'){job.status='complete';job.message='Capture queue finished. Failed pages can be retried.';}
      }catch(error){job.status='paused';job.message=error.message;}
      finally {await cleanup();running=false;chrome.alarms.clear('gather-bookmark-recovery');await save();}
    })().catch(error=>{running=false;job.status='paused';job.message='Could not save import progress: '+error.message;});
    return job;
  }
  async function action(body) {
    await load();if(!job)throw new Error('No bookmark import yet.');
    if(body.action==='pause') {job.status='paused';job.message='Paused. Imported links are already in your library.';await save();return job;}
    if(body.action==='stop') {
      job.status='stopped';job.message='Snapshot queue stopped. Imported links are kept.';
      job.entries.forEach(entry=>{if(['pending','capturing'].includes(entry.status))entry.status='skipped';});
      await save();if(!running)await cleanup();return job;
    }
    if(body.action==='retry') {
      if(running)throw new Error('Pause the queue before retrying.');
      job.entries.forEach(entry=>{if(entry.status==='failed'){entry.status='pending';entry.error='';}});await save();return resume();
    }
    if(body.action==='resume')return resume();
    throw new Error('Unknown bookmark action.');
  }
  chrome.runtime.onStartup?.addListener(()=>state().catch(()=>{}));
  chrome.alarms?.onAlarm.addListener(alarm=>{if(alarm.name==='gather-bookmark-recovery'&&!running)state().catch(()=>{});});
  return {tree,preview,start,state,action,missing};
})();
