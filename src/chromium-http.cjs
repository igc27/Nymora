'use strict';
// net.fetch's native redirect path retains explicitly supplied auth headers in
// Electron 44. Guard the dedicated addon/media session before headers hit wire.
function chromiumTransport(session) {
  const origins = new Map();
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const origin = new URL(details.url).origin;
    if (!origins.has(details.id)) origins.set(details.id, origin);
    const requestHeaders = { ...details.requestHeaders };
    if (origins.get(details.id) !== origin) {
      for (const key of Object.keys(requestHeaders)) {
        if (['authorization', 'cookie', 'proxy-authorization'].includes(key.toLowerCase())) delete requestHeaders[key];
      }
    }
    callback({ requestHeaders });
  });
  session.webRequest.onCompleted(details => origins.delete(details.id));
  session.webRequest.onErrorOccurred(details => origins.delete(details.id));
  return (url, options) => session.fetch(url, options);
}
module.exports = { chromiumTransport };
