globalThis.GatherArchive = (() => {
  function screenshot(value){return typeof value==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(value);}
  function serialize(data){
    if(data.version!==1||!Array.isArray(data.items)||!Array.isArray(data.boards))throw new Error('Invalid collection.');
    return JSON.stringify({...data,exportedAt:new Date().toISOString(),includesScreenshots:true},null,2);
  }
  return {screenshot,serialize};
})();
