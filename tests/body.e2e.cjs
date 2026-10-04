'use strict';
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startBodyFixture } = require('./body-fixture.cjs');
const PUBLIC_BASE = 'https://stremio.github.io/stremio-static-addon-example';
async function main() {
  const fixture = await startBodyFixture();
  const profile = path.resolve(`.qa/body-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  const evidence = { checks: [] };
  const pass = (step, details) => { evidence.checks.push({ step, details, result: 'PASS' }); console.log(`PASS ${step}${details ? `: ${JSON.stringify(details)}` : ''}`); };
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(45000);
    evidence.build = await app.evaluate(({ app }) => ({ installed: app.isPackaged, version: app.getVersion(), electron: process.versions.electron }));
    const matrix = await app.evaluate(async ({ app, session }, base) => {
      const requireApp = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const network = requireApp('./src/network.cjs');
      const result = [];
      for (const mode of ['length', 'chunked', 'gzip', 'br', 'delayed', 'keep-alive', 'redirect', 'bom']) {
        const updates = [];
        let value;
        try { value = await network.json(`${base}/${mode}/stream/movie/id.json`, { onDiagnostic: d => updates.push(d) }); }
        catch (error) { throw new Error(`Fixture ${mode}: ${error.code}; ${JSON.stringify(updates)}`); }
        result.push({ mode, streamCount: value.streams.length, diagnostic: updates.at(-1) });
      }
      // Standards consumption baselines run on the same Chromium session.
      const chromium = session.fromPartition('nymora-addon-http');
      const text = JSON.parse(await (await chromium.fetch(`${base}/gzip/stream/movie/id.json`)).text());
      const bytes = await (await chromium.fetch(`${base}/br/stream/movie/id.json`)).arrayBuffer();
      const buffer = JSON.parse(new TextDecoder().decode(bytes));
      return { results: result, responseText: text.streams.length, responseArrayBuffer: buffer.streams.length };
    }, fixture.base);
    for (const row of matrix.results) { expect(row.streamCount).toBe(1); expect(row.diagnostic.stage).toBe('complete'); expect(row.diagnostic.code).toBe(null); expect(row.diagnostic.status).toBe(200); }
    expect(matrix.results.find(r => r.mode === 'delayed').diagnostic.bodyElapsedMs).toBeGreaterThan(20000);
    expect(matrix.responseText).toBe(1); expect(matrix.responseArrayBuffer).toBe(1);
    pass('Production Chromium reader: all eight response formats, including a 21-second first body chunk', matrix);
    const failures = await app.evaluate(async ({ app }, base) => {
      const requireApp = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const network = requireApp('./src/network.cjs'); const result = [];
      for (const [mode, options] of [['header-stall', { responseTimeoutMs: 120 }], ['stall', { idleTimeoutMs: 350 }], ['stall', { idleTimeoutMs: 800, overallTimeoutMs: 350 }], ['invalid', {}], ['truncated', {}], ['large', {}], ['redirect-loop', {}]]) {
        const updates = []; let code, message;
        try { await network.json(`${base}/${mode}/stream/movie/id.json`, { ...options, onDiagnostic: d => updates.push(d) }); } catch (e) { code = e.code; message = e.message; }
        const recovered = await network.json(`${base}/keep-alive/stream/movie/id.json`);
        result.push({ mode, code, message, diagnostic: updates.at(-1), recovered: recovered.streams.length });
      }
      const controller = new AbortController(); const updates = [];
      const pending = network.json(`${base}/stall/stream/movie/id.json`, { signal: controller.signal, onDiagnostic: d => updates.push(d) });
      setTimeout(() => controller.abort(), 100); let cancelled;
      try { await pending; } catch (e) { cancelled = e.code; }
      result.push({ mode: 'caller-cancel', code: cancelled, diagnostic: updates.at(-1), recovered: (await network.json(`${base}/length/stream/movie/id.json`)).streams.length });
      return result;
    }, fixture.base);
    expect(failures.map(r => r.code)).toEqual(['HEADER_TIMEOUT', 'BODY_TIMEOUT', 'BODY_TIMEOUT', 'INVALID_JSON', 'TRUNCATED_RESPONSE', 'RESPONSE_TOO_LARGE', 'REDIRECT_FAILURE', 'CANCELLED']);
    for (const row of failures) { expect(row.recovered).toBe(1); expect(row.diagnostic.code).toBe(row.code); if (!['header-stall', 'redirect-loop'].includes(row.mode)) expect(row.diagnostic.status).toBe(200); }
    for (const row of failures.filter(r => r.code === 'BODY_TIMEOUT')) { expect(row.diagnostic.bodyElapsedMs).toBeGreaterThanOrEqual(340); expect(row.message).toContain('HTTP 200'); expect(row.message).not.toContain('did not respond'); }
    pass('Accurate failure codes, measured body times, clean cancellation and same-session recovery', failures);
    await page.getByRole('button', { name: 'Addons', exact: true }).click();
    for (const mode of [...fixture.modes, 'stall']) {
      await page.getByLabel('Addon manifest URL').fill(`${fixture.base}/${mode}/manifest.json`);
      await page.getByRole('button', { name: 'Install addon', exact: true }).click();
      await expect(page.locator('.addon')).toHaveCount(mode === 'stall' ? 9 : fixture.modes.indexOf(mode) + 1);
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open Nymora Motion Study' }).first().click();
    await expect(page.locator('button.source')).toHaveCount(8, { timeout: 45000 });
    expect(await page.locator('button.source').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Body delayed playable')]));
    await page.screenshot({ path: path.join(profile, 'movie-sources.png') });
    pass('Movie HTTP 200 bodies fully parsed into eight visible playable cards');
    await expect(page.locator('.source-notices')).toContainText('HTTP 200', { timeout: 35000 });
    expect(await page.locator('.source-notices').innerText()).not.toContain('did not respond');
    await page.getByRole('button', { name: 'Copy Addon Diagnostics' }).click();
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied).not.toMatch(/https?:\/\/|manifest\.json|cookie|authorization|token/i);
    const bodyDiagnostic = JSON.parse(copied).requests.find(d => d.code === 'BODY_TIMEOUT');
    expect(bodyDiagnostic.status).toBe(200); expect(bodyDiagnostic.bodyElapsedMs).toBeGreaterThanOrEqual(29900);
    expect(Math.abs(bodyDiagnostic.elapsedMs - bodyDiagnostic.headersMs - bodyDiagnostic.bodyElapsedMs)).toBeLessThan(50);
    pass('Copy Addon Diagnostics exports real 30-second body timeout instead of stale header time', bodyDiagnostic);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open Nymora Test Series' }).first().click();
    await page.getByLabel('Season').selectOption('2'); await page.getByRole('button', { name: /1\. Second Motion/ }).click();
    await expect(page.locator('button.source')).toHaveCount(8, { timeout: 45000 });
    expect(fixture.requests.filter(r => r.resource === 'stream' && r.type === 'series' && r.id === 'nymora%3Aseries%3A2%3A1.json').length).toBeGreaterThanOrEqual(8);
    pass('Episode HTTP 200 bodies fully parsed into eight visible playable cards');
    // Public endpoints are fixed public test data. Never load the user's addon configuration.
    await page.getByRole('button', { name: 'Addons', exact: true }).click();
    await page.getByLabel('Addon manifest URL').fill(`${PUBLIC_BASE}/manifest.json`);
    await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.locator('.addon')).toHaveCount(9);
    const publicResults = await app.evaluate(async ({ app }, base) => {
      const requireApp = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const network = requireApp('./src/network.cjs'); const result = [];
      for (const route of ['catalog/movie/BigBuckBunnyCatalog.json', 'meta/movie/BigBuckBunny.json', 'stream/movie/BigBuckBunny.json']) {
        const updates = []; const value = await network.json(`${base}/${route}`, { onDiagnostic: d => updates.push(d) });
        result.push({ route, keys: Object.keys(value), streamCount: value.streams?.length, diagnostic: updates.at(-1) });
      }
      const updates = []; const value = await network.json('https://v3-cinemeta.strem.io/meta/movie/tt1254207.json', { onDiagnostic: d => updates.push(d) });
      result.push({ route: 'Cinemeta / Big Buck Bunny metadata', keys: Object.keys(value), diagnostic: updates.at(-1) });
      return result;
    }, PUBLIC_BASE);
    for (const row of publicResults) { expect(row.diagnostic.status).toBe(200); expect(row.diagnostic.stage).toBe('complete'); }
    expect(publicResults.find(r => r.streamCount !== undefined).streamCount).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open Big Buck Bunny' }).click();
    await expect(page.locator('button.source')).not.toHaveCount(0);
    pass('Real public Stremio example addon and Cinemeta: HTTP 200, full JSON, playable Big Buck Bunny source cards', publicResults);
    await page.screenshot({ path: path.join(profile, 'public-sources.png') });
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`Evidence: ${profile}`);
  } catch (error) {
    const page = await app.firstWindow();
    evidence.failure = { message: error.message, cards: await page.locator('button.source').allTextContents(), notices: await page.locator('.source-notices').allTextContents() };
    if (await page.getByRole('button', { name: 'Copy Addon Diagnostics' }).count()) {
      await page.getByRole('button', { name: 'Copy Addon Diagnostics' }).click();
      evidence.failure.diagnostics = await app.evaluate(({ clipboard }) => clipboard.readText());
    }
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence.failure)); throw error;
  } finally { await app.close(); await fixture.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
