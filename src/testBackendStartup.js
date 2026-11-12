// Run: node --test src/testBackendStartup.js
// Optional real Python smoke test: node src/testBackendStartup.js --smoke
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { PassThrough } = require('node:stream');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const startup = source.slice(source.indexOf('function startPython()'), source.indexOf('// --- HTTP helper'));

function context(overrides = {}) {
  return vm.createContext({ __dirname: root, process, path, fs, http, spawn,
    console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout,
    pythonProcess: null, backendStatus: null, mainWindow: null, PYTHON_PORT: 5599,
    ...overrides });
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };
  return child;
}

test('source analysis has a separate HTTP timeout and a recoverable timeout message', async () => {
  const requests = [], handlers = {};
  const ctx = context({ backendStatus: true, Buffer,
    withSavedAiConfig: params => params,
    ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
    http: { request: (options, callback) => {
      const request = new EventEmitter();
      request.write = () => {};
      request.end = () => {};
      request.destroy = () => { request.destroyed = true; };
      requests.push({ options, request, callback });
      return request;
    } } });
  vm.runInContext(source.slice(source.indexOf('function callPython('), source.indexOf('// --- Window ---')), ctx);
  const start = source.indexOf("ipcMain.handle('suggester-suggest'");
  const end = source.indexOf("ipcMain.handle('suggester-save-examples'", start);
  vm.runInContext(source.slice(start, end), ctx);
  const analysis = handlers['suggester-suggest'](null, { rows: [] });
  assert.equal(requests[0].options.timeout, 900000);
  requests[0].request.emit('timeout');
  assert.equal(requests[0].request.destroyed, true);
  assert.match((await analysis).error, /900 giây.*chạy tiếp/);

  const ordinary = ctx.callPython('/api/health', {});
  assert.equal(requests[1].options.timeout, 300000);
  const response = new EventEmitter();
  response.statusCode = 200;
  requests[1].callback(response);
  response.emit('data', '{"status":"ok"}');
  response.emit('end');
  assert.equal((await ordinary).status, 'ok');

  const quotaRequest = handlers['suggester-suggest'](null, { rows: [] });
  const quotaResponse = new EventEmitter();
  quotaResponse.statusCode = 429;
  requests[2].callback(quotaResponse);
  quotaResponse.emit('data', '{"error":"quota","quota_wait":true,"retry_after_seconds":120}');
  quotaResponse.emit('end');
  const quota = await quotaRequest;
  assert.equal(quota.quota_wait, true);
  assert.equal(quota.retry_after_seconds, 120);

  const failedRequest = handlers['suggester-suggest'](null, { rows: [] });
  const failedResponse = new EventEmitter();
  failedResponse.statusCode = 503;
  requests[3].callback(failedResponse);
  failedResponse.emit('data', '{"error":"all providers unavailable","all_providers_failed":true,"key_status":{"paused":true}}');
  failedResponse.emit('end');
  const failed = await failedRequest;
  assert.equal(failed.all_providers_failed, true);
  assert.equal(failed.key_status.paused, true);
});

test('selects project venv and waits for HTTP health despite early/split ready output', async () => {
  const child = fakeChild();
  let command, options, checks = 0, ready = false;
  const ctx = context({ fs: { existsSync: () => true },
    spawn: (cmd, args, opts) => { command = cmd; options = opts; return child; },
    http: { get: (opts, callback) => {
      checks++;
      const request = new EventEmitter();
      request.destroy = () => {};
      setImmediate(() => {
        if (checks === 1) { request.emit('error', new Error('ECONNREFUSED')); return; }
        const response = new EventEmitter();
        response.statusCode = 200;
        callback(response);
        response.emit('data', '{"status":"ok"}');
        response.emit('end');
      });
      return request;
    } } });
  vm.runInContext(startup, ctx);
  const promise = ctx.startPython().then(() => { ready = true; });
  child.stdout.emit('data', Buffer.from('Server rea'));
  assert.equal(checks, 0);
  child.stdout.emit('data', Buffer.from('dy\n'));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(ready, false);
  await promise;
  assert.equal(checks, 2);
  assert.ok(command.includes('.venv'));
  assert.equal(options.windowsHide, true);
  assert.equal(options.env.PYTHONIOENCODING, 'utf-8');
  assert.equal(options.env.PYTHONUTF8, '1');
  child.emit('close', 1);
  assert.equal(ctx.backendStatus, false);
});

test('reports missing executable without an unhandled child error', async () => {
  const child = fakeChild();
  const ctx = context({ fs: { existsSync: () => false }, spawn: () => child });
  vm.runInContext(startup, ctx);
  const promise = ctx.startPython();
  child.emit('error', new Error('spawn python ENOENT'));
  await assert.rejects(promise, /ENOENT/);
});

test('includes import traceback when Python exits before opening server', async () => {
  const child = fakeChild();
  const ctx = context({ spawn: () => child });
  vm.runInContext(startup, ctx);
  const promise = ctx.startPython();
  child.stderr.emit('data', Buffer.from("ModuleNotFoundError: No module named 'flask'"));
  child.emit('close', 1);
  await assert.rejects(promise, /ModuleNotFoundError.*flask/);
  assert.equal(ctx.pythonProcess, null);
});

test('startup timeout kills only its own child and rejects', async () => {
  const child = fakeChild();
  const ctx = context({ spawn: () => child,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 30000 ? 10 : ms) });
  vm.runInContext(startup, ctx);
  await assert.rejects(ctx.startPython(), /30 giây/);
  assert.equal(child.killed, true);
});

test('stderr splits mixed chunks into warnings, info and real errors without dropping a trailing line', async () => {
  const child = fakeChild();
  const messages = [];
  const ctx = context({ spawn: () => child,
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, message) => messages.push({ channel, message }) } } });
  vm.runInContext(startup, ctx);
  const promise = ctx.startPython();
  child.stderr.emit('data', Buffer.from('WARN'));
  assert.equal(messages.length, 0);
  child.stderr.emit('data', Buffer.from('ING:waitress.queue:Task queue depth is 2\nINFO:waitress:Ready\nERROR:backend:Failed\nModuleNotFoundError: flask'));
  assert.deepEqual(messages.map(item => item.channel), ['python-warning', 'python-log', 'python-error']);
  child.emit('close', 1);
  await assert.rejects(promise, /ModuleNotFoundError/);
  assert.equal(messages.at(-1).channel, 'python-error');
  assert.match(messages.at(-1).message, /ModuleNotFoundError/);
});

test('UTF-8 log characters and routing tags survive byte splits on both streams', async () => {
  const child = fakeChild();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const messages = [], terminal = [];
  const ctx = context({ spawn: () => child,
    console: { log: (...args) => terminal.push(args.join(' ')), error: (...args) => terminal.push(args.join(' ')), warn() {} },
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, message) => messages.push({ channel, message }) } } });
  vm.runInContext(startup, ctx);
  const failed = assert.rejects(ctx.startPython(), /Python thoát/);
  const line = '[GeminiRun:active-run] [AI] Các lựa chọn Gemini được bật chưa thể tiếp tục.';
  for (const byte of Buffer.from(line + '\r\n', 'utf8')) child.stdout.write(Buffer.from([byte]));
  const error = 'ERROR: Máy chủ không phản hồi; đã tạm dừng, giữ kết quả.';
  for (const byte of Buffer.from(error, 'utf8')) child.stderr.write(Buffer.from([byte]));
  child.stdout.end(); child.stderr.end();
  child.emit('close', 1);
  await failed;
  assert.equal(messages.find(item => item.channel === 'python-log').message, line);
  assert.equal(messages.find(item => item.channel === 'python-error').message, error);
  assert.ok(terminal.includes('[Python] ' + line));
  assert.ok(terminal.every(text => !text.includes('\ufffd')));
});

test('backend JSON keeps Vietnamese characters when an HTTP chunk splits UTF-8 bytes', async () => {
  let receive;
  const request = new EventEmitter();
  request.write = request.end = () => {};
  const ctx = context({ backendStatus: true, Buffer,
    http: { request: (options, callback) => { receive = callback; return request; } } });
  vm.runInContext(source.slice(source.indexOf('function callPython('), source.indexOf('// --- Window ---')), ctx);
  const pending = ctx.callPython('/api/source-suggester/suggest', {});
  const response = new PassThrough();
  response.statusCode = 503;
  receive(response);
  const error = 'Key 3 chưa được lưu; đã tạm dừng, giữ kết quả.';
  for (const byte of Buffer.from(JSON.stringify({ error, all_providers_failed: true }))) response.write(Buffer.from([byte]));
  response.end();
  const result = await pending;
  assert.equal(result.error, error);
  assert.equal(result.all_providers_failed, true);
});

test('real project Python starts and serves preview after health readiness', {
  skip: !process.argv.includes('--smoke'), timeout: 40000,
}, async () => {
  // Reserve an ephemeral test port; never touch the running app's port 5599.
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const warnings = [];
  const ctx = context({ PYTHON_PORT: port,
    console: { log() {}, error() {}, warn: (...args) => warnings.push(args.join(' ')) } });
  vm.runInContext(startup, ctx);
  try {
    await ctx.startPython();
    const baseUrl = `http://127.0.0.1:${port}`;
    const librarySmoke = process.argv.includes('--library-smoke');
    const library = 'D:\\Edit SofaZone\\01_Tai_Nguyen_Co_Dinh';
    const response = await fetch(`${baseUrl}/api/asset-thumbnail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ element_dir: librarySmoke ? path.join(library, 'Elements') : path.join(root, 'output'),
        sound_root: librarySmoke ? path.join(library, 'Sounds') : path.join(root, 'output') }),
    });
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.ok(Array.isArray(items));
    if (librarySmoke) {
      const images = items.filter(item => item.exists && item.kind === 'element' && /\.png$/i.test(item.file))
        .sort((a, b) => fs.statSync(b.path).size - fs.statSync(a.path).size).slice(0, 6);
      assert.equal(images.length, 6);
      const began = Date.now();
      const downloads = images.map(async item => {
        const media = await fetch(baseUrl + item.url);
        assert.equal(media.status, 200);
        assert.match(media.headers.get('cache-control'), /max-age=3600/);
        const length = (await media.arrayBuffer()).byteLength;
        assert.equal(length, fs.statSync(item.path).size);
        const cached = await fetch(baseUrl + item.url, { headers: { 'If-None-Match': media.headers.get('etag') } });
        assert.equal(cached.status, 304);
        return length;
      });
      const health = await fetch(baseUrl + '/api/health');
      assert.equal(health.status, 200);
      const bytes = (await Promise.all(downloads)).reduce((sum, length) => sum + length, 0);
      console.log(`Concurrent preview smoke: ${images.length} images, ${bytes} bytes, ${Date.now() - began} ms, health OK; queue warnings: ${warnings.filter(line => line.includes('waitress.queue')).length}`);
    }
  } finally {
    if (ctx.pythonProcess) {
      const closed = once(ctx.pythonProcess, 'close');
      ctx.stopPython();
      await closed;
    }
  }
});
