/* Local page understanding: metadata extraction + weighted topic recognition.
   This does not execute page scripts or send content to an AI provider. */
globalThis.GatherAnalysis = (() => {
  const topics = {
    'Coding': ['developer tools','software development','code editor','coding','programming','debugging','github','javascript','typescript','python','api','sdk','developer','code generation','web development'],
    'Design': ['graphic design','ui design','ux design','design tool','design system','website builder','wireframe','mockup','prototype','figma','illustration','typography','image generation','image editor','logo','design','whiteboard','diagrams','sketch','drawing'],
    'Video & Audio': ['video generation','video editing','text to video','text to speech','music generation','voice cloning','video','audio','podcast','animation','sound','music','voice','3d'],
    'Research': ['research','scientific','research papers','dataset','datasets','machine learning','open models','ai models','local models','language models','academic','citations','search engine','literature','arxiv'],
    'Productivity': ['productivity','task management','project management','note taking','notes','calendar','scheduling','workflow automation','meeting','knowledge management','organize','automation','workspace'],
    'Inspiration': ['inspiration','moodboard','mood board','creative references','portfolio','art gallery','art collection','visual references','curation','creative ideas']
  };
  const known = { 'github.com':'Coding','stackoverflow.com':'Coding','developer.mozilla.org':'Coding','figma.com':'Design','canva.com':'Design','excalidraw.com':'Design','huggingface.co':'Research','arxiv.org':'Research','perplexity.ai':'Research','obsidian.md':'Productivity','notion.so':'Productivity','notion.com':'Productivity','are.na':'Inspiration','pinterest.com':'Inspiration','behance.net':'Inspiration','dribbble.com':'Inspiration','runwayml.com':'Video & Audio','elevenlabs.io':'Video & Audio','suno.com':'Video & Audio','blender.org':'Video & Audio' };
  const clean = text => String(text || '').replace(/\s+/g,' ').trim();
  const words = text => clean(text).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  function score(text, phrase) { return (` ${words(text)} `).includes(` ${words(phrase)} `); }
  const topicVersion=2;
  const topicRules=[
    ['Image-to-video models',/image[ -]to[ -]video|\bi2v\b|animate (?:an? |your )?(?:still |reference )?image/i],
    ['Text-to-video models',/text[ -]to[ -]video|\bt2v\b/i],
    ['Video generation models',/video generation|video model|generat\w* (?:\w+ ){0,3}videos?|hunyuanvideo|cogvideo|\bwan[ -]?2|\bmochi\b|\bltx[ -]?(?:video|2)/i],
    ['Video editing & animation',/video edit|video editor|animation software|animate|motion graphics/i],
    ['VFX & compositing',/\bvfx\b|compositing|\bnuke\b|cryptomatte|live.action plates|\baovs?\b/i],
    ['Image editing & inpainting',/image edit|photo edit|inpaint|outpaint|qwen.image.edit/i],
    ['Image upscaling',/upscal|super.resolution|image restoration/i],
    ['Background removal & segmentation',/background remov|image segmentation|segment anything|\bmatting\b/i],
    ['Text-to-image models',/text[ -]to[ -]image|\bt2i\b/i],
    ['Image generation models',/image generation|image model|diffusion model|stable diffusion|\bsdxl\b|\bflux\b|dall[ -]?e|qwen.image|generat\w* (?:\w+ ){0,3}images?/i],
    ['Depth & normal estimation',/depth estimation|normal estimation|depth prediction/i],
    ['3D reconstruction',/3d reconstruction|gaussian splat|photogrammetry|structure.from.motion/i],
    ['3D modeling & animation',/3d model|3d scene|3d animation|\bblender\b/i],
    ['Voice cloning',/voice clon|speaker clon/i],
    ['Speech generation',/text[ -]to[ -]speech|speech synthesis|\btts\b/i],
    ['Speech recognition',/speech[ -]to[ -]text|speech recognition|transcription|transcribe/i],
    ['Music generation',/music generation|generat\w* (?:\w+ ){0,3}music|\bsuno\b|\bud io\b/i],
    ['Audio editing',/audio edit|podcast edit|sound design/i],
    ['Local model runtimes',/run.{0,30}models? locally|local.{0,20}(?:model runtime|inference)|\bollama\b|\bllama.cpp\b|\blm studio\b/i],
    ['Language models & chat assistants',/language models?|\bllms?\b|chat assistant|ai assistant|\bclaude\b|\bchatgpt\b/i],
    ['Model benchmarks & comparisons',/model comparison|compar.{0,15}models|benchmark|leaderboard/i],
    ['Model libraries & hubs',/model hub|model librar|model catalog|hugging face/i],
    ['AI research papers',/research papers?|scientific papers?|\barxiv\b|academic research/i],
    ['Training datasets',/training data|\bdatasets?\b/i],
    ['Code assistants & editors',/code editor|code generation|coding assistant|code assistant|\bcursor\b|\bcopilot\b/i],
    ['Developer libraries & APIs',/\bsdk\b|\bapi\b|programming librar|developer tools|software development/i],
    ['UI design & prototyping',/ui design|ux design|wireframe|prototype|prototyping|\bfigma\b/i],
    ['Whiteboards & diagrams',/whiteboard|diagrams?|\bexcalidraw\b/i],
    ['Website builders',/website builder|web app builder|build websites/i],
    ['Notes & knowledge management',/note.taking|\bnotes\b|knowledge management|\bobsidian\b/i],
    ['Workflow automation',/workflow automation|automate.{0,20}workflow|\bn8n\b|\bzapier\b/i],
    ['Tasks & scheduling',/task management|project management|calendar|scheduling/i],
    ['Moodboards & visual references',/mood ?board|visual references|creative references|are\.na|\bpinterest\b/i],
    ['Tutorials & guides',/\btutorial\b|step.by.step|how to|getting started guide/i]
  ];
  const namedModels=[
    ['Wan',/\bwan(?:[ -]?(?:2(?:\.[0-9]+)?|video))?\b/gi],['HunyuanVideo',/\bhunyuan[ -]?video(?:[ -]?[0-9.]+)?\b/gi],
    ['CogVideo',/\bcogvideo(?:x)?(?:[ -]?[0-9.]+)?\b/gi],['LTX',/\bltx(?:[ -]?(?:video|[0-9]+(?:\.[0-9]+)*))?\b/gi],
    ['Mochi',/\bmochi(?:[ -]?[0-9.]+)?\b/gi],['AnimateDiff',/\banimatediff\b/gi],['Stable Diffusion',/\bstable diffusion(?:[ -]?[0-9.]+)?\b/gi],
    ['SDXL',/\bsdxl\b/gi],['FLUX',/\bflux(?:[ .-]?[0-9]+(?:\.[0-9]+)?)?\b/gi],['Qwen Image',/\bqwen[ -]image(?:[ -]edit)?\b/gi],['DALL-E',/\bdall[ -]?e(?:[ -]?[0-9])?\b/gi]
  ];
  function inferTopic(page,url){
    const fields=[[page.title,12],[page.description,7],[(page.headings||[]).join(' '),4],[String(page.text||'').slice(0,18000),1],[new URL(url).pathname.replace(/[-_/]/g,' '),2]];
    const ranked=topicRules.map(([topic,pattern],index)=>({topic,index,score:fields.reduce((sum,[text,weight])=>{const count=(String(text||'').match(new RegExp(pattern.source,'gi'))||[]).length;return sum+(count?weight*(1+Math.min(2,count-1)*.2):0);},0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
    let winner=ranked[0];
    if(winner?.topic==='Video generation models')winner=ranked.find(r=>['Image-to-video models','Text-to-video models'].includes(r.topic)&&r.score>=7)||winner;
    if(winner?.topic==='Image generation models')winner=ranked.find(r=>r.topic==='Text-to-image models'&&r.score>=7)||winner;
    // Two similarly weighted modalities on a comparison page are retained as a comparison.
    const comparison=ranked.find(r=>r.topic==='Model benchmarks & comparisons');
    const topic=comparison&&comparison.score>=winner.score*.75?'Model benchmarks & comparisons':winner?.topic||'Needs review';
    const text=fields.slice(0,4).map(([value])=>String(value||'')).join(' '),modelNames=[];
    for(const [name,pattern] of namedModels){
      pattern.lastIndex=0;const matches=[...new Set((text.match(pattern)||[]).map(match=>match.trim().replace(/[. -]+$/,'')))].sort((a,b)=>Number(/\d/.test(b))-Number(/\d/.test(a))||b.length-a.length);
      if(matches.length)modelNames.push(...matches.slice(0,topic==='Model benchmarks & comparisons'?2:1));
    }
    return {topic,modelNames:[...new Set(modelNames)].slice(0,8),topicVersion,topicMethod:'automatic'};
  }
  function classify(page, url) {
    const host = new URL(url).hostname.replace(/^www\./,'');
    const fields = [[page.title,6],[page.description,4],[(page.headings||[]).join(' '),3],[String(page.text||'').slice(0,18000),1],[new URL(url).pathname.replace(/[-_/]/g,' '),2]];
    const scores = Object.entries(topics).map(([category,phrases]) => {
      let total=0;const tags=[];
      for(const phrase of phrases){let found=false;for(const [text,weight] of fields)if(score(text,phrase)){total+=weight*(phrase.includes(' ')?2:1);found=true;}if(found)tags.push(phrase);}
      if(Object.entries(known).some(([domain,c])=>c===category&&(host===domain||host.endsWith('.'+domain))))total+=18;
      return {category,total,tags};
    }).sort((a,b)=>b.total-a.total);
    const best=scores[0];
    const meaningful = best.total>=4;
    const tags=(meaningful?best.tags:[]).slice(0,4);
    if(score([page.title,page.description].join(' '),'ai') || score(page.text,'artificial intelligence'))tags.unshift('ai');
    return {category:meaningful?best.category:'Uncategorized',tags:[...new Set(tags)].slice(0,5),confidence:meaningful?(best.total>=15?'high':'medium'):'low'};
  }
  function analyze(page,url){
    if(/^(just a moment|access denied|attention required|sign in|log in|security check|verify you are human)\b/i.test(clean(page.title)))page={unavailable:true};
    const title=clean(page.title).slice(0,160)||new URL(url).hostname.replace(/^www\./,'');
    const description=clean(page.description||page.excerpt||'').slice(0,1000);
    const result=classify({...page,title,description},url);
    const specific=inferTopic({...page,title,description},url);
    return {url,title,description,...result,...specific,pageSignals:{headings:(page.headings||[]).slice(0,12),text:String(page.text||'').slice(0,12000)},analysisStatus:page.unavailable?'unavailable':specific.topic==='Needs review'?'uncertain':'complete',analyzedAt:new Date().toISOString()};
  }
  function extractDocument(doc){
    const meta=name=>doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
    const content=doc.querySelector('main,article,[role="main"]')||doc.body;
    // Clone before removing navigation and scripts; never mutate the visited page.
    const copy=content?.cloneNode(true);copy?.querySelectorAll('script,style,nav,header,footer,aside,noscript,svg').forEach(el=>el.remove());
    const text=clean(copy?.textContent).slice(0,24000);
    const headings=[...doc.querySelectorAll('h1,h2')].slice(0,12).map(el=>clean(el.textContent));
    const excerpt=[...copy?.querySelectorAll('p')||[]].map(el=>clean(el.textContent)).find(t=>t.length>60)||'';
    return {title:meta('og:title')||meta('twitter:title')||doc.title,description:meta('og:description')||meta('description')||meta('twitter:description'),headings,text,excerpt};
  }
  async function requestPage(url, snapshot){
    if(snapshot)return snapshot;
    if(globalThis.chrome?.runtime?.id){
      const response=await chrome.runtime.sendMessage({type:'gather-preview',url});
      if(!response?.ok)throw new Error(response?.error||'Could not read the page.');
      return response.page;
    }
    // The second endpoint supports an existing static preview on port 4173.
    const endpoints=['/api/preview','http://127.0.0.1:4174/api/preview'];
    for(const endpoint of endpoints){
      try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(14000)});if(response.status===404||response.status===501)continue;const body=await response.json();if(!response.ok)throw new Error(body.error||'Page could not be read.');return body;}
      catch(error){if(endpoint===endpoints.at(-1))throw error;}
    }
    throw new Error('Page reader is unavailable.');
  }
  async function enrich(url,snapshot){
    try{return analyze(await requestPage(url,snapshot),url);}
    catch{return analyze({unavailable:true},url);}
  }
  // Call directly from a click/submit before any awaited work.
  function requestAccess(url){
    if(!globalThis.chrome?.runtime?.id)return Promise.resolve(true);
    return chrome.permissions.request({origins:[new URL(url).origin+'/*']});
  }
  function extractHtml(html){
    const decode=value=>String(value||'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]);
    const strip=value=>clean(decode(value.replace(/<[^>]*>/g,' ')));
    const meta={};for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[match[1].toLowerCase()]=decode(match[2]??match[3]??match[4]);const key=attrs.property||attrs.name;if(key)meta[key.toLowerCase()]=attrs.content||'';}
    const body=html.replace(/<(script|style|nav|header|footer|aside|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
    return {title:meta['og:title']||meta['twitter:title']||strip(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),description:meta['og:description']||meta.description||meta['twitter:description']||'',headings:[...body.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].slice(0,12).map(m=>strip(m[1])),text:strip(body).slice(0,24000),excerpt:[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>strip(m[1])).find(s=>s.length>60)||''};
  }
  return {analyze,classify,inferTopic,topicVersion,extractDocument,extractHtml,enrich,requestAccess};
})();
