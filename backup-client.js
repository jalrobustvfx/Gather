globalThis.GatherBackup = (() => {
  const extension = !!globalThis.chrome?.runtime?.id;
  const key = 'gather-backup-connection';
  let base, timer, syncing;
  let syncStatus={lastSyncAt:null,error:'',needsRestore:[]};
  async function remember(config){
    if(extension)await chrome.storage.local.set({[key]:config});else localStorage.setItem(key,JSON.stringify(config));
  }
  async function connection() {
    return extension ? (await chrome.storage.local.get(key))[key] : JSON.parse(localStorage.getItem(key) || 'null');
  }
  async function api(action, body = {}) {
    const bases = base !== undefined ? [base] : (extension ? ['http://127.0.0.1:4173','http://127.0.0.1:4174','http://127.0.0.1:4175'] : ['', 'http://127.0.0.1:4174','http://127.0.0.1:4175']);
    let last;
    for (const candidate of bases) {
      try {
        const response = await fetch(candidate + '/api/backup/' + action, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(['stage','run','restore'].includes(action) ? 60000 : 5000)});
        if ([404,501].includes(response.status)) continue;
        const result = await response.json();
        if (!response.ok) { if (/not running/.test(result.error || '')) continue; throw new Error(result.error || 'Backup request failed.'); }
        base = candidate;
        return result;
      } catch (error) {last = error; if (base !== undefined) {base = undefined; throw error;}}
    }
    throw new Error(last?.message || 'Start the local Gather server with server.py to use folder backups.');
  }
  async function connect() {
    if (extension && !await chrome.permissions.request({origins:['http://127.0.0.1/*']})) throw new Error('Allow local Gather server access to connect backups.');
    if(extension&&!await connection())return sync();
    const config = await connection() || {id:crypto.randomUUID()};
    config.enabled = true;
    if (extension) await chrome.storage.local.set({[key]:config}); else localStorage.setItem(key, JSON.stringify(config));
    return sync();
  }
  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      let config = await connection();
      if(!config&&extension){
        const current=await GatherStore.read();
        const recovery=await api('recovery');
        const copies=recovery.libraries||[];
        if(!current.items.length&&!current.boards.length&&!current.workflows?.length&&!current._revision&&copies.length){
          if(copies.length===1){await restore(copies[0].id);config=await connection();}
          else{syncStatus.needsRestore=copies;throw new Error('Several saved libraries are available. Open Backups and choose which library to restore.');}
        }else{config={id:crypto.randomUUID(),enabled:true,automatic:true};await remember(config);}
      }
      if (!config?.enabled) return null;
      const result=await api('stage', {id:config.id, extension, data:await GatherStore.read()});
      syncStatus={lastSyncAt:Date.now(),error:'',needsRestore:[]};
      await remember({...config,lastSyncAt:syncStatus.lastSyncAt});
      return result;
    })();
    try {return await syncing;}catch(error){syncStatus.error=error.message;throw error;} finally {syncing = null;}
  }
  async function restore(id){
    const current=await GatherStore.read();
    if(current.items.length||current.boards.length||current.workflows?.length)throw new Error('This library already has data. Export it first; automatic recovery will not overwrite it.');
    const copy=await api('restore',{id});
    if(copy.data?.version!==1||!Array.isArray(copy.data.items)||!Array.isArray(copy.data.boards))throw new Error('The recovery copy is invalid.');
    await GatherStore.write({...copy.data,_revision:current._revision});
    await remember({id:copy.id,enabled:true,automatic:true});
    syncStatus.needsRestore=[];
    return copy.data;
  }
  function queueSync() {globalThis.clearTimeout?.(timer); timer = setTimeout(() => sync().catch(() => {}), 1200);}
  if (extension && chrome.alarms && typeof document === 'undefined') {
    chrome.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'gather-backup-sync') sync().catch(() => {});});
    chrome.runtime.onInstalled.addListener(() => {chrome.alarms.create('gather-backup-sync', {periodInMinutes:1});sync().catch(()=>{});});
    chrome.runtime.onStartup?.addListener(() => {chrome.alarms.create('gather-backup-sync', {periodInMinutes:1}); sync().catch(() => {});});
  }
  return {api, connect, sync, queueSync, connection, restore, get status(){return syncStatus;}};
})();
