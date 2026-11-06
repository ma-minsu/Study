// Reuse each page's own back action, so navigation and unsaved-edit guards stay intact.
(()=>{
 const app=document.getElementById('app');if(!app)return;
 const button=document.createElement('button');button.type='button';button.className='floating-back';button.hidden=true;
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
 document.body.append(button);let frame=0;
 function update(){frame=0;const target=app.querySelector('.bottom-back');const focus=document.activeElement;const typing=focus&&focus.matches('input:not([type=hidden]), textarea, select, [contenteditable=true]');const longPage=document.documentElement.scrollHeight>window.innerHeight+100;const blocked=!!document.querySelector('dialog[open]')||!!typing;button.hidden=!target||!longPage||blocked;if(target){const destination=(target.textContent||'').replace(/^[\s←←]+/,'').trim();const label=destination?'뒤로 가기: '+destination:'뒤로 가기';button.setAttribute('aria-label',label);button.title=label}}
 function schedule(){if(!frame)frame=requestAnimationFrame(update)}
 button.addEventListener('click',()=>{const target=app.querySelector('.bottom-back');if(target&&!target.matches(':disabled'))target.click()});
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 window.addEventListener('resize',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('hashchange',schedule);document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
 schedule();
})();
