globalThis.GatherCompanionBackground = (() => {
  const id = 'gather-companion';
  let pending = Promise.resolve();
  async function update() {
    const values = await chrome.storage.local.get(GatherCompanion.key);
    const prefs = GatherCompanion.normalize(values[GatherCompanion.key]);
    const registered = await chrome.scripting.getRegisteredContentScripts({ids:[id]});
    if (registered.length) await chrome.scripting.unregisterContentScripts({ids:[id]});
    if (!prefs.enabled) return {enabled:false};
    if (!await chrome.permissions.contains({origins:['<all_urls>']})) {
      throw new Error('Enable website access from the companion settings first.');
    }
    await chrome.scripting.registerContentScripts([{id, matches:['http://*/*','https://*/*'],
      js:['companion-model.js','companion-content.js'], runAt:'document_idle', allFrames:false, persistAcrossSessions:true}]);
    const tabs = await chrome.tabs.query({url:['http://*/*','https://*/*']});
    await Promise.allSettled(tabs.map(tab=>chrome.scripting.executeScript({target:{tabId:tab.id},files:['companion-model.js','companion-content.js']})));
    return {enabled:true};
  }
  function configure() {
    const next = pending.catch(()=>{}).then(update);
    pending = next;
    return next;
  }
  chrome.runtime.onInstalled.addListener(()=>configure().catch(()=>{}));
  chrome.runtime.onStartup?.addListener(()=>configure().catch(()=>{}));
  chrome.permissions.onAdded?.addListener(()=>configure().catch(()=>{}));
  chrome.permissions.onRemoved?.addListener(()=>configure().catch(()=>{}));
  return {configure};
})();
