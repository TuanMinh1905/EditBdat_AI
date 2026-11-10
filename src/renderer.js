// ============================================
// AE AI Tool — Renderer (UI Logic)
// ============================================

// --- State ---
const state = {
  mediaFiles: [],      // Array of { path, name, ext, type, size, metadata }
  isGenerating: false,
  backendReady: false,
  settings: {}
};

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  // Tabs
  tabCreate: $('#tab-create'),
  tabSettings: $('#tab-settings'),
  navBtns: $$('.nav-btn'),

  // Media
  dropZone: $('#drop-zone'),
  mediaList: $('#media-list'),
  mediaSummary: $('#media-summary'),
  mediaCount: $('#media-count'),
  btnAddFiles: $('#btn-add-files'),

  // Prompt
  promptInput: $('#prompt-input'),
  charCount: $('#char-count'),
  presetTags: $$('.preset-tag'),

  // Generate
  btnGenerate: $('#btn-generate'),
  btnGenerateContent: $('.btn-generate-content'),
  btnGenerateLoading: $('.btn-generate-loading'),

  // Progress
  progressSection: $('#progress-section'),
  progressFill: $('#progress-fill'),
  steps: {
    analyze: $('#step-analyze'),
    ai: $('#step-ai'),
    validate: $('#step-validate'),
    jsx: $('#step-jsx'),
    ae: $('#step-ae')
  },

  // Output
  outputSection: $('#output-section'),
  outputCard: $('#output-card'),
  outputPath: $('#output-path'),
  btnOpenAep: $('#btn-open-aep'),
  btnOpenFolder: $('#btn-open-folder'),

  // Log
  logToggle: $('#log-toggle'),
  logContent: $('#log-content'),
  logMessages: $('#log-messages'),

  // Settings
  settingApiKey: $('#setting-api-key'),
  settingAePath: $('#setting-ae-path'),
  settingOutputDir: $('#setting-output-dir'),
  settingCompWidth: $('#setting-comp-width'),
  settingCompHeight: $('#setting-comp-height'),
  settingCompFps: $('#setting-comp-fps'),
  btnSaveSettings: $('#btn-save-settings'),
  btnToggleKey: $('#btn-toggle-key'),
  btnBrowseAe: $('#btn-browse-ae'),
  btnBrowseOutput: $('#btn-browse-output'),

  // Backend
  backendStatus: $('#backend-status'),

  // Window controls
  btnMinimize: $('#btn-minimize'),
  btnMaximize: $('#btn-maximize'),
  btnClose: $('#btn-close'),

  // New action buttons
  btnExportJsx: $('#btn-export-jsx'),
  btnPreviewTimeline: $('#btn-preview-timeline'),

  // Project name
  projectNameInput: $('#project-name-input'),

  // Timeline modal
  modalTimeline: $('#modal-timeline'),
  modalTimelineClose: $('#modal-timeline-close'),
  timelineStats: $('#timeline-stats'),
  timelineJsonContent: $('#timeline-json-content'),
  btnCopyJson: $('#btn-copy-json'),
  btnGenerateFromPreview: $('#btn-generate-from-preview')
};

// --- Utility ---
function getFileType(ext) {
  const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
  const audioExts = ['mp3', 'wav', 'aac', 'ogg', 'flac'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'psd'];
  ext = ext.toLowerCase();
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  return 'other';
}

function getFileIcon(type) {
  switch (type) {
    case 'video': return '🎬';
    case 'audio': return '🎵';
    case 'image': return '🖼️';
    default: return '📄';
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getExtension(filename) {
  return filename.split('.').pop();
}

function getBasename(filepath) {
  return filepath.replace(/\\/g, '/').split('/').pop();
}

// --- Log ---
function addLog(message, type = 'info') {
  const msgEl = document.createElement('div');
  msgEl.className = `log-msg ${type}`;
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  msgEl.textContent = `[${time}] ${message}`;
  dom.logMessages.appendChild(msgEl);
  dom.logMessages.scrollTop = dom.logMessages.scrollHeight;
}

// --- Custom Confirmation Modal (Tránh bấm nhầm các thay đổi quan trọng) ---
function askConfirm(message, opts = {}) {
  const modal = $('#modal-confirm');
  const titleEl = $('#modal-confirm-title');
  const msgEl = $('#modal-confirm-message');
  const btnOk = $('#modal-confirm-ok');
  const btnCancel = $('#modal-confirm-cancel');
  const btnClose = $('#modal-confirm-close');

  if (!modal || !btnOk || !btnCancel) {
    return Promise.resolve(window.confirm(message));
  }

  if (titleEl) titleEl.textContent = opts.title || '⚠️ Xác nhận thay đổi';
  if (msgEl) msgEl.textContent = message || 'Bạn có muốn thực hiện thay đổi này không?';
  btnOk.textContent = opts.confirmText || 'Đồng ý';
  btnCancel.textContent = opts.cancelText || 'Hủy';
  btnOk.className = opts.danger ? 'btn-danger' : 'btn-primary';

  modal.style.display = 'flex';
  btnOk.focus();

  return new Promise(resolve => {
    const cleanup = (answer) => {
      modal.style.display = 'none';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      if (btnClose) btnClose.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
      resolve(answer);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      else if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
    };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    if (btnClose) btnClose.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKey);
  });
}

// --- Session Persistence ---
let _saveSessionTimer = null;
function saveSession() {
  // Debounce: save after 500ms of inactivity to avoid spam during typing
  clearTimeout(_saveSessionTimer);
  _saveSessionTimer = setTimeout(async () => {
    try {
      await window.api.saveSession({
        mediaFiles: state.mediaFiles.map(f => ({
          path: f.path,
          name: f.name,
          ext: f.ext,
          type: f.type
        })),
        prompt: dom.promptInput.value,
        projectName: dom.projectNameInput.value
      });
    } catch (err) {
      console.error('Lỗi lưu session:', err);
    }
  }, 500);
}

async function loadSession() {
  try {
    const session = await window.api.getSession();

    // Restore media files (only those that still exist on disk)
    if (session.mediaFiles && session.mediaFiles.length > 0) {
      state.mediaFiles = session.mediaFiles;
      renderMediaList();
      addLog(`Đã khôi phục ${session.mediaFiles.length} file(s) từ phiên trước`, 'info');
    }

    // Restore prompt
    if (session.prompt) {
      dom.promptInput.value = session.prompt;
      dom.charCount.textContent = `${session.prompt.length} ký tự`;
    }

    // Restore project name
    if (session.projectName) {
      dom.projectNameInput.value = session.projectName;
    }

    updateGenerateButton();
  } catch (err) {
    console.error('Lỗi khôi phục session:', err);
  }
}

// --- Media List ---
function addMediaFiles(filePaths) {
  for (const fp of filePaths) {
    // Avoid duplicates
    if (state.mediaFiles.some(f => f.path === fp)) continue;

    const name = getBasename(fp);
    const ext = getExtension(name);
    const type = getFileType(ext);

    state.mediaFiles.push({
      path: fp,
      name: name,
      ext: ext,
      type: type,
      metadata: null
    });
  }

  renderMediaList();
  updateGenerateButton();
  saveSession();

  if (filePaths.length > 0) {
    addLog(`Đã thêm ${filePaths.length} file(s)`, 'success');
  }
}

function removeMediaFile(index) {
  state.mediaFiles.splice(index, 1);
  renderMediaList();
  updateGenerateButton();
  saveSession();
}

function renderMediaList() {
  dom.mediaList.innerHTML = '';

  if (state.mediaFiles.length === 0) {
    dom.dropZone.style.display = 'block';
    dom.mediaSummary.style.display = 'none';
    return;
  }

  // Keep drop zone but make it smaller if has files
  dom.dropZone.style.display = 'block';
  dom.mediaSummary.style.display = 'block';
  dom.mediaCount.textContent = `${state.mediaFiles.length} file(s)`;

  state.mediaFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.style.animationDelay = `${index * 0.05}s`;

    const meta = file.metadata;
    let metaHtml = '';
    if (meta) {
      if (meta.duration) metaHtml += `<span>${formatDuration(meta.duration)}</span>`;
      if (meta.width && meta.height) metaHtml += `<span>${meta.width}×${meta.height}</span>`;
      if (meta.size) metaHtml += `<span>${formatSize(meta.size)}</span>`;
    }

    item.innerHTML = `
      <div class="media-icon ${file.type}">${getFileIcon(file.type)}</div>
      <div class="media-info">
        <div class="media-name" title="${file.path}">${file.name}</div>
        <div class="media-meta">${metaHtml || `<span>${file.ext.toUpperCase()}</span>`}</div>
      </div>
      <button class="media-remove" title="Xóa" data-index="${index}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    dom.mediaList.appendChild(item);
  });

  // Bind remove buttons
  dom.mediaList.querySelectorAll('.media-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMediaFile(parseInt(btn.dataset.index));
    });
  });
}

// --- Generate Button State ---
function updateGenerateButton() {
  const hasMedia = state.mediaFiles.length > 0;
  const hasPrompt = dom.promptInput.value.trim().length > 0;
  const canRun = hasMedia && hasPrompt && !state.isGenerating && state.backendReady;
  dom.btnGenerate.disabled = !canRun;
  dom.btnExportJsx.disabled = !canRun;
  dom.btnPreviewTimeline.disabled = !(hasPrompt && state.backendReady && !state.isGenerating);
}

// --- Progress ---
function setProgress(percent) {
  dom.progressFill.style.width = `${percent}%`;
}

function setStep(stepKey, status) {
  const stepEl = dom.steps[stepKey];
  if (!stepEl) return;
  stepEl.className = `step ${status}`; // '', 'active', 'done'
}

function resetProgress() {
  dom.progressSection.style.display = 'none';
  setProgress(0);
  Object.keys(dom.steps).forEach(key => setStep(key, ''));
}

function showProgress() {
  dom.progressSection.style.display = 'block';
  dom.outputSection.style.display = 'none';
}

// --- Generate Project ---
// Base output directory - cố định theo yêu cầu user
const BASE_OUTPUT_DIR = 'C:\\Users\\GP\\Desktop\\Edit Bdat\\Video Demo\\Demo1\\Official';

function getProjectName() {
  return dom.projectNameInput.value.trim();
}

function validateProjectName() {
  const name = getProjectName();
  if (!name) {
    dom.projectNameInput.classList.add('input-error');
    dom.projectNameInput.focus();
    addLog('⚠️ Vui lòng điền tên thư mục output trước khi tạo!', 'error');
    setTimeout(() => dom.projectNameInput.classList.remove('input-error'), 2000);
    return false;
  }
  // Strip invalid path chars
  const invalid = /[\\/:*?"<>|]/g;
  if (invalid.test(name)) {
    dom.projectNameInput.classList.add('input-error');
    addLog('⚠️ Tên thư mục không được chứa ký tự đặc biệt: \\ / : * ? " < > |', 'error');
    setTimeout(() => dom.projectNameInput.classList.remove('input-error'), 2000);
    return false;
  }
  return true;
}

async function generateProject() {
  if (state.isGenerating) return;
  if (!validateProjectName()) return;

  const prompt = dom.promptInput.value.trim();
  if (!prompt || state.mediaFiles.length === 0) return;

  const projectName = getProjectName();

  state.isGenerating = true;
  dom.btnGenerateContent.style.display = 'none';
  dom.btnGenerateLoading.style.display = 'flex';
  dom.btnGenerate.disabled = true;

  showProgress();
  addLog(`✨ Bắt đầu tạo project → ${BASE_OUTPUT_DIR}\\${projectName}`, 'info');

  try {
    // Step 1: Analyze
    setStep('analyze', 'active');
    setProgress(10);
    addLog('Đang phân tích media files...', 'info');

    const analyzeResult = await window.api.analyzeMedia(state.mediaFiles.map(f => f.path));
    if (analyzeResult.error) throw new Error(`Phân tích lỗi: ${analyzeResult.error}`);

    // Update metadata
    if (analyzeResult.media_info) {
      analyzeResult.media_info.forEach((info, i) => {
        if (state.mediaFiles[i]) {
          state.mediaFiles[i].metadata = info;
        }
      });
      renderMediaList();
    }

    setStep('analyze', 'done');
    setProgress(20);
    addLog(`Phân tích xong ${state.mediaFiles.length} file(s)`, 'success');

    // Step 2-5: Generate (all handled by Python backend)
    setStep('ai', 'active');
    setProgress(30);
    addLog('Đang gọi AI sinh timeline...', 'info');

    const settings = await window.api.getSettings();
    const result = await window.api.generateProject({
      mediaFiles: state.mediaFiles.map(f => ({
        path: f.path,
        name: f.name,
        type: f.type,
        metadata: f.metadata
      })),
      prompt: prompt,
      settings: {
        geminiApiKey: settings.geminiApiKey,
        afterEffectsPath: settings.afterEffectsPath,
        outputDir: BASE_OUTPUT_DIR,
        projectName: projectName,
        compWidth: settings.compWidth || 1920,
        compHeight: settings.compHeight || 1080,
        compFps: settings.compFps || 30
      }
    });

    if (result.error) {
      throw new Error(result.error);
    }

    // Update progress based on result
    if (result.timeline) {
      setStep('ai', 'done');
      setProgress(50);
      addLog('AI đã sinh timeline', 'success');
    }
    if (result.jsx_path) {
      setStep('validate', 'done');
      setStep('jsx', 'done');
      setProgress(75);
      addLog(`Script JSX đã tạo: ${result.jsx_path}`, 'success');
    }
    if (result.aep_path) {
      setStep('ae', 'done');
      addLog(`Project .aep đã tạo: ${result.aep_path}`, 'success');
    }

    // Ensure all steps done
    setStep('ai', 'done');
    setStep('validate', 'done');
    setStep('jsx', 'done');
    setStep('ae', 'done');
    setProgress(100);

    showOutput(result.aep_path || result.jsx_path, result.output_dir, true, null, projectName);

  } catch (err) {
    addLog(`Lỗi: ${err.message}`, 'error');
    showOutput(null, null, false, err.message);
  } finally {
    state.isGenerating = false;
    dom.btnGenerateContent.style.display = 'flex';
    dom.btnGenerateLoading.style.display = 'none';
    updateGenerateButton();
  }
}

function showOutput(filePath, outputDir, success, errorMsg, projectName) {
  dom.outputSection.style.display = 'block';
  const card = dom.outputCard;

  if (success) {
    card.className = 'output-card success';
    card.querySelector('.output-icon').textContent = '✅';
    const label = projectName ? `📂 ${projectName}` : 'Project đã tạo thành công!';
    card.querySelector('h3').textContent = label;
    dom.outputPath.textContent = outputDir || filePath || '';

    dom.btnOpenAep.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Mở file';
    dom.btnOpenAep.onclick = () => { if (filePath) window.api.openFile(filePath); };
    dom.btnOpenFolder.onclick = () => { if (outputDir) window.api.openOutputFolder(outputDir); };
    dom.btnOpenAep.style.display = filePath ? 'inline-flex' : 'none';
    dom.btnOpenFolder.style.display = outputDir ? 'inline-flex' : 'none';
  } else {
    card.className = 'output-card error';
    card.querySelector('.output-icon').textContent = '❌';
    card.querySelector('h3').textContent = 'Có lỗi xảy ra';
    dom.outputPath.textContent = errorMsg || 'Unknown error';
    dom.btnOpenAep.style.display = 'none';
    dom.btnOpenFolder.style.display = 'none';
  }
}

// --- Settings ---
async function exportJsxOnly() {
  if (state.isGenerating) return;
  if (!validateProjectName()) return;

  const prompt = dom.promptInput.value.trim();
  if (!prompt || state.mediaFiles.length === 0) return;

  const projectName = getProjectName();

  state.isGenerating = true;
  dom.btnExportJsx.disabled = true;
  dom.btnExportJsx.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Đang xử lý...';
  resetProgress();
  showProgress();
  addLog(`📄 Xuất JSX → ${BASE_OUTPUT_DIR}\\${projectName}`, 'info');

  try {
    const settings = await window.api.getSettings();
    const result = await window.api.exportJsxOnly({
      mediaFiles: state.mediaFiles.map(f => ({ path: f.path, name: f.name, type: f.type, metadata: f.metadata })),
      prompt,
      settings: {
        geminiApiKey: settings.geminiApiKey,
        outputDir: BASE_OUTPUT_DIR,
        projectName: projectName,
        compWidth: settings.compWidth || 1920,
        compHeight: settings.compHeight || 1080,
        compFps: settings.compFps || 30
      }
    });

    if (result.error) throw new Error(result.error);

    setStep('ai', 'done');
    setStep('validate', 'done');
    setStep('jsx', 'done');
    setProgress(100);
    addLog(`✅ JSX xuất xong: ${result.jsx_path}`, 'success');
    showOutput(result.jsx_path, result.output_dir, true, null, projectName);
    dom.outputCard.querySelector('h3').textContent = `📁 ${projectName} — Script JSX đã xuất!`;

  } catch (err) {
    addLog(`Lỗi xuất JSX: ${err.message}`, 'error');
    showOutput(null, null, false, err.message);
  } finally {
    state.isGenerating = false;
    dom.btnExportJsx.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Xuất JSX';
    updateGenerateButton();
  }
}

async function previewTimeline() {
  const prompt = dom.promptInput.value.trim();
  if (!prompt) return;

  dom.btnPreviewTimeline.disabled = true;
  dom.btnPreviewTimeline.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Đang gọi AI...';
  addLog('Đang gọi AI để xem trước timeline...', 'info');

  try {
    const settings = await window.api.getSettings();
    const result = await window.api.getTimelinePreview({
      mediaFiles: state.mediaFiles.map(f => ({ path: f.path, name: f.name, type: f.type, metadata: f.metadata })),
      prompt,
      settings: {
        geminiApiKey: settings.geminiApiKey,
        compWidth: settings.compWidth || 1920,
        compHeight: settings.compHeight || 1080,
        compFps: settings.compFps || 30
      }
    });

    if (result.error) throw new Error(result.error);

    const tl = result.timeline;
    // Show stats
    const layers = tl.layers || [];
    const comp = tl.composition || {};
    dom.timelineStats.innerHTML = [
      `<span class="stat-chip">⏱ ${comp.duration || 0}s</span>`,
      `<span class="stat-chip">📐 ${comp.width || 1920}×${comp.height || 1080}</span>`,
      `<span class="stat-chip">🎞 ${comp.fps || 30}fps</span>`,
      `<span class="stat-chip">🎚 ${layers.length} layers</span>`,
      `<span class="stat-chip">🎨 ${layers.filter(l => l.type === 'preset').length} presets</span>`
    ].join('');

    dom.timelineJsonContent.textContent = JSON.stringify(tl, null, 2);
    dom.modalTimeline.style.display = 'flex';
    addLog(`AI đã sinh timeline: ${layers.length} layers, ${comp.duration || 0}s`, 'success');

  } catch (err) {
    addLog(`Lỗi preview: ${err.message}`, 'error');
  } finally {
    dom.btnPreviewTimeline.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview JSON';
    updateGenerateButton();
  }
}

// --- Settings ---

async function loadSettings() {
  state.settings = await window.api.getSettings();
  dom.settingApiKey.value = state.settings.geminiApiKey || '';
  dom.settingAePath.value = state.settings.afterEffectsPath || '';
  dom.settingOutputDir.value = state.settings.outputDir || '';
  dom.settingCompWidth.value = state.settings.compWidth || 1920;
  dom.settingCompHeight.value = state.settings.compHeight || 1080;
  dom.settingCompFps.value = state.settings.compFps || 30;
}

async function saveSettings() {
  const ok = await askConfirm('Bạn có muốn lưu các thay đổi trong Cài đặt không?', {
    title: '⚙️ Xác nhận lưu Cài đặt',
    confirmText: 'Có, lưu cài đặt'
  });
  if (!ok) return;

  const settings = {
    geminiApiKey: dom.settingApiKey.value.trim(),
    afterEffectsPath: dom.settingAePath.value.trim(),
    outputDir: dom.settingOutputDir.value.trim(),
    compWidth: parseInt(dom.settingCompWidth.value) || 1920,
    compHeight: parseInt(dom.settingCompHeight.value) || 1080,
    compFps: parseInt(dom.settingCompFps.value) || 30
  };
  await window.api.saveSettings(settings);
  state.settings = settings;
  addLog('Đã lưu cài đặt', 'success');

  // Flash save button
  dom.btnSaveSettings.textContent = '✅ Đã lưu!';
  setTimeout(() => {
    dom.btnSaveSettings.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Lưu cài đặt
    `;
  }, 2000);
}

// --- Tab Navigation ---
function switchTab(tabName) {
  dom.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  dom.tabCreate.style.display = tabName === 'create' ? 'flex' : 'none';
  dom.tabSettings.style.display = tabName === 'settings' ? 'flex' : 'none';
  const tabSplitter = $('#tab-clip-splitter');
  if (tabSplitter) tabSplitter.style.display = tabName === 'clip-splitter' ? 'flex' : 'none';
  const tabPgen = $('#tab-premiere-gen');
  if (tabPgen) tabPgen.style.display = tabName === 'premiere-gen' ? 'flex' : 'none';
  const tabRules = $('#tab-rules');
  if (tabRules) tabRules.style.display = tabName === 'rules' ? 'flex' : 'none';
  const tabSuggester = $('#tab-source-suggester');
  if (tabSuggester) tabSuggester.style.display = tabName === 'source-suggester' ? 'flex' : 'none';
}
// --- Event Bindings ---
function initEvents() {
  // Window controls
  dom.btnMinimize.addEventListener('click', () => window.api.minimize());
  dom.btnMaximize.addEventListener('click', () => window.api.maximize());
  dom.btnClose.addEventListener('click', () => window.api.close());

  // Tab navigation
  dom.navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Drop zone
  dom.dropZone.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    if (files.length > 0) addMediaFiles(files);
  });

  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.add('drag-over');
  });

  dom.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
  });

  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).map(f => f.path);
    if (files.length > 0) addMediaFiles(files);
  });

  // Add files button
  dom.btnAddFiles.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    if (files.length > 0) addMediaFiles(files);
  });

  // Prompt
  dom.promptInput.addEventListener('input', () => {
    dom.charCount.textContent = `${dom.promptInput.value.length} ký tự`;
    updateGenerateButton();
    saveSession();
  });

  // Project name — save session on change, clear error state
  dom.projectNameInput.addEventListener('input', () => {
    dom.projectNameInput.classList.remove('input-error');
    saveSession();
  });

  // Presets
  dom.presetTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const preset = tag.dataset.preset;
      const current = dom.promptInput.value.trim();
      dom.promptInput.value = current ? `${current}\n${preset}` : preset;
      dom.promptInput.dispatchEvent(new Event('input'));
      // Visual feedback
      tag.style.borderColor = 'var(--accent-primary)';
      tag.style.color = 'var(--text-accent)';
      setTimeout(() => {
        tag.style.borderColor = '';
        tag.style.color = '';
      }, 500);
    });
  });

  // Generate (full pipeline → AE)
  dom.btnGenerate.addEventListener('click', generateProject);

  // Export JSX only (no AE)
  dom.btnExportJsx.addEventListener('click', exportJsxOnly);

  // Preview timeline JSON
  dom.btnPreviewTimeline.addEventListener('click', previewTimeline);

  // Modal controls
  if (dom.modalTimelineClose) {
    dom.modalTimelineClose.addEventListener('click', () => {
      dom.modalTimeline.style.display = 'none';
    });
  }
  if (dom.modalTimeline) {
    dom.modalTimeline.addEventListener('click', (e) => {
      if (e.target === dom.modalTimeline) dom.modalTimeline.style.display = 'none';
    });
  }
  if (dom.btnCopyJson) {
    dom.btnCopyJson.addEventListener('click', () => {
      navigator.clipboard.writeText(dom.timelineJsonContent.textContent);
      dom.btnCopyJson.textContent = '✅ Đã copy!';
      setTimeout(() => { dom.btnCopyJson.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy JSON'; }, 2000);
    });
  }
  if (dom.btnGenerateFromPreview) {
    dom.btnGenerateFromPreview.addEventListener('click', () => {
      dom.modalTimeline.style.display = 'none';
      generateProject();
    });
  }

  // Log toggle
  dom.logToggle.addEventListener('click', () => {
    const section = dom.logToggle.closest('.log-section');
    const content = dom.logContent;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    section.classList.toggle('open', !isOpen);
  });

  // Settings
  dom.btnSaveSettings.addEventListener('click', saveSettings);

  dom.btnToggleKey.addEventListener('click', () => {
    const input = dom.settingApiKey;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Browse AE exe (file picker for .exe)
  dom.btnBrowseAe.addEventListener('click', async () => {
    const file = await window.api.browseAeExe();
    if (file) dom.settingAePath.value = file;
  });

  dom.btnBrowseOutput.addEventListener('click', async () => {
    const dir = await window.api.selectDirectory();
    if (dir) dom.settingOutputDir.value = dir;
  });

  // Backend events
  window.api.onBackendReady((ready) => {
    state.backendReady = ready;
    const dot = dom.backendStatus.querySelector('.status-dot');
    const label = dom.backendStatus.querySelector('span');
    if (ready) {
      dot.className = 'status-dot connected';
      label.textContent = 'Sẵn sàng';
      addLog('Backend Python đã kết nối', 'success');
    } else {
      dot.className = 'status-dot error';
      label.textContent = 'Lỗi';
      addLog('Backend Python không khởi động được', 'error');
    }
    updateGenerateButton();
  });

  window.api.onPythonLog((msg) => {
    // Parse step updates from Python
    if (msg.includes('[STEP]')) {
      const stepMatch = msg.match(/\[STEP\]\s*(\w+)\s*:\s*(\w+)/);
      if (stepMatch) {
        setStep(stepMatch[1], stepMatch[2]);
      }
      const progressMatch = msg.match(/\[PROGRESS\]\s*(\d+)/);
      if (progressMatch) {
        setProgress(parseInt(progressMatch[1]));
      }
    }
    addLog(msg.trim(), 'info');
  });

  window.api.onPythonError((msg) => {
    addLog(msg.trim(), 'error');
  });
}

// --- Init ---
async function init() {
  initEvents();
  initSplitResizers();
  initClipSplitter();
  initPremiereGen();
  initSourceSuggester();
  initKyNangDropdown();
  initRules();
  await loadSettings();
  await loadSession();
  addLog('Ứng dụng đã sẵn sàng. Hãy thêm media files và nhập prompt.', 'info');
}

init();

// ============================================================
// TOOL B — CLIP SPLITTER UI
// ============================================================

function initClipSplitter() {
  const spState = {
    videoPath: null,
    outputDir: null,
    catalogPath: null,
    allRows: [],
    isSplitting: false
  };

  // --- DOM refs ---
  const spDom = {
    videoPath: $('#sp-video-path'),
    videoInfo: $('#sp-video-info'),
    videoMeta: $('#sp-video-meta'),
    btnBrowseVideo: $('#sp-btn-browse-video'),
    loai: $('#sp-loai'),
    cauThu: $('#sp-cau-thu'),
    doiBong: $('#sp-doi-bong'),
    kyNang: $('#sp-ky-nang'),
    outputDir: $('#sp-output-dir'),
    btnBrowseOut: $('#sp-btn-browse-output'),
    threshold: $('#sp-threshold'),
    thresholdVal: $('#sp-threshold-val'),
    btnAnalyze: $('#sp-btn-analyze'),
    btnSplit: $('#sp-btn-split'),
    progressWrap: $('#sp-progress-wrap'),
    progressFill: $('#sp-progress-fill'),
    progressText: $('#sp-progress-text'),
    analyzeResult: $('#sp-analyze-result'),
    statsGrid: $('#sp-stats-grid'),
    cutResult: $('#sp-cut-result'),
    resultSummary: $('#sp-result-summary'),
    btnOpenFolder: $('#sp-btn-open-folder-result'),
    btnOpenCatalog: $('#sp-btn-open-catalog'),
    catalogCard: $('#sp-catalog-card'),
    catalogCount: $('#sp-catalog-count'),
    catalogSearch: $('#sp-catalog-search'),
    catalogTbody: $('#sp-catalog-tbody'),
    logToggle: $('#sp-log-toggle'),
    logMessages: $('#sp-log-messages'),
  };

  // Log riêng cho Tool B
  function spLog(msg, type = 'info') {
    if (!spDom.logMessages) return;
    const el = document.createElement('div');
    el.className = `log-msg ${type}`;
    const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = `[${t}] ${msg}`;
    spDom.logMessages.appendChild(el);
    spDom.logMessages.scrollTop = spDom.logMessages.scrollHeight;
    spDom.logMessages.style.display = 'block';
  }

  // Slider
  if (spDom.threshold) {
    spDom.threshold.addEventListener('input', () => {
      spDom.thresholdVal.textContent = parseFloat(spDom.threshold.value).toFixed(2);
    });
  }

  // Log toggle
  if (spDom.logToggle) {
    spDom.logToggle.addEventListener('click', () => {
      const isHidden = spDom.logMessages.style.display === 'none';
      spDom.logMessages.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Chọn video
  if (spDom.videoPath && spDom.btnBrowseVideo) {
    spDom.videoPath.style.cursor = 'pointer';
    spDom.videoPath.addEventListener('click', () => spDom.btnBrowseVideo.click());
  }
  if (spDom.btnBrowseVideo) {
    spDom.btnBrowseVideo.addEventListener('click', async () => {
      try {
        const p = await window.api.selectVideoFile();
        if (!p) return;
        spState.videoPath = p;
        spDom.videoPath.value = p;
        // Auto parse filename: loai_CauThu_DoiBong_KyNang.mp4
        const base = p.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
        const parts = base.split('_');
        if (parts.length >= 4) {
          // Tìm loai từ danh sách hợp lệ
          const VALID_LOAI = ['rai_1', 'rai_2_1', 'rai_2_2', 'rai_3', 'rai_4', 'phong_van', 'training',
            'binh_luan_chay', 'khan_dai', 'anh_thong_so', 'anh_thoi_diem', 'anh_chung_bao', 'sa_ban'];
          // Thử ghép 1, 2, 3 phần đầu làm loai
          let loaiFound = '';
          for (let n = 3; n >= 1; n--) {
            const candidate = parts.slice(0, n).join('_');
            if (VALID_LOAI.includes(candidate)) { loaiFound = candidate; break; }
          }
          if (loaiFound) {
            spDom.loai.value = loaiFound;
            const rest = parts.slice(loaiFound.split('_').length);
            if (rest[0]) spDom.cauThu.value = rest[0];
            if (rest[1]) spDom.doiBong.value = rest[1];
            if (rest[2]) spDom.kyNang.value = rest[2];
            spLog(`Auto-detect: loai=${loaiFound}, cau_thu=${rest[0] || ''}, doi_bong=${rest[1] || ''}`, 'info');
          }
        }
        // Hiện thông tin nhanh
        spDom.videoInfo.style.display = 'block';
        spDom.videoMeta.textContent = `📂 ${base}`;
        spDom.btnSplit.disabled = !spState.outputDir;
        spLog(`Đã chọn video: ${base}`, 'info');
      } catch (err) {
        spLog(`Lỗi chọn video: ${err.message}`, 'error');
      }
    });
  }

  // Chọn thư mục output
  if (spDom.outputDir && spDom.btnBrowseOut) {
    spDom.outputDir.style.cursor = 'pointer';
    spDom.outputDir.addEventListener('click', () => spDom.btnBrowseOut.click());
  }
  if (spDom.btnBrowseOut) {
    spDom.btnBrowseOut.addEventListener('click', async () => {
      try {
        const d = await window.api.selectDirectory();
        if (!d) return;
        spState.outputDir = d;
        spDom.outputDir.value = d;
        spDom.btnSplit.disabled = !spState.videoPath;
        spLog(`Thư mục output: ${d}`, 'info');
      } catch (err) {
        spLog(`Lỗi chọn thư mục: ${err.message}`, 'error');
      }
    });
  }

  // Phân tích (preview)
  if (spDom.btnAnalyze) {
    spDom.btnAnalyze.addEventListener('click', async () => {
      if (!spState.videoPath) {
        spLog('Chưa chọn video nguồn!', 'error'); return;
      }
      spLog('Đang phân tích video...', 'info');
      spDom.btnAnalyze.disabled = true;
      try {
        const threshold = parseFloat(spDom.threshold.value);
        const result = await window.api.clipSplitterAnalyze({ video_path: spState.videoPath, threshold });
        if (result.error) throw new Error(result.error);

        // Hiện thống kê
        spDom.analyzeResult.style.display = 'block';
        const sceneCount = result.stats?.count ?? result.scene_count ?? '?';
        const durSec = result.meta?.duration ?? result.duration_s ?? 0;
        const fpsVal = result.meta?.fps ? Math.round(result.meta.fps) : (result.fps || 30);
        const dur = durSec ? `${Math.floor(durSec / 60)}m${Math.floor(durSec % 60)}s` : '?';
        spDom.statsGrid.innerHTML = `
          <div class="sp-stat-item"><div class="sp-stat-val">${sceneCount}</div><div class="sp-stat-label">Scene ước tính</div></div>
          <div class="sp-stat-item"><div class="sp-stat-val">${dur}</div><div class="sp-stat-label">Thời lượng</div></div>
          <div class="sp-stat-item"><div class="sp-stat-val">${fpsVal}</div><div class="sp-stat-label">FPS</div></div>
        `;
        spLog(`Phân tích xong: ~${sceneCount} clip, thời lượng ${dur}, ${fpsVal}fps (TB ${result.stats?.avg || '?'}s/clip)`, 'success');
      } catch (err) {
        spLog(`Lỗi phân tích: ${err.message}`, 'error');
      } finally {
        spDom.btnAnalyze.disabled = false;
      }
    });
  }

  // Cắt clip
  if (spDom.btnSplit) {
    spDom.btnSplit.addEventListener('click', async () => {
      if (!spState.videoPath || !spState.outputDir) {
        spLog('Cần chọn video và thư mục output!', 'error'); return;
      }
      if (spState.isSplitting) return;
      spState.isSplitting = true;

      // UI loading
      spDom.btnSplit.querySelector('.btn-generate-content').style.display = 'none';
      spDom.btnSplit.querySelector('.btn-generate-loading').style.display = 'flex';
      spDom.progressWrap.style.display = 'block';
      spDom.progressFill.style.width = '0%';
      spDom.progressText.textContent = 'Đang cắt clip...';

      let progress = 0;
      const progressTimer = setInterval(() => {
        if (progress < 90) {
          progress += Math.random() * 3;
          spDom.progressFill.style.width = Math.min(progress, 90) + '%';
        }
      }, 800);

      try {
        const params = {
          video_path: spState.videoPath,
          out_root: spState.outputDir,
          output_root: spState.outputDir,
          loai: spDom.loai.value,
          cau_thu: spDom.cauThu.value.trim(),
          doi_bong: spDom.doiBong.value.trim(),
          ky_nang: spDom.kyNang.value.trim(),
          threshold: parseFloat(spDom.threshold.value)
        };
        spLog(`Bắt đầu cắt: loai=${params.loai}, threshold=${params.threshold}`, 'info');
        const result = await window.api.clipSplitterSplit(params);

        clearInterval(progressTimer);
        if (result.error) throw new Error(result.error);

        spDom.progressFill.style.width = '100%';
        spDom.progressText.textContent = '✅ Hoàn thành!';

        // Hiện kết quả
        const clipCount = result.total_clips ?? result.clips_created ?? 0;
        spState.catalogPath = result.catalog_path || '';
        spDom.cutResult.style.display = 'block';
        spDom.resultSummary.innerHTML = `
          🎬 Đã cắt <strong>${clipCount} clip</strong><br>
          📄 Catalog: <code style="font-size:10px">${result.catalog_path || ''}</code><br>
          📁 Lưu tại: <code style="font-size:10px">${spState.outputDir}</code>
        `;
        spLog(`✅ Xong! ${clipCount} clips → ${spState.outputDir}`, 'success');

        // Load catalog
        if (result.catalog_path) {
          await loadCatalog(result.catalog_path);
        }
      } catch (err) {
        clearInterval(progressTimer);
        spDom.progressText.textContent = `❌ Lỗi: ${err.message}`;
        spLog(`Lỗi cắt: ${err.message}`, 'error');
      } finally {
        spState.isSplitting = false;
        spDom.btnSplit.querySelector('.btn-generate-content').style.display = 'flex';
        spDom.btnSplit.querySelector('.btn-generate-loading').style.display = 'none';
      }
    });
  }

  // Mở thư mục kết quả
  if (spDom.btnOpenFolder) {
    spDom.btnOpenFolder.addEventListener('click', () => {
      if (spState.outputDir) window.api.openOutputFolder(spState.outputDir);
    });
  }

  // Mở catalog
  if (spDom.btnOpenCatalog) {
    spDom.btnOpenCatalog.addEventListener('click', () => {
      if (spState.catalogPath) window.api.openFile(spState.catalogPath);
    });
  }

  // Tìm kiếm catalog
  if (spDom.catalogSearch) {
    spDom.catalogSearch.addEventListener('input', () => {
      filterCatalog(spDom.catalogSearch.value.trim().toLowerCase());
    });
  }

  // --- Load & hiện catalog ---
  async function loadCatalog(catalogPath) {
    try {
      const result = await window.api.clipSplitterCatalog({ catalog_path: catalogPath });
      if (result.error) throw new Error(result.error);
      spState.allRows = result.rows || [];
      spDom.catalogCard.style.display = 'block';
      spDom.catalogCount.textContent = `${spState.allRows.length} clips`;
      renderCatalogTable(spState.allRows);
      spLog(`Đã load catalog: ${spState.allRows.length} clips`, 'info');
    } catch (err) {
      spLog(`Lỗi load catalog: ${err.message}`, 'error');
    }
  }

  function filterCatalog(query) {
    if (!query) { renderCatalogTable(spState.allRows); return; }
    const filtered = spState.allRows.filter(r =>
      (r.ten_file || '').toLowerCase().includes(query) ||
      (r.loai || '').toLowerCase().includes(query) ||
      (r.cau_thu || '').toLowerCase().includes(query) ||
      (r.ky_nang || '').toLowerCase().includes(query)
    );
    renderCatalogTable(filtered);
  }

  function renderCatalogTable(rows) {
    if (!spDom.catalogTbody) return;
    spDom.catalogTbody.innerHTML = rows.map(r => {
      const dur = r.duration_s ? parseFloat(r.duration_s).toFixed(1) + 's' : '?';
      return `<tr>
        <td title="${r.ten_file || ''}">${(r.ten_file || '').substring(0, 30)}…</td>
        <td><span class="sp-loai-badge">${r.loai || ''}</span></td>
        <td>${r.cau_thu || ''}</td>
        <td>${r.ky_nang || ''}</td>
        <td class="sp-dur">${dur}</td>
      </tr>`;
    }).join('');
  }
}


// ============================================================
// TOOL A — PREMIERE XML GENERATOR UI
// ============================================================

function initPremiereGen() {
  const pgState = {
    timelineCsv: null,
    sourceCsv: null,
    catalogCsv: null,
    voice: null,
    srt: null,
    sourceRoot: null,
    outputDir: null,
    lastXmlPath: null,
    elementDir: null,
    textureId: null,
    enableAnimations: true,
    isGenerating: false,
  };

  // --- DOM refs ---
  const pg = {
    timelineCsv: $('#pg-timeline-csv'),
    sourceCsv: $('#pg-source-csv'),
    catalogCsv: $('#pg-catalog-csv'),
    voice: $('#pg-voice'),
    srt: $('#pg-srt'),
    sourceRoot: $('#pg-source-root'),
    outputDir: $('#pg-output-dir'),
    projectName: $('#pg-project-name'),
    btnTimelineCsv: $('#pg-btn-timeline-csv'),
    btnSourceCsv: $('#pg-btn-source-csv'),
    btnCatalogCsv: $('#pg-btn-catalog-csv'),
    btnVoice: $('#pg-btn-voice'),
    btnSrt: $('#pg-btn-srt'),
    btnSourceRoot: $('#pg-btn-source-root'),
    btnOutputDir: $('#pg-btn-output-dir'),
    btnGenerate: $('#pg-btn-generate'),
    resultCard: $('#pg-result-card'),
    resultSummary: $('#pg-result-summary'),
    missingCard: $('#pg-missing-card'),
    missingCount: $('#pg-missing-count'),
    missingList: $('#pg-missing-list'),
    btnOpenXml: $('#pg-btn-open-xml'),
    btnOpenXmlDir: $('#pg-btn-open-xml-folder'),
    btnOpenXmlDir2: $('#pg-btn-open-xml-dir'),
    logToggle: $('#pg-log-toggle'),
    logMessages: $('#pg-log-messages'),
    // Checklist
    chkTimeline: $('#pgc-timeline'),
    chkSource: $('#pgc-source'),
    chkCatalog: $('#pgc-catalog'),
    chkVoice: $('#pgc-voice'),
    chkSrt: $('#pgc-srt'),
    chkSourceRoot: $('#pgc-source-root'),
    chkOutput: $('#pgc-output'),
    // Element overlay fields
    elementDir: $('#pg-element-dir'),
    btnElementDir: $('#pg-btn-element-dir'),
    textureSelect: $('#pg-texture-select'),
    chkElement: $('#pgc-element'),
    chkTexture: $('#pgc-texture'),
    chkAnimation: $('#pgc-animation'),
    enableAnimations: $('#pg-enable-animations'),
  };

  function pgLog(msg, type = 'info') {
    if (!pg.logMessages) return;
    const el = document.createElement('div');
    el.className = `log-msg ${type}`;
    const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = `[${t}] ${msg}`;
    pg.logMessages.appendChild(el);
    pg.logMessages.scrollTop = pg.logMessages.scrollHeight;
    pg.logMessages.style.display = 'block';
  }

  function updateCheck(el, done, optional = false) {
    if (!el) return;
    if (done) {
      el.classList.add('done'); el.classList.remove('optional');
      el.textContent = el.textContent.replace('⬜', '✅');
    } else if (optional) {
      el.classList.add('optional'); el.classList.remove('done');
      el.textContent = el.textContent.replace('⬜', '🟣');
    }
  }

  function updateGenerateBtn() {
    if (!pg.btnGenerate) return;
    const ready = pgState.timelineCsv && pgState.sourceCsv &&
      pgState.catalogCsv && pgState.voice &&
      pgState.sourceRoot && pgState.outputDir;
    pg.btnGenerate.disabled = !ready;
  }

  // Log toggle
  if (pg.logToggle) {
    pg.logToggle.addEventListener('click', () => {
      const isHidden = pg.logMessages.style.display === 'none';
      pg.logMessages.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Helper: bind file picker buttons
  function bindFilePicker(btn, input, stateKey, checkEl, apiFn, label, optional = false) {
    if (!btn) return;
    if (input) {
      input.style.cursor = 'pointer';
      input.addEventListener('click', () => btn.click());
    }
    btn.addEventListener('click', async () => {
      try {
        const p = await apiFn();
        if (!p) return;
        pgState[stateKey] = p;
        if (input) input.value = p;
        if (checkEl) {
          checkEl.textContent = `✅ ${label}: ${p.replace(/\\/g, '/').split('/').pop()}`;
          checkEl.classList.add('done');
        }
        pgLog(`${label}: ${p.replace(/\\/g, '/').split('/').pop()}`, 'info');
        updateGenerateBtn();
      } catch (err) {
        pgLog(`Lỗi chọn ${label}: ${err.message}`, 'error');
      }
    });
  }

  // Bind tất cả file pickers
  bindFilePicker(pg.btnTimelineCsv, pg.timelineCsv, 'timelineCsv', pg.chkTimeline,
    () => window.api.selectCsvFile(), '1. CSV Timeline');
  bindFilePicker(pg.btnSourceCsv, pg.sourceCsv, 'sourceCsv', pg.chkSource,
    () => window.api.selectCsvFile(), '2. CSV Phân Loại');
  bindFilePicker(pg.btnCatalogCsv, pg.catalogCsv, 'catalogCsv', pg.chkCatalog,
    () => window.api.selectCsvFile(), '3. Catalog');
  bindFilePicker(pg.btnVoice, pg.voice, 'voice', pg.chkVoice,
    () => window.api.selectVoiceFile(), '4. Voice');
  bindFilePicker(pg.btnSrt, pg.srt, 'srt', pg.chkSrt,
    () => window.api.selectSrtFile(), '5. SRT', true);

  // Thư mục Source Root
  if (pg.btnSourceRoot) {
    pg.btnSourceRoot.addEventListener('click', async () => {
      try {
        const d = await window.api.selectDirectory();
        if (!d) return;
        pgState.sourceRoot = d;
        pg.sourceRoot.value = d;
        pg.chkSourceRoot.textContent = `✅ Thư mục Source: ${d.replace(/\\/g, '/').split('/').pop()}`;
        pg.chkSourceRoot.classList.add('done');
        pgLog(`Source root: ${d}`, 'info');
        updateGenerateBtn();
      } catch (err) {
        pgLog(`Lỗi: ${err.message}`, 'error');
      }
    });
  }

  // Thư mục Output
  if (pg.btnOutputDir) {
    pg.btnOutputDir.addEventListener('click', async () => {
      try {
        const d = await window.api.selectDirectory();
        if (!d) return;
        pgState.outputDir = d;
        pg.outputDir.value = d;
        pg.chkOutput.textContent = `✅ Output: ${d.replace(/\\/g, '/').split('/').pop()}`;
        pg.chkOutput.classList.add('done');
        pgLog(`Output dir: ${d}`, 'info');
        updateGenerateBtn();
      } catch (err) {
        pgLog(`Lỗi: ${err.message}`, 'error');
      }
    });
  }

  // Thư mục Element (tùy chọn)
  if (pg.btnElementDir) {
    if (pg.elementDir) {
      pg.elementDir.style.cursor = 'pointer';
      pg.elementDir.addEventListener('click', () => pg.btnElementDir.click());
    }
    pg.btnElementDir.addEventListener('click', async () => {
      try {
        const d = await window.api.selectDirectory();
        if (!d) return;
        pgState.elementDir = d;
        if (pg.elementDir) pg.elementDir.value = d;
        if (pg.chkElement) {
          pg.chkElement.textContent = `✅ Element: ${d.replace(/\\/g, '/').split('/').pop()}`;
          pg.chkElement.classList.add('done');
        }
        pgLog(`Element dir: ${d}`, 'info');
      } catch (err) {
        pgLog(`Lỗi chọn Element dir: ${err.message}`, 'error');
      }
    });
  }

  // Texture select (tùy chọn)
  if (pg.textureSelect) {
    pg.textureSelect.addEventListener('change', () => {
      pgState.textureId = pg.textureSelect.value || null;
      if (pg.chkTexture) {
        if (pgState.textureId) {
          const label = pg.textureSelect.options[pg.textureSelect.selectedIndex].text;
          pg.chkTexture.textContent = `✅ Texture: ${label}`;
          pg.chkTexture.classList.add('done');
        } else {
          pg.chkTexture.textContent = '⬜ Texture (tùy chọn)';
          pg.chkTexture.classList.remove('done');
        }
      }
      pgLog(`Texture: ${pgState.textureId || '(không dùng)'}`, 'info');
    });
  }

  // Animation toggle
  if (pg.enableAnimations) {
    pg.enableAnimations.addEventListener('change', () => {
      pgState.enableAnimations = pg.enableAnimations.checked;
      if (pg.chkAnimation) {
        pg.chkAnimation.textContent = pgState.enableAnimations
          ? '✅ Animation: BẬT'
          : '⬜ Animation: TẮT';
        pg.chkAnimation.classList.toggle('done', pgState.enableAnimations);
      }
      pgLog(`Animation: ${pgState.enableAnimations ? 'BẬT' : 'TẮT'}`, 'info');
    });
  }

  // Nút Generate
  if (pg.btnGenerate) {
    pg.btnGenerate.addEventListener('click', async () => {
      if (pgState.isGenerating) return;
      if (!pgState.timelineCsv || !pgState.sourceCsv || !pgState.catalogCsv ||
        !pgState.voice || !pgState.sourceRoot || !pgState.outputDir) {
        pgLog('Chưa đủ input! Cần: 2 CSV, Catalog, Voice, Source folder, Output folder.', 'error');
        return;
      }

      pgState.isGenerating = true;
      pg.btnGenerate.querySelector('.btn-generate-content').style.display = 'none';
      pg.btnGenerate.querySelector('.btn-generate-loading').style.display = 'flex';
      pg.resultCard.style.display = 'none';
      pg.missingCard.style.display = 'none';

      try {
        const projectName = (pg.projectName.value.trim() || 'Premiere_Timeline').replace(/[^a-zA-Z0-9_\-À-ỹ]/g, '_');

        pgLog(`Đang gen XML: ${projectName}.xml ...`, 'info');

        const params = {
          timeline_csv: pgState.timelineCsv,
          source_plan_csv: pgState.sourceCsv,
          catalog_csv: pgState.catalogCsv,
          voice_path: pgState.voice,
          source_root: pgState.sourceRoot,
          output_dir: pgState.outputDir,
          project_name: projectName,
          srt_path: pgState.srt || null,
          element_dir: pgState.elementDir || null,
          texture_id: pgState.textureId || null,
          enable_animations: pgState.enableAnimations,
        };

        const result = await window.api.premiereGenerateXml(params);
        if (result.error) throw new Error(result.error);

        pgState.lastXmlPath = result.output_path || (pgState.outputDir + '/' + projectName + '.xml');
        const totalClips = result.total_clips || 0;
        const missing = result.missing || [];

        const totalElements = result.total_elements || 0;
        const totalTransitions = result.total_transitions || 0;
        const animEnabled = result.animations_enabled || false;

        // Hiện kết quả thành công
        pg.resultCard.style.display = 'block';
        pg.resultSummary.innerHTML = `
          🎬 <strong>${totalClips} clip</strong> đã được đặt vào timeline<br>
          📄 File: <code style="font-size:10px">${pgState.lastXmlPath}</code><br>
          ${totalElements > 0 ? `🎨 <strong>${totalElements} element</strong> overlay (V3/V4)<br>` : ''}
          ${animEnabled ? `🎬 Animation: Ken Burns zoom + Opacity fade + ${totalTransitions} transitions<br>` : ''}
          ${missing.length > 0 ? `⚠️ <span style="color:#fbbf24">${missing.length} câu thiếu source</span>` : '✅ Đủ source cho tất cả câu'}
        `;
        pgLog(`✅ Gen xong! ${totalClips} clips, ${totalElements} elements, ${totalTransitions} transitions, ${missing.length} thiếu source, animation=${animEnabled ? 'ON' : 'OFF'}`, 'success');

        // Hiện danh sách thiếu source (nếu có)
        if (missing.length > 0) {
          pg.missingCard.style.display = 'block';
          pg.missingCount.textContent = missing.length;
          pg.missingList.innerHTML = missing.map(m =>
            `<div class="pgen-missing-item">⚠️ ${m}</div>`
          ).join('');
        }

      } catch (err) {
        pgLog(`❌ Lỗi gen XML: ${err.message}`, 'error');
      } finally {
        pgState.isGenerating = false;
        pg.btnGenerate.querySelector('.btn-generate-content').style.display = 'flex';
        pg.btnGenerate.querySelector('.btn-generate-loading').style.display = 'none';
      }
    });
  }

  // Mở file XML
  if (pg.btnOpenXml) {
    pg.btnOpenXml.addEventListener('click', () => {
      if (pgState.lastXmlPath) window.api.openFile(pgState.lastXmlPath);
    });
  }

  // Mở thư mục output
  const openOutDir = () => {
    if (pgState.outputDir) window.api.openOutputFolder(pgState.outputDir);
  };
  if (pg.btnOpenXmlDir) pg.btnOpenXmlDir.addEventListener('click', openOutDir);
  if (pg.btnOpenXmlDir2) pg.btnOpenXmlDir2.addEventListener('click', openOutDir);
}


// ============================================================
// KỸ NĂNG DROPDOWN — Shared state (Tool B + Rules tab)
// ============================================================

const KY_NANG_DEFAULT = ['Mixed', 'Skill', 'Bàn thắng', 'Kiến tạo', 'Đá Phạt', 'Đá Pen'];
const KY_NANG_STORAGE_KEY = 'ky_nang_list';

function loadKyNangList() {
  try {
    const saved = localStorage.getItem(KY_NANG_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return [...KY_NANG_DEFAULT];
}

function saveKyNangList(list) {
  try { localStorage.setItem(KY_NANG_STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

function syncKyNangDropdown(list) {
  const sel = $('#sp-ky-nang');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '';
  list.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    if (k === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderKyNangTags(list) {
  const container = $('#rules-ky-nang-list');
  if (!container) return;
  container.innerHTML = '';
  list.forEach((k, idx) => {
    const tag = document.createElement('span');
    const isDefault = KY_NANG_DEFAULT.includes(k);
    tag.className = `rules-ky-nang-tag${isDefault ? '' : ' custom-tag'}`;
    tag.innerHTML = `${k}${isDefault ? '' : ' <span class="tag-remove" data-idx="' + idx + '">✕</span>'}`;
    container.appendChild(tag);
  });
  // Remove custom tag listeners
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const list = loadKyNangList();
      const targetName = list[idx] || '';
      const ok = await askConfirm(`Bạn có chắc muốn xóa kỹ năng "${targetName}" khỏi danh sách không?`, {
        title: '🗑 Xác nhận xóa kỹ năng',
        confirmText: 'Xóa',
        danger: true
      });
      if (!ok) return;
      list.splice(idx, 1);
      saveKyNangList(list);
      syncKyNangDropdown(list);
      renderKyNangTags(list);
    });
  });
}

function addKyNang(name) {
  const clean = name.trim();
  if (!clean) return false;
  const list = loadKyNangList();
  if (list.some(k => k.toLowerCase() === clean.toLowerCase())) return false;
  list.push(clean);
  saveKyNangList(list);
  syncKyNangDropdown(list);
  renderKyNangTags(list);
  return true;
}

// ============================================================
// TOOL B — Nút "＋" thêm kỹ năng mới
// ============================================================

function initKyNangDropdown() {
  const list = loadKyNangList();
  syncKyNangDropdown(list);

  const addBtn = $('#sp-ky-nang-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = prompt('Nhập tên kỹ năng mới:');
      if (!name) return;
      if (!addKyNang(name)) {
        alert(`"${name}" đã có trong danh sách!`);
      }
    });
  }
}

// ============================================================
// TAB RULES — initRules()
// ============================================================

function initRules() {
  const list = loadKyNangList();
  renderKyNangTags(list);

  const addBtn = $('#rules-btn-add-ky-nang');
  const addInput = $('#rules-new-ky-nang');

  function doAdd() {
    if (!addInput) return;
    const name = addInput.value.trim();
    if (!name) return;
    if (!addKyNang(name)) {
      addInput.style.borderColor = '#f87171';
      addInput.title = 'Kỹ năng này đã tồn tại!';
      setTimeout(() => { addInput.style.borderColor = ''; addInput.title = ''; }, 1500);
      return;
    }
    addInput.value = '';
  }

  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (addInput) {
    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doAdd();
    });
  }
}

// ============================================================
// TOOL 1 — SOURCE SUGGESTER UI (Gợi ý phân loại Source theo phong cách)
// ============================================================

const SG_VALID_LOAI = [
  { code: 'rai_1', label: 'rai_1 (Rải đơn)' },
  { code: 'rai_2_1', label: 'rai_2_1 (Rải đôi 1)' },
  { code: 'rai_2_2', label: 'rai_2_2 (Rải đôi 2)' },
  { code: 'rai_3', label: 'rai_3 (Rải 3)' },
  { code: 'rai_4', label: 'rai_4 (Rải 4 / Danh hiệu)' },
  { code: 'phong_van', label: 'phong_van (Phỏng vấn)' },
  { code: 'training', label: 'training (Tập luyện)' },
  { code: 'binh_luan_chay', label: 'binh_luan_chay (BLV nói)' },
  { code: 'khan_dai', label: 'khan_dai (Khán đài)' },
  { code: 'anh_thong_so', label: 'anh_thong_so (Bảng số liệu)' },
  { code: 'anh_thoi_diem', label: 'anh_thoi_diem (Ảnh khoảnh khắc)' },
  { code: 'anh_chung_bao', label: 'anh_chung_bao (Mặt báo)' },
  { code: 'sa_ban', label: 'sa_ban (Sa bàn)' }
];

const SG_VALID_ELEMENTS = [
  { code: 'auto', label: '✨ auto (Tự động)' },
  { code: 'none', label: '🚫 none (Không phủ)' },
  { code: 'tv_retro', label: '📺 tv_retro (Khung Sofa TV)' },
  { code: 'film_grain', label: '🎞️ film_grain (Phim 8mm hồi ức)' },
  { code: 'scout_frame', label: '📋 scout_frame (Hồ sơ Scout)' },
  { code: 'stats_table', label: '📊 stats_table (Bảng số liệu)' },
  { code: 'stats_table_1', label: '📊 stats_table_1 (Bảng mẫu 1)' },
  { code: 'stats_table_2', label: '📊 stats_table_2 (Bảng mẫu 2)' },
  { code: 'tv_sony', label: '📺 tv_sony (TV Sony bàn gỗ)' },
  { code: 'tv_dolly', label: '📺 tv_dolly (TV Dolly In)' },
  { code: 'circle_gold', label: '🟡 circle_gold (Vòng tròn vàng)' },
  { code: 'circle_blue', label: '🔵 circle_blue (Vòng tròn xanh)' },
  { code: 'paper_texture', label: '📜 paper_texture (Giấy cũ)' },
  { code: 'paper_texture_2', label: '📜 paper_texture_2 (Giấy cũ 2)' },
  { code: 'texture_dark', label: '🌑 texture_dark (Phủ tối)' },
  { code: 'grid_orange', label: '🟧 grid_orange (Lưới cam)' }
];

const SG_VALID_ANIMS = [
  { code: 'auto', label: '🔄 auto (Mặc định)' },
  { code: 'zoom_in', label: '🔍 zoom_in (Phóng to)' },
  { code: 'zoom_out', label: '🔎 zoom_out (Thu nhỏ)' },
  { code: 'static', label: '⏹️ static (Đứng yên)' }
];

function initSourceSuggester() {
  const sgState = {
    csvPath: localStorage.getItem('sg_timeline_csv') || '',
    defaultThoiKy: localStorage.getItem('sg_default_thoiky') || '',
    rulesPath: '',
    examplesPath: '',
    rulesLocked: true,
    rulesOriginalText: '',
    rows: [],
    examples: [],
    isSuggesting: false
  };

  const sgDom = {
    rulesInput: $('#sg-rules-input'),
    rulesStatus: $('#sg-rules-status'),
    rulesChar: $('#sg-rules-char'),
    rulesFilepath: $('#sg-rules-filepath'),
    btnReloadRules: $('#sg-btn-reload-rules'),
    btnOpenRules: $('#sg-btn-open-rules'),
    btnEditRules: $('#sg-btn-edit-rules'),
    btnCancelRules: $('#sg-btn-cancel-rules'),
    btnSaveRules: $('#sg-btn-save-rules'),
    timelineCsv: $('#sg-timeline-csv'),
    btnBrowseCsv: $('#sg-btn-browse-csv'),
    defaultThoiKy: $('#sg-default-thoiky'),
    btnSuggest: $('#sg-btn-suggest'),
    btnSuggestText: $('#sg-btn-suggest-text'),
    exampleCount: $('#sg-example-count'),
    examplesFilepath: $('#sg-examples-filepath'),
    btnOpenExamples: $('#sg-btn-open-examples'),
    examplesList: $('#sg-examples-list'),
    btnClearExamples: $('#sg-btn-clear-examples'),
    logBox: $('#sg-log-box'),
    statTotal: $('#sg-stat-total'),
    statLow: $('#sg-stat-low'),
    btnLearn: $('#sg-btn-learn'),
    btnExport: $('#sg-btn-export'),
    btnFillThoiKy: $('#sg-btn-fill-thoiky'),
    tbody: $('#sg-tbody')
  };

  function sgLog(msg, type = 'info') {
    if (!sgDom.logBox) return;
    const line = document.createElement('div');
    line.className = `sp-log-line ${type}`;
    const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${t}] ${msg}`;
    sgDom.logBox.appendChild(line);
    sgDom.logBox.scrollTop = sgDom.logBox.scrollHeight;
  }

  function splitLoaiSource(loaiStr) {
    if (!loaiStr) return ['rai_1', ''];
    const parts = String(loaiStr).split('+').map(s => s.trim()).filter(Boolean);
    return [parts[0] || 'rai_1', parts[1] || ''];
  }

  function combineLoaiSource(p1, p2) {
    const a = (p1 || 'rai_1').trim();
    const b = (p2 || '').trim();
    if (b && b !== a) return `${a} + ${b}`;
    return a;
  }

  function updateRulesMeta(text) {
    if (!sgDom.rulesChar) return;
    const str = String(text || '');
    const lineCount = str.trim() ? str.split(/\r?\n/).filter(l => l.trim() !== '').length : 0;
    sgDom.rulesChar.textContent = `${lineCount} dòng · ${str.length} ký tự`;
  }

  function setRulesLocked(locked) {
    sgState.rulesLocked = Boolean(locked);
    if (sgDom.rulesInput) {
      sgDom.rulesInput.readOnly = sgState.rulesLocked;
      sgDom.rulesInput.classList.toggle('is-locked', sgState.rulesLocked);
    }
    if (sgDom.rulesStatus) {
      sgDom.rulesStatus.textContent = sgState.rulesLocked ? '🔒 Đang khóa' : '🔓 Đang chỉnh sửa';
      sgDom.rulesStatus.classList.toggle('unsaved', !sgState.rulesLocked);
    }
    if (sgDom.btnEditRules) sgDom.btnEditRules.style.display = sgState.rulesLocked ? 'inline-flex' : 'none';
    if (sgDom.btnCancelRules) sgDom.btnCancelRules.style.display = sgState.rulesLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveRules) sgDom.btnSaveRules.style.display = sgState.rulesLocked ? 'none' : 'inline-flex';

    if (!sgState.rulesLocked && sgDom.rulesInput) {
      sgState.rulesOriginalText = sgDom.rulesInput.value;
      sgDom.rulesInput.focus();
    }
  }

  async function saveRulesText(newText, logMsg) {
    const res = await window.api.suggesterSaveRules({ rules: newText });
    if (res && res.error) throw new Error(res.error);
    sgState.rulesOriginalText = newText;
    if (sgDom.rulesInput) sgDom.rulesInput.value = newText;
    updateRulesMeta(newText);
    setRulesLocked(true);
    if (logMsg) sgLog(logMsg, 'success');
  }

  function renderExamples() {
    if (!sgDom.examplesList || !sgDom.exampleCount) return;
    sgDom.exampleCount.textContent = sgState.examples.length;
    if (!sgState.examples.length) {
      sgDom.examplesList.innerHTML = `<div class="sp-hint" style="text-align:center; padding:12px 0;">Chưa có ví dụ nào. Hãy chạy gợi ý hoặc chỉnh sửa bảng rồi bấm "Lưu vào Kho ví dụ".</div>`;
      return;
    }
    const recent = [...sgState.examples].reverse().slice(0, 40);
    sgDom.examplesList.innerHTML = recent.map(ex => {
      const safeText = String(ex.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeNote = ex.note ? ` · 💡 ${String(ex.note).replace(/</g, '&lt;')}` : '';
      const elInfo = ex.element && ex.element !== 'auto' ? ` · 🖼 ${ex.element}` : '';
      const animInfo = ex.anim && ex.anim !== 'auto' ? ` · 🎬 ${ex.anim}` : '';
      return `
        <div class="sg-example-item">
          <div style="flex:1; min-width:0;">
            <div class="sg-example-text">"${safeText}"</div>
            <div class="sg-example-meta">→ ${ex.loai_source}${elInfo}${animInfo}${ex.thoi_ky ? ' | ' + ex.thoi_ky : ''}${safeNote}</div>
          </div>
          <button class="sg-example-del" data-ex-id="${ex.id}" title="Xóa mẫu này">✕</button>
        </div>
      `;
    }).join('');

    sgDom.examplesList.querySelectorAll('.sg-example-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.exId;
        const ok = await askConfirm(`Bạn có chắc muốn xóa mẫu ví dụ #${id} khỏi kho đã dạy AI không?`, {
          title: '🗑 Xác nhận xóa mẫu ví dụ',
          confirmText: 'Xóa mẫu này',
          danger: true
        });
        if (!ok) return;
        try {
          const res = await window.api.suggesterDeleteExample({ id });
          if (res.error) throw new Error(res.error);
          sgState.examples = res.examples || [];
          renderExamples();
          sgLog(`Đã xóa mẫu #${id} khỏi kho ví dụ.`, 'info');
        } catch (err) {
          sgLog(`Lỗi xóa mẫu: ${err.message}`, 'error');
        }
      });
    });
  }

  function updateStats() {
    if (!sgDom.statTotal || !sgDom.statLow) return;
    const total = sgState.rows.length;
    const lowCount = sgState.rows.filter(r => typeof r.confidence === 'number' && r.confidence < 0.7).length;
    sgDom.statTotal.textContent = total;
    sgDom.statLow.textContent = lowCount;
    if (sgDom.btnLearn) sgDom.btnLearn.disabled = total === 0;
    if (sgDom.btnExport) sgDom.btnExport.disabled = total === 0;
  }

  function renderTable() {
    if (!sgDom.tbody) return;
    updateStats();

    if (!sgState.rows.length) {
      sgDom.tbody.innerHTML = `
        <tr>
          <td colspan="9" class="sg-empty-row">
            Hãy chọn file <code>1_CSV_Timeline.csv</code> ở cột bên trái để bắt đầu.
          </td>
        </tr>
      `;
      return;
    }

    sgDom.tbody.innerHTML = sgState.rows.map((r, idx) => {
      const [p1, p2] = splitLoaiSource(r.loai_source);
      const curEl = r.element || 'auto';
      const curAnim = r.anim || 'auto';
      const conf = typeof r.confidence === 'number' ? r.confidence : null;
      const isLow = conf !== null && conf < 0.7;
      const confPct = conf !== null ? `${Math.round(conf * 100)}%` : '—';
      const confClass = conf === null ? 'sg-conf-mid' : (conf >= 0.8 ? 'sg-conf-high' : (conf >= 0.7 ? 'sg-conf-mid' : 'sg-conf-low'));
      const locLabel = [r.doan, r.cau, r.y].filter(Boolean).join('.');
      const safeText = String(r.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeThoiKy = String(r.thoi_ky || '').replace(/"/g, '&quot;');
      const safeNote = String(r.note || '').replace(/"/g, '&quot;');
      const safeReason = String(r.reason || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const opts1 = SG_VALID_LOAI.map(o =>
        `<option value="${o.code}" ${o.code === p1 ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const opts2 = `<option value="">-- Không ghép --</option>` + SG_VALID_LOAI.map(o =>
        `<option value="${o.code}" ${o.code === p2 ? 'selected' : ''}>+ ${o.label}</option>`
      ).join('');

      const optsEl = SG_VALID_ELEMENTS.map(o =>
        `<option value="${o.code}" ${o.code === curEl ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const optsAnim = SG_VALID_ANIMS.map(o =>
        `<option value="${o.code}" ${o.code === curAnim ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      return `
        <tr class="${isLow ? 'sg-row-low-conf' : ''}" data-idx="${idx}">
          <td style="font-family:var(--font-mono); font-size:0.74rem; color:var(--text-secondary);">
            <div><strong>${locLabel || (idx + 1)}</strong></div>
            <div style="font-size:0.68rem; opacity:0.75;">${r.start || ''}</div>
          </td>
          <td>
            <div style="line-height:1.4;">${safeText}</div>
            ${safeReason ? `<div class="sg-reason-hint">🤖 ${safeReason}</div>` : ''}
          </td>
          <td>
            <select class="sg-select sg-sel-p1" data-idx="${idx}">
              ${opts1}
            </select>
          </td>
          <td>
            <select class="sg-select sg-sel-p2" data-idx="${idx}">
              ${opts2}
            </select>
          </td>
          <td>
            <select class="sg-select sg-sel-element" data-idx="${idx}">
              ${optsEl}
            </select>
          </td>
          <td>
            <select class="sg-select sg-sel-anim" data-idx="${idx}">
              ${optsAnim}
            </select>
          </td>
          <td>
            <input type="text" class="sg-input sg-inp-thoiky" data-idx="${idx}" value="${safeThoiKy}" placeholder="Euro 2008 · TBN / Xavi">
          </td>
          <td>
            <input type="text" class="sg-input sg-inp-note" data-idx="${idx}" value="${safeNote}" placeholder="Lý do sửa (tùy chọn)...">
          </td>
          <td>
            <span class="sg-conf-badge ${confClass}">${confPct}</span>
          </td>
        </tr>
      `;
    }).join('');

    // Bind inline events
    sgDom.tbody.querySelectorAll('.sg-sel-p1').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        const p2El = sgDom.tbody.querySelector(`.sg-sel-p2[data-idx="${i}"]`);
        sgState.rows[i].loai_source = combineLoaiSource(sel.value, p2El ? p2El.value : '');
        sgState.rows[i].confidence = 1.0;
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-p2').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        const p1El = sgDom.tbody.querySelector(`.sg-sel-p1[data-idx="${i}"]`);
        sgState.rows[i].loai_source = combineLoaiSource(p1El ? p1El.value : 'rai_1', sel.value);
        sgState.rows[i].confidence = 1.0;
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-element').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].element = sel.value;
        sgState.rows[i].confidence = 1.0;
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-anim').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].anim = sel.value;
        sgState.rows[i].confidence = 1.0;
      });
    });

    sgDom.tbody.querySelectorAll('.sg-inp-thoiky').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.idx);
        sgState.rows[i].thoi_ky = inp.value;
      });
    });

    sgDom.tbody.querySelectorAll('.sg-inp-note').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.idx);
        sgState.rows[i].note = inp.value;
      });
    });
  }

  async function loadBackendState() {
    try {
      const res = await window.api.suggesterGetState();
      if (res && !res.error) {
        sgState.rulesPath = res.rules_path || '';
        sgState.examplesPath = res.examples_path || '';
        if (sgDom.rulesFilepath && sgState.rulesPath) {
          sgDom.rulesFilepath.title = sgState.rulesPath;
          sgDom.rulesFilepath.textContent = `📄 ${sgState.rulesPath}`;
        }
        if (sgDom.examplesFilepath && sgState.examplesPath) {
          sgDom.examplesFilepath.title = sgState.examplesPath;
          sgDom.examplesFilepath.textContent = `📄 ${sgState.examplesPath}`;
        }
        if (sgDom.rulesInput) {
          sgState.rulesOriginalText = res.rules || '';
          sgDom.rulesInput.value = res.rules || '';
          updateRulesMeta(res.rules || '');
          setRulesLocked(true);
        }
        sgState.examples = res.examples || [];
        renderExamples();
      }
    } catch (e) {
      // Backend có thể chưa sẵn sàng ngay lập tức
    }
  }

  async function loadCsvFile(csvPath) {
    if (!csvPath) return;
    try {
      const res = await window.api.suggesterLoadCsv({ csv_path: csvPath });
      if (res.error) throw new Error(res.error);
      sgState.csvPath = csvPath;
      localStorage.setItem('sg_timeline_csv', csvPath);
      if (sgDom.timelineCsv) sgDom.timelineCsv.value = csvPath;

      const defTk = sgDom.defaultThoiKy ? sgDom.defaultThoiKy.value.trim() : '';
      sgState.rows = (res.rows || []).map(r => ({
        ...r,
        loai_source: r.loai_source || 'rai_1',
        element: r.element || 'auto',
        anim: r.anim || 'auto',
        thoi_ky: r.thoi_ky || defTk || '',
        confidence: null,
        reason: '',
        note: ''
      }));
      renderTable();
      sgLog(`Đã tải ${sgState.rows.length} câu thoại từ ${csvPath.split(/[\\/]/).pop()}`, 'success');
    } catch (err) {
      sgLog(`Lỗi đọc CSV: ${err.message}`, 'error');
    }
  }

  // Khôi phục giá trị đã lưu
  if (sgDom.defaultThoiKy && sgState.defaultThoiKy) {
    sgDom.defaultThoiKy.value = sgState.defaultThoiKy;
  }
  if (sgDom.timelineCsv && sgState.csvPath) {
    sgDom.timelineCsv.value = sgState.csvPath;
  }

  // Đảm bảo khóa mặc định khi khởi tạo
  setRulesLocked(true);

  // Khi rules thay đổi trong lúc mở khóa
  if (sgDom.rulesInput) {
    sgDom.rulesInput.addEventListener('input', () => {
      updateRulesMeta(sgDom.rulesInput.value);
    });
  }

  // Mở khóa để chỉnh sửa file .txt trực tiếp
  if (sgDom.btnEditRules) {
    sgDom.btnEditRules.addEventListener('click', () => {
      setRulesLocked(false);
    });
  }

  // Hủy chỉnh sửa & khóa lại nội dung cũ
  if (sgDom.btnCancelRules) {
    sgDom.btnCancelRules.addEventListener('click', async () => {
      const currentVal = sgDom.rulesInput ? sgDom.rulesInput.value : '';
      if (currentVal !== (sgState.rulesOriginalText || '')) {
        const ok = await askConfirm('Bạn đang có nội dung vừa sửa chưa lưu.\nBạn có chắc muốn hủy bỏ các thay đổi này không?', {
          title: '✖ Xác nhận hủy chỉnh sửa',
          confirmText: 'Hủy thay đổi',
          cancelText: 'Tiếp tục sửa',
          danger: true
        });
        if (!ok) return;
      }
      if (sgDom.rulesInput) {
        sgDom.rulesInput.value = sgState.rulesOriginalText || '';
        updateRulesMeta(sgDom.rulesInput.value);
      }
      setRulesLocked(true);
      sgLog('Đã hủy chỉnh sửa và khóa lại file .txt.', 'info');
    });
  }

  // Lưu & Khóa lại (Có xác nhận lần 2)
  if (sgDom.btnSaveRules) {
    sgDom.btnSaveRules.addEventListener('click', async () => {
      const rules = sgDom.rulesInput ? sgDom.rulesInput.value : '';
      const ok = await askConfirm('Bạn có muốn lưu thay đổi này vào file quy tắc (source_style_rules.txt) không?', {
        title: '💾 Xác nhận lưu file .txt',
        confirmText: 'Có, lưu thay đổi'
      });
      if (!ok) return;

      try {
        await saveRulesText(rules, 'Đã lưu file source_style_rules.txt và khóa lại.');
      } catch (err) {
        sgLog(`Lỗi lưu quy tắc: ${err.message}`, 'error');
      }
    });
  }

  // Đọc lại từ file .txt (nếu user sửa bằng tay ngoài app)
  if (sgDom.btnReloadRules) {
    sgDom.btnReloadRules.addEventListener('click', async () => {
      if (!sgState.rulesLocked && sgDom.rulesInput && sgDom.rulesInput.value !== (sgState.rulesOriginalText || '')) {
        const ok = await askConfirm('Bạn đang sửa dở nội dung chưa lưu. Đọc lại từ ổ cứng sẽ ghi đè phần đang sửa, tiếp tục chứ?', {
          title: '🔄 Xác nhận đọc lại file .txt',
          confirmText: 'Đọc lại',
          danger: true
        });
        if (!ok) return;
      }
      await loadBackendState();
      sgLog('Đã đọc lại nội dung mới nhất từ file source_style_rules.txt.', 'info');
    });
  }

  // Mở trực tiếp file .txt
  if (sgDom.btnOpenRules) {
    sgDom.btnOpenRules.addEventListener('click', async () => {
      if (!sgState.rulesPath) await loadBackendState();
      if (sgState.rulesPath) {
        window.api.openFile(sgState.rulesPath);
      } else {
        sgLog('Chưa lấy được đường dẫn file .txt (backend chưa sẵn sàng).', 'error');
      }
    });
  }

  // Mở trực tiếp file .json
  if (sgDom.btnOpenExamples) {
    sgDom.btnOpenExamples.addEventListener('click', async () => {
      if (!sgState.examplesPath) await loadBackendState();
      if (sgState.examplesPath) {
        window.api.openFile(sgState.examplesPath);
      } else {
        sgLog('Chưa lấy được đường dẫn file .json (backend chưa sẵn sàng).', 'error');
      }
    });
  }

  // Chọn file Timeline CSV
  if (sgDom.btnBrowseCsv) {
    sgDom.btnBrowseCsv.addEventListener('click', async () => {
      const filePath = await window.api.selectCsvFile();
      if (!filePath) return;
      await loadCsvFile(filePath);
    });
  }

  // Lưu default thoi_ky
  if (sgDom.defaultThoiKy) {
    sgDom.defaultThoiKy.addEventListener('input', () => {
      sgState.defaultThoiKy = sgDom.defaultThoiKy.value;
      localStorage.setItem('sg_default_thoiky', sgState.defaultThoiKy);
    });
  }

  // Điền nhanh Thời kỳ cho các dòng trống
  if (sgDom.btnFillThoiKy) {
    sgDom.btnFillThoiKy.addEventListener('click', () => {
      if (!sgState.rows.length) return;
      const firstVal = (sgDom.defaultThoiKy && sgDom.defaultThoiKy.value.trim()) ||
        (sgState.rows.find(r => r.thoi_ky && r.thoi_ky.trim()) || {}).thoi_ky || '';
      if (!firstVal) {
        sgLog('Hãy nhập Thời kỳ ở ô Mặc định hoặc ở dòng đầu tiên trước khi điền nhanh.', 'warn');
        return;
      }
      let filled = 0;
      sgState.rows.forEach(r => {
        if (!r.thoi_ky || !r.thoi_ky.trim()) {
          r.thoi_ky = firstVal;
          filled++;
        }
      });
      renderTable();
      sgLog(`Đã điền Thời kỳ "${firstVal}" cho ${filled} dòng trống.`, 'info');
    });
  }

  // Bấm nút AI Gợi ý Source
  if (sgDom.btnSuggest) {
    sgDom.btnSuggest.addEventListener('click', async () => {
      if (sgState.isSuggesting) return;
      if (!sgState.rows.length && !sgState.csvPath) {
        sgLog('Vui lòng chọn file 1_CSV_Timeline.csv trước!', 'error');
        return;
      }

      const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) || (state.settings && state.settings.apiKey) || '';
      if (!apiKey) {
        sgLog('Chưa có Gemini API Key! Vui lòng vào tab Cài đặt để nhập API Key.', 'error');
        return;
      }

      const hasExistingSuggestions = sgState.rows.some(r => typeof r.confidence === 'number');
      if (hasExistingSuggestions) {
        const ok = await askConfirm('Bảng hiện tại đã có kết quả gợi ý hoặc chỉnh sửa.\nChạy lại AI sẽ ghi đè dữ liệu trên bảng, bạn có muốn tiếp tục không?', {
          title: '🤖 Xác nhận chạy lại AI Gợi ý',
          confirmText: 'Tiếp tục chạy'
        });
        if (!ok) return;
      }

      sgState.isSuggesting = true;
      sgDom.btnSuggest.disabled = true;
      if (sgDom.btnSuggestText) sgDom.btnSuggestText.textContent = '⏳ AI đang phân tích theo phong cách của bạn...';
      sgLog(`Đang gửi ${sgState.rows.length} câu thoại cho Gemini (kèm ${sgState.examples.length} mẫu ví dụ)...`, 'info');

      try {
        const rulesText = sgDom.rulesInput ? sgDom.rulesInput.value : '';
        const defTk = sgDom.defaultThoiKy ? sgDom.defaultThoiKy.value.trim() : '';

        const res = await window.api.suggesterSuggest({
          rows: sgState.rows,
          csv_path: sgState.csvPath,
          api_key: apiKey,
          default_thoi_ky: defTk,
          rules: rulesText
        });

        if (res.error) throw new Error(res.error);

        sgState.rulesOriginalText = rulesText;
        updateRulesMeta(rulesText);
        setRulesLocked(true);

        sgState.rows = (res.rows || []).map(r => ({
          ...r,
          note: ''
        }));
        renderTable();

        const lowCount = sgState.rows.filter(r => typeof r.confidence === 'number' && r.confidence < 0.7).length;
        sgLog(`Hoàn tất gợi ý ${sgState.rows.length} câu! Có ${lowCount} câu cần bạn xem kỹ (tô vàng).`, 'success');
      } catch (err) {
        sgLog(`Lỗi AI gợi ý: ${err.message}`, 'error');
      } finally {
        sgState.isSuggesting = false;
        sgDom.btnSuggest.disabled = false;
        if (sgDom.btnSuggestText) sgDom.btnSuggestText.textContent = '🤖 AI Gợi ý Source + Animation';
      }
    });
  }

  // Bấm nút Lưu vào Kho ví dụ (Dạy AI)
  if (sgDom.btnLearn) {
    sgDom.btnLearn.addEventListener('click', async () => {
      if (!sgState.rows.length) return;
      const ok = await askConfirm(`Bạn có muốn lưu ${sgState.rows.length} câu hiện tại vào Kho ví dụ (source_examples.json) để dạy AI không?`, {
        title: '🧠 Xác nhận lưu vào Kho ví dụ',
        confirmText: 'Có, lưu để dạy AI'
      });
      if (!ok) return;

      const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) || (state.settings && state.settings.apiKey) || '';
      sgDom.btnLearn.disabled = true;
      sgLog(`Đang lưu ${sgState.rows.length} câu vào kho ví dụ và tạo vector Gemini Embedding...`, 'info');
      try {
        const res = await window.api.suggesterSaveExamples({
          items: sgState.rows,
          api_key: apiKey
        });
        if (res.error) throw new Error(res.error);
        sgState.examples = res.examples || [];
        renderExamples();
        sgLog(`Đã dạy AI thành công! (+${res.added} mẫu mới, cập nhật ${res.updated} mẫu, tổng kho: ${res.total} mẫu).`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu kho ví dụ: ${err.message}`, 'error');
      } finally {
        sgDom.btnLearn.disabled = false;
      }
    });
  }

  // Xóa toàn bộ kho ví dụ
  if (sgDom.btnClearExamples) {
    sgDom.btnClearExamples.addEventListener('click', async () => {
      if (!sgState.examples.length) return;
      const ok = await askConfirm(`Bạn có chắc muốn xóa TOÀN BỘ ${sgState.examples.length} mẫu ví dụ đã học?\nHành động này không thể hoàn tác.`, {
        title: '⚠️ Xác nhận xóa toàn bộ kho ví dụ',
        confirmText: 'Xóa tất cả',
        danger: true
      });
      if (!ok) return;
      try {
        const res = await window.api.suggesterDeleteExample({ clear_all: true });
        if (res.error) throw new Error(res.error);
        sgState.examples = [];
        renderExamples();
        sgLog('Đã xóa toàn bộ kho ví dụ.', 'info');
      } catch (err) {
        sgLog(`Lỗi: ${err.message}`, 'error');
      }
    });
  }

  // Xuất file 2_CSV_PhanLoaiSource.csv
  if (sgDom.btnExport) {
    sgDom.btnExport.addEventListener('click', async () => {
      if (!sgState.rows.length) return;
      let defaultOut = '2_CSV_PhanLoaiSource.csv';
      if (sgState.csvPath) {
        const dir = sgState.csvPath.replace(/[\\/][^\\/]+$/, '');
        const sep = sgState.csvPath.includes('\\') ? '\\' : '/';
        defaultOut = `${dir}${sep}2_CSV_PhanLoaiSource.csv`;
      }
      const savePath = await window.api.saveCsvFile(defaultOut);
      if (!savePath) return;

      try {
        const res = await window.api.suggesterExportCsv({
          rows: sgState.rows,
          output_path: savePath
        });
        if (res.error) throw new Error(res.error);
        sgLog(`Đã xuất file thành công: ${res.output_path}`, 'success');

        // Tự động điền đường dẫn sang ô CSV #2 của Tab Gen XML (Tool A)
        const pgSourceCsvInput = $('#pg-source-csv');
        if (pgSourceCsvInput) {
          pgSourceCsvInput.value = res.output_path;
          pgSourceCsvInput.dispatchEvent(new Event('input'));
          sgLog('Đã tự động gắn file vừa xuất vào mục "2. CSV Phân loại Source" bên tab Gen XML!', 'info');
        }
      } catch (err) {
        sgLog(`Lỗi xuất CSV: ${err.message}`, 'error');
      }
    });
  }

  // Khi backend kết nối xong, tự động tải rules + examples + csv (nếu có)
  window.api.onBackendReady(async (ready) => {
    if (ready) {
      await loadBackendState();
      if (sgState.csvPath) {
        await loadCsvFile(sgState.csvPath);
      }
    }
  });

  // Thử tải ngay nếu backend đã chạy
  loadBackendState();
}

// ============================================================
// SPLIT RESIZER — Kéo phóng to / thu nhỏ 2 cột cho mọi Tab
// ============================================================

function initSplitResizers() {
  const resizers = $$('.split-resizer');
  if (!resizers.length) return;

  resizers.forEach(resizer => {
    const container = resizer.parentElement;
    const leftPane = resizer.previousElementSibling;
    const tabKey = resizer.dataset.tabKey || 'default';
    if (!container || !leftPane) return;

    const storageKey = `split_w_${tabKey}`;
    const savedW = parseInt(localStorage.getItem(storageKey), 10);
    if (!Number.isNaN(savedW) && savedW >= 240) {
      leftPane.style.setProperty('--left-w', `${savedW}px`);
    }

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startWidth = leftPane.getBoundingClientRect().width;
      resizer.classList.add('active');
      document.body.classList.add('is-resizing');
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const containerWidth = container.getBoundingClientRect().width;
      const minW = 240;
      const maxW = Math.max(minW, Math.min(containerWidth * 0.75, containerWidth - 280));
      const newW = Math.round(Math.min(maxW, Math.max(minW, startWidth + (e.clientX - startX))));
      leftPane.style.setProperty('--left-w', `${newW}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('active');
      document.body.classList.remove('is-resizing');
      const finalW = Math.round(leftPane.getBoundingClientRect().width);
      localStorage.setItem(storageKey, String(finalW));
    });

    // Nhấp đúp để đặt lại kích thước mặc định
    resizer.addEventListener('dblclick', () => {
      leftPane.style.removeProperty('--left-w');
      localStorage.removeItem(storageKey);
    });
  });
}
