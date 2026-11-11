const byId=id=>document.getElementById(id);
let currentTab=null;
const ready=(async()=>{
  try{[currentTab]=await chrome.tabs.query({active:true,currentWindow:true});if(/^https?:/.test(currentTab?.url||''))byId('capture-url').value=currentTab.url;}catch{}
})();
byId('capture-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button[type="submit"]');
  let url;try{url=GatherStore.normalizeUrl(byId('capture-url').value);}catch(error){byId('capture-message').textContent=error.message;return;}
  let isCurrent=false;try{isCurrent=!!currentTab&&GatherStore.normalizeUrl(currentTab.url)===url;}catch{}
  const access=isCurrent?Promise.resolve():GatherAnalysis.requestAccess(url).catch(()=>false);
  button.disabled=true;button.textContent='Reading & organizing…';byId('capture-message').textContent='Finding the title, topic, and tags for you.';
  try{
    await ready;await access;
    const response=await chrome.runtime.sendMessage(isCurrent?{type:'gather-capture'}:{type:'gather-save',url});
    if(!response?.ok)throw new Error(response?.error||'Could not save this link.');
    const item=response.item;
    byId('capture-message').textContent=item.analysisStatus==='unavailable'?'Saved. This page could not be read; you can review it in your collection.':`Saved under ${item.category}${item.analysisStatus==='uncertain'?' — topic needs review':''}.`;
    button.textContent='Saved ✓';
  }catch(error){byId('capture-message').textContent=error.message;button.disabled=false;button.textContent='Save & organize ↗';}
});
byId('open-library').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('index.html')}));

byId('open-bookmarks').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('index.html#bookmarks')}));
