/* Decide at render time so inline editing does not rearrange the page. */
(() => {
  const originalFamilySessionView = familySessionView;
  familySessionView = function (anchor, ...args) {
    const result = originalFamilySessionView.call(this, anchor, ...args);
    const detail = document.querySelector('#app > .family-detail');
    if (!detail || !familyParseDate(anchor) || !detail.querySelector('.family-photo-grid')) return result;
    const data = familySession(anchor);
    if (String(data.preparation || '').trim() || (data.resources || []).length) {
      const preparation = detail.querySelector('.family-preparation');
      const resources = detail.querySelector('.family-resources');
      const photos = detail.querySelector('.family-content-photos');
      const reflections = detail.querySelector('.family-reflections');
      if (![preparation, resources, photos, reflections].every(Boolean)) return result;
      const plan = document.createElement('div');
      const record = document.createElement('div');
      plan.className = 'family-wide-plan';
      record.className = 'family-wide-record';
      preparation.before(plan);
      plan.append(preparation, resources);
      detail.append(record);
      record.append(photos, reflections);
      detail.dataset.wideContent = 'true';
    }
    return result;
  };
})();
