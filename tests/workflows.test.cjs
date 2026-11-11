const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const context={crypto:require('node:crypto').webcrypto};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../workflow-model.js'),'utf8'),context);const model=context.GatherWorkflows;
test('a library tool can have independent purposes in different workflows',()=>{
  const item={id:'tool-1',title:'Video model'},a=model.create('Product ad'),b=model.create('Music video');
  const node=model.addNode(a,item,'Animate product','Turn product images into clips.');model.addNode(b,item,'Build backgrounds','Animate abstract backgrounds.');
  assert.equal(node.itemId,'tool-1');assert.notEqual(node.purpose,b.nodes[0].purpose);assert.equal(item.title,'Video model');
});
test('connectors reject self links, duplicates, and dangling nodes',()=>{
  const w=model.create('Map'),a=model.addNode(w,null,'Brief'),b=model.addNode(w,null,'Render');
  assert.throws(()=>model.connect(w,a.id,a.id),/different/);assert.throws(()=>model.connect(w,a.id,'missing'),/exist/);
  model.connect(w,a.id,b.id,'Reference images');assert.equal(w.edges[0].label,'Reference images');assert.throws(()=>model.connect(w,a.id,b.id),/already/);
  model.removeNode(w,a.id);assert.equal(w.nodes.length,1);assert.equal(w.edges.length,0);
});
test('workflow backups remap both library references and connector endpoints',()=>{
  const w=model.create('Example'),a=model.addNode(w,{id:'old-item',title:'Model'}),b=model.addNode(w,null,'Review');model.connect(w,a.id,b.id,'Video clips');a.x=390;
  const merged={workflows:[]};model.import({workflows:[w]},merged,new Map([['old-item','new-item']]));const copy=merged.workflows[0];
  assert.equal(copy.nodes[0].itemId,'new-item');assert.notEqual(copy.nodes[0].id,a.id);assert.equal(copy.edges[0].from,copy.nodes[0].id);assert.equal(copy.edges[0].to,copy.nodes[1].id);assert.equal(copy.nodes[0].x,390);
});
