const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function page(prefs={enabled:true,character:'cat'}, initialRead){
  const elements=[],timers=new Map();let sequence=0,changed,saves=0;const observers=[];
  class Element {
    constructor(){this.events={};this.children=[];this.nodes={};this.classes=new Set();this.style={setProperty:(key,value)=>this.style[key]=value};this.classList={add:(...v)=>v.forEach(c=>this.classes.add(c)),remove:(...v)=>v.forEach(c=>this.classes.delete(c)),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};elements.push(this);}
    attachShadow(){return this.shadow=new Element();}
    append(...nodes){this.children.push(...nodes);nodes.forEach(n=>n.isConnected=true);}
    querySelector(selector){return this.nodes[selector]||=new Element();}
    setAttribute(key,value){this[key]=value;}
    addEventListener(event,fn){this.events[event]=fn;}
    dispatchEvent(event){this.events[event.type]?.(event);}
    remove(){this.isConnected=false;}
  }
  const document={hidden:false,documentElement:new Element(),createElement:()=>new Element(),getElementById:id=>elements.find(el=>el.id===id&&el.isConnected)};
  class MutationObserver {constructor(fn){this.fn=fn;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}}
  const context={MutationObserver,location:{protocol:'https:'},window:{},document,Math,Event,
    setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    chrome:{storage:{local:{get:key=>initialRead||Promise.resolve({[key]:prefs})},onChanged:{addListener:fn=>changed=fn,removeListener:fn=>{if(changed===fn)changed=null;}}},
      runtime:{sendMessage:async message=>{saves++;return {ok:true,item:{website:'GitHub',topic:'Text-to-video models'}};}}}};
  context.window.top=context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('companion-model.js','utf8'),context);
  const run=()=>vm.runInContext(fs.readFileSync('companion-content.js','utf8'),context);
  run();
  return {context,document,timers,run,mutate:()=>observers.filter(o=>o.active).forEach(o=>o.fn()),flush:()=>new Promise(resolve=>setImmediate(resolve)),host:()=>document.getElementById('gather-companion'),
    change:value=>changed?.({'gather-companion-v1':{newValue:value}},'local'),saves:()=>saves};
}
test('companion waits quietly, only animates occasionally, and never autosaves',async()=>{
  const p=page();await p.flush();const host=p.host();assert.ok(host);
  const idle=[...p.timers.values()].find(timer=>timer.delay>=180000&&timer.delay<=300000);assert.ok(idle);
  idle.fn();assert.equal(p.saves(),0);assert.equal(host.shadow.children[1].classes.has('idle'),true);
  p.document.hidden=true;host.shadow.children[1].classes.clear();
  [...p.timers.values()].filter(t=>t.delay>=180000).at(-1).fn();
  assert.equal(host.shadow.children[1].classes.has('idle'),false);
});
test('one trusted click saves and confirms while synthetic page clicks cannot save',async()=>{
  const p=page();await p.flush();const wrap=p.host().shadow.children[1],button=wrap.querySelector('.save');
  await button.events.click({isTrusted:false});assert.equal(p.saves(),0);
  await button.events.click({isTrusted:true});assert.equal(p.saves(),1);
  assert.equal(wrap.querySelector('.badge').textContent,'✓');assert.match(wrap.querySelector('.bubble').textContent,/GitHub \/ Text-to-video/);
  assert.equal(button.disabled,false);
});
test('preferences switch character, side, motion, and remove disabled companions',async()=>{
  const p=page();await p.flush();const host=p.host();
  p.change({enabled:true,character:'robot',corner:'left',animations:false});
  assert.equal(host.style.left,'24px');assert.equal(host.style.right,'auto');
  const wrap=host.shadow.children[1];assert.equal(wrap.classes.has('still'),true);
  assert.match(wrap.querySelector('.save')['aria-label'],/Pip/);
  assert.equal([...p.timers.values()].some(t=>t.delay>=180000),false);
  p.change({enabled:false});assert.equal(p.host(),undefined);
});
test('hide for this page survives preference changes and re-injection replaces old listeners',async()=>{
  const p=page();await p.flush();const old=p.host();
  old.shadow.children[1].querySelector('.hide').events.click({isTrusted:true});
  p.change({enabled:true,character:'dog'});assert.equal(p.host(),undefined);
  p.run();await p.flush();const fresh=p.host();assert.ok(fresh);assert.notEqual(old,fresh);
  p.change({enabled:true,character:'robot'});assert.equal(old.isConnected,false);
  assert.equal(p.document.documentElement.children.filter(el=>el.isConnected&&el.id==='gather-companion').length,1);
});


test('site DOM replacement restores the companion but deliberate hiding and disabling do not',async()=>{
  const p=page();await p.flush();const host=p.host();
  host.remove();p.mutate();assert.equal(p.host(),host);
  p.change({enabled:false});p.mutate();assert.equal(p.host(),undefined);
  p.change({enabled:true});assert.equal(p.host(),host);
  host.shadow.children[1].querySelector('.hide').events.click({isTrusted:true});
  p.mutate();assert.equal(p.host(),undefined);
});

test('an older initial settings read cannot undo a newer enabled preference',async()=>{
  let resolve;const p=page(undefined,new Promise(r=>resolve=r));
  p.change({enabled:true,character:'dog'});const host=p.host();assert.ok(host);
  resolve({'gather-companion-v1':{enabled:false}});await p.flush();
  assert.equal(p.host(),host);
});

test('reinjecting after a site removed the host disposes its old observer',async()=>{
  const p=page();await p.flush();const old=p.host();old.remove();
  p.run();await p.flush();p.mutate();
  assert.notEqual(p.host(),old);assert.equal(old.isConnected,false);
});
