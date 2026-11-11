(() => {
  if (!/^https?:$/.test(location.protocol) || window.top !== window) return;
  // Re-injection after enabling or reloading replaces the old, invalid extension context.
  window.__gatherCompanionDispose?.();
  const previous = document.getElementById('gather-companion');
  previous?.dispatchEvent(new Event('gather-companion-dispose'));
  previous?.remove();
  const host = document.createElement('div'); host.id = 'gather-companion';
  host.style.cssText = 'all:initial!important;position:fixed!important;bottom:24px!important;right:24px!important;left:auto!important;width:80px!important;height:90px!important;z-index:2147483646!important;color-scheme:light!important;';
  const shadow = host.attachShadow({mode:'closed'});
  const style = document.createElement('style');
  style.textContent = `:host{all:initial}*{box-sizing:border-box}button{font:12px Arial,sans-serif;color:#23251f;cursor:pointer}.save{position:absolute;bottom:0;width:80px;height:86px;border:0;background:none;padding:0;touch-action:manipulation}.save:focus-visible,.hide:focus-visible{outline:3px solid #e84b2c;outline-offset:4px}.pad{position:absolute;bottom:1px;left:5px;width:70px;height:18px;border-radius:50%;background:#24261e20}.figure{position:relative;display:block;transform-origin:50% 85%;filter:drop-shadow(2px 3px 0 #23251f25)}svg{display:block;width:80px;height:80px}.save:hover .figure{transform:translateY(-4px) rotate(-5deg)}.save:disabled{cursor:wait}.badge{position:absolute;bottom:0;right:0;background:#ffe329;border:2px solid #23251f;border-radius:50%;width:25px;height:25px;line-height:20px;font-size:20px;font-weight:bold;box-shadow:1px 2px 0 #23251f}.bubble{position:absolute;bottom:96px;right:0;max-width:260px;width:max-content;background:#faf6e9;border:2px solid #23251f;box-shadow:3px 3px 0 #23251f;padding:10px 13px;font:600 12px/1.5 Arial,sans-serif;color:#23251f;pointer-events:none;opacity:0;transform:translateY(5px);transition:opacity .15s,transform .15s}.bubble.visible,.save:hover~.bubble,.save:focus-visible~.bubble{opacity:1;transform:none}.hide{position:absolute;right:-5px;top:-3px;width:22px;height:22px;border:1px solid #23251f;background:#faf6e9;border-radius:50%;padding:0;opacity:0;line-height:18px}.hide:focus-visible,:host(:hover) .hide{opacity:1}.idle .figure{animation:hello 1.8s ease-in-out}.idle .arm{transform-origin:56px 57px;animation:wave .35s ease-in-out 4 alternate}.busy .figure{animation:thinking 1.1s ease-in-out infinite}.saved .figure{animation:cheer .7s ease-out}.saved .badge{background:#b7d4a0;font-size:14px}.error .badge{background:#f2b49c}.still .figure,.still .arm{animation:none!important;transition:none!important}.still .save:hover .figure{transform:none}.still .bubble{transition:none}@keyframes hello{0%,100%{transform:none}20%,60%{transform:translateY(-7px) rotate(-8deg)}40%,80%{transform:translateY(-3px) rotate(7deg)}}@keyframes wave{to{transform:rotate(-30deg)}}@keyframes thinking{50%{transform:rotate(5deg) translateY(-3px)}}@keyframes cheer{30%{transform:translateY(-14px) rotate(-8deg)}65%{transform:translateY(-3px) rotate(6deg)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.save:hover .figure{transform:none}}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = '<button class="save" type="button"><span class="pad"></span><span class="figure"></span><span class="badge">+</span></button><div class="bubble" role="status" aria-live="polite"></div><button class="hide" title="Hide for this page" aria-label="Hide companion for this page">×</button>';
  shadow.append(style, wrap);
  const button = wrap.querySelector('.save'), figure = wrap.querySelector('.figure'), bubble = wrap.querySelector('.bubble'), badge = wrap.querySelector('.badge');
  let prefs, idle, reset, busy = false, hidden = false;
  let preferencesChanged = false;
  function mount() {
    if (prefs?.enabled && !hidden && !host.isConnected) document.documentElement?.append(host);
  }
  // Some sites replace their page tree after initial load or navigation.
  const observer = new MutationObserver(mount);
  observer.observe(document, {childList:true, subtree:true});
  function dispose() {
    hidden = true;
    observer.disconnect();
    clearTimeout(idle); clearTimeout(reset);
    chrome.storage.onChanged.removeListener(changed);
    host.remove();
  }
  window.__gatherCompanionDispose = dispose;
  function apply(value) {
    prefs = GatherCompanion.normalize(value);
    if (!prefs.enabled || hidden) {host.remove(); clearTimeout(idle); return;}
    const pet = GatherCompanion.characters.find(c=>c.id===prefs.character);
    figure.innerHTML = GatherCompanion.svg(prefs.character);
    button.setAttribute('aria-label', `Save this page to Gather with ${pet.name}`);
    button.title = 'Save this page to Gather';
    bubble.textContent = `Found something good? Click ${pet.name} to save it.`;
    wrap.classList.toggle('still', !prefs.animations);
    host.style.setProperty('right', prefs.corner === 'right' ? '24px' : 'auto', 'important');
    host.style.setProperty('left', prefs.corner === 'left' ? '24px' : 'auto', 'important');
    bubble.style.right = prefs.corner === 'right' ? '0' : 'auto';
    bubble.style.left = prefs.corner === 'left' ? '0' : 'auto';
    mount();
    schedule();
  }
  function schedule() {
    clearTimeout(idle);
    if (!prefs?.enabled || !prefs.animations || hidden) return;
    idle = setTimeout(() => {
      if (!document.hidden && !busy) {
        wrap.classList.add('idle');
        setTimeout(()=>wrap.classList.remove('idle'), 2000);
      }
      schedule();
    }, 180000 + Math.random()*120000);
  }
  button.addEventListener('click', async event => {
    if (!event.isTrusted || busy) return;
    busy = true; button.disabled = true; clearTimeout(reset); wrap.classList.remove('saved','error','idle'); wrap.classList.add('busy');
    bubble.textContent = 'Reading & organizing this page…'; bubble.classList.add('visible');
    try {
      const response = await chrome.runtime.sendMessage({type:'gather-companion-capture'});
      if (!response?.ok) throw new Error(response?.error || 'Could not save. Try the Gather toolbar button.');
      wrap.classList.add('saved'); badge.textContent = '✓';
      bubble.textContent = `Saved to ${response.item.website} / ${response.item.topic}`;
    } catch (error) {
      wrap.classList.add('error'); badge.textContent = '!';
      bubble.textContent = /context invalidated/i.test(error.message) ? 'Gather was updated. Refresh this page to reconnect.' : error.message;
    } finally {
      busy = false; button.disabled = false; wrap.classList.remove('busy');
      reset = setTimeout(()=>{wrap.classList.remove('saved','error');badge.textContent='+';bubble.classList.remove('visible');bubble.textContent='Click to save this page to Gather.';}, 6000);
      schedule();
    }
  });
  wrap.querySelector('.hide').addEventListener('click', event=>{if(event.isTrusted){hidden=true;observer.disconnect();host.remove();clearTimeout(idle);}});
  const changed = (changes, area) => {if(area==='local' && changes[GatherCompanion.key]) {preferencesChanged=true;apply(changes[GatherCompanion.key].newValue);}};
  host.addEventListener('gather-companion-dispose',dispose,{once:true});
  chrome.storage.onChanged.addListener(changed);
  chrome.storage.local.get(GatherCompanion.key).then(values=>{if(!preferencesChanged)apply(values[GatherCompanion.key]);}).catch(dispose);
})();
