const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Suppress GPU cache errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

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
    outputDir: path.join(app.getPath('documents'), 'AE_AI_Output'),
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
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
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
    console.log('Python backend started successfully');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-ready', true);
    }
  } catch (e) {
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
