const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){
  const key='gather-companion-v1',memory={[key]:{enabled:false,character:'robot',corner:'right'}},nodes=new Map(),listeners=[];
  function element(){return {dataset:{},setAttribute(k,v){this[k]=v;},classList:{add(){},remove(){}}};}
  const pets=['robot','cat','dog'].map(id=>({...element(),dataset:{pet:id}}));
  const root={querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll:()=>pets};
  const context={document:{getElementById:id=>id==='companion-settings'?root:null},chrome:{runtime:{id:'test',sendMessage:async()=>({ok:true})},permissions:{request:async()=>true},storage:{local:{get:async k=>({[k]:structuredClone(memory[k])}),set:async values=>{Object.assign(memory,structuredClone(values));for(const fn of listeners)fn({[key]:{newValue:memory[key]}},'local');}},onChanged:{addListener:fn=>listeners.push(fn)}}}};
  vm.createContext(context);for(const file of ['companion-model.js','companion-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {memory,key,pets,root,listeners,flush:()=>new Promise(r=>setImmediate(r))};
}
test('choosing a pet keeps the latest enabled preference from another window',async()=>{
  const p=setup();await p.flush();
  p.memory[p.key]={enabled:true,character:'robot',corner:'left'};
  await p.pets[1].onclick();
  assert.equal(p.memory[p.key].enabled,true);assert.equal(p.memory[p.key].character,'cat');assert.equal(p.memory[p.key].corner,'left');
});
test('settings follow external changes and enabled companions can be shown again',async()=>{
  const p=setup();await p.flush();
  p.listeners[0]({[p.key]:{newValue:{enabled:true,character:'dog'}}},'local');
  const button=p.root.querySelector('#companion-enable');assert.match(button.textContent,/Show companion/);assert.equal(button.disabled,false);
  await button.onclick({currentTarget:button});assert.equal(p.memory[p.key].enabled,true);
  assert.match(p.root.querySelector('#companion-status').textContent,/ready/);
});
