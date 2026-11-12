// Actual settings handlers and UI editors with temporary files and fake keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');

function excerpt(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}

function settingsBackend(file, fsApi = fs) {
  const handlers = {};
  const context = vm.createContext({ fs: fsApi, path, SETTINGS_PATH: file,
    ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } } });
  vm.runInContext(excerpt(mainSource, '// --- Settings ---', '// --- Python Backend ---') +
    excerpt(mainSource, "ipcMain.handle('get-settings'", '// Session persistence'), context);
  return { handlers, context };
}

function temporarySettings(t, initial) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-ai-key-settings-'));
  const file = path.join(folder, 'settings.json');
  if (initial) fs.writeFileSync(file, JSON.stringify(initial));
  t.after(() => {
    for (const target of [file + '.tmp', file]) if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.rmdirSync(folder);
  });
  return file;
}

test('saving one key survives a fresh settings session and preserves every other field', t => {
  const original = { geminiApiKey: 'old-primary', geminiApiKeyBackup: 'old-backup',
    geminiModelPriority: ['model-a', 'model-b'], outputDir: 'project-folder', extra: { keep: true } };
  const file = temporarySettings(t, original);
  const first = settingsBackend(file);
  assert.equal(first.handlers['save-api-key'](null, { slot: 1, value: ' new-primary ' }).success, true);
  const reopened = settingsBackend(file).handlers['get-settings']();
  assert.deepEqual(JSON.parse(JSON.stringify(reopened)), { ...original, geminiApiKey: 'new-primary' });
  assert.equal(settingsBackend(file).handlers['save-api-key'](null, { slot: 2, value: 'new-backup' }).success, true);
  assert.equal(settingsBackend(file).handlers['get-settings']().geminiApiKeyBackup, 'new-backup');
  assert.equal(settingsBackend(file).handlers['save-api-key'](null, { slot: 3, value: 'new-openai' }).success, true);
  assert.equal(settingsBackend(file).handlers['save-api-key'](null, { slot: 3, enabled: true }).success, true);
  const thirdReopen = settingsBackend(file).handlers['get-settings']();
  assert.equal(thirdReopen.openaiApiKey, 'new-openai');
  assert.equal(thirdReopen.openaiKey3Enabled, true);
  assert.equal(thirdReopen.geminiApiKey, 'new-primary');
});

test('failed disk replacement keeps the old settings and never reports success', t => {
  const file = temporarySettings(t, { geminiApiKey: 'old-primary', geminiApiKeyBackup: 'old-backup' });
  const original = fs.readFileSync(file, 'utf8');
  const failing = settingsBackend(file, { ...fs, renameSync: () => { throw new Error('EACCES'); } });
  const result = failing.handlers['save-api-key'](null, { slot: 2, value: 'new-backup' });
  assert.ok(result.error);
  assert.equal(result.success, undefined);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('corrupt settings and invalid key slots do not overwrite saved data', t => {
  const file = temporarySettings(t);
  fs.writeFileSync(file, 'broken JSON');
  const backend = settingsBackend(file);
  assert.ok(backend.handlers['save-api-key'](null, { slot: 1, value: 'new-key' }).error);
  assert.ok(backend.handlers['save-api-key'](null, { slot: 9, value: 'new-key' }).error);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken JSON');
});

class Element {
  constructor() { this.value = ''; this.textContent = ''; this.disabled = false; this.type = 'password'; this.listeners = {}; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() {}
  async click() { if (!this.disabled) return this.listeners.click?.(); }
  typeValue(value) { this.value = value; this.listeners.input?.(); }
}

function editorHarness() {
  const dom = Object.fromEntries(['settingApiKey', 'settingApiKeyBackup', 'btnEditApiKey', 'btnEditApiKeyBackup',
    'btnSaveApiKey', 'btnSaveApiKeyBackup', 'apiKeySaveStatus', 'apiKeyBackupSaveStatus', 'btnSaveSettings',
    'settingOpenaiApiKey', 'btnEditOpenaiKey', 'btnSaveOpenaiKey', 'openaiKeySaveStatus',
    'key1Enabled', 'key2Enabled', 'key3Enabled'].map(key => [key, new Element()]));
  const persisted = { geminiApiKey: 'saved-primary', geminiApiKeyBackup: 'saved-backup', openaiApiKey: 'saved-openai' };
  const calls = [], logs = [];
  const context = vm.createContext({ dom, state: { settings: { ...persisted } },
    addLog: (...args) => logs.push(args), loadTokenUsage() {},
    window: { api: { saveApiKey: async ({ slot, value, enabled }) => {
      calls.push({ slot, value, enabled });
      if (value !== undefined) persisted[['geminiApiKey', 'geminiApiKeyBackup', 'openaiApiKey'][slot - 1]] = value;
      if (enabled !== undefined) persisted[['geminiKey1Enabled', 'geminiKey2Enabled', 'openaiKey3Enabled'][slot - 1]] = enabled;
      return { success: true };
    }, getSettings: async () => ({ ...persisted }) } } });
  vm.runInContext(excerpt(renderer, 'function getGeminiApiKeys(', 'function getGeminiModelPriority('), context);
  context.initApiKeyEditors();
  return { context, dom, persisted, calls, logs };
}

test('key editors lock saved values and apply a draft only after its own Save succeeds', async () => {
  const h = editorHarness();
  assert.equal(h.dom.settingApiKey.readOnly, true);
  assert.match(h.dom.apiKeySaveStatus.textContent, /Đã lưu/);
  await h.dom.btnEditApiKey.click();
  h.dom.settingApiKey.typeValue('new-primary');
  await h.dom.btnEditApiKeyBackup.click();
  h.dom.settingApiKeyBackup.typeValue('unsaved-backup-draft');
  assert.equal(h.context.getGeminiApiKeys()[0], 'saved-primary');
  await h.dom.btnSaveApiKey.click();
  assert.equal(h.persisted.geminiApiKey, 'new-primary');
  assert.equal(h.persisted.geminiApiKeyBackup, 'saved-backup');
  assert.equal(h.dom.settingApiKeyBackup.value, 'unsaved-backup-draft');
  assert.equal(h.dom.settingApiKey.readOnly, true);
  assert.equal(h.context.getGeminiApiKeys()[0], 'new-primary');
  assert.ok(h.logs.every(entry => !/saved-primary|new-primary|saved-backup/.test(entry[0])));
});

test('a failed key save keeps the draft editable and retains the previously saved key', async () => {
  const h = editorHarness();
  h.context.window.api.saveApiKey = async () => ({ error: 'disk full' });
  await h.dom.btnEditApiKeyBackup.click();
  h.dom.settingApiKeyBackup.typeValue('new-backup');
  await h.dom.btnSaveApiKeyBackup.click();
  assert.equal(h.context.getGeminiApiKeys()[1], 'saved-backup');
  assert.equal(h.dom.settingApiKeyBackup.value, 'new-backup');
  assert.equal(h.dom.settingApiKeyBackup.readOnly, false);
  assert.match(h.dom.apiKeyBackupSaveStatus.textContent, /Không lưu được/);
});

test('OpenAI stays disabled until checked; saving its key does not enable it', async () => {
  const h = editorHarness();
  assert.equal(h.dom.key3Enabled.checked, false);
  assert.equal(h.context.getOpenaiConfig().api_key, '');
  await h.dom.btnEditOpenaiKey.click();
  h.dom.settingOpenaiApiKey.typeValue('new-openai');
  await h.dom.btnSaveOpenaiKey.click();
  assert.equal(h.persisted.openaiApiKey, 'new-openai');
  assert.equal(h.context.getOpenaiConfig().api_key, '');
  h.dom.key3Enabled.checked = true;
  await h.dom.key3Enabled.listeners.change();
  assert.equal(h.persisted.openaiKey3Enabled, true);
  assert.equal(h.context.getOpenaiConfig().api_key, 'new-openai');
});

test('usage toggle saves immediately without saving drafts and failed toggle reverts', async () => {
  const h = editorHarness();
  await h.dom.btnEditApiKey.click();
  h.dom.settingApiKey.typeValue('unsaved-draft');
  h.dom.key1Enabled.checked = false;
  await h.dom.key1Enabled.listeners.change();
  assert.equal(h.persisted.geminiKey1Enabled, false);
  assert.equal(h.persisted.geminiApiKey, 'saved-primary');
  assert.equal(h.dom.settingApiKey.value, 'unsaved-draft');
  assert.equal(h.context.getGeminiApiKeys()[0], '');
  h.context.window.api.saveApiKey = async () => ({ error: 'fake disk failure' });
  h.dom.key1Enabled.checked = true;
  await h.dom.key1Enabled.listeners.change();
  assert.equal(h.dom.key1Enabled.checked, false);
  assert.equal(h.context.getGeminiApiKeys()[0], '');
});

test('IPC always overrides request credentials with the latest saved selection', t => {
  const file = temporarySettings(t, { geminiApiKey: 'saved-primary', geminiApiKeyBackup: 'saved-backup',
    openaiApiKey: 'saved-openai', geminiKey1Enabled: false, openaiKey3Enabled: true, openaiModel: 'custom-model' });
  const backend = settingsBackend(file);
  const params = backend.context.withSavedAiConfig({ api_keys: ['draft-one', 'draft-two'],
    key_enabled: [true, false, false], api_key: 'selected-statistics-key', rows: [{ text: 'keep input' }] });
  assert.deepEqual(Array.from(params.key_enabled), [false, true, true]);
  assert.deepEqual(Array.from(params.api_keys), ['saved-primary', 'saved-backup']);
  assert.equal(params.openai_api_key, 'saved-openai');
  assert.equal(params.openai_model, 'custom-model');
  assert.equal(params.api_key, 'selected-statistics-key');
  backend.handlers['save-api-key'](null, { slot: 3, enabled: false });
  assert.equal(backend.context.withSavedAiConfig({}).key_enabled[2], false);
});
