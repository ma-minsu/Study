// Protected pages use the PIN keypad directly, without a second confirmation sheet.
function closeProtectedUnlock(){
 const pad=document.querySelector('.pin-pad-dialog[data-protected]');
 if(pad){pad.dataset.routed='true';if(pad.open)pad.close();pad.remove()}
 document.querySelector('.protected-unlock-context')?.remove();
 const legacy=document.querySelector('.protected-dialog');
 if(legacy){legacy.dataset.routed='true';if(legacy.open)legacy.close();legacy.remove()}
}
function showProtectedUnlock(kind,unlock){
 const routine=kind==='routine',errorId=routine?'routine-error':'ministry-error';
 homeView();
 const form=document.createElement('form');form.className='protected-unlock-context';form.hidden=true;
 const input=document.createElement('input');input.type='password';input.readOnly=true;input.setAttribute('data-pin-input','true');form.append(input);document.body.append(form);
 openPinPad(input,{
  protectedKind:kind,errorId,
  onComplete:password=>unlock(password,form),
  onClose:(completed,routed)=>{
   form.remove();
   if(!completed&&!routed&&location.hash==='#/'+kind){location.hash='#/home';requestAnimationFrame(()=>document.querySelector(`.home-category[href="#/${kind}"]`)?.focus())}
  }
 });
}
