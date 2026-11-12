const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, shell } = electron;
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Suppress GPU cache errors on Windows (guard in case running outside Electron context)
if (app && app.commandLine) {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('disk-cache-size', '0');
}

let mainWindow;
let pythonProcess = null;
const PYTHON_PORT = 5599;
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SESSION_PATH = path.join(app.getPath('userData'), 'session.json');

// --- Settings ---
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {
    geminiApiKey: '',
    afterEffectsPath: 'C:\\Program Files\\Adobe\\Adobe After Effects 2021\\Support Files\\AfterFX.exe',
    outputDir: 'C:\\\\Users\\\\GP\\\\Desktop\\\\Edit Bdat\\\\Video Demo\\\\Demo1\\\\Official',
    compWidth: 1920,
    compHeight: 1080,
    compFps: 30
  };
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// --- Python Backend ---
function startPython() {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'python', 'main.py');

    const localPython = path.join(__dirname, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const pythonCmd = fs.existsSync(localPython)
      ? localPython : (process.platform === 'win32' ? 'python' : 'python3');
    console.log('[Python] Interpreter:', pythonCmd);

    const child = spawn(pythonCmd, [pythonScript, '--port', String(PYTHON_PORT)], {
      cwd: __dirname,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    pythonProcess = child;

    let started = false;
    let settled = false;
    let readyOutput = '';
    let stderrTail = '';
    let stderrPending = '';
    child.stderr.setEncoding?.('utf8');
    let pollTimer;
    let healthRequest;
    const startupTimer = setTimeout(() => {
      fail(new Error('Python chưa mở được cổng 5599 sau 30 giây. ' + stderrTail.trim()));
      child.kill();
    }, 30000);

    function cleanup() {
      clearTimeout(startupTimer);
      clearTimeout(pollTimer);
      if (healthRequest) healthRequest.destroy();
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function checkHealth() {
      if (settled) return;
      let retried = false;
      const retry = () => {
        if (!settled && !retried) {
          retried = true;
          pollTimer = setTimeout(checkHealth, 250);
        }
      };
      healthRequest = http.get({ hostname: '127.0.0.1', port: PYTHON_PORT,
        path: '/api/health', timeout: 1000 }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('error', retry);
        response.on('end', () => {
          if (settled) return;
          try {
            if (response.statusCode !== 200 || JSON.parse(body).status !== 'ok') return retry();
            started = true;
            settled = true;
            cleanup();
            resolve();
          } catch (_) { retry(); }
        });
      });
      healthRequest.on('error', retry);
      healthRequest.on('timeout', () => { healthRequest.destroy(); retry(); });
    }

    child.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Python]', msg);
      readyOutput = (readyOutput + msg).slice(-512);
      if (!settled && !healthRequest && readyOutput.includes('Server ready')) {
        checkHealth();
      }
      // Forward to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-log', msg);
      }
    });

    function forwardStderrLine(line) {
      if (!line.trim()) return;
      const warning = /^\s*WARN(?:ING)?[:\s]/.test(line)
        || /\b(?:DeprecationWarning|UserWarning|FutureWarning|RuntimeWarning):/.test(line);
      const info = /^\s*(?:INFO|DEBUG)[:\s]/.test(line);
      const channel = warning ? 'python-warning' : info ? 'python-log' : 'python-error';
      if (warning) console.warn('[Python Warning]', line);
      else if (info) console.log('[Python]', line);
      else console.error('[Python Error]', line);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, line);
    }

    child.stderr.on('data', (data) => {
      const msg = data.toString();
      stderrTail = (stderrTail + msg).slice(-2000);
      const lines = (stderrPending + msg).split(/\r?\n/);
      stderrPending = lines.pop();
      lines.forEach(forwardStderrLine);
    });

    child.on('error', error => {
      fail(new Error(`Không khởi động được Python (${pythonCmd}): ${error.message}`));
    });

    child.on('close', (code) => {
      forwardStderrLine(stderrPending);
      stderrPending = '';
      console.log(`[Python] Process exited with code ${code}`);
      if (pythonProcess === child) pythonProcess = null;
      if (!started) {
        fail(new Error(`Python thoát với mã ${code}. ${stderrTail.trim()}`));
      } else {
        backendStatus = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-ready', false);
          mainWindow.webContents.send('python-error', `Backend Python đã dừng (mã ${code}). ${stderrTail.trim()}`);
        }
      }
    });
  });
}

function stopPython() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}

// --- HTTP helper to call Python backend ---
function callPython(endpoint, data, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    if (backendStatus !== true) {
      reject(new Error(backendStatus === false
        ? 'Backend Python chưa chạy. Hãy khởi động lại ứng dụng và xem nhật ký lỗi Python.'
        : 'Backend Python đang khởi động. Vui lòng chờ trạng thái Sẵn sàng.'));
      return;
    }
    const postData = JSON.stringify(data);
    const options = {
      hostname: '127.0.0.1',
      port: PYTHON_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: timeoutMs
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          // If Flask returned an error status with JSON error message
          if (res.statusCode >= 400 && parsed.error) {
            resolve({ error: parsed.error });
          } else {
            resolve(parsed);
          }
        } catch (e) {
          // Non-JSON response (e.g. Flask HTML error page)
          if (res.statusCode >= 500) {
            resolve({ error: `Server lỗi (${res.statusCode}). Kiểm tra log để biết chi tiết.` });
          } else {
            resolve({ error: `Phản hồi không hợp lệ từ backend (status ${res.statusCode})` });
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      const guidance = endpoint === '/api/source-suggester/suggest'
        ? ' Kết quả đã lưu được giữ; bạn có thể chạy tiếp.'
        : ' Kiểm tra nhật ký backend để biết chi tiết.';
      reject(new Error(`Backend chưa trả kết quả sau ${Math.round(timeoutMs / 1000)} giây.${guidance}`));
    });

    req.write(postData);
    req.end();
  });
}

// --- Window ---
let backendStatus = null; // null = starting, true = ready, false = failed

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 560,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'src', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    if (backendStatus !== null && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-ready', backendStatus);
    }
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// --- IPC Handlers ---
ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings);
  return { success: true };
});

// Session persistence (media files + prompt)
ipcMain.handle('get-session', () => {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { mediaFiles: [], prompt: '' };
});

ipcMain.handle('save-session', (event, session) => {
  try {
    const dir = path.dirname(SESSION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'psd'] },
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac'] },
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'psd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('browse-ae-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'After Effects', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: 'C:\\Program Files\\Adobe'
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('export-jsx-only', async (event, { mediaFiles, prompt, settings }) => {
  try {
    const result = await callPython('/api/export-jsx', {
      media_files: mediaFiles,
      prompt: prompt,
      settings: settings
    });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('get-timeline-preview', async (event, { mediaFiles, prompt, settings }) => {
  try {
    const result = await callPython('/api/preview-timeline', {
      media_files: mediaFiles,
      prompt: prompt,
      settings: settings
    });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('analyze-media', async (event, filePaths) => {
  try {
    const result = await callPython('/api/analyze', { files: filePaths });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('generate-project', async (event, { mediaFiles, prompt, settings }) => {
  try {
    const result = await callPython('/api/generate', {
      media_files: mediaFiles,
      prompt: prompt,
      settings: settings
    });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('open-output-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.handle('open-file', async (event, filePath) => {
  shell.openPath(filePath);
});

// --- Tool B: Clip Splitter ---
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mxf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('clip-splitter-parse-filename', async (event, params) => {
  try { return await callPython('/api/clip-splitter/parse-filename', params); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('clip-splitter-analyze', async (event, { video_path, threshold }) => {
  try {
    const result = await callPython('/api/clip-splitter/analyze', { video_path, threshold });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('clip-splitter-split', async (event, params) => {
  try {
    const result = await callPython('/api/clip-splitter/split', params);
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('clip-splitter-catalog', async (event, { catalog_path }) => {
  try {
    const result = await callPython('/api/clip-splitter/catalog', { catalog_path });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

// --- Tool A: Premiere XML Generator ---
ipcMain.handle('select-csv-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-srt-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle / Audio', extensions: ['srt', 'mp3', 'mp4', 'wav', 'aac'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-voice-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio/Video', extensions: ['mp3', 'mp4', 'wav', 'aac', 'flac', 'mov'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('verify-assets', async (event, params) => {
  try {
    return await callPython('/api/verify-assets', params);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('asset-previews', async (event, params) => {
  try {
    const result = await callPython('/api/asset-thumbnail', params);
    if (result.error) return result;
    return { ...result, items: result.items.map(item => ({
      ...item, url: item.url ? `http://127.0.0.1:${PYTHON_PORT}${item.url}` : ''
    })) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('premiere-generate-xml', async (event, params) => {
  try {
    const result = await callPython('/api/premiere/generate-xml', params);
    return result;
  } catch (e) {
    return { error: e.message };
  }
});

// Tool 1: Source Suggester (Gợi ý phân loại Source)
ipcMain.handle('save-csv-file', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || '2_CSV_PhanLoaiSource.csv',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('suggester-get-state', async () => {
  const rulesPath = path.join(__dirname, 'templates', 'source_style_rules.txt');
  const examplesPath = path.join(__dirname, 'templates', 'source_examples.json');
  const clsPath = path.join(__dirname, 'templates', 'classifications.json');
  try {
    const res = await callPython('/api/source-suggester/get-state', {});
    if (res && !res.error) {
      return {
        ...res,
        rules_path: res.rules_path || rulesPath,
        examples_path: res.examples_path || examplesPath,
        classifications_path: res.classifications_path || clsPath,
      };
    }
  } catch (e) {
    // Fallback doc truc tiep neu backend chua san sang
  }
  try {
    const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '';
    let examples = [];
    if (fs.existsSync(examplesPath)) {
      const raw = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));
      if (Array.isArray(raw)) {
        examples = raw.map((ex, idx) => ({
          id: ex.id || (idx + 1),
          text: ex.text || '',
          loai_source: ex.loai_source || '',
          element: ex.element || 'auto',
          anim: ex.anim || 'auto',
          thoi_ky: ex.thoi_ky || '',
          note: ex.note || '',
          has_embedding: Boolean(ex.embedding),
          created_at: ex.created_at || ''
        }));
      }
    }
    let sourceTypes = [];
    let elementTypes = [];
    let animationTypes = [];
    let bgmTypes = [];
    let sfxTypes = [];
    if (fs.existsSync(clsPath)) {
      const clsRaw = JSON.parse(fs.readFileSync(clsPath, 'utf-8'));
      sourceTypes = Array.isArray(clsRaw.source_types) ? clsRaw.source_types : [];
      elementTypes = Array.isArray(clsRaw.element_types) ? clsRaw.element_types : [];
      animationTypes = Array.isArray(clsRaw.animation_types) ? clsRaw.animation_types : [];
      bgmTypes = Array.isArray(clsRaw.bgm_types) ? clsRaw.bgm_types : [];
      sfxTypes = Array.isArray(clsRaw.sfx_types) ? clsRaw.sfx_types : [];
    }
    return {
      success: true,
      rules,
      examples,
      total_examples: examples.length,
      rules_path: rulesPath,
      examples_path: examplesPath,
      source_types: sourceTypes,
      element_types: elementTypes,
      animation_types: animationTypes,
      bgm_types: bgmTypes,
      sfx_types: sfxTypes,
      classifications_path: clsPath,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('suggester-save-classifications', async (event, params) => {
  const retired = new Set(['rai_1', 'rai_2_1', 'rai_2_2', 'rai_3', 'rai_4']);
  if (params?.source_types?.some(item => retired.has(String(item.code || '').trim().toLowerCase()))) {
    return { error: 'rai_1 là nhóm; hãy dùng rai_1_1, rai_1_2, rai_1_3 hoặc rai_2 theo cấu trúc mới.' };
  }
  const clsPath = path.join(__dirname, 'templates', 'classifications.json');
  const clsMediaDir = path.join(__dirname, 'templates', 'cls_media');
  try {
    const res = await callPython('/api/source-suggester/save-classifications', params || {});
    if (res && !res.error) return res;
  } catch (e) {
    // Fallback ghi truc tiep
  }
  try {
    if (!fs.existsSync(clsMediaDir)) fs.mkdirSync(clsMediaDir, { recursive: true });
    const persistMedia = (prefix, code, val) => {
      if (!val || typeof val !== 'string' || val === '__none__') return val || '';
      try {
        if (val.startsWith('data:video/') || val.startsWith('data:audio/')) {
          const parts = val.split(',');
          if (parts.length === 2) {
            const isAudio = val.startsWith('data:audio/');
            const mime = parts[0].split(';')[0].replace(isAudio ? 'data:audio/' : 'data:video/', '').trim().toLowerCase();
            const extMap = { mp4: '.mp4', webm: '.webm', quicktime: '.mov', ogg: '.ogv', mpeg: '.mp3', mp3: '.mp3', wav: '.wav', 'x-wav': '.wav', aac: '.aac', flac: '.flac' };
            const ext = extMap[mime] || (isAudio ? '.mp3' : '.mp4');
            const outPath = path.join(clsMediaDir, `${prefix}_${code}${ext}`);
            fs.writeFileSync(outPath, Buffer.from(parts[1], 'base64'));
            const urlPath = outPath.replace(/\\/g, '/').split('/').map(s => s.includes(':') ? s : encodeURIComponent(s)).join('/');
            return `file:///${urlPath}?v=${Date.now()}`;
          }
        }
      } catch (_) { /* ignore */ }
      return val;
    };

    let current = { source_types: [], element_types: [], animation_types: [], bgm_types: [], sfx_types: [] };
    if (fs.existsSync(clsPath)) {
      current = JSON.parse(fs.readFileSync(clsPath, 'utf-8'));
    }
    if (params && Array.isArray(params.source_types)) {
      current.source_types = params.source_types.map(it => ({
        ...it,
        image: persistMedia('src', it.code || 'item', it.image),
      }));
    }
    if (params && Array.isArray(params.element_types)) {
      current.element_types = params.element_types.map(it => ({
        ...it,
        image: persistMedia('element', it.code || 'item', it.image),
      }));
    }
    if (params && Array.isArray(params.animation_types)) {
      current.animation_types = params.animation_types.map(it => ({
        ...it,
        image: persistMedia('anim', it.code || 'item', it.image),
      }));
    }
    if (params && Array.isArray(params.bgm_types)) {
      current.bgm_types = params.bgm_types.map(it => ({
        ...it,
        image: persistMedia('bgm', it.code || 'item', it.image),
      }));
    }
    if (params && Array.isArray(params.sfx_types)) {
      current.sfx_types = params.sfx_types.map(it => ({
        ...it,
        image: persistMedia('sfx', it.code || 'item', it.image),
      }));
    }
    current.schema_version = '2';
    fs.writeFileSync(clsPath, JSON.stringify(current, null, 2), 'utf-8');
    return {
      success: true,
      source_types: current.source_types,
      element_types: current.element_types,
      animation_types: current.animation_types,
      bgm_types: current.bgm_types,
      sfx_types: current.sfx_types,
      classifications_path: clsPath,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('suggester-save-rules', async (event, params) => {
  const rulesPath = path.join(__dirname, 'templates', 'source_style_rules.txt');
  try {
    const res = await callPython('/api/source-suggester/save-rules', params);
    if (res && !res.error) return res;
  } catch (e) {
    // Fallback ghi truc tiep
  }
  try {
    fs.writeFileSync(rulesPath, (params && params.rules) ? params.rules : '', 'utf-8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('suggester-load-csv', async (event, params) => {
  try {
    return await callPython('/api/source-suggester/load-csv', params);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('suggester-suggest', async (event, params) => {
  try {
    return await callPython('/api/source-suggester/suggest', params, 600000);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('suggester-save-examples', async (event, params) => {
  try {
    return await callPython('/api/source-suggester/save-examples', params);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('suggester-delete-example', async (event, params) => {
  try {
    return await callPython('/api/source-suggester/delete-example', params);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('suggester-export-csv', async (event, params) => {
  try {
    return await callPython('/api/source-suggester/export-csv', params);
  } catch (e) {
    return { error: e.message };
  }
});

// --- Token Usage Tracker & External Links ---
ipcMain.handle('get-token-usage', async (event, params) => {
  try {
    return await callPython('/api/token-usage/get', params || {});
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('reset-token-usage', async (event, params) => {
  try {
    return await callPython('/api/token-usage/reset', params || {});
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { error: 'URL không hợp lệ' };
});

// Window controls
ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window-close', () => mainWindow.close());

// --- App Lifecycle ---
app.whenReady().then(async () => {
  createWindow();

  try {
    await startPython();
    backendStatus = true;
    console.log('Python backend started successfully');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-ready', true);
    }
  } catch (e) {
    backendStatus = false;
    console.error('Failed to start Python backend:', e.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-ready', false);
      mainWindow.webContents.send('python-error', e.message);
    }
  }
});

app.on('window-all-closed', () => {
  stopPython();
  app.quit();
});

app.on('before-quit', () => {
  stopPython();
});
