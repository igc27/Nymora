'use strict';
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startBodyFixture } = require('./body-fixture.cjs');
(async () => {
  const fixture = await startBodyFixture();
  const profile = path.resolve(`.qa/redirect-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  try {
    await app.firstWindow();
    const result = await app.evaluate(async ({ app }, base) => {
      const requireApp = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const network = requireApp('./src/network.cjs');
      const sameOrigin = await network.json(`${base}/auth/stream/movie/id.json`, { headers: { Authorization: 'Bearer synthetic-qa' } });
      const value = await network.json(`${base}/redirect-auth/stream/movie/id.json`, { headers: { Authorization: 'Bearer synthetic-qa', Cookie: 'synthetic=qa' } });
      return { installed: app.isPackaged, version: app.getVersion(), sameOrigin, ...value };
    }, fixture.base);
    expect(result.sameOrigin.authorization).toBe(true); expect(result.authorization).toBe(false); expect(result.cookie).toBe(false);
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(result, null, 2));
    console.log('PASS native Chromium redirects strip cross-origin authorization and cookies', result);
  } finally { await app.close(); await fixture.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
