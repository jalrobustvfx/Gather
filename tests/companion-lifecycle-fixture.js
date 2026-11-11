(() => {
  const key='gather-companion-v1', memory={[key]:{enabled:true,character:'robot'}},listeners=new Set();
  window.chrome={runtime:{id:'companion-test',sendMessage:async()=>({ok:true,item:{website:'Example',topic:'Test'}})},
    permissions:{request:async()=>true},storage:{local:{
      get:async name=>({[name]:structuredClone(memory[name])}),
      set:async values=>{for(const [name,value]of Object.entries(values)){const oldValue=memory[name];memory[name]=structuredClone(value);listeners.forEach(fn=>fn({[name]:{oldValue,newValue:value}},'local'));}}
    },onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  document.getElementById('replace-page').onclick=()=>{
    document.getElementById('gather-companion')?.remove();
    requestAnimationFrame(()=>document.getElementById('test-result').textContent=document.getElementById('gather-companion')?'Companion restored after website update.':'Companion missing.');
  };
})();
