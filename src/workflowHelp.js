// Local rich-text documents; only supported text and formatting reach the DOM/disk.
const WORKFLOW_FORMAT_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'div', 'span', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'br', 'hr']);
const WORKFLOW_FONTS = ['system-ui', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
function workflowReadNodes(parent) {
  return Array.from(parent.childNodes).flatMap(node => {
    if (node.nodeType === 3) return [node.textContent];
    if (node.nodeType !== 1) return [];
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'input', 'button', 'select', 'textarea'].includes(tag)) return [];
    const children = workflowReadNodes(node);
    if (!WORKFLOW_FORMAT_TAGS.has(tag) && tag !== 'font') return children;
    const style = {};
    const color = node.style.color || (tag === 'font' ? node.getAttribute('color') : '');
    if (/^(#[a-f\d]{3,8}|rgb\(\d{1,3}, ?\d{1,3}, ?\d{1,3}\))$/i.test(color || '')) style.color = color;
    const font = (node.style.fontFamily || (tag === 'font' ? node.getAttribute('face') : '') || '').replace(/["']/g, '');
    if (WORKFLOW_FONTS.includes(font)) style.fontFamily = font;
    if (/^(1[0-9]|[2-6][0-9]|7[0-2])px$/.test(node.style.fontSize)) style.fontSize = node.style.fontSize;
    if (['left', 'center', 'right', 'justify'].includes(node.style.textAlign)) style.textAlign = node.style.textAlign;
    return [{ tag: tag === 'font' ? 'span' : tag, style, children }];
  });
}
function workflowMountNodes(parent, nodes) {
  parent.replaceChildren();
  function append(target, items) {
    for (const node of items) {
      if (typeof node === 'string') { target.append(document.createTextNode(node)); continue; }
      const element = document.createElement(node.tag);
      Object.assign(element.style, node.style);
      append(element, node.children); target.append(element);
    }
  }
  append(parent, nodes);
}
class WorkflowHistory {
  constructor() { this.entries = []; this.index = -1; }
  push(html) {
    if (this.entries[this.index] === html) return;
    this.entries.splice(this.index + 1); this.entries.push(html);
    if (this.entries.length > 150) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  move(delta) {
    const next = this.index + delta;
    if (next < 0 || next >= this.entries.length) return null;
    this.index = next; return this.entries[next];
  }
}
function initWorkflowHelp() {
  const tabs = { create: 'Tạo mới', rules: 'Quy tắc', 'source-suggester': 'Gợi ý Source - Animation', 'clip-splitter': 'Cắt Clip', 'premiere-gen': 'Gen XML', settings: 'Cài đặt' };
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-dialog'; dialog.setAttribute('aria-labelledby', 'workflow-title');
  dialog.innerHTML = `
    <div class="workflow-header"><h2 id="workflow-title"></h2><button class="btn-secondary" data-action="close">Đóng (Esc)</button></div>
    <div class="workflow-actions" aria-label="Thao tác tài liệu">
      <button class="btn-secondary" data-action="edit" title="Ctrl+E">Chỉnh sửa</button>
      <button class="btn-secondary" data-action="save" title="Ctrl+S / Ctrl+Enter">Lưu</button>
      <button class="btn-secondary" data-action="cancel">Hủy chỉnh sửa</button>
      <button class="btn-secondary" data-action="delete">Xóa nội dung</button>
      <button class="btn-secondary" data-action="previous">Khôi phục bản trước</button>
      <button class="btn-secondary" data-action="shortcuts" aria-expanded="false">Phím tắt</button>
    </div>
    <div class="workflow-format" role="toolbar" aria-label="Định dạng văn bản" hidden>
      <button class="btn-secondary" data-action="undo" title="Ctrl+Z">↶ Hoàn tác</button><button class="btn-secondary" data-action="redo" title="Ctrl+Y / Ctrl+Shift+Z">↷ Làm lại</button>
      <button class="btn-secondary" data-command="bold" title="Đậm (Ctrl+B)"><b>B</b></button><button class="btn-secondary" data-command="italic" title="Nghiêng (Ctrl+I)"><i>I</i></button><button class="btn-secondary" data-command="underline" title="Gạch chân (Ctrl+U)"><u>U</u></button>
      <label>Font <select aria-label="Font chữ" data-format="font">${WORKFLOW_FONTS.map(font => `<option>${font}</option>`).join('')}</select></label>
      <label>Cỡ <select aria-label="Cỡ chữ" data-format="size">${[12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(size => `<option ${size === 16 ? 'selected' : ''}>${size}</option>`).join('')}</select></label>
      <label>Màu <input type="color" value="#e4e4ef" aria-label="Màu chữ" data-format="color"></label>
      <select aria-label="Kiểu đoạn văn" data-format="block"><option value="p">Đoạn văn</option><option value="h1">Tiêu đề 1</option><option value="h2">Tiêu đề 2</option><option value="h3">Tiêu đề 3</option></select>
      <button class="btn-secondary" data-command="insertUnorderedList">• Danh sách</button><button class="btn-secondary" data-command="insertOrderedList">1. Danh sách</button>
      <button class="btn-secondary" data-command="justifyLeft">Căn trái</button><button class="btn-secondary" data-command="justifyCenter">Căn giữa</button><button class="btn-secondary" data-command="justifyRight">Căn phải</button><button class="btn-secondary" data-command="removeFormat">Bỏ định dạng</button>
    </div>
    <div class="workflow-shortcuts" hidden><strong>Phím tắt trong tài liệu</strong>
      <p>Ctrl+E: chỉnh sửa · Ctrl+S / Ctrl+Enter: lưu · Ctrl+Z: hoàn tác · Ctrl+Y / Ctrl+Shift+Z: làm lại · Ctrl+B/I/U: đậm/nghiêng/gạch chân.</p>
      <p>Ctrl+A: chọn tất cả trong vùng nhập · Ctrl+C/X/V: sao chép/cắt/dán văn bản · Ctrl+←/→: di chuyển theo từ · Ctrl+Home/End: đầu/cuối · Shift + phím di chuyển: chọn chữ · Tab/Shift+Tab: chuyển nút.</p>
      <p>Enter: xuống đoạn; Shift+Enter: xuống dòng. Khi nút Lưu có tiêu điểm, Enter hoặc Space sẽ lưu. Esc: đóng và hỏi nếu có thay đổi chưa lưu.</p>
      <p>Xóa nội dung chỉ xóa bản đang sửa, có thể Ctrl+Z; bấm Lưu để ghi xuống file. Khôi phục bản trước nạp bản trước lần lưu gần nhất và cần bấm Lưu để áp dụng.</p>
    </div>
    <div class="workflow-confirm" role="alertdialog" aria-modal="true" aria-labelledby="workflow-confirm-message" hidden><p id="workflow-confirm-message"></p><button class="btn-primary" data-confirm="yes">Đồng ý</button> <button class="btn-secondary" data-confirm="no">Hủy</button></div>
    <p class="workflow-status" role="status" aria-live="polite"></p>
    <article class="workflow-document" tabindex="0" aria-label="Nội dung luồng hoạt động" spellcheck="false"></article>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const editor = find('.workflow-document'), toolbar = find('.workflow-format'), status = find('.workflow-status');
  const actions = Object.fromEntries(Array.from(dialog.querySelectorAll('[data-action]'), button => [button.dataset.action, button]));
  let tabId, revision, savedNodes = [], trigger, editing = false, busy = false, loaded = false;
  let history = new WorkflowHistory(), selectionRange = null, pendingConfirm = null;
  const nodes = () => workflowReadNodes(editor);
  const dirty = () => JSON.stringify(nodes()) !== JSON.stringify(savedNodes);
  function update(message) {
    if (message) status.textContent = message;
    actions.edit.hidden = editing;
    for (const name of ['cancel', 'delete', 'save']) actions[name].hidden = !editing;
    toolbar.hidden = !editing; editor.contentEditable = editing && !busy && !pendingConfirm ? 'true' : 'false';
    for (const control of dialog.querySelectorAll('.workflow-actions button, .workflow-format button, .workflow-format select, .workflow-format input')) control.disabled = busy || !loaded;
    actions.undo.disabled = busy || history.index <= 0; actions.redo.disabled = busy || history.index >= history.entries.length - 1;
    for (const control of dialog.querySelectorAll('.workflow-actions, .workflow-format, .workflow-document, .workflow-shortcuts')) control.inert = !!pendingConfirm;
  }
  function rememberSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) selectionRange = selection.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    editor.focus(); const selection = window.getSelection(); selection.removeAllRanges();
    if (selectionRange && editor.contains(selectionRange.commonAncestorContainer)) selection.addRange(selectionRange);
    else { const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); selection.addRange(range); }
  }
  function snapshot() { history.push(editor.innerHTML); update(); }
  function moveHistory(delta) {
    if (!editing || busy || pendingConfirm) return;
    const html = history.move(delta); if (html === null) return;
    editor.innerHTML = html; selectionRange = null; restoreSelection(); update(dirty() ? 'Có thay đổi chưa lưu.' : 'Đã trở về nội dung đã lưu.');
  }
  function confirmAction(message) {
    if (pendingConfirm) return Promise.resolve(false);
    const panel = find('.workflow-confirm'), oldFocus = document.activeElement;
    panel.querySelector('p').textContent = message; panel.hidden = false;
    return new Promise(resolve => {
      pendingConfirm = result => { pendingConfirm = null; panel.hidden = true; update(); oldFocus?.focus(); resolve(result); };
      update(); panel.querySelector('[data-confirm="no"]').focus();
    });
  }
  for (const button of dialog.querySelectorAll('[data-confirm]')) button.addEventListener('click', () => pendingConfirm?.(button.dataset.confirm === 'yes'));
  async function requestClose() {
    if (busy || pendingConfirm) return;
    if (dirty() && !await confirmAction('Đóng và bỏ các thay đổi chưa lưu?')) return;
    dialog.close();
  }
  function startEditing() { if (busy || !loaded) return; editing = true; update('Đang chỉnh sửa · Ctrl+S hoặc Ctrl+Enter để lưu.'); editor.focus(); }
  async function save() {
    if (!editing || busy || !loaded || pendingConfirm) return;
    const next = nodes(); busy = true; update('Đang lưu tài liệu…');
    try {
      const result = await window.api.saveWorkflowDocument({ tab: tabId, revision, nodes: next });
      if (result.error) throw new Error(result.error);
      revision = result.revision; savedNodes = next; update('Đã lưu vào file tài liệu của tab. Có thể tiếp tục sửa hoặc đóng.');
    } catch (err) { update(err.message); }
    finally { busy = false; update(); }
  }
  actions.edit.addEventListener('click', startEditing); actions.save.addEventListener('click', save); actions.close.addEventListener('click', requestClose);
  actions.undo.addEventListener('click', () => moveHistory(-1)); actions.redo.addEventListener('click', () => moveHistory(1));
  actions.cancel.addEventListener('click', async () => {
    if (dirty() && !await confirmAction('Bỏ thay đổi và trở về bản đã lưu?')) return;
    workflowMountNodes(editor, savedNodes); selectionRange = null; history = new WorkflowHistory(); snapshot(); editing = false; update('Đã trở về chế độ đọc.');
  });
  actions.delete.addEventListener('click', async () => {
    if (!await confirmAction('Xóa toàn bộ nội dung bản đang sửa? Có thể Ctrl+Z. Chỉ ghi xuống file khi bấm Lưu.')) return;
    editor.replaceChildren(); selectionRange = null; editor.focus(); snapshot(); update('Đã xóa bản đang sửa · Ctrl+Z để hoàn tác, Lưu để áp dụng.');
  });
  actions.previous.addEventListener('click', async () => {
    if (!await confirmAction('Nạp bản trước lần lưu gần nhất để chỉnh sửa? Thao tác thay nội dung đang xem; cần Lưu để áp dụng.')) return;
    busy = true; update('Đang đọc bản trước…');
    try {
      const result = await window.api.getWorkflowDocument({ tab: tabId, previous: true });
      if (result.error) throw new Error(result.error);
      const parsed = new DOMParser().parseFromString(result.html, 'text/html');
      workflowMountNodes(editor, workflowReadNodes(parsed.body)); selectionRange = null;
      // Retain the opening revision so an outside update cannot be silently overwritten.
      editing = true; snapshot(); update('Đã nạp bản trước vào vùng sửa. Kiểm tra rồi bấm Lưu.');
    } catch (err) { update(err.message); }
    finally { busy = false; update(); }
  });
  actions.shortcuts.addEventListener('click', () => { const help = find('.workflow-shortcuts'); help.hidden = !help.hidden; actions.shortcuts.setAttribute('aria-expanded', String(!help.hidden)); });
  function command(name, value = null) {
    if (!editing || busy || pendingConfirm) return;
    restoreSelection(); document.execCommand(name, false, value); rememberSelection(); snapshot(); update('Có thay đổi chưa lưu.');
  }
  for (const button of toolbar.querySelectorAll('button')) button.addEventListener('mousedown', event => { event.preventDefault(); rememberSelection(); });
  for (const button of toolbar.querySelectorAll('[data-command]')) button.addEventListener('click', () => command(button.dataset.command));
  find('[data-format="font"]').addEventListener('change', event => command('fontName', event.target.value));
  find('[data-format="color"]').addEventListener('change', event => command('foreColor', event.target.value));
  find('[data-format="block"]').addEventListener('change', event => command('formatBlock', event.target.value));
  find('[data-format="size"]').addEventListener('change', event => {
    if (!editing || busy || pendingConfirm) return;
    restoreSelection(); document.execCommand('fontSize', false, '7');
    for (const font of editor.querySelectorAll('font[size="7"]')) { font.removeAttribute('size'); font.style.fontSize = `${event.target.value}px`; }
    rememberSelection(); snapshot(); update('Có thay đổi chưa lưu.');
  });
  editor.addEventListener('input', event => { if (!event.isComposing) { snapshot(); update('Có thay đổi chưa lưu.'); } });
  editor.addEventListener('compositionend', () => { snapshot(); update('Có thay đổi chưa lưu.'); });
  editor.addEventListener('mouseup', rememberSelection); editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('beforeinput', event => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); moveHistory(event.inputType === 'historyUndo' ? -1 : 1); }
  });
  editor.addEventListener('paste', event => { event.preventDefault(); if (editing && !busy) command('insertText', event.clipboardData.getData('text/plain')); });
  editor.addEventListener('drop', event => event.preventDefault());
  dialog.addEventListener('keydown', event => {
    if (pendingConfirm) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); pendingConfirm(false); } return; }
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 's' || key === 'enter') { event.preventDefault(); save(); }
    else if (key === 'e') { event.preventDefault(); startEditing(); }
    else if (editing && (key === 'z' || key === 'y') && !['INPUT', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); moveHistory(key === 'y' || event.shiftKey ? 1 : -1); }
    else if (editing && editor.contains(event.target) && ['b', 'i', 'u'].includes(key)) { event.preventDefault(); command({ b: 'bold', i: 'italic', u: 'underline' }[key]); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (pendingConfirm) pendingConfirm(false); else requestClose(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose();
  });
  dialog.addEventListener('close', () => { editor.replaceChildren(); selectionRange = null; trigger?.focus(); });
  for (const [id, label] of Object.entries(tabs)) {
    const tab = document.getElementById(`tab-${id}`); if (!tab) continue;
    const button = document.createElement('button'); button.className = 'btn-secondary workflow-help-button'; button.textContent = '📖 Luồng hoạt động'; button.setAttribute('aria-label', `Đọc luồng hoạt động: ${label}`);
    button.addEventListener('click', async () => {
      if (dialog.open) return;
      trigger = button; tabId = id; revision = null; loaded = false; editing = false; busy = true;
      savedNodes = []; editor.replaceChildren(); history = new WorkflowHistory(); selectionRange = null;
      find('#workflow-title').textContent = `Luồng hoạt động · ${label}`;
      dialog.showModal(); update('Đang đọc tài liệu…'); actions.close.focus();
      try {
        const result = await window.api.getWorkflowDocument({ tab: id }); if (result.error) throw new Error(result.error);
        const parsed = new DOMParser().parseFromString(result.html, 'text/html');
        workflowMountNodes(editor, workflowReadNodes(parsed.body)); savedNodes = nodes(); revision = result.revision; loaded = true; snapshot();
        update('Chế độ đọc · Chọn Chỉnh sửa để thay đổi tài liệu.');
      } catch (err) { update(err.message); }
      finally { busy = false; update(); }
    });
    tab.append(button);
  }
}
