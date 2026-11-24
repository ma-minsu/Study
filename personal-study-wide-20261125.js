/* Enhance the existing study routes without replacing their editing or navigation. */
(() => {
  const originalPeopleView = peopleView;
  const originalPersonView = personView;
  let listSnapshot = null;
  let listScroll = 0;

  function addFieldNavigation() {
    const workspace = document.querySelector('.people-workspace[data-personal-field]');
    if (!workspace || workspace.querySelector('.wide-study-fields')) return;
    const active = personalField();
    const nav = document.createElement('nav');
    nav.className = 'wide-study-fields';
    nav.setAttribute('aria-label', '개인 연구 분야');
    for (const [id, label] of personalFields) {
      const link = document.createElement('a');
      link.href = id === 'people' ? '#/people' : '#/people?field=' + id;
      link.textContent = label;
      if (id === active) link.setAttribute('aria-current', 'page');
      link.addEventListener('click', event => {
        if (id === active || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        query = '';
        listSnapshot = null;
      });
      nav.append(link);
    }
    workspace.querySelector('.people-header').after(nav);
  }

  peopleView = function (...args) {
    originalPeopleView.apply(this, args);
    addFieldNavigation();
  };

  function attachList() {
    if (!listSnapshot || !matchMedia('(min-width: 1200px)').matches) return;
    const app = document.getElementById('app');
    if (!app.querySelector('.person-top') || app.querySelector('.wide-study-detail')) return;
    const layout = document.createElement('div');
    layout.className = 'wide-study-detail';
    const sidebar = document.createElement('aside');
    sidebar.className = 'wide-study-list';
    sidebar.setAttribute('aria-label', listSnapshot.label + ' 목록');
    const heading = document.createElement('a');
    heading.className = 'wide-study-list-heading';
    heading.href = listSnapshot.back;
    heading.textContent = listSnapshot.label;
    sidebar.append(heading);
    const list = listSnapshot.content.cloneNode(true);
    list.className = 'wide-study-list-content';
    sidebar.append(list);
    const current = location.hash.split('?')[0];
    list.querySelectorAll('.person').forEach(link => {
      if (link.getAttribute('href')?.split('?')[0] === current) link.setAttribute('aria-current', 'page');
    });
    sidebar.addEventListener('scroll', () => { listScroll = sidebar.scrollTop; }, { passive: true });
    const detail = document.createElement('div');
    detail.className = 'wide-study-detail-content';
    while (app.firstChild) detail.append(app.firstChild);
    layout.append(sidebar, detail);
    app.append(layout);
    sidebar.scrollTop = listScroll;
    const selected = sidebar.querySelector('[aria-current="page"]');
    if (selected && !listScroll) sidebar.scrollTop = Math.max(0, selected.offsetTop - sidebar.clientHeight / 3);
  }

  personView = function (...args) {
    originalPersonView.apply(this, args);
    attachList();
  };

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('#results .person, .wide-study-list .person');
    if (!link || !link.getAttribute('href')?.startsWith('#/person/')) return;
    const workspace = link.closest('.people-workspace[data-personal-field]');
    if (!workspace) return;
    const field = personalField();
    const content = workspace.querySelector('#results');
    if (!content) return;
    listSnapshot = {
      label: personalFields.find(([id]) => id === field)[1],
      back: field === 'people' ? '#/people' : '#/people?field=' + field,
      content: content.cloneNode(true)
    };
    listScroll = 0;
  }, true);

  window.addEventListener('hashchange', () => {
    if (!/^#\/(?:people|person)(?:[/?]|$)/.test(location.hash)) {
      listSnapshot = null;
      listScroll = 0;
    }
  });
  matchMedia('(min-width: 1200px)').addEventListener('change', () => attachList());
  addFieldNavigation();
})();
