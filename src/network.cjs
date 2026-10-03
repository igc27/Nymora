'use strict';
const MAX_JSON = 8 * 1024 * 1024;
const { causeCode } = require('./p2p-diagnostics.cjs');
function validURL(input, manifest = false) {
  if (typeof input !== 'string' || input.length > 8192) throw new Error('Enter a valid HTTP or HTTPS URL.');
  let url;
  try { url = new URL(input.trim().replace(/^stremio:\/\//i, 'https://')); } catch { throw new Error('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP and HTTPS URLs without embedded credentials are supported.');
  if (manifest && (!url.pathname.endsWith('/manifest.json') || url.search || url.hash)) throw new Error('Addon URL must end in /manifest.json. Configuration belongs in the URL path.');
  url.hash = '';
  return url.href;
}
async function request(input, options = {}) {
  let url = validURL(input);
  const signal = options.signal || AbortSignal.timeout(20000);
  for (let n = 0; n <= 5; n++) {
    let response;
    try { response = await fetch(url, { ...options, signal, redirect: 'manual' }); }
    catch (error) { const code = causeCode(error); const failure = new Error(`Unable to reach service (${code.replaceAll('_', ' ').toLowerCase()}).`); failure.code = code; throw failure; }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || n === 5) throw new Error('Too many or invalid network redirects.');
      const next = validURL(new URL(location, url).href);
      // Do not forward addon-provided authentication to another origin.
      if (new URL(next).origin !== new URL(url).origin && options.headers) {
        options = { ...options, headers: Object.fromEntries(Object.entries(options.headers).filter(([k]) => !['authorization', 'cookie'].includes(k.toLowerCase()))) };
      }
      url = next;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Service returned HTTP ${response.status}. Please retry or use another source.`); }
    return response;
  }
  throw new Error('Unable to connect.');
}
async function boundedText(input, max = MAX_JSON) {
  const response = await request(input);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > max) { throw new Error('Service response is too large.'); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function json(input) {
  try { return JSON.parse(await boundedText(input)); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('Service returned invalid JSON.'); throw error; }
}
module.exports = { validURL, request, boundedText, json };
