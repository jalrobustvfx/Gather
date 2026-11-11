const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(manifest){const calls=[];const context={chrome:{runtime:{getManifest:()=>manifest},permissions:{request:options=>{calls.push(JSON.parse(JSON.stringify(options)));return Promise.resolve(true);}}}};vm.createContext(context);vm.runInContext(fs.readFileSync('bookmark-permissions.js','utf8'),context);return {service:context.GatherBookmarkPermissions,calls};}
const current=JSON.parse(fs.readFileSync('manifest.json','utf8'));
test('current manifest requests only optional bookmarks and screenshot hosts',async()=>{
  const s=setup(current);assert.equal(await s.service.request(true),true);
  assert.deepEqual(s.calls,[{permissions:['bookmarks'],origins:['<all_urls>']}]);
});
test('links-only import does not request screenshot website access',async()=>{
  const s=setup(current);await s.service.request(false);assert.deepEqual(s.calls,[{permissions:['bookmarks']}]);
});
test('old loaded manifests fail before calling Chrome with undeclared permissions',()=>{
  for(const manifest of [{version:'old',permissions:['storage'],optional_permissions:['bookmarks'],optional_host_permissions:['<all_urls>']},
    {version:'old',permissions:['storage','unlimitedStorage'],optional_permissions:['bookmarks'],optional_host_permissions:['https://*/*']}]){
    const s=setup(manifest);assert.throws(()=>s.service.request(true),/chrome:\/\/extensions.*Reload/);assert.equal(s.calls.length,0);
  }
});
test('previous manifest supports links-only import while background captures require reload',async()=>{
  const s=setup({version:'0.7.1',permissions:['storage'],optional_permissions:['bookmarks','unlimitedStorage'],optional_host_permissions:['<all_urls>']});
  assert.throws(()=>s.service.request(true),/Reload/);
  await s.service.request(false);assert.deepEqual(s.calls[0].permissions,['bookmarks','unlimitedStorage']);
});
test('already required permissions are not requested and raw manifest errors explain recovery',async()=>{
  const s=setup({permissions:['bookmarks','unlimitedStorage','debugger'],host_permissions:['<all_urls>']});assert.equal(await s.service.request(true),true);assert.equal(s.calls.length,0);
  assert.match(s.service.error(new Error('Only permissions specified in the manifest may be requested.')),/reload Gather/);
});
