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
  section('  function splitLoaiSource(', '  function updateRulesMeta('),
  section('  function contextLabel(', '  async function loadBackendState('),
  section('  async function loadCsvFile(', '  // Khôi phục giá trị đã lưu'),
  section('  // Chọn file Timeline CSV', '  // Lưu default thoi_ky'),
  section('  // Analyze bounded groups', '  // Bấm nút Lưu vào Kho ví dụ'),
].join('\n'));

class Element {
  constructor() { this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false; this.listeners = {}; this.style = {}; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll() { return []; }
  async click() { if (!this.disabled) return this.listeners.click?.(); }
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
  const calls = { ai: [], log: [], confirm: 0 };
  const storage = new Map(savedStorage);
  const sgDom = Object.fromEntries(['btnBrowseCsv', 'btnSuggest', 'btnSuggestText', 'btnLearn', 'btnExport', 'btnFillThoiKy',
    'btnImportPlan', 'btnPause', 'btnReset', 'tbody', 'statTotal', 'statLow', 'timelineCsv', 'defaultThoiKy', 'rulesInput'].map(key => [key, new Element()]));
  sgDom.rulesInput.value = 'Ưu tiên tv_retro + texture_2; video static.';
  const sgState = { rows: [], examples: [], csvPath: '', backendLoaded: true, isSuggesting: false, isLoadingCsv: false, generation: 0, phase: 'idle', paused: false };
  const progress = new Element();
  const extras = Object.fromEntries(['sg-progress-bar', 'sg-progress-track', 'sg-progress-percent', 'sg-progress-status'].map(id => [id, new Element()]));
  const context = vm.createContext({
    sgState, sgDom, dom: { settingApiKey: { value: key } }, state: { settings: {} },
    $: id => extras[id.slice(1)] || progress,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sgLog: (...args) => calls.log.push(args),
    askConfirm: async () => { calls.confirm++; return true; },
    loadBackendState: async () => { sgState.backendLoaded = true; },
    getValidLoaiList: () => [{ code: 'rai_1_3', label: 'Highlight chung' }, { code: 'rai_2', label: 'Bối cảnh' }],
    getValidElementsList: () => ['auto', 'none', 'tv_retro', 'texture_2'].map(code => ({ code, label: code })),
    getValidAnimsList: () => ['auto', 'static'].map(code => ({ code, label: code })),
    getValidBgmsList: () => [{ code: 'bgm_default', label: 'BGM' }],
    getValidSfxsList: () => [{ code: 'none', label: 'Không' }],
    window: { api: {
      selectCsvFile: async () => 'C:\\Project\\1_CSV_Timeline.csv',
      suggesterLoadCsv: async () => ({ rows: structuredClone(data) }),
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
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'complete').length, 32);
  assert.equal(h.extras['sg-progress-percent'].textContent, 'Đã đi được 49.2%');
  const reopened = harness({ count: 65, savedStorage: h.storage });
  assert.equal(reopened.sgState.phase, 'paused');
  assert.equal(reopened.sgState.rows[31].analysis_status, 'complete');
  assert.equal(reopened.calls.ai.length, 0);
  await reopened.sgDom.btnSuggest.click();
  assert.equal(reopened.calls.ai[0].rows[0].text, 'Câu 32');
  await h.sgDom.btnPause.click();
  await running;
  assert.equal(h.calls.ai.length, 3);
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
  assert.equal(h.calls.ai.length, 13);
  assert.equal(h.calls.confirm, 0);
  assert.equal(h.calls.ai.reduce((n, p) => n + p.rows.length, 0), 406);
  assert.ok(h.calls.ai.every(p => p.rows.length <= 32 && p.context_rows.length === 406));
  assert.equal(h.calls.ai[1].previous_rows.at(-1).bgm, 'bgm_default');
  assert.equal(h.sgState.rows[405].row_index, 405);
  assert.equal(h.sgState.rows[405].element, 'tv_retro + texture_2');
  assert.match(h.sgDom.tbody.innerHTML, /value="tv_retro \+ texture_2" selected/);
  assert.equal(h.sgDom.btnExport.disabled, false);
  assert.equal(h.progress.textContent, 'Đã phân tích: 406/406');
});

test('blank pending rows and disabled export are visible while AI is working', async () => {
  let resolve;
  const h = harness({ suggest: params => new Promise(done => { resolve = () => done({ rows: params.rows.map(complete) }); }) });
  await h.sgDom.btnBrowseCsv.click();
  const task = h.sgDom.btnSuggest.click();
  await new Promise(done => setImmediate(done));
  assert.ok(h.sgState.rows.every(r => r.loai_source === '' && r.element === '' && r.confidence === null));
  assert.equal(h.sgDom.btnBrowseCsv.disabled, true);
  assert.equal(h.sgDom.btnExport.disabled, true);
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
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'complete').length, 32);
  assert.equal(h.sgState.rows.filter(r => r.analysis_status === 'error').length, 33);
  assert.equal(h.sgDom.btnExport.disabled, true);
  await h.sgDom.btnSuggest.click();
  assert.equal(h.calls.confirm, 0);
  assert.equal(h.calls.ai[2].rows[0].text, 'Câu 32');
  assert.equal(h.calls.ai[3].rows.length, 1);
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
  assert.equal(h.sgDom.btnExport.disabled, true);
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
    assert.equal(h.sgDom.btnExport.disabled, true);
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
  assert.equal(h.sgDom.btnExport.disabled, true);
});

test('editing one field never marks an otherwise blank row complete', async () => {
  const h = harness({ key: '', count: 1 });
  await h.sgDom.btnBrowseCsv.click();
  await h.sgDom.btnSuggest.click();
  h.sgState.rows[0].loai_source = 'rai_1';
  h.context.markRowEdited(0);
  assert.equal(h.sgState.rows[0].analysis_status, 'pending');
  assert.equal(h.sgState.rows[0].confidence, null);
  assert.equal(h.sgDom.btnExport.disabled, true);
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
  assert.equal(h.sgDom.btnExport.disabled, true);
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
