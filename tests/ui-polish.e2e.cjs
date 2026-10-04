'use strict';
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { startFixture, movie, series, manifest } = require('./fixture.cjs');
const { defaults } = require('../src/store.cjs');
(async () => {
  const fixture = await startFixture(), profile = path.resolve('.qa/ui-polish-' + Date.now()), checks = [];
  fs.mkdirSync(profile, { recursive: true }); let app, page, base;
  const failureManifest = { id: 'org.nymora.optional-ui', name: 'Optional QA provider', version: '1.0.0', description: 'UI failure fixture', types: ['movie'], resources: ['catalog', 'stream'], catalogs: [{ id: 'one', type: 'movie', extra: [{ name: 'search' }] }, { id: 'two', type: 'movie', extra: [{ name: 'search' }] }] };
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/manifest.json') return res.end(JSON.stringify(failureManifest));
    if (req.url.startsWith('/catalog/') && !req.url.includes('search')) return res.end('{"metas":[]}');
    res.writeHead(500); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const seeded = defaults(); seeded.addons = [{ manifest, transportUrl: fixture.base + '/manifest.json' }, { manifest: failureManifest, transportUrl: base + '/manifest.json' }]; seeded.settings.startupSound = true;
  fs.writeFileSync(path.join(profile, 'nymora.json'), JSON.stringify(seeded));
  const pass = step => { checks.push({ step, result: 'PASS' }); console.log('PASS ' + step); };
  const nav = name => page.getByRole('button', { name, exact: true }).click();
  const settings = async name => { await nav('Settings'); await nav(name + ' settings'); };
  const reveal = async () => { await page.mouse.move(600, 300); await page.mouse.move(610, 300); };
  const exit = async () => { await page.locator('.player-layer').focus(); await page.keyboard.press('Escape'); await reveal(); await nav('Exit player'); };
  const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  async function launch() {
    const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env, timeout: 45000 });
    page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', e => checks.push({ result: 'FAIL', error: e.message }));
  }
  try {
    await launch(); await expect(page.locator('#startup-intro')).toBeVisible(); await page.waitForLoadState('domcontentloaded');
    const boot = await page.evaluate(() => ({ settings: window.nymora.startup, sound: !!window.nymoraStartupAudio, firstPaint: performance.getEntriesByType('paint').map(p => ({ name: p.name, time: p.startTime })), intro: !!document.getElementById('startup-intro') }));
    expect(boot.settings).toEqual({ intro: true, sound: true }); expect(boot.sound).toBe(true);
    await page.screenshot({ path: path.join(profile, 'first-intro.png') }); checks.push({ boot });
    await expect(page.locator('#startup-intro')).toHaveCount(0, { timeout: 2000 }); await expect.poll(() => page.evaluate(() => window.nymoraStartupAudio === null)).toBe(true);
    pass('Initial HTML intro precedes Home reveal; enabled bundled startup sound completes');
    expect(await page.locator('body').innerText()).not.toContain('YOUR SCREEN. YOUR SOURCES.'); await expect(page.locator('.page-back')).toHaveCount(0);
    const first = page.getByRole('button', { name: 'Open ' + movie.name, exact: true }); await first.hover();
    const preview = page.locator('.hover-preview'); await expect(preview).toBeVisible();
    const a = await first.boundingBox(), b = await preview.boundingBox(); expect(overlap(a, b)).toBe(false);
    await preview.getByRole('button', { name: 'Add to Watchlist', exact: true }).click(); await expect(preview.getByRole('button', { name: 'Remove from Watchlist' })).toBeVisible();
    await preview.getByRole('button', { name: 'Mark Watched', exact: true }).click(); await expect(preview.getByRole('button', { name: 'Mark Unwatched' })).toBeVisible();
    await expect(page.locator('main h1')).toHaveText('Home'); expect((await page.evaluate(() => window.nymora.call('state'))).library).toHaveLength(1);
    await page.screenshot({ path: path.join(profile, 'external-preview.png') }); await preview.getByRole('button', { name: 'Mark Unwatched' }).click();
    await page.mouse.move(15, 40); await expect(preview).toHaveCount(0); await first.focus(); await expect(preview).toBeVisible(); await page.keyboard.press('Tab'); await expect(preview.getByRole('button').first()).toBeFocused(); await page.keyboard.press('Escape');
    pass('External preview never overlaps target; Watchlist/Watched actions work in place and via keyboard');
    await settings('Home'); const rows = page.locator('.catalog-setting-row'), original = await rows.evaluateAll(nodes => nodes.map(n => n.dataset.catalogKey));
    expect(await page.locator('.catalog-settings').evaluate(n => [...(function*() { const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (w.nextNode()) yield w.currentNode.textContent.trim(); })()].filter(t => /^(true|false|null|undefined|\[object Object\])$/.test(t)))).toEqual([]);
    const grip = await rows.first().locator('.catalog-grip').boundingBox(), destination = await rows.nth(1).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(destination.x + 30, destination.y + destination.height - 5, { steps: 12 });
    await expect(page.locator('.drop-after')).toHaveCount(1); await page.screenshot({ path: path.join(profile, 'catalog-drop-line.png') }); await page.mouse.up();
    await expect.poll(() => rows.first().getAttribute('data-catalog-key')).toBe(original[1]); expect((await page.evaluate(() => window.nymora.call('state'))).settings.homeCatalogOrder[0]).toBe(original[1]);
    await nav('Home'); await expect.poll(() => page.locator('.catalog-row').first().getAttribute('data-catalog-key')).toBe(original[1]); pass('Pointer drag on six-dot handle shows insertion line, reorders and immediately persists without raw booleans');
    await settings('General'); await nav('Back to Settings'); await expect(page.locator('.settings-category')).toHaveCount(9); await nav('Player settings'); await page.locator('main h1').focus(); await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Alt+ArrowLeft'); await expect(page.locator('.settings-category')).toHaveCount(9);
    await nav('Search'); await page.getByLabel('Search titles').fill('Nymora'); await page.locator('form').getByRole('button', { name: 'Search' }).click(); await expect(first).toBeVisible(); await expect(page.locator('.provider-notices')).toHaveCount(1); await expect(page.locator('.provider-notices .addon-warning')).toHaveCount(1); await expect(page.locator('.error')).toHaveCount(0);
    await first.click(); await expect(page.locator('.hero-copy .title-actions')).toBeVisible(); const actionBox = await page.locator('.hero-copy .title-actions').boundingBox(), descriptionBox = await page.locator('.hero-copy .synopsis').boundingBox(); expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(descriptionBox.y);
    await expect(page.locator('.sources .provider-notices summary')).toContainText('Source notices (1)'); await expect(page.locator('.sources .addon-warning')).toBeHidden(); await page.locator('.sources summary').click(); await expect(page.locator('.sources .addon-warning')).toContainText('HTTP 500');
    await nav('Back'); await expect(page.getByLabel('Search titles')).toHaveValue('Nymora'); await expect(first).toBeVisible(); await page.getByLabel('Search titles').focus(); await page.keyboard.press('Backspace'); await expect(page.getByLabel('Search titles')).toHaveValue('Nymor'); await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Backspace'); await expect(page.locator('main h1')).toHaveText('Settings');
    pass('Real Back history restores search; typing is protected; optional errors deduplicate into compact disclosures; hero actions precede synopsis');
    await settings('Player');
    await page.getByLabel('Default Video Fit').selectOption('fill'); await page.getByLabel('Start playback fullscreen').check(); await page.getByLabel('Skip interval', { exact: true }).selectOption('15'); await page.getByLabel('Player controls auto-hide').selectOption('0'); await page.getByLabel('Hold Space for 2×').uncheck(); await page.getByLabel('Default playback speed').selectOption('.75'.replace(/^\./, '0.')); await page.getByLabel('Autoplay next episode').check(); await page.getByLabel('Resume playback', { exact: true }).selectOption('restart'); await page.getByLabel('Show P2P statistics in player').uncheck();
    await nav('Home'); await first.click(); await page.getByRole('button', { name: /Generated MP4/ }).click(); await page.waitForFunction(() => document.querySelector('video')?.currentTime > .3);
    await expect(page.locator('body')).toHaveClass(/player-fullscreen/); await expect(page.locator('.window-titlebar')).toBeHidden(); await expect(page.locator('.sidebar')).toBeHidden();
    const native = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; return { fullscreen: w.isFullScreen(), bounds: w.getBounds(), content: w.getContentBounds(), display: screen.getDisplayMatching(w.getBounds()).bounds }; }); expect(native.fullscreen).toBe(true); expect(native.bounds).toEqual(native.display); expect(native.content).toEqual(native.display); checks.push({ native });
    const vp = await page.locator('video').evaluate(v => ({ width: v.getBoundingClientRect().width, height: v.getBoundingClientRect().height, viewportWidth: innerWidth, viewportHeight: innerHeight, fit: getComputedStyle(v).objectFit, speed: v.playbackRate })); expect(vp.width).toBe(vp.viewportWidth); expect(vp.height).toBe(vp.viewportHeight); expect(vp.fit).toBe('cover'); expect(vp.speed).toBe(.75);
    await page.screenshot({ path: path.join(profile, 'true-fullscreen-fill.png') }); await page.locator('.player-layer').focus(); await page.keyboard.press('Escape'); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false); await expect(page.locator('body')).not.toHaveClass(/player-fullscreen/);
    if (process.env.NYMORA_NATIVE_INSPECTION === '1') { fs.writeFileSync('.qa/native-inspection-ready.json', JSON.stringify({ profile, native })); await page.waitForFunction(() => window.nymoraInspectionDone === true, null, { timeout: 300000 }); }
    await page.locator('.player-layer').focus(); await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ب', bubbles: true }))); await expect(page.locator('body')).toHaveClass(/player-fullscreen/); await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await expect(page.locator('body')).not.toHaveClass(/player-fullscreen/);
    for (let attempt = 0; attempt < 3; attempt++) { await page.keyboard.press('f'); await page.keyboard.press('Escape'); await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false); await expect(page.locator('body')).not.toHaveClass(/player-fullscreen/); }
    await page.locator('.player-layer').focus(); await page.keyboard.down('Space'); await page.waitForTimeout(500); expect(await page.locator('video').evaluate(v => v.playbackRate)).toBe(.75); await expect(page.getByTestId('speed-indicator')).toBeHidden(); await page.keyboard.up('Space'); expect(await page.locator('video').evaluate(v => v.paused)).toBe(true); await page.keyboard.press('Space');
    await page.locator('video').evaluate(v => { v.currentTime = 10; }); await page.keyboard.press('ArrowRight'); await expect(page.getByTestId('seek-feedback')).toContainText('15s ↷'); expect(await page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(25);
    await nav('Player settings'); await page.getByLabel('Video Fit', { exact: true }).selectOption('fit'); expect(await page.locator('video').evaluate(v => getComputedStyle(v).objectFit)).toBe('contain'); await page.getByLabel('Video Fit', { exact: true }).selectOption('original'); expect(await page.locator('video').evaluate(v => getComputedStyle(v).objectFit)).toBe('scale-down'); await page.locator('.player-layer').focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(3500); await expect(page.locator('.player-layer')).not.toHaveClass(/controls-hidden/); await exit();
    pass('Saved fullscreen, Fit/Fill/Original, speed, skip, disabled hold and Never auto-hide affect real playback');
    await settings('Player'); await page.getByLabel('Start playback fullscreen').uncheck(); await nav('Home'); await page.getByRole('button', { name: 'Open ' + series.name }).click(); await page.getByLabel('Season').selectOption('1'); await page.locator('.episode-row').first().getByRole('button').first().click(); await page.getByRole('button', { name: /Generated MP4/ }).click(); await page.waitForFunction(() => document.querySelector('video')?.currentTime > .3); await page.locator('video').evaluate(v => { v.currentTime = v.duration - .3; });
    await page.waitForFunction(() => document.querySelector('.player-title .muted')?.textContent === 'Second Motion', null, { timeout: 30000 }); await page.waitForFunction(() => document.querySelector('video')?.currentTime > .3); expect(fixture.requests.some(url => url.includes('/stream/series/nymora%3Aseries%3A2%3A1'))).toBe(true); await exit(); pass('Enabled autoplay queries exact next supplied episode and starts a matching source through the existing player gate');
    await settings('General'); await page.getByLabel('Startup intro', { exact: true }).uncheck(); await page.getByLabel('Startup sound', { exact: true }).uncheck(); await app.close(); await launch(); await expect(page.locator('.startup-intro')).toHaveCount(0); expect(await page.evaluate(() => window.nymoraStartupAudio)).toBeUndefined();
    await settings('Player'); expect(await page.getByLabel('Default Video Fit').inputValue()).toBe('original'); expect(await page.getByLabel('Skip interval', { exact: true }).inputValue()).toBe('15'); expect(await page.getByLabel('Default playback speed').inputValue()).toBe('0.75'); expect(await page.getByLabel('Resume playback', { exact: true }).inputValue()).toBe('restart'); expect(await page.getByLabel('Autoplay next episode').isChecked()).toBe(true);
    pass('All player preferences and independent disabled startup choices survive restart');
    expect(checks.filter(c => c.result === 'FAIL')).toHaveLength(0);
  } catch (error) { checks.push({ result: 'FAIL', error: error.stack }); await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify({ version: require('../package.json').version, executable: process.env.NYMORA_TEST_EXE || 'development Electron', checks }, null, 2)); await app?.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
