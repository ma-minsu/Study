// Reuse the couple portraits for page-level loading, without delaying the data.
function showCoupleLoading(){
 const app=document.querySelector('#app');
 app.innerHTML='<div class="loading page-loading" role="status" aria-label="불러오는 중"><span class="loading-orbit" aria-hidden="true"></span><div class="loading-avatars" aria-hidden="true" hidden><span class="loading-face loading-face-mine"></span><span class="loading-face loading-face-bora"></span></div></div>';
 const box=app.querySelector('.page-loading'),positions=['0%','33.3333%','66.6667%','100%'],assets=['assets/loading-couple-20261030d.webp','assets/loading-couple-20261030f.webp'],cache={};
 function load(src){if(!cache[src])cache[src]=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(src);image.onerror=reject;image.src=src});return cache[src]}
 function pick(){const n=Math.floor(Math.random()*8),sheet=Math.floor(n/4),column=n%4;return load(assets[sheet]).catch(()=>load(assets[1-sheet])).then(src=>({src,column}))}
 Promise.all([pick(),pick()]).then(faces=>{if(!box.isConnected)return;const man=box.querySelector('.loading-face-mine'),woman=box.querySelector('.loading-face-bora');man.style.backgroundImage=`url("${faces[0].src}")`;woman.style.backgroundImage=`url("${faces[1].src}")`;man.style.backgroundPosition=positions[faces[0].column]+' 0%';woman.style.backgroundPosition=positions[faces[1].column]+' 100%';box.querySelector('.loading-orbit').hidden=true;box.querySelector('.loading-avatars').hidden=false}).catch(()=>{});
}
