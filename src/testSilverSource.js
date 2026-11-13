const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');
const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const renderer = readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
const workflowHelp = readFileSync(path.join(__dirname, 'workflowHelp.js'), 'utf8');
const mainJs = readFileSync(path.join(rootDir, 'main.js'), 'utf8');
const preloadJs = readFileSync(path.join(rootDir, 'preload.js'), 'utf8');

function section(start, end) {
  const a = renderer.indexOf(start);
  const b = renderer.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing section ${start}`);
  return renderer.slice(a, b);
}

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._classes = new Set();
    this._listeners = {};
    this._children = [];
    this.classList = {
      add: (...cls) => cls.forEach(c => this._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this._classes.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      },
      contains: (c) => this._classes.has(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    const results = (this._listeners[event.type] || []).map(fn => fn(event));
    return Promise.all(results);
  }
  click() { return this.dispatchEvent({ type: 'click', stopPropagation() {} }); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  scrollIntoView() {}
}

test('sidebar places Silver Source between Gợi ý Source - Animation and Gold Source', () => {
  const sidebar = html.slice(html.indexOf('<nav class="sidebar">'), html.indexOf('</nav>'));
  const idxSuggest = sidebar.indexOf('data-tab="source-suggester"');
  const idxSilver = sidebar.indexOf('data-tab="silver-source"');
  const idxGold = sidebar.indexOf('data-tab="clip-splitter"');
  assert.ok(idxSuggest > 0 && idxSilver > idxSuggest && idxGold > idxSilver);
  assert.match(sidebar, /data-tab="silver-source"[\s\S]*?<span>Silver Source<\/span>/);
  assert.match(sidebar, /data-tab="clip-splitter"[\s\S]*?<span>Gold Source<\/span>/);
  assert.doesNotMatch(sidebar, /<span>Cắt Clip<\/span>/);

  const appCloseIdx = html.indexOf('<!-- Timeline Preview Modal -->');
  const silverTabIdx = html.indexOf('id="tab-silver-source"');
  const scriptIdx = html.indexOf('<script src="renderer.js"></script>');
  assert.ok(silverTabIdx > 0 && silverTabIdx < appCloseIdx && appCloseIdx < scriptIdx);
});

test('workflow help, main IPC and preload expose Silver Source and Gold Source names', () => {
  assert.match(workflowHelp, /'silver-source':\s*'Silver Source'/);
  assert.match(workflowHelp, /'clip-splitter':\s*'Gold Source'/);
  assert.ok(existsSync(path.join(rootDir, 'doc', 'workflows', 'silver-source.html')));
  assert.match(mainJs, /WORKFLOW_TABS\s*=\s*new Set\([^)]*'silver-source'/);
  assert.match(mainJs, /ipcMain\.handle\('silver-source-load'/);
  assert.match(preloadJs, /silverSourceLoad:/);
});

test('initSilverSource loads bundle, tracks done state, filters and cross-links SR_xxx', async () => {
  const script = new vm.Script([
    section('function svEscapeHtml(', '// SPLIT RESIZER'),
  ].join('\n'));

  const ids = [
    'sv-btn-browse-folder', 'sv-btn-reload', 'sv-req-path', 'sv-btn-browse-req', 'sv-btn-open-req',
    'sv-cov-path', 'sv-btn-browse-cov', 'sv-btn-open-cov', 'sv-status-banner',
    'sv-view-btn-req', 'sv-view-btn-cov', 'sv-req-count-badge', 'sv-cov-count-badge', 'sv-summary-pills',
    'sv-panel-requests', 'sv-panel-coverage',
    'sv-req-search', 'sv-req-filter-priority', 'sv-req-filter-loai', 'sv-req-filter-done',
    'sv-req-list-meta', 'sv-req-tbody', 'sv-req-detail-empty', 'sv-req-detail-body',
    'sv-cov-search', 'sv-cov-filter-step3', 'sv-cov-filter-step2', 'sv-cov-filter-loai', 'sv-cov-filter-doan',
    'sv-cov-sr-filter-wrap', 'sv-cov-sr-filter-label', 'sv-cov-sr-filter-clear',
    'sv-cov-list-meta', 'sv-cov-tbody', 'sv-cov-detail-card',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new MockElement(id)]));
  const storage = new Map();
  let detailToggleBtn = null;
  let detailJumpBtn = null;

  elements['sv-req-detail-body'].querySelectorAll = () => [];

  const bundle = {
    success: true,
    req_path: 'D:/Proj/3_YeuCauSource.csv',
    cov_path: 'D:/Proj/3_DoiChieuDoBaoPhu.csv',
    requests: [
      {
        request_id: 'SR_001',
        timeline_refs: 'doan=1/cau=1/y=1 (00:00:00:05 → 00:00:01:12)',
        loi_thoai_lien_quan: 'TL dòng 2: Euro 2008,',
        ma_loai_source: 'rai_2',
        noi_dung_can_thay: 'Thấy Xavi tại Euro 2008.',
        nhan_vat: 'Xavi',
        doi_bong: 'Tây Ban Nha',
        thoi_diem_lich_su: 'Euro 2008',
        tran_dau_hoac_su_kien: 'Euro 2008',
        muc_chinh_xac: 'Đúng giải',
        dieu_kien_bat_buoc: 'Thấy rõ Xavi',
        phuong_an_thay_the: 'Ảnh tư liệu',
        khong_chap_nhan: 'Áo Barça',
        nhu_cau_thoi_luong: '2 cảnh',
        tu_khoa_tim_kiem: 'Xavi Euro 2008 | Xavi Spain',
        muc_uu_tien: 'Cao',
        thong_tin_can_lam_ro: 'Cần duyệt',
        linked_coverage_count: 1,
      },
      {
        request_id: 'SR_008',
        timeline_refs: 'doan=3/cau=2 (00:00:22:00 → 00:00:25:10)',
        loi_thoai_lien_quan: 'TL dòng 12: Giúp Barça',
        ma_loai_source: 'rai_1_3',
        noi_dung_can_thay: 'Busquets kiểm soát bóng.',
        nhan_vat: 'Busquets',
        doi_bong: 'Barcelona',
        thoi_diem_lich_su: '2008-2012',
        tran_dau_hoac_su_kien: 'La Liga',
        muc_chinh_xac: 'Đúng giai đoạn',
        dieu_kien_bat_buoc: 'Thấy Busquets',
        phuong_an_thay_the: 'Highlight chung',
        khong_chap_nhan: 'Sau 2015',
        nhu_cau_thoi_luong: '1 cảnh',
        tu_khoa_tim_kiem: 'Busquets Barcelona 2008',
        muc_uu_tien: 'Vừa',
        thong_tin_can_lam_ro: '',
        linked_coverage_count: 1,
      },
    ],
    coverage: [
      {
        _row_num: 1,
        dong_timeline_csv: '2',
        dong_phan_loai_csv: '2',
        doan: '1',
        cau: '1',
        y: '1',
        start_timeline: '00:00:00:05',
        moc_start_ke_tiep: '00:00:01:12',
        loi_thoai: 'Euro 2008,',
        analysis_status_buoc_2: 'complete',
        ma_loai_source: 'rai_2',
        request_ids: 'SR_001',
        linked_request_ids: ['SR_001'],
        trang_thai_buoc_3: 'Có yêu cầu Silver',
        ghi_chu: 'Bối cảnh Euro 2008',
        reason_buoc_2: 'Mở mốc',
      },
      {
        _row_num: 2,
        dong_timeline_csv: '12',
        dong_phan_loai_csv: '12',
        doan: '3',
        cau: '2',
        y: '2.1',
        start_timeline: '00:00:22:00',
        moc_start_ke_tiep: '00:00:25:10',
        loi_thoai: 'giúp Barça',
        analysis_status_buoc_2: 'manual',
        ma_loai_source: 'rai_1_3',
        request_ids: 'SR_008',
        linked_request_ids: ['SR_008'],
        trang_thai_buoc_3: 'Đề xuất yêu cầu Silver, chờ duyệt',
        ghi_chu: 'Chờ duyệt',
        reason_buoc_2: 'Highlight chung',
      },
    ],
    stats: {
      total_requests: 2,
      total_coverage: 2,
      by_step3_status: { 'Có yêu cầu Silver': 1, 'Đề xuất yêu cầu Silver, chờ duyệt': 1 },
      doan_list: ['1', '3'],
    },
    warnings: [],
  };

  let copiedText = '';
  const context = vm.createContext({
    state: { backendReady: true },
    CSS: { escape: v => v },
    $: (sel) => {
      if (sel === '#sv-detail-toggle-done') return detailToggleBtn;
      if (sel === '#sv-detail-jump-cov') return detailJumpBtn;
      if (sel === '#sv-copy-all-kw') return null;
      return elements[sel.slice(1)] || null;
    },
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
    },
    navigator: {
      clipboard: {
        writeText: async t => { copiedText = t; },
      },
    },
    window: {
      api: {
        selectDirectory: async () => 'D:/Proj',
        silverSourceLoad: async () => bundle,
        selectCsvFile: async () => null,
        openFile: () => {},
      },
    },
    setTimeout,
  });

  // Intercept detail innerHTML updates to attach mock buttons for toggle/jump
  Object.defineProperty(elements['sv-req-detail-body'], 'innerHTML', {
    get() { return this._html || ''; },
    set(val) {
      this._html = val;
      detailToggleBtn = new MockElement('sv-detail-toggle-done');
      detailJumpBtn = new MockElement('sv-detail-jump-cov');
    },
  });

  script.runInContext(context);
  context.initSilverSource();

  await elements['sv-btn-browse-folder'].click();
  assert.equal(elements['sv-req-count-badge'].textContent, '2');
  assert.equal(elements['sv-cov-count-badge'].textContent, '2');
  assert.match(elements['sv-req-tbody'].innerHTML, /SR_001/);
  assert.match(elements['sv-req-tbody'].innerHTML, /SR_008/);
  assert.match(elements['sv-req-detail-body'].innerHTML, /Thấy Xavi tại Euro 2008/);

  // Toggle done on SR_001 and verify persistence
  detailToggleBtn.click();
  const savedDone = JSON.parse(storage.get('sv_done_D:/Proj/3_YeuCauSource.csv'));
  assert.equal(savedDone.SR_001, true);
  assert.match(elements['sv-summary-pills'].innerHTML, /1\/2/);

  // Search filter narrows list to SR_008
  elements['sv-req-search'].value = 'Busquets';
  elements['sv-req-search'].dispatchEvent({ type: 'input' });
  assert.doesNotMatch(elements['sv-req-tbody'].innerHTML, /SR_001/);
  assert.match(elements['sv-req-tbody'].innerHTML, /SR_008/);

  // Clear search and jump to Coverage filtered by SR_001
  elements['sv-req-search'].value = '';
  elements['sv-req-search'].dispatchEvent({ type: 'input' });
  detailJumpBtn.click();
  assert.equal(elements['sv-panel-coverage'].hidden, false);
  assert.equal(elements['sv-cov-sr-filter-wrap'].hidden, false);
  assert.equal(elements['sv-cov-sr-filter-label'].textContent, 'Lọc: SR_001');
  assert.match(elements['sv-cov-tbody'].innerHTML, /Euro 2008/);
  assert.doesNotMatch(elements['sv-cov-tbody'].innerHTML, /giúp Barça/);
});
