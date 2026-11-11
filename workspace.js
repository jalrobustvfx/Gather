/* Library modes, purpose-driven workflows, and local page watches. */
globalThis.GatherWorkspace=(()=>{
  let activeWorkflow=null,pendingItem=null,watchState={watches:[],updates:[]},serviceError='',apiBase=null,requesting=false;
  let thumbnailSize=localStorage.getItem('gather-thumbnail-size')||'small';
  let selectedNode=null,drawerQuery='',flowScale=1,loadedUpdates=false,seenUpdates=new Set(),sectionLoading=false;
  const el=id=>document.getElementById(id);
  const timestamp=value=>value?new Date(value*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet';
  function syncNavigation(){
    document.querySelectorAll('[data-section]').forEach(button=>{button.classList.toggle('active',button.dataset.section===section);button.setAttribute('aria-current',button.dataset.section===section?'page':'false');});
    el('workspace-toggle').hidden=section!=='library';el('workspace-panel').hidden=true;
    el('library-controls').hidden=section!=='library';
    el('workspace-page').hidden=section==='library';
    el('inspector').hidden=section!=='library'||!selected;
    document.querySelector('.canvas-caption').hidden=section!=='library';
    document.querySelector('.canvas-toolbar').hidden=section!=='library'||libraryMode!=='canvas';
    document.querySelector('.bottom-left').hidden=section!=='library';document.querySelector('.bottom-right').hidden=section!=='library';
    el('stage').classList.toggle('workspace-stage',section!=='library');
    el('stage').classList.toggle('cover-stage',section==='library'&&libraryMode==='cover');
    el('cover-flow').hidden=section!=='library'||libraryMode!=='cover';
    el('stage').classList.toggle('list-stage',section==='library'&&libraryMode==='list');
    el('add-button').innerHTML=section==='library'?'＋ <span>Save link</span>':section==='ideation'?'＋ <span>New workflow</span>':section==='watchlist'?'＋ <span>Watch page</span>':'✓ <span>Mark all read</span>';
    el('search').placeholder=section==='ideation'?'Find a workflow…':section==='watchlist'?'Find a watch…':section==='updates'?'Find an update…':'Find something…';
    const count=watchState.updates.filter(u=>!u.read).length;el('updates-badge').textContent=count;el('updates-badge').hidden=!count;
  }
  function renderLibrary(){
    const boardList=view==='boards'&&!activeBoard;
    el('thumbnail-control').hidden=libraryMode!=='list'||boardList;el('thumbnail-size').value=thumbnailSize;el('library-list').dataset.thumbnailSize=thumbnailSize;
    el('library-controls').hidden=boardList;el('world').hidden=libraryMode!=='canvas'||boardList;
    const topics=[...new Set(data.items.filter(i=>website==='All'||GatherStore.sourceInfo(i.url).website===website).map(i=>i.topic||i.category))].sort();
    el('topic-filter').innerHTML='<option value="All">All topics</option>'+topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');el('topic-filter').value=topic;
    el('canvas-mode').classList.toggle('active',libraryMode==='canvas');el('list-mode').classList.toggle('active',libraryMode==='list');el('cover-mode').classList.toggle('active',libraryMode==='cover');
    el('cover-flow').hidden=libraryMode!=='cover'||boardList;
    if(libraryMode==='cover'&&!boardList)GatherCoverFlow.render(filtered().sort((a,b)=>librarySort==='title'?a.title.localeCompare(b.title):librarySort==='oldest'?Date.parse(a.createdAt)-Date.parse(b.createdAt):Date.parse(b.createdAt)-Date.parse(a.createdAt)));
    el('library-list').hidden=libraryMode!=='list'||boardList;
    if(libraryMode==='list'&&!boardList){
      el('world').hidden=true;
      const items=filtered().sort((a,b)=>librarySort==='title'?a.title.localeCompare(b.title):librarySort==='oldest'?Date.parse(a.createdAt)-Date.parse(b.createdAt):Date.parse(b.createdAt)-Date.parse(a.createdAt));
      el('library-list').innerHTML=items.length?`<table class="saves-table"><thead><tr><th>Saved page</th><th>Website</th><th>Topic</th><th>Saved</th><th></th></tr></thead><tbody>${items.map(item=>`<tr><td><div class="list-page-cell">${item.screenshot&&/^data:image\/(jpeg|png|webp);base64,/.test(item.screenshot)?`<button class="list-snapshot" data-workspace-action="preview-snapshot" data-item="${esc(item.id)}" aria-label="Enlarge snapshot of ${esc(item.title)}"><img src="${esc(item.screenshot)}" alt="Captured page"><span>⛶</span></button>`:`<span class="list-initial">${esc(item.title[0]||'↗')}</span>`}<button class="list-entry" data-workspace-action="select-item" data-item="${esc(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.description||host(item.url))}</small>${GatherSearch.resultExcerpt(item,query)}</span></button></div></td><td><span class="source-label">${esc(GatherStore.sourceInfo(item.url).website)}</span><small>${esc(GatherStore.sourceInfo(item.url).pageType)}</small></td><td>${esc(item.topic||item.category)}</td><td>${esc(new Date(item.createdAt).toLocaleDateString())}</td><td><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(item.title)}">↗</a></td></tr>`).join('')}</tbody></table>`:'';
    }
    if(selected)renderInspector();
  }
  function pageHeader(kicker,title,description,extra=''){return `<div class="workspace-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;}
  function renderSection(){
    el('world').hidden=true;el('boards').hidden=true;el('empty-state').hidden=true;el('library-list').hidden=true;
    if(section==='ideation')renderIdeation();else if(section==='watchlist')renderWatches();else renderUpdates();
  }
  const workflow=()=>data.workflows?.find(w=>w.id===activeWorkflow);
  function renderIdeation(){
    const current=workflow();
    if(!current){
      el('workspace-page').innerHTML=pageHeader('FROM GOOD FINDS TO GOOD IDEAS.','Connect the possibilities.',pendingItem?'Choose a workflow below to add your saved tool, or create a new one.':'Bring your discoveries together. Give every tool a purpose.')+`<div class="workflow-grid">${(data.workflows||[]).filter(w=>!query||w.name.toLowerCase().includes(query)).map(w=>`<button class="workflow-tile" data-workflow="${esc(w.id)}"><div class="workflow-tile-art"><i></i><span>→</span><i></i><span>→</span><i></i></div><h2>${esc(w.name)}</h2><p>${w.nodes.length} steps · ${w.edges.length} ${w.edges.length===1?'connection':'connections'} <span>↗</span></p></button>`).join('')}</div>${!data.workflows?.length?'<div class="workspace-empty"><h2>A few tools. One clear plan.</h2><p>Add saved tools, write what each one will do, and connect the steps.</p><button class="primary" data-workspace-action="new-workflow">Create your first workflow ↗</button></div>':''}`;
      return;
    }
    el('workspace-page').innerHTML=`<div class="flow-heading"><div><button class="quiet-button" data-workspace-action="back-workflows">← All workflows</button><h2>${esc(current.name)}</h2><p>Drag steps to arrange · Add a purpose · Connect with labeled arrows</p></div><div class="flow-actions"><button class="secondary" data-workspace-action="new-step">＋ Plain step</button><button class="secondary" data-workspace-action="connect">Connect steps →</button><button class="secondary" data-workspace-action="fit-map">Fit map</button><button class="quiet-button" data-workspace-action="delete-workflow">Delete workflow</button></div></div><div class="flow-layout"><aside class="flow-library"><div class="panel-label">FROM YOUR LIBRARY</div><label class="drawer-search"><input id="drawer-search" type="search" placeholder="Find a tool…" aria-label="Search workflow library" value="${esc(drawerQuery)}"></label><div id="flow-library-items"></div><p class="panel-note">A tool can appear in several steps. Its purpose belongs to this workflow.</p></aside><div class="flow-viewport"><div class="flow-space" id="flow-space"><div class="flow-world" id="flow-world"><svg id="flow-lines" width="2800" height="1900" aria-label="Workflow connections"></svg>${current.nodes.map(n=>nodeMarkup(n)).join('')}${!current.nodes.length?'<div class="flow-empty"><h2>What happens first?</h2><p>Add a tool from the left, or start with a plain step.</p></div>':''}</div></div></div></div><div class="connection-list"><strong>CONNECTIONS</strong>${current.edges.map(e=>`<span>${esc(current.nodes.find(n=>n.id===e.from)?.title)} → ${esc(current.nodes.find(n=>n.id===e.to)?.title)}${e.label?' · '+esc(e.label):''}<button data-workspace-action="remove-edge" data-edge="${esc(e.id)}" aria-label="Remove connection ${esc(e.label||'between steps')}">×</button></span>`).join('')||'<span>No connections yet. Use “Connect steps” to draw your workflow.</span>'}</div>`;
    renderDrawer();drawEdges();setupNodeDrag();applyFlowScale();
    el('drawer-search').oninput=e=>{drawerQuery=e.target.value.toLowerCase();renderDrawer();};
  }
  function nodeMarkup(n){
    const item=data.items.find(i=>i.id===n.itemId);
    return `<article class="flow-node ${selectedNode===n.id?'selected':''}" data-node="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px" tabindex="0" aria-label="Workflow step ${esc(n.title)}"><div class="node-handle"><span>${item?esc(GatherStore.sourceInfo(item.url).website):'PLAIN STEP'}</span><span>⠿</span></div><h3>${esc(n.title)}</h3><p>${esc(n.purpose||'What will you use this step for?')}</p>${item?`<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)} ↗</a>`:n.itemId?'<small>Original save is no longer available.</small>':''}<div class="node-actions"><button data-workspace-action="edit-step" data-node-id="${esc(n.id)}">Edit purpose</button><button data-workspace-action="remove-node" data-node-id="${esc(n.id)}" aria-label="Remove ${esc(n.title)}">×</button></div></article>`;
  }
  function renderDrawer(){el('flow-library-items').innerHTML=data.items.filter(i=>!drawerQuery||[i.title,i.description,i.topic,i.website].join(' ').toLowerCase().includes(drawerQuery)).map(i=>`<button class="drawer-item" data-workspace-action="add-tool" data-item="${esc(i.id)}"><strong>${esc(i.title)}</strong><small>${esc(GatherStore.sourceInfo(i.url).website)} / ${esc(i.topic||i.category)}</small><span>＋</span></button>`).join('')||'<p class="panel-note">No matching saves. Save a link in Library first.</p>';}
  function drawEdges(){
    const current=workflow();if(!current||!el('flow-lines'))return;
    el('flow-lines').innerHTML='<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#171814"/></marker></defs>'+current.edges.map(e=>{
      const a=current.nodes.find(n=>n.id===e.from),b=current.nodes.find(n=>n.id===e.to);if(!a||!b)return '';
      const x1=a.x+270,y1=a.y+90,x2=b.x,y2=b.y+90,curve=Math.max(65,Math.abs(x2-x1)*.45);
      return `<path d="M${x1},${y1} C${x1+curve},${y1} ${x2-curve},${y2} ${x2},${y2}" fill="none" stroke="#171814" stroke-width="2" marker-end="url(#arrowhead)"/><text x="${(x1+x2)/2}" y="${Math.max(18,Math.min(a.y,b.y)-15)}" text-anchor="middle" class="edge-label">${esc(e.label)}</text>`;
    }).join('');
  }
  function applyFlowScale(){
    if(!el('flow-world'))return;el('flow-world').style.transform=`scale(${flowScale})`;el('flow-space').style.width=(2800*flowScale)+'px';el('flow-space').style.height=(1900*flowScale)+'px';
  }
  function fitMap(){
    const current=workflow(),viewport=document.querySelector('.flow-viewport');if(!current?.nodes.length||!viewport)return;
    const left=Math.min(...current.nodes.map(n=>n.x)),top=Math.min(...current.nodes.map(n=>n.y)),right=Math.max(...current.nodes.map(n=>n.x+290)),bottom=Math.max(...current.nodes.map(n=>n.y+270));
    flowScale=Math.max(.25,Math.min(1,(viewport.clientWidth-60)/(right-left),(viewport.clientHeight-60)/(bottom-top)));applyFlowScale();viewport.scrollLeft=Math.max(0,left*flowScale-30);viewport.scrollTop=Math.max(0,top*flowScale-30);
  }
  function setupNodeDrag(){
    document.querySelectorAll('.flow-node').forEach(card=>{
      const node=workflow().nodes.find(n=>n.id===card.dataset.node);
      card.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.target.closest('a,button'))return;event.preventDefault();selectedNode=node.id;
        const start={x:event.clientX,y:event.clientY,left:node.x,top:node.y};card.setPointerCapture(event.pointerId);card.classList.add('moving');
        const move=e=>{node.x=Math.max(0,Math.min(2450,start.left+(e.clientX-start.x)/flowScale));node.y=Math.max(0,Math.min(1600,start.top+(e.clientY-start.y)/flowScale));card.style.left=node.x+'px';card.style.top=node.y+'px';drawEdges();};
        const stop=async()=>{card.removeEventListener('pointermove',move);card.removeEventListener('pointerup',stop);card.removeEventListener('pointercancel',stop);card.classList.remove('moving');try{await persist();}catch(error){toast(error.message);}};
        card.addEventListener('pointermove',move);card.addEventListener('pointerup',stop);card.addEventListener('pointercancel',stop);
      });
      card.onkeydown=async event=>{if(event.target!==card)return;const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];if(delta){event.preventDefault();node.x=Math.max(0,Math.min(2450,node.x+delta[0]));node.y=Math.max(0,Math.min(1600,node.y+delta[1]));card.style.left=node.x+'px';card.style.top=node.y+'px';drawEdges();await persist();}else if(event.key==='Enter')openNode(node);};
    });
  }
  function openNode(node){el('node-form').reset();el('node-id').value=node?.id||'';el('node-title').value=node?.title||'';el('node-purpose').value=node?.purpose||'';el('node-dialog').showModal();}
  async function api(path,body={}){
    const bases=apiBase?[apiBase]:GatherStore.extension?['http://127.0.0.1:4173','http://127.0.0.1:4174','http://127.0.0.1:4175']:['','http://127.0.0.1:4174','http://127.0.0.1:4175'];
    let lastError='The local Gather server is offline. Start python server.py to enable watching.';
    for(const base of bases){
      try{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if([404,501].includes(response.status))continue;const result=await response.json();if(!response.ok){if(result.error==='Watch service is not running.')continue;throw new Error(result.error||'The request failed.');}apiBase=base;return result;}
      catch(error){lastError=error.message;if(apiBase)apiBase=null;}
    }
    throw new Error(lastError);
  }
  async function refreshWatches(redraw=true){
    if(requesting)return;requesting=true;
    try{
      watchState=await api('/api/watch/state');serviceError='';
      if(loadedUpdates){for(const update of watchState.updates)if(!seenUpdates.has(update.id)&&!update.read&&globalThis.Notification?.permission==='granted'){try{new Notification('Gather · A useful change',{body:update.summary.slice(0,180),tag:update.id});}catch{/* The inbox remains available if system notifications are blocked. */}}}
      seenUpdates=new Set(watchState.updates.map(u=>u.id));loadedUpdates=true;
    }catch(error){serviceError=error.message;}
    finally{requesting=false;syncNavigation();if(redraw&&['watchlist','updates'].includes(section))renderSection();}
  }
  function serviceBanner(){return serviceError?`<div class="service-banner"><strong>Watching is offline.</strong><span>Start the local Gather server to check pages and see updates. Your saved watches will be there when it reconnects.</span><button class="secondary" data-workspace-action="refresh-watches">Retry connection</button></div>`:'<div class="service-note"><i></i> Local watcher is running · Checks continue while the server is on. Browser notifications need Gather open.</div>';}
  function renderWatches(){
    const matching=watchState.watches.filter(w=>!query||[w.title,w.url,...w.keywords].join(' ').toLowerCase().includes(query));
    el('workspace-page').innerHTML=pageHeader('LET THE GOOD STUFF COME TO YOU.','Keep an eye on it.','Watch a specific public page. Get an update when its content changes.',`<button class="secondary" data-workspace-action="notifications">Enable browser notifications</button>`)+serviceBanner()+`<div class="watch-list">${matching.map(w=>`<article class="watch-card"><div class="watch-card-top"><span class="source-label">${esc(GatherStore.sourceInfo(w.url).website)}</span><span class="watch-status ${w.paused?'paused':''}">${w.paused?'Paused':w.checking?'Checking…':w.lastError?'Needs attention':w.lastChecked?'Watching':'Establishing baseline'}</span></div><h2>${esc(w.title)}</h2><a href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener noreferrer">${esc(w.url)} ↗</a><p>${w.keywords.length?'Notify when changed text mentions: '+esc(w.keywords.join(', ')):'Notify on substantial readable content changes.'}</p><div class="watch-times"><span>Every ${w.interval===60?'hour':w.interval===1440?'day':w.interval+' minutes'}</span><span>Last check: ${esc(timestamp(w.lastChecked))}</span><span>Next: ${w.paused?'Paused':esc(timestamp(w.nextCheck))}</span></div>${w.lastError?`<p class="watch-error">${esc(w.lastError)}</p>`:''}<div class="watch-actions"><button class="secondary" data-workspace-action="check-watch" data-watch="${esc(w.id)}" ${w.checking?'disabled':''}>Check now</button><button class="quiet-button" data-workspace-action="pause-watch" data-watch="${esc(w.id)}">${w.paused?'Resume':'Pause'}</button><button class="quiet-button" data-workspace-action="delete-watch" data-watch="${esc(w.id)}">Remove watch</button></div></article>`).join('')}</div>${!matching.length?'<div class="workspace-empty"><h2>Follow what matters.</h2><p>Watch a repository’s releases, a pricing page, or a public discussion.<br>The first check sets a baseline. Alerts begin with later changes.</p><button class="primary" data-workspace-action="new-watch">Watch your first page ↗</button></div>':''}`;
  }
  function renderUpdates(){
    el('workspace-page').innerHTML=pageHeader('SOMETHING WORTH A LOOK.','Fresh from your watchlist.','New changes, the reason they matched, and a path back to the source.')+serviceBanner()+`<div class="updates-list">${watchState.updates.filter(u=>!query||[u.title,u.summary].join(' ').toLowerCase().includes(query)).map(u=>`<article class="update-card ${u.read?'read':''}"><div class="watch-card-top"><span class="source-label">${esc(GatherStore.sourceInfo(u.url).website)}</span><small>${esc(timestamp(u.createdAt))} · ${u.read?'Read':'New'}</small></div><h2>${esc(u.title)}</h2><p>${esc(u.summary)}</p>${u.removed?`<details><summary>Removed content</summary><p>${esc(u.removed)}</p></details>`:''}<div class="watch-actions"><a class="secondary" href="${esc(safeUrl(u.url))}" target="_blank" rel="noopener noreferrer">Open page ↗</a><button class="secondary" data-workspace-action="save-update" data-update="${esc(u.id)}">Save to Library</button>${!u.read?`<button class="quiet-button" data-workspace-action="read-update" data-update="${esc(u.id)}">Mark read</button>`:''}</div></article>`).join('')}</div>${!watchState.updates.length?'<div class="workspace-empty"><h2>No noise. Just useful changes.</h2><p>Changes from watched pages will arrive here.<br>Nothing is published or sent to anyone else.</p></div>':''}`;
  }
  function openWatch(item){el('watch-form').reset();el('watch-url').value=item?.url||'';el('watch-error').textContent='';el('watch-dialog').showModal();}
  function primaryAction(){if(section==='ideation'){el('workflow-form').reset();el('workflow-dialog').showModal();}else if(section==='watchlist')openWatch();else{api('/api/watch/action',{action:'read',id:'all'}).then(state=>{watchState=state;render();}).catch(e=>toast(e.message));}}
  function switchSection(next){section=next;query='';el('search').value='';selected=null;document.body.classList.remove('focus-mode');render();if(['watchlist','updates'].includes(next)){sectionLoading=true;refreshWatches().finally(()=>sectionLoading=false);}if(next==='library'&&libraryMode==='canvas')fitAll();}
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.section){switchSection(button.dataset.section);return;}
      if(button.dataset.website){website=button.dataset.website;topic='All';category='All';el('workspace-panel').hidden=true;render();fitAll();return;}
      if(button.dataset.workflow){activeWorkflow=button.dataset.workflow;flowScale=1;if(pendingItem){GatherWorkflows.addNode(workflow(),data.items.find(i=>i.id===pendingItem));pendingItem=null;await persist();}render();return;}
      const action=button.dataset.workspaceAction,item=data?.items.find(i=>i.id===button.dataset.item),current=workflow();
      if(action==='preview-snapshot'&&item){GatherSnapshotViewer.open(item);return;}
      if(action==='select-item'&&item){selectCard(item.id);return;}
      if(action==='watch-item')openWatch(item);
      if(action==='ideate-item'){pendingItem=item?.id;activeWorkflow=null;switchSection('ideation');}
      if(action==='new-workflow'){el('workflow-form').reset();el('workflow-dialog').showModal();}
      if(action==='back-workflows'){activeWorkflow=null;selectedNode=null;render();}
      if(action==='new-step')openNode();
      if(action==='fit-map')fitMap();
      if(action==='add-tool'&&item&&current){const node=GatherWorkflows.addNode(current,item);await persist();render();openNode(node);}
      if(action==='edit-step')openNode(current.nodes.find(n=>n.id===button.dataset.nodeId));
      if(action==='connect'){
        if(current.nodes.length<2){toast('Add at least two steps first.');return;}
        const options=current.nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.title)}</option>`).join('');el('edge-from').innerHTML=options;el('edge-to').innerHTML=options;el('edge-to').selectedIndex=1;el('edge-label').value='';el('edge-error').textContent='';el('edge-dialog').showModal();
      }
      if(action==='remove-node'&&confirm('Remove this step and its connections? Your Library save will stay.')){GatherWorkflows.removeNode(current,button.dataset.nodeId);await persist();render();}
      if(action==='remove-edge'){current.edges=current.edges.filter(e=>e.id!==button.dataset.edge);await persist();render();}
      if(action==='delete-workflow'&&confirm('Delete this workflow? Your Library saves will stay.')){data.workflows=data.workflows.filter(w=>w.id!==activeWorkflow);activeWorkflow=null;await persist();render();}
      if(action==='new-watch')openWatch();
      if(action==='refresh-watches')await refreshWatches();
      if(action==='notifications'){
        if(!globalThis.Notification){toast('Browser notifications are not available here. Updates still appear in the inbox.');return;}
        const permission=await Notification.requestPermission();toast(permission==='granted'?'Notifications enabled while Gather is open.':'Updates will still appear in the inbox.');
      }
      if(['check-watch','pause-watch','delete-watch'].includes(action)){
        if(action==='delete-watch'&&!confirm('Remove this watch? Existing updates will stay.'))return;
        button.disabled=true;watchState=await api('/api/watch/action',{action:action==='check-watch'?'check':action==='pause-watch'?'pause':'delete',id:button.dataset.watch});render();
        if(action==='check-watch'){toast('Checking the page.');setTimeout(()=>refreshWatches(),1500);}
      }
      if(action==='read-update'){watchState=await api('/api/watch/action',{action:'read',id:button.dataset.update});render();}
      if(action==='save-update'){
        const update=watchState.updates.find(u=>u.id===button.dataset.update);if(!update)return;
        const existing=data.items.find(i=>safeUrl(i.url)===safeUrl(update.url));
        if(existing){toast('This page is already in your Library. Its new content is preserved in Updates.');return;}
        button.disabled=true;const analyzed=await GatherAnalysis.enrich(update.url);await GatherStore.save({...analyzed,note:update.summary,status:'inbox',favorite:false});data=await GatherStore.read();toast('Update saved to Library.');button.disabled=false;
      }
    }catch(error){toast(error.message);button.disabled=false;}
  });
  el('canvas-mode').onclick=()=>{libraryMode='canvas';localStorage.setItem('gather-library-mode',libraryMode);render();};
  el('cover-mode').onclick=()=>{libraryMode='cover';selected=null;localStorage.setItem('gather-library-mode',libraryMode);render();};
  el('list-mode').onclick=()=>{libraryMode='list';localStorage.setItem('gather-library-mode',libraryMode);render();};
  el('topic-filter').onchange=e=>{topic=e.target.value;selected=null;render();fitAll();};
  el('thumbnail-size').onchange=e=>{thumbnailSize=e.target.value;localStorage.setItem('gather-thumbnail-size',thumbnailSize);el('library-list').dataset.thumbnailSize=thumbnailSize;};
  el('library-sort').onchange=e=>{librarySort=e.target.value;render();};
  el('workflow-form').onsubmit=async e=>{
    e.preventDefault();const name=el('workflow-name').value.trim();if(!name)return;
    try{const value=GatherWorkflows.create(name);data.workflows ||= [];data.workflows.push(value);activeWorkflow=value.id;if(pendingItem){GatherWorkflows.addNode(value,data.items.find(i=>i.id===pendingItem));pendingItem=null;}await persist();el('workflow-dialog').close();section='ideation';render();}catch(error){toast(error.message);}
  };
  el('node-form').onsubmit=async e=>{
    e.preventDefault();const current=workflow(),title=el('node-title').value.trim(),purpose=el('node-purpose').value.trim();if(!current||!title)return;
    try{const node=current.nodes.find(n=>n.id===el('node-id').value);if(node)Object.assign(node,{title,purpose});else GatherWorkflows.addNode(current,null,title,purpose);await persist();el('node-dialog').close();render();}catch(error){toast(error.message);}
  };
  el('edge-form').onsubmit=async e=>{
    e.preventDefault();try{GatherWorkflows.connect(workflow(),el('edge-from').value,el('edge-to').value,el('edge-label').value);await persist();el('edge-dialog').close();render();}catch(error){el('edge-error').textContent=error.message;}
  };
  el('watch-form').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button[type=submit],button.primary');
    try{
      const url=GatherStore.normalizeUrl(el('watch-url').value);
      // Optional access is needed only for an installed extension to talk to its local watcher.
      const permission=GatherStore.extension?chrome.permissions.request({origins:['http://127.0.0.1/*']}):Promise.resolve(true);
      button.disabled=true;button.textContent='Starting watch…';await permission;
      watchState=await api('/api/watch/create',{url,keywords:el('watch-keywords').value,interval:Number(el('watch-interval').value)});serviceError='';el('watch-dialog').close();switchSection('watchlist');toast('Watch added. The first check sets its baseline.');
    }catch(error){el('watch-error').textContent=error.message;}finally{button.disabled=false;button.textContent='Start watching ↗';}
  };
  return {syncNavigation,renderLibrary,renderSection,primaryAction,importWorkflows:(...args)=>GatherWorkflows.import(...args),start(){refreshWatches(false);setInterval(()=>refreshWatches(),30000);}};
})();
