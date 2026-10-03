'use strict';
const MAX_JSON = 8 * 1024 * 1024;
const DEFAULT_BODY_IDLE_MS = 30000;
const DEFAULT_BODY_OVERALL_MS = 120000;
const { causeCode } = require('./p2p-diagnostics.cjs');
let transport = (...args) => fetch(...args);
let stack = 'node';
let redirectMode = 'manual';
function configureTransport(fetcher) { transport = fetcher; stack = 'chromium'; redirectMode = 'follow'; }
function networkFailure(error, signal) {
  const rawCode = error?.cause?.code || error?.code || error?.message?.match(/net::(ERR_[A-Z_]+)/)?.[1] || '';
  let code = causeCode({ code: rawCode, name: error?.name });
  if (/NAME_NOT_RESOLVED|DNS_/.test(rawCode)) code = 'DNS_FAILURE';
  if (/CONNECTION_RESET|CONNECTION_CLOSED/.test(rawCode)) code = 'CONNECTION_RESET';
  if (/CONNECTION_REFUSED/.test(rawCode)) code = 'CONNECTION_REFUSED';
  if (/PROXY|TUNNEL/.test(rawCode)) code = 'PROXY_FAILURE';
  if (/TOO_MANY_REDIRECTS/.test(rawCode)) code = 'REDIRECT_FAILURE';
  if (signal?.aborted) code = signal.reason?.name === 'TimeoutError' ? 'TIMEOUT' : 'CANCELLED';
  const failure = new Error(code === 'CANCELLED' ? 'Request cancelled.' : `Unable to reach service (${code.replaceAll('_', ' ').toLowerCase()}).`);
  failure.code = code; return failure;
}
function validURL(input, manifest = false) {
  if (typeof input !== 'string' || input.length > 128 * 1024) throw new Error('Enter a valid HTTP or HTTPS URL.');
  let url;
  try { url = new URL(input.trim().replace(/^stremio:\/\//i, 'https://')); } catch { throw new Error('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP and HTTPS URLs without embedded credentials are supported.');
  if (manifest && (!url.pathname.endsWith('/manifest.json') || url.search || url.hash)) throw new Error('Addon URL must end in /manifest.json. Configuration belongs in the URL path.');
  url.hash = '';
  return url.href;
}
function diagnostic(context, stage, code = null, extra = {}) {
  return { stack, stage, code, elapsedMs: Math.round(performance.now() - context.started),
    status: context.status ?? null, redirects: context.redirects,
    headersMs: context.headersMs ?? null, bodyElapsedMs: context.bodyStarted == null ? null : Math.round(performance.now() - context.bodyStarted),
    bytesRead: context.bytesRead ?? 0, ...extra };
}
function bodyFailure(code, status, detail) {
  const failure = new Error(`Service returned HTTP ${status}, but ${detail}`);
  failure.code = code; return failure;
}
function cancelBody(body) { body?.cancel().catch(() => {}); }
async function request(input, options = {}) {
  let url = validURL(input);
  // Chromium owns DNS, dual-stack connection racing, TLS, pooling and system
  // proxy negotiation. Bound establishment + response headers across redirects.
  const deadline = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(new DOMException('Response deadline', 'TimeoutError')), options.responseTimeoutMs ?? 20000);
  timer.unref?.();
  const context = options._context || { started: performance.now() };
  // Electron 44 net.fetch passes 'manual' to ClientRequest without a redirect
  // listener, which rejects with 'Redirect was cancelled'. Native follow uses
  // Chromium's bounded redirect handling; net.fetch exposes no redirect count.
  context.redirects = redirectMode === 'follow' ? null : 0;
  const onDiagnostic = options.onDiagnostic, fetchOptions = { ...options };
  for (const key of ['onDiagnostic', 'responseTimeoutMs', 'overallTimeoutMs', 'idleTimeoutMs', '_context']) delete fetchOptions[key];
  try {
  for (let n = 0; n <= 5; n++) {
    let response;
    try { response = await transport(url, { ...fetchOptions, credentials: 'omit', signal, redirect: redirectMode }); }
    catch (error) { const failure = networkFailure(error, signal); if (failure.code === 'TIMEOUT') failure.code = 'HEADER_TIMEOUT'; if (redirectMode === 'manual') context.redirects = n; onDiagnostic?.(diagnostic(context, 'response', failure.code)); throw failure; }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response.body);
      if (!location || n === 5) throw new Error('Too many or invalid network redirects.');
      const next = validURL(new URL(location, url).href);
      // Do not forward addon-provided authentication to another origin.
      if (new URL(next).origin !== new URL(url).origin && fetchOptions.headers) {
        fetchOptions.headers = Object.fromEntries([...new Headers(fetchOptions.headers)].filter(([k]) => !['authorization', 'cookie', 'proxy-authorization'].includes(k.toLowerCase())));
      }
      url = next;
      continue;
    }
    context.status = response.status; if (redirectMode === 'manual') context.redirects = n; context.headersMs = Math.round(performance.now() - context.started);
    onDiagnostic?.(diagnostic(context, 'headers'));
    if (!response.ok) { cancelBody(response.body); const failure = new Error(`Service returned HTTP ${response.status}. Please retry or use another source.`); failure.code = `HTTP_${response.status}`; onDiagnostic?.(diagnostic(context, 'headers', failure.code)); throw failure; }
    return response;
  }
  throw new Error('Unable to connect.');
  } finally { clearTimeout(timer); }
}
async function readText(input, max, options) {
  const context = { started: performance.now(), bytesRead: 0 };
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_BODY_IDLE_MS;
  const overallTimeoutMs = options.overallTimeoutMs ?? DEFAULT_BODY_OVERALL_MS;
  let idle, overall, reader, response, timedOut, complete = false;
  const stopTimers = () => { clearTimeout(overall); clearTimeout(idle); };
  const cancelReader = () => { reader?.cancel().catch(() => {}); };
  const timeout = kind => {
    timedOut = bodyFailure('BODY_TIMEOUT', context.status, `reading the response body exceeded its ${kind === 'idle' ? 'idle' : 'total body'} timeout (${kind === 'idle' ? idleTimeoutMs : overallTimeoutMs} ms).`);
    timedOut.timeoutKind = kind; stopTimers(); cancelReader(); controller.abort(timedOut);
  };
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => timeout('idle'), idleTimeoutMs); idle.unref?.(); };
  try {
  response = await request(input, { ...options, _context: context, signal, headers: { Accept: 'application/json, text/plain, */*', ...options.headers } });
  context.bodyStarted = performance.now();
  const chunks = [];
  const wireLength = response.headers.get('content-length');
  // Chromium decodes gzip/br. Content-Length describes encoded wire bytes.
  const expectedLength = !response.headers.get('content-encoding') && /^\d+$/.test(wireLength || '') ? Number(wireLength) : null;
  if (expectedLength !== null && expectedLength > max) throw bodyFailure('RESPONSE_TOO_LARGE', response.status, `the response exceeds the ${max}-byte limit.`);
  if (!response.body) { complete = true; return { text: '', context }; }
  reader = response.body.getReader();
  signal.addEventListener('abort', cancelReader, { once: true });
  overall = setTimeout(() => timeout('overall'), overallTimeoutMs); overall.unref?.(); resetIdle();
  for (;;) {
    const { value: chunk, done } = await reader.read();
    if (timedOut) throw timedOut;
    if (signal.aborted) throw networkFailure(signal.reason, signal);
    if (done) break;
    if (!chunk.byteLength) continue;
    context.bytesRead += chunk.byteLength; resetIdle();
    if (context.bytesRead > max) throw bodyFailure('RESPONSE_TOO_LARGE', response.status, `the decoded response is too large (${max}-byte limit).`);
    chunks.push(Buffer.from(chunk));
  }
  stopTimers();
  if (expectedLength !== null && context.bytesRead !== expectedLength) throw bodyFailure('TRUNCATED_RESPONSE', response.status, 'the response body was truncated.');
  complete = true;
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), context };
  } catch (error) {
    // Header failures were already diagnosed by request(); never relabel them.
    if (!response) throw error;
    const raw = error?.cause?.code || error?.code || error?.message?.match(/net::(ERR_[A-Z_]+)/)?.[1] || '';
    const hasWireLength = !response.headers.get('content-encoding') && /^\d+$/.test(response.headers.get('content-length') || '');
    const truncated = /CONTENT_LENGTH_MISMATCH|INCOMPLETE_CHUNKED_ENCODING/.test(raw) || (hasWireLength && context.bytesRead < Number(response.headers.get('content-length')));
    const failure = timedOut || (signal.aborted ? networkFailure(error, signal) : ['RESPONSE_TOO_LARGE', 'TRUNCATED_RESPONSE'].includes(error.code) ? error : bodyFailure(truncated ? 'TRUNCATED_RESPONSE' : 'STREAM_READ_FAILURE', response.status, truncated ? 'the response body was truncated.' : 'reading the response body failed.'));
    options.onDiagnostic?.(diagnostic(context, 'body', failure.code, { timeoutKind: failure.timeoutKind ?? null, idleTimeoutMs, overallTimeoutMs }));
    throw failure;
  } finally {
    stopTimers(); signal.removeEventListener('abort', cancelReader);
    if (!complete) { cancelReader(); controller.abort(); }
    reader?.releaseLock();
  }
}
async function boundedText(input, max = MAX_JSON, options = {}) {
  const result = await readText(input, max, options);
  options.onDiagnostic?.(diagnostic(result.context, 'complete'));
  return result.text;
}
async function json(input, options = {}) {
  const result = await readText(input, MAX_JSON, options);
  let value;
  try { value = JSON.parse(result.text); }
  catch { const failure = bodyFailure('INVALID_JSON', result.context.status, 'the body contains invalid JSON.'); options.onDiagnostic?.(diagnostic(result.context, 'json', failure.code)); throw failure; }
  options.onDiagnostic?.(diagnostic(result.context, 'complete'));
  return value;
}
module.exports = { validURL, request, boundedText, json, configureTransport, networkFailure };
