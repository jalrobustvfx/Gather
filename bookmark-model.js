globalThis.GatherBookmarks = (() => {
  const key = 'gather-bookmark-import-v1';
  function folders(tree) {
    const result = [];
    function walk(node, path = [], depth = 0, parents = []) {
      if (node.url) return 1;
      const next = node.title ? [...path,node.title] : path;
      const entry = {id:node.id, name:node.title, path:next.join(' / '), depth, parents, count:0};
      if (node.title) result.push(entry);
      entry.count = (node.children || []).reduce((n,child)=>n+walk(child,next,depth+(node.title?1:0),node.title?[...parents,String(node.id)]:parents),0);
      return entry.count;
    }
    tree.forEach(node=>walk(node));
    return result;
  }
  function scan(tree, selected = null, selectedWebsites = null) {
    const wanted = selected === null ? null : new Set(selected.map(String));
    const links = new Map(); let unsupported = 0, duplicates = 0;
    function walk(node, path = [], included = false) {
      included ||= wanted === null || wanted.has(String(node.id));
      if (node.url) {
        if (!included) return;
        let url;
        try {
          const parsed = new URL(node.url);
          if (parsed.username || parsed.password) throw new Error('Credentials in URL');
          url = GatherStore.normalizeUrl(node.url);
        } catch {unsupported++; return;}
        const title=String(node.title||new URL(url).hostname).slice(0,160);
        const folder = path.join(' / '), existing = links.get(url);
        if (existing) {duplicates++;existing.duplicates++; if(folder&&!existing.folders.includes(folder))existing.folders.push(folder);if(!existing.titles.includes(title))existing.titles.push(title);return;}
        links.set(url,{url,title,titles:[title],duplicates:0,
          folders:folder?[folder]:[],bookmarkDate:node.dateAdded || null});
        return;
      }
      const next = node.title ? [...path,String(node.title)] : path;
      (node.children || []).forEach(child=>walk(child,next,included));
    }
    tree.forEach(node=>walk(node));
    const groups=new Map();
    for(const link of links.values()) {
      link.website=GatherStore.sourceInfo(link.url).website;
      groups.set(link.website,(groups.get(link.website)||0)+1);
    }
    const websites=[...groups].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    const allowed=selectedWebsites===null?null:new Set(selectedWebsites);
    const chosen=[...links.values()].filter(link=>allowed===null||allowed.has(link.website));
    return {links:chosen,websites,unsupported,duplicates:chosen.reduce((n,link)=>n+link.duplicates,0)};
  }
  function plan(scan, data, capture = true) {
    const existing = new Map(data.items.map(item=>[GatherStore.normalizeUrl(item.url),item]));
    const fresh = scan.links.filter(link=>!existing.has(link.url));
    const queue = capture ? scan.links.filter(link=>!existing.get(link.url)?.screenshot) : [];
    return {total:scan.links.length,newCount:fresh.length,existingCount:scan.links.length-fresh.length,
      captureCount:queue.length,unsupported:scan.unsupported,duplicates:scan.duplicates};
  }
  function blocked(page) {
    return !!page.unavailable || /^(just a moment|access denied|attention required|sign in|log in|login|security check|verify you are human|page not found|404\b)/i.test(String(page.title||'').trim()) ||
      (String(page.text||'').length<1000&&(page.headings||[]).some(heading=>/^(sign in|log in|verify you are human|access denied|page not found)\b/i.test(String(heading).trim()))) ||
      /^(checking your browser|verify (?:that )?you are human|enable javascript and cookies to continue)/i.test(String(page.text||'').trim());
  }
  return {key,folders,scan,plan,blocked};
})();
