const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context={URL,AbortSignal,Date,fetch:async()=>{throw new Error('offline');}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../page-analysis.js'),'utf8'),context);
const analysis=context.GatherAnalysis;
test('classifies page content even when the domain is unknown',()=>{
  const cases=[
    ['Coding','Build software faster','An AI code editor with debugging and programming tools.'],
    ['Design','Sketch your next website','A UI design and wireframe tool for interactive prototypes.'],
    ['Video & Audio','Bring ideas to life','AI video generation, video editing and text to speech.'],
    ['Research','Discover scientific work','Search academic research papers, datasets and citations.'],
    ['Productivity','Organize your work','Task management, calendar scheduling and meeting notes.'],
    ['Inspiration','Collect creative references','A moodboard for visual references and inspiration.']
  ];
  for(const [category,title,description] of cases){const result=analysis.analyze({title,description},'https://new-tool.example');assert.equal(result.category,category);assert.ok(result.tags.length);assert.equal(result.analysisStatus,'complete');}
});
test('a generic AI site is not automatically mislabeled as coding',()=>{
  assert.equal(analysis.analyze({title:'Helpful AI',description:'Explore a new way to work.'},'https://new-tool.example').category,'Uncategorized');
});
test('uses page headings and body to recognize a category',()=>{
  assert.equal(analysis.analyze({title:'Welcome',headings:['Video generation for everyone'],text:'Create audio, music and animation.'},'https://new-tool.example').category,'Video & Audio');
});
test('unknown topics stay uncategorized instead of fabricating an answer',()=>{
  const result=analysis.analyze({title:'Hello world',description:'A little place on the internet.'},'https://new-tool.example');assert.equal(result.category,'Uncategorized');assert.equal(result.analysisStatus,'uncertain');
});
test('extracts metadata regardless of attribute order and strips scripts',()=>{
  const result=analysis.extractHtml('<html><title>Fallback</title><meta content="Build &amp; debug" property="og:title"><meta name="description" content="A programming tool."><script>video music audio</script><h1>Code editor</h1><p>A very helpful code editor that makes debugging and software development easier.</p></html>');
  assert.equal(result.title,'Build & debug');assert.equal(result.description,'A programming tool.');assert.ok(!result.text.includes('music'));assert.equal(analysis.analyze(result,'https://new-tool.example').category,'Coding');
});
test('network failure still returns a saveable link with an honest status',async()=>{
  const result=await analysis.enrich('https://unknown.example/resource');assert.equal(result.title,'unknown.example');assert.equal(result.analysisStatus,'unavailable');assert.equal(result.category,'Uncategorized');
});
test('anti-bot and sign-in pages are not treated as the actual content',()=>{
  const result=analysis.analyze({title:'Just a moment...',text:'Security check'},'https://new-tool.example');assert.equal(result.analysisStatus,'unavailable');
});
test('subject categories are independent of the website hosting the page',()=>{
  const page={title:'Open video model',description:'Text-to-video generation with open weights.'};
  for(const url of ['https://github.com/team/model','https://www.reddit.com/r/ai/comments/abc/model'])assert.equal(analysis.analyze(page,url).topic,'Text-to-video models');
  assert.equal(analysis.analyze({title:'A new text-to-image diffusion model'},'https://github.com/team/model').topic,'Text-to-image models');
});
test('specific topics distinguish modalities, model names, and practical tools',()=>{
  const cases=[
    ['Wan 2.2 image-to-video model','Animate a reference image.','Image-to-video models'],
    ['LTX-2.5 text-to-video model','Create video from a written prompt.','Text-to-video models'],
    ['FLUX text-to-image model','Generate images from a prompt.','Text-to-image models'],
    ['Qwen-Image-Edit','Image editing and inpainting.','Image editing & inpainting'],
    ['Ollama','Run AI models locally on your machine.','Local model runtimes'],
    ['LiveActionAOV','Nuke-ready AOVs, Cryptomatte and compositing for live-action plates.','VFX & compositing']
  ];
  for(const [title,description,topic] of cases)assert.equal(analysis.analyze({title,description},'https://github.com/team/project').topic,topic,title);
  const result=analysis.analyze({title:'Wan 2.2 image-to-video model'},'https://github.com/team/project');assert.ok(result.modelNames.some(name=>name.toLowerCase().includes('wan 2.2')));
});
test('a relevant title outweighs unrelated model mentions deep in the body',()=>{
  assert.equal(analysis.analyze({title:'An image-to-video model',text:'Related projects: Stable Diffusion and FLUX text-to-image models.'},'https://github.com/team/project').topic,'Image-to-video models');
});
test('a tool that uses a video model keeps its actual purpose as its topic',()=>{
  const result=analysis.analyze({title:'LiveActionAOV: Nuke-ready AOVs and Cryptomatte with LTX-2.5 Alpha',description:'Compositing for live-action plates with depth, normals and Nuke output.'},'https://github.com/team/LiveActionAOV');
  assert.equal(result.topic,'VFX & compositing');assert.ok(result.modelNames.includes('LTX-2.5'));
});
test('model identification prefers the versioned name over the repository owner',()=>{
  const result=analysis.analyze({title:'GitHub - Wan-AI/Wan2.2: image-to-video model'},'https://github.com/Wan-AI/Wan2.2');
  assert.ok(result.modelNames.includes('Wan2.2'));assert.equal(result.topic,'Image-to-video models');
});
