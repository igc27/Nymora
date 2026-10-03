'use strict';
const { _electron: electron, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { startFixture, manifest } = require('./fixture.cjs');
async function main() {
  const fixture = await startFixture(), requests = [], pending = new Set();
  const prefix = '/synthetic-config%2Fcomplete%20path'; let base;
  const server = http.createServer(async (req, res) => {
    requests.push(req.url); const url = new URL(req.url, 'http://localhost');
    const name = url.pathname.split('/')[1];
    const send = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (['five', 'two', 'slow', 'notices'].includes(name)) {
      if (url.pathname.endsWith('/manifest.json')) return send({ ...manifest, id: `org.nymora.transport.${name}`, name: `${name} test addon`, catalogs: [], resources: ['stream'] });
      if (name === 'slow') { pending.add(res); res.on('close', () => pending.delete(res)); return; }
      if (name === 'notices') return send({ streams: [{ name: '🚫 Removal Reasons', description: '📌 Disabled Stream Types (16)', externalUrl: 'https://github.com/Viren070/AIOStreams', streamData: { type: 'statistic' } }, { name: 'Excluded Resolution', url: `${fixture.base}/media/test.mp4` }, { infoHash: 'invalid' }, { externalUrl: 'https://external.example/action' }] });
      return send({ streams: Array.from({ length: name === 'five' ? 5 : 2 }, (_, i) => ({ name: `${name} playable ${i + 1}`, ...(name === 'five' && i === 4 ? { infoHash: '08ada5a7a6183aae1e09d831df6748d566095a10', fileIdx: 5 } : { url: `${fixture.base}/media/test.mp4` }) })) });
    }
    if (url.pathname.startsWith(prefix)) {
      const upstream = await fetch(`${fixture.base}${url.pathname.slice(prefix.length)}${url.search}`);
      const body = await upstream.json();
      // Metadata provider has no streams; the independent stream providers do.
      if (url.pathname.endsWith('/manifest.json')) { body.resources = ['catalog', 'meta', 'subtitles']; body.id = 'org.nymora.transport.metadata'; }
      return send(body);
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  const profile = path.resolve(`.qa/addons-${Date.now()}`); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  const evidence = []; const pass = (step, details) => { evidence.push({ step, details, result: 'PASS' }); console.log(`PASS ${step}${details ? `: ${JSON.stringify(details)}` : ''}`); };
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(25000);
    await page.getByRole('button', { name: 'Addons', exact: true }).click();
    for (const endpoint of [prefix, '/slow', '/five', '/two', '/notices']) { await page.getByLabel('Addon manifest URL').fill(`${base}${endpoint}/manifest.json`); await page.getByRole('button', { name: 'Install addon', exact: true }).click(); await expect(page.locator('.addon')).toHaveCount([prefix, '/slow', '/five', '/two', '/notices'].indexOf(endpoint) + 1); }
    pass('Five addons installed including configured base path');
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    const start = Date.now(); await page.getByRole('button', { name: 'Open Nymora Motion Study' }).click();
    await expect(page.locator('button.source')).toHaveCount(7, { timeout: 3000 });
    expect(pending.size).toBe(1); expect(Date.now() - start).toBeLessThan(3000);
    pass('Seven playable sources visible while slow addon is still pending', { elapsedMs: Date.now() - start });
    await expect(page.locator('.source-notices')).toContainText('filtered or informational');
    expect(await page.locator('button.source').innerText().catch(() => '')).not.toContain('Removal Reasons');
    expect(await page.locator('button.source').allTextContents()).toHaveLength(7);
    const rejected = await page.evaluate(() => window.nymora.call('source', { name: 'Removal Reasons', url: 'http://127.0.0.1/placeholder.mp4' }).then(() => false, () => true)); expect(rejected).toBe(true);
    pass('Informational, placeholder, external and invalid P2P entries cannot enter player');
    await page.getByRole('button', { name: /five playable 5/ }).click();
    await expect(page.getByRole('dialog', { name: 'P2P Streaming Notice' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Preparing playback' })).toBeHidden();
    expect(pending.size).toBe(1); pass('Cancelling P2P consent preserves outstanding addon discovery');
    await expect(page.locator('.source-notices')).toContainText('slow test addon did not respond.', { timeout: 25000 });
    await expect(page.locator('button.source')).toHaveCount(7); pass('Real 20-second timeout leaves seven working cards visible');
    await page.getByRole('button', { name: 'Copy Addon Diagnostics' }).click();
    const diagnostic = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(diagnostic).not.toMatch(/synthetic|configured|manifest\.json|https?:\/\/|token|cookie|authorization/i); expect(diagnostic).toContain('TIMEOUT'); pass('Addon diagnostics export contains timing/status/cause and no URLs');
    await page.getByRole('button', { name: /five playable 1/ }).click();
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.3 && v.getVideoPlaybackQuality().totalVideoFrames > 5; }); pass('Working HTTP source decodes after another provider timeout');
    await page.getByRole('button', { name: 'Exit player', exact: true }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open Nymora Test Series' }).click(); await page.getByLabel('Season').selectOption('2'); await page.getByRole('button', { name: /1\. Second Motion/ }).click();
    await expect(page.locator('button.source')).toHaveCount(7, { timeout: 3000 });
    expect(requests.some(r => r.includes('/stream/series/nymora%3Aseries%3A2%3A1.json'))).toBe(true);
    expect(requests.some(r => r.startsWith(`${prefix}/meta/series/`))).toBe(true); pass('Configured metadata path and exact episode stream ID preserved');
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect.poll(() => pending.size).toBe(0); pass('Navigation cancels pending stream requests without affecting other operations');
    // Production addon session, proxy-only synthetic host: no DNS entry exists.
    await app.evaluate(async ({ session }, port) => { await session.fromPartition('nymora-addon-http').setProxy({ proxyRules: `http=127.0.0.1:${port}`, proxyBypassRules: '<-loopback>' }); }, server.address().port);
    await page.getByRole('button', { name: 'Addons', exact: true }).click(); await page.getByLabel('Addon manifest URL').fill(`http://nymora-addon-qa.invalid:${server.address().port}${prefix}/manifest.json`); await page.getByRole('button', { name: 'Install addon', exact: true }).click();
    await expect(page.locator('.addon')).toHaveCount(5); pass('Production transport installs addon through Chromium proxy with remote DNS');
    await app.evaluate(async ({ session }) => { await session.fromPartition('nymora-addon-http').setProxy({ mode: 'system' }); });
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
  } finally { await app.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await fixture.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
