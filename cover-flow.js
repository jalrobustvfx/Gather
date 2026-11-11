/* Keyboard-, pointer-, and swipe-accessible animated page previews. */
globalThis.GatherCoverFlow=(()=>{
  let items=[],activeId=null,queueState=null,queueTimer=null,queueBusy=false;
  const root=()=>document.getElementById('cover-flow');
  const hasSnapshot=item=>typeof item?.screenshot==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(item.screenshot);
  const current=()=>items.find(i=>i.id===activeId)||items[0];
  function page(item){
    return `<article class="cover-page" data-cover-id="${esc(item.id)}" aria-label="Preview ${esc(item.title)}"><div class="cover-browser"><span class="browser-dots">● ● ●</span><span>${esc(host(item.url))}</span><span>↗</span></div><button class="cover-picture" data-cover-select="${esc(item.id)}" aria-label="Select preview ${esc(item.title)}">${hasSnapshot(item)?`<img src="${esc(item.screenshot)}" alt="Captured snapshot of ${esc(item.title)}" draggable="false">`:`<div class="cover-placeholder"><span class="eyebrow">${esc(GatherStore.sourceInfo(item.url).website)}</span><strong>${esc(item.title)}</strong><p>${esc(item.description||'A page worth keeping.')}</p><span class="snapshot-missing">NO SNAPSHOT YET</span></div>`}</button><div class="cover-paper-edge"></div></article>`;
  }
  function renderCover(value){
    items=value;const container=root();if(!container)return;
    if(!items.some(i=>i.id===activeId))activeId=items[0]?.id||null;
    if(!items.length){container.innerHTML='';return;}
    if(!container.querySelector('.cover-deck')){
      container.innerHTML='<div class="cover-preview-status" role="status" aria-live="polite"></div><div class="cover-deck" aria-label="Page preview carousel"></div><div class="cover-details" aria-live="polite"></div><div class="cover-controls"><button class="secondary" id="cover-prev" aria-label="Previous page">←</button><span id="cover-position"></span><input id="cover-slider" type="range" min="0" aria-label="Choose page preview"><button class="secondary" id="cover-next" aria-label="Next page">→</button></div><p class="cover-key-hint">← → to flip · Swipe to browse · Snapshots stay with their saved page</p><input id="snapshot-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>';
      container.querySelector('#cover-prev').onclick=()=>navigate(-1);container.querySelector('#cover-next').onclick=()=>navigate(1);container.querySelector('#cover-slider').oninput=e=>select(Number(e.target.value));
      container.querySelector('#snapshot-file').onchange=async e=>{const file=e.target.files[0],item=current();e.target.value='';if(file&&item)await attach(file,item.id);};
      let start=null;
      container.querySelector('.cover-deck').addEventListener('pointerdown',event=>{start={x:event.clientX,y:event.clientY};});
      container.querySelector('.cover-deck').addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.4)navigate(dx<0?1:-1);});
    }
    update();watchQueue();
  }
  function update(){
    const container=root(),item=current();if(!container||!item)return;
    const index=items.indexOf(item),deck=container.querySelector('.cover-deck');
    const visible=items.filter((_,i)=>Math.abs(i-index)<=3),existing=new Map([...deck.children].map(el=>[el.dataset.coverId,el]));
    for(const [id,el]of existing)if(!visible.some(i=>i.id===id))el.remove();
    for(const value of visible){
      let el=existing.get(value.id);
      if(!el){const template=document.createElement('template');template.innerHTML=page(value);el=template.content.firstElementChild;el.style.opacity='0';deck.append(el);}
      // A refreshed screenshot replaces only that card's picture, not the other animated pages.
      if(el._snapshot!==value.screenshot||el._title!==value.title||el._description!==value.description){
        const template=document.createElement('template');template.innerHTML=page(value);el.querySelector('.cover-picture').replaceWith(template.content.querySelector('.cover-picture'));el._snapshot=value.screenshot;el._title=value.title;el._description=value.description;
      }
    }
    requestAnimationFrame(()=>{
      for(const el of deck.children){const offset=items.findIndex(i=>i.id===el.dataset.coverId)-index,abs=Math.abs(offset);el.style.setProperty('--shift',offset===0?'0px':`${Math.sign(offset)*(220+(abs-1)*110)}px`);el.style.setProperty('--turn',offset===0?'0deg':`${offset<0?52:-52}deg`);el.style.setProperty('--page-scale',offset===0?'1':String(Math.max(.52,.76-abs*.06)));el.style.opacity=abs<=2?'1':'.35';el.style.zIndex=String(10-abs);el.classList.toggle('current',offset===0);el.querySelector('button').tabIndex=offset===0?0:-1;}
    });
    container.querySelector('.cover-details').innerHTML=`<div class="cover-badges"><span class="source-label">${esc(GatherStore.sourceInfo(item.url).website)}</span><span>${esc(item.topic||item.category)}</span>${(item.modelNames||[]).map(name=>`<span class="model-chip">${esc(name)}</span>`).join('')}</div><h2>${esc(item.title)}</h2><p>${esc(item.description||'Open the original page or view its details for more context.')}</p>${GatherSearch.resultExcerpt(item,query)}<div class="cover-actions"><a class="primary" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">Open page ↗</a>${hasSnapshot(item)?'<button class="secondary" data-cover-action="read">Read snapshot ⛶</button>':GatherStore.extension?'<button class="primary" data-cover-action="capture">Capture this page ↗</button>':''}<button class="secondary" data-cover-action="details">Details</button><button class="secondary" data-cover-action="attach">${hasSnapshot(item)?'Replace snapshot':'Attach a snip'}</button></div>${!hasSnapshot(item)?`<p class="snapshot-help">${item.previewError?'Last capture: '+esc(item.previewError)+' ':''}Capture the original page with Alt+Shift+S in Chrome, or attach/paste a snip here. Captures run in the background. Chrome may show a debugging notice.</p>`:`<p class="snapshot-help">Saved page snapshot${item.capturedAt?' · '+esc(new Date(item.capturedAt).toLocaleDateString()):''} · Paste an image to replace it.</p>`}`;
    showQueue();
    container.querySelector('#cover-position').textContent=`${index+1} / ${items.length}`;container.querySelector('#cover-slider').max=String(items.length-1);container.querySelector('#cover-slider').value=String(index);container.querySelector('#cover-slider').disabled=items.length<2;
    container.querySelector('#cover-prev').disabled=index===0;container.querySelector('#cover-next').disabled=index===items.length-1;
  }
  function showQueue(){
    const element=root()?.querySelector('.cover-preview-status');if(!element)return;
    const missing=items.filter(item=>!hasSnapshot(item)).length;
    const entry=queueState?.entries.find(entry=>entry.itemId===current()?.id);
    const status=entry?({pending:'Waiting for capture',capturing:'Capturing this page…',failed:entry.error,done:'Snapshot captured',skipped:'Capture skipped'})[entry.status]:'';
    const paused=queueState?.status==='paused';
    element.innerHTML=`<span><strong>${items.length-missing} / ${items.length} page previews ready</strong>${status?`<small>${esc(status)}</small>`:''}${paused?'<small>Capture queue paused. Resume to finish your previews.</small>':''}</span>${missing&&GatherStore.extension?`<button class="secondary" data-cover-action="capture-missing" ${queueBusy?'disabled':''}>Capture missing previews (${missing}) ↗</button>`:''}${paused?'<button class="secondary" data-cover-action="resume-capture">Resume captures</button>':''}${queueState?.status==='running'?'<button class="secondary" data-cover-action="pause-capture">Pause captures</button>':''}`;
  }
  async function watchQueue(){
    clearTimeout(queueTimer);
    if(!GatherStore.extension||section!=='library'||libraryMode!=='cover')return;
    try {const response=await chrome.runtime.sendMessage({type:'gather-bookmarks-state'});if(response?.ok){queueState=response.result;showQueue();}}catch{}
    if(section==='library'&&libraryMode==='cover')queueTimer=setTimeout(watchQueue,3000);
  }
  async function captureMissing(ids){
    if(queueBusy)return;queueBusy=true;showQueue();
    try{
      if(!await GatherBookmarkPermissions.request(true))throw new Error('Allow website access to capture page previews.');
      const response=await chrome.runtime.sendMessage({type:'gather-bookmarks-missing',ids});
      if(!response?.ok)throw new Error(response?.error||'Could not start captures.');
      queueState=response.result;toast('Background captures queued. You can keep browsing.');
    }catch(error){toast(GatherBookmarkPermissions.error(error));}finally{queueBusy=false;showQueue();watchQueue();}
  }
  function select(index){if(index<0||index>=items.length)return;activeId=items[index].id;selected=null;document.getElementById('inspector').hidden=true;update();}
  function navigate(delta){select(items.indexOf(current())+delta);}
  async function attach(file,id){
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12000000)throw new Error('Choose a PNG, JPEG, or WebP image smaller than 12 MB.');
      const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('This image is too large. Use a smaller snip.');}
      const ratio=Math.min(1,1440/bitmap.width),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const existing=(await GatherStore.read()).items.find(i=>i.id===id);if(!existing)throw new Error('The saved page is no longer available.');
      await GatherStore.save({...existing,screenshot:canvas.toDataURL('image/jpeg',.7),capturedAt:new Date().toISOString()});data=await GatherStore.read();activeId=id;render();toast('Snapshot attached to this page.');
    }catch(error){toast(error.message);}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.coverSelect){const index=items.findIndex(i=>i.id===button.dataset.coverSelect);if(index!==items.indexOf(current()))select(index);else if(hasSnapshot(current()))GatherSnapshotViewer.open(current());else selectCard(current().id);}
    if(button.dataset.coverAction==='capture'&&current())captureMissing([current().id]);
    if(button.dataset.coverAction==='capture-missing')captureMissing(items.filter(item=>!hasSnapshot(item)).map(item=>item.id));
    if(['resume-capture','pause-capture'].includes(button.dataset.coverAction)){(async()=>{try{if(button.dataset.coverAction==='resume-capture'&&!await GatherBookmarkPermissions.request(true))throw new Error('Allow website access to resume.');const response=await chrome.runtime.sendMessage({type:'gather-bookmarks-action',action:button.dataset.coverAction==='resume-capture'?'resume':'pause'});if(!response?.ok)throw new Error(response?.error||'Could not update captures.');queueState=response.result;showQueue();}catch(error){toast(GatherBookmarkPermissions.error(error));}})();}
    if(button.dataset.coverAction==='read'&&current())GatherSnapshotViewer.open(current());
    if(button.dataset.coverAction==='details'&&current())selectCard(current().id);
    if(button.dataset.coverAction==='attach')root()?.querySelector('#snapshot-file').click();
  });
  document.addEventListener('keydown',event=>{
    if(section!=='library'||libraryMode!=='cover'||event.target.matches('input,textarea,select')||document.querySelector('dialog[open]')||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigate(event.key==='ArrowRight'?1:-1);}
    else if(event.key==='Home'){event.preventDefault();select(0);}else if(event.key==='End'){event.preventDefault();select(items.length-1);}
  });
  document.addEventListener('paste',event=>{
    if(section!=='library'||libraryMode!=='cover'||event.target.matches('input,textarea,select')||document.querySelector('dialog[open]')||!current())return;
    const image=[...event.clipboardData?.items||[]].find(item=>['image/png','image/jpeg','image/webp'].includes(item.type));if(image){event.preventDefault();attach(image.getAsFile(),current().id);}
  });
  return {render:renderCover,navigate};
})();
