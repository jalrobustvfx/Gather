(() => {
  const dialog = document.getElementById('backup-dialog');
  const status = document.getElementById('backup-status');
  const date = value => value ? new Date(value * 1000).toLocaleString() : 'Not yet';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let poll, busy = false, latest;
  function show(state) {
    latest = state;
    document.getElementById('backup-folder').textContent = state.folder || 'No folder selected';
    document.getElementById('backup-auto').checked = state.enabled;
    document.getElementById('backup-last').textContent = date(state.lastBackup);
    document.getElementById('backup-next').textContent = !state.folder ? 'Choose a folder to start' : state.enabled ? date(state.nextBackup) : 'Automatic backups paused';
    document.getElementById('backup-run').disabled = !state.folder || busy;
    document.getElementById('backup-collections').innerHTML = state.libraries.length ? state.libraries.map(entry => `<li><strong>${escape(entry.label)}</strong> · ${entry.items} links<small>Last synced ${escape(date(entry.syncedAt))}</small></li>`).join('') : '<li>No collections connected yet.</li>';
    const safety=GatherBackup.status;
    document.getElementById('backup-safety').textContent=GatherStore.extension?(safety.lastSyncAt?'Reinstall protection: synced to your local Gather server at '+new Date(safety.lastSyncAt).toLocaleString()+'.':safety.error?'Reinstall protection is not current: '+safety.error:'Reinstall protection: checking the local server…'):'Chrome reinstall protection runs through the installed extension. Browser and Chrome collections remain separate.';
    document.getElementById('backup-recovery').innerHTML=GatherStore.extension?state.libraries.filter(entry=>entry.label==='Chrome extension'&&entry.items).map(entry=>`<button class="secondary" data-restore-library="${escape(entry.id)}">Recover ${entry.items} links · ${escape(date(entry.syncedAt))}</button>`).join(''):'';
    document.getElementById('backup-recovery').querySelectorAll('button').forEach(button=>button.onclick=()=>action(button,async()=>{await GatherBackup.restore(button.dataset.restoreLibrary);status.textContent='Library recovered, including snapshots and saved text.';return null;}));
    status.textContent = state.lastError || (state.picker?.status === 'choosing' ? 'Choose a folder in the Windows folder window.' : state.picker?.error || '');
    if (state.picker?.status === 'choosing' && dialog.open) poll = setTimeout(refresh, 1000);
  }
  async function refresh() {
    clearTimeout(poll);
    try {await GatherBackup.sync();show(await GatherBackup.api('state'));} catch (error) {status.textContent = error.message;document.getElementById('backup-safety').textContent='Reinstall protection unavailable. Keep the local Gather server running or export a backup before uninstalling.';try{show(await GatherBackup.api('state'));}catch{}}
  }
  async function action(button, task) {
    if (busy) return;
    busy = true; button.disabled = true; status.textContent = 'Working…';
    try {const result = await task(); if (result) show(result);} catch (error) {if (latest) show(latest); status.textContent = error.message;}
    finally {busy = false; button.disabled = false; document.getElementById('backup-run').disabled = !latest?.folder;}
  }
  document.getElementById('backup-button').onclick = async () => {
    document.getElementById('settings-panel').hidden = true;
    dialog.showModal(); await refresh();
  };
  document.getElementById('backup-connect').onclick = event => action(event.currentTarget, () => GatherBackup.connect());
  document.getElementById('backup-choose').onclick = event => action(event.currentTarget, async () => {
    await GatherBackup.connect(); return GatherBackup.api('folder');
  });
  document.getElementById('backup-run').onclick = event => action(event.currentTarget, async () => {
    await GatherBackup.sync(); const result = await GatherBackup.api('run');
    show(result); status.textContent = 'Backup saved successfully.'; return null;
  });
  document.getElementById('backup-auto').onchange = event => {
    const enabled = event.currentTarget.checked;
    action(event.currentTarget, () => GatherBackup.api('settings', {enabled}));
  };
  dialog.addEventListener('close', () => clearTimeout(poll));
  GatherBackup.sync().catch(() => {});
  setInterval(() => GatherBackup.sync().catch(() => {}), 60000);
})();
