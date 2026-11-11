/* Full-size local snapshot reader, shared by List and Cover Flow. */
globalThis.GatherSnapshotViewer=(()=>{
  const el=id=>document.getElementById(id);let scale=1;
  function setScale(value){
    const image=el('snapshot-reader-image');if(!image.naturalWidth)return;
    scale=Math.max(.1,Math.min(4,value));image.style.width=Math.round(image.naturalWidth*scale)+'px';image.style.height='auto';el('snapshot-zoom-value').textContent=Math.round(scale*100)+'%';
  }
  function fit(){const image=el('snapshot-reader-image'),frame=el('snapshot-reader-frame');if(image.naturalWidth)setScale(Math.min(1,(frame.clientWidth-24)/image.naturalWidth,(frame.clientHeight-24)/image.naturalHeight));}
  function open(item){
    if(!item||!/^data:image\/(jpeg|png|webp);base64,/.test(item.screenshot||'')){toast('This page does not have a snapshot yet.');return;}
    const image=el('snapshot-reader-image');el('snapshot-reader-title').textContent=item.title;image.alt='Saved page snapshot of '+item.title;image.onload=fit;image.src=item.screenshot;el('snapshot-reader').showModal();if(image.complete)fit();el('snapshot-reader-frame').scrollTo(0,0);
  }
  el('snapshot-zoom-in').onclick=()=>setScale(scale*1.25);el('snapshot-zoom-out').onclick=()=>setScale(scale/1.25);el('snapshot-zoom-value').onclick=()=>setScale(1);el('snapshot-fit').onclick=fit;
  return {open};
})();
