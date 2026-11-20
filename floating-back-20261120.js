// Reuse each page's own back action so existing navigation and edit guards remain active.
(()=>{
 const app=document.getElementById('app');if(!app)return;
 const button=document.createElement('button');button.type='button';button.className='floating-back';button.hidden=true;
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
 document.body.append(button);let frame=0;
 function inStudySection(){const kind=(location.hash||'#/home').replace(/^#\//,'').split(/[/?]/)[0];return ['people','person','books','topics','verses','family','routine','ministry'].includes(kind)}
 function place(){const viewport=window.visualViewport;const bottom=viewport?Math.max(0,window.innerHeight-viewport.offsetTop-viewport.height):0;const right=viewport?Math.max(0,window.innerWidth-viewport.offsetLeft-viewport.width):0;document.documentElement.style.setProperty('--study-visual-bottom',Math.round(bottom)+'px');document.documentElement.style.setProperty('--study-visual-right',Math.round(right)+'px')}
 function update(){frame=0;place();const target=app.querySelector('.bottom-back');const enabled=!!target&&inStudySection();document.body.classList.toggle('use-study-floating-back',enabled);const focus=document.activeElement;const typing=focus&&focus.matches('textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');const blocked=!!document.querySelector('dialog[open]')||!!typing;button.hidden=!enabled||blocked;if(target){const destination=(target.textContent||'').replace(/^[\s←]+/,'').trim();const label=destination?'뒤로 가기: '+destination:'뒤로 가기';button.setAttribute('aria-label',label);button.title=label}}
 function schedule(){if(!frame)frame=requestAnimationFrame(update)}
 button.addEventListener('click',()=>{const target=app.querySelector('.bottom-back');if(target&&!target.matches(':disabled'))target.click()});
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 window.addEventListener('resize',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('hashchange',schedule);document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 schedule();
})();
