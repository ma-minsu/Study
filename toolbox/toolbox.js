'use strict';
const db=supabase.createClient('https://jvfumjoagmmzlcarlurd.supabase.co','sb_publishable_615Ta0jNV-LhuiBin0_6gg_I93oTBkH',{auth:{storageKey:'ministry-toolbox-auth'}});
const app=document.querySelector('#app'), modal=document.querySelector('#modal'), dialog=document.querySelector('#dialog-content');
let managing=false;
try{managing=sessionStorage.getItem('toolbox-manage-mode')==='1'}catch{}
// Older bookmarked management links switch into the same per-tab mode.
const oldManagementURL=new URL(location.href);
const maintenanceMode=oldManagementURL.searchParams.get('maintenance')==='1';
if(oldManagementURL.searchParams.get('manage')==='1'){managing=true;try{sessionStorage.setItem('toolbox-manage-mode','1')}catch{}oldManagementURL.searchParams.delete('manage');history.replaceState(history.state,'',oldManagementURL.href)}
const icons={star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z"/>',plus:'<path d="M12 4v16M4 12h16"/>',edit:'<path d="M12 20h9M16.5 3.5l4 4L8 20H4v-4z"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',share:'<path d="M12 16V3m-5 5 5-5 5 5M5 14v6h14v-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13"/>',rotate:'<rect x="8" y="3" width="8" height="13" rx="1.5" transform="rotate(35 12 9.5)"/><path d="M4 16a9 9 0 0 0 15 2M19 21v-4h-4"/>'};
const icon=(name,label,extra='')=>`<button type="button" class="icon ${extra}" aria-label="${esc(label)}" title="${esc(label)}" data-action="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.close}</svg></button>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[],admin=false,session=null,filter='전체',favoritesOnly=false,categoryOrderRecord=null,savedScroll=0,viewerIndex=0,viewerItem=null,viewerHidden=false,startTouch=null;
const lastViewed=new Map();
const urlCache=new Map(),pendingImages=new Map(),preloadedImages=new Map(),preloadingImages=new Set();
let gridImageObserver=null,listHash='#/',hubScroll=0,thumbnailBackfillRunning=false;
const thumbnailAttempts=new Set();
function readStars(){try{const a=JSON.parse(localStorage.getItem('toolbox-stars')||'[]');return Array.isArray(a)?a:[]}catch{return []}}
let stars=readStars();
function starSave(){try{localStorage.setItem('toolbox-stars',JSON.stringify(stars))}catch{}}
function itemId(){const m=location.hash.match(/^#\/([0-9a-f-]{36})(?:\?[^#]*)?$/i);return m?m[1]:null}
function sharedSlideIndex(){const query=location.hash.split('?')[1];const raw=query&&new URLSearchParams(query).get('slide');return raw&&/^[1-9]\d{0,5}$/.test(raw)?Number(raw)-1:0}
function safeURL(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
async function signOne(path){
 const {data,error}=await db.storage.from('ministry-toolbox').createSignedUrl(path,3600);if(error)throw error;if(!data?.signedUrl)throw Error('이미지를 불러오지 못했어요.');urlCache.set(path,{url:data.signedUrl,until:Date.now()+3300000});return data.signedUrl;
}
async function signed(path){
 if(!path)return '';const cached=urlCache.get(path);if(cached&&cached.until>Date.now())return cached.url;
 if(pendingImages.has(path))return pendingImages.get(path);
 const request=signOne(path);pendingImages.set(path,request);
 try{return await request}finally{if(pendingImages.get(path)===request)pendingImages.delete(path)}
}
async function primeSigned(paths){
 const unique=[...new Set(paths.filter(Boolean))].filter(path=>{const cached=urlCache.get(path);return !(cached&&cached.until>Date.now())&&!pendingImages.has(path)});
 if(unique.length<2)return;
 const batch=Promise.resolve().then(()=>db.storage.from('ministry-toolbox').createSignedUrls(unique,3600)).catch(()=>({data:null,error:true}));
 const jobs=unique.map(path=>{
  const job=batch.then(({data,error})=>{const found=!error&&Array.isArray(data)?data.find(x=>x.path===path):null;if(found?.signedUrl){urlCache.set(path,{url:found.signedUrl,until:Date.now()+3300000});return found.signedUrl}return signOne(path)});
  pendingImages.set(path,job);job.finally(()=>{if(pendingImages.get(path)===job)pendingImages.delete(path)}).catch(()=>{});return job;
 });
 await Promise.allSettled(jobs);
}
function canWarmToolboxImages(){const c=navigator.connection;return !c?.saveData&&!['slow-2g','2g'].includes(c?.effectiveType)}
function warmCatalogSignatures(){
 if(managing||itemId()||!canWarmToolboxImages())return;
 const paths=items.filter(x=>x.published).slice(0,12).flatMap(x=>[x.cover_thumbnail||x.cover||x.images?.[0],x.images?.[0]]).filter(Boolean);
 if(paths.length>1)primeSigned(paths).catch(()=>{});
}
function warmTileItem(item){if(!item?.images?.length||!canWarmToolboxImages())return;preloadImage(item.images[0]);}
function preloadImage(path){
 const connection=navigator.connection;if(!path||connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType))return;
 const existing=preloadedImages.get(path);if(existing&&existing.until>Date.now()||preloadingImages.has(path))return;preloadingImages.add(path);
 signed(path).then(url=>{const img=new Image();img.decoding='async';if('fetchPriority' in img)img.fetchPriority='low';img.onerror=()=>preloadedImages.delete(path);img.src=url;preloadedImages.delete(path);preloadedImages.set(path,{img,until:Date.now()+3300000});while(preloadedImages.size>4)preloadedImages.delete(preloadedImages.keys().next().value)}).catch(()=>{}).finally(()=>preloadingImages.delete(path));
}
const imagePendingTimers=new WeakMap(),imageLoadingIndicators=new WeakMap();
function showImageLoadingIndicator(img){
 const parent=img.parentElement;if(!parent?.matches('.viewer-image,.tile-visual,.cover,.photo-preview,.slide-note-thumb,.slide-note-review-card')||imageLoadingIndicators.has(img))return;
 const indicator=document.createElement('span');indicator.className='toolbox-image-loader';indicator.setAttribute('role','status');indicator.setAttribute('aria-label','사진을 불러오는 중');parent.append(indicator);imageLoadingIndicators.set(img,indicator);
}
function imagePending(img,pending){
 const parent=img.parentElement;
 if(pending){
  img.dataset.loading='true';parent?.classList.remove('image-failed');parent?.setAttribute('aria-busy','true');
  if(!imagePendingTimers.has(img)){const timer=setTimeout(()=>{imagePendingTimers.delete(img);if(img.isConnected&&img.dataset.loading==='true'){img.parentElement?.classList.add('image-pending');showImageLoadingIndicator(img)}},250);imagePendingTimers.set(img,timer)}
 }else{
  delete img.dataset.loading;const timer=imagePendingTimers.get(img);if(timer)clearTimeout(timer);imagePendingTimers.delete(img);imageLoadingIndicators.get(img)?.remove();imageLoadingIndicators.delete(img);parent?.classList.remove('image-pending');parent?.removeAttribute('aria-busy');
 }
}
function imageLoaded(img){imagePending(img,false);if('originalAlt' in img.dataset){img.alt=img.dataset.originalAlt;delete img.dataset.originalAlt}const tile=img.closest('.tile'),cover=img.closest('.cover');if(tile)tile.removeAttribute('aria-label');if(cover)cover.setAttribute('aria-label','사진 보기')}
function imageFailed(img){if(!img.isConnected)return;const original=img.dataset.originalPath;if(original&&img.dataset.path!==original){urlCache.delete(img.dataset.path);img.dataset.path=original;loadImage(img);return}imagePending(img,false);img.parentElement?.classList.add('image-failed');if(!('originalAlt' in img.dataset))img.dataset.originalAlt=img.alt;img.alt=img.dataset.fallback||'이미지를 불러오지 못했습니다.';const tile=img.closest('.tile'),cover=img.closest('.cover');if(tile)tile.setAttribute('aria-label',(img.dataset.fallback||'사진')+' 사진 다시 불러오기');if(cover)cover.setAttribute('aria-label','사진 다시 불러오기');img.dispatchEvent(new Event('toolbox-image-error'))}

async function loadImage(img){
 if(!img.isConnected)return;imagePending(img,true);if(img.loading!=='lazy'&&'fetchPriority' in img)img.fetchPriority='high';
 try{const url=await signed(img.dataset.path);if(img.isConnected){img.onload=()=>imageLoaded(img);img.onerror=()=>imageFailed(img);img.src=url}}catch{imageFailed(img)}
}
function loadGroup(imgs){
 const live=imgs.filter(img=>img.isConnected);if(!live.length)return Promise.resolve();
 live.forEach(img=>imagePending(img,true));
 const first=loadImage(live[0]),rest=live.slice(1),priming=primeSigned(rest.map(img=>img.dataset.path));
 return Promise.allSettled([first,priming,...rest.map(loadImage)]);
}
async function fillImages(root=document){
 const imgs=[...root.querySelectorAll('img[data-path]')],lazy=root===app&&'IntersectionObserver' in window?imgs.filter(img=>img.loading==='lazy'):[];
 if(lazy.length){gridImageObserver?.disconnect();const observer=new IntersectionObserver(entries=>{const visible=[];for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);visible.push(e.target)}loadGroup(visible)},{rootMargin:'300px'});gridImageObserver=observer;lazy.forEach(img=>observer.observe(img))}
 await loadGroup(imgs.filter(img=>!lazy.includes(img)));
}
async function loadPrivateNotes(){const data=[];for(let start=0;;start+=500){const result=await db.from('toolbox_private_notes').select('item_id,description,reference_url,legacy_summary,slide_notes').order('item_id').range(start,start+499);if(result.error)return result;data.push(...result.data);if(result.data.length<500)return {data}}}
async function refresh(){let query=db.from('toolbox_items').select('*');if(!managing)query=query.eq('published',true);const [list,ordering,notes]=await Promise.all([query.order('sort_order').order('created_at'),db.from('toolbox_category_order').select('tags,age_tags,updated_at').eq('id',true).maybeSingle(),managing&&admin?loadPrivateNotes():Promise.resolve({data:[]})]);if(list.error)throw list.error;if(notes.error)throw notes.error;const byId=new Map((notes.data||[]).map(n=>[n.item_id,n]));items=(list.data||[]).map(record=>{const n=byId.get(record.id);return n?{...record,description:n.description,reference_url:n.reference_url,summary:n.legacy_summary,slide_notes:n.slide_notes||{}}:record});categoryOrderRecord=ordering.error?null:ordering.data;ageTags=categoryOrderRecord?.age_tags??defaultAgeTags;scheduleThumbnailBackfill()}
async function checkAdmin(){if(!managing){admin=false;session=null;return}const {data}=await db.auth.getSession();session=data.session;if(!session){admin=false;return}const result=await db.from('toolbox_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();admin=!!result.data&&!result.error}
const defaultAgeTags=['어린이','청소년','청년','중장년','어르신'];let ageTags=[...defaultAgeTags];
const defaultCategories=['어린이','청소년','청년','중장년','어르신','창조','자연','가족','행복','미래와 희망'];
const splitCategories=tags=>[...new Set((tags||[]).flatMap(t=>t==='창조와 자연'?['창조','자연']:[t]))];
function categories(){
 const used=new Set(items.filter(x=>x.published||admin).flatMap(x=>splitCategories(x.tags)));
 if(used.has('모든 연령'))ageTags.forEach(t=>used.add(t));used.delete('모든 연령');
 const order=[...new Set([...splitCategories(categoryOrderRecord?.tags??defaultCategories)])];
 return [...used].sort((a,b)=>{let x=order.indexOf(a),y=order.indexOf(b);return (x<0?999:x)-(y<0?999:y)||a.localeCompare(b,'ko')});
}
function listRoute(){
 const hash=location.hash;
 if(hash==='#/all')return {filter:'전체',favorites:false};
 if(hash==='#/favorites')return {filter:'전체',favorites:true};
 if(hash.startsWith('#/category/')){try{const tag=decodeURIComponent(hash.slice(11));if(tag)return {filter:tag,favorites:false}}catch{}}
 return null;
}
function menuButton(){return `<button type="button" class="icon more-action" data-action="menu" aria-label="설정" title="설정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button>`}
function render(){if(managing&&!admin){renderManagementGate();return}if(managing&&admin&&maintenanceMode){renderMaintenance();return}if(itemId()){gridImageObserver?.disconnect();if(admin)renderDetail();else renderPublicAlbum()}else if(listRoute())renderList();else renderHub()}
function renderManagementGate(){gridImageObserver?.disconnect();app.innerHTML='<section class="admin-gate"><h1>봉사 도구함 관리</h1><button type="button" class="primary" data-admin-login>로그인</button><button type="button" class="secondary" data-admin-finish>관리 종료</button></section>';app.querySelector('[data-admin-login]').onclick=login;app.querySelector('[data-admin-finish]').onclick=()=>exitManagement(false)}
const categoryIcons={
 '전체':'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
 '즐겨찾기':icons.star,
 '어린이':'<path d="M12 3 5 10l7 7 7-7-7-7ZM12 17v1c0 2 2 2 2 3"/><path d="m8 8 8 4"/>',
 '청소년':'<path d="M5 10 12 6l7 4-7 4-7-4ZM8 12v4c2.5 2 5.5 2 8 0v-4M19 10v5"/>',
 '청년':'<circle cx="12" cy="7" r="3"/><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20"/>',
 '중장년':'<circle cx="9.5" cy="8" r="2.8"/><path d="M3.8 19v-.8a5.7 5.7 0 0 1 11.4 0v.8M15.4 5.8a2.7 2.7 0 0 1 0 5.3M17 13.3a5.4 5.4 0 0 1 3.2 4.9v.8"/>',
 '어르신':'<circle cx="10.5" cy="8" r="3.2"/><path d="M4 20v-1a6.5 6.5 0 0 1 13 0v1M17.5 4v4M15.5 6h4"/>',
 '창조와 자연':'<path d="M19.5 4.5C11 4 5 7 5 13a5 5 0 0 0 5 5c6 0 9-6 9.5-13.5ZM4 20c3-4 6-7 11-10"/>',
 '창조':'<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
 '자연':'<path d="M19.5 4.5C11 4 5 7 5 13a5 5 0 0 0 5 5c6 0 9-6 9.5-13.5ZM4 20c3-4 6-7 11-10"/>',
 '가족':'<path d="m3.5 11 8.5-7 8.5 7M6.5 10v9.5h11V10M10 19.5v-5h4v5"/>',
 '행복':'<circle cx="12" cy="12" r="8"/><path d="M8 14.5c2 2.5 6 2.5 8 0M9 9h.01M15 9h.01"/>',
 '미래와 희망':'<path d="M12 3v3M4.5 9l2.2 1M19.5 9l-2.2 1M4 19h16M7 19a5 5 0 0 1 10 0"/>',
 '동물':'<path d="M8 13c-1.8 0-3 1.5-3 3 0 2 2 2.6 3.5 2 1-.5 2-.8 3.5-.8s2.5.3 3.5.8C17 18.6 19 18 19 16c0-1.5-1.2-3-3-3-1 0-2 .8-4 .8S9 13 8 13Z"/><circle cx="6.5" cy="9" r="1.2"/><circle cx="10" cy="6.5" r="1.2"/><circle cx="14" cy="6.5" r="1.2"/><circle cx="17.5" cy="9" r="1.2"/>'
};
function categoryEntry(label,href,index){const tone=label==='전체'?0:label==='즐겨찾기'?1:ageTags.includes(label)?[0,1,2,3,4][ageTags.indexOf(label)]:[...label].reduce((n,c)=>(n*31+c.codePointAt(0))%6,0);const glyph=categoryIcons[label]||'<path d="M4 5.5h6l9 9-5 5-10-9v-5ZM7.5 8.5h.01"/>';return `<a class="category-entry" href="${esc(href)}" ${admin&&index>=2?`data-category="${esc(label)}" draggable="true"`:``}><span class="category-mark category-tone-${tone}" aria-hidden="true"><svg viewBox="0 0 24 24">${glyph}</svg></span><span class="category-name">${esc(label)}</span></a>`}
function floatingBack(href,label){return `<a class="floating-back" href="${esc(href)}" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6"/></svg></a>`}
function renderHub(){
 gridImageObserver?.disconnect();const tags=categories();
 app.innerHTML=`<nav class="category-grid${admin?' admin-order':''}" aria-label="자료 분류">${categoryEntry('전체','#/all',0)}${categoryEntry('즐겨찾기','#/favorites',1)}${tags.map((t,i)=>categoryEntry(t,'#/category/'+encodeURIComponent(t),i+2)).join('')}</nav>${admin?`<button type="button" class="floating-back floating-add" data-hub-add aria-label="자료 추가" title="자료 추가"><svg viewBox="0 0 24 24" aria-hidden="true">${icons.plus}</svg></button>`:''}`;
 app.querySelectorAll('a[href^="#/"]').forEach(a=>a.onclick=()=>{hubScroll=window.scrollY});
 app.querySelector('[data-hub-add]')?.addEventListener('click',()=>edit());if(admin)enableCategoryDragging();
}
function renderMaintenance(){
 gridImageObserver?.disconnect();app.innerHTML='<section class="maintenance"><h1>도구함 백업</h1><button type="button" class="secondary" data-backup>백업 내려받기</button><button type="button" class="secondary" data-restore>백업 가져오기</button></section>';
 app.querySelector('[data-backup]').onclick=e=>downloadToolboxBackup(e.currentTarget);app.querySelector('[data-restore]').onclick=chooseToolboxBackup;
}
function enableCategoryDragging(){
 const grid=app.querySelector('.category-grid');if(!grid)return;let hold=null,drag=null,start=null,suppressUntil=0,savingOrder=false;
 const entries=()=>[...grid.querySelectorAll('[data-category]')];
 async function save(before){const order=entries().map(x=>x.dataset.category);if(order.join('\0')===before.join('\0'))return;if(!categoryOrderRecord||savingOrder){renderHub();notify('분류 순서를 불러오지 못했어요.');return}savingOrder=true;
  const full=[...new Set([...order,...(categoryOrderRecord.tags||[])])];
  try{const result=await db.from('toolbox_category_order').update({tags:full,updated_at:new Date().toISOString()}).eq('id',true).eq('updated_at',categoryOrderRecord.updated_at).select('tags,age_tags,updated_at').maybeSingle();if(result.error)throw result.error;if(!result.data)throw Error('다른 기기에서 순서가 바뀌었어요.');categoryOrderRecord=result.data;notify('순서를 바꿨어요')}
  catch(e){try{await refresh()}catch{}renderHub();notify(e.message||'순서를 저장하지 못했어요.')}finally{savingOrder=false}
 }
 function moveTo(target){if(!drag||!target||target===drag||!target.dataset.category)return;const nodes=entries(),from=nodes.indexOf(drag),to=nodes.indexOf(target);if(from<0||to<0)return;grid.insertBefore(drag,from<to?target.nextSibling:target)}
 function closeControls(){app.querySelector('.category-adjust')?.remove();grid.querySelectorAll('.category-selected').forEach(x=>x.classList.remove('category-selected'))}
 function showControls(el){if(!el?.isConnected||savingOrder)return;closeControls();el.classList.add('category-selected');const nodes=entries(),i=nodes.indexOf(el),bar=document.createElement('div');bar.className='category-adjust';bar.setAttribute('role','group');bar.setAttribute('aria-label',el.dataset.category+' 순서 변경');bar.innerHTML=`<span>${esc(el.dataset.category)}</span><button type="button" data-step="-1" aria-label="${esc(el.dataset.category)} 앞으로 이동" ${i===0?'disabled':''}>‹</button><button type="button" data-step="1" aria-label="${esc(el.dataset.category)} 뒤로 이동" ${i===nodes.length-1?'disabled':''}>›</button><button type="button" data-dismiss aria-label="순서 변경 닫기">×</button>`;app.append(bar);bar.querySelector('[data-dismiss]').onclick=()=>{closeControls();el.focus()};bar.querySelectorAll('[data-step]').forEach(button=>button.onclick=async()=>{if(savingOrder)return;const before=entries().map(x=>x.dataset.category),nodes=entries(),target=nodes[nodes.indexOf(el)+Number(button.dataset.step)];if(!target)return;drag=el;moveTo(target);drag=null;bar.querySelectorAll('button').forEach(b=>b.disabled=true);await save(before);if(el.isConnected){showControls(el);app.querySelector('.category-adjust [data-step="'+button.dataset.step+'"]:not(:disabled)')?.focus()}})}
 grid.addEventListener('click',e=>{if(Date.now()<suppressUntil)e.preventDefault()},true);
 entries().forEach(el=>{
  el.addEventListener('contextmenu',e=>{e.preventDefault();if(!start)showControls(el)});
  el.addEventListener('touchstart',e=>{if(e.touches.length!==1||savingOrder)return;const t=e.touches[0];start={x:t.clientX,y:t.clientY,before:entries().map(x=>x.dataset.category)};hold=setTimeout(()=>{if(!start)return;drag=el;drag.classList.add('category-dragging');navigator.vibrate?.(12)},450)},{passive:true});
  el.addEventListener('touchmove',e=>{if(!start||e.touches.length!==1)return;const t=e.touches[0];if(!drag&&Math.hypot(t.clientX-start.x,t.clientY-start.y)>10){clearTimeout(hold);start=null;return}if(drag){e.preventDefault();moveTo(document.elementFromPoint(t.clientX,t.clientY)?.closest('[data-category]'))}},{passive:false});
  function finish(cancelled){clearTimeout(hold);if(drag){const before=start?.before||[],selected=drag,moved=entries().map(x=>x.dataset.category).join('\0')!==before.join('\0');drag.classList.remove('category-dragging');drag=null;suppressUntil=Date.now()+600;if(cancelled){renderHub()}else if(moved){closeControls();save(before)}else showControls(selected)}start=null}
  el.addEventListener('touchend',()=>finish(false));el.addEventListener('touchcancel',()=>finish(true));
  el.addEventListener('dragstart',e=>{if(savingOrder){e.preventDefault();return}start={before:entries().map(x=>x.dataset.category)};drag=el;drag.classList.add('category-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.category)});
  el.addEventListener('dragover',e=>{if(drag){e.preventDefault();moveTo(el)}});
  el.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();const before=start.before;drag.classList.remove('category-dragging');drag=null;start=null;suppressUntil=Date.now()+600;save(before)});
  el.addEventListener('dragend',()=>{if(drag){drag.classList.remove('category-dragging');drag=null;start=null;renderHub()}});
  el.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();showControls(el);return}if(!e.altKey||!['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)||savingOrder)return;e.preventDefault();const nodes=entries(),i=nodes.indexOf(el),delta=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1,target=nodes[i+delta];if(!target)return;const before=nodes.map(x=>x.dataset.category);drag=el;moveTo(target);drag=null;el.focus();save(before)});
 });
}
function renderList(){
 gridImageObserver?.disconnect();const route=listRoute();if(!route){renderHub();return}filter=route.filter;favoritesOnly=route.favorites;listHash=location.hash;
 let shown=items.filter(x=>(!favoritesOnly||stars.includes(x.id))&&(filter==='전체'||(x.tags||[]).includes(filter)||splitCategories(x.tags).includes(filter)||(ageTags.includes(filter)&&(x.tags||[]).includes('모든 연령'))));
 if(ageTags.includes(filter))shown.sort((a,b)=>Number(!(a.tags||[]).includes(filter))-Number(!(b.tags||[]).includes(filter)));
 const heading=favoritesOnly?'즐겨찾기':filter;
 app.innerHTML=`<div class="collection-head"><h1>${esc(heading)}</h1><div class="collection-actions"></div></div><section class="grid" aria-label="자료">${shown.map(x=>`<a class="tile" href="#/${x.id}" data-item="${x.id}"><div class="tile-visual">${x.cover||x.images?.[0]?`<img data-path="${esc(x.cover_thumbnail||x.cover||x.images[0])}" ${x.cover_thumbnail?`data-original-path="${esc(x.cover||x.images[0])}"`:''} data-fallback="${esc(x.title)}" alt="" loading="lazy">`:'<div class="placeholder"></div>'}<span class="tile-title">${esc(x.title)}</span>${!x.published?'<small class="draft-badge">비공개</small>':''}</div></a>`).join('')}</section>${!shown.length?`<div class="empty">${favoritesOnly?'즐겨찾기 없음':'자료 없음'}${favoritesOnly||filter!=='전체'?'<a class="empty-reset" href="#/all">전체 보기</a>':''}</div>`:''}${floatingBack('#/','분류로 돌아가기')}`;
 fillImages(app);fitTileTitles(app);const tileNodes=[...app.querySelectorAll('[data-item]')];tileNodes.slice(0,2).forEach((tile,i)=>{const item=shown[i],firstImage=item?.images?.[0],thumbnail=tile.querySelector('img[data-path]');if(!firstImage||!thumbnail||thumbnail.dataset.path===firstImage)return;const warm=()=>{if(thumbnail.isConnected&&thumbnail.naturalWidth>0)warmTileItem(item)};if(thumbnail.complete&&thumbnail.naturalWidth>0)warm();else thumbnail.addEventListener('load',warm,{once:true})});tileNodes.forEach(a=>{const selected=shown.find(item=>item.id===a.dataset.item);a.addEventListener('pointerdown',()=>warmTileItem(selected),{passive:true});a.addEventListener('focus',()=>warmTileItem(selected));});app.querySelectorAll('[data-item]').forEach(a=>a.onclick=e=>{const img=a.querySelector('img[data-path]');if(img?.parentElement?.classList.contains('image-failed')){e.preventDefault();urlCache.delete(img.dataset.path);loadImage(img);return}savedScroll=window.scrollY;if(!admin&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.button===0){const selectedItem=shown.find(item=>item.id===a.dataset.item);if(selectedItem?.images?.length){e.preventDefault();showViewer(selectedItem,0)}}});
}

function fitTileTitles(root){
 const tiles=[...root.querySelectorAll('.tile')];
 function fit(){if(!root.isConnected)return;for(const tile of tiles){tile.classList.remove('tile-title-below');const title=tile.querySelector('.tile-title'),visual=tile.querySelector('img,.placeholder');if(title&&visual&&title.scrollHeight>visual.clientHeight*.55)tile.classList.add('tile-title-below')}}
 requestAnimationFrame(fit);document.fonts?.ready.then(fit);
}
function showMenu(item=null){
 const opts=admin?`<button type="button" data-menu="add">자료 추가</button>${item?'<button type="button" data-menu="edit">자료 수정</button><button type="button" data-menu="move-up">앞으로 이동</button><button type="button" data-menu="move-down">뒤로 이동</button>':''}<button type="button" data-menu="finish">관리 종료</button><button type="button" data-menu="logout">로그아웃</button>`:'<button type="button" data-menu="login">관리 로그인</button>';
 openDialog(`<div class="dialog-head"><h2>관리</h2>${icon('close','닫기')}</div><div class="menu-list">${opts}</div>`);
 dialog.querySelector('[data-menu="login"]')?.addEventListener('click',()=>{modal.close();login()});
 dialog.querySelector('[data-menu="add"]')?.addEventListener('click',()=>{modal.close();edit()});
 dialog.querySelector('[data-menu="edit"]')?.addEventListener('click',()=>{modal.close();edit(item)});
 dialog.querySelector('[data-menu="move-up"]')?.addEventListener('click',()=>{modal.close();moveItem(item,-1)});
 dialog.querySelector('[data-menu="move-down"]')?.addEventListener('click',()=>{modal.close();moveItem(item,1)});
 dialog.querySelector('[data-menu="finish"]')?.addEventListener('click',()=>exitManagement(false));
 dialog.querySelector('[data-menu="logout"]')?.addEventListener('click',()=>exitManagement(true));
}
const backupMaxBytes=64*1024*1024;
function blobDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 읽지 못했어요.'));reader.readAsDataURL(blob)})}
async function toolboxBackupData(){
 if(!admin||!managing)throw Error('관리자 로그인이 필요해요.');
 const records=[];let start=0;while(true){const r=await db.from('toolbox_items').select('*').order('id').range(start,start+499);if(r.error)throw r.error;records.push(...r.data);if(r.data.length<500)break;start+=500}
 const notes=[];let noteStart=0;while(true){const n=await db.from('toolbox_private_notes').select('item_id,description,reference_url,legacy_summary,slide_notes').order('item_id').range(noteStart,noteStart+499);if(n.error)throw n.error;notes.push(...n.data);if(n.data.length<500)break;noteStart+=500}const noteMap=new Map(notes.map(n=>[n.item_id,n]));for(const record of records){const n=noteMap.get(record.id);if(n){record.description=n.description;record.reference_url=n.reference_url;record.summary=n.legacy_summary;record.slide_notes=n.slide_notes||{}}}
 const files=Object.create(null);let total=0;const paths=[...new Set(records.flatMap(r=>[...(r.images||[]),...(r.cover?[r.cover]:[])]))];
 for(const path of paths){const result=await db.storage.from('ministry-toolbox').download(path);if(result.error||!result.data)throw Error('사진을 불러오지 못했어요. 연결을 확인해 주세요.');total+=result.data.size;if(total>backupMaxBytes)throw Error('사진 합계가 64MB를 넘어 한 번에 백업할 수 없어요.');files[path]=await blobDataURL(result.data)}
 return {format:'ministry-toolbox-backup',version:1,exported_at:new Date().toISOString(),categoryOrder:Array.isArray(categoryOrderRecord?.tags)?categoryOrderRecord.tags:[],categoryAges:Array.isArray(categoryOrderRecord?.age_tags)?categoryOrderRecord.age_tags:[],items:records,files};
}
async function downloadToolboxBackup(button){
 if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');
 try{const data=await toolboxBackupData(),blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='봉사도구함-백업-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('백업을 내려받았어요')}
 catch(err){notify(err.message||'백업하지 못했어요.')}finally{button.disabled=false;button.removeAttribute('aria-busy')}
}
function chooseToolboxBackup(){
 if(!admin||!managing)return;const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.hidden=true;document.body.append(input);input.addEventListener('cancel',()=>input.remove(),{once:true});
 input.onchange=async()=>{const file=input.files?.[0];input.remove();if(!file)return;let imported=0;
 try{if(file.size>backupMaxBytes*1.5)throw Error('백업 파일이 너무 커요.');const data=JSON.parse(await file.text());validateToolboxBackup(data);if(!await confirmAction('기존 자료는 그대로 두고, 백업에만 있는 자료를 비공개로 추가할까요?','가져오기'))return;modal.close();
 if(!categoryOrderRecord)throw Error('분류를 불러오지 못했어요. 다시 시도해 주세요.');const additional=splitCategories([...(data.categoryOrder||[]),...data.items.flatMap(record=>record.tags||[])]).filter(t=>!['모든 연령','전체','즐겨찾기'].includes(t));const tags=[...new Set([...(categoryOrderRecord.tags||[]),...additional])],ages=[...new Set([...(categoryOrderRecord.age_tags||[]),...(data.categoryAges||[]).filter(t=>tags.includes(t))])];if(tags.length!==(categoryOrderRecord.tags||[]).length||ages.length!==(categoryOrderRecord.age_tags||[]).length){const orderResult=await db.from('toolbox_category_order').update({tags,age_tags:ages,updated_at:new Date().toISOString()}).eq('id',true).eq('updated_at',categoryOrderRecord.updated_at).select('tags,age_tags,updated_at').maybeSingle();if(orderResult.error||!orderResult.data)throw Error('분류를 갱신하지 못했어요. 다시 시도해 주세요.');categoryOrderRecord=orderResult.data}
 for(const record of data.items){const existing=await db.from('toolbox_items').select('id').eq('id',record.id).maybeSingle();if(existing.error)throw existing.error;if(existing.data)continue;
 const paths=[...new Set([...record.images,...(record.cover?[record.cover]:[])])],uploaded=[],mapped=Object.create(null);let inserted=false;
 try{for(const path of paths){const source=data.files[path],response=await fetch(source),blob=await response.blob();if(!['image/jpeg','image/png','image/webp','image/gif'].includes(blob.type)||blob.size>10485760)throw Error('백업 사진 형식이 올바르지 않아요.');const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[blob.type],target=`${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;const res=await db.storage.from('ministry-toolbox').upload(target,blob,{contentType:blob.type,upsert:false});if(res.error)throw res.error;uploaded.push(target);mapped[path]=target}
 const payload={id:record.id,title:record.title,description:record.description||'',...(typeof record.summary==='string'?{summary:record.summary}:{}),...(typeof record.landscape_enabled==='boolean'?{landscape_enabled:record.landscape_enabled}:{}),tags:record.tags,images:record.images.map(p=>mapped[p]),cover:record.cover?mapped[record.cover]:null,reference_url:record.reference_url||null,slide_notes:Object.fromEntries(Object.entries(record.slide_notes||{}).map(([path,note])=>[mapped[path]||path,note])),published:false,sort_order:Number.isSafeInteger(record.sort_order)?record.sort_order:Date.now(),updated_at:new Date().toISOString()};
 const result=await db.rpc('toolbox_save_with_slide_notes',itemSaveArgs(payload,true,null));if(result.error)throw result.error;if(!result.data?.id)throw Error('자료를 가져오지 못했어요.');inserted=true;imported++;
 }catch(err){if(!inserted&&uploaded.length){try{const check=await db.from('toolbox_items').select('id').eq('id',record.id).maybeSingle();if(!check.error&&!check.data)await db.storage.from('ministry-toolbox').remove(uploaded)}catch{}}throw err}
 }await refresh();render();notify(imported?`${imported}개 자료를 비공개로 가져왔어요`:'추가할 자료가 없어요');
 }catch(err){try{await refresh();render()}catch{}notify(imported?`${imported}개를 가져왔지만 나머지를 완료하지 못했어요.`:(err.message||'가져오지 못했어요.'))}
 };input.click();
}
function validateToolboxBackup(data){
 if(!data||data.format!=='ministry-toolbox-backup'||data.version!==1||!Array.isArray(data.items)||!data.files||typeof data.files!=='object')throw Error('봉사 도구함 백업 파일이 아니에요.');
 if(data.categoryOrder!==undefined&&(!Array.isArray(data.categoryOrder)||!data.categoryOrder.every(t=>typeof t==='string'&&t.length<=30)))throw Error('백업 분류를 확인해 주세요.');if(data.categoryAges!==undefined&&(!Array.isArray(data.categoryAges)||!data.categoryAges.every(t=>typeof t==='string'&&t.length<=30)))throw Error('백업 연령 분류를 확인해 주세요.');
 const seen=new Set();for(const r of data.items){if(!r||typeof r.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)||seen.has(r.id)||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||!Array.isArray(r.images)||!Array.isArray(r.tags)||!r.tags.every(t=>typeof t==='string'))throw Error('백업 자료를 확인해 주세요.');if(r.landscape_enabled!==undefined&&typeof r.landscape_enabled!=='boolean')throw Error('백업의 가로 보기 설정을 확인해 주세요.');if(r.slide_notes!==undefined&&!validSlideNotes(r.slide_notes))throw Error('백업의 삽화 메모를 확인해 주세요.');seen.add(r.id);for(const p of [...r.images,...(r.cover?[r.cover]:[])])if(typeof p!=='string'||!Object.hasOwn(data.files,p)||typeof data.files[p]!=='string'||!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(data.files[p]))throw Error('백업 사진을 확인해 주세요.')}
}
async function exitManagement(signOut){
 try{if(signOut)await db.auth.signOut();managing=false;admin=false;session=null;try{sessionStorage.removeItem('toolbox-manage-mode')}catch{}await refresh();modal.close();if(location.hash!=='#/'){location.hash='#/'}else render()}catch{notify('변경하지 못했어요. 다시 시도해 주세요.')}
}
async function moveItem(x,step){
 if(!admin||!x)return;const index=items.findIndex(i=>i.id===x.id),target=index+step;if(index<0||target<0||target>=items.length)return;
 const neighbour=items[target],outside=items[target+step],newOrder=outside?Math.round((neighbour.sort_order+outside.sort_order)/2):neighbour.sort_order+step*1000;
 if(newOrder===neighbour.sort_order||(outside&&newOrder===outside.sort_order)){notify('순서를 조정할 수 없어요.');return}
 const result=await db.from('toolbox_items').update({sort_order:newOrder}).eq('id',x.id);if(result.error)notify('순서를 바꾸지 못했어요.');else{await refresh();render();notify('순서를 바꿨어요')}
}
function editCategoryOrder(){
 const defaults=defaultCategories;
 const used=new Set(items.flatMap(x=>splitCategories(x.tags)));if(used.has('모든 연령'))ageTags.forEach(t=>used.add(t));used.delete('모든 연령');const current=[...used];
 const order=[...new Set([...splitCategories(categoryOrderRecord?.tags),...defaults,...current])].filter(t=>current.includes(t));
 if(!categoryOrderRecord){notify('분류 순서를 불러오지 못했어요.');return}
 openDialog(`<div class="dialog-head"><h2>분류 순서</h2>${icon('close','닫기')}</div><div class="category-order"></div><p class="error" role="alert"></p><button type="button" class="primary category-save">저장</button>`);
 const list=dialog.querySelector('.category-order');
 function draw(){list.innerHTML=order.length?order.map((t,i)=>`<div class="category-order-row"><span>${esc(t)}</span><div><button type="button" data-up="${i}" aria-label="${esc(t)} 앞으로 이동" ${i===0?'disabled':''}>↑</button><button type="button" data-down="${i}" aria-label="${esc(t)} 뒤로 이동" ${i===order.length-1?'disabled':''}>↓</button></div></div>`).join(''):'<p class="empty">분류 없음</p>';list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.up);if(i>0){[order[i-1],order[i]]=[order[i],order[i-1]];draw()}});list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.down);if(i<order.length-1){[order[i+1],order[i]]=[order[i],order[i+1]];draw()}})}draw();
 dialog.querySelector('.category-save').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const res=await db.from('toolbox_category_order').update({tags:order,updated_at:new Date().toISOString()}).eq('id',true).eq('updated_at',categoryOrderRecord.updated_at).select('tags,age_tags,updated_at').maybeSingle();if(res.error)throw res.error;if(!res.data)throw Error('다른 기기에서 순서가 변경됐어요. 다시 열어 주세요.');categoryOrderRecord=res.data;modal.close();render();notify('저장했어요')}catch(err){dialog.querySelector('.error').textContent=err.message||'저장하지 못했어요.'}finally{b.disabled=false}};
}
function coverGeometryHint(item,path){
 const warmed=preloadedImages.get(path)?.img;let reference=warmed?.complete&&warmed.naturalWidth>0?warmed:null,fromOriginal=!!reference;
 if(!reference&&(item.cover||item.images?.[0])===path){const tile=[...app.querySelectorAll('[data-item]')].find(a=>a.dataset.item===item.id),img=tile?.querySelector('img');if(img?.complete&&img.naturalWidth>0)reference=img}
 if(!reference||!reference.naturalHeight)return '';const w=reference.naturalWidth,h=reference.naturalHeight,limit=(55*w/h).toFixed(3);return ` style="--cover-ratio:${w}/${h};--cover-bound:${limit}vh;${fromOriginal?`--cover-native:${w}px;`:''}"`;
}
function renderPublicAlbum(){
 const item=items.find(x=>x.id===itemId());if(!item){app.innerHTML='<p class="empty">자료를 찾을 수 없습니다.</p><a class="back" href="#/">← 목록</a>';return}
 app.innerHTML=`<div class="public-album-return"><button type="button" class="secondary" data-reopen>사진 보기</button>${floatingBack('#/','분류로 돌아가기')}</div>`;
 app.querySelector('[data-reopen]').onclick=()=>{if(item.images?.length)showViewer(item,0,{returnToHub:true})};
 if(item.images?.length)showViewer(item,Math.min(sharedSlideIndex(),item.images.length-1),{returnToHub:true});else app.querySelector('[data-reopen]').textContent='사진이 없어요';
}
let activeShareDialog=null,qrLoader=null,kakaoLoader=null;
const KAKAO_JAVASCRIPT_KEY='dc2fac74e4bcb9c4226b10b6fa6f9a5c';
function loadKakaoShare(){
 if(kakaoLoader)return kakaoLoader;
 kakaoLoader=new Promise((resolve,reject)=>{
  function ready(){try{if(!window.Kakao?.init)throw Error('카카오톡 공유를 불러오지 못했어요.');if(!window.Kakao.isInitialized())window.Kakao.init(KAKAO_JAVASCRIPT_KEY);if(!window.Kakao.Share?.sendDefault)throw Error('카카오톡 공유를 불러오지 못했어요.');resolve(window.Kakao)}catch(error){reject(error)}}
  if(window.Kakao){ready();return}
  const script=document.createElement('script');let timeout;function failed(){clearTimeout(timeout);script.remove();reject(Error('카카오톡 공유를 불러오지 못했어요.'))}
  script.src='https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js';script.integrity='sha384-dok87au0gKqJdxs7msEdBPNnKSRT+/mhTVzq+qOhcL464zXwvcrpjeWvyj1kCdq6';script.crossOrigin='anonymous';script.onload=()=>{clearTimeout(timeout);ready()};script.onerror=failed;timeout=setTimeout(failed,10000);document.head.append(script);
 }).catch(error=>{kakaoLoader=null;throw error});return kakaoLoader;
}
function loadQrGenerator(){
 if(window.qrcode)return Promise.resolve(window.qrcode);
 if(!qrLoader)qrLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='../vendor/qrcode-generator/qrcode-2.0.4.js';script.onload=()=>window.qrcode?resolve(window.qrcode):reject(Error('QR 코드를 불러오지 못했어요.'));script.onerror=()=>{script.remove();reject(Error('QR 코드를 불러오지 못했어요.'))};document.head.append(script)}).catch(error=>{qrLoader=null;throw error});
 return qrLoader;
}
function toolboxShareUrl(item,index=0){const url=new URL(location.pathname,location.origin);url.hash='/'+item.id+(index>0?'?slide='+(index+1):'');return url.href}
async function copyShareUrl(url){
 if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(url);return true}catch{}}
 const input=document.createElement('textarea');input.value=url;input.setAttribute('readonly','');input.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(input);input.select();let copied=false;try{copied=document.execCommand('copy')}catch{}input.remove();return copied;
}
function shareToolboxItem(item,index=0,host=document.body){
 if(item.published===false){notify('공개된 자료를 공유할 수 있어요');return}
 const url=toolboxShareUrl(item,index),previous=document.activeElement;
 if(activeShareDialog?.open)activeShareDialog.close();activeShareDialog?.remove();
 const sheet=document.createElement('dialog');activeShareDialog=sheet;sheet.className='toolbox-share-dialog';sheet.setAttribute('aria-labelledby','toolbox-share-title');sheet.innerHTML=`<div class="share-sheet"><header class="share-sheet-head"><h2 id="toolbox-share-title">공유</h2><button type="button" class="share-close" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></header><div class="share-qr-wrap"><div class="share-qr" role="img" aria-label="사진을 여는 QR 코드"><canvas></canvas><span class="share-qr-status">QR 코드 준비 중</span></div></div><div class="share-actions"><button type="button" class="share-action share-copy" aria-label="링크 복사" title="링크 복사"><span class="share-action-icon share-copy-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15 6-6"/><path d="m11 6.5 1.4-1.4a4.6 4.6 0 0 1 6.5 6.5L17.5 13"/><path d="m13 17.5-1.4 1.4a4.6 4.6 0 0 1-6.5-6.5L6.5 11"/></svg></span></button><button type="button" class="share-action share-kakao" aria-label="카카오톡" title="카카오톡"><span class="share-action-icon share-kakao-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 9C12.95 9 4 15.8 4 24.2c0 5.33 3.61 10.02 9.06 12.73l-1.7 6.1c-.15.52.45.94.9.64l7.22-4.8c1.45.25 2.97.38 4.52.38 11.05 0 20-6.8 20-15.05S35.05 9 24 9Z"/><text x="24" y="28.3" text-anchor="middle">TALK</text></svg></span></button></div><p class="share-feedback" role="status" aria-live="polite"></p><input class="share-url-fallback" aria-label="공유 주소" readonly hidden></div>`;
 host.append(sheet);sheet.showModal();
 const shareToken=crypto.randomUUID();let shareHistory=false;try{history.pushState({...history.state,toolboxShare:shareToken},'',location.href);shareHistory=true}catch{}
 function shareBack(event){if(event.state?.toolboxShare!==shareToken&&sheet.open)sheet.close()}
 window.addEventListener('popstate',shareBack);
 sheet.addEventListener('close',()=>{window.removeEventListener('popstate',shareBack);if(shareHistory&&history.state?.toolboxShare===shareToken)history.back();if(activeShareDialog===sheet)activeShareDialog=null;sheet.remove();if(previous?.isConnected)previous.focus({preventScroll:true})},{once:true});sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close()});sheet.querySelector('.share-close').onclick=()=>sheet.close();
 const feedback=sheet.querySelector('.share-feedback');function showUrl(){const field=sheet.querySelector('.share-url-fallback');field.value=url;field.hidden=false;field.focus();field.select()}
 sheet.querySelector('.share-copy').onclick=async()=>{if(await copyShareUrl(url))feedback.textContent='링크를 복사했어요';else{feedback.textContent='주소를 길게 눌러 복사해 주세요';showUrl()}};
 const kakaoButton=sheet.querySelector('.share-kakao');let kakaoShare=null,kakaoImage='',sdkUnavailable=false;
 async function prepareKakaoImage(retry=false){
  kakaoButton.disabled=true;kakaoButton.setAttribute('aria-busy','true');if(retry)feedback.textContent='사진을 준비하고 있어요';
  try{
   try{kakaoShare=await loadKakaoShare();sdkUnavailable=false}catch{sdkUnavailable=true;return}
   const path=item.images?.[index];if(!path)throw Error('공유할 사진이 없어요');
   const source=await signed(path),result=await Promise.race([kakaoShare.Share.scrapImage({imageUrl:source}),new Promise((_,reject)=>setTimeout(()=>reject(Error('사진 준비 시간이 초과됐어요')),12000))]);
   kakaoImage=safeURL(result?.infos?.original?.url);if(!kakaoImage)throw Error('사진을 준비하지 못했어요');
   if(retry&&sheet.isConnected)feedback.textContent='준비됐어요. 카카오톡을 다시 눌러 주세요';
  }catch{if(sheet.isConnected)feedback.textContent='사진을 준비하지 못했어요. 카카오톡을 눌러 다시 시도해 주세요'}
  finally{if(sheet.isConnected){kakaoButton.disabled=false;kakaoButton.removeAttribute('aria-busy')}}
 }
 prepareKakaoImage();
 async function fallbackShare(){if(navigator.share){feedback.textContent='공유 창에서 카카오톡을 선택해 주세요';try{await navigator.share({title:item.title,url})}catch(error){if(error.name!=='AbortError'){feedback.textContent='공유 창을 열지 못했어요. 링크를 복사해 주세요';showUrl()}}}else if(await copyShareUrl(url)){feedback.textContent='링크를 복사했어요. 카카오톡에 붙여 넣어 주세요'}else{feedback.textContent='주소를 복사해 카카오톡에 붙여 넣어 주세요';showUrl()}}
 kakaoButton.onclick=()=>{
  if(sdkUnavailable){fallbackShare();return}
  if(!kakaoShare||!kakaoImage){prepareKakaoImage(true);return}
  try{const link={mobileWebUrl:url,webUrl:url};kakaoShare.Share.sendDefault({objectType:'feed',content:{title:item.title,imageUrl:kakaoImage,link},buttons:[{title:'사진 보기',link}]});feedback.textContent=''}catch{fallbackShare()}
 };
 loadQrGenerator().then(makeQr=>{if(!sheet.isConnected)return;const qr=makeQr(0,'M');qr.addData(url);qr.make();const count=qr.getModuleCount(),quiet=4,scale=8,canvas=sheet.querySelector('canvas');canvas.width=canvas.height=(count+quiet*2)*scale;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#142b1c';for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))ctx.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);sheet.querySelector('.share-qr-status').hidden=true}).catch(()=>{const status=sheet.querySelector('.share-qr-status');if(status)status.textContent='QR 코드를 불러오지 못했어요';});
}

let quillPromise=null;
function loadQuill(){
 if(window.Quill)return Promise.resolve(window.Quill);if(quillPromise)return quillPromise;
 quillPromise=Promise.all([new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='../vendor/quill/quill-2.0.3.snow.css';link.onload=resolve;link.onerror=()=>{link.remove();reject(Error('편집기를 불러오지 못했어요.'))};document.head.append(link)}),new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='../vendor/quill/quill-2.0.3.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('편집기를 불러오지 못했어요.'))};document.head.append(script)})]).then(()=>window.Quill).catch(error=>{quillPromise=null;throw error});return quillPromise;
}
function cleanSlideDelta(note){const ops=Array.isArray(note?.ops)?note.ops.filter(op=>op&&typeof op.insert==='string').map(op=>{const attrs=op.attributes||{},allowed={};if(attrs.bold===true)allowed.bold=true;if(attrs.italic===true)allowed.italic=true;if(['bullet','ordered'].includes(attrs.list))allowed.list=attrs.list;return Object.keys(allowed).length?{insert:op.insert,attributes:allowed}:{insert:op.insert}}):[];return {ops:ops.length?ops:[{insert:'\n'}]}}
function slideNoteText(note){return cleanSlideDelta(note).ops.map(op=>op.insert).join('')}
function validSlideNotes(notes){if(!notes||typeof notes!=='object'||Array.isArray(notes))return false;try{if(new TextEncoder().encode(JSON.stringify(notes)).length>1048576)return false;return Object.entries(notes).every(([key,note])=>key.length>0&&key.length<=2048&&note&&typeof note==='object'&&!Array.isArray(note)&&Array.isArray(note.ops)&&new TextEncoder().encode(JSON.stringify(note)).length<=81920&&note.ops.every(op=>op&&typeof op==='object'&&typeof op.insert==='string'))}catch{return false}}
function renderSlideNoteReview(item){
 const section=app.querySelector('.slide-note-review');if(!section)return;const notes=item.slide_notes||{};const annotated=(item.images||[]).map((path,index)=>({path,index,note:notes[path]})).filter(x=>x.note&&slideNoteText(x.note).trim());
 if(!annotated.length){section.remove();return}section.innerHTML='<h2>삽화별 메모</h2><div class="slide-note-review-list">'+annotated.map(x=>`<article class="slide-note-review-card"><img data-path="${esc(x.path)}" alt="${x.index+1}번째 사진"><div><h3>${x.index+1}번째 사진</h3><div class="slide-note-readonly" data-note-index="${x.index}"></div></div></article>`).join('')+'</div>';
 fillImages(section);section.querySelectorAll('[data-note-index]').forEach(el=>{const path=item.images[+el.dataset.noteIndex];el.textContent=slideNoteText(notes[path]).trimEnd()});
 loadQuill().then(Quill=>{if(!section.isConnected)return;section.querySelectorAll('[data-note-index]').forEach(el=>{const path=item.images[+el.dataset.noteIndex],fallbackText=slideNoteText(notes[path]).trimEnd();try{el.textContent='';const reader=new Quill(el,{theme:'snow',readOnly:true,formats:['bold','italic','list'],modules:{toolbar:false}});reader.setContents(cleanSlideDelta(notes[path]),'silent')}catch{el.textContent=fallbackText}})}).catch(()=>{});
}
function renderDetail(){let x=items.find(i=>i.id===itemId());if(!x){app.innerHTML='<p class="empty">자료를 찾을 수 없습니다.</p><a class="back" href="#/">← 목록</a>';return}let cover=x.images?.[0],coverHint=cover?coverGeometryHint(x,cover):'';app.innerHTML=`<article class="detail"><header class="detail-head"><h1>${esc(x.title)}</h1><div class="detail-actions">${icon('star',stars.includes(x.id)?'즐겨찾기 해제':'즐겨찾기',stars.includes(x.id)?'active':'')}${icon('share','공유')}${admin?icon('edit','자료 수정'):''}</div></header>${cover?`<button class="cover" aria-label="사진 보기" data-open="resume"${coverHint}><img data-path="${esc(cover)}" data-fallback="${esc(x.title)}" alt="">${x.images.length>1?`<span class="cover-count" aria-hidden="true">1 / ${x.images.length}</span>`:''}</button>`:''}<section class="slide-note-review"></section>${x.description?`<p class="description">${esc(x.description)}</p>`:''}${safeURL(x.reference_url)?`<a class="reference" href="${esc(safeURL(x.reference_url))}" target="_blank" rel="noopener noreferrer">관련 자료 ↗</a>`:''}${floatingBack(listHash,listHash==='#/'?'분류로 돌아가기':'목록으로 돌아가기')}</article>`;fillImages(app);renderSlideNoteReview(x);app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const img=b.querySelector('img[data-path]');if(img&&b.classList.contains('image-failed')){urlCache.delete(img.dataset.path);loadImage(img);return}showViewer(x,b.dataset.open==='resume'?0:Number(b.dataset.open))});app.querySelector('[data-action="star"]').onclick=()=>{stars=stars.includes(x.id)?stars.filter(id=>id!==x.id):[...stars,x.id];starSave();renderDetail()};app.querySelector('[data-action="share"]').onclick=()=>shareToolboxItem(x);app.querySelector('[data-action="edit"]')?.addEventListener('click',()=>edit(x));}
function notify(t){const n=document.createElement('div');n.textContent=t;Object.assign(n.style,{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#314a3b',color:'white',padding:'10px 16px',borderRadius:'8px',zIndex:'50'});document.body.append(n);setTimeout(()=>n.remove(),2200)}
function openDialog(content){dialog.innerHTML=`<div class="dialog-body">${content}</div>`;if(!modal.open)modal.showModal();dialog.querySelector('[data-action="close"]')?.addEventListener('click',()=>modal.close())}
function login(){openDialog(`<div class="dialog-head"><h2>관리</h2>${icon('close','닫기')}</div><form class="form" id="login"><label>이메일<input type="email" name="email" autocomplete="username" required></label><label>비밀번호<input type="password" name="password" autocomplete="current-password" required></label><p class="error" role="alert"></p><button class="primary">로그인</button><button type="button" class="secondary" data-signup>계정 만들기</button></form>`);dialog.querySelector('[data-signup]').onclick=async()=>{const f=dialog.querySelector('form'),msg=f.querySelector('.error'),email=f.elements.namedItem('email'),password=f.elements.namedItem('password');if(!email.reportValidity()||!password.reportValidity())return;const result=await db.auth.signUp({email:email.value,password:password.value});if(result.error){msg.textContent=result.error.message;return}await db.auth.signOut();session=null;msg.textContent='계정을 만들었어요. 이메일 확인 후 관리자 권한을 설정해 주세요.'};dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();let f=e.currentTarget,b=f.querySelector('button'),msg=f.querySelector('.error');b.disabled=true;const {error}=await db.auth.signInWithPassword({email:f.elements.namedItem('email').value,password:f.elements.namedItem('password').value});if(error){msg.textContent='이메일과 비밀번호를 확인해 주세요.';b.disabled=false;return}await checkAdmin();if(!admin){await db.auth.signOut();session=null;msg.textContent='관리 권한이 없는 계정이에요.';b.disabled=false;return}modal.close();await refresh();render()}}
function confirmAction(title,action){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='confirm-dialog';d.innerHTML=`<div class="confirm-inner"><h2>${esc(title)}</h2><div><button type="button" data-cancel>취소</button><button type="button" class="confirm-primary" data-confirm>${esc(action)}</button></div></div>`;document.body.append(d);let done=false;const finish=value=>{if(done)return;done=true;d.close();d.remove();resolve(value)};d.querySelector('[data-cancel]').onclick=()=>finish(false);d.querySelector('[data-confirm]').onclick=()=>finish(true);d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});d.showModal();d.querySelector('[data-cancel]').focus()})}
const maxToolboxInput=40*1024*1024,maxToolboxStored=10*1024*1024,maxToolboxDimension=2048;
async function animatedToolboxImage(file){
 if(file.type==='image/gif')return true;
 if(file.type==='image/webp'){
  const b=new Uint8Array(await file.slice(0,32).arrayBuffer());if(b.length<21)return true;
  const tag=String.fromCharCode(...b.slice(12,16));return tag==='VP8X'?(b[20]&2)!==0:!['VP8 ','VP8L'].includes(tag);
 }
 if(file.type==='image/png'){
  const bytes=new Uint8Array(await file.slice(0,65536).arrayBuffer());if(bytes.length<20)return true;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8;
  while(p+12<=bytes.length){const size=view.getUint32(p),tag=String.fromCharCode(...bytes.slice(p+4,p+8));if(tag==='acTL')return true;if(tag==='IDAT'||tag==='IEND')return false;const next=p+12+size;if(next<=p||next>bytes.length)return true;p=next}return true;
 }
 return false;
}
async function decodeToolboxImage(file){
 if(typeof createImageBitmap==='function'){try{const bitmap=await createImageBitmap(file);return {image:bitmap,width:bitmap.width,height:bitmap.height,release:()=>bitmap.close()}}catch{}}
 const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('사진을 열지 못했어요.'));image.src=url});return {image,width:image.naturalWidth,height:image.naturalHeight,release:()=>URL.revokeObjectURL(url)}}catch(e){URL.revokeObjectURL(url);throw e}
}
function canvasBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality))}
async function prepareToolboxImage(file){
 if(await animatedToolboxImage(file)){if(file.size>maxToolboxStored)throw Error('움직이는 사진은 10MB 이하로 선택해 주세요.');return file}
 let decoded;
 try{decoded=await decodeToolboxImage(file);if(!decoded.width||!decoded.height)throw Error('사진 크기를 확인하지 못했어요.');
  const scale=Math.min(1,maxToolboxDimension/Math.max(decoded.width,decoded.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(decoded.width*scale));canvas.height=Math.max(1,Math.round(decoded.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('사진을 준비하지 못했어요.');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(decoded.image,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,'image/webp',.88);if(blob?.type!=='image/webp'&&file.type==='image/jpeg')blob=await canvasBlob(canvas,'image/jpeg',.88);canvas.width=1;canvas.height=1;
  if(!blob||!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('사진을 준비하지 못했어요.');
  if(blob.size>=file.size&&file.size<=maxToolboxStored)return file;
  if(blob.size>maxToolboxStored)throw Error('사진을 10MB 이하로 줄이지 못했어요.');
  return new File([blob],file.name,{type:blob.type,lastModified:file.lastModified});
 }catch(err){if(file.size<=maxToolboxStored)return file;throw Error(err?.message||'사진을 줄이지 못했어요.')}finally{decoded?.release()}
}
async function makeToolboxThumbnail(blob){
 let decoded;try{if(await animatedToolboxImage(blob))return null;decoded=await decodeToolboxImage(blob);if(!decoded.width||!decoded.height)return null;const scale=Math.min(1,640/Math.max(decoded.width,decoded.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(decoded.width*scale));canvas.height=Math.max(1,Math.round(decoded.height*scale));const context=canvas.getContext('2d');if(!context)return null;context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(decoded.image,0,0,canvas.width,canvas.height);const result=await canvasBlob(canvas,'image/webp',.84);canvas.width=1;canvas.height=1;if(!result||!['image/webp','image/png'].includes(result.type)||result.size>=blob.size)return null;return result}finally{decoded?.release()}
}
function canBackfillThumbnails(){return !!(admin&&managing&&session&&!maintenanceMode&&!modal.open&&!document.hidden&&!document.querySelector('.viewer')&&!navigator.connection?.saveData)}
function scheduleThumbnailBackfill(){
 if(!canBackfillThumbnails()||thumbnailBackfillRunning)return;const item=items.find(x=>x.id&&x.cover&&!x.cover_thumbnail&&x.updated_at&&!thumbnailAttempts.has(x.id+'|'+x.cover));if(!item)return;const key=item.id+'|'+item.cover;thumbnailAttempts.add(key);thumbnailBackfillRunning=true;
 setTimeout(async()=>{let path=null;try{if(!canBackfillThumbnails()){thumbnailAttempts.delete(key);return}const store=db.storage.from('ministry-toolbox'),source=await store.download(item.cover);if(source.error||!source.data)throw source.error||Error('photo unavailable');const thumb=await makeToolboxThumbnail(source.data);if(!thumb)return;if(!canBackfillThumbnails()){thumbnailAttempts.delete(key);return}const ext=thumb.type==='image/webp'?'webp':'png';path=`thumbnails/${crypto.randomUUID()}.${ext}`;const up=await store.upload(path,thumb,{contentType:thumb.type,upsert:false});if(up.error){path=null;throw up.error}if(!canBackfillThumbnails()){await store.remove([path]);path=null;thumbnailAttempts.delete(key);return}const result=await db.from('toolbox_items').update({cover_thumbnail:path}).eq('id',item.id).eq('cover',item.cover).eq('updated_at',item.updated_at).is('cover_thumbnail',null).select('id,cover,cover_thumbnail,updated_at').maybeSingle();if(result.error||!result.data){try{const check=await db.from('toolbox_items').select('cover_thumbnail').eq('id',item.id).maybeSingle();if(!check.error&&check.data?.cover_thumbnail!==path)await store.remove([path])}catch{}path=null;return}const current=items.find(x=>x.id===item.id&&x.cover===item.cover);if(current)current.cover_thumbnail=path;path=null}catch{}finally{thumbnailBackfillRunning=false;if(canBackfillThumbnails())scheduleThumbnailBackfill()}},800)
}
let editorToolsPromise=null;
function loadEditorTools(){
 if(editorToolsPromise)return editorToolsPromise;
 editorToolsPromise=Promise.all([new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='../vendor/toolbox-uploader/toolbox-uploader-1.css';link.onload=resolve;link.onerror=()=>{link.remove();reject(Error('사진 도구를 불러오지 못했어요.'))};document.head.append(link)}),new Promise((resolve,reject)=>{if(window.ToolboxUploader){resolve();return}const script=document.createElement('script');script.src='../vendor/toolbox-uploader/toolbox-uploader-1.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('사진 도구를 불러오지 못했어요.'))};document.head.append(script)})]).then(()=>window.ToolboxUploader).catch(err=>{editorToolsPromise=null;throw err});return editorToolsPromise;
}
function itemSaveArgs(payload,create,expected){return {p_id:payload.id,p_create:create,p_expected_updated_at:expected||null,p_title:payload.title,p_description:payload.description||'',p_tags:payload.tags,p_images:payload.images,p_cover:payload.cover||null,p_reference_url:payload.reference_url||null,p_landscape_enabled:!!payload.landscape_enabled,p_published:!!payload.published,p_sort_order:payload.sort_order??0,p_legacy_summary:payload.summary??null,p_slide_notes:payload.slide_notes||{}}}
function edit(item){
 let photos=[...(item?.images||[])],cover=item?.cover||photos[0]||'',files=new Map(),temp=[],dirty=false,saving=false,pickerPending=false,toolsFailed=false,photoSorter=null,photoPicker=null,editorTools=null;
 let activeSlide=photos[0]||null,slideEditor=null,slideEditorFallback=false;const slideNotes=new Map(Object.entries(item?.slide_notes||{}));
 const originalTags=splitCategories(item?.tags);const selected=new Set(originalTags.flatMap(t=>t==='모든 연령'?ageTags:[t]));
 let choices=[...new Set([...splitCategories(categoryOrderRecord?.tags??defaultCategories),...items.flatMap(x=>splitCategories(x.tags)),...selected])].filter(t=>t!=='모든 연령');
 openDialog(`<div class="editor-page"><header class="editor-header"><button class="editor-close icon" type="button" data-editor-close aria-label="닫기"><svg viewBox="0 0 24 24">${icons.close}</svg></button><h2>${item?'자료 수정':'자료 추가'}</h2><button class="editor-save" type="submit" form="editor">저장</button></header><form class="editor-form" id="editor"><label class="editor-name"><span>제목</span><input name="title" maxlength="120" required placeholder="자료 제목" value="${esc(item?.title||'')}"></label><section class="editor-section"><div class="section-head"><h3>사진</h3><span class="photo-count" aria-live="polite"></span></div><div class="editor-images"></div><p class="photo-hint" hidden>길게 눌러 순서를 바꿀 수 있어요</p><p class="photo-error" role="alert"></p></section><section class="editor-section slide-notes-section"><div class="section-head"><h3>삽화별 메모 <span class="field-optional">관리자만</span></h3><span class="slide-note-position" aria-live="polite"></span></div><p class="slide-note-empty">사진을 추가하면 사진마다 메모를 적을 수 있어요.</p><div class="slide-note-workspace" hidden><div class="slide-note-strip" role="group" aria-label="메모할 사진 선택"></div><div class="slide-note-edit-head"><button type="button" class="icon slide-note-prev" aria-label="이전 사진 메모"><svg viewBox="0 0 24 24">${icons.left}</svg></button><span class="slide-note-label"></span><button type="button" class="icon slide-note-next" aria-label="다음 사진 메모"><svg viewBox="0 0 24 24">${icons.right}</svg></button></div><div class="slide-note-starters" aria-label="메모 시작 문구"><button type="button" data-note-starter="질문: ">질문</button><button type="button" data-note-starter="보여 줄 점: ">보여 줄 점</button><button type="button" data-note-starter="성구: ">성구</button></div><div class="slide-note-toolbar"><button type="button" class="ql-bold" aria-label="굵게" title="굵게"></button><button type="button" class="ql-italic" aria-label="기울임" title="기울임"></button><button type="button" class="ql-list" value="bullet" aria-label="글머리 기호" title="글머리 기호"></button><button type="button" class="ql-list" value="ordered" aria-label="번호 목록" title="번호 목록"></button></div><div class="slide-note-editor" aria-label="삽화 메모"></div><textarea class="slide-note-fallback" aria-label="삽화 메모" placeholder="이 사진을 보여 주며 어떤 이야기를 할까요?" hidden></textarea><div class="slide-note-footer"><span class="slide-note-status" role="status">편집기를 불러오는 중…</span><span class="slide-note-count"></span></div></div><details class="overall-note" ${item?.description?'open':''}><summary>자료 전체 메모</summary><textarea name="description" rows="3" maxlength="5000" placeholder="자료 전체에 대해 참고할 내용을 적어 주세요">${esc(item?.description||'')}</textarea></details></section><section class="editor-section"><div class="section-head category-field-head"><h3>분류 <span class="field-optional">선택</span></h3><button type="button" class="category-manage-button">분류 관리</button></div><div class="category-quick" role="group" aria-label="분류 선택"></div><button type="button" class="category-more" hidden></button></section><details class="editor-section editor-optional" ${item?.reference_url?'open':''}><summary>관련 자료</summary><input name="reference" type="url" placeholder="https://" value="${esc(item?.reference_url||'')}"></details><section class="editor-section visibility-row"><span>가로 보기</span><label class="switch"><input type="checkbox" name="landscape_enabled" ${item?.landscape_enabled?'checked':''}><span aria-hidden="true"></span><span class="sr-only">가로 보기 사용</span></label></section><section class="editor-section visibility-row"><span>공개</span><label class="switch"><input type="checkbox" name="published" ${item?.published?'checked':''}><span aria-hidden="true"></span><span class="sr-only">자료 공개</span></label></section><p class="error" role="alert"></p><div class="editor-bottom">${item?'<button type="button" class="delete-text" data-delete>자료 삭제</button>':''}</div></form></div>`);
 modal.classList.add('editor-dialog');const f=dialog.querySelector('form'),list=f.querySelector('.editor-images');
 const changed=()=>{dirty=true};
 loadEditorTools().then(tools=>{if(!f.isConnected||!modal.open)return;editorTools=tools;setupPhotoSorting()}).catch(()=>{toolsFailed=true});
 async function tryClose(){if(saving)return;if(dirty&&!await confirmAction('변경 내용을 저장하지 않고 나갈까요?','나가기'))return;modal.close()}
 dialog.querySelector('[data-editor-close]').onclick=tryClose;
 const onCancel=e=>{e.preventDefault();tryClose()};modal.addEventListener('cancel',onCancel);
 modal.addEventListener('close',()=>{if(!modal.open)modal.classList.remove('editor-dialog');modal.removeEventListener('cancel',onCancel);if(photoPicker?.open)photoPicker.close();if(categoryManager?.open)categoryManager.close();slideEditor=null;photoSorter?.destroy();temp.forEach(URL.revokeObjectURL)},{once:true});
 f.addEventListener('input',changed);f.addEventListener('change',changed);
 let categoryManager=null,showAllCategories=false;
 function syncChoices(){choices=[...new Set([...splitCategories(categoryOrderRecord?.tags??defaultCategories),...items.flatMap(x=>splitCategories(x.tags)),...selected])].filter(t=>t!=='모든 연령')}
 function renderQuickCategories(){
  const quick=f.querySelector('.category-quick'),more=f.querySelector('.category-more');const activeAges=ageTags.filter(t=>choices.includes(t));const visible=showAllCategories?choices:choices.filter((tag,index)=>index<12||selected.has(tag));
  quick.innerHTML=(activeAges.length?`<button type="button" class="category-quick-choice category-all-ages" aria-pressed="${activeAges.every(t=>selected.has(t))}">모든 연령</button>`:'')+visible.map(tag=>`<button type="button" class="category-quick-choice" data-quick-tag="${esc(tag)}" aria-pressed="${selected.has(tag)}">${esc(tag)}</button>`).join('');
  more.hidden=choices.length<=12;more.textContent=showAllCategories?'접기':`분류 더 보기 (${choices.length})`;more.setAttribute('aria-expanded',String(showAllCategories));
  quick.querySelectorAll('[data-quick-tag]').forEach(button=>button.onclick=()=>{const tag=button.dataset.quickTag;selected.has(tag)?selected.delete(tag):selected.add(tag);button.setAttribute('aria-pressed',String(selected.has(tag)));const all=quick.querySelector('.category-all-ages');if(all)all.setAttribute('aria-pressed',String(activeAges.every(t=>selected.has(t))));changed()});
  const all=quick.querySelector('.category-all-ages');if(all)all.onclick=()=>{const clear=activeAges.every(t=>selected.has(t));for(const tag of activeAges)clear?selected.delete(tag):selected.add(tag);renderQuickCategories();quick.querySelector('.category-all-ages')?.focus({preventScroll:true});changed()};
 }
 f.querySelector('.category-more').onclick=()=>{showAllCategories=!showAllCategories;renderQuickCategories();f.querySelector('.category-more').focus({preventScroll:true})};
 renderQuickCategories();
 f.querySelector('.category-manage-button').onclick=openCategoryManager;
 function openCategoryManager(){
  if(categoryManager?.open)return;const manager=document.createElement('dialog');categoryManager=manager;manager.className='category-manager';manager.setAttribute('aria-label','분류 관리');manager.innerHTML=`<header class="category-manager-head"><h2>분류 관리</h2><button type="button" class="icon" data-close aria-label="닫기"><svg viewBox="0 0 24 24">${icons.close}</svg></button></header><div class="category-manager-body"><p class="category-manager-note">이름 변경과 삭제는 관련 자료에도 반영돼요.</p><form class="category-create"><label class="sr-only" for="category-new">새 분류 이름</label><input id="category-new" maxlength="30" placeholder="새 분류 이름" autocomplete="off"><button class="primary" type="submit">추가</button></form><p class="category-manager-error" role="alert"></p><div class="category-manager-list"></div></div>`;document.body.append(manager);
  const listBox=manager.querySelector('.category-manager-list'),error=manager.querySelector('.category-manager-error'),create=manager.querySelector('.category-create'),input=create.querySelector('input');let busy=false;
  function display(){const catalog=splitCategories(categoryOrderRecord?.tags??defaultCategories);listBox.innerHTML=catalog.map(t=>`<div class="category-manager-row" data-name="${esc(t)}"><span>${esc(t)}</span><button type="button" class="icon" data-rename aria-label="${esc(t)} 이름 변경"><svg viewBox="0 0 24 24">${icons.edit}</svg></button><button type="button" class="icon" data-remove aria-label="${esc(t)} 삭제"><svg viewBox="0 0 24 24">${icons.trash}</svg></button></div>`).join('')||'<p class="category-manager-empty">분류가 없어요</p>';listBox.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>renameRow(b.closest('[data-name]')));listBox.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeCategory(b.closest('[data-name]').dataset.name))}
  async function change(action,oldName,newName){if(busy)return false;if(!categoryOrderRecord?.updated_at){error.textContent='분류를 불러오지 못했어요. 다시 열어 주세요.';return false}busy=true;error.textContent='';manager.setAttribute('aria-busy','true');try{const result=await db.rpc('toolbox_change_category',{p_action:action,p_old:oldName||null,p_new:newName||null,p_expected_order:categoryOrderRecord.updated_at,p_editing_item:item?.id||null,p_expected_item:item?.updated_at||null});if(result.error)throw result.error;const data=result.data;if(!data?.updated_at)throw Error('분류를 저장하지 못했어요.');if(action==='create'){selected.add(newName);changed()}else if(selected.has(oldName)){selected.delete(oldName);if(action==='rename')selected.add(newName);changed()}if(item&&data.editing_item_updated_at)item.updated_at=data.editing_item_updated_at;const oldAges=ageTags;categoryOrderRecord={tags:data.tags,age_tags:data.age_tags,updated_at:data.updated_at};ageTags=data.age_tags;if(action!=='create'){for(const record of items){const affected=(record.tags||[]).includes(oldName)||(['창조','자연'].includes(oldName)&&(record.tags||[]).includes('창조와 자연'))||(oldAges.includes(oldName)&&(record.tags||[]).includes('모든 연령'));if(!affected)continue;record.tags=[...new Set(splitCategories(record.tags).flatMap(t=>t==='모든 연령'?oldAges:[t]).flatMap(t=>t===oldName?(action==='rename'?[newName]:[]):[t]))];record.updated_at=data.updated_at}}try{await refresh()}catch{}syncChoices();renderQuickCategories();display();return true}catch(e){error.textContent=e.message||'분류를 저장하지 못했어요. 다시 시도해 주세요.';return false}finally{busy=false;manager.removeAttribute('aria-busy')}}
  create.onsubmit=async event=>{event.preventDefault();const name=input.value.trim();if(!name){input.focus();return}if(await change('create',null,name)){input.value='';input.focus()}};
  function renameRow(row){if(busy)return;const oldName=row.dataset.name;row.innerHTML=`<input class="category-rename-visible" aria-label="분류 이름" maxlength="30" value="${esc(oldName)}"><button type="button" class="category-rename-save">저장</button><button type="button" class="category-rename-cancel">취소</button>`;const editInput=row.querySelector('.category-rename-visible');editInput.focus();editInput.select();row.querySelector('.category-rename-cancel').onclick=display;row.querySelector('.category-rename-save').onclick=async()=>{const name=editInput.value.trim();if(!name){editInput.focus();return}if(name===oldName){display();return}await change('rename',oldName,name)};editInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();row.querySelector('.category-rename-save').click()}if(e.key==='Escape'){e.preventDefault();display()}}}
  async function removeCategory(name){if(busy)return;const count=items.filter(x=>splitCategories(x.tags).includes(name)||(ageTags.includes(name)&&(x.tags||[]).includes('모든 연령'))).length;if(!await confirmAction(`‘${name}’ 분류를 삭제할까요? ${count}개 자료에서 이 분류만 제거됩니다.`,'삭제'))return;await change('delete',name,null)}
  manager.querySelector('[data-close]').onclick=()=>{if(!busy)manager.close()};manager.addEventListener('cancel',e=>{if(busy)e.preventDefault()});manager.addEventListener('close',()=>{manager.remove();if(categoryManager===manager)categoryManager=null;f.querySelector('.category-manage-button')?.focus({preventScroll:true})},{once:true});display();manager.showModal();
 }
 function draw(){
  photoSorter?.destroy();photoSorter=null;list.classList.toggle('is-empty',photos.length===0);f.querySelector('.photo-count').textContent=photos.length?`${photos.length}장`:'';f.querySelector('.photo-hint').hidden=photos.length<2;
  list.innerHTML=photos.map((p,i)=>`<div class="photo-edit" draggable="true" data-photo="${i}"><div class="photo-preview"><img ${files.has(p)?`src="${esc(files.get(p).url)}"`:`data-path="${esc(p)}"`} alt="${i+1}번째 사진"><button type="button" class="photo-remove" data-remove="${i}" aria-label="${i+1}번째 사진 제거">×</button>${cover===p?'<span class="cover-badge">대표</span>':''}<button type="button" class="photo-note-open ${slideNotes.has(p)&&slideNoteText(slideNotes.get(p)).trim()?'has-note':''}" data-note-edit="${i}" aria-label="${i+1}번째 사진 메모"><svg viewBox="0 0 24 24">${icons.edit}</svg></button></div><div class="photo-actions"><button type="button" data-cover="${i}" aria-pressed="${cover===p}">${cover===p?'대표 사진':'대표로'}</button>${photos.length>1?`<span class="move-actions"><button type="button" data-up="${i}" aria-label="${i+1}번째 사진 앞으로 이동" ${i===0?'disabled':''}>‹</button><button type="button" data-down="${i}" aria-label="${i+1}번째 사진 뒤로 이동" ${i===photos.length-1?'disabled':''}>›</button></span>`:''}</div></div>`).join('')+`<div class="photo-add"><button type="button" class="photo-add-button"><span aria-hidden="true">＋</span><span>${photos.length?'사진 추가':'사진 선택'}</span><small>${photos.length?'':'여러 장을 한 번에 선택할 수 있어요'}</small></button><input name="files" type="file" data-extra-files accept="image/*" multiple aria-label="사진 여러 장 선택"></div>`;
  fillImages(list);list.querySelector('[data-extra-files]').onchange=e=>{const chosen=Array.from(e.target.files);e.target.value='';addFiles(chosen)};list.querySelector('.photo-add-button').onclick=openPhotoPicker;list.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{cover=photos[+b.dataset.cover];changed();draw()});list.querySelectorAll('[data-note-edit]').forEach(button=>button.onclick=()=>{activeSlide=photos[+button.dataset.noteEdit];drawSlideNotes();f.querySelector('.slide-notes-section').scrollIntoView({block:'start',behavior:'smooth'})});list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{let i=+b.dataset.up;if(i){[photos[i-1],photos[i]]=[photos[i],photos[i-1]];changed();draw()}});list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{let i=+b.dataset.down;if(i<photos.length-1){[photos[i+1],photos[i]]=[photos[i],photos[i+1]];changed();draw()}});list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{const index=+b.dataset.remove,path=photos[index];if(slideNotes.has(path)&&slideNoteText(slideNotes.get(path)).trim()&&!await confirmAction('이 사진과 작성한 메모를 함께 제거할까요?','제거'))return;photos.splice(index,1);if(!photos.includes(path))slideNotes.delete(path);if(!photos.includes(cover))cover=photos[0]||'';changed();draw()});
  setupPhotoSorting();drawSlideNotes();
 }
 function drawSlideNotes(){
  const workspace=f.querySelector('.slide-note-workspace'),empty=f.querySelector('.slide-note-empty'),strip=f.querySelector('.slide-note-strip');workspace.hidden=!photos.length;empty.hidden=!!photos.length;
  if(!photos.length){activeSlide=null;f.querySelector('.slide-note-position').textContent='';return}if(!photos.includes(activeSlide))activeSlide=photos[0];const index=photos.indexOf(activeSlide);
  f.querySelector('.slide-note-position').textContent=`${index+1} / ${photos.length}`;f.querySelector('.slide-note-label').textContent=`${index+1}번째 사진`;f.querySelector('.slide-note-prev').disabled=index===0;f.querySelector('.slide-note-next').disabled=index===photos.length-1;
  strip.innerHTML=photos.map((path,i)=>`<button type="button" class="slide-note-thumb" data-note-slide="${i}" aria-label="${i+1}번째 사진 메모" aria-pressed="${path===activeSlide}"><img ${files.has(path)?`src="${esc(files.get(path).url)}"`:`data-path="${esc(path)}"`} alt=""><span>${i+1}</span>${slideNotes.has(path)&&slideNoteText(slideNotes.get(path)).trim()?'<i aria-hidden="true"></i>':''}</button>`).join('');fillImages(strip);
  strip.querySelectorAll('[data-note-slide]').forEach(button=>button.onclick=()=>{const next=photos[+button.dataset.noteSlide];if(next===activeSlide)return;activeSlide=next;drawSlideNotes();strip.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'})});
  f.querySelector('.slide-note-prev').onclick=()=>{if(index>0){activeSlide=photos[index-1];drawSlideNotes();strip.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}};
  f.querySelector('.slide-note-next').onclick=()=>{if(index<photos.length-1){activeSlide=photos[index+1];drawSlideNotes();strip.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}};
  loadActiveSlide();
 }
 function updateSlideNoteCount(){const text=activeSlide?slideNoteText(slideNotes.get(activeSlide)):'';const over=text.trimEnd().length>5000;f.querySelector('.slide-note-count').textContent=`${text.trimEnd().length} / 5000`;f.querySelector('.slide-note-count').classList.toggle('over-limit',over);if(slideEditor||slideEditorFallback)f.querySelector('.slide-note-status').textContent=over?'사진당 5000자까지 적을 수 있어요.':slideEditorFallback?'서식 도구를 불러오지 못해 기본 입력으로 열었어요.':'자료 저장 시 함께 저장돼요'}
 function loadActiveSlide(){const note=cleanSlideDelta(slideNotes.get(activeSlide));if(slideEditor){slideEditor.setContents(note,'silent');slideEditor.history.clear()}else if(slideEditorFallback)f.querySelector('.slide-note-fallback').value=slideNoteText(note).replace(/\n$/,'');updateSlideNoteCount()}
 function storeSlideNote(note){if(!activeSlide)return;if(slideNoteText(note).trim())slideNotes.set(activeSlide,note);else slideNotes.delete(activeSlide);const current=f.querySelector('.slide-note-thumb[aria-pressed="true"]');if(current){let indicator=current.querySelector('i');const photoButton=list.querySelector(`[data-note-edit="${photos.indexOf(activeSlide)}"]`);photoButton?.classList.toggle('has-note',slideNotes.has(activeSlide));if(slideNotes.has(activeSlide)&&!indicator){indicator=document.createElement('i');indicator.setAttribute('aria-hidden','true');current.append(indicator)}else if(!slideNotes.has(activeSlide))indicator?.remove()}updateSlideNoteCount();changed()}
 const fallback=f.querySelector('.slide-note-fallback');f.querySelectorAll('.slide-note-toolbar button,.slide-note-starters button').forEach(button=>button.disabled=true);fallback.addEventListener('input',()=>storeSlideNote({ops:[{insert:fallback.value+'\n'}]}));
 f.querySelectorAll('[data-note-starter]').forEach(button=>button.onclick=()=>{const text=button.dataset.noteStarter;if(slideEditor){const selection=slideEditor.getSelection(true),position=selection?selection.index+selection.length:Math.max(0,slideEditor.getLength()-1);slideEditor.insertText(position,text,'user');slideEditor.setSelection(position+text.length,0,'silent')}else if(slideEditorFallback){const position=fallback.selectionEnd??fallback.value.length;fallback.setRangeText(text,position,position,'end');fallback.dispatchEvent(new Event('input',{bubbles:true}));fallback.focus()}});
 loadQuill().then(Quill=>{if(!f.isConnected||!modal.open)return;const editorNode=f.querySelector('.slide-note-editor'),toolbar=f.querySelector('.slide-note-toolbar');slideEditor=new Quill(editorNode,{theme:'snow',placeholder:'이 사진을 보여 주며 어떤 이야기를 할까요?',formats:['bold','italic','list'],modules:{toolbar}});slideEditor.root.setAttribute('aria-label','삽화 메모');f.querySelectorAll('.slide-note-toolbar button,.slide-note-starters button').forEach(button=>button.disabled=false);slideEditor.on('text-change',(delta,old,source)=>{if(source==='user')storeSlideNote(JSON.parse(JSON.stringify(slideEditor.getContents())))});f.querySelector('.slide-note-status').textContent='자료 저장 시 함께 저장돼요';loadActiveSlide()}).catch(()=>{if(!f.isConnected||!modal.open)return;slideEditorFallback=true;f.querySelectorAll('.slide-note-starters button').forEach(button=>button.disabled=false);f.querySelector('.slide-note-toolbar').hidden=true;f.querySelector('.slide-note-editor').hidden=true;fallback.hidden=false;f.querySelector('.slide-note-status').textContent='서식 도구를 불러오지 못해 기본 입력으로 열었어요.';loadActiveSlide()});
 function setupPhotoSorting(){
  if(!editorTools||!list.isConnected)return;photoSorter?.destroy();
  photoSorter=editorTools.Sortable.create(list,{draggable:'.photo-edit',handle:'.photo-preview',filter:'.photo-remove,.photo-note-open',preventOnFilter:false,animation:150,delay:350,delayOnTouchOnly:true,touchStartThreshold:8,ghostClass:'photo-sort-ghost',chosenClass:'photo-sort-chosen',onEnd(event){const from=event.oldDraggableIndex,to=event.newDraggableIndex;if(from==null||to==null||from===to)return;const [moved]=photos.splice(from,1);photos.splice(to,0,moved);changed();draw()}});
  list.querySelectorAll('.photo-preview').forEach(preview=>preview.addEventListener('contextmenu',e=>e.preventDefault()));
 }
 async function openPhotoPicker(){
  if(pickerPending)return;
  if(toolsFailed){list.querySelector('[data-extra-files]').click();return}
  pickerPending=true;let picker=null,uppy=null;
  try{
   const tools=editorTools||await loadEditorTools();if(!modal.open||!f.isConnected)return;editorTools=tools;setupPhotoSorting();
   picker=document.createElement('dialog');photoPicker=picker;picker.className='photo-picker-dialog';picker.setAttribute('aria-label','사진 선택');picker.innerHTML='<div class="photo-picker-head"><h2>사진 선택</h2><button type="button" class="icon photo-picker-close" aria-label="닫기"><svg viewBox="0 0 24 24">'+icons.close+'</svg></button></div><div class="photo-picker-content"></div><div class="photo-picker-actions"><button type="button" class="primary photo-picker-add" disabled>사진 추가</button></div>';document.body.append(picker);
   uppy=new tools.Uppy({autoProceed:false,locale:tools.ko_KR,restrictions:{allowedFileTypes:['image/jpeg','image/png','image/webp','image/gif'],maxFileSize:maxToolboxInput}});
   uppy.use(tools.Dashboard,{inline:true,target:picker.querySelector('.photo-picker-content'),width:'100%',height:360,hideUploadButton:true,hideCancelButton:true,hideRetryButton:true,proudlyDisplayPoweredByUppy:false});
   const add=picker.querySelector('.photo-picker-add');const update=()=>{const n=uppy.getFiles().length;add.disabled=!n;add.textContent=n?`${n}장 추가`:'사진 추가'};uppy.on('file-added',update);uppy.on('file-removed',update);
   add.onclick=()=>{const chosen=uppy.getFiles().map(file=>file.data);picker.close();addFiles(chosen)};picker.querySelector('.photo-picker-close').onclick=()=>picker.close();picker.addEventListener('close',()=>{uppy.destroy();picker.remove();if(photoPicker===picker)photoPicker=null;list.querySelector('.photo-add-button')?.focus({preventScroll:true})},{once:true});picker.showModal();
  }catch{try{uppy?.destroy()}catch{}picker?.remove();if(photoPicker===picker)photoPicker=null;toolsFailed=true;f.querySelector('.photo-error').textContent='사진 도구를 불러오지 못했어요. 사진 선택을 다시 누르면 기본 선택창이 열립니다.'}finally{pickerPending=false}
 }
 function addFiles(chosen){let invalid=false;for(const file of chosen){if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>(file.type==='image/gif'?maxToolboxStored:maxToolboxInput)){invalid=true;continue}const id='new:'+crypto.randomUUID(),url=URL.createObjectURL(file);temp.push(url);files.set(id,{file,url});photos.push(id);if(!cover)cover=id;changed()}f.querySelector('.photo-error').textContent=invalid?'일부 사진을 추가하지 못했어요. JPG·PNG·WEBP는 40MB 이하, GIF는 10MB 이하로 선택해 주세요.':'';draw()}
 draw();
 f.onsubmit=async e=>{
  e.preventDefault();if(saving)return;const submit=dialog.querySelector('.editor-save'),msg=f.querySelector('.error');let uploaded=[];const saveId=item?.id||crypto.randomUUID();
  msg.textContent='';if(!photos.length){f.querySelector('.photo-error').textContent='사진을 하나 이상 선택해 주세요.';f.querySelector('.photo-add').scrollIntoView({block:'center',behavior:'smooth'});f.querySelector('.photo-add-button').focus({preventScroll:true});return}const overLimit=[...slideNotes.entries()].find(([path,note])=>photos.includes(path)&&slideNoteText(note).trimEnd().length>5000);if(overLimit){activeSlide=overLimit[0];drawSlideNotes();f.querySelector('.slide-notes-section').scrollIntoView({block:'start',behavior:'smooth'});msg.textContent='삽화별 메모는 사진당 5000자까지 적을 수 있어요.';return}const titleValue=f.elements.namedItem('title').value.trim();if(!titleValue){msg.textContent='제목을 입력해 주세요.';f.elements.namedItem('title').focus();return}
  saving=true;submit.disabled=true;submit.classList.add('is-pending');f.inert=true;f.setAttribute('aria-busy','true');
  try{const mapped=photos.slice();const queue=photos.map((p,i)=>({p,i})).filter(x=>files.has(x.p));
   for(let start=0;start<queue.length;start+=3){const batch=queue.slice(start,start+3);for(const {p} of batch){const entry=files.get(p);if(!entry.prepared)entry.prepared=await prepareToolboxImage(entry.file)}const outcomes=await Promise.allSettled(batch.map(async({p,i})=>{const file=files.get(p).prepared,path=`${crypto.randomUUID()}/${crypto.randomUUID()}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type]}`;const {error}=await db.storage.from('ministry-toolbox').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;files.get(p).path=path;uploaded.push(path);mapped[i]=path}));const failure=outcomes.find(x=>x.status==='rejected');if(failure)throw failure.reason}

   const mappedNotes=Object.fromEntries([...slideNotes].map(([path,note])=>[files.has(path)?files.get(path).path:path,note]));if(!validSlideNotes(mappedNotes))throw Error('삽화 메모가 너무 길거나 형식이 올바르지 않아요.');const payload={id:saveId,slide_notes:mappedNotes,title:titleValue,description:f.elements.namedItem('description').value.trim(),tags:[...selected],images:mapped,cover:files.has(cover)?files.get(cover).path:cover,reference_url:f.elements.namedItem('reference').value.trim()||null,landscape_enabled:f.elements.namedItem('landscape_enabled').checked,published:f.elements.namedItem('published').checked,updated_at:new Date().toISOString()};if(!item)payload.sort_order=Date.now();if(!payload.title)throw Error('이름을 입력해 주세요.');
   let res=await db.rpc('toolbox_save_with_slide_notes',itemSaveArgs(payload,!item,item?.updated_at));if(res.error)throw res.error;if(!res.data)throw Error('다른 기기에서 변경되었어요. 새로고침 후 다시 수정해 주세요.');uploaded=[];dirty=false;modal.close();await refresh();if(!item)location.hash='#/'+res.data.id;else render();notify('저장했어요');
  }catch(err){if(uploaded.length){try{const check=await db.from('toolbox_items').select('images').eq('id',saveId).maybeSingle();if(!check.error&&!(check.data?.images||[]).some(path=>uploaded.includes(path)))await db.storage.from('ministry-toolbox').remove(uploaded)}catch{}}msg.textContent=err.message||'저장하지 못했어요.'}finally{saving=false;submit.disabled=false;submit.classList.remove('is-pending');f.inert=false;f.removeAttribute('aria-busy')}
 };
 f.querySelector('[data-delete]')?.addEventListener('click',async()=>{if(saving||!await confirmAction('이 자료를 삭제할까요?','삭제'))return;const {error}=await db.from('toolbox_items').delete().eq('id',item.id);if(error){f.querySelector('.error').textContent='삭제하지 못했어요.';return}dirty=false;modal.close();await refresh();location.hash='#/';notify('삭제했어요')});
}
function showViewerQuickPreview(item,index,image){
 const path=item.images?.[index];if(!path||path!==item.cover)return;
 const tile=[...app.querySelectorAll('[data-item]')].find(node=>node.dataset.item===item.id),source=tile?.querySelector('img[data-path]');
 if(!source?.complete||!source.naturalWidth||!source.naturalHeight||![item.cover_thumbnail,item.cover].includes(source.dataset.path))return;
 try{
  const preview=document.createElement('canvas');preview.className='viewer-quick-preview';preview.setAttribute('aria-hidden','true');preview.width=source.naturalWidth;preview.height=source.naturalHeight;
  const context=preview.getContext('2d');if(!context)return;context.drawImage(source,0,0);image.before(preview);const area=image.parentElement;area?.classList.add('has-quick-preview');image.addEventListener('load',()=>{preview.remove();area?.classList.remove('has-quick-preview')},{once:true});
 }catch{}
}
function showViewer(item,index,{returnToHub=false}={}){
 viewerItem=item;viewerIndex=Math.max(0,Math.min(item.images.length-1,index));viewerHidden=false;
 const returnFocus=document.activeElement,token=crypto.randomUUID(),host=document.createElement('div'),el=document.createElement('div');let closed=false,suppressClickUntil=0,viewerHistory=false,landscapeMode=false,fullscreenOwned=false,fullscreenGuardTimer=null,starsChanged=false;const openedPortrait=window.innerHeight>=window.innerWidth;
 el.className='viewer';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','사진 보기');host.className='viewer-fullscreen-host';host.append(el);document.body.append(host);document.body.style.overflow='hidden';
 try{history.pushState({...history.state,toolboxViewer:token},'',location.href);viewerHistory=true}catch{}
 function cleanup(){if(closed)return;closed=true;landscapeMode=false;stopFullscreenGuard();exitViewerFullscreen();lastViewed.set(item.id,viewerIndex);host.remove();document.body.style.overflow='';document.removeEventListener('keydown',key);document.removeEventListener('fullscreenchange',onFullscreenChange);window.removeEventListener('popstate',onHistory);if(returnToHub&&itemId()===item.id){history.replaceState(history.state,'',location.pathname+location.search+'#/');render()}else if(starsChanged&&listRoute())renderList();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});scheduleThumbnailBackfill()}
 function close(){if(viewerHistory&&history.state?.toolboxViewer===token){history.back()}else cleanup()}
 function onHistory(e){if(e.state?.toolboxViewer!==token)cleanup()}
 window.addEventListener('popstate',onHistory);
 function exitViewerFullscreen(){if(fullscreenOwned){fullscreenOwned=false;if(document.fullscreenElement===host){try{Promise.resolve(document.exitFullscreen()).catch(()=>{})}catch{}}}}
 function stopFullscreenGuard(){window.removeEventListener('resize',guardFullscreenOrientation);if(fullscreenGuardTimer!==null){clearTimeout(fullscreenGuardTimer);fullscreenGuardTimer=null}}
 function guardFullscreenOrientation(){if(!closed&&!landscapeMode&&fullscreenOwned&&openedPortrait&&window.innerWidth>window.innerHeight){stopFullscreenGuard();exitViewerFullscreen()}}
 function onFullscreenChange(){if(fullscreenOwned&&document.fullscreenElement!==host){fullscreenOwned=false;stopFullscreenGuard()}}
 document.addEventListener('fullscreenchange',onFullscreenChange);
 function enterViewerFullscreen(){if(document.fullscreenElement||!host.requestFullscreen||document.fullscreenEnabled===false)return;try{Promise.resolve(host.requestFullscreen()).then(()=>{fullscreenOwned=document.fullscreenElement===host;if(closed){exitViewerFullscreen();return}if(fullscreenOwned){window.addEventListener('resize',guardFullscreenOrientation);fullscreenGuardTimer=setTimeout(stopFullscreenGuard,2000);guardFullscreenOrientation()}}).catch(()=>{})}catch{}}
 function updateOrientationButton(){el.classList.toggle('landscape-mode',landscapeMode);const button=el.querySelector('[data-action=rotate]');if(button){button.setAttribute('aria-pressed',String(landscapeMode));const label=landscapeMode?'가로 보기 끄기':'가로 보기';button.setAttribute('aria-label',label);button.title=label}}
 function toggleLandscape(){if(closed)return;landscapeMode=!landscapeMode;updateOrientationButton()}
 function prefetch(){for(const i of [viewerIndex-1,viewerIndex+1])if(i>=0&&i<item.images.length&&!closed)preloadImage(item.images[i])}
 function warmSecondAhead(image,index){
  const c=navigator.connection;if(c?.saveData||['slow-2g','2g','3g'].includes(c?.effectiveType)||index+2>=item.images.length)return;
  const warm=()=>{if(!closed&&viewerIndex===index&&image.isConnected&&image.naturalWidth>0)preloadImage(item.images[index+2])};
  if(image.complete&&image.naturalWidth>0)warm();else image.addEventListener('load',warm,{once:true});
 }
 let viewerSignaturesPrimed=false;
 function draw(){
  lastViewed.set(item.id,viewerIndex);el.classList.toggle('hidden-ui',viewerHidden);const multiple=item.images.length>1;
  el.innerHTML=`<div class="viewer-head"><div class="viewer-head-actions">${icon('star',stars.includes(item.id)?'즐겨찾기 해제':'즐겨찾기',stars.includes(item.id)?'active':'')}${icon('share','공유')}</div>${icon('close','닫기')}</div><div class="viewer-image"><img data-path="${esc(item.images[viewerIndex])}" data-fallback="사진을 불러오지 못했어요" alt="${esc(item.title)} ${viewerIndex+1}"><button type="button" class="viewer-retry" hidden>다시 시도</button></div><div class="viewer-foot">${multiple?`${icon('left','이전 사진')}<span class="viewer-count" aria-label="${viewerIndex+1} / ${item.images.length}번째 사진">${viewerIndex+1} / ${item.images.length}</span>${icon('right','다음 사진')}`:''}</div>${item.landscape_enabled?icon('rotate','가로 보기','viewer-orientation'):''}`;
  const image=el.querySelector('.viewer-image img'),retry=el.querySelector('.viewer-retry');showViewerQuickPreview(item,viewerIndex,image);image.addEventListener('toolbox-image-error',()=>{retry.hidden=false});retry.onclick=e=>{e.stopPropagation();retry.hidden=true;urlCache.delete(image.dataset.path);loadImage(image)};fillImages(el);if(!viewerSignaturesPrimed){viewerSignaturesPrimed=true;if(canWarmToolboxImages()){const start=Math.max(0,viewerIndex-4),paths=item.images.slice(start,start+64).filter((_,i)=>start+i!==viewerIndex);primeSigned(paths).catch(()=>{})}}prefetch();warmSecondAhead(image,viewerIndex);el.querySelector('[data-action=close]').onclick=close;el.querySelector('[data-action=star]').onclick=()=>{stars=stars.includes(item.id)?stars.filter(id=>id!==item.id):[...stars,item.id];starSave();starsChanged=true;const button=el.querySelector('[data-action=star]'),active=stars.includes(item.id);button.classList.toggle('active',active);button.setAttribute('aria-label',active?'즐겨찾기 해제':'즐겨찾기');button.title=active?'즐겨찾기 해제':'즐겨찾기'};el.querySelector('[data-action=share]').onclick=()=>shareToolboxItem(item,viewerIndex,host);el.querySelector('[data-action=rotate]')?.addEventListener('click',toggleLandscape);updateOrientationButton();
  const previous=el.querySelector('[data-action=left]'),next=el.querySelector('[data-action=right]');if(previous&&next){previous.disabled=viewerIndex===0;next.disabled=viewerIndex===item.images.length-1;previous.onclick=()=>{if(viewerIndex>0){viewerIndex--;draw()}};next.onclick=()=>{if(viewerIndex<item.images.length-1){viewerIndex++;draw()}}}
  const area=el.querySelector('.viewer-image');area.onclick=()=>{if(Date.now()<suppressClickUntil)return;viewerHidden=!viewerHidden;el.classList.toggle('hidden-ui',viewerHidden)};
  area.ontouchstart=e=>{startTouch=e.touches.length===1&&(!window.visualViewport||window.visualViewport.scale<=1.05)?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null};
  area.ontouchend=e=>{if(!startTouch||e.changedTouches.length!==1||e.touches.length)return;const rawX=e.changedTouches[0].clientX-startTouch.x,rawY=e.changedTouches[0].clientY-startTouch.y,rotated=getComputedStyle(el).getPropertyValue('--manual-landscape').trim()==='1';let dx=rotated?rawY:rawX,dy=rotated?-rawX:rawY;startTouch=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil=Date.now()+400;const target=Math.max(0,Math.min(item.images.length-1,viewerIndex+(dx<0?1:-1)));if(target!==viewerIndex){viewerIndex=target;draw()}}};
 }
 function key(e){if(modal.open||activeShareDialog?.open)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='ArrowRight'&&viewerIndex<item.images.length-1){viewerIndex++;draw()}if(e.key==='ArrowLeft'&&viewerIndex>0){viewerIndex--;draw()}}
 document.addEventListener('keydown',key);draw();el.querySelector('[data-action=close]').focus({preventScroll:true});enterViewerFullscreen();
}
modal.addEventListener('close',()=>scheduleThumbnailBackfill());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleThumbnailBackfill()});
window.addEventListener('resize',()=>fitTileTitles(app));
window.addEventListener('hashchange',e=>{const oldHash=new URL(e.oldURL).hash,fromItem=/^#\/[0-9a-f-]{36}(?:\?[^#]*)?$/i.test(oldHash);render();const position=itemId()?0:listRoute()?(fromItem?savedScroll:0):hubScroll;requestAnimationFrame(()=>window.scrollTo(0,position))});
(async()=>{try{await checkAdmin();if(!managing||admin)await refresh();render();if(!managing)warmCatalogSignatures();if(managing&&!admin)login()}catch(e){app.innerHTML='<p class="empty">자료를 불러오지 못했어요.</p><button class="secondary" onclick="location.reload()">다시 시도</button>'}})();
