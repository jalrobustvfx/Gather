const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const context={URL};vm.createContext(context);for(const file of ['storage.js','library-search.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);const search=context.GatherSearch;
const reddit={url:'https://old.reddit.com/r/LocalLLaMA/comments/abc',title:'A new local video model',topic:'Image-to-video models'};
const github={url:'https://github.com/team/model',title:'A new video model mentioned on Reddit',topic:'Text-to-video models'};
test('website spelling variants find the source website without cached metadata',()=>{
  for(const query of ['reddit','reditt','Reditt','redditt','reddit.com','www.reddit.com']){assert.equal(search.matches(reddit,query),true,query);assert.equal(search.matches(github,query),false,query);}
});
test('website and topic terms can be combined',()=>{
  assert.equal(search.matches(reddit,'reditt video'),true);assert.equal(search.matches(reddit,'reditt audio'),false);assert.equal(search.matches(github,'git hub video'),true);
});
test('ordinary searches still cover titles, notes, tags, and model names',()=>{
  const item={...github,note:'Use for product shots',tags:['local'],modelNames:['Wan 2.2']};
  for(const query of ['product shots','local','wan 2.2','text-to-video'])assert.equal(search.matches(item,query),true);
  assert.equal(search.matches(item,'unrelated'),false);
});
test('website queries identify filters that need to be cleared',()=>{
  assert.equal(search.websiteForQuery('reditt'),'Reddit');assert.equal(search.websiteForQuery('linked in'),'LinkedIn');assert.equal(search.websiteForQuery('git hub video'),'GitHub');assert.equal(search.websiteForQuery('video model'),null);
});
test('search includes saved body text and headings while older links still work',()=>{
  const item={...github,pageSignals:{headings:['Quantization guide'],text:'This implementation uses temporal consistency and optical flow.'}};
  assert.equal(search.matches(item,'temporal consistency'),true);assert.equal(search.matches(item,'quantization'),true);
  assert.equal(search.matches(item,'github optical'),true);assert.equal(search.matches(item,'reddit optical'),false);
  assert.equal(search.matches(github,'optical'),false);
});
test('matching excerpts highlight saved text and escape page markup',()=>{
  const item={...github,pageSignals:{text:'<script>alert(1)</script> A café guide for temporal consistency.'}};
  const excerpt=search.excerpt(item,'cafe temporal');
  assert.match(excerpt,/<mark>café<\/mark>/);assert.match(excerpt,/<mark>temporal<\/mark>/);assert.doesNotMatch(excerpt,/<script>/);
  assert.match(excerpt,/&lt;script&gt;/);assert.equal(search.excerpt(item,''),'');
});
test('non-Latin words remain searchable in captured text',()=>{
  assert.equal(search.matches({...github,pageSignals:{text:'模型 视频生成 工作流'}},'视频生成'),true);
});
