const $ = id => document.getElementById(id);
const categories = ['Uncategorized','Coding','Design','Video & Audio','Research','Productivity','Inspiration'];
const colors = ['#ef4b24','#ffe329','#dc8ec3','#5899b7','#a7ac45','#00a99b','#b4c8da'];
const palettes = [['#ef4b24','#161714'],['#ffe329','#161714'],['#dc8ec3','#161714'],['#5899b7','#161714'],['#a7ac45','#161714'],['#00a99b','#161714'],['#b4c8da','#161714']];
let data, view='all', category='All', query='', activeBoard=null, pendingDelete=null, selected=null;
let section='library',libraryMode=localStorage.getItem('gather-library-mode')||'canvas',website='All',topic='All',librarySort='newest';
let camera={x:100,y:130,scale:1}, tool='select', spaceDown=false, gesture=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=value=>{try{return GatherStore.normalizeUrl(value);}catch{return '';}};
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}};
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
async function persist(){await GatherStore.write(data);}
function matches(item){return (website==='All'||GatherStore.sourceInfo(item.url).website===website)&&(topic==='All'||(item.topic||item.category)===topic)&&(category==='All'||item.category===category)&&GatherSearch.matches(item,query);}
function filtered(){return data.items.filter(i=>matches(i)&&(view!=='inbox'||i.status==='inbox')&&(view!=='favorites'||i.favorite)&&(!activeBoard||data.boards.find(b=>b.id===activeBoard)?.cards.some(c=>c.itemId===i.id)));}
function getPosition(item,index){
  if(activeBoard){const board=data.boards.find(b=>b.id===activeBoard);return board.cards.find(c=>c.itemId===item.id);}
  data.canvas ||= {};
  if(!data.canvas[item.id]){
    let slot=Object.keys(data.canvas).length,position;
    do{position={x:(slot%3)*355,y:Math.floor(slot/3)*300,w:320};slot++;}
    while(Object.values(data.canvas).some(p=>position.x<p.x+(p.w||320)+15&&position.x+335>p.x&&position.y<p.y+(p.w||320)/1.6+75&&position.y+275>p.y));
    data.canvas[item.id]=position;
  }
  return data.canvas[item.id];
}
function categoryArtwork(category){
  const drawings = {
    'Uncategorized':'<path d="M80 11 91 51 125 27 107 64 149 70 111 87 140 119 100 109 94 151 76 115 44 141 53 101 11 99 47 79 20 47 61 55Z"/>',
    'Coding':'<rect x="18" y="27" width="127" height="102" rx="3" fill="none" stroke="currentColor" stroke-width="9"/><path d="M19 50h126" fill="none" stroke="currentColor" stroke-width="7"/><circle cx="31" cy="38" r="3"/><circle cx="42" cy="38" r="3"/><path d="m62 69-20 19 20 18m39-37 20 19-20 18m-12-43-13 49" fill="none" stroke="currentColor" stroke-width="9"/>',
    'Design':'<path d="M20 18h57v57H20zm62 62h57v57H82z"/><circle cx="110" cy="46" r="28"/><path d="M17 138 47 82l30 56Z"/>',
    'Video & Audio':'<path d="M22 35v93l34-17V18zm53-8v93l34 17V44zm53 9v93l14-8V28Z"/><path d="M7 80h148" stroke="currentColor" stroke-width="6"/>',
    'Research':'<circle cx="74" cy="70" r="43" fill="none" stroke="currentColor" stroke-width="13"/><path d="m108 106 35 36" stroke="currentColor" stroke-width="18"/><path d="M74 44v52M48 70h52" fill="none" stroke="currentColor" stroke-width="7"/>',
    'Productivity':'<rect x="18" y="93" width="34" height="48"/><rect x="61" y="59" width="34" height="82"/><rect x="104" y="18" width="34" height="123"/><path d="m15 61 40-40 23 24 37-36" fill="none" stroke="currentColor" stroke-width="8"/>',
    'Inspiration':'<path d="M80 20C50-14 12 25 43 55 1 44-6 99 39 101 10 132 50 163 76 126 90 170 141 147 119 113 164 122 174 66 128 61 161 29 118-2 96 32Z"/><circle cx="81" cy="79" r="18" fill="var(--tile-bg)"/>'
  };
  return `<svg class="poster-symbol" viewBox="0 0 160 160" aria-hidden="true" focusable="false">${drawings[category]||drawings.Uncategorized}</svg>`;
}
function card(item,index){
  const pos=getPosition(item,data.items.indexOf(item)), palette=palettes[Math.max(0,categories.indexOf(item.category))%palettes.length];
  const width=Number.isFinite(pos.w)?Math.max(220,Math.min(680,pos.w)):320;
  return `<article class="canvas-card ${selected===item.id?'selected':''}" data-id="${esc(item.id)}" tabindex="0" aria-label="${esc(item.title)} — drag to move, Enter for details" style="left:${pos.x}px;top:${pos.y}px;width:${width}px;--tile-bg:${palette[0]};--tile-accent:${palette[1]}"><div class="tile-preview"><div class="poster-topline"><span class="preview-domain">${esc(host(item.url))}</span><span class="poster-number">${String(data.items.indexOf(item)+1).padStart(2,'0')}</span></div>${item.screenshot&&/^data:image\/(jpeg|png|webp);base64,/.test(item.screenshot)?`<img class="capture-thumbnail" src="${esc(item.screenshot)}" alt="Captured page">`:''}<div class="preview-art ${item.screenshot?'has-capture':''}"><strong title="${esc(item.title)}">${esc(item.title)}</strong>${categoryArtwork(item.category)}</div><span class="preview-type">${esc(GatherStore.sourceInfo(item.url).website)} / ${esc(item.topic||item.category)}</span><button class="tile-favorite ${item.favorite?'is-favorite':''}" data-action="favorite" aria-label="${item.favorite?'Remove from':'Add to'} favorites">${item.favorite?'★':'☆'}</button></div><div class="tile-caption"><div><span class="tile-title">${esc(item.screenshot?item.title:item.description||item.note||'A good find. Saved for later.')}</span><span class="tile-host">${esc(host(item.url))}</span></div><a class="open-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(item.title)}">↗</a></div><button class="resize-handle" aria-label="Resize ${esc(item.title)}" title="Drag to resize; arrow keys also resize"></button></article>`;
}
function applyCamera(){
  $('world').style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
  $('stage').style.backgroundSize=`${24*camera.scale}px ${24*camera.scale}px`;
  $('stage').style.backgroundPosition=`${camera.x}px ${camera.y}px`;
  $('zoom-level').textContent=Math.round(camera.scale*100)+'%';
}
function render(){
  GatherWorkspace.syncNavigation();
  if(section!=='library'){GatherWorkspace.renderSection();return;}
  if(activeBoard&&!data.boards.some(b=>b.id===activeBoard))activeBoard=null;
  const board=data.boards.find(b=>b.id===activeBoard);
  const name=board?.name||({all:'All saves',inbox:'Inbox',favorites:'Favorites',boards:'Project boards'})[view];
  $('workspace-toggle').innerHTML=`${esc(name)} <span>⌄</span>`;
  $('workspace-toggle').setAttribute('aria-expanded',!$('workspace-panel').hidden);
  $('settings-toggle').setAttribute('aria-expanded',!$('settings-panel').hidden);
  $('all-count').textContent=data.items.length;$('inbox-count').textContent=data.items.filter(i=>i.status==='inbox').length;
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view&&!activeBoard));
  $('category-nav').innerHTML=['All',...[...new Set(data.items.map(i=>GatherStore.sourceInfo(i.url).website))].sort()].map(c=>`<button class="nav-item ${website===c?'active':''}" data-website="${esc(c)}">${esc(c==='All'?'All websites':c)}</button>`).join('');
  $('board-nav').innerHTML=data.boards.map(b=>`<button class="nav-item ${activeBoard===b.id?'active':''}" data-board="${esc(b.id)}">◫ &nbsp; ${esc(b.name)}<small>${b.cards.length}</small></button>`).join('')||'<p class="panel-note">No boards yet. Start one with +.</p>';
  $('canvas-name').textContent=website==='All'?name:website;
  const items=filtered(), isBoardList=view==='boards'&&!activeBoard;
  $('results-count').textContent=isBoardList?'':`${items.length} ${items.length===1?'link':'links'}`;
  $('stage-count').textContent=isBoardList?`${data.boards.length} boards`:`${items.length} ${items.length===1?'link':'links'}`;
  $('canvas-subtitle').textContent=board?'Your references. Your arrangement.':isBoardList?'Give an idea a canvas of its own.':query?`Search results for “${query}”`:'A little space for everything worth keeping.';
  $('world').hidden=isBoardList;$('boards').hidden=!isBoardList;
  $('empty-state').hidden=true;
  if(isBoardList){renderBoards();}else{
    $('world').innerHTML=items.map(card).join('');
    if(!items.length){$('empty-state').hidden=false;$('empty-state').innerHTML=`<div class="empty-mark">⌑</div><h1>${query||category!=='All'?'Nothing here. Yet.':board?'Give this idea some references.':'Your internet, spread out.'}</h1><p>${query||category!=='All'?'Try another search or category.':board?'Add links from your collection to start arranging.':'Keep the links that catch your eye. Make space to connect them.'}</p><div class="empty-actions">${board?boardAdder(board):'<button class="primary" data-action="add">＋ Save a link</button>'}${!data.items.length?'<button class="secondary" data-action="demo">Explore example canvas ↗</button>':''}</div>`;}
    setupCards();
  }
  $('arrange').disabled=isBoardList;$('fit-view').disabled=isBoardList;
  GatherWorkspace.renderLibrary();
  applyCamera();renderInspector();
  // Put a board's management controls beside the canvas title.
  const old=$('board-controls');if(old)old.remove();
  if(board){const el=document.createElement('div');el.id='board-controls';el.innerHTML=`<button class="quiet-button" data-action="board-add-menu">＋ Add from collection</button><button class="quiet-button" data-action="delete-board" title="Delete board">···</button>`;document.querySelector('.canvas-caption').append(el);}
}
function boardAdder(board){return `<select id="board-item" aria-label="Choose a saved link"><option value="">Choose a save…</option>${data.items.filter(i=>!board.cards.some(c=>c.itemId===i.id)).map(i=>`<option value="${esc(i.id)}">${esc(i.title)}</option>`).join('')}</select><button class="primary" data-action="pin">Add to board</button>`;}
function renderBoards(){
  $('boards').innerHTML=`<div class="board-list-heading"><button class="primary" data-action="new-board">＋ New board</button></div><div class="board-grid">${data.boards.filter(b=>!query||b.name.toLowerCase().includes(query)).map(b=>`<button class="board-tile" data-board="${esc(b.id)}"><div class="board-miniature"><span></span><span></span><span></span></div><h2>${esc(b.name)}</h2><p>${b.cards.length} links <span>↗</span></p></button>`).join('')}</div>${!data.boards.length?'<div class="board-empty"><h2>A blank canvas. A new idea.</h2><p>Create a board to collect the links that belong together.</p></div>':''}`;
}
function renderInspector(){
  const item=data.items.find(i=>i.id===selected);$('inspector').hidden=!item;if(!item)return;
  $('inspector').innerHTML=`<div class="inspector-head"><span>LINK DETAILS</span><button class="icon-button" data-action="deselect" aria-label="Close details">×</button></div><span class="detail-category">${esc(GatherStore.sourceInfo(item.url).website)} / ${esc(item.topic||item.category)}</span><p class="analysis-credit">${esc(GatherStore.sourceInfo(item.url).pageType)}</p>${item.modelNames?.length?`<div class="model-names">${item.modelNames.map(name=>`<span class="model-chip">${esc(name)}</span>`).join('')}</div>`:''}<h2>${esc(item.title)}</h2><a class="detail-url" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(host(item.url))} ↗</a><p class="detail-description">${esc(item.description||'No description yet.')}</p>${item.analysisStatus==='unavailable'?'<p class="analysis-notice">Page could not be read. Link saved; details need review.</p>':item.analysisStatus==='uncertain'?'<p class="analysis-notice">Topic unclear. Kept in Uncategorized for review.</p>':item.analysisStatus==='complete'?'<p class="analysis-credit">Automatically organized from page content.</p>':''}${GatherSearch.resultExcerpt(item,query)}<div class="detail-label">YOUR NOTE</div><p class="detail-note">${esc(item.note||'Add a note to remember why you saved this.')}</p><div class="detail-tags">${(item.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="detail-meta"><span>Status</span><strong>${esc(({inbox:'Inbox',try:'To try',tried:'Tried',useful:'Useful',archived:'Archived'})[item.status]||'Inbox')}</strong></div>${safeUrl(item.source)?`<a class="detail-url" href="${esc(safeUrl(item.source))}" target="_blank" rel="noopener noreferrer">Original source post ↗</a>`:''}<div class="detail-actions" data-id="${esc(item.id)}"><button class="secondary" data-action="edit">Edit link & notes</button><button class="quiet-button" data-workspace-action="watch-item" data-item="${esc(item.id)}">◉ Watch this page</button><button class="quiet-button" data-workspace-action="ideate-item" data-item="${esc(item.id)}">↗ Use in a workflow</button><button class="quiet-button" data-action="reanalyze">↻ Read page again</button><button class="quiet-button" data-action="favorite">${item.favorite?'★ Favorited':'☆ Add to favorites'}</button>${activeBoard?'<button class="quiet-button" data-action="unpin">Remove from board</button>':''}<button class="quiet-button delete-link" data-action="delete">Delete link</button></div>`;
}
function selectCard(id){selected=id;document.querySelectorAll('.canvas-card').forEach(el=>el.classList.toggle('selected',el.dataset.id===id));renderInspector();}
function openSave(item){
  $('save-form').reset();$('save-id').value=item?.id||'';$('dialog-title').textContent=item?'Edit link':'Save a link';
  for(const name of ['url','title','description','note','source'])$(`save-${name}`).value=item?.[name]||'';
  $('manual-fields').hidden=!item;$('save-title').required=!!item;$('save-progress').textContent=item?'You can adjust any of the automatically filled details.':'Paste a link. Gather will read the page and organize it for you.';$('save-form').querySelector('button[type=submit]').textContent=item?'Save changes ↗':'Save & organize ↗';
  $('save-topic').value=item?.topic||item?.category||'';$('save-category').value=item?.category||'Uncategorized';$('save-status').value=item?.status||'inbox';$('save-tags').value=item?.tags?.join(', ')||'';$('save-dialog').showModal();
}
function setupCards(){
  document.querySelectorAll('.canvas-card').forEach(el=>{
    const item=data.items.find(i=>i.id===el.dataset.id),pos=getPosition(item,data.items.indexOf(item));
    el.addEventListener('keydown',async e=>{if(e.target!==el&&!e.target.matches('.resize-handle'))return;if(e.key==='Enter'){selectCard(item.id);return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();if(e.target.matches('.resize-handle')){pos.w=Math.min(680,Math.max(220,(pos.w||320)+delta[0]*20-delta[1]*20));el.style.width=pos.w+'px';}else{pos.x+=delta[0]*(e.shiftKey?30:10);pos.y+=delta[1]*(e.shiftKey?30:10);el.style.left=pos.x+'px';el.style.top=pos.y+'px';}try{await persist();}catch(error){toast(error.message);}});
    el.addEventListener('pointerdown',e=>{
      if(tool==='pan'||spaceDown||e.button!==0||e.target.closest('a,button:not(.resize-handle)'))return;
      e.preventDefault();e.stopPropagation();selectCard(item.id);gesture=true;
      const resizing=!!e.target.closest('.resize-handle'),start={x:e.clientX,y:e.clientY,left:pos.x,top:pos.y,w:pos.w||320};
      el.setPointerCapture(e.pointerId);el.classList.add('moving');
      const move=event=>{if(resizing){pos.w=Math.max(220,Math.min(680,start.w+(event.clientX-start.x)/camera.scale));el.style.width=pos.w+'px';}else{pos.x=start.left+(event.clientX-start.x)/camera.scale;pos.y=start.top+(event.clientY-start.y)/camera.scale;el.style.left=pos.x+'px';el.style.top=pos.y+'px';}};
      const stop=async()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',stop);el.removeEventListener('pointercancel',stop);el.classList.remove('moving');try{await persist();}catch(error){toast(error.message);}finally{gesture=false;}};
      el.addEventListener('pointermove',move);el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
    });
    el.addEventListener('dblclick',e=>{if(!e.target.closest('a,button'))openSave(item);});
  });
}
function setTool(value){tool=value;$('select-tool').classList.toggle('active',value==='select');$('pan-tool').classList.toggle('active',value==='pan');$('stage').classList.toggle('pan-mode',value==='pan');}
function zoomTo(scale,px=$('stage').clientWidth/2,py=$('stage').clientHeight/2){const next=Math.max(.2,Math.min(2.5,scale)),ratio=next/camera.scale;camera.x=px-(px-camera.x)*ratio;camera.y=py-(py-camera.y)*ratio;camera.scale=next;applyCamera();}
function fitAll(){
  const items=filtered();if(!items.length)return;
  const positions=items.map(i=>getPosition(i,data.items.indexOf(i)));
  const minX=Math.min(...positions.map(p=>p.x)),minY=Math.min(...positions.map(p=>p.y)),maxX=Math.max(...positions.map(p=>p.x+(p.w||320))),maxY=Math.max(...positions.map(p=>p.y+(p.w||320)*.74));
  const w=$('stage').clientWidth-(selected?350:0),h=$('stage').clientHeight;
  camera.scale=Math.max(.2,Math.min(1.2,(w-150)/(maxX-minX),(h-220)/(maxY-minY)));
  camera.x=(w-(maxX-minX)*camera.scale)/2-minX*camera.scale;camera.y=110+(h-180-(maxY-minY)*camera.scale)/2-minY*camera.scale;applyCamera();
}
$('stage').addEventListener('wheel',e=>{if(section!=='library'||libraryMode!=='canvas'||view==='boards'&&!activeBoard)return;e.preventDefault();const rect=$('stage').getBoundingClientRect();zoomTo(camera.scale*Math.exp(-e.deltaY*.0015),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
$('stage').addEventListener('pointerdown',e=>{
  if(section!=='library'||libraryMode!=='canvas'||e.target.closest('button,a,input,select')||(view==='boards'&&!activeBoard))return;
  if(e.target.closest('.canvas-card')&&tool!=='pan'&&!spaceDown&&e.button!==1)return;
  if(e.button!==0&&e.button!==1)return;
  e.preventDefault();if(!e.target.closest('.canvas-card')&&!spaceDown&&tool!=='pan')selectCard(null);
  const start={x:e.clientX,y:e.clientY,left:camera.x,top:camera.y};$('stage').setPointerCapture(e.pointerId);$('stage').classList.add('panning');
  const move=event=>{camera.x=start.left+event.clientX-start.x;camera.y=start.top+event.clientY-start.y;applyCamera();};
  const stop=()=>{$('stage').removeEventListener('pointermove',move);$('stage').removeEventListener('pointerup',stop);$('stage').removeEventListener('pointercancel',stop);$('stage').classList.remove('panning');};
  $('stage').addEventListener('pointermove',move);$('stage').addEventListener('pointerup',stop);$('stage').addEventListener('pointercancel',stop);
});
$('select-tool').onclick=()=>setTool('select');$('pan-tool').onclick=()=>setTool('pan');$('zoom-in').onclick=()=>zoomTo(camera.scale*1.2);$('zoom-out').onclick=()=>zoomTo(camera.scale/1.2);$('zoom-level').onclick=()=>zoomTo(1);$('fit-view').onclick=fitAll;
$('arrange').onclick=async()=>{filtered().forEach((item,index)=>{const pos=getPosition(item,data.items.indexOf(item));pos.x=(index%3)*355;pos.y=Math.floor(index/3)*285;pos.w=320;});try{await persist();render();fitAll();toast('Visible links arranged.');}catch(error){toast(error.message);}};
$('workspace-toggle').onclick=()=>{$('workspace-panel').hidden=!$('workspace-panel').hidden;$('workspace-toggle').setAttribute('aria-expanded',!$('workspace-panel').hidden);$('settings-panel').hidden=true;};
$('settings-toggle').onclick=()=>{$('settings-panel').hidden=!$('settings-panel').hidden;$('settings-toggle').setAttribute('aria-expanded',!$('settings-panel').hidden);$('workspace-panel').hidden=true;};
$('focus-mode').onclick=()=>document.body.classList.toggle('focus-mode');
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(section!=='library')return;
  if(e.code==='Space'){e.preventDefault();spaceDown=true;$('stage').classList.add('pan-mode');}
  if(e.key.toLowerCase()==='v')setTool('select');if(e.key.toLowerCase()==='h')setTool('pan');if(e.key.toLowerCase()==='f')fitAll();
  if(e.key==='Escape'){selectCard(null);$('workspace-panel').hidden=true;$('settings-panel').hidden=true;document.body.classList.remove('focus-mode');}
  if(e.key==='Tab'&&(document.body.classList.contains('focus-mode')||!e.target.closest('button,a,[tabindex]'))){e.preventDefault();document.body.classList.toggle('focus-mode');}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;$('stage').classList.toggle('pan-mode',tool==='pan');}});
window.addEventListener('blur',()=>{spaceDown=false;$('stage').classList.toggle('pan-mode',tool==='pan');});

document.addEventListener('click',async event=>{
  const button=event.target.closest('button'); if(!button)return;
  if(button.dataset.close) { $(button.dataset.close).close(); return; }
  if(button.dataset.view) {view=button.dataset.view;category='All';activeBoard=null;selected=null;$('workspace-panel').hidden=true;render();return;}
  if(button.dataset.category) {category=button.dataset.category;if(view==='boards'&&!activeBoard)view='all';$('workspace-panel').hidden=true;render();return;}
  if(button.dataset.board) {activeBoard=button.dataset.board;view='boards';category='All';selected=null;$('workspace-panel').hidden=true;render();fitAll();return;}
  const action=button.dataset.action, id=button.closest('[data-id]')?.dataset.id;
  const item=data.items.find(i=>i.id===id);
  try {
    if(action==='deselect')selectCard(null);
    if(action==='reanalyze'&&item){button.disabled=true;button.textContent='Reading…';await GatherAnalysis.requestAccess(item.url).catch(()=>false);const analyzed=await GatherAnalysis.enrich(item.url);await GatherStore.save({...item,...analyzed});data=await GatherStore.read();render();toast(analyzed.analysisStatus==='complete'?'Details refreshed.':'Saved; page details still need review.');}
    if(action==='board-add-menu'){ $('board-links').innerHTML=boardAdder(data.boards.find(b=>b.id===activeBoard));$('board-add-dialog').showModal(); }
    if(action==='favorite' && item){item.favorite=!item.favorite;await persist();render();}
    if(action==='edit' && item)openSave(item);
    if(action==='delete' && item){pendingDelete={type:'item',id};$('confirm-title').textContent='Delete this save?';$('confirm-form').querySelector('p').textContent='This removes it from your collection and project boards.';$('confirm-dialog').showModal();}
    if(action==='add')openSave();
    if(action==='demo')await loadDemo();
    if(action==='new-board'){$('board-form').reset();$('board-dialog').showModal();}
    if(action==='back-boards'){activeBoard=null;render();}
    if(action==='pin'){
      const itemId=$('board-item').value;if(!itemId)return;
      const board=data.boards.find(b=>b.id===activeBoard),n=board.cards.length;
      board.cards.push({itemId,x:30+(n%3)*355,y:30+Math.floor(n/3)*285,w:320});await persist();$('board-add-dialog').close();render();toast('Added to your board.');
    }
    if(action==='unpin'){const board=data.boards.find(b=>b.id===activeBoard);board.cards=board.cards.filter(c=>c.itemId!==id);await persist();render();}
    if(action==='delete-board'){pendingDelete={type:'board',id:activeBoard};$('confirm-title').textContent='Delete this board?';$('confirm-form').querySelector('p').textContent='Your saved links will stay in your collection.';$('confirm-dialog').showModal();}
  }catch(error){toast(error.message);}
});
$('save-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.target.querySelector('button[type=submit]'),editing=!!$('save-id').value;
  let url;try{url=GatherStore.normalizeUrl($('save-url').value);}catch(error){$('save-progress').textContent=error.message;return;}
  if(!editing&&data.items.some(i=>safeUrl(i.url)===url)){$('save-progress').textContent='This link is already in your collection.';return;}
  const access=!editing?GatherAnalysis.requestAccess(url).catch(()=>false):Promise.resolve();
  button.disabled=true;button.textContent=editing?'Saving…':'Reading & organizing…';$('save-dialog').setAttribute('aria-busy','true');
  $('save-progress').textContent=editing?'Saving your changes…':'Reading the page and finding its topic, category, and tags…';
  try{
    await access;let item;
    if(editing){
      item={id:$('save-id').value,tags:$('save-tags').value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,20)};
      for(const name of ['url','title','description','note','source','category','status','topic'])item[name]=$(`save-${name}`).value.trim();
      if(!item.title)throw new Error('Please give your link a title.');if(item.source)GatherStore.normalizeUrl(item.source);
      // Manual edits resolve a low-confidence category without discarding other fields.
      item.analysisStatus='reviewed';item.topic ||= item.category;item.topicMethod='manual';item.topicVersion=GatherAnalysis.topicVersion;
    }else item={...await GatherAnalysis.enrich(url),status:'inbox',note:'',source:'',favorite:false};
    const saved=await GatherStore.save(item);data=await GatherStore.read();
    if(!editing&&activeBoard){const board=data.boards.find(b=>b.id===activeBoard);if(board){const n=board.cards.length;board.cards.push({itemId:saved.id,x:(n%3)*355,y:Math.floor(n/3)*300,w:320});await persist();}}
    $('save-dialog').close();category='All';if(view==='favorites')view='all';selected=saved.id;render();fitAll();
    toast(editing?'Changes saved.':saved.analysisStatus==='unavailable'?'Link saved. Page could not be read — details need review.':saved.analysisStatus==='uncertain'?'Saved. The category needs a quick review.':`Saved & organized under ${saved.category}.`);
  }catch(error){$('save-progress').textContent=error.message;}
  finally{button.disabled=false;button.textContent=editing?'Save changes ↗':'Save & organize ↗';$('save-dialog').removeAttribute('aria-busy');}
});
$('confirm-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(pendingDelete?.type==='item'){data.items=data.items.filter(i=>i.id!==pendingDelete.id);if(data.canvas)delete data.canvas[pendingDelete.id];if(selected===pendingDelete.id)selected=null;data.boards.forEach(b=>b.cards=b.cards.filter(c=>c.itemId!==pendingDelete.id));data.workflows?.forEach(w=>w.nodes.forEach(n=>{if(n.itemId===pendingDelete.id)n.itemId=null;}));}
  if(pendingDelete?.type==='board'){data.boards=data.boards.filter(b=>b.id!==pendingDelete.id);activeBoard=null;}
  try{await persist();$('confirm-dialog').close();render();toast('Removed from your collection.');}catch(error){toast(error.message);}
});
$('board-form').addEventListener('submit',async event=>{
  event.preventDefault();const name=$('board-name').value.trim();if(!name)return;
  const board={id:crypto.randomUUID(),name,cards:[]};data.boards.push(board);activeBoard=board.id;view='boards';selected=null;category='All';
  try{await persist();$('board-dialog').close();render();}catch(error){toast(error.message);}
});
$('add-button').onclick=()=>{if(section==='library')openSave();else GatherWorkspace.primaryAction();};$('extension-help').onclick=()=>$('help-dialog').showModal();
$('search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();selected=null;if(section==='library'&&GatherSearch.websiteForQuery(query)){website='All';topic='All';category='All';view='all';activeBoard=null;}render();if(section==='library'&&libraryMode==='canvas')fitAll();});
document.addEventListener('keydown',event=>{if(event.key==='/' && !event.target.matches('input,textarea,select') && !document.querySelector('dialog[open]')){event.preventDefault();$('search').focus();}});
$('export-button').onclick=async()=>{data=await GatherStore.read();const url=URL.createObjectURL(new Blob([GatherArchive.serialize(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`gather-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Exported ${data.items.length} links and ${data.items.filter(item=>item.screenshot).length} embedded screenshots.`);};
$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{
  try{
    const file=event.target.files[0];if(!file)return;if(file.size>500000000)throw new Error('Choose a backup smaller than 500 MB.');
    const incoming=JSON.parse(await file.text());if(incoming.version!==1 || !Array.isArray(incoming.items) || !Array.isArray(incoming.boards))throw new Error('This does not look like a Gather backup.');
    const merged=structuredClone(data),idMap=new Map();let count=0,restoredScreenshots=0;
    for(const item of incoming.items){
      if(typeof item.id!=='string'||typeof item.title!=='string'||!item.title.trim()||!safeUrl(item.url))throw new Error('The backup contains an invalid save.');
      const duplicate=merged.items.find(i=>safeUrl(i.url)===safeUrl(item.url));
      if(duplicate){idMap.set(item.id,duplicate.id);if(!duplicate.screenshot&&GatherArchive.screenshot(item.screenshot)){duplicate.screenshot=item.screenshot;duplicate.capturedAt=item.capturedAt;restoredScreenshots++;}if(!duplicate.pageSignals?.text&&item.pageSignals?.text)duplicate.pageSignals={text:String(item.pageSignals.text).slice(0,12000),headings:Array.isArray(item.pageSignals.headings)?item.pageSignals.headings.filter(h=>typeof h==='string').slice(0,12):[]};continue;}
      const id=crypto.randomUUID();idMap.set(item.id,id);
      merged.items.push({id,bookmarkTitles:Array.isArray(item.bookmarkTitles)?item.bookmarkTitles.filter(t=>typeof t==='string').slice(0,100).map(t=>t.slice(0,160)):[],bookmarkFolders:Array.isArray(item.bookmarkFolders)?item.bookmarkFolders.filter(f=>typeof f==='string').slice(0,100).map(f=>f.slice(0,1000)):[],bookmarkImportedAt:typeof item.bookmarkImportedAt==='string'?item.bookmarkImportedAt:undefined,topicMethod:['manual','automatic'].includes(item.topicMethod)?item.topicMethod:undefined,topicVersion:Number.isFinite(item.topicVersion)?item.topicVersion:undefined,modelNames:Array.isArray(item.modelNames)?item.modelNames.filter(n=>typeof n==='string').slice(0,8).map(n=>n.slice(0,80)):[],pageSignals:item.pageSignals&&typeof item.pageSignals==='object'?{text:String(item.pageSignals.text||'').slice(0,12000),headings:Array.isArray(item.pageSignals.headings)?item.pageSignals.headings.filter(h=>typeof h==='string').slice(0,12).map(h=>h.slice(0,300)):[]}:undefined,topic:String(item.topic||item.category||'Uncategorized').slice(0,100),analysisStatus:['complete','uncertain','unavailable','reviewed'].includes(item.analysisStatus)?item.analysisStatus:undefined,screenshot:GatherArchive.screenshot(item.screenshot)?item.screenshot:undefined,capturedAt:typeof item.capturedAt==='string'?item.capturedAt:undefined,url:safeUrl(item.url),title:item.title.slice(0,160),description:String(item.description||'').slice(0,1000),note:String(item.note||'').slice(0,2000),source:safeUrl(item.source),category:categories.includes(item.category)?item.category:'Uncategorized',tags:Array.isArray(item.tags)?item.tags.filter(t=>typeof t==='string').slice(0,20):[],status:['inbox','try','tried','useful','archived'].includes(item.status)?item.status:'inbox',favorite:!!item.favorite,createdAt:Number.isFinite(Date.parse(item.createdAt))?item.createdAt:new Date().toISOString()});count++;
    }
    if(incoming.canvas && typeof incoming.canvas==='object'){merged.canvas ||= {};for(const [oldId,p] of Object.entries(incoming.canvas)){const id=idMap.get(oldId);if(id&&!merged.canvas[id]&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y))merged.canvas[id]={x:Math.max(-100000,Math.min(100000,p.x)),y:Math.max(-100000,Math.min(100000,p.y)),w:Number.isFinite(p.w)?Math.max(220,Math.min(680,p.w)):320};}}
    for(const board of incoming.boards){if(typeof board.name!=='string'||!Array.isArray(board.cards))throw new Error('The backup contains an invalid board.');const cards=board.cards.filter(c=>idMap.has(c.itemId)).map(c=>({itemId:idMap.get(c.itemId),x:Number.isFinite(c.x)?Math.max(-100000,Math.min(100000,c.x)):30,y:Number.isFinite(c.y)?Math.max(-100000,Math.min(100000,c.y)):30,w:Number.isFinite(c.w)?Math.max(220,Math.min(680,c.w)):320}));if(!merged.boards.some(b=>b.name===board.name&&JSON.stringify(b.cards)===JSON.stringify(cards)))merged.boards.push({id:crypto.randomUUID(),name:board.name.slice(0,80),cards});}
    GatherWorkspace.importWorkflows(incoming,merged,idMap);
    await GatherStore.write(merged);data=merged;render();toast(`Imported ${count} saves${restoredScreenshots?`; restored ${restoredScreenshots} missing screenshots`:""}. Existing links kept.`);
  }catch(error){toast(error.message);}finally{event.target.value='';}
};
async function loadDemo(){
  const examples=[
    ['Claude','https://claude.ai','Coding','An AI workspace for thinking through ideas, writing, and code.','Try for planning my next side project.',['ai','assistant'],'try'],
    ['Are.na','https://www.are.na','Inspiration','Collect references and connect ideas in a quiet corner of the web.','Love the way collections can tell a story.',['references','creative'],'useful'],
    ['Excalidraw','https://excalidraw.com','Design','A simple canvas for sketches, diagrams, and thinking out loud.','Map out the onboarding flow here.',['canvas','diagrams'],'try'],
    ['Hugging Face','https://huggingface.co','Research','Explore open models, datasets, and experiments from the community.','A starting point for exploring local models.',['models','open source'],'inbox'],
    ['Obsidian','https://obsidian.md','Productivity','A connected home for notes, ideas, and personal knowledge.','Interesting inspiration for connected notes.',['notes','knowledge'],'tried'],
    ['Blender','https://www.blender.org','Video & Audio','A creative toolkit for 3D scenes, animation, and visual experiments.','Keep for the product animation idea.',['3d','animation'],'inbox']
  ];
  for(const [title,url,category,description,note,tags,status] of examples){if(!data.items.some(i=>safeUrl(i.url)===safeUrl(url)))await GatherStore.save({title,url,category,description,note,tags,status,favorite:title==='Are.na',example:true});data=await GatherStore.read();}
  render();fitAll();toast('Example collection added. Drag tiles to make it yours.');
}
async function init(){
  $('save-category').innerHTML=categories.map(c=>`<option>${esc(c)}</option>`).join('');
  if(GatherStore.extension)chrome.storage.onChanged.addListener(async(changes,area)=>{if(area==='local' && changes['gather-library-v1']){data=await GatherStore.read();if(!gesture)render();}});
  else window.addEventListener('storage',async()=>{data=await GatherStore.read();render();});
  document.querySelector('.save-indicator').innerHTML='<i></i> '+(GatherStore.extension?'Chrome library':'Browser library');
  document.querySelector('.save-indicator').title=GatherStore.extension?'Links saved by the Chrome extension. Reloading keeps this collection.':'This browser preview has a separate collection. Open Gather from its Chrome extension popup to see extension imports.';
  if(GatherStore.extension){
    const installedId=chrome.runtime.id;
    const checkConnection=()=>{if(chrome.runtime?.id!==installedId)$('library-reconnect').hidden=false;};
    window.addEventListener('focus',checkConnection);
    document.addEventListener('visibilitychange',checkConnection);
    setInterval(checkConnection,3000);
    $('library-reload').onclick=()=>location.reload();
  }
  try{data=await GatherStore.read();render();fitAll();GatherWorkspace.start();if(GatherStore.recovered)toast('Your links were recovered from the local safety copy.');}catch(error){$('empty-state').hidden=false;$('empty-state').innerHTML='<div class="empty">Your collection could not be loaded. Keep Gather installed and check your recovery or backup copy.</div>';toast(error.message);}

}
init();
