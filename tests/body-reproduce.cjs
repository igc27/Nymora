'use strict';
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startBodyFixture } = require('./body-fixture.cjs');
(async () => {
  const fixture = await startBodyFixture({ firstChunkDelayMs: 9000 });
  const profile = path.resolve(`.qa/body-reproduce-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  try {
    await app.firstWindow();
    const evidence = await app.evaluate(async ({ app, session }, base) => {
      const requireApp = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const network = requireApp('./src/network.cjs');
      const updates = [], started = performance.now(); let code;
      try { await network.json(`${base}/delayed/stream/movie/nymora%3Amotion.json`, { onDiagnostic: d => updates.push(d) }); } catch (e) { code = e.code; }
      const implementation = { realElapsedMs: Math.round(performance.now() - started), code, updates };
      const response = await session.fromPartition('nymora-addon-http').fetch(`${base}/delayed/stream/movie/nymora%3Amotion.json`);
      const baseline = JSON.parse(await response.text());
      return { installed: app.isPackaged, appVersion: app.getVersion(), implementation, standardResponseTextStreams: baseline.streams.length };
    }, fixture.base);
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
  } finally { await app.close(); await fixture.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
