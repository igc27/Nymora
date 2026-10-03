'use strict';
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { startTorrentFixture } = require('./torrent-fixture.cjs');
async function main() {
  if (spawnSync(process.execPath, ['scripts/test-media.cjs'], { stdio: 'inherit' }).status !== 0) throw new Error('Original QA media generation failed.');
  const fixture = await startTorrentFixture();
  const profile = path.resolve(`.qa/p2p-e2e-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const evidence = []; let app, page, runtime;
  const executablePath = process.env.NYMORA_TEST_EXE || require('electron');
  const status = () => page.evaluate(() => window.nymora.call('playbackStatus'));
  const peerRequests = () => fixture.trackerRequests.filter(url => new URL(url, 'http://localhost').searchParams.get('peer_id') !== Buffer.from(fixture.seeder.peerIdBuffer).toString());
  const passed = (step, details = '') => { evidence.push({ step, result: 'PASS', details }); console.log(`PASS ${step}${details ? ': ' + details : ''}`); };
  async function launch() {
    const env = { ...process.env, NYMORA_DATA_DIR: profile, NYMORA_P2P_TEST_MODE: 'local-only' }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath, args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env, timeout: 45000 });
    page = await app.firstWindow(); page.setDefaultTimeout(45000);
    runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), node: process.versions.node, electron: process.versions.electron, chromium: process.versions.chrome }));
    expect(runtime.version).toBe(require('../package.json').version); expect(Number(runtime.node.split('.')[0])).toBeGreaterThanOrEqual(22);
    await expect(page.getByRole('button', { name: 'Addons', exact: true })).toBeVisible();
    // CI exercises the actual trusted main-process dialog call while supplying
    // explicit tester decisions. No renderer consent flag or engine mock exists.
    await app.evaluate(({ dialog }) => {
      globalThis.nymoraQaNotices = []; globalThis.nymoraQaDecision = null;
      dialog.showMessageBox = async (_owner, options) => {
        globalThis.nymoraQaNotices.push(options);
        return new Promise(resolve => { globalThis.nymoraQaDecision = response => { globalThis.nymoraQaDecision = null; resolve({ response }); }; });
      };
    });
  }
  async function decide(response) { await app.evaluate((_electron, value) => { globalThis.nymoraQaDecision(value); }, response); }
  async function choose(label) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect.poll(async () => (await status()).phase).toBe('awaiting-consent');
    const options = await app.evaluate(() => globalThis.nymoraQaNotices.at(-1));
    expect(options.title).toBe('P2P Streaming Notice'); expect(options.defaultId).toBe(0); expect(options.cancelId).toBe(0); expect(options.buttons).toEqual(['Cancel', 'I Understand — Play']);
    for (const text of ['download and upload', 'IP address', 'authorized', 'legality', 'does not grant permission']) expect(options.detail).toContain(text);
  }
  async function playing() {
    await page.waitForFunction(() => { const video = document.querySelector('video'); return video && !video.paused && video.currentTime > 0.3 && video.getVideoPlaybackQuality().totalVideoFrames > 5; }, null, { timeout: 60000 });
    return page.locator('video').evaluate(video => ({ position: video.currentTime, duration: video.duration, frames: video.getVideoPlaybackQuality().totalVideoFrames, width: video.videoWidth, height: video.videoHeight }));
  }
  try {
    await launch(); expect((await status()).startedSessions).toBe(0); passed('Startup creates no P2P session');
    await page.getByRole('button', { name: 'Addons', exact: true }).click();
    for (const [index, addon] of ['catalog-addon', 'stream-addon', 'subtitle-addon'].entries()) {
      await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/${addon}/manifest.json`); await page.getByRole('button', { name: 'Install addon', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Installed addons (${index + 1})` })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Open Nymora Motion Study' }).click();
    await expect(page.getByText('BitTorrent / P2P · confirmation required')).toHaveCount(3); passed('Addon infoHash, magnet and backend sources share source selection');
    expect(fixture.requests.some(url => url.startsWith('/catalog-addon/meta/'))).toBe(true);
    expect(fixture.requests.some(url => url.startsWith('/stream-addon/stream/'))).toBe(true);
    expect(fixture.requests.some(url => /^\/(stream-addon|subtitle-addon)\/catalog\//.test(url))).toBe(false);
    passed('Separate catalog/meta, stream-only and subtitle-only addons work without required catalogs');
    for (const label of ['Legal P2P infoHash', 'Legal P2P magnet', 'Legal P2P backend']) {
      await choose(label); await page.waitForTimeout(1200);
      expect((await status()).startedSessions).toBe(0); expect(peerRequests()).toHaveLength(0); expect(await page.locator('video').count()).toBe(0);
      await decide(0); await expect(page.getByRole('dialog', { name: 'Preparing playback' })).toBeHidden();
      expect((await status()).startedSessions).toBe(0); expect(peerRequests()).toHaveLength(0); passed(`${label}: pending and Cancel have zero peer discovery, metadata, transfer and playback activity`);
    }
    await choose('Legal P2P infoHash'); await decide(1);
    const first = await playing(); expect(first.width).toBe(640); expect(first.height).toBe(360);
    const progress = await status(); expect(progress.startedSessions).toBe(1); expect(progress.filename).toBe('test.mp4'); expect(progress.downloaded).toBeLessThan(fixture.videoSize); expect(peerRequests().length).toBeGreaterThan(0);
    passed('Confirmed infoHash resolves real peer metadata, selects explicit file and decodes video before full download', JSON.stringify({ ...first, downloaded: progress.downloaded, videoSize: fixture.videoSize }));
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(await page.locator('video').evaluate(v => v.paused)).toBe(true);
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await playing(); passed('P2P pause and resume');
    await page.getByLabel('Volume', { exact: true }).evaluate(node => { node.value = '0.35'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(await page.locator('video').evaluate(video => video.volume)).toBeCloseTo(0.35);
    await page.getByRole('button', { name: 'Mute', exact: true }).click(); expect(await page.locator('video').evaluate(video => video.muted)).toBe(true);
    await page.getByRole('button', { name: 'Unmute', exact: true }).click(); passed('P2P volume and mute controls');
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false); passed('P2P native fullscreen');
    const beforeSeek = await page.locator('video').evaluate(video => ({ frames: video.getVideoPlaybackQuality().totalVideoFrames, buffered: Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]) }));
    const targetBuffered = beforeSeek.buffered.some(([start, end]) => start <= 60 && end >= 60.2);
    await page.getByLabel('Playback position').evaluate(node => { node.value = '60'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(frames => { const video = document.querySelector('video'); return video.currentTime > 60.2 && !video.paused && video.getVideoPlaybackQuality().totalVideoFrames > frames; }, beforeSeek.frames, { timeout: 60000 });
    // Chromium can seek within already-buffered bytes without another request.
    // The integration test separately requires and verifies a future 206 Range.
    passed('Future player seek decodes at the requested position', JSON.stringify({ targetBuffered, beforeSeek }));
    await page.getByLabel('Subtitle track').selectOption({ label: 'English · original test · Nymora legal subtitle addon' }); await expect(page.getByTestId('subtitle-overlay')).toContainText('Original subtitles');
    await page.getByLabel('Subtitle track').selectOption({ label: 'Arabic · العربية · original test · Nymora legal subtitle addon' }); await expect(page.getByTestId('subtitle-overlay')).toContainText('هذه ترجمة عربية أصلية'); passed('English and Arabic addon subtitles work during torrent playback');
    await page.getByLabel('Subtitle delay').fill('1.5'); await page.getByLabel('Subtitle delay').press('Tab');
    await expect.poll(async () => (await page.evaluate(() => window.nymora.call('state'))).settings.subtitleDelay).toBe(1.5);
    await page.getByLabel('Subtitle track').selectOption(''); await expect(page.getByTestId('subtitle-overlay')).toBeEmpty();
    const localSubtitle = path.join(profile, 'original-local.srt'); fs.writeFileSync(localSubtitle, '1\n00:00:00,000 --> 00:01:30,000\nOriginal local subtitle — ترجمة محلية أصلية\n');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, localSubtitle);
    await page.getByRole('button', { name: 'Local subtitle', exact: true }).click(); await expect(page.getByTestId('subtitle-overlay')).toContainText('Original local subtitle');
    await page.getByLabel('Subtitle track').selectOption({ label: 'Arabic · العربية · original test · Nymora legal subtitle addon' }); await expect(page.getByTestId('subtitle-overlay')).toContainText('هذه ترجمة عربية أصلية');
    passed('P2P subtitle delay, Off, local UTF-8 subtitles and switching back to addon tracks');
    fs.mkdirSync('.qa/development/screenshots', { recursive: true }); await page.screenshot({ path: '.qa/development/screenshots/p2p-playback.png' });
    await expect(page.getByTestId('p2p-stats')).toContainText('peers');
    await expect(page.evaluate(() => window.nymora.call('clearTorrentCache'))).rejects.toThrow(/Stop/); passed('Cache cannot be cleared while pieces are serving playback');
    const previousURL = await page.locator('video').evaluate(v => v.src);
    await page.getByRole('button', { name: 'Exit player', exact: true }).click(); await expect(page.locator('video')).toHaveCount(0);
    expect((await status()).phase).toBe('idle'); expect(await fetch(previousURL).catch(() => null)).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'nymora.json'))).progress['movie:nymora:motion'].position).toBeGreaterThan(60); passed('Exit saves torrent progress and closes P2P sockets and streaming endpoint');
    await page.getByRole('button', { name: 'Home', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible();
    await app.close(); await launch(); expect((await status()).startedSessions).toBe(0);
    await page.getByRole('button', { name: 'Open Nymora Motion Study' }).first().click(); await expect(page.getByLabel('Resume saved progress')).toBeChecked();
    await choose('Legal P2P magnet'); expect((await status()).startedSessions).toBe(0); await decide(1); const resumed = await playing(); expect(resumed.position).toBeGreaterThan(59); passed('Magnet playback after restart requires fresh consent and resumes saved position', JSON.stringify(resumed));
    const endedURL = await page.locator('video').evaluate(v => v.src);
    await page.getByLabel('Playback position').evaluate(node => { node.value = '89'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('video').ended);
    await expect.poll(async () => (await status()).phase).toBe('idle');
    expect(await fetch(endedURL).catch(() => null)).toBeNull();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    passed('Natural playback completion saves progress and stops the P2P session');
    await page.getByRole('button', { name: 'Exit player', exact: true }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Open Nymora Test Series' }).click(); await page.getByLabel('Season').selectOption('2'); await page.getByRole('button', { name: /1\. Second Motion/ }).click();
    await choose('Legal P2P backend'); await decide(1); await playing();
    expect(fixture.requests.some(url => url.includes('/stream/series/nymora%3Aseries%3A2%3A1'))).toBe(true);
    await page.getByLabel('Subtitle track').selectOption({ label: 'English · original test · Nymora legal subtitle addon' });
    expect(fixture.requests.some(url => url.includes('/subtitle-addon/subtitles/series/nymora%3Aseries%3A2%3A1'))).toBe(true);
    await page.getByLabel('Playback position').evaluate(node => { node.value = '25'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 25);
    const closed = app.waitForEvent('close'); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await closed;
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'nymora.json'))).progress['series:nymora:series:2:1'].position).toBeGreaterThanOrEqual(25); passed('P2P backend episode playback uses exact ID and native window close saves progress');
    await launch(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const cache = await page.evaluate(() => window.nymora.call('cacheSummary')); expect(cache.bytes).toBeGreaterThan(0); expect(cache.bytes).toBeLessThanOrEqual(2048 * 1024 ** 2);
    await page.getByLabel('Torrent cache limit (MB)').fill('256'); await page.getByRole('button', { name: 'Save cache limit' }).click(); await expect.poll(async () => (await page.evaluate(() => window.nymora.call('cacheSummary'))).limitMB).toBe(256);
    await page.getByRole('button', { name: 'Clear torrent cache' }).click(); await expect(page.getByTestId('cache-size')).toContainText('0 MB'); passed('Bounded cache usage, adjustable limit and Clear torrent cache');
    passed('Complete legal P2P media flow');
  } catch (error) { evidence.push({ result: 'FAIL', error: error.message }); if (page) await page.screenshot({ path: '.qa/p2p-e2e-failure.png' }).catch(() => {}); throw error; }
  finally {
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify({ application: 'Nymora', version: require('../package.json').version, timestamp: new Date().toISOString(), runtime, executablePath, legalMedia: 'Developer-owned generated video; only loopback tracker and seeder; DHT/LSD/port mapping disabled for this isolated test', nativeDialogDecisions: 'Explicit test decisions injected at Electron dialog API; native UI separately inspected', evidence }, null, 2));
    await app?.close().catch(() => {}); await fixture.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
