// Run: node --test src/testAssetPreviewLoading.js
// Exercise the renderer's media lifecycle without starting Electron or a server.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
function section(startMarker, endMarker) {
  const start = renderer.indexOf(startMarker);
  const end = renderer.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing renderer section: ${startMarker}`);
  return renderer.slice(start, end);
}

const previewScript = new vm.Script([
  section('  function releasePreviewMedia(', '  function isVideoMediaUrl('),
  section('  function isVideoMediaUrl(', '  function compressImageToDataUrl('),
  section('  function openClsImageModal(', '  function renderClassificationTables('),
].join('\n'), { filename: 'renderer.js' });
const lockScript = new vm.Script(
  section('  function setSrcLocked(', '  let pendingImgTarget ='),
  { filename: 'renderer.js' },
);

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type) { for (const handler of this.listeners.get(type) || []) handler(); }
}

class MediaStub extends EventTargetStub {
  constructor(url) {
    super();
    this.attributes = new Map();
    this.dataset = {};
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.requests = [];
    if (url) this.src = url;
  }
  set src(value) { this.attributes.set('src', value); this.requests.push(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  play() { this.playCalls++; return this.playResult || Promise.resolve(); }
  pause() { this.pauseCalls++; }
  load() { this.loadCalls++; }
}

function makeButton(tbl, code) {
  const classes = new Set();
  return {
    dataset: { tbl, code }, textContent: '▶ Nghe', title: 'Nghe thử',
    classList: {
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}

function makeHarness() {
  const videos = [];
  const audios = [];
  const audioOutcomes = [];
  const buttons = [makeButton('bgm', 'shared'), makeButton('sfx', 'shared')];
  const calls = { logs: [], lightbox: [] };
  const sgDom = {
    clsCard: {
      querySelectorAll(selector) {
        if (selector === 'video.sg-cls-thumb') return videos;
        if (selector === '.sg-audio-play-btn') return buttons;
        throw new Error(`Unexpected selector ${selector}`);
      },
    },
    modalClsImg: { style: {} },
    modalClsVideoPreview: new MediaStub(),
  };
  const assetPreviews = new Map([
    ['element/video', { url: 'http://localhost/video.mp4' }],
    ['element/image', { url: 'http://localhost/image.png' }],
    ['bgm/shared', { url: 'http://localhost/bgm.mp3', exists: true }],
    ['sfx/shared', { url: 'http://localhost/sfx.mp3', exists: true }],
  ]);
  const context = vm.createContext({
    sgDom, assetPreviews, activeLightbox: null,
    Audio: class extends MediaStub {
      constructor(url) { super(url); this.playResult = audioOutcomes.shift(); audios.push(this); }
    },
    sgLog: (...args) => calls.logs.push(args),
    updateLightboxModalView() {
      calls.lightbox.push(videos.map(video => video.getAttribute('src')));
    },
    renderClassificationTables() { assert.fail('Playing audio must not recreate classification tables'); },
  });
  previewScript.runInContext(context);
  return { context, sgDom, assetPreviews, videos, audios, audioOutcomes, buttons, calls };
}

test('classification video has no request URL until hover; images load lazily', () => {
  const h = makeHarness();
  const markup = h.context.renderImgCellHtml('el', 0, { code: 'video' });
  const videoTag = markup.match(/<video\b[^>]*>/)[0];
  assert.doesNotMatch(videoTag, /\ssrc=/);
  assert.match(videoTag, /data-src="http:\/\/localhost\/video\.mp4"/);
  assert.match(videoTag, /preload="none"/);
  const imageMarkup = h.context.renderImgCellHtml('el', 1, { code: 'image' });
  assert.match(imageMarkup, /loading="lazy"/);
  assert.match(imageMarkup, /decoding="async"/);

  const video = new MediaStub();
  video.dataset.src = 'http://localhost/video.mp4';
  const wrap = new EventTargetStub();
  h.context.bindThumbnailVideoPreview(wrap, video);
  assert.deepEqual(video.requests, []);
  wrap.dispatch('mouseenter');
  assert.equal(video.getAttribute('src'), video.dataset.src);
  assert.equal(video.playCalls, 1);
  wrap.dispatch('mouseleave');
  assert.equal(video.getAttribute('src'), null);
  assert.equal(video.pauseCalls, 1);
  assert.equal(video.loadCalls, 1, 'Removing src must also abort the download');
  wrap.dispatch('mouseenter');
  assert.equal(video.getAttribute('src'), video.dataset.src);
  assert.equal(video.playCalls, 2, 'Hover can restart after the old download is released');
});

test('opening a lightbox releases thumbnail streams before starting its own preview', () => {
  const h = makeHarness();
  h.videos.push(new MediaStub('http://localhost/first.mp4'), new MediaStub());
  h.context.openClsImageModal('el', 0);
  assert.deepEqual(h.calls.lightbox, [[null, null]]);
  assert.equal(h.videos[0].loadCalls, 1);
  assert.equal(h.videos[1].loadCalls, 0, 'An unused thumbnail needs no media reload');
  assert.equal(h.sgDom.modalClsImg.style.display, 'flex');
  h.sgDom.modalClsVideoPreview.src = 'http://localhost/full.mp4';
  h.context.closeClsImageModal();
  assert.equal(h.sgDom.modalClsVideoPreview.getAttribute('src'), null);
  assert.equal(h.sgDom.modalClsVideoPreview.loadCalls, 1);
  assert.equal(h.sgDom.modalClsImg.style.display, 'none');
});

test('audio start, stop, switch and end update only buttons and release streams', () => {
  const h = makeHarness();
  h.context.toggleAudioPreview('bgm', 'shared', 'bgm.mp3');
  assert.equal(h.audios.length, 1);
  assert.equal(h.buttons[0].classList.contains('is-playing'), true);
  assert.equal(h.buttons[1].classList.contains('is-playing'), false);
  assert.equal(h.buttons[0].title, 'Dừng phát');
  h.context.toggleAudioPreview('sfx', 'shared', 'sfx.mp3');
  assert.equal(h.audios.length, 2, 'Matching codes in different tables are different media');
  assert.equal(h.audios[0].getAttribute('src'), null);
  assert.equal(h.audios[0].loadCalls, 1);
  assert.equal(h.buttons[0].textContent, '▶ Nghe');
  assert.equal(h.buttons[1].textContent, '⏹ Dừng');
  h.audios[0].dispatch('ended');
  assert.equal(h.buttons[1].textContent, '⏹ Dừng', 'Old events must not reset the new player');
  h.audios[1].dispatch('ended');
  assert.equal(h.buttons[1].textContent, '▶ Nghe');
  assert.equal(h.audios[1].getAttribute('src'), null);
  h.context.toggleAudioPreview('bgm', 'shared', 'bgm.mp3');
  h.context.toggleAudioPreview('bgm', 'shared', 'bgm.mp3');
  assert.equal(h.audios.length, 3);
  assert.equal(h.audios[2].getAttribute('src'), null);
  assert.equal(h.buttons[0].classList.contains('is-playing'), false);
});

test('play failure restores audio buttons; canceled old playback cannot affect its replacement', async () => {
  const h = makeHarness();
  let rejectOld;
  h.audioOutcomes.push(new Promise((resolve, reject) => { rejectOld = reject; }));
  h.context.toggleAudioPreview('bgm', 'shared', 'bgm.mp3');
  h.context.toggleAudioPreview('sfx', 'shared', 'sfx.mp3');
  rejectOld(new Error('Playback aborted by stop'));
  await Promise.resolve();
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.buttons[1].textContent, '⏹ Dừng');
  h.context.toggleAudioPreview('sfx', 'shared', 'sfx.mp3');
  h.audioOutcomes.push(Promise.reject(new Error('Unsupported audio')));
  h.context.toggleAudioPreview('bgm', 'shared', 'bgm.mp3');
  await Promise.resolve();
  assert.equal(h.calls.logs.length, 1);
  assert.match(h.calls.logs[0][0], /Unsupported audio/);
  assert.equal(h.buttons[0].textContent, '▶ Nghe');
  assert.equal(h.audios[2].getAttribute('src'), null);
});

test('locking all five classification panels renders once and supports an existing batch', () => {
  let renders = 0;
  const sgState = { clsCollapsed: false };
  const context = vm.createContext({
    sgState, sgDom: {}, document: { querySelectorAll: () => [] },
    renderClassificationTables() { renders++; },
    setClsCollapsed(value) { sgState.clsCollapsed = value; },
  });
  lockScript.runInContext(context);
  context.setClsLocked(true);
  assert.equal(renders, 1);
  for (const type of ['src', 'el', 'anim', 'bgm', 'sfx']) assert.equal(sgState[`${type}Locked`], true);
  context.setClsLocked(false, false);
  assert.equal(renders, 1, 'Batch caller can render later after syncing the other UI');
  for (const type of ['src', 'el', 'anim', 'bgm', 'sfx']) assert.equal(sgState[`${type}Locked`], false);
  context.setSrcLocked(true);
  assert.equal(renders, 2, 'Single-panel actions still render immediately');
});
