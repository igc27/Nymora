'use strict';
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
class TorrentHelper extends EventEmitter {
  constructor(executable) { super(); this.executable = executable || path.resolve(__dirname, '../native/bin/nymora-torrent-helper.exe'); this.child = null; this.stopping = false; this.base = null; this.authorization = null; this.pending = new Set(); }
  async boot() {
    if (this.child) return;
    this.stopping = false;
    const child = spawn(this.executable, [], { windowsHide: true, stdio: ['pipe','pipe','pipe'], env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } });
    this.child = child;
    const consume = (stream, event, max) => { let pending = ''; stream.on('data', chunk => { pending += chunk.toString(); let split; while ((split = pending.indexOf('\n')) !== -1) { const line = pending.slice(0, split); pending = pending.slice(split + 1); if (line.length > max) { child.kill(); return; } try { this.emit(event, JSON.parse(line)); } catch {} } if (pending.length > max) child.kill(); }); };
    consume(child.stdout, 'message', 16 * 1024 ** 2); consume(child.stderr, 'log', 65536);
    const exited = code => {
      if (this.child !== child) return;
      this.child = null; this.base = null; this.authorization = null;
      this.pending.forEach(reject => reject(new Error(this.stopping ? 'P2P preparation was cancelled.' : 'P2P engine stopped unexpectedly.'))); this.pending.clear();
      if (!this.stopping) this.emit('failure', code);
    };
    child.once('error', () => exited('ENGINE_STARTUP_FAILURE')); child.once('exit', () => exited('ENGINE_CRASH'));
    const idle = await this.wait('idle', 10000);
    if (idle.version !== '1.0.2' || idle.engine !== 'librqbit 9.0.1') throw new Error('Unexpected P2P helper version.');
  }
  wait(event, timeout) {
    return new Promise((resolve, reject) => {
      const finish = (error, message) => { clearTimeout(timer); this.removeListener('message', receive); this.pending.delete(cancel); error ? reject(error) : resolve(message); };
      const receive = message => { if (message.event === event) finish(null, message); else if (message.event === 'resolve-error') finish(new Error('Torrent metadata exchange failed.')); };
      const cancel = error => finish(error);
      const timer = setTimeout(() => finish(new Error(`P2P engine ${event === 'metadata' ? 'metadata' : 'startup'} timeout.`)), timeout);
      this.pending.add(cancel); this.on('message', receive);
    });
  }
  send(command) { if (!this.child || this.child.stdin.destroyed) throw new Error('P2P engine is unavailable.'); this.child.stdin.write(JSON.stringify(command) + '\n'); }
  async start(directory, source, localOnly) {
    await this.boot(); const password = randomBytes(32).toString('hex');
    const listening = this.wait('listening', 10000);
    this.send({ command: 'start', directory, password, local_only: localOnly, dht_nodes: source.dhtNodes.map(node => `${node.host}:${node.port}`) });
    const { port } = await listening;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid P2P engine endpoint.');
    this.base = `http://127.0.0.1:${port}`; this.authorization = 'Basic ' + Buffer.from(`nymora:${password}`).toString('base64');
    const health = await this.request('/'); if (health.server !== 'rqbit' || health.version !== '9.0.1') throw new Error('Unexpected P2P engine version.');
  }
  async request(route, options = {}, binary = false) {
    if (!this.base) throw new Error('P2P engine is unavailable.');
    const response = await fetch(this.base + route, { ...options, headers: { ...options.headers, Authorization: this.authorization }, signal: options.signal || AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`P2P engine request failed (HTTP ${response.status}).`); }
    return binary ? response : response.json();
  }
  async resolve(source, timeout) {
    const resolved = this.wait('metadata', timeout);
    this.send({ command: 'resolve', magnet: source.magnet, initial_peers: source.peerAddresses || [] });
    return resolved;
  }
  async close() {
    this.stopping = true; this.pending.forEach(reject => reject(new Error('P2P preparation was cancelled.'))); this.pending.clear();
    const child = this.child; if (!child) return;
    await new Promise(resolve => { const timer = setTimeout(() => child.kill(), 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end('{"command":"stop"}\n'); });
  }
}
module.exports = { TorrentHelper };
