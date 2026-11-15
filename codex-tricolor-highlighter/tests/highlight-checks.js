(async()=>{
 const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
 const article=document.querySelector('article');
 // Closed shadow is opened in this test fixture only.
 const buttons=[...document.querySelector('#mac-tricolor-tools').shadowRoot.querySelectorAll('button')];
 const values=()=>['red','yellow','blue'].map(c=>[...CSS.highlights.get('mac-pen-'+c)].map(r=>r.toString()).join(''));
 function assert(ok,label){if(!ok)throw Error(label)}
 async function paint(a,b,color){
  const start=article.childNodes[a].firstChild,end=article.childNodes[b].firstChild;
  const range=new Range();range.setStart(start,0);range.setEnd(end,end.length);
  getSelection().removeAllRanges();getSelection().addRange(range);
  article.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  await wait(25);
  assert(document.querySelector('#mac-tricolor-tools').style.display==='block','palette');
  buttons[color].click();
 }
 try{
  if(!sessionStorage.testPhase){
   await paint(0,0,0);await paint(1,1,1);await paint(2,2,2);
   assert(values().join('|')==='第一行|第二行|第三行','three colors');
   await paint(0,1,2); assert(values()[2].includes('第一行第二行'),'cross-format range');
   await paint(0,1,1); await paint(2,2,3);
   assert(values().join('|')==='|第一行第二行|','change / erase');
   sessionStorage.testPhase='reload'; location.reload();return;
  }
  assert(values().join('|')==='|第一行第二行|','restore after reload');
  article.closest('[data-turn-key]').dataset.turnKey='different-chat'; await wait(220);
  assert(values().join('')==='','isolate same words in another chat');
  article.closest('[data-turn-key]').dataset.turnKey='uuid-1';article.innerHTML='<span>第一行第二行第三行</span>';await wait(220);
  assert(values()[1]==='第一行第二行','restore after rerender and return');
  document.querySelector('#report').textContent='ALL_PASS';
 }catch(e){document.querySelector('#report').textContent='FAIL '+e.message}
})();
