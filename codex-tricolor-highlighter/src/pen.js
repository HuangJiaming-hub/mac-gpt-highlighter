(() => {
  if (location.protocol !== 'app:' || location.hostname !== '-' || window.top !== window) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
  function start() {
    if (!document.body || !CSS.highlights || document.getElementById('mac-tricolor-tools')) return;
    const colors = {red:['红','#ff939c'], yellow:['黄','#ffdf70'], blue:['蓝','#95c9ff']};
    const sel = '[data-content-search-unit-key],[data-message-author-role][data-message-id],[data-turn-key]';
    const prefix = 'codex-tricolor-v1/';
    const host = document.createElement('div');
    host.id = 'mac-tricolor-tools';
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none';
    const ui = host.attachShadow({mode:'closed'});
    const bar = document.createElement('div');
    bar.setAttribute('role','toolbar');
    bar.setAttribute('aria-label','选择荧光笔颜色');
    bar.style.cssText='display:flex;gap:5px;padding:5px;background:#28282b;border-radius:10px;box-shadow:0 2px 12px #0004';
    ui.append(bar);
    document.body.append(host);
    const style = document.createElement('style');
    style.textContent = Object.entries(colors).map(([k,[,c]])=>'::highlight(mac-pen-'+k+'){background-color:'+c+';color:#202128}').join('');
    document.head.append(style);
    let chosen=null, timer=0;
    function hide(){host.style.display='none';chosen=null;}
    function button(label,title,background,action){
      const b=document.createElement('button');b.textContent=label;b.type='button';b.title=title;b.setAttribute('aria-label',title);
      b.style.cssText='border:0;border-radius:6px;font:600 14px system-ui;min-width:31px;height:29px;color:#202128;cursor:pointer;background:'+background;
      b.addEventListener('pointerdown',e=>e.preventDefault());b.onclick=action;bar.append(b);return b;
    }
    const scope = el => {
      const unit=el.getAttribute('data-content-search-unit-key')||el.getAttribute('data-message-id')||el.getAttribute('data-turn-key');
      const turn=el.closest('[data-turn-key]')?.getAttribute('data-turn-key')||'';
      const route=location.hash.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || location.pathname;
      const chatRoot=el.closest('[data-conversation-id]');
      const chat=chatRoot?.getAttribute('data-conversation-id')||'';
      return prefix+JSON.stringify([route,chat,turn,unit]);
    };
    function read(k){try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return []}}
    function index(el){
      const nodes=[];let text='';
      const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(walk.nextNode()){const node=walk.currentNode;nodes.push([node,text.length]);text+=node.data;}
      return {nodes,text};
    }
    function locationIn(text,mark){
      const {pos,quote,left,right}=mark;
      if(text.slice(pos,pos+quote.length)===quote && text.slice(Math.max(0,pos-left.length),pos)===left && text.slice(pos+quote.length,pos+quote.length+right.length)===right)return pos;
      let first=-1, contextual=-1, matches=0, contexts=0;
      for(let i=text.indexOf(quote);i!==-1;i=text.indexOf(quote,i+1)){
        matches++;first=i;
        if((!left||text.slice(Math.max(0,i-left.length),i)===left)&&(!right||text.slice(i+quote.length,i+quote.length+right.length)===right)){contextual=i;contexts++;}
      }
      return contexts===1?contextual:matches===1?first:-1;
    }
    function makeRange(nodes,a,b){
      const start=nodes.find(([n,i])=>i+n.length>a),end=nodes.find(([n,i])=>i+n.length>=b);
      if(!start||!end)return null;
      const r=new Range();r.setStart(start[0],a-start[1]);r.setEnd(end[0],b-end[1]);return r;
    }
    function draw(){
      const all=Object.fromEntries(Object.keys(colors).map(c=>[c,new Highlight()]));
      for(const el of document.querySelectorAll(sel)){
        const marks=read(scope(el));if(!Array.isArray(marks)||!marks.length)continue;
        const {nodes,text}=index(el);
        for(const m of marks){
          if(!m?.quote||!all[m.color])continue;
          const a=locationIn(text,m);if(a<0)continue;
          const r=makeRange(nodes,a,a+m.quote.length);if(r)all[m.color].add(r);
        }
      }
      for(const [c,v] of Object.entries(all))CSS.highlights.set('mac-pen-'+c,v);
    }
    function capture(){
      const selection=getSelection();
      if(!selection.rangeCount||selection.isCollapsed){hide();return;}
      const r=selection.getRangeAt(0);
      const owner=n=>(n.nodeType===1?n:n.parentElement)?.closest(sel);
      const el=owner(r.startContainer);
      if(!el||owner(r.endContainer)!==el||el.closest('[contenteditable=true],textarea,input')){hide();return;}
      const quote=r.toString();if(!quote.trim()){hide();return;}
      const before=document.createRange();before.selectNodeContents(el);before.setEnd(r.startContainer,r.startOffset);
      const pos=before.toString().length,text=el.textContent,k=scope(el);
      chosen={el,k,mark:{pos,quote,left:text.slice(Math.max(0,pos-28),pos),right:text.slice(pos+quote.length,pos+quote.length+28)}};
      const rect=r.getBoundingClientRect();
      host.style.display='block';
      host.style.left=Math.max(4,Math.min(rect.left,innerWidth-host.offsetWidth-5))+'px';
      host.style.top=(rect.bottom+12+host.offsetHeight<innerHeight?rect.bottom+12:Math.max(4,rect.top-host.offsetHeight-10))+'px';
    }
    function apply(color){
      if(!chosen||!chosen.el.isConnected||scope(chosen.el)!==chosen.k){hide();return;}
      const {el,k,mark}=chosen, text=el.textContent;
      const marks=read(k).filter(m=>{
        const start=locationIn(text,m);
        return start<0||start+m.quote.length<=mark.pos||start>=mark.pos+mark.quote.length;
      });
      if(color)marks.push({...mark,color});
      try{if(marks.length)localStorage.setItem(k,JSON.stringify(marks));else localStorage.removeItem(k);}
      catch{bar.setAttribute('aria-label','保存失败');window.alert('标记保存失败，客户端本地存储可能已满。');return;}
      getSelection().removeAllRanges();hide();draw();
    }
    for(const [k,[label,color]] of Object.entries(colors))button(label,label+'色高亮',color,()=>apply(k));
    button('擦除','移除与选区相交的标记','#eeeeef',()=>apply(null));
    document.addEventListener('pointerup',e=>{if(!e.composedPath().includes(host))setTimeout(capture,0)},true);
    document.addEventListener('keyup',e=>{if(e.key==='Escape')hide();else if(e.key==='Shift'||e.shiftKey)capture()});
    document.addEventListener('scroll',hide,true);
    window.addEventListener('resize',hide);
    window.addEventListener('storage',e=>{if(e.key?.startsWith(prefix))draw()});
    function queue(){if(!timer)timer=setTimeout(()=>{timer=0;draw()},130)}
    new MutationObserver(queue).observe(document.body,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-turn-key','data-content-search-unit-key','data-message-id']});
    window.addEventListener('popstate',()=>{hide();queue()});
    draw();
  }
})();
