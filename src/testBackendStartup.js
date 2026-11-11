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
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const startup = source.slice(source.indexOf('function startPython()'), source.indexOf('// --- HTTP helper'));

function context(overrides = {}) {
  return vm.createContext({ __dirname: root, process, path, fs, http, spawn,
    console: { log() {}, error() {} }, setTimeout, clearTimeout,
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

test('real project Python starts and serves preview after health readiness', {
  skip: !process.argv.includes('--smoke'), timeout: 40000,
}, async () => {
  // Reserve an ephemeral test port; never touch the running app's port 5599.
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const ctx = context({ PYTHON_PORT: port });
  vm.runInContext(startup, ctx);
  try {
    await ctx.startPython();
    const response = await fetch(`http://127.0.0.1:${port}/api/asset-thumbnail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ element_dir: path.join(root, 'output'), sound_root: path.join(root, 'output') }),
    });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray((await response.json()).items));
  } finally {
    if (ctx.pythonProcess) {
      const closed = once(ctx.pythonProcess, 'close');
      ctx.stopPython();
      await closed;
    }
  }
});
