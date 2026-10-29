// 이전에 저장된 화면에서도 알맞은 코드를 불러옵니다.
(function(){
  var script=document.createElement('script');
  script.src=document.getElementById('home-verse-form')?'app-20261029.js':'app-legacy-634814a.js';
  script.onerror=function(){
    var app=document.getElementById('app');
    if(!app)return;
    app.textContent='화면을 불러오지 못했습니다. ';
    var retry=document.createElement('a');
    retry.textContent='다시 시도';
    retry.href=location.pathname+'?refresh='+Date.now()+location.hash;
    app.appendChild(retry);
  };
  document.body.appendChild(script);
})();
