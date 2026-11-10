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

    // Try python, then python3
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    pythonProcess = spawn(pythonCmd, [pythonScript, '--port', String(PYTHON_PORT)], {
      cwd: __dirname,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let started = false;

    pythonProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Python]', msg);
      if (!started && msg.includes('Server ready')) {
        started = true;
        resolve();
      }
      // Forward to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-log', msg);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      console.error('[Python Error]', msg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python-error', msg);
      }
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Python] Process exited with code ${code}`);
      pythonProcess = null;
      if (!started) {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!started) {
        reject(new Error('Python backend timed out'));
      }
    }, 15000);
  });
}

function stopPython() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}

// --- HTTP helper to call Python backend ---
function callPython(endpoint, data) {
  return new Promise((resolve, reject) => {
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
      timeout: 300000 // 5 minute timeout for thinking model AI calls
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
      reject(new Error('Request timed out'));
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
          loai_source: ex.loai_source || 'rai_1',
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
    let animationTypes = [];
    if (fs.existsSync(clsPath)) {
      const clsRaw = JSON.parse(fs.readFileSync(clsPath, 'utf-8'));
      sourceTypes = Array.isArray(clsRaw.source_types) ? clsRaw.source_types : [];
      animationTypes = Array.isArray(clsRaw.animation_types) ? clsRaw.animation_types : [];
    }
    return {
      success: true,
      rules,
      examples,
      total_examples: examples.length,
      rules_path: rulesPath,
      examples_path: examplesPath,
      source_types: sourceTypes,
      animation_types: animationTypes,
      classifications_path: clsPath,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('suggester-save-classifications', async (event, params) => {
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
        if (val.startsWith('data:video/')) {
          const parts = val.split(',');
          if (parts.length === 2) {
            const mime = parts[0].split(';')[0].replace('data:video/', '').trim().toLowerCase();
            const extMap = { mp4: '.mp4', webm: '.webm', quicktime: '.mov', ogg: '.ogv' };
            const ext = extMap[mime] || '.mp4';
            const outPath = path.join(clsMediaDir, `${prefix}_${code}${ext}`);
            fs.writeFileSync(outPath, Buffer.from(parts[1], 'base64'));
            const urlPath = outPath.replace(/\\/g, '/').split('/').map(s => s.includes(':') ? s : encodeURIComponent(s)).join('/');
            return `file:///${urlPath}?v=${Date.now()}`;
          }
        }
      } catch (_) { /* ignore */ }
      return val;
    };

    let current = { source_types: [], animation_types: [] };
    if (fs.existsSync(clsPath)) {
      current = JSON.parse(fs.readFileSync(clsPath, 'utf-8'));
    }
    if (params && Array.isArray(params.source_types)) {
      current.source_types = params.source_types.map(it => ({
        ...it,
        image: persistMedia('src', it.code || 'item', it.image),
      }));
    }
    if (params && Array.isArray(params.animation_types)) {
      current.animation_types = params.animation_types.map(it => ({
        ...it,
        image: persistMedia(it.group || 'anim', it.code || 'item', it.image),
      }));
    }
    fs.writeFileSync(clsPath, JSON.stringify(current, null, 2), 'utf-8');
    return {
      success: true,
      source_types: current.source_types,
      animation_types: current.animation_types,
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
    return await callPython('/api/source-suggester/suggest', params);
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
