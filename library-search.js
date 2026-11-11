/* Search website identities as well as page content, with common spelling variants. */
globalThis.GatherSearch=(()=>{
  function normalize(value){
    return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(?:reditt|redditt|reddiit|redit)\b/g,'reddit')
      .replace(/\bgit\s+hub\b/g,'github').replace(/\blinked\s+in\b/g,'linkedin')
      .replace(/\byou\s+tube\b/g,'youtube').replace(/\bhugging\s*face\b/g,'huggingface')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function matches(item,query){
    let tokens=normalize(query).split(/\s+/).filter(Boolean);if(!tokens.length)return true;
    const source=GatherStore.sourceInfo(item.url);
    const requestedWebsite=websiteForQuery(query);
    if(requestedWebsite){
      if(source.website!==requestedWebsite)return false;
      const websiteToken=normalize(requestedWebsite);tokens=tokens.filter(token=>token!==websiteToken&&!['http','https','www','com'].includes(token));
    }
    const content=normalize([item.title,item.url,item.description,item.note,source.website,source.pageType,item.website,item.topic,item.category,item.status,...item.tags||[],...item.modelNames||[],...item.bookmarkFolders||[],...item.bookmarkTitles||[],...(item.pageSignals?.headings||[]),item.pageSignals?.text||''].join(' '));
    return tokens.every(token=>content.includes(token));
  }
  function websiteForQuery(query){
    const tokens=normalize(query).split(/\s+/),sites={reddit:'Reddit',github:'GitHub',linkedin:'LinkedIn',youtube:'YouTube',huggingface:'Hugging Face'};
    return Object.entries(sites).find(([token])=>tokens.includes(token))?.[1]||null;
  }
  function excerpt(item,query){
    if(!query?.trim())return '';
    const text=[...(item.pageSignals?.headings||[]),item.pageSignals?.text||''].join(' ').replace(/\s+/g,' ').trim();
    if(!text)return '';
    const website=websiteForQuery(query),tokens=normalize(query).split(' ').filter(token=>token&&token!==normalize(website));
    let folded='',positions=[];
    for(let i=0;i<text.length;i++){
      const value=text[i].normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      folded+=value;for(let n=0;n<value.length;n++)positions.push(i);
    }
    const hits=[];
    for(const token of tokens){let offset=0,index;while((index=folded.indexOf(token,offset))!==-1){hits.push([positions[index],positions[index+token.length-1]+1]);offset=index+token.length;if(hits.length>100)break;}}
    if(!hits.length)return '';
    hits.sort((a,b)=>a[0]-b[0]);const start=Math.max(0,hits[0][0]-75),end=Math.min(text.length,start+260);
    const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let result=start?'…':'',cursor=start;
    for(const [a,b]of hits){if(a<cursor||a>=end)continue;result+=escape(text.slice(cursor,a))+'<mark>'+escape(text.slice(a,Math.min(b,end)))+'</mark>';cursor=Math.min(b,end);}
    return result+escape(text.slice(cursor,end))+(end<text.length?'…':'');
  }
  function resultExcerpt(item,query){const value=excerpt(item,query);return value?`<span class="search-excerpt"><b>From saved page</b>${value}</span>`:'';}
  return {normalize,matches,websiteForQuery,excerpt,resultExcerpt};
})();
