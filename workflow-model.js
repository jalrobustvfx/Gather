globalThis.GatherWorkflows={
  create(name){return {id:crypto.randomUUID(),name:name.trim(),nodes:[],edges:[],createdAt:new Date().toISOString()};},
  addNode(workflow,item,title,purpose=''){
    const index=workflow.nodes.length;
    const node={id:crypto.randomUUID(),itemId:item?.id||null,title:title||item?.title||'New step',purpose,x:60+(index%4)*350,y:70+Math.floor(index/4)*290};
    workflow.nodes.push(node);return node;
  },
  connect(workflow,from,to,label=''){
    if(from===to)throw new Error('Choose two different steps.');
    if(!workflow.nodes.some(n=>n.id===from)||!workflow.nodes.some(n=>n.id===to))throw new Error('Both steps must exist.');
    if(workflow.edges.some(e=>e.from===from&&e.to===to))throw new Error('Those steps are already connected.');
    const edge={id:crypto.randomUUID(),from,to,label:label.trim().slice(0,100)};workflow.edges.push(edge);return edge;
  },
  removeNode(workflow,id){workflow.nodes=workflow.nodes.filter(n=>n.id!==id);workflow.edges=workflow.edges.filter(e=>e.from!==id&&e.to!==id);},
  import(incoming,merged,idMap){
    if(!Array.isArray(incoming.workflows))return;
    merged.workflows ||= [];
    for(const value of incoming.workflows.slice(0,200)){
      if(!value||typeof value.name!=='string'||!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw new Error('The backup contains an invalid workflow.');
      const workflow=this.create(value.name.slice(0,100)),nodes=new Map();
      for(const n of value.nodes.slice(0,500)){
        if(!n||typeof n.id!=='string'||typeof n.title!=='string')throw new Error('The backup contains an invalid workflow step.');
        const node=this.addNode(workflow,null,n.title.slice(0,120),String(n.purpose||'').slice(0,2000));nodes.set(n.id,node.id);node.itemId=idMap.get(n.itemId)||null;node.x=Number.isFinite(n.x)?Math.max(0,Math.min(2400,n.x)):60;node.y=Number.isFinite(n.y)?Math.max(0,Math.min(1500,n.y)):70;
      }
      for(const e of value.edges.slice(0,1000))if(e&&nodes.has(e.from)&&nodes.has(e.to)&&e.from!==e.to){try{this.connect(workflow,nodes.get(e.from),nodes.get(e.to),String(e.label||''));}catch{}}
      merged.workflows.push(workflow);
    }
  }
};
