/* Keep the existing calendar and revisit actions; only arrange their elements. */
(() => {
  const renderMinistry = ministryRender;
  const renderVisitDetail = visitsDetail;
  let visitListScroll = 0;

  ministryRender = function (...args) {
    const result = renderMinistry.apply(this, args);
    const page = document.querySelector('#app > .ministry');
    if (!page || page.querySelector('.ministry-wide-calendar')) return result;
    const month = page.querySelector('.ministry-month');
    const weekdays = page.querySelector('.ministry-weekdays');
    const calendar = page.querySelector('.ministry-calendar');
    const summary = page.querySelector('.ministry-summary');
    const actions = page.querySelector('.ministry-actions');
    if (![month, weekdays, calendar, summary, actions].every(Boolean)) return result;
    const calendarArea = document.createElement('div');
    const summaryArea = document.createElement('div');
    calendarArea.className = 'ministry-wide-calendar';
    summaryArea.className = 'ministry-wide-summary';
    month.before(calendarArea);
    calendarArea.append(month);
    const today = page.querySelector('.ministry-today');
    if (today) calendarArea.append(today);
    calendarArea.append(weekdays, calendar);
    summary.before(summaryArea);
    summaryArea.append(summary, actions);
    return result;
  };

  function sortedVisits() {
    return visitsBook.entries.filter(entry => !!entry.archived === visitsArchived).slice().sort((a, b) => {
      if (visitsStopped(a) !== visitsStopped(b)) return visitsStopped(a) ? 1 : -1;
      if (!a.next_date) return b.next_date ? 1 : (a.name || '').localeCompare(b.name || '', 'ko');
      if (!b.next_date) return -1;
      return a.next_date.localeCompare(b.next_date) || (a.name || '').localeCompare(b.name || '', 'ko');
    });
  }

  function showVisitList(entry) {
    if (visitsCreation || visitsBlank(entry)) return;
    const app = document.getElementById('app');
    const detail = app.querySelector('.visits-page.visits-detail');
    const back = app.querySelector('.visits-back');
    if (!detail || !back) return;
    const layout = document.createElement('div');
    layout.className = 'visits-wide-layout';
    const sidebar = document.createElement('aside');
    sidebar.className = 'visits-wide-list';
    sidebar.setAttribute('aria-label', visitsArchived ? '보관한 재방문 목록' : '재방문 목록');
    const heading = document.createElement('div');
    heading.className = 'visits-wide-heading';
    heading.textContent = visitsArchived ? '보관한 기록' : '재방문';
    sidebar.append(heading);
    for (const item of sortedVisits()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'visits-wide-person';
      button.dataset.wideVisitId = item.id;
      const name = document.createElement('strong');
      name.textContent = item.name || '이름 정하기';
      button.append(name);
      if (visitsStopped(item) || item.next_date) {
        const date = document.createElement('span');
        date.textContent = visitsStopped(item) ? '방문 중단' : visitsDate(item.next_date);
        button.append(date);
      }
      if (item.id === entry.id) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => {
        if (item.id === visitsActiveId || visitsCreation) return;
        visitListScroll = sidebar.scrollTop;
        if (history.state?.visitDetail === visitsActiveId) {
          visitsActiveId = item.id;
          visitsExpanded = false;
          history.replaceState({ ...history.state, visitDetail: item.id }, '', location.href);
          visitsRender();
        } else {
          visitsOpenDetail(item.id);
        }
        window.scrollTo(0, 0);
        document.querySelector('.visits-wide-person[aria-current="true"]')?.focus({ preventScroll: true });
      });
      sidebar.append(button);
    }
    sidebar.addEventListener('scroll', () => { visitListScroll = sidebar.scrollTop; }, { passive: true });
    const content = document.createElement('div');
    content.className = 'visits-wide-content';
    app.insertBefore(layout, detail);
    content.append(detail, back);
    layout.append(sidebar, content);
    sidebar.scrollTop = visitListScroll;
  }

  visitsDetail = function (entry, ...args) {
    const result = renderVisitDetail.call(this, entry, ...args);
    showVisitList(entry);
    return result;
  };
  window.addEventListener('hashchange', () => {
    if (!visitsRoute()) visitListScroll = 0;
  });
})();
