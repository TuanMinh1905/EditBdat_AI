// Exercise the actual CSV selection, rendering and AI handlers without Electron.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
function section(start, end) {
  const a = renderer.indexOf(start);
  const b = renderer.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing section ${start}`);
  return renderer.slice(a, b);
}
const script = new vm.Script([
  section('function getGeminiApiKeys(', 'async function loadSettings('),
  section('  function splitLoaiSource(', '  function updateRulesMeta('),
  section('  function contextLabel(', '  async function loadBackendState('),
  section('  async function loadCsvFile(', '  // Khôi phục giá trị đã lưu'),
  section('  // Chọn file Timeline CSV', '  // Lưu default thoi_ky'),
  section('  // Analyze bounded groups', '  // Bấm nút Lưu vào Kho ví dụ'),
  section('  // Bấm nút Lưu vào Kho ví dụ', '  // Xóa toàn bộ kho ví dụ'),
  section('  // Xuất file 2_CSV_PhanLoaiSource.csv', '  // Live provider routing notifications'),
  section('  // Live provider routing notifications', '  // Restore backend state'),
].join('\n'));

class Element {
  constructor() { this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false; this.listeners = {}; this.style = {}; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll() { return []; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
  async click() { if (!this.disabled) return this.listeners.click?.(); }
}

function quotaClock(h) {
  let now = 1000, nextId = 0;
  const timers = new Map();
  h.context.Date = class extends Date { static now() { return now; } };
  h.context.setTimeout = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  h.context.clearTimeout = id => timers.delete(id);
  return { advance: async amount => {
    now += amount;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await new Promise(resolve => setImmediate(resolve));
  } };
}
function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ doan: String(Math.floor(i / 4)), cau: String(Math.floor(i / 2)),
    y: String(i), start: String(i * 3), text: `Câu ${i}`, loai_source: '', element: '', anim: '', bgm: '', sfx: '' }));
}
function complete(input, localIndex) {
  return { ...input, row_index: localIndex, loai_source: 'rai_1_3', cau_thu: 'Xavi', doi_bong: 'Spain', thoi_diem: 'Euro2008', su_kien: 'Euro', element: 'tv_retro + texture_2', anim: 'static',
    bgm: 'bgm_default', sfx: 'none', si: '', confidence: .9, needs_review: false, analysis_status: 'complete', reason: 'Theo nội dung và quy tắc.' };
}
function harness({ count = 3, key = 'test-key', suggest, savedStorage } = {}) {
  const data = rows(count);
  const calls = { ai: [], log: [], confirm: 0, saveCsv: [], exports: [], learned: [] };
  const storage = new Map(savedStorage);
  const sgDom = Object.fromEntries(['btnBrowseCsv', 'btnSuggest', 'btnSuggestText', 'btnLearn', 'btnExport', 'btnFillThoiKy',
    'btnImportPlan', 'btnPause', 'btnReset', 'tbody', 'statTotal', 'statLow', 'timelineCsv', 'defaultThoiKy', 'rulesInput'].map(key => [key, new Element()]));
  sgDom.rulesInput.value = 'Ưu tiên tv_retro + texture_2; video static.';
  const sgState = { rows: [], examples: [], csvPath: '', backendLoaded: true, isSuggesting: false, isLoadingCsv: false, generation: 0, phase: 'idle', paused: false };
  const progress = new Element();
  const extras = Object.fromEntries(['sg-progress-bar', 'sg-progress-track', 'sg-progress-percent', 'sg-progress-status', 'sg-routing-notice', 'pg-source-csv'].map(id => [id, new Element()]));
  const context = vm.createContext({
    sgState, sgDom, dom: { settingApiKey: { value: key } }, state: { settings: { geminiApiKey: key } },
    Event,
    $: id => extras[id.slice(1)] || progress,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sgLog: (...args) => calls.log.push(args),
    askConfirm: async () => { calls.confirm++; return true; },
    loadBackendState: async () => { sgState.backendLoaded = true; },
    renderExamples() {},
    getValidLoaiList: () => [{ code: 'rai_1_3', label: 'Highlight chung' }, { code: 'rai_2', label: 'Bối cảnh' }],
    getValidElementsList: () => ['auto', 'none', 'tv_retro', 'texture_2'].map(code => ({ code, label: code })),
    getValidAnimsList: () => ['auto', 'static'].map(code => ({ code, label: code })),
    getValidBgmsList: () => [{ code: 'bgm_default', label: 'BGM' }],
    getValidSfxsList: () => [{ code: 'none', label: 'Không' }],
    window: { api: {
      onPythonLog: callback => { calls.pythonLog = callback; },
      selectCsvFile: async () => 'C:\\Project\\1_CSV_Timeline.csv',
      suggesterLoadCsv: async () => ({ rows: structuredClone(data) }),
      saveCsvFile: async suggested => { calls.saveCsv.push(suggested); return suggested; },
      suggesterExportCsv: async params => { calls.exports.push(structuredClone(params)); return { success: true, output_path: params.output_path }; },
      suggesterSaveExamples: async params => { calls.learned.push(structuredClone(params)); return { examples: params.items, added: params.items.length, updated: 0, total: params.items.length }; },
      suggesterSuggest: async params => {
        calls.ai.push(structuredClone(params));
        return suggest ? suggest(params, calls.ai.length, { sgState, sgDom }) : { rows: params.rows.map(complete) };
      },
    } },
  });
  script.runInContext(context);
  return { context, sgState, sgDom, progress, storage, calls, data, extras };
}

test('selecting Timeline only saves its name; reopening does not load rows or call AI', async () => {
  const h = harness();
  await h.sgDom.btnBrowseCsv.click();
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.calls.ai.length, 0);
  assert.ok(h.sgDom.timelineCsv.value.endsWith('1_CSV_Timeline.csv'));
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.phase, 'selected');
  assert.equal(reopened.sgState.rows.length, 0);
  assert.equal(reopened.calls.ai.length, 0);
});

test('both saved API keys reach analysis but are never stored in the analysis snapshot', async () => {
  const h = harness();
  h.context.state.settings.geminiApiKeyBackup = 'backup-test-key';
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai[0].api_keys[0], 'test-key');
  assert.equal(h.calls.ai[0].api_keys[1], 'backup-test-key');
  assert.doesNotMatch(h.storage.get('sg_analysis'), /backup-test-key|api_keys/);
});

test('OpenAI alone works when enabled; unchecked keys and unsaved drafts are skipped', async () => {
  const h = harness();
  Object.assign(h.context.state.settings, { geminiKey1Enabled: false, geminiKey2Enabled: false,
    openaiApiKey: 'saved-openai-key', openaiKey3Enabled: true });
  h.context.dom.settingOpenaiApiKey = { value: 'unsaved-openai-draft' };
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 1);
  assert.deepEqual(h.calls.ai[0].api_keys, ['', '']);
  assert.deepEqual(h.calls.ai[0].key_enabled, [false, false, true]);
  assert.equal(h.calls.ai[0].openai_api_key, 'saved-openai-key');
  assert.doesNotMatch(h.storage.get('sg_analysis'), /saved-openai-key|unsaved-openai-draft/);
});

test('only OpenAI checked with an empty or unsaved key never calls unchecked Gemini keys', async () => {
  const h = harness();
  Object.assign(h.context.state.settings, { geminiApiKeyBackup: 'saved-backup-key', geminiKey1Enabled: false,
    geminiKey2Enabled: false, openaiKey3Enabled: true, openaiApiKey: '' });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 0);
  h.context.dom.settingOpenaiApiKey = { value: 'unsaved-openai-draft' };
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 0);
  assert.ok(h.calls.log.some(([message]) => /API Key.*đã lưu/.test(message)));
  assert.ok(h.sgState.rows.every(row => row.analysis_status === 'pending'));
});

test('all provider failures pause without automatic requests; Continue reads changed keys', async () => {
  const h = harness({ count: 3, suggest: (params, n) => n === 1 ? {
    all_providers_failed: true, error: 'Tất cả key đều lỗi', key_status: { paused: true },
  } : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.calls.ai.length, 1);
  assert.match(h.sgDom.btnSuggestText.textContent, /Đã tạm dừng/);
  const pausedNotice = h.extras['sg-routing-notice'].textContent;
  const pausedLogs = h.calls.log.length;
  h.calls.pythonLog(`[GeminiRun:${h.sgState.runId}] [AI] Các lựa chọn Gemini được bật chưa thể tiếp tục.`);
  assert.equal(h.extras['sg-routing-notice'].textContent, pausedNotice);
  assert.equal(h.calls.log.length, pausedLogs);
  assert.ok(h.sgState.rows.every(row => row.analysis_status === 'pending'));
  assert.match(h.extras['sg-routing-notice'].textContent, /Tất cả key/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.ai.length, 1);
  Object.assign(h.context.state.settings, { geminiKey1Enabled: false, openaiKey3Enabled: true, openaiApiKey: 'new-saved-openai' });
  await h.sgDom.btnPause.click();
  await run;
  assert.equal(h.calls.ai[1].api_keys[0], '');
  assert.equal(h.calls.ai[1].openai_api_key, 'new-saved-openai');
  assert.equal(h.sgState.phase, 'complete');
});

test('partial success remains saved while all-provider failure pauses only missing rows', async () => {
  const h = harness({ count: 3, suggest: (params, n) => n === 1 ? {
    all_providers_failed: true,
    rows: params.rows.map((row, i) => i === 0 ? complete(row, i) : { ...row, row_index: i,
      analysis_status: 'pending', all_providers_failed: true, confidence: null }),
  } : { rows: params.rows.map(complete), key_status: { provider: 'openai', active_slot: 3, model: 'test-model' } } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgState.rows[0].analysis_status, 'complete');
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.phase, 'paused');
  assert.equal(reopened.sgState.rows[0].analysis_status, 'complete');
  await h.sgDom.btnPause.click();
  await run;
  assert.deepEqual(h.calls.ai[1].rows.map(row => row.text), ['Câu 1', 'Câu 2']);
  assert.equal(h.sgState.phase, 'complete');
  assert.ok(h.sgState.rows.every(row => !row.all_providers_failed));
});

test('successful OpenAI preference survives restart for unfinished rows and reset clears it', async () => {
  const h = harness({ count: 9, suggest: (params, n) => n === 1 ? {
    rows: params.rows.map(complete), key_status: { provider: 'openai', active_slot: 3, model: 'test-model' },
  } : { all_providers_failed: true, error: 'providers temporarily unavailable' } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  const reopened = harness({ count: 9, savedStorage: h.storage });
  assert.equal(reopened.sgState.preferredProvider, 'openai');
  await reopened.sgDom.btnSuggest.click();
  assert.equal(reopened.calls.ai[0].preferred_provider, 'openai');
  assert.equal(reopened.calls.ai[0].rows.length, 1);
  await h.sgDom.btnReset.click();
  await run;
  assert.equal(h.sgState.preferredProvider, '');
});

test('settings load old single-key data and persist the new backup across reloads', async () => {
  const h = harness();
  new vm.Script([
    section('async function loadSettings(', 'function formatTokenNum('),
    section('async function saveSettings(', '// --- Tab Navigation ---')
  ].join('\n')).runInContext(h.context);
  for (const name of ['settingModelPriority', 'settingApiKeyBackup', 'settingAePath', 'settingOutputDir', 'settingCompWidth',
    'settingCompHeight', 'settingCompFps', 'btnSaveSettings']) h.context.dom[name] = new Element();
  let saved = { geminiApiKey: 'primary-test-key' };
  h.context.window.api.getSettings = async () => saved;
  h.context.window.api.saveSettings = async value => { saved = structuredClone(value); return { success: true }; };
  h.context.addLog = () => {};
  h.context.loadTokenUsage = () => {};
  h.context.setTimeout = () => {};
  await h.context.loadSettings();
  assert.equal(h.context.dom.settingApiKeyBackup.value, '');
  h.context.dom.settingApiKeyBackup.value = 'backup-test-key';
  h.context.dom.settingModelPriority.value = 'model-a, model-b';
  await h.context.saveSettings();
  h.context.state.settings = {};
  h.context.dom.settingApiKeyBackup.value = '';
  await h.context.loadSettings();
  assert.equal(h.context.getGeminiApiKeys()[0], 'primary-test-key');
  assert.equal(h.context.getGeminiApiKeys()[1], 'backup-test-key');
  assert.equal(h.context.dom.settingModelPriority.value, 'model-a, model-b');
});

test('backup key alone can analyze and has its own token selector slot', async () => {
  const h = harness({ key: '' });
  h.context.state.settings.geminiApiKeyBackup = 'backup-test-key';
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 1);
  assert.equal(h.calls.ai[0].api_keys[0], '');
  assert.equal(h.calls.ai[0].api_keys[1], 'backup-test-key');
  h.context.dom.tokenKeySelect = { value: '0', options: [{}, {}] };
  assert.equal(h.context.getTokenApiKey(), 'backup-test-key');
  assert.equal(h.context.dom.tokenKeySelect.value, '1');
});

test('quota status identifies the active key without exposing either key', () => {
  const h = harness();
  h.context.dom.geminiKeyStatus = new Element();
  h.context.renderGeminiKeyStatus({ active_slot: 2, model: 'same-model',
    keys: [{ slot: 1, state: 'cooldown', retry_after_seconds: 60 }, { slot: 2, state: 'ready', retry_after_seconds: 0 }] });
  assert.match(h.context.dom.geminiKeyStatus.textContent, /Key 2/);
  assert.match(h.context.dom.geminiKeyStatus.textContent, /60s/);
});

test('live switch notices ignore canceled runs and show current model/key', () => {
  const h = harness();
  h.sgState.isSuggesting = true;
  h.sgState.runId = 'current-run';
  h.calls.pythonLog('[GeminiRun:old-run] [Gemini] old model');
  assert.equal(h.extras['sg-routing-notice'].textContent, '');
  h.calls.pythonLog('[GeminiRun:current-run] [Gemini] model-b · Key 2');
  assert.match(h.extras['sg-routing-notice'].textContent, /model-b.*Key 2/);
  h.calls.pythonLog('[GeminiRun:current-run] [OpenAI] test-model · Key 3');
  assert.match(h.extras['sg-routing-notice'].textContent, /OpenAI.*Key 3/);
  h.calls.pythonLog('[GeminiRun:old-run] [OpenAI] stale model');
  assert.doesNotMatch(h.extras['sg-routing-notice'].textContent, /stale/);
});

test('paused routing status reports a missing OpenAI key without claiming another key is running', () => {
  const h = harness();
  h.context.dom.geminiKeyStatus = new Element();
  h.context.renderGeminiKeyStatus({ paused: true, active_slot: 2, model: 'test-model',
    provider: 'gemini', openai_state: 'missing_key', keys: [] }, h.context.sgLog);
  assert.match(h.context.dom.geminiKeyStatus.textContent, /Key 3 đã bật nhưng chưa lưu OpenAI key/);
  assert.equal(h.calls.log.length, 0);
  assert.equal(h.extras['sg-routing-notice'].textContent, '');
});

test('all model/key quota exhaustion waits automatically and retries the same group', async () => {
  const h = harness({ suggest: (p, n) => n === 1 ? { error: 'quota', quota_wait: true, retry_after_seconds: 2 } : { rows: p.rows.map(complete) } });
  const clock = quotaClock(h);
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'waiting_quota');
  assert.ok(h.sgState.rows.every(r => r.analysis_status === 'pending' && !r.needs_review));
  assert.equal(h.sgState.isSuggesting, true);
  await clock.advance(1000);
  assert.equal(h.calls.ai.length, 1);
  await clock.advance(1000);
  await running;
  assert.equal(h.calls.ai.length, 2);
  assert.equal(h.sgState.phase, 'complete');
  assert.deepEqual(h.calls.ai[0].rows.map(r => r.text), h.calls.ai[1].rows.map(r => r.text));
});

test('partial results survive quota wait and only missing rows are retried with continuity', async () => {
  const h = harness({ suggest: (p, n) => n === 1 ? { quota_wait: true, retry_after_seconds: 1,
    rows: p.rows.map((r, i) => i === 0 ? complete(r, i) : { ...r, row_index: i, analysis_status: 'pending' })
  } : { rows: p.rows.map(complete) } });
  const clock = quotaClock(h);
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.rows[0].analysis_status, 'complete');
  assert.equal(h.sgState.phase, 'waiting_quota');
  await clock.advance(1000);
  await running;
  assert.equal(h.calls.ai[1].rows.length, 2);
  assert.equal(h.calls.ai[1].previous_rows.at(-1).bgm, 'bgm_default');
  assert.equal(h.sgState.rows[0].analysis_status, 'complete');
});

test('Pause holds requests after quota timer expires until Continue', async () => {
  const h = harness({ suggest: (p, n) => n === 1 ? { error: 'quota', quota_wait: true, retry_after_seconds: 1 } : { rows: p.rows.map(complete) } });
  const clock = quotaClock(h);
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click();
  await clock.advance(2000);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.calls.ai.length, 1);
  await h.sgDom.btnPause.click();
  await running;
  assert.equal(h.calls.ai.length, 2);
});

test('Làm mới cancels quota timer without reviving the old session', async () => {
  const h = harness({ suggest: () => ({ error: 'quota', quota_wait: true, retry_after_seconds: 60 }) });
  const clock = quotaClock(h);
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnReset.click();
  await running;
  await clock.advance(60000);
  assert.equal(h.calls.ai.length, 1);
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.sgState.quotaWaitUntil, 0);
});

test('saved model priority reaches API in order and reopens with quota wait paused', async () => {
  const h = harness();
  h.context.state.settings.geminiModelPriority = ['model-a', 'model-b'];
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.deepEqual(h.calls.ai[0].model_priority, ['model-a', 'model-b']);
  h.sgState.phase = 'waiting_quota';
  h.sgState.quotaWaitUntil = 123456;
  h.context.saveAnalysis();
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.phase, 'paused');
  assert.equal(reopened.sgState.quotaWaitUntil, 123456);
  assert.equal(reopened.calls.ai.length, 0);
});

test('Pause retains the in-flight group, waits, and Continue processes remaining rows', async () => {
  let finish;
  const h = harness({ count: 65, suggest: (p, n) => n === 1 ? new Promise(resolve => {
    finish = () => resolve({ rows: p.rows.map(complete) });
  }) : { rows: p.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click();
  assert.equal(h.sgState.phase, 'pausing');
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.calls.ai.length, 1);
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'complete').length, 8);
  assert.equal(h.extras['sg-progress-percent'].textContent, 'Đã đi được 12.3%');
  const reopened = harness({ count: 65, savedStorage: h.storage });
  assert.equal(reopened.sgState.phase, 'paused');
  assert.equal(reopened.sgState.rows[7].analysis_status, 'complete');
  assert.equal(reopened.calls.ai.length, 0);
  await reopened.sgDom.btnSuggest.click();
  assert.equal(reopened.calls.ai[0].rows[0].text, 'Câu 8');
  await h.sgDom.btnPause.click();
  await running;
  assert.equal(h.calls.ai.length, 9);
  assert.equal(h.sgState.phase, 'complete');
  assert.equal(h.extras['sg-progress-bar'].style.width, '100%');
});

test('reset ignores late AI responses and leaves the new session usable', async () => {
  let finish;
  const h = harness({ suggest: p => new Promise(resolve => { finish = () => resolve({ rows: p.rows.map(complete) }); }) });
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnReset.click();
  assert.equal(h.calls.confirm, 1);
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.sgState.csvPath, '');
  await h.sgDom.btnBrowseCsv.click();
  finish();
  await running;
  assert.equal(h.sgState.phase, 'selected');
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.sgDom.btnSuggest.disabled, false);
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.rows.length, 0);
});

test('reopening mid-request retains edited data and requeues only unfinished rows', async () => {
  const h = harness({ count: 2 });
  h.storage.set('sg_analysis', JSON.stringify({ schema_version: '2', csvPath: 'saved.csv', phase: 'running',
    rows: [{ ...complete(h.data[0], 0), note: 'My note', context_locked: 'yes' },
      { ...h.data[1], analysis_status: 'analyzing' }] }));
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.rows[0].note, 'My note');
  assert.equal(reopened.sgState.rows[0].context_locked, 'yes');
  assert.equal(reopened.sgState.rows[1].analysis_status, 'pending');
  assert.equal(reopened.sgState.phase, 'paused');
  await reopened.sgDom.btnSuggest.click();
  assert.equal(reopened.calls.ai.length, 1);
  assert.equal(reopened.calls.ai[0].rows.length, 1);
});

test('canceling reset confirmation keeps the session and its cached rows', async () => {
  const h = harness();
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  const saved = h.storage.get('sg_analysis');
  h.context.askConfirm = async () => false;
  await h.sgDom.btnReset.click();
  assert.equal(h.storage.get('sg_analysis'), saved);
  assert.equal(h.sgState.rows.length, 3);
});

test('reset while paused releases the waiting run and persists an empty session', async () => {
  let finish;
  const h = harness({ count: 33, suggest: p => new Promise(resolve => { finish = () => resolve({ rows: p.rows.map(complete) }); }) });
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click();
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  await h.sgDom.btnReset.click();
  await running;
  const reopened = harness({ savedStorage: h.storage });
  assert.equal(reopened.sgState.rows.length, 0);
  assert.equal(reopened.sgState.csvPath, '');
  assert.equal(reopened.sgState.phase, 'idle');
});

test('reset during CSV loading ignores the old load response', async () => {
  let finish;
  const h = harness();
  h.context.window.api.suggesterLoadCsv = () => new Promise(resolve => { finish = () => resolve({ rows: h.data }); });
  await h.sgDom.btnBrowseCsv.click();
  const running = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnReset.click();
  finish();
  await running;
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.sgState.csvPath, '');
  assert.equal(h.calls.ai.length, 0);
});

test('explicit Analyze processes 406 rows in groups with full context', async () => {
  const h = harness({ count: 406 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 51);
  assert.equal(h.calls.confirm, 0);
  assert.equal(h.calls.ai.reduce((n, p) => n + p.rows.length, 0), 406);
  assert.ok(h.calls.ai.every(p => p.rows.length <= 8 && p.context_rows.length === 406));
  assert.equal(h.calls.ai[1].previous_rows.at(-1).bgm, 'bgm_default');
  assert.equal(h.sgState.rows[405].row_index, 405);
  assert.equal(h.sgState.rows[405].element, 'tv_retro + texture_2');
  assert.match(h.sgDom.tbody.innerHTML, /value="tv_retro \+ texture_2" selected/);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.equal(h.progress.textContent, 'Đã phân tích: 406/406');
});

test('blank pending rows and draft export are available while AI is working', async () => {
  let resolve;
  const h = harness({ suggest: params => new Promise(done => { resolve = () => done({ rows: params.rows.map(complete) }); }) });
  await h.sgDom.btnBrowseCsv.click();
  const task = h.sgDom.btnSuggest.click();
  await new Promise(done => setImmediate(done));
  assert.ok(h.sgState.rows.every(r => r.loai_source === '' && r.element === '' && r.confidence === null));
  assert.equal(h.sgDom.btnBrowseCsv.disabled, true);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.match(h.sgDom.btnExport.textContent, /bản nháp/);
  assert.equal(h.sgDom.btnLearn.disabled, true);
  assert.match(h.sgDom.tbody.innerHTML, /Đang phân tích/);
  assert.doesNotMatch(h.sgDom.tbody.innerHTML, /value="rai_1"[^>]* selected/);
  resolve();
  await task;
  assert.equal(h.sgDom.btnBrowseCsv.disabled, false);
});

test('API failure preserves completed rows and retry only sends unresolved rows', async () => {
  const h = harness({ count: 65, suggest: (params, n) => n === 2 ? { error: 'Mất kết nối' } : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'complete').length, 8);
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'error').length, 8);
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'pending').length, 49);
  assert.equal(h.sgDom.statLow.textContent, 8);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.match(h.sgDom.btnExport.textContent, /bản nháp/);
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.confirm, 0);
  assert.equal(h.calls.ai[2].rows[0].text, 'Câu 8');
  assert.equal(h.calls.ai.at(-1).rows.length, 1);
  assert.ok(h.sgState.rows.every(r => r.analysis_status === 'complete'));
  assert.equal(h.sgDom.btnExport.disabled, false);
});

test('manual blank is highlighted and remains blank in dropdowns', async () => {
  const h = harness({ count: 1, suggest: p => ({ rows: [{ ...p.rows[0], row_index: 0, analysis_status: 'manual',
    needs_review: true, confidence: .9, reason: 'Cần tìm đúng cảnh chung kết.' }] }) });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.sgState.rows[0].loai_source, '');
  assert.match(h.sgDom.tbody.innerHTML, /sg-row-low-conf/);
  assert.match(h.sgDom.tbody.innerHTML, /— Làm thủ công —/);
  assert.equal(h.sgDom.statLow.textContent, 1);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.equal(h.sgDom.btnLearn.disabled, true);
});

test('missing API key leaves unclassified rows and gives an actionable message', async () => {
  const h = harness({ key: '' });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 0);
  assert.ok(h.sgState.rows.every(r => r.loai_source === '' && r.analysis_status === 'pending'));
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.ok(h.calls.log.some(([message]) => /API Key/.test(message)));
});

test('uses the saved geminiApiKey when the settings input is empty', async () => {
  const h = harness({ key: '', count: 1 });
  h.context.state.settings.geminiApiKey = 'saved-test-key';
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai.length, 1);
  assert.equal(h.calls.ai[0].api_key, 'saved-test-key');
  assert.equal(h.sgState.rows[0].analysis_status, 'complete');
});

test('missing or reordered API results cannot become successful rows', async () => {
  for (const bad of ['missing', 'reordered']) {
    const h = harness({ suggest: p => ({ rows: bad === 'missing' ? p.rows.slice(0, 1).map(complete) : p.rows.map(complete).reverse() }) });
    await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
    assert.ok(h.sgState.rows.every(r => r.analysis_status === 'error' && r.loai_source === ''));
    assert.equal(h.sgDom.btnExport.disabled, false);
  }
});

test('startup restores saved results without running AI; changed CSV invalidates cache', async () => {
  const h = harness();
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  const file = h.sgState.csvPath;
  h.sgState.rows = [];
  await h.context.loadCsvFile(file);
  assert.equal(h.calls.ai.length, 1);
  assert.ok(h.sgState.rows.every(r => r.analysis_status === 'complete'));
  h.data[0].text = 'Kịch bản đã đổi';
  await h.context.loadCsvFile(file);
  assert.ok(h.sgState.rows.every(r => r.analysis_status === 'pending'));
  assert.equal(h.sgDom.btnExport.disabled, false);
});

test('editing one field never marks an otherwise blank row complete', async () => {
  const h = harness({ key: '', count: 1 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  h.sgState.rows[0].loai_source = 'rai_1';
  h.context.markRowEdited(0);
  assert.equal(h.sgState.rows[0].analysis_status, 'pending');
  assert.equal(h.sgState.rows[0].confidence, null);
  assert.equal(h.sgDom.btnExport.disabled, false);
});

test('paragraph context respects explicit row and sentence overrides and survives reruns', async () => {
  const h = harness({ count: 8 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  Object.assign(h.sgState.rows[0], { thoi_diem: '2008', context_locked: 'yes', context_scope: 'row' });
  Object.assign(h.sgState.rows[1], { thoi_diem: '2010', context_locked: 'yes', context_scope: 'row' });
  Object.assign(h.sgState.rows[2], { thoi_diem: '2012', context_locked: 'yes', context_scope: 'cau' });
  h.context.applyContext(0, 'doan');
  assert.equal(h.sgState.rows[1].thoi_diem, '2010');
  assert.equal(h.sgState.rows[2].thoi_diem, '2012');
  assert.equal(h.sgState.rows[3].thoi_diem, '2008');
  assert.equal(h.sgState.rows[4].thoi_diem, 'Euro2008');
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai[1].rows[1].context_locked, 'yes');
  assert.equal(h.calls.ai[1].context_rows[1].thoi_diem, '2010');
});

test('turning off broll affects only its paragraph and requires reanalysis for empty source', async () => {
  const h = harness({ count: 8 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  h.sgState.rows[1].loai_source = 'rai_2';
  h.sgState.rows[2].loai_source = 'rai_1_3 + rai_2';
  h.context.setParagraphBroll(0, false);
  assert.equal(h.sgState.rows[1].loai_source, '');
  assert.equal(h.sgState.rows[1].analysis_status, 'pending');
  assert.equal(h.sgState.rows[2].loai_source, 'rai_1_3');
  assert.equal(h.sgState.rows[3].allow_rai_2, 'no');
  assert.equal(h.sgState.rows[4].allow_rai_2, 'yes');
  assert.equal(h.sgDom.btnExport.disabled, false);
});

test('legacy analysis cache is archived and cannot reinterpret old rai_2', async () => {
  const h = harness({ count: 1 });
  const csvPath = 'C:\\Project\\1_CSV_Timeline.csv';
  h.storage.set('sg_analysis', JSON.stringify({ csvPath, rows: [{ ...complete(h.data[0], 0), loai_source: 'rai_2' }] }));
  await h.context.loadCsvFile(csvPath);
  assert.equal(h.sgState.rows[0].loai_source, '');
  assert.equal(h.sgState.rows[0].analysis_status, 'pending');
  assert.ok(h.storage.has('sg_analysis_v1_backup'));
});

test('editing historical context keeps the editor open and updates the lock and event', async () => {
  const h = harness({ count: 1 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  const input = new Element();
  input.dataset = { idx: '0', key: 'thoi_diem' };
  const summary = new Element(), lock = new Element(), event = new Element();
  input.closest = () => ({ querySelector: selector => ({ summary, '.sg-context-lock': lock, '[data-key="su_kien"]': event })[selector] });
  h.sgDom.tbody.querySelectorAll = selector => selector === '.sg-context-input' ? [input] : [];
  h.context.renderTable();
  const markup = h.sgDom.tbody.innerHTML;
  input.value = 'WorldCup2010';
  input.listeners.input();
  assert.equal(h.sgState.rows[0].thoi_diem, 'WorldCup2010');
  assert.equal(event.value, 'WorldCup');
  assert.equal(lock.checked, true);
  assert.equal(h.sgState.rows[0].context_scope, 'row');
  assert.match(summary.textContent, /WorldCup2010.*🔒/);
  assert.equal(h.sgDom.tbody.innerHTML, markup, 'editing must not replace the focused form');
});

test('loading an exported source plan preserves manual blanks without running AI', async () => {
  const h = harness({ count: 1 });
  Object.assign(h.data[0], { is_source_plan: true, analysis_status: 'manual', reason: 'Cần cảnh cụ thể',
    schema_version: '2', thoi_diem: 'Euro2008', context_locked: 'yes', context_scope: 'row' });
  await h.sgDom.btnImportPlan.click();
  assert.equal(h.calls.ai.length, 0);
  assert.equal(h.sgState.rows[0].analysis_status, 'manual');
  assert.equal(h.sgState.rows[0].thoi_diem, 'Euro2008');
  assert.equal(h.sgState.rows[0].reason, 'Cần cảnh cụ thể');
  assert.equal(h.sgDom.btnExport.disabled, false);
});

test('draft export at 296 of 406 includes every row without changing paused data or Tool A', async () => {
  const h = harness({ count: 406 });
  h.sgState.rows = h.data.map((row, i) => i < 296 ? complete(row, i) : { ...row, analysis_status: 'pending' });
  Object.assign(h.sgState, { csvPath: 'C:\\Project\\1_CSV_Timeline.csv', isSuggesting: true, paused: true, phase: 'paused' });
  h.context.renderTable();
  const before = structuredClone(h.sgState.rows);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.match(h.sgDom.btnExport.textContent, /bản nháp CSV \(296\/406\)/);
  await h.sgDom.btnExport.click();
  assert.equal(h.calls.exports.length, 1);
  assert.equal(h.calls.exports[0].draft, true);
  assert.equal(h.calls.exports[0].rows.length, 406);
  assert.equal(h.calls.exports[0].rows.filter(row => row.analysis_status === 'complete').length, 296);
  assert.match(h.calls.saveCsv[0], /2_CSV_PhanLoaiSource_Nhap\.csv$/);
  assert.deepEqual(h.sgState.rows, before);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgState.isSuggesting, true);
  assert.equal(h.calls.ai.length, 0);
  assert.equal(h.extras['pg-source-csv'].value, '');
  assert.ok(h.calls.log.some(([text]) => /296 dòng đã xử lý, 110 dòng chưa xong/.test(text)));
});

test('live draft snapshot stays at 288 while the in-flight group completes and Continue reaches 406', async () => {
  let finishGroup, finishSave;
  const h = harness({ count: 406, suggest: (params, n) => n === 37 ? new Promise(resolve => {
    finishGroup = () => resolve({ rows: params.rows.map(complete) });
  }) : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.rows.filter(row => row.analysis_status === 'complete').length, 288);
  await h.sgDom.btnPause.click();
  h.context.window.api.saveCsvFile = () => new Promise(resolve => { finishSave = resolve; });
  const exporting = h.sgDom.btnExport.click();
  await h.sgDom.btnExport.click(); // A second click cannot open another save dialog.
  finishGroup();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.rows.filter(row => row.analysis_status === 'complete').length, 296);
  assert.equal(h.sgState.phase, 'paused');
  finishSave('snapshot-draft.csv');
  await exporting;
  assert.equal(h.calls.exports[0].rows.length, 406);
  assert.equal(h.calls.exports[0].rows.filter(row => row.analysis_status === 'complete').length, 288);
  assert.equal(h.calls.exports[0].rows.filter(row => row.analysis_status === 'analyzing').length, 8);
  assert.equal(h.calls.ai.length, 37);
  await h.sgDom.btnPause.click();
  await run;
  assert.equal(h.sgState.phase, 'complete');
  assert.equal(h.sgState.rows.filter(row => row.analysis_status === 'complete').length, 406);
});

test('canceling or failing draft export keeps rows and allows another attempt', async () => {
  const h = harness();
  await h.context.loadCsvFile('timeline.csv', { fresh: true });
  const before = structuredClone(h.sgState.rows);
  h.context.window.api.saveCsvFile = async () => null;
  await h.sgDom.btnExport.click();
  assert.equal(h.calls.exports.length, 0);
  assert.equal(h.sgDom.btnExport.disabled, false);
  h.context.window.api.saveCsvFile = async () => 'draft.csv';
  h.context.window.api.suggesterExportCsv = async () => ({ error: 'fake disk failure' });
  await h.sgDom.btnExport.click();
  assert.deepEqual(structuredClone(h.sgState.rows), before);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.ok(h.calls.log.some(([text]) => /fake disk failure/.test(text)));
});

test('reset while choosing a draft path prevents an old export from writing the prior session', async () => {
  const h = harness();
  let choose;
  await h.context.loadCsvFile('timeline.csv', { fresh: true });
  h.context.window.api.saveCsvFile = () => new Promise(resolve => { choose = resolve; });
  const exporting = h.sgDom.btnExport.click();
  await h.sgDom.btnReset.click();
  choose('old-draft.csv');
  await exporting;
  assert.equal(h.calls.exports.length, 0);
  assert.equal(h.sgState.rows.length, 0);
  assert.equal(h.sgState.isExportingCsv, false);
});

test('final export still blocks unfinished rows and attaches only a complete CSV to Tool A', async () => {
  const h = harness();
  await h.context.loadCsvFile('timeline.csv', { fresh: true });
  await h.context.exportCsv(false);
  assert.equal(h.calls.exports.length, 0);
  h.sgState.rows = h.sgState.rows.map(complete);
  h.context.renderTable();
  await h.sgDom.btnExport.click();
  assert.equal(h.calls.exports[0].draft, false);
  assert.match(h.calls.exports[0].output_path, /2_CSV_PhanLoaiSource\.csv$/);
  assert.equal(h.extras['pg-source-csv'].value, h.calls.exports[0].output_path);
});

test('importing a draft preserves completed metadata and Continue analyzes only its pending rows', async () => {
  const h = harness({ count: 3 });
  Object.assign(h.data[0], complete(h.data[0], 0), { is_source_plan: true, note: 'Giữ khung TV' });
  Object.assign(h.data[1], { is_source_plan: true, analysis_status: 'manual', reason: 'Chọn cảnh thủ công' });
  Object.assign(h.data[2], { is_source_plan: true, analysis_status: 'pending' });
  await h.sgDom.btnImportPlan.click();
  assert.equal(h.calls.ai.length, 0);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgState.rows[0].confidence, .9);
  assert.equal(h.sgState.rows[0].note, 'Giữ khung TV');
  assert.equal(h.sgState.rows[2].needs_review, false);
  assert.match(h.sgDom.btnSuggestText.textContent, /Continue/);
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai[0].rows.length, 1);
  assert.equal(h.calls.ai[0].rows[0].text, h.data[2].text);
  assert.equal(h.sgState.rows[1].analysis_status, 'manual');
  assert.equal(h.sgState.rows[0].note, 'Giữ khung TV');
  assert.equal(h.sgState.phase, 'complete');
});

test('all three toolbar actions work after an actual Pause; importing retires the old waiting run', async () => {
  let finish;
  const h = harness({ count: 10, suggest: (params, n) => n === 1 ? new Promise(resolve => {
    finish = () => resolve({ rows: params.rows.map(complete) });
  }) : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click();
  assert.equal(h.sgState.phase, 'pausing');
  assert.equal(h.sgDom.btnImportPlan.disabled, true);
  assert.equal(h.sgDom.btnLearn.disabled, true);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgDom.btnImportPlan.disabled, false);
  assert.equal(h.sgDom.btnLearn.disabled, false);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.match(h.sgDom.btnExport.textContent, /bản nháp CSV \(8\/10\)/);
  await h.sgDom.btnExport.click();
  assert.equal(h.calls.exports[0].draft, true);
  assert.equal(h.calls.exports[0].rows.length, 10);
  await h.sgDom.btnLearn.click();
  assert.equal(h.calls.learned.length, 1);
  assert.equal(h.calls.learned[0].items.length, 8);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.calls.ai.length, 1);
  const oldGeneration = h.sgState.generation;
  h.context.window.api.suggesterLoadCsv = async () => ({ rows: [{ ...complete(h.data[0], 0),
    text: 'Lời thoại trong file mới', is_source_plan: true, analysis_status: 'edited' }] });
  await h.sgDom.btnImportPlan.click();
  await run;
  assert.ok(h.sgState.generation > oldGeneration);
  assert.equal(h.sgState.isSuggesting, false);
  assert.equal(h.sgState.rows.length, 1);
  assert.equal(h.sgState.rows[0].text, 'Lời thoại trong file mới');
  assert.equal(h.sgState.rows[0].analysis_status, 'edited');
  assert.equal(h.calls.ai.length, 1, 'the old paused run must not analyze or overwrite the imported file');
});

test('canceling import keeps the paused run and its Continue available', async () => {
  let finish;
  const h = harness({ count: 9, suggest: (params, n) => n === 1 ? new Promise(resolve => {
    finish = () => resolve({ rows: params.rows.map(complete) });
  }) : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click(); finish();
  await new Promise(resolve => setImmediate(resolve));
  const before = structuredClone(h.sgState.rows), generation = h.sgState.generation;
  h.context.askConfirm = async () => false;
  await h.sgDom.btnImportPlan.click();
  assert.equal(h.sgState.generation, generation);
  assert.deepEqual(structuredClone(h.sgState.rows), before);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgDom.btnPause.disabled, false);
  await h.sgDom.btnPause.click();
  await run;
  assert.equal(h.sgState.phase, 'complete');
});

test('learning while paused saves only eligible rows and preserves the session when the save fails', async () => {
  const h = harness({ count: 4 });
  h.sgState.rows = [complete(h.data[0], 0), { ...complete(h.data[1], 1), analysis_status: 'edited' },
    { ...h.data[2], analysis_status: 'manual', needs_review: true }, { ...h.data[3], analysis_status: 'pending' }];
  Object.assign(h.sgState, { csvPath: 'timeline.csv', isSuggesting: true, paused: true, phase: 'paused' });
  h.context.renderTable();
  const before = structuredClone(h.sgState.rows);
  let fail;
  h.context.window.api.suggesterSaveExamples = async params => {
    h.calls.learned.push(structuredClone(params));
    return new Promise(resolve => { fail = () => resolve({ error: 'fake examples save failed' }); });
  };
  const learning = h.sgDom.btnLearn.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnLearn.click();
  assert.equal(h.calls.learned.length, 1);
  assert.equal(h.calls.learned[0].items.length, 2);
  assert.equal(h.sgDom.btnPause.disabled, true);
  fail(); await learning;
  assert.deepEqual(structuredClone(h.sgState.rows), before);
  assert.equal(h.sgState.phase, 'paused');
  assert.equal(h.sgDom.btnLearn.disabled, false);
  assert.equal(h.sgDom.btnPause.disabled, false);
  assert.ok(h.calls.log.some(([text]) => /fake examples save failed/.test(text)));
});

test('failed import releases the old pause but preserves its completed rows for retry', async () => {
  let finish;
  const h = harness({ count: 9, suggest: (params, n) => n === 1 ? new Promise(resolve => {
    finish = () => resolve({ rows: params.rows.map(complete) });
  }) : { rows: params.rows.map(complete) } });
  await h.sgDom.btnBrowseCsv.click();
  const run = h.sgDom.btnSuggest.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.sgDom.btnPause.click(); finish();
  await new Promise(resolve => setImmediate(resolve));
  const before = structuredClone(h.sgState.rows);
  h.context.window.api.suggesterLoadCsv = async () => ({ error: 'fake invalid CSV' });
  await h.sgDom.btnImportPlan.click(); await run;
  assert.deepEqual(structuredClone(h.sgState.rows), before);
  assert.equal(h.sgState.isSuggesting, false);
  assert.equal(h.sgDom.btnSuggest.disabled, false);
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.ai[1].rows.length, 1);
  assert.equal(h.sgState.phase, 'complete');
});

test('learning from an idle table locks competing actions until the examples save returns', async () => {
  const h = harness({ count: 2 });
  h.sgState.rows = h.data.map(complete);
  h.sgState.csvPath = 'timeline.csv';
  h.context.renderTable();
  assert.equal(h.sgDom.btnSuggest.disabled, false);
  let finish;
  h.context.window.api.suggesterSaveExamples = async () => new Promise(resolve => {
    finish = () => resolve({ examples: [], added: 2, updated: 0, total: 2 });
  });
  const learning = h.sgDom.btnLearn.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sgDom.btnSuggest.disabled, true);
  assert.equal(h.sgDom.btnBrowseCsv.disabled, true);
  assert.equal(h.sgDom.btnImportPlan.disabled, true);
  finish(); await learning;
  assert.equal(h.sgDom.btnSuggest.disabled, false);
  assert.equal(h.sgDom.btnBrowseCsv.disabled, false);
  assert.equal(h.sgDom.btnImportPlan.disabled, false);
});
