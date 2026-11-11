const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('archive.js','utf8'),context);
test('exports preserve every screenshot byte, saved text, and workflow in a self-contained JSON',()=>{
  const screenshot='data:image/jpeg;base64,'+'a'.repeat(2100000);
  const data={version:1,items:[{id:'a',url:'https://example.com',screenshot,capturedAt:'2026-11-08T00:00:00Z',pageSignals:{text:'searchable text'}}],boards:[],workflows:[{nodes:[{itemId:'a'}]}]};
  const restored=JSON.parse(context.GatherArchive.serialize(data));assert.equal(restored.items[0].screenshot,screenshot);
  assert.equal(restored.items[0].pageSignals.text,'searchable text');assert.deepEqual(restored.workflows,data.workflows);
  assert.equal(restored.includesScreenshots,true);assert.equal(context.GatherArchive.screenshot(screenshot),true);
});
