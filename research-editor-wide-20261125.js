/* Group the existing fields without replacing their state, handlers or inputs. */
(() => {
  const originalLayout = layoutResearchForm;
  const originalOpenEditor = openEditor;

  function ungroup() {
    const content = document.querySelector('#note-form .research-form-content');
    if (!content) return;
    content.querySelectorAll(':scope > .research-writing-column, :scope > .research-materials-column, :scope > .research-form-tail').forEach(group => {
      while (group.firstChild) content.insertBefore(group.firstChild, group);
      group.remove();
    });
  }

  layoutResearchForm = function (...args) {
    ungroup();
    return originalLayout.apply(this, args);
  };

  function groupFields() {
    const content = document.querySelector('#note-form .research-form-content');
    if (!content || content.querySelector(':scope > .research-writing-column')) return;
    const author = document.getElementById('author')?.closest('label');
    const title = document.getElementById('note-title')?.closest('label');
    const body = document.getElementById('note-body')?.closest('label');
    const editor = document.getElementById('research-quill-wrap');
    const additional = content.querySelector(':scope > .additional');
    const imageHelp = document.getElementById('image-help');
    const images = document.getElementById('image-previews');
    const picker = document.getElementById('note-images')?.closest('.image-field');
    if (![author, title, body, editor, additional, imageHelp, images, picker].every(Boolean)) return;
    const writing = document.createElement('div');
    const materials = document.createElement('div');
    const tail = document.createElement('div');
    writing.className = 'research-writing-column';
    materials.className = 'research-materials-column';
    tail.className = 'research-form-tail';
    [author, title, body, editor, document.getElementById('note-rich'), document.getElementById('note-references')].forEach(node => writing.append(node));
    [additional, imageHelp, images, picker].forEach(node => materials.append(node));
    while (content.firstChild) tail.append(content.firstChild);
    content.append(writing, materials, tail);
  }

  openEditor = function (...args) {
    const result = originalOpenEditor.apply(this, args);
    if (document.querySelector('#edit-dialog.personal-note-editor')) groupFields();
    return result;
  };
})();
