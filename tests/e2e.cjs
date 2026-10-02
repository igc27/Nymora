'use strict';
const { _electron: electron, expect } = require(process.env.NYMORA_PLAYWRIGHT_MODULE || '@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixture } = require('./fixture.cjs');
const { spawnSync } = require('node:child_process');
async function main() {
  const media = spawnSync(process.execPath, ['scripts/test-media.cjs'], { stdio: 'inherit' });
  if (media.status !== 0) throw new Error('Test media generation failed.');
  const fixture = await startFixture();
  const profile = process.env.NYMORA_TEST_PROFILE || path.resolve(`.qa/e2e-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync('docs/screenshots', { recursive: true });
  const evidence = []; let app, page;
  const executablePath = process.env.NYMORA_TEST_RUNTIME || process.env.NYMORA_TEST_EXE || require('electron');
  async function launch() {
    const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath, args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env, timeout: 45000 });
    page = await app.firstWindow(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => { evidence.push({ warning: error.message }); console.error('Renderer error:', error.message); });
    await expect(page.getByRole('button', { name: 'Addons', exact: true })).toBeVisible();
  }
  function passed(step, details = '') { evidence.push({ step, result: 'PASS', details }); console.log(`PASS ${step}${details ? `: ${details}` : ''}`); }
  async function nav(name) { await page.getByRole('button', { name, exact: true }).click(); }
  async function playback(label) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime > 0.3 && v.getVideoPlaybackQuality().totalVideoFrames > 5; }, { timeout: 20000 });
    const decoded = await page.locator('video').evaluate(v => ({ position: v.currentTime, duration: v.duration, decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames, dimensions: [v.videoWidth, v.videoHeight] }));
    passed(`Decoded ${label} playback`, JSON.stringify(decoded));
  }
  try {
    await launch(); passed('Fresh startup with no installed addons');
    await page.screenshot({ path: 'docs/screenshots/home-empty.png' });
    await nav('Addons');
    await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/invalid/manifest.json`);
    await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid addon manifest'); passed('Invalid manifest visible error');
    await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/manifest.json`);
    await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Installed addons (1)' })).toBeVisible(); passed('Addon installed');
    await app.close(); await launch(); await nav('Addons');
    await expect(page.getByRole('heading', { name: 'Installed addons (1)' })).toBeVisible(); passed('Addon survives application restart');
    await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/broken/manifest.json`);
    await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Installed addons (2)' })).toBeVisible();
    await nav('Home'); await expect(page.getByRole('button', { name: 'Open Nymora Motion Study' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open Nymora Test Series' })).toBeVisible();
    passed('Real movie and series addon catalogs load'); await page.screenshot({ path: 'docs/screenshots/catalogs.png' });
    await nav('Discover'); await expect(page.getByLabel('Catalog')).toBeVisible(); await page.getByLabel('Catalog').selectOption('1'); await expect(page.getByRole('button', { name: 'Open Nymora Test Series' })).toBeVisible();
    await page.getByRole('button', { name: 'Load more', exact: true }).click(); await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeHidden(); passed('Catalog switching, declared genre filter, skip pagination');
    await nav('Search'); await page.getByLabel('Search titles').fill('Nymora'); await page.getByRole('button', { name: 'Search', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Open Nymora Motion Study' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open Nymora Test Series' })).toBeVisible(); passed('Addon search returns movie and series');
    await page.getByRole('button', { name: 'Open Nymora Motion Study' }).click(); await expect(page.getByRole('heading', { name: 'Nymora Motion Study', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('HTTP 503'); passed('Network failure visible while another addon still supplies streams');
    await page.getByRole('button', { name: 'Save to Library' }).click(); passed('Movie details and Library save');
    await playback('Generated MP4');
    await page.getByLabel('Playback position').evaluate(node => { node.value = '10'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 10); passed('Seeking works');
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForFunction(() => document.querySelector('video').paused); passed('Pause');
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('video').paused); passed('Resume');
    await page.getByLabel('Volume', { exact: true }).evaluate(node => { node.value = '0.3'; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(await page.locator('video').evaluate(v => v.volume)).toBeCloseTo(0.3); await page.getByRole('button', { name: 'Mute', exact: true }).click(); expect(await page.locator('video').evaluate(v => v.muted)).toBe(true); await page.getByRole('button', { name: 'Unmute', exact: true }).click(); passed('Volume and mute controls');
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true); passed('Native fullscreen');
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
    await page.getByLabel('Subtitle track').selectOption({ label: 'English · original test · Nymora legal test addon' });
    await expect(page.getByTestId('subtitle-overlay')).toContainText('Welcome to Nymora'); passed('English addon subtitle rendered');
    await page.getByLabel('Subtitle track').selectOption({ label: 'Arabic · العربية · original test · Nymora legal test addon' });
    await expect(page.getByTestId('subtitle-overlay')).toContainText('مرحباً بكم في نيمورا');
    expect(await page.getByTestId('subtitle-overlay').evaluate(n => getComputedStyle(n).unicodeBidi)).toBe('plaintext');
    await page.screenshot({ path: 'docs/screenshots/arabic-playback.png' }); passed('Arabic Unicode subtitle rendered with automatic RTL');
    await page.getByLabel('Player subtitle size').evaluate(node => { node.value = '42'; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.getByLabel('Subtitle delay').fill('1.5'); await page.getByLabel('Subtitle delay').press('Tab');
    expect(await page.getByTestId('subtitle-overlay').evaluate(n => getComputedStyle(n).fontSize)).toBe('42px'); passed('Subtitle size and delay settings');
    await page.getByLabel('Subtitle track').selectOption(''); await expect(page.getByTestId('subtitle-overlay')).toBeEmpty(); passed('Subtitles can be disabled');
    await page.getByRole('button', { name: 'Exit player', exact: true }).click();
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'nymora.json'), 'utf8'));
    expect(saved.progress['movie:nymora:motion'].position).toBeGreaterThan(10); passed('Progress saved to disk');
    await nav('Home'); await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible(); passed('Continue Watching');
    await app.close(); await launch(); await nav('Home'); await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Nymora Motion Study' }).first().click(); await expect(page.getByLabel('Resume saved progress')).toBeChecked();
    await playback('Generated WebM'); expect(await page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(9); passed('Resume position survives restart');
    await page.getByRole('button', { name: 'Exit player', exact: true }).click(); await playback('Generated HLS'); passed('HLS playlist/segment playback');
    await page.getByRole('button', { name: 'Exit player', exact: true }).click(); await nav('Home'); await page.getByRole('button', { name: 'Open Nymora Test Series' }).click();
    await page.getByLabel('Season').selectOption('2'); await page.getByRole('button', { name: /1\. Second Motion/ }).click(); await playback('Generated MP4');
    expect(fixture.requests.some(r => r.includes('/stream/series/nymora%3Aseries%3A2%3A1'))).toBe(true); passed('Season selection and exact episode stream ID');
    await page.getByLabel('Playback position').evaluate(node => { node.value = '25'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 25);
    const nativeClosed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); }); await nativeClosed;
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'nymora.json'), 'utf8')).progress['series:nymora:series:2:1'].position).toBeGreaterThanOrEqual(25); passed('Episode progress saved');
    await launch(); await nav('Home'); await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible(); passed('Closing the native window saves active playback');
    await nav('Library'); await expect(page.getByRole('button', { name: 'Open Nymora Motion Study' })).toBeVisible(); passed('Library persists');
    await nav('Settings'); expect(await page.getByLabel('Preferred subtitle language').inputValue()).toBe('ara'); passed('Preferred subtitle language persists');
    await nav('Addons');
    for (const count of [1, 0]) { await page.getByRole('button', { name: 'Remove', exact: true }).first().click(); await expect(page.getByRole('heading', { name: `Installed addons (${count})` })).toBeVisible(); }
    passed('Addon removal');
    passed('End-to-end core media flow');
  } catch (error) {
    evidence.push({ result: 'FAIL', error: error.stack });
    if (page) { await page.screenshot({ path: '.qa/e2e-failure.png' }).catch(() => {}); console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 5000)); }
    throw error;
  } finally {
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify({ executablePath, profile, timestamp: new Date().toISOString(), evidence, requests: fixture.requests }, null, 2));
    await app?.close().catch(() => {}); await fixture.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
