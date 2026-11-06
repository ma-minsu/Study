// The PIN is checked by the existing server functions and is never stored here.
function pinMessage(message){return String(message).replaceAll('작성 비밀번호','비밀번호').replaceAll('비밀번호가','PIN이').replaceAll('비밀번호를','PIN을').replaceAll('비밀번호는','PIN은').replaceAll('비밀번호로','PIN으로').replaceAll('비밀번호','PIN')}
function openPinPad(input,options={}){
 if(!input?.isConnected||input.disabled||document.querySelector('.pin-pad-dialog[open]'))return;
 const dialog=document.createElement('dialog');dialog.className='pin-pad-dialog';if(options.protectedKind)dialog.dataset.protected=options.protectedKind;dialog.setAttribute('aria-labelledby','pin-pad-title');
 dialog.innerHTML=`<div class="pin-pad"><div class="pin-pad-head"><h2 id="pin-pad-title">PIN</h2><button type="button" class="pin-pad-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="pin-pad-dots" role="status" aria-live="polite" aria-label="PIN 0자리 입력"><i></i><i></i><i></i><i></i></div><div class="pin-pad-message" role="status" aria-live="polite"></div><div class="pin-pad-keys">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-pin-digit="${n}">${n}</button>`).join('')}<span></span><button type="button" data-pin-digit="0">0</button><button type="button" class="pin-pad-delete" aria-label="한 자리 지우기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9L3 12l6 7h12zM11 9l6 6m0-6-6 6"/></svg></button></div></div>`;
 const message=dialog.querySelector('.pin-pad-message');if(options.errorId)message.id=options.errorId;let value=input.value.replace(/[^0-9]/g,'').slice(0,4),replace=value.length===4,complete=false,busy=false;
 function paint(){const dots=dialog.querySelector('.pin-pad-dots');dots.setAttribute('aria-label',`PIN ${value.length}자리 입력`);dots.querySelectorAll('i').forEach((dot,i)=>dot.classList.toggle('is-filled',i<value.length))}
 async function add(digit){if(busy)return;if(replace){value='';replace=false}if(value.length>=4)return;message.textContent='';value+=digit;paint();if(value.length===4){input.value=value;if(options.onComplete){busy=true;dialog.classList.add('is-verifying');try{await options.onComplete(value);if(!dialog.isConnected)return;complete=true;dialog.close()}catch(err){if(!dialog.isConnected)return;value='';input.value='';replace=false;paint();message.textContent=pinMessage(err.message||'연결 상태를 확인해 주세요.')}finally{busy=false;dialog.classList.remove('is-verifying')}}else{complete=true;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));dialog.close()}}}
 function erase(){if(busy)return;message.textContent='';replace=false;value=value.slice(0,-1);paint()}
 dialog.querySelectorAll('[data-pin-digit]').forEach(button=>button.onclick=()=>add(button.dataset.pinDigit));
 dialog.querySelector('.pin-pad-delete').onclick=erase;dialog.querySelector('.pin-pad-close').onclick=()=>dialog.close();
 dialog.addEventListener('keydown',event=>{if(/^[0-9]$/.test(event.key)){event.preventDefault();add(event.key)}else if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();erase()}});
 dialog.addEventListener('close',()=>{const routed=dialog.dataset.routed==='true';dialog.remove();if(options.onClose)options.onClose(complete,routed);else if(!complete&&input.isConnected)input.focus({preventScroll:true})},{once:true});
 document.body.append(dialog);paint();dialog.showModal();dialog.querySelector('.pin-pad-close').focus({preventScroll:true});
}
document.addEventListener('click',event=>{const input=event.target.closest?.('input[data-pin-input]');if(input){event.preventDefault();openPinPad(input)}});
document.addEventListener('keydown',event=>{const input=event.target;if(input instanceof HTMLInputElement&&input.matches('[data-pin-input]')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openPinPad(input)}});
// Read-only PIN inputs avoid the device keyboard, so validate them before form handlers run.
document.addEventListener('submit',event=>{const invalid=[...event.target.querySelectorAll('input[data-pin-input]')].find(input=>!input.disabled&&!/^[0-9]{4}$/.test(input.value));if(invalid){event.preventDefault();event.stopImmediatePropagation();openPinPad(invalid)}},true);
function requestPin(){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='protected-dialog';dialog.setAttribute('aria-labelledby','pin-request-title');
  dialog.innerHTML=`<form class="protected-sheet"><div class="protected-sheet-head"><h2 id="pin-request-title">PIN</h2><button type="button" class="tool-icon protected-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><label class="protected-field"><span class="sr-only">PIN 4자리</span><input type="password" inputmode="none" readonly data-pin-input="true" pattern="[0-9]{4}" minlength="4" maxlength="4" title="숫자 4자리를 입력해 주세요" autocomplete="current-password" placeholder="PIN 4자리" required><button type="submit" class="protected-submit" aria-label="확인"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></label></form>`;
  document.body.append(dialog);let result=null;
  dialog.querySelector('.protected-close').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=event=>{event.preventDefault();result=dialog.querySelector('input').value;dialog.close()};
  dialog.addEventListener('close',()=>{dialog.remove();resolve(result)},{once:true});dialog.showModal();openPinPad(dialog.querySelector('input'));
 });
}
