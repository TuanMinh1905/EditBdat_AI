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
  btnClose: $('#btn-close')
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
  switch(type) {
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
        prompt: dom.promptInput.value
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
  dom.btnGenerate.disabled = !hasMedia || !hasPrompt || state.isGenerating || !state.backendReady;
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
async function generateProject() {
  if (state.isGenerating) return;

  const prompt = dom.promptInput.value.trim();
  if (!prompt || state.mediaFiles.length === 0) return;

  state.isGenerating = true;
  dom.btnGenerateContent.style.display = 'none';
  dom.btnGenerateLoading.style.display = 'flex';
  dom.btnGenerate.disabled = true;

  showProgress();
  addLog('Bắt đầu tạo project...', 'info');

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
        outputDir: settings.outputDir,
        compWidth: settings.compWidth || 1920,
        compHeight: settings.compHeight || 1080,
        compFps: settings.compFps || 30
      }
    });

    if (result.error) {
      throw new Error(result.error);
    }

    // Update progress based on result steps
    if (result.step === 'ai_done' || result.timeline) {
      setStep('ai', 'done');
      setProgress(50);
      addLog('AI đã sinh timeline', 'success');
    }

    if (result.step === 'validated' || result.validated) {
      setStep('validate', 'done');
      setProgress(60);
      addLog('Timeline hợp lệ', 'success');
    }

    if (result.step === 'jsx_done' || result.jsx_path) {
      setStep('jsx', 'done');
      setProgress(75);
      addLog(`Script JSX đã tạo: ${result.jsx_path}`, 'success');
    }

    if (result.step === 'ae_done' || result.aep_path) {
      setStep('ae', 'done');
      setProgress(100);
      addLog(`Project .aep đã tạo: ${result.aep_path}`, 'success');
    }

    // Ensure all steps are marked done
    setStep('ai', 'done');
    setStep('validate', 'done');
    setStep('jsx', 'done');
    setStep('ae', 'done');
    setProgress(100);

    // Show output
    showOutput(result.aep_path, result.output_dir, true);

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

function showOutput(aepPath, outputDir, success, errorMsg) {
  dom.outputSection.style.display = 'block';
  const card = dom.outputCard;

  if (success) {
    card.className = 'output-card success';
    card.querySelector('.output-icon').textContent = '✅';
    card.querySelector('h3').textContent = 'Project đã tạo thành công!';
    dom.outputPath.textContent = aepPath || '';

    dom.btnOpenAep.onclick = () => {
      if (aepPath) window.api.openFile(aepPath);
    };
    dom.btnOpenFolder.onclick = () => {
      if (outputDir) window.api.openOutputFolder(outputDir);
    };
    dom.btnOpenAep.style.display = aepPath ? 'inline-flex' : 'none';
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

  // Generate
  dom.btnGenerate.addEventListener('click', generateProject);

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
  await loadSettings();
  await loadSession();
  addLog('Ứng dụng đã sẵn sàng. Hãy thêm media files và nhập prompt.', 'info');
}

init();
