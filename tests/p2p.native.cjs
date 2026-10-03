'use strict';
const { _electron, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
fs.mkdirSync('.qa/development', { recursive: true });
const { startTorrentFixture } = require('./torrent-fixture.cjs');
const { startPublicFixture } = require('./public-torrent-fixture.cjs');
(async () => {
  const publicTest = process.env.NYMORA_P2P_NATIVE_PUBLIC === '1';
  const fixture = await (publicTest ? startPublicFixture() : startTorrentFixture());
  const profile = path.resolve(`.qa/native-p2p-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: profile, NYMORA_P2P_TEST_MODE: 'local-only' }; delete env.ELECTRON_RUN_AS_NODE;
  if (publicTest) delete env.NYMORA_P2P_TEST_MODE;
  const app = await _electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  try {
    await app.evaluate(({ dialog }) => {
      const original = dialog.showMessageBox.bind(dialog);
      globalThis.nativeP2PResponses = [];
      dialog.showMessageBox = async (...args) => {
        const result = await original(...args);
        globalThis.nativeP2PResponses.push(result.response);
        return result;
      };
    });
    const page = await app.firstWindow(); page.setDefaultTimeout(120000);
    await page.getByRole('button', { name: 'Addons', exact: true }).click(); await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/manifest.json`); await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Installed addons (1)' })).toBeVisible(); await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Open ' + fixture.movie.name }).click();
    await page.locator('button.source').first().click(); console.log('NATIVE CANCEL DIALOG READY');
    await expect(page.getByRole('dialog', { name: 'Preparing playback' })).toBeHidden({ timeout: 120000 });
    console.log('Native response:', await app.evaluate(() => globalThis.nativeP2PResponses));
    expect((await page.evaluate(() => window.nymora.call('playbackStatus'))).startedSessions).toBe(0); console.log('PASS actual native Cancel: no P2P session');
    await page.locator('button.source').nth(publicTest ? 0 : 1).click(); console.log('NATIVE ACCEPT DIALOG READY');
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime > 0.3 && v.getVideoPlaybackQuality().totalVideoFrames > 5; }, null, { timeout: 120000 });
    const decoded = await page.locator('video').evaluate(v => ({ frames: v.getVideoPlaybackQuality().totalVideoFrames, position: v.currentTime }));
    expect((await page.evaluate(() => window.nymora.call('playbackStatus'))).startedSessions).toBe(1);
    const evidence = { result: 'PASS', version: require('../package.json').version, executable: process.env.NYMORA_TEST_EXE ? path.basename(process.env.NYMORA_TEST_EXE) : 'development Electron', nativeCancelStartedSessions: 0, nativeAcceptStartedSessions: 1, decoded, legalLoopbackMediaOnly: !publicTest, publicInternet: publicTest, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(profile, 'native-evidence.json'), JSON.stringify(evidence, null, 2));
    if(publicTest) fs.writeFileSync('.qa/development/public-native-evidence.json',JSON.stringify(evidence,null,2));
    console.log('PASS actual native acceptance starts legal P2P decoded playback', decoded);
  } finally { await app.close(); await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
