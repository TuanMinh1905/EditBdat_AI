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
  linkGeminiApi: $('#link-gemini-api'),
  linkGeminiUsage: $('#link-gemini-usage'),
  btnRefreshToken: $('#btn-refresh-token'),
  btnResetToken: $('#btn-reset-token'),
  tokenKeyBadge: $('#token-key-badge'),
  tokenStatTotal: $('#token-stat-total'),
  tokenStatToday: $('#token-stat-today'),
  tokenStatIo: $('#token-stat-io'),
  tokenStatRequests: $('#token-stat-requests'),
  tokenLastCall: $('#token-last-call'),

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
  if (state.backendReady) loadTokenUsage();
}

function formatTokenNum(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

function renderTokenUsage(usage) {
  if (!dom.tokenStatTotal) return;
  if (!usage || !usage.has_key) {
    if (dom.tokenKeyBadge) dom.tokenKeyBadge.textContent = 'Chưa nhập key';
    dom.tokenStatTotal.textContent = '0';
    if (dom.tokenStatToday) dom.tokenStatToday.textContent = '0';
    if (dom.tokenStatIo) dom.tokenStatIo.textContent = '0 / 0';
    if (dom.tokenStatRequests) dom.tokenStatRequests.textContent = '0';
    if (dom.tokenLastCall) {
      dom.tokenLastCall.textContent = 'Nhập Gemini API Key để xem thống kê token của key đó trong App.';
    }
    return;
  }

  const total = usage.total || {};
  const today = usage.today || {};
  if (dom.tokenKeyBadge) dom.tokenKeyBadge.textContent = `Key ${usage.key_hint || ''}`;
  dom.tokenStatTotal.textContent = formatTokenNum(total.total_tokens);
  if (dom.tokenStatToday) dom.tokenStatToday.textContent = formatTokenNum(today.total_tokens);

  const outPlusThink = (total.output_tokens || 0) + (total.thoughts_tokens || 0);
  if (dom.tokenStatIo) {
    dom.tokenStatIo.textContent = `${formatTokenNum(total.prompt_tokens)} / ${formatTokenNum(outPlusThink)}`;
  }
  if (dom.tokenStatRequests) dom.tokenStatRequests.textContent = formatTokenNum(total.requests);

  if (dom.tokenLastCall) {
    if (usage.last_call) {
      const lc = usage.last_call;
      const featMap = {
        source_suggester: 'Gợi ý Source',
        create_timeline: 'Tạo Timeline',
        fix_timeline: 'Fix Timeline'
      };
      const featName = featMap[lc.feature] || lc.feature || 'Gemini API';
      dom.tokenLastCall.textContent =
        `Gần nhất (${lc.timestamp} · ${featName}): ${formatTokenNum(lc.total_tokens)} tokens ` +
        `(In ${formatTokenNum(lc.prompt_tokens)} · Out ${formatTokenNum(lc.output_tokens)} · Think ${formatTokenNum(lc.thoughts_tokens)})`;
    } else {
      dom.tokenLastCall.textContent = 'Chưa có lượt gọi Gemini API nào được ghi nhận cho key này.';
    }
  }
}

async function loadTokenUsage() {
  if (!window.api || !window.api.getTokenUsage) return;
  try {
    const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) ||
                   (state.settings && state.settings.geminiApiKey) || '';
    const res = await window.api.getTokenUsage({ api_key: apiKey });
    if (res && res.success) {
      renderTokenUsage(res.usage);
    }
  } catch (err) {
    console.warn('loadTokenUsage error:', err);
  }
}

async function resetTokenUsage() {
  if (!window.api || !window.api.resetTokenUsage) return;
  const ok = await askConfirm('Bạn có muốn xóa thống kê số lượng Token đã lưu cho API Key hiện tại không?', {
    title: '🗑️ Xác nhận Reset Token',
    confirmText: 'Có, reset về 0',
    danger: true
  });
  if (!ok) return;

  try {
    const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) ||
                   (state.settings && state.settings.geminiApiKey) || '';
    const res = await window.api.resetTokenUsage({ api_key: apiKey });
    if (res && res.success) {
      renderTokenUsage(res.usage);
      addLog('Đã reset thống kê token API', 'info');
    }
  } catch (err) {
    addLog(`Lỗi reset token: ${err.message}`, 'error');
  }
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
  loadTokenUsage();

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

  if (tabName === 'settings') {
    loadTokenUsage();
  }
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

  // Token usage tracker & Google AI Studio links
  if (dom.btnRefreshToken) {
    dom.btnRefreshToken.addEventListener('click', loadTokenUsage);
  }
  if (dom.btnResetToken) {
    dom.btnResetToken.addEventListener('click', resetTokenUsage);
  }
  if (dom.settingApiKey) {
    let tokenDebounce = null;
    dom.settingApiKey.addEventListener('input', () => {
      clearTimeout(tokenDebounce);
      tokenDebounce = setTimeout(loadTokenUsage, 400);
    });
  }
  if (dom.linkGeminiApi) {
    dom.linkGeminiApi.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.api && window.api.openExternal) {
        window.api.openExternal('https://aistudio.google.com/apikey');
      }
    });
  }
  if (dom.linkGeminiUsage) {
    dom.linkGeminiUsage.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.api && window.api.openExternal) {
        window.api.openExternal('https://aistudio.google.com/usage');
      }
    });
  }

  // Backend events
  window.api.onBackendReady((ready) => {
    state.backendReady = ready;
    const dot = dom.backendStatus.querySelector('.status-dot');
    const label = dom.backendStatus.querySelector('span');
    if (ready) {
      dot.className = 'status-dot connected';
      label.textContent = 'Sẵn sàng';
      addLog('Backend Python đã kết nối', 'success');
      loadTokenUsage();
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
  window.api.onPythonWarning?.((msg) => {
    addLog(msg.trim(), 'warn');
  });
}

// --- Init ---
async function init() {
  const steps = [
    ['initEvents', initEvents],
    ['initSplitResizers', initSplitResizers],
    ['initClipSplitter', initClipSplitter],
    ['initPremiereGen', initPremiereGen],
    ['initSourceSuggester', initSourceSuggester],
    ['initKyNangDropdown', initKyNangDropdown],
    ['initRules', initRules]
  ];
  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (err) {
      console.error(`Lỗi khởi tạo ${name}:`, err);
    }
  }
  await loadSettings();
  await loadSession();
  addLog('Ứng dụng đã sẵn sàng. Hãy thêm media files và nhập prompt.', 'info');
}

// ============================================================
// TOOL B — CLIP SPLITTER UI
// ============================================================

function initClipSplitter() {
  const DEFAULT_CLIP_OUT = 'D:\\Edit SofaZone\\02_Kho_Source\\02_Clip_Da_Cat';
  const spState = {
    videoPath: null,
    outputDir: localStorage.getItem('sp_output_dir') || DEFAULT_CLIP_OUT,
    catalogPath: (localStorage.getItem('sp_output_dir') || DEFAULT_CLIP_OUT) + '\\catalog.csv',
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
  if (spDom.outputDir && spState.outputDir) {
    spDom.outputDir.value = spState.outputDir;
  }
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
        localStorage.setItem('sp_output_dir', d);
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

const ASSET_DEFAULT_ROOT = 'D:\\Edit SofaZone\\01_Tai_Nguyen_Co_Dinh';

function getAssetRoots() {
  return {
    element_dir: localStorage.getItem('pg_element_dir') || `${ASSET_DEFAULT_ROOT}\\Elements`,
    sound_root: localStorage.getItem('pg_sound_root') || `${ASSET_DEFAULT_ROOT}\\Sounds`,
  };
}

function confirmAssetVerification(report) {
  const modal = $('#modal-verify-assets');
  const tbody = $('#asset-verify-tbody');
  const summary = $('#asset-verify-summary');
  const proceed = $('#asset-verify-continue');
  const cancel = $('#asset-verify-cancel');
  const close = $('#asset-verify-close');
  const previousFocus = document.activeElement;
  tbody.replaceChildren();
  report.items.forEach(item => {
    const row = document.createElement('tr');
    if (!item.exists) row.className = 'asset-verify-missing';
    [item.exists ? '✅ Có file' : `❌ ${item.message}`, `${item.kind} / ${item.code}`,
      item.path || item.file || '(Chưa có mapping)', item.references.join(', ')].forEach(text => {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  summary.textContent = report.all_ok
    ? `✅ Đã kiểm tra ${report.total} tài nguyên trong CSV và texture: đủ file.`
    : `⚠️ ${report.ok}/${report.total} tài nguyên có file. ${report.missing} mục cần kiểm tra. Nếu tiếp tục, các lớp phủ hoặc âm thanh thiếu sẽ được bỏ qua để vẫn xuất XML.`;
  proceed.textContent = report.all_ok ? 'Gen XML' : 'Vẫn tiếp tục Gen XML';
  modal.style.display = 'flex';
  cancel.focus();
  return new Promise(resolve => {
    const finish = accepted => {
      modal.style.display = 'none';
      proceed.onclick = cancel.onclick = close.onclick = modal.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      previousFocus?.focus();
      resolve(accepted);
    };
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      } else if (event.key === 'Tab') {
        const buttons = [close, cancel, proceed];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? 2 : 1)) % buttons.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    proceed.onclick = () => finish(true);
    cancel.onclick = close.onclick = () => finish(false);
    modal.onclick = event => { if (event.target === modal) finish(false); };
  });
}

function initPremiereGen() {
  const DEFAULT_SOURCE_ROOT = 'D:\\Edit SofaZone\\02_Kho_Source\\02_Clip_Da_Cat';
  const DEFAULT_CATALOG_CSV = 'D:\\Edit SofaZone\\02_Kho_Source\\02_Clip_Da_Cat\\catalog.csv';
  const DEFAULT_ELEMENT_DIR = 'D:\\Edit SofaZone\\01_Tai_Nguyen_Co_Dinh\\Elements';

  const pgState = {
    timelineCsv: null,
    sourceCsv: null,
    catalogCsv: localStorage.getItem('pg_catalog_csv') || DEFAULT_CATALOG_CSV,
    voice: null,
    srt: null,
    sourceRoot: localStorage.getItem('pg_source_root') || DEFAULT_SOURCE_ROOT,
    outputDir: null,
    lastXmlPath: null,
    elementDir: localStorage.getItem('pg_element_dir') || DEFAULT_ELEMENT_DIR,
    soundRoot: getAssetRoots().sound_root,
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
    soundRoot: $('#pg-sound-root'),
    btnSoundRoot: $('#pg-btn-sound-root'),
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

  // Điền sẵn các đường dẫn cố định (Catalog, Source Root, Element Dir)
  if (pg.catalogCsv && pgState.catalogCsv) {
    pg.catalogCsv.value = pgState.catalogCsv;
    if (pg.chkCatalog) {
      pg.chkCatalog.textContent = '✅ 3. Catalog: catalog.csv';
      pg.chkCatalog.classList.add('done');
    }
  }
  if (pg.sourceRoot && pgState.sourceRoot) {
    pg.sourceRoot.value = pgState.sourceRoot;
    if (pg.chkSourceRoot) {
      pg.chkSourceRoot.textContent = '✅ Thư mục Source: 02_Clip_Da_Cat';
      pg.chkSourceRoot.classList.add('done');
    }
  }
  if (pg.elementDir && pgState.elementDir) {
    pg.elementDir.value = pgState.elementDir;
    if (pg.chkElement) {
      pg.chkElement.textContent = '✅ Element: Elements';
      pg.chkElement.classList.add('done');
    }
  }

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
        localStorage.setItem('pg_element_dir', d);
        window.dispatchEvent(new Event('asset-roots-changed'));
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

  if (pg.soundRoot) pg.soundRoot.value = pgState.soundRoot;
  if (pg.btnSoundRoot) pg.btnSoundRoot.addEventListener('click', async () => {
    try {
      const directory = await window.api.selectDirectory();
      if (!directory) return;
      pgState.soundRoot = directory;
      localStorage.setItem('pg_sound_root', directory);
      if (pg.soundRoot) pg.soundRoot.value = directory;
      window.dispatchEvent(new Event('asset-roots-changed'));
    } catch (err) { pgLog(`Lỗi chọn thư mục Sounds: ${err.message}`, 'error'); }
  });
  if (pg.soundRoot) pg.soundRoot.addEventListener('click', () => pg.btnSoundRoot?.click());

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

        pgLog('Đang xác minh mã tài nguyên và file thực tế...', 'info');

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
          sound_root: pgState.soundRoot || null,
          texture_id: pgState.textureId || null,
          enable_animations: pgState.enableAnimations,
        };

        const verification = await window.api.verifyAssets(params);
        if (verification.error) throw new Error(verification.error);
        if (!await confirmAssetVerification(verification)) {
          pgLog('Đã hủy Gen XML để kiểm tra tài nguyên.', 'info');
          return;
        }
        pgLog(`Đang gen XML: ${projectName}.xml ...`, 'info');
        const result = await window.api.premiereGenerateXml(params);
        if (result.error) throw new Error(result.error);

        pgState.lastXmlPath = result.output_path || (pgState.outputDir + '/' + projectName + '.xml');
        const totalClips = result.total_clips || 0;
        const missing = result.missing || [];
        const skippedAssets = result.skipped_assets || [];
        skippedAssets.forEach(message => pgLog(`⚠️ Đã bỏ qua ${message}`, 'warn'));

        const totalElements = result.total_elements || 0;
        const totalTransitions = result.total_transitions || 0;
        const animEnabled = result.animations_enabled ?? result.animations ?? false;

        // Hiện kết quả thành công
        pg.resultCard.style.display = 'block';
        pg.resultSummary.innerHTML = `
          🎬 <strong>${totalClips} clip</strong> đã được đặt vào timeline<br>
          📄 File: <code style="font-size:10px">${pgState.lastXmlPath}</code><br>
          ${totalElements > 0 ? `🎨 <strong>${totalElements} element</strong> overlay (V3/V4)<br>` : ''}
          🎵 ${result.total_bgm_clips || 0} BGM · ${result.total_sfx_clips || 0} SFX<br>
          ${skippedAssets.length ? `⚠️ Đã bỏ qua ${skippedAssets.length} tài nguyên chưa có file (xem log)<br>` : ''}
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
// TOOL 1 — SOURCE SUGGESTER UI (Gợi ý phân loại Source & Animation)
// ============================================================

const DEFAULT_SOURCE_TYPES = [
  { code: 'rai_1', label: 'Rải đơn', description: 'Video rải đơn (1 clip full màn hình) — cảnh thi đấu, pha bóng, dẫn chuyện chung' },
  { code: 'rai_2_1', label: 'Rải đôi 1', description: 'Video rải đôi kiểu 1 (2 clip chia đôi màn hình)' },
  { code: 'rai_2_2', label: 'Rải đôi 2', description: 'Video rải đôi kiểu 2 (2 clip bố cục phụ)' },
  { code: 'rai_3', label: 'Rải 3', description: 'Video rải 3 clip cùng lúc' },
  { code: 'rai_4', label: 'Rải 4 / Danh hiệu', description: 'Video rải 4 clip / tổng hợp danh hiệu, kết quả, cao trào nhiều góc' },
  { code: 'phong_van', label: 'Phỏng vấn', description: 'Cảnh phỏng vấn cầu thủ / HLV nói chuyện' },
  { code: 'training', label: 'Tập luyện', description: 'Cảnh tập luyện trên sân tập' },
  { code: 'binh_luan_chay', label: 'BLV nói', description: 'Cảnh bình luận viên / chuyên gia đang nói' },
  { code: 'khan_dai', label: 'Khán đài', description: 'Cảnh cổ động viên, khán đài, bầu không khí sân vận động' },
  { code: 'anh_thong_so', label: 'Bảng số liệu', description: 'Ảnh bảng thống kê, số liệu, biểu đồ so sánh' },
  { code: 'anh_thoi_diem', label: 'Ảnh khoảnh khắc', description: 'Ảnh chụp khoảnh khắc / đội hình / tin tức tại một thời điểm cụ thể' },
  { code: 'anh_chung_bao', label: 'Mặt báo', description: 'Ảnh mặt báo, tiêu đề báo chí truyền thông' },
  { code: 'sa_ban', label: 'Sa bàn', description: 'Sa bàn chiến thuật, sơ đồ đội hình' }
];

const DEFAULT_ELEMENT_TYPES = [
  { code: 'auto', group: 'element', label: '✨ Tự động (Auto)', param: '', description: 'Tự động theo loại Source (phong_van->tv_retro, anh_thong_so->stats_table, anh_thoi_diem->scout_frame)' },
  { code: 'none', group: 'element', label: '🚫 Không phủ (None)', param: '', description: 'Không dùng lớp phủ khung/texture ở câu này (để hình gốc thoáng mắt)' },
  { code: 'tv_retro', group: 'element', label: '📺 Khung Sofa TV', param: "tv_retro.png", description: 'Khung SOFA TV cổ điển (bo góc tối + màn hình CRT) — hợp cho ảnh đội hình, khoảnh khắc đáng nhớ, phỏng vấn' },
  { code: 'tv_green_frame', group: 'element', label: '📺 Khung màn hình xanh', param: "tv_green_frame.png", description: 'Khung màn hình xanh viền đen (TV / Monitor Green Screen)' },
  { code: 'tv_crt_gemini', group: 'element', label: '📺 TV CRT cổ điển', param: "tv_crt_gemini.png", description: 'Khung TV CRT cổ điển trong phòng tối (Green Screen)' },
  { code: 'tv_sony', group: 'element', label: '📺 TV Sony bàn gỗ', param: "tv_sony.mp4", description: 'Khung TV Sony cổ điển trên bàn gỗ (Video)' },
  { code: 'tv_dolly', group: 'element', label: '📺 TV Dolly In', param: "tv_dolly.webm", description: 'Hiệu ứng TV retro dolly-in (Video)' },
  { code: 'film_grain', group: 'element', label: '🎞️ Phim 8mm hồi ức', param: "film_grain.mp4", description: 'Khung phim nhựa 8mm cổ điển — rất hợp khi kể về thời niên thiếu, quá khứ xa, hồi ức' },
  { code: 'scout_frame', group: 'element', label: '📋 Hồ sơ Scout', param: "scout_frame.png", description: 'Khung hồ sơ tuyển trạch / tin tức cầu thủ (scout frame)' },
  { code: 'stats_table', group: 'element', label: '📊 Bảng / Vòng gốc (Vàng nâu)', param: "stats_table.png", description: 'Khung bảng thống kê / vòng tròn màu vàng nâu (mẫu gốc)' },
  { code: 'stats_table_1', group: 'element', label: '📊 Bảng / Vòng mẫu 1 (Xanh đậm)', param: "stats_table_1.png", description: 'Bảng thống kê / vòng tròn mẫu 1 (Xanh đậm)' },
  { code: 'stats_table_2', group: 'element', label: '📊 Bảng / Vòng mẫu 2 (Đỏ đậm)', param: "stats_table_2.png", description: 'Bảng thống kê / vòng tròn mẫu 2 (Đỏ đậm)' },
  { code: 'stats_table_3', group: 'element', label: '📊 Bảng / Vòng mẫu 3 (Đen xám)', param: "stats_table_3.png", description: 'Bảng thống kê / vòng tròn mẫu 3 (Đen xám)' },
  { code: 'stats_table_4', group: 'element', label: '📊 Bảng / Vòng mẫu 4 (Xanh lá)', param: "stats_table_4.png", description: 'Bảng thống kê / vòng tròn mẫu 4 (Xanh lá)' },
  { code: 'stats_table_5', group: 'element', label: '📊 Bảng / Vòng mẫu 5 (Tím)', param: "stats_table_5.png", description: 'Bảng thống kê / vòng tròn mẫu 5 (Tím)' },
  { code: 'circle_gold', group: 'element', label: '🌑 Viền tối góc xanh (5.png)', param: "circle_gold.png", description: 'Viền tối spotlight góc xanh (5.png) — nhấn mạnh cầu thủ / danh hiệu' },
  { code: 'circle_blue', group: 'element', label: '🔵 Vòng tròn xanh (o.png)', param: "circle_blue.png", description: 'Vòng tròn spotlight xanh dương (o.png — đánh dấu vị trí cầu thủ)' },
  { code: 'paper_texture', group: 'element', label: '📜 Giấy cũ 1 (Sáng)', param: "paper_texture.png", description: 'Lớp phủ giấy cũ 1 (paper texture.png) tạo chất liệu tư liệu' },
  { code: 'paper_texture_2', group: 'element', label: '📜 Giấy cũ 2 (Tối)', param: "paper_texture_2.png", description: 'Lớp phủ giấy cũ 2 tối (paper texture 2.png)' },
  { code: 'texture_dark', group: 'element', label: '🌑 Phủ xám tối (textture.png)', param: "texture_dark.png", description: 'Lớp phủ xám tối (textture.png) tạo chiều sâu trầm lắng, chuyển chương' },
  { code: 'texture_2', group: 'element', label: '⬜ Phủ nền sáng (texture2.png)', param: "texture_2.png", description: 'Lớp phủ nền sáng (texture2.png) cho toàn video' },
  { code: 'grid_orange', group: 'element', label: '🟧 Lưới cam (Video)', param: "grid_orange.mp4", description: 'Nền lưới cam chuyển động (grid animation video)' },
  { code: 'intro', group: 'element', label: '🎬 Video Intro (intro.mp4)', param: "intro.mp4", description: 'Video Intro mở đầu (intro.mp4)' }
];

const DEFAULT_ANIMATION_TYPES = [
  { code: 'auto', group: 'anim', label: '🔄 Mặc định (Auto)', param: 'auto', description: 'Tự động xen kẽ zoom nhẹ 100% <-> 108% giữa các clip' },
  { code: 'zoom_in', group: 'anim', label: '🔍 Phóng to (Zoom In)', param: '100->108', description: 'Zoom In từ từ (100% -> 108%) — tập trung dần vào nhân vật/bức ảnh' },
  { code: 'zoom_out', group: 'anim', label: '🔎 Thu nhỏ (Zoom Out)', param: '108->100', description: 'Zoom Out từ từ (108% -> 100%) — mở rộng góc nhìn toàn cảnh' },
  { code: 'static', group: 'anim', label: '⏹️ Đứng yên (Static)', param: '100->100', description: 'Đứng yên (100%) — không phóng to thu nhỏ' }
];

const DEFAULT_BGM_TYPES = [
  { code: 'auto', label: '✨ Tự động (Auto)', param: '', description: 'Tự động chọn nhạc nền theo Đoạn & mạch cảm xúc' },
  { code: 'none', label: '🔇 Không nhạc nền', param: '', description: 'Tắt nhạc nền ở đoạn này' },
  { code: 'bgm_default', label: '🎵 Nhạc nền chuẩn SofaZone', param: "bgm_default.mp3", description: 'Nhạc nền chủ đạo mặc định' }
];

const DEFAULT_SFX_TYPES = [
  { code: 'auto', label: '✨ Tự động (Auto)', param: '', description: 'Tự động đặt SFX hợp với Source/Lớp phủ' },
  { code: 'none', label: '🔇 Không hiệu ứng', param: '', description: 'Không chèn hiệu ứng âm thanh' },
  { code: 'whoosh', label: '💨 Whoosh', param: 'whoosh.mp3', description: 'Tiếng gió lướt nhanh khi chuyển cảnh' }
];

function initSourceSuggester() {
  function mergeMissingDefaultElements(list) {
    if (!Array.isArray(list) || !list.length) return JSON.parse(JSON.stringify(DEFAULT_ELEMENT_TYPES));
    const existingCodes = new Set(list.map(x => x.code));
    const merged = list.map(x => {
      if (x.image === '__none__' && x.param) {
        return { ...x, group: 'element', image: '' };
      }
      return { ...x, group: 'element' };
    });
    DEFAULT_ELEMENT_TYPES.forEach(defItem => {
      if (!existingCodes.has(defItem.code)) {
        merged.push(JSON.parse(JSON.stringify(defItem)));
      }
    });
    return merged;
  }

  function mergeMissingDefaultAnims(list) {
    if (!Array.isArray(list) || !list.length) return JSON.parse(JSON.stringify(DEFAULT_ANIMATION_TYPES));
    const existingCodes = new Set(list.map(x => x.code));
    const merged = list.map(x => ({ ...x, group: 'anim' }));
    DEFAULT_ANIMATION_TYPES.forEach(defItem => {
      if (!existingCodes.has(defItem.code)) {
        merged.push(JSON.parse(JSON.stringify(defItem)));
      }
    });
    return merged;
  }

  function loadLocalClassifications() {
    let src = null;
    let el = null;
    let anim = null;
    try {
      const rawSrc = localStorage.getItem('sg_custom_source_types');
      if (rawSrc) {
        const parsed = JSON.parse(rawSrc);
        if (Array.isArray(parsed) && parsed.length > 0) src = parsed;
      }
      const rawEl = localStorage.getItem('sg_custom_element_types');
      if (rawEl) {
        const parsed = JSON.parse(rawEl);
        if (Array.isArray(parsed) && parsed.length > 0) el = mergeMissingDefaultElements(parsed);
      }
      const rawAnimV2 = localStorage.getItem('sg_custom_anim_types_v2');
      if (rawAnimV2) {
        const parsed = JSON.parse(rawAnimV2);
        if (Array.isArray(parsed) && parsed.length > 0) anim = mergeMissingDefaultAnims(parsed);
      } else {
        // Tương thích ngược với sg_custom_anim_types cũ (gộp cả element + anim)
        const rawLegacy = localStorage.getItem('sg_custom_anim_types');
        if (rawLegacy) {
          const parsed = JSON.parse(rawLegacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const legacyEls = parsed.filter(x => x.group !== 'anim');
            const legacyAnims = parsed.filter(x => x.group === 'anim');
            if (!el && legacyEls.length) el = mergeMissingDefaultElements(legacyEls);
            if (!anim && legacyAnims.length) anim = mergeMissingDefaultAnims(legacyAnims);
          }
        }
      }
    } catch (e) { /* ignore */ }
    let bgm = null;
    let sfx = null;
    try {
      const rawBgm = localStorage.getItem('sg_custom_bgm_types');
      if (rawBgm) { const p = JSON.parse(rawBgm); if (Array.isArray(p) && p.length) bgm = p; }
      const rawSfx = localStorage.getItem('sg_custom_sfx_types');
      if (rawSfx) { const p = JSON.parse(rawSfx); if (Array.isArray(p) && p.length) sfx = p; }
    } catch(_) {}
    return {
      sourceTypes: src || JSON.parse(JSON.stringify(DEFAULT_SOURCE_TYPES)),
      elementTypes: el || JSON.parse(JSON.stringify(DEFAULT_ELEMENT_TYPES)),
      animationTypes: anim || JSON.parse(JSON.stringify(DEFAULT_ANIMATION_TYPES)),
      bgmTypes: bgm || JSON.parse(JSON.stringify(DEFAULT_BGM_TYPES)),
      sfxTypes: sfx || JSON.parse(JSON.stringify(DEFAULT_SFX_TYPES))
    };
  }

  function saveLocalClassifications(sourceTypes, elementTypes, animationTypes, bgmTypes, sfxTypes) {
    try {
      const stripHeavyVideo = list => (list || []).map(it => {
        if (it.image && typeof it.image === 'string' && it.image.startsWith('data:video/') && it.image.length > 500000) {
          return { ...it, image: '' };
        }
        return it;
      });
      localStorage.setItem('sg_custom_source_types', JSON.stringify(stripHeavyVideo(sourceTypes)));
      localStorage.setItem('sg_custom_element_types', JSON.stringify(stripHeavyVideo(elementTypes)));
      localStorage.setItem('sg_custom_anim_types_v2', JSON.stringify(stripHeavyVideo(animationTypes)));
      if (bgmTypes) localStorage.setItem('sg_custom_bgm_types', JSON.stringify(bgmTypes));
      if (sfxTypes) localStorage.setItem('sg_custom_sfx_types', JSON.stringify(sfxTypes));
    } catch (e) { /* ignore */ }
  }

  const initialCls = loadLocalClassifications();

  const sgState = {
    csvPath: localStorage.getItem('sg_timeline_csv') || '',
    defaultThoiKy: localStorage.getItem('sg_default_thoiky') || '',
    rulesPath: '',
    examplesPath: '',
    classificationsPath: '',
    rulesLocked: true,
    rulesOriginalText: '',
    srcLocked: true,
    elLocked: true,
    animLocked: true,
    clsCollapsed: localStorage.getItem('sg_cls_collapsed') === '1',
    clsHorizontal: localStorage.getItem('sg_cls_horiz') === '1',
    sourceTypes: initialCls.sourceTypes,
    elementTypes: initialCls.elementTypes,
    animationTypes: initialCls.animationTypes,
    bgmTypes: initialCls.bgmTypes,
    sfxTypes: initialCls.sfxTypes,
    origSourceTypes: [],
    origElementTypes: [],
    origAnimationTypes: [],
    origBgmTypes: [],
    origSfxTypes: [],
    bgmLocked: true,
    sfxLocked: true,
    clsFilter: 'all',
    rows: [],
    examples: [],
    backendLoaded: false,
    isLoadingCsv: false,
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
    // Classification tables DOM (3 bảng độc lập: Source - Lớp phủ Design - Animation)
    clsCard: $('#sg-cls-card'),
    clsBody: $('#sg-cls-body'),
    clsGrid: $('#sg-cls-grid'),
    clsSummary: $('#sg-cls-summary'),
    btnLayoutCls: $('#sg-btn-layout-cls'),
    btnToggleCls: $('#sg-btn-toggle-cls'),
    // Bảng 1: Source
    srcStatus: $('#sg-src-status'),
    btnEditSrc: $('#sg-btn-edit-src'),
    btnCancelSrc: $('#sg-btn-cancel-src'),
    btnSaveSrc: $('#sg-btn-save-src'),
    btnAddSource: $('#sg-btn-add-source'),
    clsSourceTbody: $('#sg-cls-source-tbody'),
    // Bảng 2: Lớp phủ Design (Element)
    elStatus: $('#sg-el-status'),
    btnEditEl: $('#sg-btn-edit-el'),
    btnCancelEl: $('#sg-btn-cancel-el'),
    btnSaveEl: $('#sg-btn-save-el'),
    btnAddEl: $('#sg-btn-add-el'),
    clsElTbody: $('#sg-cls-el-tbody'),
    // Bảng 3: Animation (Chuyển động)
    animStatus: $('#sg-anim-status'),
    btnEditAnim: $('#sg-btn-edit-anim'),
    btnCancelAnim: $('#sg-btn-cancel-anim'),
    btnSaveAnim: $('#sg-btn-save-anim'),
    btnAddAnim: $('#sg-btn-add-anim'),
    clsAnimTbody: $('#sg-cls-anim-tbody'),
    // Bảng 4: Sound nền (BGM)
    bgmStatus: $('#sg-bgm-status'),
    btnEditBgm: $('#sg-btn-edit-bgm'),
    btnCancelBgm: $('#sg-btn-cancel-bgm'),
    btnSaveBgm: $('#sg-btn-save-bgm'),
    btnAddBgm: $('#sg-btn-add-bgm'),
    clsBgmTbody: $('#sg-cls-bgm-tbody'),
    // Bảng 5: Sound Effect (SFX)
    sfxStatus: $('#sg-sfx-status'),
    btnEditSfx: $('#sg-btn-edit-sfx'),
    btnCancelSfx: $('#sg-btn-cancel-sfx'),
    btnSaveSfx: $('#sg-btn-save-sfx'),
    btnAddSfx: $('#sg-btn-add-sfx'),
    clsSfxTbody: $('#sg-cls-sfx-tbody'),
    clsAudioInput: $('#sg-cls-audio-input'),
    // Cột Ảnh ví dụ & Lightbox Modal
    clsFileInput: $('#sg-cls-file-input'),
    modalClsImg: $('#modal-cls-image'),
    modalClsImgCode: $('#cls-img-modal-code'),
    modalClsImgTitle: $('#cls-img-modal-title'),
    modalClsImgDesc: $('#cls-img-modal-desc'),
    modalClsImgClose: $('#cls-img-modal-close'),
    modalClsImgStage: $('#cls-img-stage'),
    modalClsImgPreview: $('#cls-img-preview-el'),
    modalClsVideoPreview: $('#cls-video-preview-el'),
    modalClsImgEmpty: $('#cls-img-empty-state'),
    modalClsImgPrev: $('#cls-img-prev'),
    modalClsImgNext: $('#cls-img-next'),
    modalClsImgRemove: $('#cls-img-btn-remove'),
    modalClsImgReplace: $('#cls-img-btn-replace'),
    // Timeline & Examples DOM
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

  function getListByTableKey(tbl) {
    if (tbl === 'src') return sgState.sourceTypes;
    if (tbl === 'el') return sgState.elementTypes;
    if (tbl === 'bgm') return sgState.bgmTypes;
    if (tbl === 'sfx') return sgState.sfxTypes;
    return sgState.animationTypes;
  }

  function getOrigListByTableKey(tbl) {
    if (tbl === 'src') return sgState.origSourceTypes;
    if (tbl === 'el') return sgState.origElementTypes;
    if (tbl === 'bgm') return sgState.origBgmTypes;
    if (tbl === 'sfx') return sgState.origSfxTypes;
    return sgState.origAnimationTypes;
  }

  function getValidLoaiList() {
    return sgState.sourceTypes.map(s => ({
      code: s.code,
      label: `${s.code} (${s.label || s.code})`,
      title: s.description || ''
    }));
  }

  function getValidElementsList() {
    return sgState.elementTypes.map(e => ({
      code: e.code,
      label: `${e.label || e.code} (${e.code})`,
      title: e.description || ''
    }));
  }

  function getValidAnimsList() {
    return sgState.animationTypes.map(a => ({
      code: a.code,
      label: `${a.label || a.code} (${a.code})`,
      title: a.description || ''
    }));
  }

  function getValidBgmsList() {
    return sgState.bgmTypes.map(b => ({
      code: b.code,
      label: `${b.label || b.code} (${b.code})`,
      title: b.description || ''
    }));
  }

  function getValidSfxsList() {
    return sgState.sfxTypes.map(s => ({
      code: s.code,
      label: `${s.label || s.code} (${s.code})`,
      title: s.description || ''
    }));
  }

  function syncClassificationsEverywhere() {
    // 1. Đồng bộ badge tổng số lượng (3 bảng)
    if (sgDom.clsSummary) {
      sgDom.clsSummary.textContent = `${sgState.sourceTypes.length} Source · ${sgState.elementTypes.length} Lớp phủ · ${sgState.animationTypes.length} Animation · ${sgState.bgmTypes.length} BGM · ${sgState.sfxTypes.length} SFX`;
    }

    // 2. Đồng bộ Dropdown #sp-loai ở Tab ✂️ Cắt Clip (Tool B)
    const spLoaiSel = $('#sp-loai');
    if (spLoaiSel) {
      const curVal = spLoaiSel.value || 'chua_phan_loai';
      const opts = [`<option value="chua_phan_loai">chua_phan_loai (mặc định)</option>`];
      sgState.sourceTypes.forEach(s => {
        if (s.code && s.code !== 'chua_phan_loai') {
          opts.push(`<option value="${s.code}">${s.code} — ${s.label || ''}</option>`);
        }
      });
      spLoaiSel.innerHTML = opts.join('');
      spLoaiSel.value = curVal;
    }

    // 3. Đồng bộ Tab 📋 Quy tắc (#rules-loai-grid, #rules-el-grid & #rules-anim-grid)
    const rulesLoaiGrid = $('#rules-loai-grid');
    if (rulesLoaiGrid) {
      const itemsHtml = sgState.sourceTypes.map(s => {
        const safeCode = String(s.code || '').replace(/</g, '&lt;');
        const safeLbl = String(s.label || '').replace(/</g, '&lt;');
        const safeDesc = String(s.description || '').replace(/"/g, '&quot;');
        return `<div class="rules-loai-item" title="${safeDesc}"><code>${safeCode}</code><span>${safeLbl}</span></div>`;
      });
      itemsHtml.push(`<div class="rules-loai-item rules-loai-default"><code>chua_phan_loai</code><span>Chưa phân loại (mặc định)</span></div>`);
      rulesLoaiGrid.innerHTML = itemsHtml.join('');
    }

    const rulesElGrid = $('#rules-el-grid');
    if (rulesElGrid) {
      rulesElGrid.innerHTML = sgState.elementTypes.map(el => {
        const safeCode = String(el.code || '').replace(/</g, '&lt;');
        const safeLbl = String(el.label || '').replace(/</g, '&lt;');
        const safeDesc = String(el.description || '').replace(/"/g, '&quot;');
        return `<div class="rules-loai-item" title="${safeDesc}"><code>${safeCode}</code><span>${safeLbl}</span></div>`;
      }).join('');
    }

    const rulesAnimGrid = $('#rules-anim-grid');
    if (rulesAnimGrid) {
      // Bảng 4: Sound nền in tab Rules
    const rulesBgmGrid = $('#rules-bgm-grid');
    if (rulesBgmGrid) {
      rulesBgmGrid.innerHTML = sgState.bgmTypes.map(b => {
        return `<div class="rules-loai-item"><span class="rules-loai-code">${b.code}</span><span class="rules-loai-label">${b.label || b.code}</span></div>`;
      }).join('');
    }

    // Bảng 5: Sound Effect in tab Rules
    const rulesSfxGrid = $('#rules-sfx-grid');
    if (rulesSfxGrid) {
      rulesSfxGrid.innerHTML = sgState.sfxTypes.map(s => {
        return `<div class="rules-loai-item"><span class="rules-loai-code">${s.code}</span><span class="rules-loai-label">${s.label || s.code}</span></div>`;
      }).join('');
    }

    rulesAnimGrid.innerHTML = sgState.animationTypes.map(a => {
        const safeCode = String(a.code || '').replace(/</g, '&lt;');
        const safeLbl = String(a.label || '').replace(/</g, '&lt;');
        const safeDesc = String(a.description || '').replace(/"/g, '&quot;');
        const safeParam = a.param ? ` (${String(a.param).replace(/</g, '&lt;')})` : '';
        return `<div class="rules-loai-item" title="${safeDesc}"><code>${safeCode}</code><span>${safeLbl}${safeParam}</span></div>`;
      }).join('');
    }

    // 4. Render lại 3 bảng phân loại & bảng Timeline hiện tại
    renderClassificationTables();
    renderTable();
  }

  function setClsLayoutHorizontal(horiz) {
    sgState.clsHorizontal = Boolean(horiz);
    localStorage.setItem('sg_cls_horiz', sgState.clsHorizontal ? '1' : '0');
    if (sgDom.clsGrid) {
      sgDom.clsGrid.classList.toggle('is-horizontal', sgState.clsHorizontal);
    }
    if (sgDom.btnLayoutCls) {
      sgDom.btnLayoutCls.textContent = sgState.clsHorizontal ? '📐 Xếp dọc 3 bảng' : '📐 Xếp ngang 3 cột';
    }
  }

  function setClsCollapsed(collapsed) {
    sgState.clsCollapsed = Boolean(collapsed);
    localStorage.setItem('sg_cls_collapsed', sgState.clsCollapsed ? '1' : '0');
    if (sgDom.clsBody) {
      sgDom.clsBody.style.display = sgState.clsCollapsed ? 'none' : 'flex';
    }
    if (sgDom.btnToggleCls) {
      sgDom.btnToggleCls.textContent = sgState.clsCollapsed ? '🔽 Mở rộng 3 bảng' : '🔼 Thu gọn';
    }
  }

  function setSrcLocked(locked, render = true) {
    sgState.srcLocked = Boolean(locked);
    if (sgDom.srcStatus) {
      sgDom.srcStatus.textContent = sgState.srcLocked ? '🔒 Đang khóa' : '🔓 Đang sửa';
      sgDom.srcStatus.classList.toggle('unsaved', !sgState.srcLocked);
    }
    if (sgDom.btnEditSrc) sgDom.btnEditSrc.style.display = sgState.srcLocked ? 'inline-flex' : 'none';
    if (sgDom.btnAddSource) sgDom.btnAddSource.style.display = sgState.srcLocked ? 'none' : 'inline-flex';
    if (sgDom.btnCancelSrc) sgDom.btnCancelSrc.style.display = sgState.srcLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveSrc) sgDom.btnSaveSrc.style.display = sgState.srcLocked ? 'none' : 'inline-flex';

    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-src-col-del').forEach(th => {
        th.style.display = sgState.srcLocked ? 'none' : 'table-cell';
      });
    }
    if (!sgState.srcLocked && sgState.clsCollapsed) {
      setClsCollapsed(false);
    }
    if (render) renderClassificationTables();
  }

  function setElLocked(locked, render = true) {
    sgState.elLocked = Boolean(locked);
    if (sgDom.elStatus) {
      sgDom.elStatus.textContent = sgState.elLocked ? '🔒 Đang khóa' : '🔓 Đang sửa';
      sgDom.elStatus.classList.toggle('unsaved', !sgState.elLocked);
    }
    if (sgDom.btnEditEl) sgDom.btnEditEl.style.display = sgState.elLocked ? 'inline-flex' : 'none';
    if (sgDom.btnAddEl) sgDom.btnAddEl.style.display = sgState.elLocked ? 'none' : 'inline-flex';
    if (sgDom.btnCancelEl) sgDom.btnCancelEl.style.display = sgState.elLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveEl) sgDom.btnSaveEl.style.display = sgState.elLocked ? 'none' : 'inline-flex';

    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-el-col-del').forEach(th => {
        th.style.display = sgState.elLocked ? 'none' : 'table-cell';
      });
    }
    if (!sgState.elLocked && sgState.clsCollapsed) {
      setClsCollapsed(false);
    }
    if (render) renderClassificationTables();
  }

  function setAnimLocked(locked, render = true) {
    sgState.animLocked = Boolean(locked);
    if (sgDom.animStatus) {
      sgDom.animStatus.textContent = sgState.animLocked ? '🔒 Đang khóa' : '🔓 Đang sửa';
      sgDom.animStatus.classList.toggle('unsaved', !sgState.animLocked);
    }
    if (sgDom.btnEditAnim) sgDom.btnEditAnim.style.display = sgState.animLocked ? 'inline-flex' : 'none';
    if (sgDom.btnAddAnim) sgDom.btnAddAnim.style.display = sgState.animLocked ? 'none' : 'inline-flex';
    if (sgDom.btnCancelAnim) sgDom.btnCancelAnim.style.display = sgState.animLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveAnim) sgDom.btnSaveAnim.style.display = sgState.animLocked ? 'none' : 'inline-flex';

    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-anim-col-del').forEach(th => {
        th.style.display = sgState.animLocked ? 'none' : 'table-cell';
      });
    }
    if (!sgState.animLocked && sgState.clsCollapsed) {
      setClsCollapsed(false);
    }
    if (render) renderClassificationTables();
  }

  function setBgmLocked(locked, render = true) {
    sgState.bgmLocked = Boolean(locked);
    if (sgDom.bgmStatus) {
      sgDom.bgmStatus.textContent = sgState.bgmLocked ? '🔒 Đang khóa' : '🔓 Đang sửa';
      sgDom.bgmStatus.classList.toggle('unsaved', !sgState.bgmLocked);
    }
    if (sgDom.btnEditBgm) sgDom.btnEditBgm.style.display = sgState.bgmLocked ? 'inline-flex' : 'none';
    if (sgDom.btnAddBgm) sgDom.btnAddBgm.style.display = sgState.bgmLocked ? 'none' : 'inline-flex';
    if (sgDom.btnCancelBgm) sgDom.btnCancelBgm.style.display = sgState.bgmLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveBgm) sgDom.btnSaveBgm.style.display = sgState.bgmLocked ? 'none' : 'inline-flex';
    const bgmDelCols = document.querySelectorAll('.sg-bgm-col-del');
    bgmDelCols.forEach(th => { th.style.display = sgState.bgmLocked ? 'none' : 'table-cell'; });
    if (!sgState.bgmLocked && sgState.clsCollapsed) setClsCollapsed(false);
    if (render) renderClassificationTables();
  }

  function setSfxLocked(locked, render = true) {
    sgState.sfxLocked = Boolean(locked);
    if (sgDom.sfxStatus) {
      sgDom.sfxStatus.textContent = sgState.sfxLocked ? '🔒 Đang khóa' : '🔓 Đang sửa';
      sgDom.sfxStatus.classList.toggle('unsaved', !sgState.sfxLocked);
    }
    if (sgDom.btnEditSfx) sgDom.btnEditSfx.style.display = sgState.sfxLocked ? 'inline-flex' : 'none';
    if (sgDom.btnAddSfx) sgDom.btnAddSfx.style.display = sgState.sfxLocked ? 'none' : 'inline-flex';
    if (sgDom.btnCancelSfx) sgDom.btnCancelSfx.style.display = sgState.sfxLocked ? 'none' : 'inline-flex';
    if (sgDom.btnSaveSfx) sgDom.btnSaveSfx.style.display = sgState.sfxLocked ? 'none' : 'inline-flex';
    const sfxDelCols = document.querySelectorAll('.sg-sfx-col-del');
    sfxDelCols.forEach(th => { th.style.display = sgState.sfxLocked ? 'none' : 'table-cell'; });
    if (!sgState.sfxLocked && sgState.clsCollapsed) setClsCollapsed(false);
    if (render) renderClassificationTables();
  }

  function setClsLocked(locked, render = true) {
    setSrcLocked(locked, false);
    setElLocked(locked, false);
    setAnimLocked(locked, false);
    setBgmLocked(locked, false);
    setSfxLocked(locked, false);
    if (render) renderClassificationTables();
  }

  let pendingImgTarget = null; // { tbl: 'src' | 'el' | 'anim', idx: number }
  let activeLightbox = null;   // { tbl: 'src' | 'el' | 'anim', idx: number }
  let assetPreviews = new Map();
  let assetPreviewRequest = 0;

  async function refreshAssetPreviews() {
    if (!state.backendReady) return;
    const requestId = ++assetPreviewRequest;
    try {
      const result = await window.api.assetPreviews(getAssetRoots());
      if (result.error) throw new Error(result.error);
      if (requestId !== assetPreviewRequest) return;
      assetPreviews = new Map(result.items.map(item => [`${item.kind}/${item.code}`, item]));
      renderClassificationTables();
    } catch (err) { sgLog(`Không tải được preview tài nguyên: ${err.message}`, 'error'); }
  }
  window.addEventListener('asset-roots-changed', () => {
    releasePreviewMedia(sharedClsAudio);
    sharedClsAudio = null;
    sharedClsAudioKey = null;
    updateAudioPreviewButtons();
    stopClassificationVideoPreviews();
    assetPreviews.clear();
    refreshAssetPreviews();
  });

  function releasePreviewMedia(media) {
    if (!media) return;
    try {
      media.pause();
      if (media.getAttribute('src')) {
        media.removeAttribute('src');
        media.load(); // Abort any pending download as well as playback.
      }
    } catch (_) {}
  }

  function stopClassificationVideoPreviews() {
    sgDom.clsCard?.querySelectorAll('video.sg-cls-thumb').forEach(releasePreviewMedia);
  }

  function bindThumbnailVideoPreview(wrap, video) {
    wrap.addEventListener('mouseenter', () => {
      if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
      video.play().catch(() => {});
    });
    wrap.addEventListener('mouseleave', () => releasePreviewMedia(video));
  }

  function isVideoMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('data:video/')) return true;
    const cleanUrl = url.split('?')[0].split('#')[0];
    return /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(cleanUrl);
  }

  function localPathToFileUrl(localPath) {
    const norm = String(localPath || '').replace(/\\/g, '/');
    const encoded = norm.split('/').map(seg => seg.includes(':') ? seg : encodeURIComponent(seg)).join('/');
    return `file:///${encoded}`;
  }

  function getEffectiveItemImage(item, tbl = '') {
    if (!item) return '';
    if (item.image && item.image !== '__none__') return item.image;
    if (item.image === '__none__') return '';
    if (tbl === 'el' || item.group === 'element') {
      return assetPreviews.get(`element/${item.code}`)?.url || '';
    }
    return '';
  }

  function renderImgCellHtml(tbl, idx, item) {
    const mediaSrc = getEffectiveItemImage(item, tbl);
    const safeCode = String(item?.code || '').replace(/"/g, '&quot;');
    if (mediaSrc) {
      if (isVideoMediaUrl(mediaSrc)) {
        return `
          <td class="sg-cls-img-cell">
            <div class="sg-cls-thumb-wrap is-video" data-tbl="${tbl}" data-idx="${idx}" title="Di chuột để chạy thử video · Click để phóng to video hiệu ứng của '${safeCode}' (hoặc kéo-thả ảnh/video mới vào đây)">
              <video class="sg-cls-thumb" data-src="${mediaSrc}" muted loop playsinline preload="none"></video>
              <span class="sg-cls-video-badge">▶ Video</span>
              <div class="sg-cls-thumb-zoom">🔍</div>
            </div>
          </td>
        `;
      }
      return `
        <td class="sg-cls-img-cell">
          <div class="sg-cls-thumb-wrap" data-tbl="${tbl}" data-idx="${idx}" title="Click để phóng to ảnh ví dụ của '${safeCode}' (hoặc kéo-thả ảnh/video mới vào đây)">
            <img class="sg-cls-thumb" src="${mediaSrc}" alt="${safeCode}" loading="lazy" decoding="async" />
            <div class="sg-cls-thumb-zoom">🔍</div>
          </div>
        </td>
      `;
    }
    return `
      <td class="sg-cls-img-cell">
        <button type="button" class="sg-img-add-btn" data-tbl="${tbl}" data-idx="${idx}" title="Click để tải Ảnh hoặc Video (5-10s) minh họa cho '${safeCode}' (hoặc kéo-thả vào đây)">＋ Thêm</button>
      </td>
    `;
  }

  function compressImageToDataUrl(file, maxDim = 1150, quality = 0.86) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Định dạng ảnh không hợp lệ'));
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const isPng = file.type === 'image/png';
          const outUrl = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
          resolve(outUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function readVideoFileToUrl(file) {
    return new Promise((resolve, reject) => {
      // Nếu chạy trong Electron và có đường dẫn file trực tiếp trên ổ đĩa, ưu tiên dùng file:///
      // (Backend sẽ tự động copy vào templates/cls_media/ khi lưu)
      if (file.path && typeof file.path === 'string') {
        resolve(localPathToFileUrl(file.path));
        return;
      }
      const maxBytes = 45 * 1024 * 1024; // 45 MB cho video ngắn 5-10s
      if (file.size > maxBytes) {
        reject(new Error('Video quá lớn (> 45MB). Vui lòng chọn video ngắn 5-10s nhẹ hơn.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được file video'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function applyImageFileToItem(tbl, idx, file) {
    if (!file) return;
    const fname = String(file.name || '').toLowerCase();
    const isImg = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fname);
    const isVid = (file.type && file.type.startsWith('video/')) || /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(fname);

    if (!isImg && !isVid) {
      sgLog('Vui lòng chọn đúng định dạng Ảnh (.png, .jpg, .gif...) hoặc Video (.mp4, .webm, .mov...).', 'error');
      return;
    }
    const list = getListByTableKey(tbl);
    const item = list[idx];
    if (!item) return;

    try {
      const mediaUrl = isVid ? await readVideoFileToUrl(file) : await compressImageToDataUrl(file);
      item.image = mediaUrl;
      const origList = getOrigListByTableKey(tbl);
      if (origList && origList[idx]) {
        origList[idx].image = mediaUrl;
      }
      await persistAllClassificationTables();
      renderClassificationTables();
      if (activeLightbox && activeLightbox.tbl === tbl && activeLightbox.idx === idx) {
        updateLightboxModalView();
      }
      sgLog(`${isVid ? '🎬 Đã cập nhật video hiệu ứng' : '🖼️ Đã cập nhật ảnh ví dụ'} cho "${item.code}"!`, 'success');
    } catch (err) {
      sgLog(`Lỗi tải Ảnh/Video minh họa: ${err.message}`, 'error');
    }
  }

  function triggerPickImageFor(tbl, idx) {
    pendingImgTarget = { tbl, idx };
    if (sgDom.clsFileInput) {
      sgDom.clsFileInput.value = '';
      sgDom.clsFileInput.click();
    }
  }

  function updateLightboxModalView() {
    if (!activeLightbox || !sgDom.modalClsImg) return;
    const list = getListByTableKey(activeLightbox.tbl);
    if (!list || !list.length) return;
    const idx = ((activeLightbox.idx % list.length) + list.length) % list.length;
    activeLightbox.idx = idx;
    const item = list[idx];
    const mediaSrc = getEffectiveItemImage(item, activeLightbox.tbl);
    const isVid = isVideoMediaUrl(mediaSrc);

    if (sgDom.modalClsImgCode) sgDom.modalClsImgCode.textContent = item.code || '';
    if (sgDom.modalClsImgTitle) {
      const prefixMap = { src: '📂 Source: ', el: '🖼️ Lớp phủ Design: ', anim: '🎬 Animation: ', bgm: '🎵 Sound nền: ', sfx: '🔊 Sound Effect: ' };
      const prefix = prefixMap[activeLightbox.tbl] || '';
      sgDom.modalClsImgTitle.textContent = `${prefix}${item.label || item.code || ''} (${idx + 1}/${list.length})`;
    }
    if (sgDom.modalClsImgDesc) {
      const paramStr = item.param ? ` · Thông số/File: ${item.param}` : '';
      sgDom.modalClsImgDesc.textContent = `${item.description || 'Chưa có mô tả'}${paramStr}`;
    }

    // Dừng video cũ trước khi chuyển
    releasePreviewMedia(sgDom.modalClsVideoPreview);

    if (mediaSrc) {
      if (isVid) {
        if (sgDom.modalClsImgPreview) {
          sgDom.modalClsImgPreview.src = '';
          sgDom.modalClsImgPreview.style.display = 'none';
        }
        if (sgDom.modalClsVideoPreview) {
          sgDom.modalClsVideoPreview.src = mediaSrc;
          sgDom.modalClsVideoPreview.style.display = 'block';
          sgDom.modalClsVideoPreview.play().catch(() => {});
        }
      } else {
        if (sgDom.modalClsVideoPreview) {
          sgDom.modalClsVideoPreview.removeAttribute('src');
          sgDom.modalClsVideoPreview.style.display = 'none';
        }
        if (sgDom.modalClsImgPreview) {
          sgDom.modalClsImgPreview.src = mediaSrc;
          sgDom.modalClsImgPreview.style.display = 'block';
        }
      }
      if (sgDom.modalClsImgEmpty) sgDom.modalClsImgEmpty.style.display = 'none';
      if (sgDom.modalClsImgRemove) sgDom.modalClsImgRemove.style.display = 'inline-flex';
    } else {
      if (sgDom.modalClsImgPreview) {
        sgDom.modalClsImgPreview.src = '';
        sgDom.modalClsImgPreview.style.display = 'none';
      }
      if (sgDom.modalClsVideoPreview) {
        sgDom.modalClsVideoPreview.removeAttribute('src');
        sgDom.modalClsVideoPreview.style.display = 'none';
      }
      if (sgDom.modalClsImgEmpty) sgDom.modalClsImgEmpty.style.display = 'block';
      if (sgDom.modalClsImgRemove) sgDom.modalClsImgRemove.style.display = 'none';
    }
  }

  function openClsImageModal(tbl, idx) {
    stopClassificationVideoPreviews();
    activeLightbox = { tbl, idx };
    updateLightboxModalView();
    if (sgDom.modalClsImg) {
      sgDom.modalClsImg.style.display = 'flex';
    }
  }

  function closeClsImageModal() {
    activeLightbox = null;
    releasePreviewMedia(sgDom.modalClsVideoPreview);
    if (sgDom.modalClsImg) {
      sgDom.modalClsImg.style.display = 'none';
    }
  }

  // Shared audio element for preview in classification tables
  let sharedClsAudio = null;
  let sharedClsAudioKey = null;

  function updateAudioPreviewButtons() {
    sgDom.clsCard?.querySelectorAll('.sg-audio-play-btn').forEach(btn => {
      const isPlaying = sharedClsAudioKey === `${btn.dataset.tbl}/${btn.dataset.code}`;
      btn.classList.toggle('is-playing', isPlaying);
      btn.textContent = isPlaying ? '⏹ Dừng' : '▶ Nghe';
      btn.title = isPlaying ? 'Dừng phát' : 'Nghe thử';
    });
  }

  function toggleAudioPreview(tbl, code, param) {
    if (!param) return;
    const key = `${tbl}/${code}`;
    const audioUrl = assetPreviews.get(key)?.url;
    if (!audioUrl) { sgLog(`Chưa tìm thấy file âm thanh: ${code}`, 'error'); return; }

    if (sharedClsAudio && sharedClsAudioKey === key) {
      releasePreviewMedia(sharedClsAudio);
      sharedClsAudio = null;
      sharedClsAudioKey = null;
      updateAudioPreviewButtons();
      return;
    }
    releasePreviewMedia(sharedClsAudio);
    const audio = new Audio(audioUrl);
    sharedClsAudio = audio;
    sharedClsAudioKey = key;
    audio.volume = tbl === 'bgm' ? 0.35 : 0.7;
    audio.play().catch(err => {
      if (sharedClsAudio !== audio) return;
      sgLog(`Không phát được audio: ${err.message}`, 'error');
      releasePreviewMedia(audio);
      sharedClsAudio = null;
      sharedClsAudioKey = null;
      updateAudioPreviewButtons();
    });
    audio.addEventListener('ended', () => {
      if (sharedClsAudio !== audio) return;
      releasePreviewMedia(audio);
      sharedClsAudio = null;
      sharedClsAudioKey = null;
      updateAudioPreviewButtons();
    }, { once: true });
    updateAudioPreviewButtons();
  }

  function renderAudioCellHtml(tbl, idx, item) {
    const param = String(item.param || '').trim();
    const code = String(item.code || '');
    const isPlaying = sharedClsAudioKey === `${tbl}/${code}`;
    if (code === 'auto' || code === 'none' || !param) {
      return `<td class="sg-cls-img-cell" style="text-align:center; color:var(--text-tertiary); font-size:0.7rem;">—</td>`;
    }
    const asset = assetPreviews.get(`${tbl}/${code}`);
    if (asset && !asset.exists) {
      return '<td class="sg-cls-img-cell asset-verify-missing">❌ Thiếu file</td>';
    }
    return `<td class="sg-cls-img-cell"><div class="sg-audio-cell"><button type="button" class="sg-audio-play-btn ${isPlaying ? 'is-playing' : ''}" data-tbl="${tbl}" data-idx="${idx}" data-code="${code}" data-param="${param.replace(/"/g, '&quot;')}" title="${isPlaying ? 'Dừng phát' : 'Nghe thử'}">${isPlaying ? '⏹ Dừng' : '▶ Nghe'}</button></div></td>`;
  }

  function renderClassificationTables() {
    if (!sgDom.clsSourceTbody || !sgDom.clsElTbody || !sgDom.clsAnimTbody) return;
    stopClassificationVideoPreviews();
    const srcLocked = sgState.srcLocked;
    const elLocked = sgState.elLocked;
    const animLocked = sgState.animLocked;

    // --- BẢNG 1: PHÂN LOẠI SOURCE ---
    sgDom.clsSourceTbody.innerHTML = sgState.sourceTypes.map((s, idx) => {
      const safeCode = String(s.code || '').replace(/"/g, '&quot;');
      const safeLabel = String(s.label || '').replace(/"/g, '&quot;');
      const safeDesc = String(s.description || '').replace(/"/g, '&quot;');
      const imgCell = renderImgCellHtml('src', idx, s);
      if (srcLocked) {
        return `
          <tr>
            <td><span class="sg-code-chip" data-code="${safeCode}" title="Click để copy mã '${safeCode}' (hoặc chèn vào ô Quy tắc .txt)">${safeCode}</span></td>
            <td style="font-weight:600; color:#e2e8f0;">${safeLabel}</td>
            <td style="color:var(--text-secondary); line-height:1.35;">${safeDesc}</td>
            ${imgCell}
          </tr>
        `;
      }
      return `
        <tr data-src-idx="${idx}">
          <td><input type="text" class="sg-cls-input code-font sg-src-code" data-idx="${idx}" value="${safeCode}" placeholder="vd: rai_1"></td>
          <td><input type="text" class="sg-cls-input sg-src-label" data-idx="${idx}" value="${safeLabel}" placeholder="Tên ngắn..."></td>
          <td><input type="text" class="sg-cls-input sg-src-desc" data-idx="${idx}" value="${safeDesc}" placeholder="Mô tả khi nào dùng để AI hiểu..."></td>
          ${imgCell}
          <td style="text-align:center;">
            <button class="sg-example-del sg-src-del" data-idx="${idx}" title="Xóa dòng này">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    // --- BẢNG 2: LỚP PHỦ DESIGN (ELEMENT) ---
    sgDom.clsElTbody.innerHTML = sgState.elementTypes.map((el, idx) => {
      const safeCode = String(el.code || '').replace(/"/g, '&quot;');
      const safeLabel = String(el.label || '').replace(/"/g, '&quot;');
      const safeParam = String(el.param || '').replace(/"/g, '&quot;');
      const safeDesc = String(el.description || '').replace(/"/g, '&quot;');
      const imgCell = renderImgCellHtml('el', idx, el);
      if (elLocked) {
        return `
          <tr>
            <td><span class="sg-code-chip" data-code="${safeCode}" title="Click để copy mã '${safeCode}' (hoặc chèn vào ô Quy tắc .txt)">${safeCode}</span></td>
            <td style="font-weight:600; color:#e2e8f0;">${safeLabel}</td>
            <td style="font-family:var(--font-mono); font-size:0.7rem; color:#94a3b8; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeParam}">${safeParam || '—'}</td>
            <td style="color:var(--text-secondary); line-height:1.35;">${safeDesc}</td>
            ${imgCell}
          </tr>
        `;
      }
      return `
        <tr data-el-idx="${idx}">
          <td><input type="text" class="sg-cls-input code-font sg-el-code" data-idx="${idx}" value="${safeCode}" placeholder="vd: tv_retro"></td>
          <td><input type="text" class="sg-cls-input sg-el-label" data-idx="${idx}" value="${safeLabel}" placeholder="Tên lớp phủ..."></td>
          <td><input type="text" class="sg-cls-input sg-el-param" data-idx="${idx}" value="${safeParam}" placeholder="Tên file trong Elements/ (vd: tv FRAME2.png)"></td>
          <td><input type="text" class="sg-cls-input sg-el-desc" data-idx="${idx}" value="${safeDesc}" placeholder="Mô tả khi nào dùng lớp phủ này..."></td>
          ${imgCell}
          <td style="text-align:center;">
            <button class="sg-example-del sg-el-del" data-idx="${idx}" title="Xóa dòng này">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    // --- BẢNG 3: PHÂN LOẠI ANIMATION (CHUYỂN ĐỘNG) ---
    sgDom.clsAnimTbody.innerHTML = sgState.animationTypes.map((a, idx) => {
      const safeCode = String(a.code || '').replace(/"/g, '&quot;');
      const safeLabel = String(a.label || '').replace(/"/g, '&quot;');
      const safeParam = String(a.param || '').replace(/"/g, '&quot;');
      const safeDesc = String(a.description || '').replace(/"/g, '&quot;');
      const imgCell = renderImgCellHtml('anim', idx, a);
      if (animLocked) {
        return `
          <tr>
            <td><span class="sg-code-chip" data-code="${safeCode}" title="Click để copy mã '${safeCode}' (hoặc chèn vào ô Quy tắc .txt)">${safeCode}</span></td>
            <td style="font-weight:600; color:#e2e8f0;">${safeLabel}</td>
            <td style="font-family:var(--font-mono); font-size:0.74rem; color:#38bdf8; font-weight:600;" title="${safeParam}">${safeParam || '—'}</td>
            <td style="color:var(--text-secondary); line-height:1.35;">${safeDesc}</td>
            ${imgCell}
          </tr>
        `;
      }
      return `
        <tr data-anim-idx="${idx}">
          <td><input type="text" class="sg-cls-input code-font sg-anim-code" data-idx="${idx}" value="${safeCode}" placeholder="vd: zoom_in"></td>
          <td><input type="text" class="sg-cls-input sg-anim-label" data-idx="${idx}" value="${safeLabel}" placeholder="Tên chuyển động..."></td>
          <td><input type="text" class="sg-cls-input sg-anim-param" data-idx="${idx}" value="${safeParam}" placeholder="vd: 100->108"></td>
          <td><input type="text" class="sg-cls-input sg-anim-desc" data-idx="${idx}" value="${safeDesc}" placeholder="Mô tả khi nào dùng chuyển động này..."></td>
          ${imgCell}
          <td style="text-align:center;">
            <button class="sg-example-del sg-anim-del" data-idx="${idx}" title="Xóa dòng này">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    // --- BẢNG 4: SOUND NỀN (BGM) ---
    if (sgDom.clsBgmTbody) {
      const bgmLocked = sgState.bgmLocked;
      sgDom.clsBgmTbody.innerHTML = sgState.bgmTypes.map((b, idx) => {
        const safeCode = String(b.code || '').replace(/"/g, '&quot;');
        const safeLabel = String(b.label || '').replace(/"/g, '&quot;');
        const safeParam = String(b.param || '').replace(/"/g, '&quot;');
        const safeDesc = String(b.description || '').replace(/"/g, '&quot;');
        const audioCell = renderAudioCellHtml('bgm', idx, b);
        if (bgmLocked) {
          return `<tr>`
            + `<td><span class="sg-code-chip" data-code="${safeCode}" title="Click để copy '${safeCode}'">${safeCode}</span></td>`
            + `<td style="font-weight:600; color:#22d3ee;">${safeLabel}</td>`
            + `<td style="font-family:var(--font-mono); font-size:0.7rem; color:#94a3b8; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeParam}">${safeParam || '—'}</td>`
            + `<td style="color:var(--text-secondary); line-height:1.35;">${safeDesc}</td>`
            + audioCell
            + `</tr>`;
        }
        return `<tr data-bgm-idx="${idx}">`
          + `<td><input type="text" class="sg-cls-input code-font sg-bgm-code" data-idx="${idx}" value="${safeCode}" placeholder="vd: bgm_default"></td>`
          + `<td><input type="text" class="sg-cls-input sg-bgm-label" data-idx="${idx}" value="${safeLabel}" placeholder="Tên nhạc..."></td>`
          + `<td><input type="text" class="sg-cls-input sg-bgm-param" data-idx="${idx}" value="${safeParam}" placeholder="File .mp3 trong Sounds/Background/"></td>`
          + `<td><input type="text" class="sg-cls-input sg-bgm-desc" data-idx="${idx}" value="${safeDesc}" placeholder="Mô tả khi nào dùng..."></td>`
          + audioCell
          + `<td style="text-align:center;"><button class="sg-example-del sg-bgm-del" data-idx="${idx}" title="Xóa">✕</button></td>`
          + `</tr>`;
      }).join('');
    }

    // --- BẢNG 5: SOUND EFFECT (SFX) ---
    if (sgDom.clsSfxTbody) {
      const sfxLocked = sgState.sfxLocked;
      sgDom.clsSfxTbody.innerHTML = sgState.sfxTypes.map((s, idx) => {
        const safeCode = String(s.code || '').replace(/"/g, '&quot;');
        const safeLabel = String(s.label || '').replace(/"/g, '&quot;');
        const safeParam = String(s.param || '').replace(/"/g, '&quot;');
        const safeDesc = String(s.description || '').replace(/"/g, '&quot;');
        const audioCell = renderAudioCellHtml('sfx', idx, s);
        if (sfxLocked) {
          return `<tr>`
            + `<td><span class="sg-code-chip" data-code="${safeCode}" title="Click để copy '${safeCode}'">${safeCode}</span></td>`
            + `<td style="font-weight:600; color:#f472b6;">${safeLabel}</td>`
            + `<td style="font-family:var(--font-mono); font-size:0.7rem; color:#94a3b8; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeParam}">${safeParam || '—'}</td>`
            + `<td style="color:var(--text-secondary); line-height:1.35;">${safeDesc}</td>`
            + audioCell
            + `</tr>`;
        }
        return `<tr data-sfx-idx="${idx}">`
          + `<td><input type="text" class="sg-cls-input code-font sg-sfx-code" data-idx="${idx}" value="${safeCode}" placeholder="vd: whoosh"></td>`
          + `<td><input type="text" class="sg-cls-input sg-sfx-label" data-idx="${idx}" value="${safeLabel}" placeholder="Tên SFX..."></td>`
          + `<td><input type="text" class="sg-cls-input sg-sfx-param" data-idx="${idx}" value="${safeParam}" placeholder="File .mp3 trong Sounds/SFX/"></td>`
          + `<td><input type="text" class="sg-cls-input sg-sfx-desc" data-idx="${idx}" value="${safeDesc}" placeholder="Mô tả khi nào dùng..."></td>`
          + audioCell
          + `<td style="text-align:center;"><button class="sg-example-del sg-sfx-del" data-idx="${idx}" title="Xóa">✕</button></td>`
          + `</tr>`;
      }).join('');
    }

    // Events cho nút Nghe audio
    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-audio-play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleAudioPreview(btn.dataset.tbl, btn.dataset.code, btn.dataset.param);
        });
      });
    }

    // Events cho edit BGM inputs
    if (!sgState.bgmLocked && sgDom.clsBgmTbody) {
      sgDom.clsBgmTbody.querySelectorAll('.sg-bgm-code').forEach(inp => {
        inp.addEventListener('input', () => { sgState.bgmTypes[Number(inp.dataset.idx)].code = inp.value; });
      });
      sgDom.clsBgmTbody.querySelectorAll('.sg-bgm-label').forEach(inp => {
        inp.addEventListener('input', () => { sgState.bgmTypes[Number(inp.dataset.idx)].label = inp.value; });
      });
      sgDom.clsBgmTbody.querySelectorAll('.sg-bgm-param').forEach(inp => {
        inp.addEventListener('input', () => { sgState.bgmTypes[Number(inp.dataset.idx)].param = inp.value; });
      });
      sgDom.clsBgmTbody.querySelectorAll('.sg-bgm-desc').forEach(inp => {
        inp.addEventListener('input', () => { sgState.bgmTypes[Number(inp.dataset.idx)].description = inp.value; });
      });
      sgDom.clsBgmTbody.querySelectorAll('.sg-bgm-del').forEach(btn => {
        btn.addEventListener('click', () => {
          sgState.bgmTypes.splice(Number(btn.dataset.idx), 1);
          renderClassificationTables();
        });
      });
    }

    // Events cho edit SFX inputs
    if (!sgState.sfxLocked && sgDom.clsSfxTbody) {
      sgDom.clsSfxTbody.querySelectorAll('.sg-sfx-code').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sfxTypes[Number(inp.dataset.idx)].code = inp.value; });
      });
      sgDom.clsSfxTbody.querySelectorAll('.sg-sfx-label').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sfxTypes[Number(inp.dataset.idx)].label = inp.value; });
      });
      sgDom.clsSfxTbody.querySelectorAll('.sg-sfx-param').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sfxTypes[Number(inp.dataset.idx)].param = inp.value; });
      });
      sgDom.clsSfxTbody.querySelectorAll('.sg-sfx-desc').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sfxTypes[Number(inp.dataset.idx)].description = inp.value; });
      });
      sgDom.clsSfxTbody.querySelectorAll('.sg-sfx-del').forEach(btn => {
        btn.addEventListener('click', () => {
          sgState.sfxTypes.splice(Number(btn.dataset.idx), 1);
          renderClassificationTables();
        });
      });
    }

    // Filter pills visibility
    const filter = sgState.clsFilter || 'all';
    const panelMap = { src: '#sg-cls-panel-src', el: '#sg-cls-panel-el', anim: '#sg-cls-panel-anim', bgm: '#sg-cls-panel-bgm', sfx: '#sg-cls-panel-sfx' };
    const resizerMap = { 'sg-cls-inner-1': ['src','el'], 'sg-cls-inner-2': ['el','anim'], 'sg-cls-inner-3': ['anim','bgm'], 'sg-cls-inner-4': ['bgm','sfx'] };
    Object.entries(panelMap).forEach(([key, sel]) => {
      const panel = document.querySelector(sel);
      if (panel) panel.style.display = (filter === 'all' || filter === key) ? '' : 'none';
    });
    // Hide/show inner resizers based on filter
    Object.entries(resizerMap).forEach(([tabKey, panels]) => {
      const resizer = document.querySelector(`.inner-split-resizer[data-tab-key="${tabKey}"]`);
      if (resizer) {
        const showResizer = filter === 'all' || panels.some(p => p === filter);
        resizer.style.display = showResizer && filter === 'all' ? '' : 'none';
      }
    });

    // Events cho cột Ảnh ví dụ (hoạt động cả khi khóa lẫn khi mở khóa)
    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-img-add-btn').forEach(btn => {
        const tbl = btn.dataset.tbl;
        const idx = Number(btn.dataset.idx);
        btn.addEventListener('click', () => triggerPickImageFor(tbl, idx));
        btn.addEventListener('dragover', e => { e.preventDefault(); btn.classList.add('drag-over'); });
        btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
        btn.addEventListener('drop', e => {
          e.preventDefault();
          btn.classList.remove('drag-over');
          const file = e.dataTransfer?.files?.[0];
          if (file) applyImageFileToItem(tbl, idx, file);
        });
      });

      sgDom.clsCard.querySelectorAll('.sg-cls-thumb-wrap').forEach(wrap => {
        const tbl = wrap.dataset.tbl;
        const idx = Number(wrap.dataset.idx);
        wrap.addEventListener('click', () => openClsImageModal(tbl, idx));
        wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drag-over'); });
        wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over'));
        wrap.addEventListener('drop', e => {
          e.preventDefault();
          wrap.classList.remove('drag-over');
          const file = e.dataTransfer?.files?.[0];
          if (file) applyImageFileToItem(tbl, idx, file);
        });
        // Nếu là video thumbnail: di chuột vào tự động phát thử hiệu ứng, rời chuột tạm dừng
        const vidEl = wrap.querySelector('video');
        if (vidEl) {
          bindThumbnailVideoPreview(wrap, vidEl);
          vidEl.addEventListener('error', () => {
            wrap.title = 'Không tải được video. Kiểm tra file hoặc codec video.';
            const badge = wrap.querySelector('.sg-cls-video-badge');
            if (badge) badge.textContent = '⚠ Không phát được';
          }, { once: true });
        }
        // Nếu ảnh mặc định từ thư mục Elements không tìm thấy trên đĩa, chuyển thành nút + Thêm gọn gàng
        const imgEl = wrap.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('error', () => {
            imgEl.alt = 'Không tải được ảnh';
            wrap.title = 'Không tải được ảnh. Kiểm tra lại file tài nguyên.';
          }, { once: true });
        }
      });
    }

    // Events cho các chip mã khi bảng đang khóa: Click -> Copy hoặc chèn vào ô quy tắc .txt
    if (sgDom.clsCard) {
      sgDom.clsCard.querySelectorAll('.sg-code-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const code = chip.dataset.code || '';
          if (!code) return;
          if (!sgState.rulesLocked && sgDom.rulesInput) {
            const ta = sgDom.rulesInput;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            ta.value = ta.value.slice(0, start) + code + ta.value.slice(end);
            ta.focus();
            ta.selectionStart = ta.selectionEnd = start + code.length;
            updateRulesMeta(ta.value);
            sgLog(`Đã chèn mã "${code}" vào ô File quy tắc (.txt).`, 'info');
          } else {
            navigator.clipboard?.writeText(code);
            sgLog(`📋 Đã copy mã "${code}" vào bộ nhớ tạm!`, 'info');
          }
        });
      });
    }

    // Events khi Bảng 1 (Source) đang mở khóa chỉnh sửa:
    if (!srcLocked) {
      sgDom.clsSourceTbody.querySelectorAll('.sg-src-code').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sourceTypes[Number(inp.dataset.idx)].code = inp.value; });
      });
      sgDom.clsSourceTbody.querySelectorAll('.sg-src-label').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sourceTypes[Number(inp.dataset.idx)].label = inp.value; });
      });
      sgDom.clsSourceTbody.querySelectorAll('.sg-src-desc').forEach(inp => {
        inp.addEventListener('input', () => { sgState.sourceTypes[Number(inp.dataset.idx)].description = inp.value; });
      });
      sgDom.clsSourceTbody.querySelectorAll('.sg-src-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const i = Number(btn.dataset.idx);
          const item = sgState.sourceTypes[i];
          const ok = await askConfirm(`Bạn có muốn xóa loại Source "${item?.code || ''}" khỏi Bảng 1 không?`, {
            title: '🗑 Xác nhận xóa loại Source',
            confirmText: 'Xóa dòng này',
            danger: true
          });
          if (!ok) return;
          sgState.sourceTypes.splice(i, 1);
          renderClassificationTables();
        });
      });
    }

    // Events khi Bảng 2 (Lớp phủ Design) đang mở khóa chỉnh sửa:
    if (!elLocked) {
      sgDom.clsElTbody.querySelectorAll('.sg-el-code').forEach(inp => {
        inp.addEventListener('input', () => { sgState.elementTypes[Number(inp.dataset.idx)].code = inp.value; });
      });
      sgDom.clsElTbody.querySelectorAll('.sg-el-label').forEach(inp => {
        inp.addEventListener('input', () => { sgState.elementTypes[Number(inp.dataset.idx)].label = inp.value; });
      });
      sgDom.clsElTbody.querySelectorAll('.sg-el-param').forEach(inp => {
        inp.addEventListener('input', () => { sgState.elementTypes[Number(inp.dataset.idx)].param = inp.value; });
      });
      sgDom.clsElTbody.querySelectorAll('.sg-el-desc').forEach(inp => {
        inp.addEventListener('input', () => { sgState.elementTypes[Number(inp.dataset.idx)].description = inp.value; });
      });
      sgDom.clsElTbody.querySelectorAll('.sg-el-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const i = Number(btn.dataset.idx);
          const item = sgState.elementTypes[i];
          const ok = await askConfirm(`Bạn có muốn xóa Lớp phủ Design "${item?.code || ''}" khỏi Bảng 2 không?`, {
            title: '🗑 Xác nhận xóa Lớp phủ Design',
            confirmText: 'Xóa dòng này',
            danger: true
          });
          if (!ok) return;
          sgState.elementTypes.splice(i, 1);
          renderClassificationTables();
        });
      });
    }

    // Events khi Bảng 3 (Animation) đang mở khóa chỉnh sửa:
    if (!animLocked) {
      sgDom.clsAnimTbody.querySelectorAll('.sg-anim-code').forEach(inp => {
        inp.addEventListener('input', () => { sgState.animationTypes[Number(inp.dataset.idx)].code = inp.value; });
      });
      sgDom.clsAnimTbody.querySelectorAll('.sg-anim-label').forEach(inp => {
        inp.addEventListener('input', () => { sgState.animationTypes[Number(inp.dataset.idx)].label = inp.value; });
      });
      sgDom.clsAnimTbody.querySelectorAll('.sg-anim-param').forEach(inp => {
        inp.addEventListener('input', () => { sgState.animationTypes[Number(inp.dataset.idx)].param = inp.value; });
      });
      sgDom.clsAnimTbody.querySelectorAll('.sg-anim-desc').forEach(inp => {
        inp.addEventListener('input', () => { sgState.animationTypes[Number(inp.dataset.idx)].description = inp.value; });
      });
      sgDom.clsAnimTbody.querySelectorAll('.sg-anim-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const i = Number(btn.dataset.idx);
          const item = sgState.animationTypes[i];
          const ok = await askConfirm(`Bạn có muốn xóa loại Animation "${item?.code || ''}" khỏi Bảng 3 không?`, {
            title: '🗑 Xác nhận xóa Animation',
            confirmText: 'Xóa dòng này',
            danger: true
          });
          if (!ok) return;
          sgState.animationTypes.splice(i, 1);
          renderClassificationTables();
        });
      });
    }
  }

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
    if (!loaiStr) return ['', ''];
    const parts = String(loaiStr).split('+').map(s => s.trim()).filter(Boolean);
    return [parts[0] || '', parts[1] || ''];
  }

  function combineLoaiSource(p1, p2) {
    const a = (p1 || '').trim();
    const b = (p2 || '').trim();
    if (b && b !== a) return a ? `${a} + ${b}` : b;
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
  
  // --- Sự kiện cho Bảng 4: Sound nền (BGM) ---
  if (sgDom.btnEditBgm) {
    sgDom.btnEditBgm.addEventListener('click', () => {
      sgState.origBgmTypes = JSON.parse(JSON.stringify(sgState.bgmTypes));
      setBgmLocked(false);
    });
  }
  if (sgDom.btnCancelBgm) {
    sgDom.btnCancelBgm.addEventListener('click', async () => {
      const changed = JSON.stringify(sgState.bgmTypes) !== JSON.stringify(sgState.origBgmTypes);
      if (changed) {
        const ok = await askConfirm('Hủy thay đổi Bảng 4 (Sound nền)? Các sửa đổi sẽ mất.', { title: '⚠️ Hủy thay đổi Bảng 4' });
        if (!ok) return;
      }
      sgState.bgmTypes = JSON.parse(JSON.stringify(sgState.origBgmTypes));
      setBgmLocked(true);
      renderClassificationTables();
    });
  }
  if (sgDom.btnAddBgm) {
    sgDom.btnAddBgm.addEventListener('click', () => {
      sgState.bgmTypes.push({
        code: `bgm_moi_${sgState.bgmTypes.length + 1}`,
        label: 'Nhạc nền mới',
        param: '',
        description: ''
      });
      renderClassificationTables();
    });
  }
  if (sgDom.btnSaveBgm) {
    sgDom.btnSaveBgm.addEventListener('click', async () => {
      try {
        const ok = await askConfirm(
          `Bạn có muốn lưu Bảng 4 (${sgState.bgmTypes.length} loại Sound nền) vào hệ thống không?`,
          { title: '💾 Lưu Bảng 4: Sound nền' }
        );
        if (!ok) return;
        await persistAllClassificationTables();
        setBgmLocked(true);
        syncClassificationsEverywhere();
        sgLog(`✅ Đã lưu Bảng 4 (${sgState.bgmTypes.length} Sound nền) trên toàn hệ thống!`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu Bảng 4: ${err.message}`, 'error');
      }
    });
  }

  // --- Sự kiện cho Bảng 5: Sound Effect (SFX) ---
  if (sgDom.btnEditSfx) {
    sgDom.btnEditSfx.addEventListener('click', () => {
      sgState.origSfxTypes = JSON.parse(JSON.stringify(sgState.sfxTypes));
      setSfxLocked(false);
    });
  }
  if (sgDom.btnCancelSfx) {
    sgDom.btnCancelSfx.addEventListener('click', async () => {
      const changed = JSON.stringify(sgState.sfxTypes) !== JSON.stringify(sgState.origSfxTypes);
      if (changed) {
        const ok = await askConfirm('Hủy thay đổi Bảng 5 (Sound Effect)? Các sửa đổi sẽ mất.', { title: '⚠️ Hủy thay đổi Bảng 5' });
        if (!ok) return;
      }
      sgState.sfxTypes = JSON.parse(JSON.stringify(sgState.origSfxTypes));
      setSfxLocked(true);
      renderClassificationTables();
    });
  }
  if (sgDom.btnAddSfx) {
    sgDom.btnAddSfx.addEventListener('click', () => {
      sgState.sfxTypes.push({
        code: `sfx_moi_${sgState.sfxTypes.length + 1}`,
        label: 'SFX mới',
        param: '',
        description: ''
      });
      renderClassificationTables();
    });
  }
  if (sgDom.btnSaveSfx) {
    sgDom.btnSaveSfx.addEventListener('click', async () => {
      try {
        const ok = await askConfirm(
          `Bạn có muốn lưu Bảng 5 (${sgState.sfxTypes.length} loại Sound Effect) vào hệ thống không?`,
          { title: '💾 Lưu Bảng 5: Sound Effect' }
        );
        if (!ok) return;
        await persistAllClassificationTables();
        setSfxLocked(true);
        syncClassificationsEverywhere();
        sgLog(`✅ Đã lưu Bảng 5 (${sgState.sfxTypes.length} Sound Effect) trên toàn hệ thống!`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu Bảng 5: ${err.message}`, 'error');
      }
    });
  }

  // --- Sự kiện cho Filter Pills ---
  const filterBar = document.getElementById('sg-cls-filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const pill = e.target.closest('.sg-filter-pill');
      if (!pill) return;
      sgState.clsFilter = pill.dataset.filter || 'all';
      filterBar.querySelectorAll('.sg-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderClassificationTables();
    });
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

  function isUnanalyzed(row) {
    return !['complete', 'edited', 'manual'].includes(row.analysis_status);
  }

  function escapeSuggesterHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function saveAnalysis() {
    try {
      localStorage.setItem('sg_analysis', JSON.stringify({ csvPath: sgState.csvPath, rows: sgState.rows }));
    } catch (err) { sgLog(`Không lưu được phiên phân tích: ${err.message}`, 'warn'); }
  }

  function markRowEdited(index) {
    const row = sgState.rows[index];
    const complete = ['loai_source', 'element', 'anim', 'bgm', 'sfx'].every(key => Boolean(row[key]));
    row.analysis_status = complete ? 'edited' : 'pending';
    row.needs_review = !complete;
    row.confidence = complete ? 1 : null;
    saveAnalysis();
    renderTable();
  }

  function updateStats() {
    if (!sgDom.statTotal || !sgDom.statLow) return;
    const total = sgState.rows.length;
    const lowCount = sgState.rows.filter(r => r.needs_review || (typeof r.confidence === 'number' && r.confidence < 0.7)).length;
    sgDom.statTotal.textContent = total;
    sgDom.statLow.textContent = lowCount;
    const unresolved = sgState.rows.filter(isUnanalyzed).length;
    const progress = $('#sg-analysis-progress');
    if (progress) progress.textContent = `Đã phân tích: ${total - unresolved}/${total}`;
    if (sgDom.btnLearn) sgDom.btnLearn.disabled = sgState.isSuggesting || !sgState.rows.some(r => ['complete', 'edited'].includes(r.analysis_status) && !r.needs_review);
    if (sgDom.btnExport) sgDom.btnExport.disabled = sgState.isSuggesting || total === 0 || unresolved > 0;
  }

  function renderTable() {
    if (!sgDom.tbody) return;
    updateStats();

    if (!sgState.rows.length) {
      sgDom.tbody.innerHTML = `
        <tr>
          <td colspan="12" class="sg-empty-row">
            Chọn <code>1_CSV_Timeline.csv</code> ở phía trên để AI tự phân tích từng đoạn, câu và ý.
          </td>
        </tr>
      `;
      return;
    }

    sgDom.tbody.innerHTML = sgState.rows.map((r, idx) => {
      const [p1, p2] = splitLoaiSource(r.loai_source);
      const curEl = r.element || '';
      const curAnim = r.anim || '';
      const conf = typeof r.confidence === 'number' ? r.confidence : null;
      const isLow = r.needs_review || (conf !== null && conf < 0.7);
      const statusLabels = { pending: 'Chờ AI', analyzing: 'Đang phân tích', error: 'Cần chạy lại', manual: 'Làm thủ công', edited: 'Đã chỉnh sửa' };
      const confPct = statusLabels[r.analysis_status] || (conf !== null ? `${Math.round(conf * 100)}%` : 'Chờ AI');
      const confClass = conf === null ? 'sg-conf-mid' : (conf >= 0.8 ? 'sg-conf-high' : (conf >= 0.7 ? 'sg-conf-mid' : 'sg-conf-low'));
      const locLabel = [r.doan, r.cau, r.y].filter(Boolean).join('.');
      const safeText = String(r.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeThoiKy = String(r.thoi_ky || '').replace(/"/g, '&quot;');
      const safeNote = String(r.note || '').replace(/"/g, '&quot;');
      const safeReason = String(r.reason || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const validLoai = getValidLoaiList();
      const validElements = getValidElementsList();
      const validAnims = getValidAnimsList();

      const emptyOption = `<option value="">${r.analysis_status === 'manual' ? '— Làm thủ công —' : '— Chưa phân loại —'}</option>`;
      const opts1 = emptyOption + validLoai.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === p1 ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const opts2 = `<option value="">-- Không ghép --</option>` + validLoai.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === p2 ? 'selected' : ''}>+ ${o.label}</option>`
      ).join('');

      const comboOption = curEl.includes(' + ') ? `<option value="${escapeSuggesterHtml(curEl)}" selected>${escapeSuggesterHtml(curEl)}</option>` : '';
      const optsEl = emptyOption + comboOption + validElements.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === curEl ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const optsAnim = emptyOption + validAnims.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === curAnim ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const validBgms = getValidBgmsList();
      const validSfxs = getValidSfxsList();
      const curBgm = r.bgm || '';
      const curSfx = r.sfx || '';

      const optsBgm = emptyOption + validBgms.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === curBgm ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const optsSfx = emptyOption + validSfxs.map(o =>
        `<option value="${o.code}" title="${String(o.title || '').replace(/"/g, '&quot;')}" ${o.code === curSfx ? 'selected' : ''}>${o.label}</option>`
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
          <td style="text-align:center;">
            <input type="checkbox" class="sg-chk-si" data-idx="${idx}" ${r.si === 'yes' ? 'checked' : ''} title="Bật/Tắt tách người khỏi nền ảnh (Subject Isolation) cho câu này">
          </td>
          <td>
            <select class="sg-select sg-sel-anim" data-idx="${idx}">
              ${optsAnim}
            </select>
          </td>
          <td>
            <select class="sg-select sg-sel-bgm" data-idx="${idx}">
              ${optsBgm}
            </select>
          </td>
          <td>
            <select class="sg-select sg-sel-sfx" data-idx="${idx}">
              ${optsSfx}
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
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-p2').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        const p1El = sgDom.tbody.querySelector(`.sg-sel-p1[data-idx="${i}"]`);
        sgState.rows[i].loai_source = combineLoaiSource(p1El ? p1El.value : '', sel.value);
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-element').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].element = sel.value;
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-chk-si').forEach(chk => {
      chk.addEventListener('change', () => {
        const i = Number(chk.dataset.idx);
        sgState.rows[i].si = chk.checked ? 'yes' : '';
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-anim').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].anim = sel.value;
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-bgm').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].bgm = sel.value;
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-sel-sfx').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.idx);
        sgState.rows[i].sfx = sel.value;
        markRowEdited(i);
      });
    });

    sgDom.tbody.querySelectorAll('.sg-inp-thoiky').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.idx);
        sgState.rows[i].thoi_ky = inp.value;
        saveAnalysis();
      });
    });

    sgDom.tbody.querySelectorAll('.sg-inp-note').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.idx);
        sgState.rows[i].note = inp.value;
        saveAnalysis();
      });
    });
    sgDom.tbody.querySelectorAll('select, input').forEach(el => { el.disabled = sgState.isSuggesting; });
  }

  async function loadBackendState() {
    try {
      const res = await window.api.suggesterGetState();
      if (res && !res.error) {
        sgState.rulesPath = res.rules_path || '';
        sgState.examplesPath = res.examples_path || '';
        sgState.classificationsPath = res.classifications_path ||
          (sgState.rulesPath ? sgState.rulesPath.replace(/source_style_rules\.txt$/i, 'classifications.json') : '') ||
          (sgState.examplesPath ? sgState.examplesPath.replace(/source_examples\.json$/i, 'classifications.json') : '');
        if (sgDom.rulesFilepath && sgState.rulesPath) {
          sgDom.rulesFilepath.title = sgState.rulesPath;
          sgDom.rulesFilepath.textContent = `📄 ${sgState.rulesPath}`;
        }
        if (sgDom.examplesFilepath && sgState.examplesPath) {
          sgDom.examplesFilepath.title = sgState.examplesPath;
          sgDom.examplesFilepath.textContent = `📄 ${sgState.examplesPath}`;
        }
        if (sgDom.clsFilepath && sgState.classificationsPath) {
          sgDom.clsFilepath.title = sgState.classificationsPath;
          sgDom.clsFilepath.textContent = `📄 ${sgState.classificationsPath}`;
        }
        if (Array.isArray(res.source_types) && res.source_types.length > 0) {
          const localImgMap = Object.fromEntries(sgState.sourceTypes.filter(x => x.image && x.image !== '__none__').map(x => [x.code, x.image]));
          sgState.sourceTypes = res.source_types.map(x => ({
            ...x,
            image: x.image || localImgMap[x.code] || ''
          }));
        }
        if (Array.isArray(res.element_types) && res.element_types.length > 0) {
          const localElImgMap = Object.fromEntries(sgState.elementTypes.filter(x => x.image && x.image !== '__none__').map(x => [x.code, x.image]));
          sgState.elementTypes = mergeMissingDefaultElements(res.element_types.map(x => ({
            ...x,
            group: 'element',
            image: x.image || localElImgMap[x.code] || ''
          })));
        }
        if (Array.isArray(res.animation_types) && res.animation_types.length > 0) {
          // Tương thích cả bản mới (chỉ có anim) và bản cũ (gộp element + anim)
          const onlyAnims = res.animation_types.filter(x => !x.group || x.group === 'anim');
          const localAnimImgMap = Object.fromEntries(sgState.animationTypes.filter(x => x.image && x.image !== '__none__').map(x => [x.code, x.image]));
          if (onlyAnims.length > 0) {
            sgState.animationTypes = mergeMissingDefaultAnims(onlyAnims.map(x => ({
              ...x,
              group: 'anim',
              image: x.image || localAnimImgMap[x.code] || ''
            })));
          }
        }
        if (Array.isArray(res.bgm_types) && res.bgm_types.length > 0) {
          sgState.bgmTypes = res.bgm_types;
        }
        if (Array.isArray(res.sfx_types) && res.sfx_types.length > 0) {
          sgState.sfxTypes = res.sfx_types;
        }
        saveLocalClassifications(sgState.sourceTypes, sgState.elementTypes, sgState.animationTypes, sgState.bgmTypes, sgState.sfxTypes);
        if (sgDom.rulesInput) {
          sgState.rulesOriginalText = res.rules || '';
          sgDom.rulesInput.value = res.rules || '';
          updateRulesMeta(res.rules || '');
          setRulesLocked(true);
        }
        sgState.examples = res.examples || [];
        sgState.backendLoaded = true;
        renderExamples();
        setClsLocked(true, false);
        syncClassificationsEverywhere();
        await refreshAssetPreviews();
      }
    } catch (e) {
      // Backend có thể chưa sẵn sàng ngay lập tức
    }
  }

  async function loadCsvFile(csvPath, { autoAnalyze = false } = {}) {
    if (!csvPath || sgState.isSuggesting || sgState.isLoadingCsv) return;
    sgState.isLoadingCsv = true;
    if (sgDom.btnBrowseCsv) sgDom.btnBrowseCsv.disabled = true;
    if (sgDom.btnSuggest) sgDom.btnSuggest.disabled = true;
    try {
      const res = await window.api.suggesterLoadCsv({ csv_path: csvPath });
      if (res.error) throw new Error(res.error);
      sgState.csvPath = csvPath;
      localStorage.setItem('sg_timeline_csv', csvPath);
      if (sgDom.timelineCsv) sgDom.timelineCsv.value = csvPath;

      const defTk = sgDom.defaultThoiKy ? sgDom.defaultThoiKy.value.trim() : '';
      sgState.rows = (res.rows || []).map(r => ({
        ...r,
        loai_source: r.loai_source || '',
        element: r.element || '',
        anim: r.anim || '',
        bgm: r.bgm || '',
        sfx: r.sfx || '',
        si: r.si || '',
        thoi_ky: r.thoi_ky || defTk || '',
        confidence: null,
        analysis_status: 'pending',
        needs_review: false,
        reason: '',
        note: ''
      }));
      if (!autoAnalyze) {
        try {
          const saved = JSON.parse(localStorage.getItem('sg_analysis') || 'null');
          const signature = rows => JSON.stringify(rows.map(r => [r.doan, r.cau, r.y, r.start, r.text]));
          if (saved && saved.csvPath === csvPath && signature(saved.rows) === signature(sgState.rows)) {
            sgState.rows = saved.rows.map(r => ({ ...r, analysis_status: r.analysis_status === 'analyzing' ? 'pending' : r.analysis_status }));
          }
        } catch (err) { /* A stale cache never replaces the selected CSV. */ }
      }
      renderTable();
      saveAnalysis();
      sgLog(`Đã tải ${sgState.rows.length} câu thoại từ ${csvPath.split(/[\\/]/).pop()}`, 'success');
      if (autoAnalyze) await runSuggestions({ automatic: true });
    } catch (err) {
      sgLog(`Lỗi đọc CSV: ${err.message}`, 'error');
    } finally {
      sgState.isLoadingCsv = false;
      if (sgDom.btnBrowseCsv) sgDom.btnBrowseCsv.disabled = false;
      if (sgDom.btnSuggest) sgDom.btnSuggest.disabled = false;
    }
  }

  // Khôi phục giá trị đã lưu
  if (sgDom.defaultThoiKy && sgState.defaultThoiKy) {
    sgDom.defaultThoiKy.value = sgState.defaultThoiKy;
  }
  if (sgDom.timelineCsv && sgState.csvPath) {
    sgDom.timelineCsv.value = sgState.csvPath;
  }

  // Đảm bảo khóa mặc định & bố cục khi khởi tạo
  setRulesLocked(true);
  setClsLayoutHorizontal(sgState.clsHorizontal);
  setClsCollapsed(sgState.clsCollapsed);
  setClsLocked(true, false);
  syncClassificationsEverywhere();

  // --- Sự kiện cho 3 Bảng Phân loại Source · Lớp phủ Design · Animation ---
  if (sgDom.btnLayoutCls) {
    sgDom.btnLayoutCls.addEventListener('click', () => {
      setClsLayoutHorizontal(!sgState.clsHorizontal);
      if (sgState.clsCollapsed) setClsCollapsed(false);
    });
  }

  if (sgDom.btnToggleCls) {
    sgDom.btnToggleCls.addEventListener('click', () => {
      setClsCollapsed(!sgState.clsCollapsed);
    });
  }

  async function persistAllClassificationTables() {
    sgState.sourceTypes = sgState.sourceTypes
      .map(s => ({
        code: String(s.code || '').trim(),
        label: String(s.label || s.code || '').trim(),
        description: String(s.description || '').trim(),
        image: String(s.image || '').trim()
      }))
      .filter(s => s.code);

    sgState.elementTypes = sgState.elementTypes
      .map(e => ({
        code: String(e.code || '').trim(),
        group: 'element',
        label: String(e.label || e.code || '').trim(),
        param: String(e.param || '').trim(),
        description: String(e.description || '').trim(),
        image: String(e.image || '').trim()
      }))
      .filter(e => e.code);

    sgState.animationTypes = sgState.animationTypes
      .map(a => ({
        code: String(a.code || '').trim(),
        group: 'anim',
        label: String(a.label || a.code || '').trim(),
        param: String(a.param || '').trim(),
        description: String(a.description || '').trim(),
        image: String(a.image || '').trim()
      }))
      .filter(a => a.code);

    sgState.bgmTypes = sgState.bgmTypes
      .map(b => ({
        code: String(b.code || '').trim(),
        label: String(b.label || b.code || '').trim(),
        param: String(b.param || '').trim(),
        description: String(b.description || '').trim(),
        image: ''
      }))
      .filter(b => b.code);

    sgState.sfxTypes = sgState.sfxTypes
      .map(s => ({
        code: String(s.code || '').trim(),
        label: String(s.label || s.code || '').trim(),
        param: String(s.param || '').trim(),
        description: String(s.description || '').trim(),
        image: ''
      }))
      .filter(s => s.code);

    const srcImgMap = Object.fromEntries(sgState.sourceTypes.filter(x => x.image).map(x => [x.code, x.image]));
    const elImgMap = Object.fromEntries(sgState.elementTypes.filter(x => x.image).map(x => [x.code, x.image]));
    const animImgMap = Object.fromEntries(sgState.animationTypes.filter(x => x.image).map(x => [x.code, x.image]));

    saveLocalClassifications(sgState.sourceTypes, sgState.elementTypes, sgState.animationTypes, sgState.bgmTypes, sgState.sfxTypes);

    if (typeof window.api.suggesterSaveClassifications === 'function') {
      const res = await window.api.suggesterSaveClassifications({
        source_types: sgState.sourceTypes,
        element_types: sgState.elementTypes,
        animation_types: sgState.animationTypes,
        bgm_types: sgState.bgmTypes,
        sfx_types: sgState.sfxTypes
      });
      if (res && res.error) throw new Error(res.error);
      if (Array.isArray(res.source_types)) {
        sgState.sourceTypes = res.source_types.map(x => ({ ...x, image: x.image || srcImgMap[x.code] || '' }));
      }
      if (Array.isArray(res.element_types)) {
        sgState.elementTypes = res.element_types.map(x => ({ ...x, group: 'element', image: x.image || elImgMap[x.code] || '' }));
      }
      await refreshAssetPreviews();
      if (Array.isArray(res.animation_types)) {
        sgState.animationTypes = res.animation_types.map(x => ({ ...x, group: 'anim', image: x.image || animImgMap[x.code] || '' }));
      }
      if (Array.isArray(res.bgm_types)) sgState.bgmTypes = res.bgm_types;
      if (Array.isArray(res.sfx_types)) sgState.sfxTypes = res.sfx_types;
      saveLocalClassifications(sgState.sourceTypes, sgState.elementTypes, sgState.animationTypes, sgState.bgmTypes, sgState.sfxTypes);
    }
  }

  // --- Sự kiện File Input & Lightbox Phóng to Ảnh/Video ví dụ ---
  if (sgDom.clsFileInput) {
    sgDom.clsFileInput.addEventListener('change', () => {
      const file = sgDom.clsFileInput.files?.[0];
      if (file && pendingImgTarget) {
        applyImageFileToItem(pendingImgTarget.tbl, pendingImgTarget.idx, file);
      }
      pendingImgTarget = null;
    });
  }

  if (sgDom.modalClsImgClose) {
    sgDom.modalClsImgClose.addEventListener('click', closeClsImageModal);
  }
  if (sgDom.modalClsImg) {
    sgDom.modalClsImg.addEventListener('click', e => {
      if (e.target === sgDom.modalClsImg) closeClsImageModal();
    });
  }
  if (sgDom.modalClsImgPrev) {
    sgDom.modalClsImgPrev.addEventListener('click', () => {
      if (!activeLightbox) return;
      activeLightbox.idx -= 1;
      updateLightboxModalView();
    });
  }
  if (sgDom.modalClsImgNext) {
    sgDom.modalClsImgNext.addEventListener('click', () => {
      if (!activeLightbox) return;
      activeLightbox.idx += 1;
      updateLightboxModalView();
    });
  }
  if (sgDom.modalClsImgReplace) {
    sgDom.modalClsImgReplace.addEventListener('click', () => {
      if (!activeLightbox) return;
      triggerPickImageFor(activeLightbox.tbl, activeLightbox.idx);
    });
  }
  if (sgDom.modalClsImgRemove) {
    sgDom.modalClsImgRemove.addEventListener('click', async () => {
      if (!activeLightbox) return;
      const list = getListByTableKey(activeLightbox.tbl);
      const item = list?.[activeLightbox.idx];
      if (!item) return;
      const ok = await askConfirm(`Bạn có muốn xóa ảnh/video ví dụ của "${item.code}" không?`, {
        title: '🗑️ Xác nhận xóa ảnh / video ví dụ',
        confirmText: 'Xóa',
        danger: true
      });
      if (!ok) return;
      item.image = '__none__';
      const origList = getOrigListByTableKey(activeLightbox.tbl);
      if (origList && origList[activeLightbox.idx]) {
        origList[activeLightbox.idx].image = '__none__';
      }
      await persistAllClassificationTables();
      renderClassificationTables();
      updateLightboxModalView();
      sgLog(`Đã xóa ảnh/video ví dụ của "${item.code}".`, 'info');
    });
  }
  if (sgDom.modalClsImgStage) {
    sgDom.modalClsImgStage.addEventListener('dragover', e => {
      e.preventDefault();
      sgDom.modalClsImgStage.classList.add('drag-over');
    });
    sgDom.modalClsImgStage.addEventListener('dragleave', () => {
      sgDom.modalClsImgStage.classList.remove('drag-over');
    });
    sgDom.modalClsImgStage.addEventListener('drop', e => {
      e.preventDefault();
      sgDom.modalClsImgStage.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && activeLightbox) {
        applyImageFileToItem(activeLightbox.tbl, activeLightbox.idx, file);
      }
    });
  }

  // Hỗ trợ phím mũi tên ← / →, Esc và Ctrl+V dán ảnh từ Clipboard khi đang mở Lightbox
  window.addEventListener('keydown', e => {
    if (!activeLightbox || !sgDom.modalClsImg || sgDom.modalClsImg.style.display === 'none') return;
    if (e.key === 'Escape') {
      closeClsImageModal();
    } else if (e.key === 'ArrowLeft') {
      activeLightbox.idx -= 1;
      updateLightboxModalView();
    } else if (e.key === 'ArrowRight') {
      activeLightbox.idx += 1;
      updateLightboxModalView();
    }
  });

  window.addEventListener('paste', e => {
    if (!activeLightbox || !sgDom.modalClsImg || sgDom.modalClsImg.style.display === 'none') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const clipItem of items) {
      if (clipItem.type && clipItem.type.startsWith('image/')) {
        const file = clipItem.getAsFile();
        if (file) {
          e.preventDefault();
          applyImageFileToItem(activeLightbox.tbl, activeLightbox.idx, file);
          break;
        }
      }
    }
  });

  // --- GÓC 1: Bảng 1 (Phân loại Source) ---
  if (sgDom.btnEditSrc) {
    sgDom.btnEditSrc.addEventListener('click', () => {
      sgState.origSourceTypes = JSON.parse(JSON.stringify(sgState.sourceTypes));
      setSrcLocked(false);
    });
  }

  if (sgDom.btnCancelSrc) {
    sgDom.btnCancelSrc.addEventListener('click', async () => {
      const changed = JSON.stringify(sgState.sourceTypes) !== JSON.stringify(sgState.origSourceTypes);
      if (changed) {
        const ok = await askConfirm('Bạn đang có thay đổi chưa lưu trong Bảng 1 (Phân loại Source).\nBạn có chắc muốn hủy các thay đổi này không?', {
          title: '✖ Xác nhận hủy chỉnh sửa Bảng 1 (Source)',
          confirmText: 'Hủy thay đổi',
          cancelText: 'Tiếp tục sửa',
          danger: true
        });
        if (!ok) return;
      }
      sgState.sourceTypes = JSON.parse(JSON.stringify(sgState.origSourceTypes));
      setSrcLocked(true);
      syncClassificationsEverywhere();
      sgLog('Đã hủy chỉnh sửa Bảng 1 (Source) và khóa lại.', 'info');
    });
  }

  if (sgDom.btnAddSource) {
    sgDom.btnAddSource.addEventListener('click', () => {
      sgState.sourceTypes.push({
        code: `source_moi_${sgState.sourceTypes.length + 1}`,
        label: 'Loại Source mới',
        description: 'Mô tả khi nào dùng loại Source này...'
      });
      renderClassificationTables();
      const wrap = sgDom.clsSourceTbody?.closest('.sg-cls-table-wrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    });
  }

  if (sgDom.btnSaveSrc) {
    sgDom.btnSaveSrc.addEventListener('click', async () => {
      const ok = await askConfirm(
        `Bạn có muốn lưu Bảng 1 (${sgState.sourceTypes.length} loại Source) vào hệ thống không?\nToàn bộ AI, Dropdown và các Tool sẽ cập nhật ngay lập tức.`,
        {
          title: '💾 Xác nhận lưu Bảng 1: Phân loại Source',
          confirmText: 'Lưu & Áp dụng ngay'
        }
      );
      if (!ok) return;

      try {
        await persistAllClassificationTables();
        setSrcLocked(true);
        syncClassificationsEverywhere();
        sgLog(`✅ Đã lưu và đồng bộ Bảng 1 (${sgState.sourceTypes.length} loại Source) trên toàn hệ thống!`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu Bảng 1: ${err.message}`, 'error');
      }
    });
  }

  // --- GÓC 2: Bảng 2 (Lớp phủ Design — Element) ---
  if (sgDom.btnEditEl) {
    sgDom.btnEditEl.addEventListener('click', () => {
      sgState.origElementTypes = JSON.parse(JSON.stringify(sgState.elementTypes));
      setElLocked(false);
    });
  }

  if (sgDom.btnCancelEl) {
    sgDom.btnCancelEl.addEventListener('click', async () => {
      const changed = JSON.stringify(sgState.elementTypes) !== JSON.stringify(sgState.origElementTypes);
      if (changed) {
        const ok = await askConfirm('Bạn đang có thay đổi chưa lưu trong Bảng 2 (Lớp phủ Design).\nBạn có chắc muốn hủy các thay đổi này không?', {
          title: '✖ Xác nhận hủy chỉnh sửa Bảng 2 (Lớp phủ Design)',
          confirmText: 'Hủy thay đổi',
          cancelText: 'Tiếp tục sửa',
          danger: true
        });
        if (!ok) return;
      }
      sgState.elementTypes = JSON.parse(JSON.stringify(sgState.origElementTypes));
      setElLocked(true);
      syncClassificationsEverywhere();
      sgLog('Đã hủy chỉnh sửa Bảng 2 (Lớp phủ Design) và khóa lại.', 'info');
    });
  }

  if (sgDom.btnAddEl) {
    sgDom.btnAddEl.addEventListener('click', () => {
      sgState.elementTypes.push({
        code: `lop_phu_moi_${sgState.elementTypes.length + 1}`,
        group: 'element',
        label: '🖼️ Lớp phủ mới',
        param: 'ten_file.png',
        description: 'Mô tả khi nào dùng lớp phủ khung/texture này...'
      });
      renderClassificationTables();
      const wrap = sgDom.clsElTbody?.closest('.sg-cls-table-wrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    });
  }

  if (sgDom.btnSaveEl) {
    sgDom.btnSaveEl.addEventListener('click', async () => {
      const ok = await askConfirm(
        `Bạn có muốn lưu Bảng 2 (${sgState.elementTypes.length} Lớp phủ Design) vào hệ thống không?\nToàn bộ AI, Dropdown, element_map.json và các Tool sẽ cập nhật ngay lập tức.`,
        {
          title: '💾 Xác nhận lưu Bảng 2: Lớp phủ Design',
          confirmText: 'Lưu & Áp dụng ngay'
        }
      );
      if (!ok) return;

      try {
        await persistAllClassificationTables();
        setElLocked(true);
        syncClassificationsEverywhere();
        sgLog(`✅ Đã lưu và đồng bộ Bảng 2 (${sgState.elementTypes.length} Lớp phủ Design) trên toàn hệ thống!`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu Bảng 2: ${err.message}`, 'error');
      }
    });
  }

  // --- GÓC 3: Bảng 3 (Phân loại Animation — Chuyển động) ---
  if (sgDom.btnEditAnim) {
    sgDom.btnEditAnim.addEventListener('click', () => {
      sgState.origAnimationTypes = JSON.parse(JSON.stringify(sgState.animationTypes));
      setAnimLocked(false);
    });
  }

  if (sgDom.btnCancelAnim) {
    sgDom.btnCancelAnim.addEventListener('click', async () => {
      const changed = JSON.stringify(sgState.animationTypes) !== JSON.stringify(sgState.origAnimationTypes);
      if (changed) {
        const ok = await askConfirm('Bạn đang có thay đổi chưa lưu trong Bảng 3 (Phân loại Animation).\nBạn có chắc muốn hủy các thay đổi này không?', {
          title: '✖ Xác nhận hủy chỉnh sửa Bảng 3 (Animation)',
          confirmText: 'Hủy thay đổi',
          cancelText: 'Tiếp tục sửa',
          danger: true
        });
        if (!ok) return;
      }
      sgState.animationTypes = JSON.parse(JSON.stringify(sgState.origAnimationTypes));
      setAnimLocked(true);
      syncClassificationsEverywhere();
      sgLog('Đã hủy chỉnh sửa Bảng 3 (Animation) và khóa lại.', 'info');
    });
  }

  if (sgDom.btnAddAnim) {
    sgDom.btnAddAnim.addEventListener('click', () => {
      sgState.animationTypes.push({
        code: `anim_moi_${sgState.animationTypes.length + 1}`,
        group: 'anim',
        label: '🎬 Chuyển động mới',
        param: '100->110',
        description: 'Mô tả khi nào dùng chuyển động này...'
      });
      renderClassificationTables();
      const wrap = sgDom.clsAnimTbody?.closest('.sg-cls-table-wrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    });
  }

  if (sgDom.btnSaveAnim) {
    sgDom.btnSaveAnim.addEventListener('click', async () => {
      const ok = await askConfirm(
        `Bạn có muốn lưu Bảng 3 (${sgState.animationTypes.length} loại Animation) vào hệ thống không?\nToàn bộ AI, Dropdown và các Tool sẽ cập nhật ngay lập tức.`,
        {
          title: '💾 Xác nhận lưu Bảng 3: Phân loại Animation',
          confirmText: 'Lưu & Áp dụng ngay'
        }
      );
      if (!ok) return;

      try {
        await persistAllClassificationTables();
        setAnimLocked(true);
        syncClassificationsEverywhere();
        sgLog(`✅ Đã lưu và đồng bộ Bảng 3 (${sgState.animationTypes.length} loại Animation) trên toàn hệ thống!`, 'success');
      } catch (err) {
        sgLog(`Lỗi lưu Bảng 3: ${err.message}`, 'error');
      }
    });
  }

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
      await loadCsvFile(filePath, { autoAnalyze: true });
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
      saveAnalysis();
      sgLog(`Đã điền Thời kỳ "${firstVal}" cho ${filled} dòng trống.`, 'info');
    });
  }

  // Analyze bounded groups while retaining the entire script as context.
  async function runSuggestions({ automatic = false } = {}) {
      if (sgState.isSuggesting) return;
      if (!sgState.rows.length) {
        sgLog('Vui lòng chọn file 1_CSV_Timeline.csv trước!', 'error');
        return;
      }

      const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) || (state.settings && state.settings.geminiApiKey) || '';
      if (!apiKey) {
        sgLog('Chưa có Gemini API Key! Vui lòng vào tab Cài đặt để nhập API Key.', 'error');
        return;
      }

      let indices = sgState.rows.flatMap((r, i) => isUnanalyzed(r) ? [i] : []);
      if (!indices.length && !automatic) {
        const ok = await askConfirm('Bảng hiện tại đã có kết quả gợi ý hoặc chỉnh sửa.\nChạy lại AI sẽ ghi đè dữ liệu trên bảng, bạn có muốn tiếp tục không?', {
          title: '🤖 Xác nhận chạy lại AI Gợi ý',
          confirmText: 'Tiếp tục chạy'
        });
        if (!ok) return;
        indices = sgState.rows.map((_, i) => i);
      }
      if (!indices.length) return;

      sgState.isSuggesting = true;
      sgDom.btnSuggest.disabled = true;
      if (sgDom.btnBrowseCsv) sgDom.btnBrowseCsv.disabled = true;
      if (sgDom.btnFillThoiKy) sgDom.btnFillThoiKy.disabled = true;
      if (sgDom.btnSuggestText) sgDom.btnSuggestText.textContent = '⏳ AI đang phân tích theo phong cách của bạn...';
      sgLog(`Đang gửi ${sgState.rows.length} câu thoại cho Gemini (kèm ${sgState.examples.length} mẫu ví dụ)...`, 'info');

      try {
        if (!sgState.backendLoaded) await loadBackendState();
        if (!sgState.backendLoaded) throw new Error('Chưa tải được bảng phân loại và quy tắc. Kiểm tra kết nối backend rồi chạy lại.');
        const rulesText = sgDom.rulesInput ? sgDom.rulesInput.value : '';
        const defTk = sgDom.defaultThoiKy ? sgDom.defaultThoiKy.value.trim() : '';
        const contextRows = sgState.rows.map(({ doan, cau, y, start, text }) => ({ doan, cau, y, start, text }));
        for (const i of indices) {
          Object.assign(sgState.rows[i], { loai_source: '', element: '', anim: '', bgm: '', sfx: '', si: '',
            confidence: null, reason: '', needs_review: false, analysis_status: 'pending' });
        }
        for (let offset = 0; offset < indices.length; offset += 32) {
          const batchIndices = indices.slice(offset, offset + 32);
          for (const i of batchIndices) sgState.rows[i].analysis_status = 'analyzing';
          renderTable();
          if (sgDom.btnSuggestText) sgDom.btnSuggestText.textContent = `⏳ AI đang phân tích ${offset + 1}–${offset + batchIndices.length}/${indices.length} câu, ý...`;
          const res = await window.api.suggesterSuggest({
            rows: batchIndices.map(i => sgState.rows[i]),
            context_rows: contextRows,
            previous_rows: sgState.rows.slice(Math.max(0, batchIndices[0] - 4), batchIndices[0]),
            csv_path: sgState.csvPath, api_key: apiKey, default_thoi_ky: defTk, rules: rulesText
          });
          if (res.error) throw new Error(res.error);
          if (!Array.isArray(res.rows) || res.rows.length !== batchIndices.length ||
              res.rows.some((r, i) => r.row_index !== i || r.text !== sgState.rows[batchIndices[i]].text)) {
            throw new Error('AI trả thiếu dòng hoặc sai thứ tự; giữ trống các dòng chưa có kết quả.');
          }
          res.rows.forEach((r, localIndex) => {
            const i = batchIndices[localIndex];
            sgState.rows[i] = { ...sgState.rows[i], ...r, row_index: i };
          });
          saveAnalysis();
          renderTable();
          sgLog(`Đã xử lý ${offset + batchIndices.length}/${indices.length} câu, ý.`, 'info');
        }
        const unresolved = sgState.rows.filter(isUnanalyzed).length;
        const manual = sgState.rows.filter(r => r.analysis_status === 'manual').length;
        sgLog(unresolved ? `Còn ${unresolved} dòng chưa có kết quả hợp lệ. Bấm AI để chạy tiếp các dòng này.` :
          `Đã phân tích đủ ${sgState.rows.length} câu, ý; ${manual} dòng cần làm thủ công được để trống và tô vàng.`, unresolved ? 'warn' : 'success');
      } catch (err) {
        sgState.rows.forEach(r => {
          if (['pending', 'analyzing'].includes(r.analysis_status)) {
            Object.assign(r, { analysis_status: 'error', needs_review: true, confidence: null,
              reason: `Chưa có kết quả AI: ${err.message}` });
          }
        });
        sgLog(`Lỗi AI gợi ý: ${err.message}`, 'error');
      } finally {
        sgState.isSuggesting = false;
        sgDom.btnSuggest.disabled = false;
        if (sgDom.btnBrowseCsv) sgDom.btnBrowseCsv.disabled = false;
        if (sgDom.btnFillThoiKy) sgDom.btnFillThoiKy.disabled = false;
        if (sgDom.btnSuggestText) sgDom.btnSuggestText.textContent = sgState.rows.some(isUnanalyzed) ?
          '🤖 Phân tích các câu, ý chưa hoàn tất' : '🤖 Phân tích lại theo quy tắc hiện tại';
        saveAnalysis();
        renderTable();
      }
  }

  if (sgDom.btnSuggest) {
    sgDom.btnSuggest.addEventListener('click', () => runSuggestions());
  }

  // Bấm nút Lưu vào Kho ví dụ (Dạy AI)
  if (sgDom.btnLearn) {
    sgDom.btnLearn.addEventListener('click', async () => {
      if (sgState.isSuggesting) return;
      const learnRows = sgState.rows.filter(r => ['complete', 'edited'].includes(r.analysis_status) && !r.needs_review);
      if (!learnRows.length) return;
      const ok = await askConfirm(`Bạn có muốn lưu ${learnRows.length} câu đã phân loại vào Kho ví dụ (source_examples.json) để dạy AI không?`, {
        title: '🧠 Xác nhận lưu vào Kho ví dụ',
        confirmText: 'Có, lưu để dạy AI'
      });
      if (!ok) return;

      const apiKey = (dom.settingApiKey && dom.settingApiKey.value.trim()) || (state.settings && state.settings.geminiApiKey) || '';
      sgDom.btnLearn.disabled = true;
      sgLog(`Đang lưu ${learnRows.length} câu vào kho ví dụ và tạo vector Gemini Embedding...`, 'info');
      try {
        const res = await window.api.suggesterSaveExamples({
          items: learnRows,
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
      if (!sgState.rows.length || sgState.isSuggesting || sgState.rows.some(isUnanalyzed)) return;
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
      if (sgState.csvPath && !sgState.rows.length && !sgState.isSuggesting) {
        await loadCsvFile(sgState.csvPath);
      }
    } else {
      sgLog('Backend Python chưa chạy nên chưa tải được preview. Hãy xem nhật ký lỗi Python ở tab Tạo mới.', 'error');
    }
  });

  // Wait for the health-checked backend-ready event before making API calls.
  if (state.backendReady) {
    loadBackendState().then(() => {
      if (sgState.csvPath && !sgState.rows.length) return loadCsvFile(sgState.csvPath);
    });
  }
}

// ============================================================
// SPLIT RESIZER — Kéo rộng (ngang), kéo dài (dọc) & kéo cột bảng cho toàn Project
// ============================================================

function initSplitResizers() {
  // 1. Horizontal Resizers (.split-resizer) — cho cả 2 cột lớn & các container nhỏ bên trong
  const resizers = $$('.split-resizer');
  resizers.forEach(resizer => {
    const container = resizer.parentElement;
    const leftPane = resizer.previousElementSibling;
    const tabKey = resizer.dataset.tabKey || 'default';
    if (!container || !leftPane) return;

    const isInner = resizer.classList.contains('inner-split-resizer');
    const minW = parseInt(resizer.dataset.minW, 10) || (isInner ? 190 : 240);
    const storageKey = `split_w_${tabKey}`;
    const savedVal = localStorage.getItem(storageKey);

    if (savedVal) {
      if (isInner && savedVal.endsWith('%')) {
        leftPane.style.setProperty('--left-w', savedVal);
      } else {
        const savedPx = parseInt(savedVal, 10);
        if (!Number.isNaN(savedPx) && savedPx >= minW) {
          leftPane.style.setProperty('--left-w', `${savedPx}px`);
        }
      }
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
      if (containerWidth <= 0) return;
      const rightMin = isInner ? minW : 260;
      const maxW = Math.max(minW, Math.min(containerWidth * 0.82, containerWidth - rightMin));
      const newW = Math.round(Math.min(maxW, Math.max(minW, startWidth + (e.clientX - startX))));
      if (isInner) {
        const pct = Math.min(80, Math.max(18, (newW / containerWidth) * 100)).toFixed(1) + '%';
        leftPane.style.setProperty('--left-w', pct);
      } else {
        leftPane.style.setProperty('--left-w', `${newW}px`);
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('active');
      document.body.classList.remove('is-resizing');
      const currentVal = leftPane.style.getPropertyValue('--left-w');
      if (currentVal) {
        localStorage.setItem(storageKey, currentVal);
      }
    });

    // Nhấp đúp để đặt lại kích thước mặc định
    resizer.addEventListener('dblclick', () => {
      leftPane.style.removeProperty('--left-w');
      localStorage.removeItem(storageKey);
    });
  });

  // 2. Vertical Resizers (.v-split-resizer) — Kéo dài / thu gọn chiều cao các container nhỏ
  const vResizers = $$('.v-split-resizer');
  vResizers.forEach(vResizer => {
    const targetSel = vResizer.dataset.target;
    const targetEl = targetSel ? $(targetSel) : vResizer.previousElementSibling;
    const vKey = vResizer.dataset.vkey || 'default';
    if (!targetEl) return;

    const minH = parseInt(vResizer.dataset.minH, 10) || 80;
    const maxH = parseInt(vResizer.dataset.maxH, 10) || 650;
    const storageKey = `vsplit_h_${vKey}`;

    function applyHeight(hPx) {
      targetEl.style.setProperty('--box-h', `${hPx}px`);
      targetEl.style.height = `${hPx}px`;
      targetEl.style.maxHeight = `${hPx}px`;
    }

    function resetHeight() {
      targetEl.style.removeProperty('--box-h');
      targetEl.style.removeProperty('height');
      targetEl.style.removeProperty('max-height');
    }

    const savedH = parseInt(localStorage.getItem(storageKey), 10);
    if (!Number.isNaN(savedH) && savedH >= minH && savedH <= maxH) {
      applyHeight(savedH);
    }

    let isDraggingV = false;
    let startY = 0;
    let startHeight = 0;

    vResizer.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      // Nếu phần tử mục tiêu đang ẩn (vd: log đang đóng), tự động mở ra để kéo
      if (getComputedStyle(targetEl).display === 'none') {
        targetEl.style.display = 'block';
      }
      isDraggingV = true;
      startY = e.clientY;
      startHeight = targetEl.getBoundingClientRect().height;
      vResizer.classList.add('active');
      document.body.classList.add('is-resizing-v');
    });

    window.addEventListener('mousemove', e => {
      if (!isDraggingV) return;
      const newH = Math.round(Math.min(maxH, Math.max(minH, startHeight + (e.clientY - startY))));
      applyHeight(newH);
    });

    window.addEventListener('mouseup', () => {
      if (!isDraggingV) return;
      isDraggingV = false;
      vResizer.classList.remove('active');
      document.body.classList.remove('is-resizing-v');
      const finalH = Math.round(targetEl.getBoundingClientRect().height);
      if (finalH >= minH) {
        localStorage.setItem(storageKey, String(finalH));
      }
    });

    // Nhấp đúp để đặt lại chiều cao mặc định
    vResizer.addEventListener('dblclick', () => {
      resetHeight();
      localStorage.removeItem(storageKey);
    });
  });

  // 3. Table Column Resizers (.th-col-resizer) — Cho phép kéo rộng từng cột trong mọi bảng
  const tables = $$('.sg-cls-table, .sg-table, .sp-catalog-table, .rules-table');
  tables.forEach((table, tIdx) => {
    const ths = table.querySelectorAll('thead th');
    ths.forEach((th, cIdx) => {
      if (th.classList.contains('sg-cls-col-del')) return;
      if (th.querySelector('.th-col-resizer')) return;

      const colKey = `col_w_${table.id || tIdx}_${cIdx}`;
      const savedColW = parseInt(localStorage.getItem(colKey), 10);
      if (!Number.isNaN(savedColW) && savedColW >= 48) {
        th.style.width = `${savedColW}px`;
        th.style.minWidth = `${savedColW}px`;
      }

      const handle = document.createElement('div');
      handle.className = 'th-col-resizer';
      handle.title = 'Kéo để chỉnh độ rộng cột (Nhấp đúp để đặt lại)';
      th.appendChild(handle);

      let isDraggingCol = false;
      let startX = 0;
      let startW = 0;

      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingCol = true;
        startX = e.clientX;
        startW = th.getBoundingClientRect().width;
        handle.classList.add('active');
        document.body.classList.add('is-resizing');
      });

      window.addEventListener('mousemove', e => {
        if (!isDraggingCol) return;
        const newW = Math.max(48, Math.round(startW + (e.clientX - startX)));
        th.style.width = `${newW}px`;
        th.style.minWidth = `${newW}px`;
      });

      window.addEventListener('mouseup', () => {
        if (!isDraggingCol) return;
        isDraggingCol = false;
        handle.classList.remove('active');
        document.body.classList.remove('is-resizing');
        const finalW = Math.round(th.getBoundingClientRect().width);
        localStorage.setItem(colKey, String(finalW));
      });

      handle.addEventListener('dblclick', e => {
        e.stopPropagation();
        th.style.removeProperty('width');
        th.style.removeProperty('min-width');
        localStorage.removeItem(colKey);
      });
    });
  });
}

// Khởi chạy ứng dụng ở dòng cuối cùng sau khi mọi const & function đã được khai báo
init();
