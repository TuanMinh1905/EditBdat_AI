// Documents are local, versioned files; opening help never calls the backend or AI.
function initWorkflowHelp() {
  const tabs = {
    create: 'Tạo mới', rules: 'Quy tắc', 'source-suggester': 'Gợi ý Source - Animation',
    'clip-splitter': 'Cắt Clip', 'premiere-gen': 'Gen XML', settings: 'Cài đặt'
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-dialog';
  dialog.setAttribute('aria-labelledby', 'workflow-title');
  const header = document.createElement('div');
  header.className = 'workflow-header';
  const title = document.createElement('h2');
  title.id = 'workflow-title';
  const close = document.createElement('button');
  close.className = 'btn-secondary';
  close.textContent = 'Đóng (Esc)';
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', '');
  header.append(title, close);
  dialog.append(header, frame);
  document.body.append(dialog);
  let trigger;
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { frame.removeAttribute('src'); trigger?.focus(); });
  for (const [id, label] of Object.entries(tabs)) {
    const tab = document.getElementById(`tab-${id}`);
    if (!tab) continue;
    const button = document.createElement('button');
    button.className = 'btn-secondary workflow-help-button';
    button.textContent = '📖 Luồng hoạt động';
    button.setAttribute('aria-label', `Đọc luồng hoạt động: ${label}`);
    button.addEventListener('click', () => {
      trigger = button;
      title.textContent = `Luồng hoạt động · ${label}`;
      frame.title = title.textContent;
      frame.src = `../doc/workflows/${id}.html`;
      dialog.showModal();
      close.focus();
    });
    tab.append(button);
  }
}
