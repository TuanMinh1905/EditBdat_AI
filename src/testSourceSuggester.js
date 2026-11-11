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
  section('  function isUnanalyzed(', '  async function loadBackendState('),
  section('  async function loadCsvFile(', '  // Khôi phục giá trị đã lưu'),
  section('  // Chọn file Timeline CSV', '  // Lưu default thoi_ky'),
  section('  // Analyze bounded groups', '  // Bấm nút Lưu vào Kho ví dụ'),
].join('\n'));

class Element {
  constructor() { this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false; this.listeners = {}; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll() { return []; }
  async click() { if (!this.disabled) return this.listeners.click?.(); }
}
function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ doan: String(Math.floor(i / 4)), cau: String(Math.floor(i / 2)),
    y: String(i), start: String(i * 3), text: `Câu ${i}`, loai_source: '', element: '', anim: '', bgm: '', sfx: '' }));
}
function complete(input, localIndex) {
  return { ...input, row_index: localIndex, loai_source: 'rai_1', element: 'tv_retro + texture_2', anim: 'static',
    bgm: 'bgm_default', sfx: 'none', si: '', confidence: .9, needs_review: false, analysis_status: 'complete', reason: 'Theo nội dung và quy tắc.' };
}
function harness({ count = 3, key = 'test-key', suggest } = {}) {
  const data = rows(count);
  const calls = { ai: [], log: [], confirm: 0 };
  const storage = new Map();
  const sgDom = Object.fromEntries(['btnBrowseCsv', 'btnSuggest', 'btnSuggestText', 'btnLearn', 'btnExport', 'btnFillThoiKy',
    'tbody', 'statTotal', 'statLow', 'timelineCsv', 'defaultThoiKy', 'rulesInput'].map(key => [key, new Element()]));
  sgDom.rulesInput.value = 'Ưu tiên tv_retro + texture_2; video static.';
  const sgState = { rows: [], examples: [], csvPath: '', backendLoaded: true, isSuggesting: false, isLoadingCsv: false };
  const progress = new Element();
  const context = vm.createContext({
    sgState, sgDom, dom: { settingApiKey: { value: key } }, state: { settings: {} },
    $: () => progress,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sgLog: (...args) => calls.log.push(args),
    askConfirm: async () => { calls.confirm++; return true; },
    loadBackendState: async () => { sgState.backendLoaded = true; },
    getValidLoaiList: () => [{ code: 'rai_1', label: 'Rải 1' }],
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
  return { context, sgState, sgDom, progress, storage, calls, data };
}

test('choosing CSV automatically analyzes 406 rows in groups with full context', async () => {
  const h = harness({ count: 406 });
  await h.sgDom.btnBrowseCsv.click();
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
  const task = h.sgDom.btnBrowseCsv.click();
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
  assert.equal(h.calls.ai.length, 0);
  assert.ok(h.sgState.rows.every(r => r.loai_source === '' && r.analysis_status === 'pending'));
  assert.equal(h.sgDom.btnExport.disabled, true);
  assert.ok(h.calls.log.some(([message]) => /API Key/.test(message)));
});

test('missing or reordered API results cannot become successful rows', async () => {
  for (const bad of ['missing', 'reordered']) {
    const h = harness({ suggest: p => ({ rows: bad === 'missing' ? p.rows.slice(0, 1).map(complete) : p.rows.map(complete).reverse() }) });
    await h.sgDom.btnBrowseCsv.click();
    assert.ok(h.sgState.rows.every(r => r.analysis_status === 'error' && r.loai_source === ''));
    assert.equal(h.sgDom.btnExport.disabled, true);
  }
});

test('startup restores saved results without running AI; changed CSV invalidates cache', async () => {
  const h = harness();
  await h.sgDom.btnBrowseCsv.click();
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
  h.sgState.rows[0].loai_source = 'rai_1';
  h.context.markRowEdited(0);
  assert.equal(h.sgState.rows[0].analysis_status, 'pending');
  assert.equal(h.sgState.rows[0].confidence, null);
  assert.equal(h.sgDom.btnExport.disabled, true);
});
