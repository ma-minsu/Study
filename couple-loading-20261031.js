// Keep the original random couple loader ready for subsequent screens and saves.
const coupleLoadingAssets=['assets/loading-couple-20261030d.webp','assets/loading-couple-20261030f.webp'];
const coupleLoadingPositions=['0%','33.3333%','66.6667%','100%'],coupleLoadingCache={};
function loadCouplePortrait(src){
 if(coupleLoadingCache[src])return coupleLoadingCache[src];
 const record={ready:false,promise:null},image=new Image();
 record.promise=new Promise((resolve,reject)=>{image.onload=()=>{record.ready=true;resolve(src)};image.onerror=()=>{delete coupleLoadingCache[src];reject(Error('image unavailable'))};image.src=src});
 coupleLoadingCache[src]=record;return record;
}
// Warm the small local images once; a failed request can be retried on the next use.
coupleLoadingAssets.forEach(src=>loadCouplePortrait(src).promise.catch(()=>{}));
function showCoupleLoading(target){
 const app=target||document.querySelector('#app'),full=!target;
 app.innerHTML='<div class="loading '+(full?'page-loading':'inline-couple-loading')+'" role="status" aria-label="불러오는 중"><span class="loading-orbit" aria-hidden="true"></span><div class="loading-avatars" aria-hidden="true" hidden><span class="loading-face loading-face-mine"></span><span class="loading-face loading-face-bora"></span></div></div>';
 const box=app.querySelector('.loading');
 const choices=Array.from({length:2},()=>{const n=Math.floor(Math.random()*8);return {sheet:Math.floor(n/4),column:n%4}});
 function apply(faces){
  if(!box.isConnected)return;
  const man=box.querySelector('.loading-face-mine'),woman=box.querySelector('.loading-face-bora');
  man.dataset.sheet=faces[0].src.endsWith('20261030f.webp')?'f':'d';man.style.backgroundImage=`url("${faces[0].src}")`;
  woman.dataset.sheet=faces[1].src.endsWith('20261030f.webp')?'f':'d';woman.style.backgroundImage=`url("${faces[1].src}")`;
  man.style.backgroundPosition=coupleLoadingPositions[faces[0].column]+' 0%';woman.style.backgroundPosition=coupleLoadingPositions[faces[1].column]+' 100%';
  box.querySelector('.loading-orbit').hidden=true;box.querySelector('.loading-avatars').hidden=false;
 }
 const cached=choices.map(choice=>({src:coupleLoadingAssets[choice.sheet],column:choice.column}));
 if(cached.every(face=>coupleLoadingCache[face.src]?.ready)){apply(cached);return}
 Promise.all(choices.map(choice=>loadCouplePortrait(coupleLoadingAssets[choice.sheet]).promise.catch(()=>loadCouplePortrait(coupleLoadingAssets[1-choice.sheet]).promise).then(src=>({src,column:choice.column})))).then(apply).catch(()=>{});
}
