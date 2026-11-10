// Run: node --test src/testAssetVerification.js
// Exercise the real renderer handlers without starting Electron or calling the backend.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = renderer.indexOf('const ASSET_DEFAULT_ROOT =');
const end = renderer.indexOf('const KY_NANG_DEFAULT =', start);
assert.ok(start >= 0 && end > start, 'Premiere renderer section must exist');
const premiereScript = new vm.Script(renderer.slice(start, end), { filename: 'renderer.js' });

const completeReport = {
  all_ok: true, total: 1, ok: 1, missing: 0,
  items: [{ kind: 'element', code: 'tv_retro', exists: true,
    path: 'D:\\Elements\\tv.png', references: ['1/1/1'] }],
};
const missingReport = {
  all_ok: false, total: 2, ok: 0, missing: 2,
  items: [
    { kind: 'element', code: 'tv_retro', exists: false,
      path: 'D:\\Elements\\tv.png', message: 'Thiếu file', references: ['1/1/1'] },
    { kind: 'bgm', code: 'soft', exists: false,
      path: 'D:\\Sounds\\soft.mp3', message: 'Thiếu file', references: ['1/1/1', '1/1/2'] },
  ],
};

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  async dispatch(type, event = {}) {
    const payload = { target: this, preventDefault() {}, stopImmediatePropagation() {}, ...event };
    const handlers = [...(this.listeners.get(type) || [])];
    if (this[`on${type}`]) handlers.push(this[`on${type}`]);
    await Promise.all(handlers.map(handler => handler(payload)));
  }
}

class ElementStub extends EventTargetStub {
  constructor(document, tagName = 'div') {
    super();
    this.document = document;
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.classList = {
      add() {}, remove() {}, toggle() {},
    };
    this.descendants = new Map();
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) { return this.descendants.get(selector) || null; }
  focus() { this.document.activeElement = this; }
  click() { return this.dispatch('click'); }
}

function makeHarness({ report = completeReport, verify, generate, saved = {} } = {}) {
  const document = new EventTargetStub();
  document.createElement = tag => new ElementStub(document, tag);
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], document.createElement('div')]));
  const element = id => {
    assert.ok(elements.has(id), `Missing HTML element #${id}`);
    return elements.get(id);
  };
  const button = element('pg-btn-generate');
  button.descendants.set('.btn-generate-content', document.createElement('div'));
  button.descendants.set('.btn-generate-loading', document.createElement('div'));
  element('modal-verify-assets').style.display = 'none';
  const storage = new Map(Object.entries(saved));
  const calls = { verify: [], generate: [], events: [] };
  const csvSelections = ['D:\\Project\\timeline.csv', 'D:\\Project\\plan.csv'];
  const directorySelections = ['D:\\Project\\output'];
  const window = {
    dispatchEvent: event => calls.events.push(event.type),
    api: {
      selectCsvFile: async () => csvSelections.shift(),
      selectVoiceFile: async () => 'D:\\Project\\voice.mp3',
      selectDirectory: async () => directorySelections.shift(),
      verifyAssets: async params => {
        calls.verify.push(structuredClone(params));
        return verify ? verify(params) : structuredClone(report);
      },
      premiereGenerateXml: async params => {
        calls.generate.push(structuredClone(params));
        return generate ? generate(params) : {
          output_path: 'D:\\Project\\output\\demo.xml', total_clips: 2,
          skipped_assets: report.all_ok ? [] : ['element tv_retro', 'bgm soft'],
        };
      },
    },
  };
  const context = vm.createContext({
    document, window, Event,
    $: selector => elements.get(selector.slice(1)) || null,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  });
  premiereScript.runInContext(context);
  context.initPremiereGen();
  return {
    context, document, element, calls, storage, directorySelections,
    click: id => element(id).click(),
    async ready() {
      for (const id of ['pg-btn-timeline-csv', 'pg-btn-source-csv', 'pg-btn-voice', 'pg-btn-output-dir']) {
        await element(id).click();
      }
      assert.equal(button.disabled, false);
      button.focus();
    },
    assertIdle() {
      assert.equal(button.querySelector('.btn-generate-content').style.display, 'flex');
      assert.equal(button.querySelector('.btn-generate-loading').style.display, 'none');
    },
    assertModalClosed() {
      assert.equal(element('modal-verify-assets').style.display, 'none');
      assert.equal(document.listeners.get('keydown')?.size || 0, 0);
      for (const id of ['asset-verify-continue', 'asset-verify-cancel', 'asset-verify-close', 'modal-verify-assets']) {
        assert.equal(element(id).onclick, null);
      }
      assert.equal(document.activeElement, button);
    },
  };
}

const flushAsync = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const action of ['cancel', 'close', 'backdrop', 'Escape']) {
  test(`cancel through ${action} never exports, restores UI, and allows retry`, async () => {
    const h = makeHarness({ report: missingReport });
    await h.ready();
    const generating = h.click('pg-btn-generate');
    await flushAsync();
    assert.equal(h.element('modal-verify-assets').style.display, 'flex');
    assert.equal(h.calls.generate.length, 0);
    if (action === 'Escape') await h.document.dispatch('keydown', { key: 'Escape' });
    else await h.click(action === 'backdrop' ? 'modal-verify-assets' : `asset-verify-${action}`);
    await generating;
    assert.equal(h.calls.generate.length, 0);
    h.assertIdle();
    h.assertModalClosed();

    const retrying = h.click('pg-btn-generate');
    await flushAsync();
    assert.equal(h.calls.verify.length, 2);
    await h.click('asset-verify-continue');
    await retrying;
    assert.equal(h.calls.generate.length, 1);
  });
}

test('missing optional media can continue and verification/export use the chosen roots', async () => {
  const h = makeHarness({ report: missingReport });
  await h.ready();
  h.directorySelections.push('E:\\Kho âm thanh\\Sounds');
  await h.click('pg-btn-sound-root');
  assert.equal(h.storage.get('pg_sound_root'), 'E:\\Kho âm thanh\\Sounds');
  assert.ok(h.calls.events.includes('asset-roots-changed'));
  const generating = h.click('pg-btn-generate');
  await flushAsync();
  assert.equal(h.element('asset-verify-tbody').children.length, 2);
  assert.match(h.element('asset-verify-summary').textContent, /0\/2/);
  assert.match(h.element('asset-verify-continue').textContent, /Vẫn tiếp tục/);
  assert.equal(h.calls.generate.length, 0);
  await h.click('asset-verify-continue');
  await generating;
  assert.equal(h.calls.generate.length, 1);
  assert.equal(h.calls.verify[0].sound_root, 'E:\\Kho âm thanh\\Sounds');
  assert.deepEqual(h.calls.generate[0], h.calls.verify[0]);
  assert.equal(h.element('pg-result-card').style.display, 'block');
  assert.match(h.element('pg-result-summary').innerHTML, /Đã bỏ qua 2/);
  h.assertIdle();
  h.assertModalClosed();
});

test('remembered sound root is reused after initialization', async () => {
  const h = makeHarness({ saved: { pg_sound_root: 'E:\\Previous sounds' } });
  await h.ready();
  assert.equal(h.element('pg-sound-root').value, 'E:\\Previous sounds');
  const generating = h.click('pg-btn-generate');
  await flushAsync();
  await h.click('asset-verify-continue');
  await generating;
  assert.equal(h.calls.verify[0].sound_root, 'E:\\Previous sounds');
  assert.equal(h.calls.generate[0].sound_root, h.calls.verify[0].sound_root);
});

for (const stage of ['verify', 'generate']) {
  for (const failure of ['returned error', 'rejected promise']) {
    test(`${stage} ${failure} logs the error, restores UI, and permits retry`, async () => {
      let attempts = 0;
      const h = makeHarness({
        [stage]: async () => {
          if (++attempts > 1) return stage === 'verify' ? completeReport : { total_clips: 1 };
          if (failure === 'rejected promise') throw new Error('Backend unavailable');
          return { error: 'Backend unavailable' };
        },
      });
      await h.ready();
      const generating = h.click('pg-btn-generate');
      await flushAsync();
      if (stage === 'generate') await h.click('asset-verify-continue');
      await generating;
      h.assertIdle();
      assert.equal(h.element('modal-verify-assets').style.display, 'none');
      assert.equal(h.element('pg-result-card').style.display, 'none');
      assert.ok(h.element('pg-log-messages').children.some(row => row.textContent.includes('Backend unavailable')));
      assert.equal(h.calls.generate.length, stage === 'verify' ? 0 : 1);

      const retrying = h.click('pg-btn-generate');
      await flushAsync();
      await h.click('asset-verify-continue');
      await retrying;
      assert.equal(attempts, 2);
      assert.equal(h.element('pg-result-card').style.display, 'block');
      h.assertIdle();
    });
  }
}

test('repeated generate clicks cannot overlap verification, confirmation, or export', async () => {
  const verification = deferred();
  const exportResult = deferred();
  const h = makeHarness({ verify: () => verification.promise, generate: () => exportResult.promise });
  await h.ready();
  const generating = h.click('pg-btn-generate');
  await h.click('pg-btn-generate');
  assert.equal(h.calls.verify.length, 1);
  verification.resolve(completeReport);
  await flushAsync();
  await h.click('pg-btn-generate');
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.generate.length, 0);
  await h.click('asset-verify-continue');
  await flushAsync();
  await h.click('pg-btn-generate');
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.generate.length, 1);
  exportResult.resolve({ total_clips: 1 });
  await generating;
  h.assertIdle();
});

test('confirmation traps keyboard focus, renders paths as text, and ignores clicks inside the modal', async () => {
  const h = makeHarness();
  const report = structuredClone(missingReport);
  report.items[0].path = '<img src=x onerror="alert(1)">';
  const previous = h.element('pg-btn-generate');
  previous.focus();
  const confirming = h.context.confirmAssetVerification(report);
  assert.equal(h.document.activeElement, h.element('asset-verify-cancel'));
  await h.document.dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(h.document.activeElement, h.element('asset-verify-close'));
  await h.document.dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(h.document.activeElement, h.element('asset-verify-continue'));
  await h.document.dispatch('keydown', { key: 'Tab' });
  assert.equal(h.document.activeElement, h.element('asset-verify-close'));
  const pathCell = h.element('asset-verify-tbody').children[0].children[2];
  assert.equal(pathCell.textContent, report.items[0].path);
  assert.equal(pathCell.innerHTML, '');
  await h.element('modal-verify-assets').dispatch('click', { target: h.element('asset-verify-tbody') });
  assert.equal(h.element('modal-verify-assets').style.display, 'flex');
  await h.click('asset-verify-cancel');
  assert.equal(await confirming, false);
  h.assertModalClosed();
});
