(() => {
  const root = document.getElementById('companion-settings');
  if (!root) return;
  const extension = !!globalThis.chrome?.runtime?.id;
  let prefs = GatherCompanion.normalize();
  root.innerHTML = `<div class="companion-intro"><div class="eyebrow">A LITTLE BROWSING BUDDY</div><h2>Good finds. Good company.</h2><p>A tiny friend in the corner of your pages. One click saves the page, snapshot, and topic straight to your library.</p></div><div class="companion-choices" role="group" aria-label="Choose your companion">${GatherCompanion.characters.map(pet=>`<button class="companion-choice" data-pet="${pet.id}" aria-pressed="false">${GatherCompanion.svg(pet.id)}<strong>${pet.name}</strong><small>${pet.kind}</small></button>`).join('')}</div><label class="companion-option"><input type="checkbox" id="companion-animations" checked> A little wave every 3–5 minutes</label><label class="companion-option">Page corner <select id="companion-corner" aria-label="Page corner"><option value="right">Bottom right</option><option value="left">Bottom left</option></select></label><p class="capture-hint" id="companion-access">Enable your companion to show it on websites. Chrome will ask for website access so it can display the button and capture a snapshot when you click.</p><div class="companion-actions"><button class="primary" id="companion-enable">Enable companion ↗</button><button class="secondary" id="companion-disable" hidden>Turn off</button></div><p id="companion-status" role="status" aria-live="polite"></p>`;
  const status = root.querySelector('#companion-status');
  function render() {
    root.querySelectorAll('[data-pet]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pet===prefs.character)));
    root.querySelector('#companion-animations').checked = prefs.animations;
    root.querySelector('#companion-corner').value = prefs.corner;
    root.querySelector('#companion-enable').textContent = prefs.enabled ? 'Show companion ↗' : 'Enable companion ↗';
    root.querySelector('#companion-enable').disabled = !extension;
    root.querySelector('#companion-disable').hidden = !prefs.enabled;
    if (!extension) status.textContent = 'Preview your companion here. To put it on websites, open Gather through the Chrome extension and enable it there.';
  }
  async function save(value) {
    const latest = extension ? (await chrome.storage.local.get(GatherCompanion.key))[GatherCompanion.key] : prefs;
    prefs = GatherCompanion.normalize({...latest,...value});
    if (extension) await chrome.storage.local.set({[GatherCompanion.key]:prefs});
    else localStorage.setItem(GatherCompanion.key,JSON.stringify(prefs));
    render();
  }
  root.querySelectorAll('[data-pet]').forEach(button=>button.onclick=async()=>{
    try {await save({character:button.dataset.pet});button.classList.remove('wave');void button.offsetWidth;if(prefs.animations)button.classList.add('wave');} catch(error){status.textContent=error.message;}
  });
  root.querySelector('#companion-animations').onchange=event=>save({animations:event.target.checked}).catch(error=>status.textContent=error.message);
  root.querySelector('#companion-corner').onchange=event=>save({corner:event.target.value}).catch(error=>status.textContent=error.message);
  root.querySelector('#companion-enable').onclick=async event=>{
    const button=event.currentTarget;
    try {
      // This permission request must stay directly in the user's click handler.
      const access=chrome.permissions.request({origins:['<all_urls>']});
      button.disabled=true;status.textContent='Allow website access in Chrome to show your companion.';
      if (!await access) throw new Error('Website access was declined. Your companion is still off.');
      await save({enabled:true});
      const response=await chrome.runtime.sendMessage({type:'gather-companion-configure'});
      if(!response?.ok)throw new Error(response?.error||'Could not enable your companion.');
      status.textContent='Your companion is ready on websites. Click it to save the current page.';
    }catch(error){await save({enabled:false});status.textContent=error.message;}finally{render();}
  };
  root.querySelector('#companion-disable').onclick=async()=>{
    try {await save({enabled:false});const response=await chrome.runtime.sendMessage({type:'gather-companion-configure'});if(!response?.ok)throw new Error(response?.error||'Could not turn off companion.');status.textContent='Companion turned off. Your saved links stay in the library.';}catch(error){status.textContent=error.message;}
  };
  let preferencesChanged = false;
  if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[GatherCompanion.key]){preferencesChanged=true;prefs=GatherCompanion.normalize(changes[GatherCompanion.key].newValue);render();}});
  (async()=>{try {const value=extension?(await chrome.storage.local.get(GatherCompanion.key))[GatherCompanion.key]:JSON.parse(localStorage.getItem(GatherCompanion.key)||'null');if(!preferencesChanged)prefs=GatherCompanion.normalize(value||{});render();}catch(error){status.textContent=error.message;}})();
  document.getElementById('companion-button')?.addEventListener('click',()=>{document.getElementById('settings-panel').hidden=true;document.getElementById('companion-dialog').showModal();});
})();
