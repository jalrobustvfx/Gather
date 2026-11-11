(() => {
  const dialog=document.getElementById('bookmark-dialog');
  const extension=GatherStore.extension;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let nodes=null,job=null,poll,busy=false,previewVersion=0;
  let chosenWebsites=null,siteGroups=[],previewTotal=null,previewPending=false;
  async function send(action,body={}) {
    const response=await chrome.runtime.sendMessage({type:'gather-bookmarks-'+action,...body});
    if(!response?.ok)throw new Error(response?.error||'Could not reach Gather. Reload the extension and try again.');
    return response.result;
  }
  function selected() {return $('bookmark-all').checked?null:[...dialog.querySelectorAll('[data-bookmark-folder]:checked')].map(input=>input.dataset.bookmarkFolder);}
  function options(){return {folders:selected(),websites:chosenWebsites===null?null:[...chosenWebsites],capture:$('bookmark-capture').checked};}
  function buttons() {
    const active=job?.status==='running',waiting=job?.entries.some(entry=>['pending','capturing'].includes(entry.status));
    $('bookmark-start').disabled=!extension||!nodes||busy||active||waiting||previewPending||previewTotal===0;
    $('bookmark-pause').hidden=!active;
    $('bookmark-resume').hidden=active||!waiting;
    $('bookmark-retry').hidden=active||!job?.entries.some(entry=>entry.status==='failed');
    $('bookmark-stop').hidden=!waiting;
  }
  async function preview() {
    if(!nodes)return;
    const version=++previewVersion;
    previewPending=true;buttons();
    try {
      const result=await send('preview',options());
      if(version!==previewVersion)return;
      const s=result.summary;
      previewTotal=s.total;previewPending=false;
      siteGroups=result.websites;renderWebsites();
      $('bookmark-summary').innerHTML=`<div><strong>${s.newCount}</strong><span>new links</span></div><div><strong>${s.existingCount}</strong><span>already saved</span></div><div><strong>${s.captureCount}</strong><span>previews to capture</span></div>`;
      $('bookmark-selection-note').textContent=`${s.duplicates} repeated bookmarks combined · ${s.unsupported} unsupported links skipped`;
      buttons();if(!s.total)$('bookmark-start').disabled=true;
    }catch(error){if(version!==previewVersion)return;previewPending=false;previewTotal=0;buttons();$('bookmark-status').textContent=error.message;}
  }
  function renderWebsites() {
    const focused=document.activeElement;
    const focusSite=focused?.dataset.bookmarkWebsite,focusOnly=focused?.dataset.onlyWebsite;
    $('bookmark-website-picker').hidden=false;
    $('bookmark-sites-all').checked=chosenWebsites===null;
    const search=$('bookmark-site-search').value.trim().toLowerCase();
    const visible=siteGroups.filter(site=>site.name.toLowerCase().includes(search));
    $('bookmark-websites').innerHTML=visible.map(site=>`<div class="bookmark-website"><label><input type="checkbox" data-bookmark-website="${esc(site.name)}" ${chosenWebsites===null||chosenWebsites.has(site.name)?'checked':''}><span>${esc(site.name)}</span><small>${site.count} ${site.count===1?'link':'links'}</small></label><button class="quiet-button" data-only-website="${esc(site.name)}" aria-label="Import only ${esc(site.name)} bookmarks">Only</button></div>`).join('')||'<p class="capture-hint">No websites match this selection.</p>';
    $('bookmark-websites').querySelectorAll('[data-bookmark-website]').forEach(input=>input.onchange=()=>{
      chosenWebsites ||= new Set(siteGroups.map(site=>site.name));
      if(input.checked)chosenWebsites.add(input.dataset.bookmarkWebsite);else chosenWebsites.delete(input.dataset.bookmarkWebsite);
      preview();
    });
    $('bookmark-websites').querySelectorAll('[data-only-website]').forEach(button=>button.onclick=()=>{chosenWebsites=new Set([button.dataset.onlyWebsite]);preview();});
    if(focusSite||focusOnly)[...$('bookmark-websites').querySelectorAll('input,button')].find(element=>focusSite?element.dataset.bookmarkWebsite===focusSite:element.dataset.onlyWebsite===focusOnly)?.focus({preventScroll:true});
  }
  function folders(tree) {
    const entries=GatherBookmarks.folders(tree);
    $('bookmark-folders').innerHTML=entries.map(folder=>`<label class="bookmark-folder" style="--folder-depth:${Math.min(folder.depth,5)}"><input type="checkbox" data-bookmark-folder="${esc(folder.id)}" checked><span>${esc(folder.path)}</span><small>${folder.count}</small></label>`).join('')||'<p>No bookmark folders found.</p>';
    $('bookmark-folder-picker').hidden=false;
    $('bookmark-all').checked=true;
    $('bookmark-folders').querySelectorAll('input').forEach(input=>input.onchange=()=>{
      const folder=entries.find(entry=>entry.id===input.dataset.bookmarkFolder);
      for(const other of $('bookmark-folders').querySelectorAll('input')) {
        const entry=entries.find(entry=>entry.id===other.dataset.bookmarkFolder);
        if(entry.parents.includes(input.dataset.bookmarkFolder))other.checked=input.checked;
        if(!input.checked&&folder.parents.includes(other.dataset.bookmarkFolder))other.checked=false;
      }
      $('bookmark-all').checked=[...$('bookmark-folders').querySelectorAll('input')].every(item=>item.checked);preview();
    });
  }
  function showJob(value) {
    job=value;
    $('bookmark-progress').hidden=!job;
    if(!job){buttons();return;}
    const done=job.entries.filter(entry=>entry.status==='done').length,failed=job.entries.filter(entry=>entry.status==='failed').length;
    const skipped=job.entries.filter(entry=>entry.status==='skipped').length;
    const current=job.entries.find(entry=>entry.status==='capturing');
    $('bookmark-progress-title').textContent=job.status==='complete'?'Import finished':job.status==='running'?'Making your previews':job.status==='stopped'?'Queue stopped':'Capture paused';
    $('bookmark-progress-bar').max=Math.max(1,job.entries.length);$('bookmark-progress-bar').value=done+failed+skipped;
    $('bookmark-counts').textContent=`${done} captured · ${failed} need review · ${job.entries.length-done-failed-skipped} remaining`;
    $('bookmark-current').textContent=current?current.title:job.message;
    const failures=job.entries.filter(entry=>entry.status==='failed');
    $('bookmark-failures').innerHTML=failures.slice(0,100).map(entry=>`<li><strong>${esc(entry.title)}</strong><p>${esc(entry.error)}</p><a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Open page ↗</a></li>`).join('')+(failures.length>100?'<li>Showing the first 100 pages needing review.</li>':'');
    $('bookmark-failures-section').hidden=!failed;
    buttons();
  }
  async function refresh() {
    clearTimeout(poll);
    if(!extension||!dialog.open)return;
    try {showJob(await send('state'));}catch(error){$('bookmark-status').textContent=error.message;}
    if(dialog.open)poll=setTimeout(refresh,2000);
  }
  $('bookmark-button').onclick=()=>{
    $('settings-panel').hidden=true;dialog.showModal();refresh();
  };
  $('bookmark-load').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;$('bookmark-status').textContent='';
    try {
      if(!await chrome.permissions.request({permissions:['bookmarks']}))throw new Error('Bookmark access was declined. Nothing was imported.');
      nodes=await send('tree');chosenWebsites=null;folders(nodes);await preview();
      $('bookmark-load').textContent='Reload bookmark folders';
    }catch(error){$('bookmark-status').textContent=error.message;}finally{button.disabled=false;}
  };
  $('bookmark-all').onchange=()=>{$('bookmark-folders').querySelectorAll('input').forEach(input=>input.checked=$('bookmark-all').checked);preview();};
  $('bookmark-sites-all').onchange=()=>{chosenWebsites=$('bookmark-sites-all').checked?null:new Set();preview();};
  $('bookmark-site-search').oninput=renderWebsites;
  $('bookmark-capture').onchange=preview;
  $('bookmark-start').onclick=async()=>{
    if(busy)return;
    busy=true;buttons();$('bookmark-status').textContent='';
    try {
      const choice=options();
      // Keep optional permission requests in this user action, before any other await.
      const access=GatherBookmarkPermissions.request(choice.capture);
      if(!await access)throw new Error('Access was declined. Nothing was imported. You can turn off snapshots to import links only.');
      showJob(await send('import',choice));await preview();
      $('bookmark-status').textContent='Links are in your extension library. Snapshot progress is saved automatically.';
    }catch(error){$('bookmark-status').textContent=GatherBookmarkPermissions.error(error);}finally{busy=false;buttons();refresh();}
  };
  for(const action of ['pause','resume','retry','stop'])$('bookmark-'+action).onclick=async()=>{
    try {
      if(['resume','retry'].includes(action)&&!await GatherBookmarkPermissions.request(true))throw new Error('Allow website access to continue captures.');
      showJob(await send('action',{action}));refresh();
    }catch(error){$('bookmark-status').textContent=GatherBookmarkPermissions.error(error);}
  };
  dialog.addEventListener('close',()=>clearTimeout(poll));
  if(!extension){$('bookmark-load').disabled=true;$('bookmark-browser-note').hidden=false;}
  if(location.hash==='#bookmarks'){$('settings-panel').hidden=true;dialog.showModal();refresh();}
  buttons();
})();
