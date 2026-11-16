'use strict';
const db=supabase.createClient('https://jvfumjoagmmzlcarlurd.supabase.co','sb_publishable_615Ta0jNV-LhuiBin0_6gg_I93oTBkH',{auth:{storageKey:'ministry-toolbox-auth'}});
const app=document.querySelector('#app'), modal=document.querySelector('#modal'), dialog=document.querySelector('#dialog-content');
const icons={star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z"/>',plus:'<path d="M12 4v16M4 12h16"/>',edit:'<path d="M12 20h9M16.5 3.5l4 4L8 20H4v-4z"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',share:'<path d="M12 16V3m-5 5 5-5 5 5M5 14v6h14v-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13"/>'};
const icon=(name,label,extra='')=>`<button type="button" class="icon ${extra}" aria-label="${esc(label)}" title="${esc(label)}" data-action="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.close}</svg></button>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[],admin=false,session=null,filter='전체',favoritesOnly=false,categoryOrderRecord=null,savedScroll=0,viewerIndex=0,viewerItem=null,viewerHidden=false,startTouch=null;
const lastViewed=new Map();
const urlCache=new Map(),pendingImages=new Map();
let gridImageObserver=null;
function readStars(){try{const a=JSON.parse(localStorage.getItem('toolbox-stars')||'[]');return Array.isArray(a)?a:[]}catch{return []}}
let stars=readStars();
function starSave(){try{localStorage.setItem('toolbox-stars',JSON.stringify(stars))}catch{}}
function itemId(){const m=location.hash.match(/^#\/([0-9a-f-]{36})$/i);return m?m[1]:null}
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
function imagePending(img,pending){if(pending)img.dataset.loading='true';else delete img.dataset.loading;img.parentElement?.classList.toggle('image-pending',pending)}
function imageFailed(img){if(!img.isConnected)return;imagePending(img,false);img.alt=img.dataset.fallback||'이미지를 불러오지 못했습니다.';img.dispatchEvent(new Event('toolbox-image-error'))}
async function loadImage(img){
 if(!img.isConnected)return;imagePending(img,true);
 try{const url=await signed(img.dataset.path);if(img.isConnected){img.onload=()=>imagePending(img,false);img.onerror=()=>imageFailed(img);img.src=url}}catch{imageFailed(img)}
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
async function refresh(){const [list,ordering]=await Promise.all([db.from('toolbox_items').select('*').order('sort_order').order('created_at'),db.from('toolbox_category_order').select('tags,updated_at').eq('id',true).maybeSingle()]);if(list.error)throw list.error;items=list.data||[];categoryOrderRecord=ordering.error?null:ordering.data}
async function checkAdmin(){const {data}=await db.auth.getSession();session=data.session;if(!session){admin=false;return}const result=await db.from('toolbox_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();admin=!!result.data&&!result.error}
function render(){if(itemId()){gridImageObserver?.disconnect();renderDetail()}else renderList()}
function renderList(){
 gridImageObserver?.disconnect();
 const used=new Set(items.filter(x=>x.published||admin).flatMap(x=>x.tags||[]));
 const defaults=['청소년','청년','중장년','어르신','어린이','창조와 자연','가족','행복','미래와 희망'];
 const order=[...new Set([...(categoryOrderRecord?.tags||[]),...defaults])];
 let tags=[...used].filter(t=>t!=='모든 연령').sort((a,b)=>{let x=order.indexOf(a),y=order.indexOf(b);return (x<0?999:x)-(y<0?999:y)||a.localeCompare(b,'ko')});
 if(filter!=='전체'&&!tags.includes(filter))filter='전체';
 let shown=items.filter(x=>(!favoritesOnly||stars.includes(x.id))&&(filter==='전체'||(x.tags||[]).includes(filter)||(['어린이','청소년','청년','중장년','어르신'].includes(filter)&&(x.tags||[]).includes('모든 연령'))));
 if(['어린이','청소년','청년','중장년','어르신'].includes(filter))shown.sort((a,b)=>Number(!(a.tags||[]).includes(filter))-Number(!(b.tags||[]).includes(filter)));
 let visible=tags.slice(0,6);if(filter!=='전체'&&!visible.includes(filter))visible=[...visible.slice(0,5),filter];
 const chosenAll=filter==='전체'&&!favoritesOnly;
 app.innerHTML=`<div class="filter-toolbar"><nav class="filters unified-filters" aria-label="자료 분류"><button type="button" class="filter" data-filter="전체" aria-pressed="${chosenAll}">전체</button>${visible.map(t=>`<button type="button" class="filter" aria-pressed="${filter===t}" data-filter="${esc(t)}">${esc(t)}</button>`).join('')}${tags.length>6?'<button type="button" class="tags-more" data-action="more" aria-label="더 많은 분류">더 보기 ⌄</button>':''}</nav><div class="toolbar-actions"><button type="button" class="icon favorite-toggle ${favoritesOnly?'active':''}" data-action="favorites" aria-label="즐겨찾기만 보기" aria-pressed="${favoritesOnly}" title="즐겨찾기만 보기"><svg viewBox="0 0 24 24" aria-hidden="true">${icons.star}</svg></button>${admin?icon('plus','자료 추가'):''}<button type="button" class="icon more-action" data-action="menu" aria-label="설정" title="설정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></div></div><section class="grid" aria-label="자료">${shown.map(x=>`<a class="tile" href="#/${x.id}" data-item="${x.id}"><div class="tile-visual">${x.cover||x.images?.[0]?`<img data-path="${esc(x.cover||x.images[0])}" data-fallback="${esc(x.title)}" alt="" loading="lazy">`:'<div class="placeholder"></div>'}<span class="tile-title">${esc(x.title)}</span>${!x.published?'<small class="draft-badge">비공개</small>':''}</div></a>`).join('')}</section>${!shown.length?`<div class="empty">${favoritesOnly?(filter==='전체'?'즐겨찾기 없음':'이 분류의 즐겨찾기 없음'):'자료 없음'}${favoritesOnly||filter!=='전체'?'<button type="button" class="empty-reset" data-reset>전체 보기</button>':''}</div>`:''}`;
 fillImages(app);fitTileTitles(app);
 app.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;if(filter==='전체')favoritesOnly=false;renderList()});
 app.querySelector('[data-action="favorites"]').onclick=()=>{favoritesOnly=!favoritesOnly;renderList()};
 app.querySelector('[data-reset]')?.addEventListener('click',()=>{filter='전체';favoritesOnly=false;renderList()});
 app.querySelectorAll('[data-item]').forEach(a=>a.onclick=()=>{savedScroll=window.scrollY});
 app.querySelector('[data-action="more"]')?.addEventListener('click',()=>showTags(tags));
 app.querySelector('[data-action="menu"]').onclick=showMenu;app.querySelector('[data-action="plus"]')?.addEventListener('click',()=>edit());
}
function fitTileTitles(root){
 const tiles=[...root.querySelectorAll('.tile')];
 function fit(){if(!root.isConnected)return;for(const tile of tiles){tile.classList.remove('tile-title-below');const title=tile.querySelector('.tile-title'),visual=tile.querySelector('img,.placeholder');if(title&&visual&&title.scrollHeight>visual.clientHeight*.55)tile.classList.add('tile-title-below')}}
 requestAnimationFrame(fit);document.fonts?.ready.then(fit);
}
function showTags(tags){openDialog(`<div class="dialog-head"><h2>분류</h2>${icon('close','닫기')}</div><div class="tag-sheet">${tags.map(t=>`<button type="button" data-tag="${esc(t)}" aria-pressed="${filter===t}">${esc(t)}${filter===t?' <span aria-hidden="true">✓</span>':''}</button>`).join('')}</div>`);dialog.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{filter=b.dataset.tag;modal.close();renderList()})}
function showMenu(){
 openDialog(`<div class="dialog-head"><h2>설정</h2>${icon('close','닫기')}</div><div class="menu-list">${admin?'<button type="button" data-menu="categories">분류 순서</button><button type="button" data-menu="logout">로그아웃</button>':'<button type="button" data-menu="login">관리 로그인</button>'}</div>`);
 dialog.querySelector('[data-menu="login"]')?.addEventListener('click',()=>{modal.close();login()});
 dialog.querySelector('[data-menu="categories"]')?.addEventListener('click',()=>{modal.close();editCategoryOrder()});
 dialog.querySelector('[data-menu="logout"]')?.addEventListener('click',async()=>{await db.auth.signOut();await checkAdmin();await refresh();modal.close();renderList()});
}
function editCategoryOrder(){
 const defaults=['청소년','청년','중장년','어르신','어린이','창조와 자연','가족','행복','미래와 희망'];
 const current=[...new Set(items.flatMap(x=>x.tags||[]))].filter(t=>t!=='모든 연령');
 const order=[...new Set([...(categoryOrderRecord?.tags||[]),...defaults,...current])].filter(t=>current.includes(t));
 if(!categoryOrderRecord){notify('분류 순서를 불러오지 못했어요.');return}
 openDialog(`<div class="dialog-head"><h2>분류 순서</h2>${icon('close','닫기')}</div><div class="category-order"></div><p class="error" role="alert"></p><button type="button" class="primary category-save">저장</button>`);
 const list=dialog.querySelector('.category-order');
 function draw(){list.innerHTML=order.length?order.map((t,i)=>`<div class="category-order-row"><span>${esc(t)}</span><div><button type="button" data-up="${i}" aria-label="${esc(t)} 앞으로 이동" ${i===0?'disabled':''}>↑</button><button type="button" data-down="${i}" aria-label="${esc(t)} 뒤로 이동" ${i===order.length-1?'disabled':''}>↓</button></div></div>`).join(''):'<p class="empty">분류 없음</p>';list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.up);if(i>0){[order[i-1],order[i]]=[order[i],order[i-1]];draw()}});list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.down);if(i<order.length-1){[order[i+1],order[i]]=[order[i],order[i+1]];draw()}})}draw();
 dialog.querySelector('.category-save').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const res=await db.from('toolbox_category_order').update({tags:order,updated_at:new Date().toISOString()}).eq('id',true).eq('updated_at',categoryOrderRecord.updated_at).select('tags,updated_at').maybeSingle();if(res.error)throw res.error;if(!res.data)throw Error('다른 기기에서 순서가 변경됐어요. 다시 열어 주세요.');categoryOrderRecord=res.data;modal.close();renderList();notify('저장했어요')}catch(err){dialog.querySelector('.error').textContent=err.message||'저장하지 못했어요.'}finally{b.disabled=false}};
}
function renderDetail(){let x=items.find(i=>i.id===itemId());if(!x){app.innerHTML='<p class="empty">자료를 찾을 수 없습니다.</p><a class="back" href="#/">← 목록</a>';return}let cover=x.images?.[0];app.innerHTML=`<article class="detail"><div class="detail-head"><div></div><div>${admin?'<button type="button" class="icon" data-move="up" aria-label="앞으로 이동">↑</button><button type="button" class="icon" data-move="down" aria-label="뒤로 이동">↓</button>'+icon('edit','수정'):''}${icon('share','공유')}${icon('star',stars.includes(x.id)?'즐겨찾기 해제':'즐겨찾기',stars.includes(x.id)?'active':'')}</div></div><h1>${esc(x.title)}</h1>${cover?`<button class="cover" aria-label="사진 보기" data-open="resume"><img data-path="${esc(cover)}" data-fallback="${esc(x.title)}" alt=""><span class="expand" aria-hidden="true">⤢</span></button>`:''}${x.description?`<p class="description">${esc(x.description)}</p>`:''}${x.images?.length>1?`<div class="thumbs" aria-label="사진 선택">${x.images.map((p,i)=>`<button data-open="${i}" aria-label="${i+1}번째 사진 보기"><img data-path="${esc(p)}" alt=""></button>`).join('')}</div>`:''}${safeURL(x.reference_url)?`<a class="reference" href="${esc(safeURL(x.reference_url))}" target="_blank" rel="noopener noreferrer">관련 자료 ↗</a>`:''}<a class="back" href="#/">← 목록</a></article>`;fillImages(app);app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>showViewer(x,b.dataset.open==='resume'?(lastViewed.get(x.id)||0):Number(b.dataset.open)));app.querySelector('[data-action="star"]').onclick=()=>{stars=stars.includes(x.id)?stars.filter(id=>id!==x.id):[...stars,x.id];starSave();renderDetail()};app.querySelector('[data-action="share"]').onclick=async()=>{try{if(navigator.share)await navigator.share({title:x.title,url:location.href});else{await navigator.clipboard.writeText(location.href);notify('주소를 복사했어요')}}catch(e){if(e.name!=='AbortError')notify('주소를 복사하지 못했어요')}};app.querySelector('[data-action="edit"]')?.addEventListener('click',()=>edit(x));app.querySelectorAll('[data-move]').forEach(b=>b.onclick=async()=>{const index=items.findIndex(i=>i.id===x.id),step=b.dataset.move==='up'?-1:1,target=index+step;if(target<0||target>=items.length)return;const neighbour=items[target],outside=items[target+step];let newOrder=outside?Math.round((neighbour.sort_order+outside.sort_order)/2):neighbour.sort_order+step*1000;if(newOrder===neighbour.sort_order||(outside&&newOrder===outside.sort_order)){notify('순서를 조정할 수 없어요.');return}b.disabled=true;const result=await db.from('toolbox_items').update({sort_order:newOrder}).eq('id',x.id);if(result.error)notify('순서를 바꾸지 못했어요.');else{await refresh();renderDetail();notify('순서를 바꿨어요')}});}
function notify(t){const n=document.createElement('div');n.textContent=t;Object.assign(n.style,{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#314a3b',color:'white',padding:'10px 16px',borderRadius:'8px',zIndex:'50'});document.body.append(n);setTimeout(()=>n.remove(),2200)}
function openDialog(content){dialog.innerHTML=`<div class="dialog-body">${content}</div>`;if(!modal.open)modal.showModal();dialog.querySelector('[data-action="close"]')?.addEventListener('click',()=>modal.close())}
function login(){openDialog(`<div class="dialog-head"><h2>관리</h2>${icon('close','닫기')}</div><form class="form" id="login"><label>이메일<input type="email" name="email" autocomplete="username" required></label><label>비밀번호<input type="password" name="password" autocomplete="current-password" required></label><p class="error" role="alert"></p><button class="primary">로그인</button><button type="button" class="secondary" data-signup>계정 만들기</button></form>`);dialog.querySelector('[data-signup]').onclick=async()=>{const f=dialog.querySelector('form'),msg=f.querySelector('.error'),email=f.elements.namedItem('email'),password=f.elements.namedItem('password');if(!email.reportValidity()||!password.reportValidity())return;const result=await db.auth.signUp({email:email.value,password:password.value});if(result.error){msg.textContent=result.error.message;return}await db.auth.signOut();session=null;msg.textContent='계정을 만들었어요. 이메일 확인 후 관리자 권한을 설정해 주세요.'};dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();let f=e.currentTarget,b=f.querySelector('button'),msg=f.querySelector('.error');b.disabled=true;const {error}=await db.auth.signInWithPassword({email:f.elements.namedItem('email').value,password:f.elements.namedItem('password').value});if(error){msg.textContent='이메일과 비밀번호를 확인해 주세요.';b.disabled=false;return}await checkAdmin();if(!admin){await db.auth.signOut();session=null;msg.textContent='관리 권한이 없는 계정이에요.';b.disabled=false;return}modal.close();await refresh();render()}}
function confirmAction(title,action){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='confirm-dialog';d.innerHTML=`<div class="confirm-inner"><h2>${esc(title)}</h2><div><button type="button" data-cancel>취소</button><button type="button" class="confirm-primary" data-confirm>${esc(action)}</button></div></div>`;document.body.append(d);let done=false;const finish=value=>{if(done)return;done=true;d.close();d.remove();resolve(value)};d.querySelector('[data-cancel]').onclick=()=>finish(false);d.querySelector('[data-confirm]').onclick=()=>finish(true);d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});d.showModal();d.querySelector('[data-cancel]').focus()})}
function edit(item){
 let photos=[...(item?.images||[])],cover=item?.cover||photos[0]||'',files=new Map(),temp=[],dirty=false,saving=false,dragIndex=-1;
 const presets=['모든 연령','어린이','청소년','청년','중장년','어르신','창조와 자연','가족','행복','미래와 희망'];
 const selected=new Set(item?.tags||[]);const choices=[...new Set([...presets,...items.flatMap(x=>x.tags||[]),...selected])];
 openDialog(`<div class="editor-page"><header class="editor-header"><button class="editor-close icon" type="button" data-editor-close aria-label="닫기"><svg viewBox="0 0 24 24">${icons.close}</svg></button><h2>${item?'자료 수정':'자료 추가'}</h2><button class="editor-save" type="submit" form="editor">저장</button></header><form class="editor-form" id="editor"><label class="editor-name"><span class="sr-only">이름</span><input name="title" maxlength="120" required placeholder="이름" value="${esc(item?.title||'')}"></label><section class="editor-section"><div class="section-head"><h3>사진</h3></div><div class="editor-images"></div><p class="photo-error" role="alert"></p></section><section class="editor-section"><h3>내용</h3><textarea name="description" rows="3" maxlength="5000" placeholder="내용을 적어 주세요">${esc(item?.description||'')}</textarea></section><section class="editor-section"><h3>분류</h3><div class="editor-tags"></div><div class="add-tag"><input type="text" name="newtag" maxlength="30" placeholder="분류 추가" aria-label="새 분류"><button type="button" data-add-tag aria-label="분류 추가">＋</button></div></section><details class="editor-section editor-optional" ${item?.reference_url?'open':''}><summary>관련 자료</summary><input name="reference" type="url" placeholder="https://" value="${esc(item?.reference_url||'')}"></details><section class="editor-section visibility-row"><span>공개</span><label class="switch"><input type="checkbox" name="published" ${item?.published?'checked':''}><span aria-hidden="true"></span><span class="sr-only">자료 공개</span></label></section><p class="error" role="alert"></p><div class="editor-bottom">${item?'<button type="button" class="delete-text" data-delete>자료 삭제</button>':''}</div></form></div>`);
 modal.classList.add('editor-dialog');const f=dialog.querySelector('form'),list=f.querySelector('.editor-images'),tagList=f.querySelector('.editor-tags');
 const changed=()=>{dirty=true};
 async function tryClose(){if(saving)return;if(dirty&&!await confirmAction('변경 내용을 저장하지 않고 나갈까요?','나가기'))return;modal.close()}
 dialog.querySelector('[data-editor-close]').onclick=tryClose;
 const onCancel=e=>{e.preventDefault();tryClose()};modal.addEventListener('cancel',onCancel);
 modal.addEventListener('close',()=>{modal.classList.remove('editor-dialog');modal.removeEventListener('cancel',onCancel);temp.forEach(URL.revokeObjectURL)},{once:true});
 f.addEventListener('input',changed);f.addEventListener('change',changed);
 function drawTags(){tagList.innerHTML=choices.map(t=>`<button type="button" class="tag-choice" aria-label="${esc(t)}" aria-pressed="${selected.has(t)}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');tagList.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{selected.has(b.dataset.tag)?selected.delete(b.dataset.tag):selected.add(b.dataset.tag);changed();drawTags()})}
 function addTag(){const el=f.elements.namedItem('newtag'),value=el.value.trim();if(!value)return;if(!choices.includes(value))choices.push(value);selected.add(value);el.value='';changed();drawTags()}
 f.querySelector('[data-add-tag]').onclick=addTag;f.elements.namedItem('newtag').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addTag()}};drawTags();
 function draw(){
  list.innerHTML=photos.map((p,i)=>`<div class="photo-edit" draggable="true" data-photo="${i}"><div class="photo-preview"><img ${files.has(p)?`src="${esc(files.get(p).url)}"`:`data-path="${esc(p)}"`} alt="${i+1}번째 사진"><button type="button" class="photo-remove" data-remove="${i}" aria-label="${i+1}번째 사진 제거">×</button>${cover===p?'<span class="cover-badge">대표</span>':''}</div><div class="photo-actions"><button type="button" data-cover="${i}" aria-pressed="${cover===p}">${cover===p?'대표 사진':'대표로'}</button><span class="move-actions"><button type="button" data-up="${i}" aria-label="${i+1}번째 사진 앞으로 이동" ${i===0?'disabled':''}>‹</button><button type="button" data-down="${i}" aria-label="${i+1}번째 사진 뒤로 이동" ${i===photos.length-1?'disabled':''}>›</button></span></div></div>`).join('')+`<label class="photo-add"><span aria-hidden="true">＋</span><span>${photos.length?'사진 추가':'사진 선택'}</span><small>여러 장 선택</small><input name="files" type="file" data-extra-files accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-label="사진 여러 장 선택"></label>`;
  fillImages(list);list.querySelector('[data-extra-files]').onchange=e=>addFiles(e.target);list.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{cover=photos[+b.dataset.cover];changed();draw()});list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{let i=+b.dataset.up;if(i){[photos[i-1],photos[i]]=[photos[i],photos[i-1]];changed();draw()}});list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{let i=+b.dataset.down;if(i<photos.length-1){[photos[i+1],photos[i]]=[photos[i],photos[i+1]];changed();draw()}});list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{photos.splice(+b.dataset.remove,1);if(!photos.includes(cover))cover=photos[0]||'';changed();draw()});
  list.querySelectorAll('[data-photo]').forEach(tile=>{tile.ondragstart=e=>{dragIndex=+tile.dataset.photo;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(dragIndex))};tile.ondragover=e=>e.preventDefault();tile.ondrop=e=>{e.preventDefault();const target=+tile.dataset.photo;if(dragIndex>=0&&dragIndex!==target){const [moved]=photos.splice(dragIndex,1);photos.splice(target,0,moved);changed();draw()}dragIndex=-1}});
 }
 function addFiles(input){let invalid=false;for(const file of input.files){if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>10485760){invalid=true;continue}const id='new:'+crypto.randomUUID(),url=URL.createObjectURL(file);temp.push(url);files.set(id,{file,url});photos.push(id);if(!cover)cover=id;changed()}input.value='';f.querySelector('.photo-error').textContent=invalid?'일부 사진을 추가하지 못했어요. JPG, PNG, WEBP, GIF 사진을 한 장당 10MB 이하로 선택해 주세요.':'';draw()}
 draw();
 f.onsubmit=async e=>{
  e.preventDefault();if(saving)return;const submit=dialog.querySelector('.editor-save'),msg=f.querySelector('.error');let uploaded=[];
  msg.textContent='';if(!photos.length){msg.textContent='사진을 하나 이상 선택해 주세요.';msg.scrollIntoView({block:'nearest'});return}const titleValue=f.elements.namedItem('title').value.trim();if(!titleValue){msg.textContent='이름을 입력해 주세요.';f.elements.namedItem('title').focus();return}
  saving=true;submit.disabled=true;submit.classList.add('is-pending');f.inert=true;f.setAttribute('aria-busy','true');
  try{const mapped=photos.slice();const queue=photos.map((p,i)=>({p,i})).filter(x=>files.has(x.p));
   for(let start=0;start<queue.length;start+=3){const batch=queue.slice(start,start+3);const outcomes=await Promise.allSettled(batch.map(async({p,i})=>{const file=files.get(p).file,path=`${crypto.randomUUID()}/${crypto.randomUUID()}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type]}`;const {error}=await db.storage.from('ministry-toolbox').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;files.get(p).path=path;uploaded.push(path);mapped[i]=path}));const failure=outcomes.find(x=>x.status==='rejected');if(failure)throw failure.reason}

   const payload={title:titleValue,description:f.elements.namedItem('description').value.trim(),tags:[...selected],images:mapped,cover:files.has(cover)?files.get(cover).path:cover,reference_url:f.elements.namedItem('reference').value.trim()||null,published:f.elements.namedItem('published').checked,updated_at:new Date().toISOString()};if(!payload.title)throw Error('이름을 입력해 주세요.');
   let res=item?await db.from('toolbox_items').update(payload).eq('id',item.id).eq('updated_at',item.updated_at).select().maybeSingle():await db.from('toolbox_items').insert({...payload,sort_order:Date.now()}).select().single();if(res.error)throw res.error;if(!res.data)throw Error('다른 기기에서 변경되었어요. 새로고침 후 다시 수정해 주세요.');uploaded=[];dirty=false;modal.close();await refresh();if(!item)location.hash='#/'+res.data.id;else render();notify('저장했어요');
  }catch(err){if(uploaded.length)await db.storage.from('ministry-toolbox').remove(uploaded);msg.textContent=err.message||'저장하지 못했어요.'}finally{saving=false;submit.disabled=false;submit.classList.remove('is-pending');f.inert=false;f.removeAttribute('aria-busy')}
 };
 f.querySelector('[data-delete]')?.addEventListener('click',async()=>{if(saving||!await confirmAction('이 자료를 삭제할까요?','삭제'))return;const {error}=await db.from('toolbox_items').delete().eq('id',item.id);if(error){f.querySelector('.error').textContent='삭제하지 못했어요.';return}dirty=false;modal.close();await refresh();location.hash='#/';notify('삭제했어요')});
}
function showViewer(item,index){
 viewerItem=item;viewerIndex=Math.max(0,Math.min(item.images.length-1,index));viewerHidden=false;
 const returnFocus=document.activeElement,token=crypto.randomUUID(),el=document.createElement('div');let pickerOpen=false,closed=false,suppressClickUntil=0,viewerHistory=false;
 el.className='viewer';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','사진 보기');document.body.append(el);document.body.style.overflow='hidden';
 try{history.pushState({...history.state,toolboxViewer:token},'',location.href);viewerHistory=true}catch{}
 function cleanup(){if(closed)return;closed=true;lastViewed.set(item.id,viewerIndex);if(pickerOpen&&modal.open)modal.close();el.remove();document.body.style.overflow='';document.removeEventListener('keydown',key);window.removeEventListener('popstate',onHistory);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
 function close(){if(viewerHistory&&history.state?.toolboxViewer===token){history.back()}else cleanup()}
 function onHistory(e){if(pickerOpen&&!e.state?.toolboxPicker){pickerOpen=false;if(modal.open)modal.close();if(e.state?.toolboxViewer===token)return}if(e.state?.toolboxViewer!==token)cleanup()}
 window.addEventListener('popstate',onHistory);
 function prefetch(){for(const i of [viewerIndex-1,viewerIndex+1])if(i>=0&&i<item.images.length)signed(item.images[i]).then(src=>{if(!closed){const img=new Image();img.src=src}}).catch(()=>{})}
 function picker(){
  pickerOpen=true;try{history.pushState({...history.state,toolboxViewer:token,toolboxPicker:true},'',location.href)}catch{}
  openDialog(`<div class="dialog-head"><h2>사진</h2>${icon('close','닫기')}</div><div class="viewer-menu">${item.images.map((p,i)=>`<button type="button" data-jump="${i}" aria-label="${i+1}번째 사진"><img data-path="${esc(p)}" alt=""></button>`).join('')}</div>`);
  fillImages(dialog);dialog.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{viewerIndex=Number(b.dataset.jump);lastViewed.set(item.id,viewerIndex);modal.close();draw()});
  modal.addEventListener('close',()=>{if(pickerOpen){pickerOpen=false;if(history.state?.toolboxPicker&&history.state?.toolboxViewer===token)history.back()}},{once:true});
 }
 function draw(){
  lastViewed.set(item.id,viewerIndex);el.classList.toggle('hidden-ui',viewerHidden);
  el.innerHTML=`<div class="viewer-head"><span></span><button class="viewer-count" data-count aria-label="${viewerIndex+1} / ${item.images.length}, 사진 목록">${viewerIndex+1} / ${item.images.length}</button>${icon('close','닫기')}</div><div class="viewer-image"><img data-path="${esc(item.images[viewerIndex])}" data-fallback="사진을 불러오지 못했어요" alt="${esc(item.title)} ${viewerIndex+1}"><button type="button" class="viewer-retry" hidden>다시 시도</button></div><div class="viewer-foot">${icon('left','이전 사진')}${icon('right','다음 사진')}</div>`;
  const image=el.querySelector('.viewer-image img'),retry=el.querySelector('.viewer-retry');image.addEventListener('toolbox-image-error',()=>{retry.hidden=false});retry.onclick=e=>{e.stopPropagation();retry.hidden=true;urlCache.delete(image.dataset.path);loadImage(image)};fillImages(el);prefetch();el.querySelector('[data-action=close]').onclick=close;
  const previous=el.querySelector('[data-action=left]'),next=el.querySelector('[data-action=right]');previous.disabled=viewerIndex===0;next.disabled=viewerIndex===item.images.length-1;
  previous.onclick=()=>{if(viewerIndex>0){viewerIndex--;draw()}};next.onclick=()=>{if(viewerIndex<item.images.length-1){viewerIndex++;draw()}};el.querySelector('[data-count]').onclick=picker;
  const area=el.querySelector('.viewer-image');area.onclick=()=>{if(Date.now()<suppressClickUntil)return;viewerHidden=!viewerHidden;el.classList.toggle('hidden-ui',viewerHidden)};
  area.ontouchstart=e=>{startTouch=e.touches.length===1&&(!window.visualViewport||window.visualViewport.scale<=1.05)?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null};
  area.ontouchend=e=>{if(!startTouch||e.changedTouches.length!==1||e.touches.length)return;let dx=e.changedTouches[0].clientX-startTouch.x,dy=e.changedTouches[0].clientY-startTouch.y;startTouch=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil=Date.now()+400;const target=Math.max(0,Math.min(item.images.length-1,viewerIndex+(dx<0?1:-1)));if(target!==viewerIndex){viewerIndex=target;draw()}}};
 }
 function key(e){if(modal.open)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='ArrowRight'&&viewerIndex<item.images.length-1){viewerIndex++;draw()}if(e.key==='ArrowLeft'&&viewerIndex>0){viewerIndex--;draw()}}
 document.addEventListener('keydown',key);draw();el.querySelector('[data-action=close]').focus({preventScroll:true});
}
window.addEventListener('resize',()=>fitTileTitles(app));
window.addEventListener('hashchange',()=>{render();if(!itemId())requestAnimationFrame(()=>window.scrollTo(0,savedScroll));else window.scrollTo(0,0)});
(async()=>{try{await checkAdmin();await refresh();render()}catch(e){app.innerHTML='<p class="empty">자료를 불러오지 못했어요.</p><button class="secondary" onclick="location.reload()">다시 시도</button>'}})();
