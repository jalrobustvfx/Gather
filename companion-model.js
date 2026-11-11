globalThis.GatherCompanion = (() => {
  const key = 'gather-companion-v1';
  const characters = [{id:'robot', name:'Pip', kind:'Pocket robot', color:'#a5cad5'},
    {id:'cat', name:'Mochi', kind:'Curious cat', color:'#f2b49c'},
    {id:'dog', name:'Scout', kind:'Friendly pup', color:'#e8c76c'}];
  function normalize(value = {}) {
    value ||= {};
    return {enabled:value.enabled === true, character:characters.some(c=>c.id===value.character)?value.character:'robot',
      animations:value.animations !== false, corner:value.corner === 'left'?'left':'right'};
  }
  function svg(character) {
    const common = 'fill="none" stroke="#23251f" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"';
    const face = '<g class="eyes"><path d="M31 38v4m18-4v4"/></g><path d="M35 49q5 4 10 0"/><circle cx="25" cy="46" r="3" fill="#ed795c" stroke="none"/><circle cx="55" cy="46" r="3" fill="#ed795c" stroke="none"/>';
    let drawing;
    if(character==='cat') drawing='<path d="M60 58q19 1 10-17"/><path fill="#f2b49c" d="M23 55q-8 11 1 15h32q8-5 0-15"/><path fill="#f2b49c" d="M18 36l1-22 18 11h7l17-11 1 22v13q-1 13-22 13T18 49Z"/><path d="m23 23 8 5m25-5-8 5M14 45l9 2m-9 4 9-1m34-3 9-2m-9 5 9 1"/>'+face+'<path d="M31 65v5m18-5v5"/>';
    else if(character==='dog') drawing='<path d="M58 59q13-9 11-1"/><path fill="#e8c76c" d="M23 54q-9 11 0 16h34q8-6-1-16"/><path fill="#e8c76c" d="M19 30q1-14 21-14t21 14v19q-1 13-21 13T19 49Z"/><path fill="#b9814c" d="M22 24q-13-9-13 8v16q4 8 12-3Zm36 0q13-9 13 8v16q-4 8-12-3Z"/>'+face+'<path fill="#fdf5dd" d="M35 45q5-5 10 0l-5 4Z"/><path d="M31 65v5m18-5v5"/>';
    else drawing='<path d="M40 19v-8"/><circle cx="40" cy="8" r="4" fill="#f16d50"/><path fill="#a5cad5" d="M26 51h28v18H26Z"/><path d="M34 69v4m12-4v4"/><g class="arm"><path d="m56 57 9 5 5-9"/><circle cx="70" cy="50" r="3" fill="#a5cad5"/></g><path d="m24 57-9 6"/><rect x="15" y="22" width="50" height="34" rx="10" fill="#a5cad5"/><path d="M12 33v10m56-10v10"/><rect x="23" y="29" width="34" height="19" rx="6" fill="#faf6e9"/><g class="eyes"><path d="M31 36v4m18-4v4"/></g><path d="M36 44h8"/><path d="M34 62h12"/>';
    return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g ${common}>${drawing}</g></svg>`;
  }
  return {key, characters, normalize, svg};
})();
