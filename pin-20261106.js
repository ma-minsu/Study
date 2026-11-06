// PINs are validated by the existing server functions; never store them here.
function pinMessage(message){return String(message).replaceAll('작성 비밀번호','비밀번호').replaceAll('비밀번호가','PIN이').replaceAll('비밀번호를','PIN을').replaceAll('비밀번호는','PIN은').replaceAll('비밀번호로','PIN으로').replaceAll('비밀번호','PIN')}
document.addEventListener('input',event=>{
 const input=event.target;
 if(!(input instanceof HTMLInputElement)||input.type!=='password'||input.inputMode!=='numeric')return;
 const value=input.value.replace(/[^0-9]/g,'').slice(0,4);
 if(input.value!==value)input.value=value;
});
function requestPin(){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.className='protected-dialog';
  dialog.setAttribute('aria-labelledby','pin-request-title');
  dialog.innerHTML=`<form class="protected-sheet"><div class="protected-sheet-head"><h2 id="pin-request-title">PIN</h2><button type="button" class="tool-icon protected-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><label class="protected-field"><span class="sr-only">PIN 4자리</span><input type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" title="숫자 4자리를 입력해 주세요" autocomplete="current-password" placeholder="PIN 4자리" required autofocus><button type="submit" class="protected-submit" aria-label="확인"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></label></form>`;
  document.body.append(dialog);
  let result=null;
  dialog.querySelector('.protected-close').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=event=>{event.preventDefault();result=dialog.querySelector('input').value;dialog.close()};
  dialog.addEventListener('close',()=>{dialog.remove();resolve(result)},{once:true});
  dialog.showModal();
 });
}
