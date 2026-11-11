globalThis.GatherBookmarkPermissions = (() => {
  function request(capture=false) {
    // Read Chrome's installed manifest, which can lag behind edited unpacked files.
    const manifest=chrome.runtime.getManifest();
    const required=new Set(manifest.permissions||[]),optional=new Set(manifest.optional_permissions||[]);
    const needed=['bookmarks','unlimitedStorage'];
    const hosts=[...(manifest.host_permissions||[]),...(manifest.optional_host_permissions||[])];
    if(needed.some(name=>!required.has(name)&&!optional.has(name))||(capture&&(!hosts.includes('<all_urls>')||!required.has('debugger')))) {
      throw new Error(`Gather ${manifest.version||''} is still using older installed permissions. Open chrome://extensions, click Reload on Gather, then close this collection tab and reopen it from the extension. Your saved links will stay.`);
    }
    const permissions=needed.filter(name=>!required.has(name));
    const origins=capture&&!(manifest.host_permissions||[]).includes('<all_urls>')?['<all_urls>']:[];
    // Call synchronously from the click handler so Chrome keeps the user gesture.
    if(!permissions.length&&!origins.length)return Promise.resolve(true);
    return chrome.permissions.request({...(permissions.length?{permissions}:{}),...(origins.length?{origins}:{})});
  }
  function error(error) {
    if(/only permissions specified|not.*(?:declared|manifest)|not.*optional/i.test(error.message||''))return 'Chrome has an older permission manifest loaded. Open chrome://extensions, reload Gather, then close this collection tab and reopen it from the extension. Your saved links will stay.';
    return error.message;
  }
  return {request,error};
})();
