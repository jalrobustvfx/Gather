/* Shared by the app and extension popup. No remote services or credentials. */
globalThis.GatherStore = (() => {
  const key = 'gather-library-v1';
  const recoveryKey = 'gather-library-recovery-v1';
  const extension = !!globalThis.chrome?.runtime?.id;
  let recovered=false, pending=Promise.resolve();
  const valid=value=>value?.version===1&&Array.isArray(value.items)&&Array.isArray(value.boards);
  async function stored(name) {
    if(extension)return (await chrome.storage.local.get(name))[name];
    try{return JSON.parse(localStorage.getItem(name)||'null');}catch{return {_unreadable:true};}
  }
  async function current() {
    const primary=await stored(key);
    if(valid(primary)){recovered=false;return primary;}
    const backup=await stored(recoveryKey);
    if(valid(backup?.data)){recovered=true;return backup.data;}
    if(primary)throw new Error('The library is unreadable. Keep the extension installed and use a recovery copy.');
    recovered=false;return {version:1,items:[],boards:[],_revision:0};
  }
  async function read() {
    const data=await current();
    data._revision ||= 0;
    data.workflows ||= [];
    for(const item of data.items){
      const info=sourceInfo(item.url);item.website=info.website;item.pageType=info.pageType;
      const broad=['Coding','Design','Video & Audio','Research','Productivity','Inspiration','Uncategorized','Video generation','Image generation','Tutorials','Model comparisons'];
      if(globalThis.GatherAnalysis&&item.topicMethod!=='manual'&&(!item.topic||broad.includes(item.topic))&&item.topicVersion!==GatherAnalysis.topicVersion){
        Object.assign(item,GatherAnalysis.inferTopic({title:item.title,description:item.description,...item.pageSignals},item.url));
      }
      item.topic ||= item.category||'Uncategorized';
    }
    return data;
  }
  async function write(value) {
    const operation=pending.catch(()=>{}).then(async()=>{
      if(!valid(value))throw new Error('Invalid library data. Existing links were kept.');
      const previous=await current(),revision=previous._revision||0;
      if(value._revision!==undefined&&value._revision!==revision)throw new Error('Your library changed in another tab. Refresh this page before editing again; existing links were kept.');
      const saved={...value,_revision:revision+1};
      const backup={savedAt:new Date().toISOString(),data:previous.items.length?previous:saved};
      if(extension){
        const updates={[key]:saved};
        if(backup.data.items.length)updates[recoveryKey]=backup;
        await chrome.storage.local.set(updates);
      }else{
        const raw=JSON.stringify(saved);
        try{localStorage.setItem(key,raw);}catch(error){
          // Free only the redundant recovery copy if browser storage is tight.
          if(error.name!=='QuotaExceededError')throw error;
          localStorage.removeItem(recoveryKey);localStorage.setItem(key,raw);
        }
        if(backup.data.items.length)try{localStorage.setItem(recoveryKey,JSON.stringify(backup));}catch{}
      }
      value._revision=saved._revision;
      globalThis.GatherBackup?.queueSync();
    });
    pending=operation;return operation;
  }
  function normalizeUrl(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Please use an http or https link.');
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
    return url.href.replace(/\/$/, '');
  }
  function sourceInfo(value){
    try{
      const url=new URL(value),host=url.hostname.replace(/^www\./,'');
      const sites={'github.com':'GitHub','reddit.com':'Reddit','old.reddit.com':'Reddit','linkedin.com':'LinkedIn','youtube.com':'YouTube','youtu.be':'YouTube','huggingface.co':'Hugging Face'};
      const website=sites[host]||Object.entries(sites).find(([domain])=>host.endsWith('.'+domain))?.[1]||host;
      const pageType=website==='GitHub'&&url.pathname.split('/').filter(Boolean).length>=2?'Repository':website==='Reddit'&&url.pathname.includes('/comments/')?'Post':website==='LinkedIn'?'Post':website==='YouTube'?'Video':'Web page';
      return {website,pageType};
    }catch{return {website:'Other websites',pageType:'Web page'};}
  }
  async function save(item) {
    if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('Please give your link a title.');
    const data = await read();
    const url = normalizeUrl(item.url);
    const duplicate = data.items.find(i => normalizeUrl(i.url) === url && i.id !== item.id);
    if (duplicate) throw new Error('This link is already in your collection.');
    const existing = data.items.find(i => i.id === item.id);
    const saved = { ...existing, ...item, ...sourceInfo(url), topic:item.topic||existing?.topic||item.category||'Uncategorized', title: item.title.trim(), url, id: item.id || crypto.randomUUID(), createdAt: existing?.createdAt || new Date().toISOString() };
    if (existing) data.items[data.items.indexOf(existing)] = saved; else data.items.unshift(saved);
    await write(data);
    return saved;
  }
  return { read, write, save, normalizeUrl, sourceInfo, extension, get recovered(){return recovered;} };
})();
