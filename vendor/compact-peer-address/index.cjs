'use strict';
// Original Nymora code, MIT, Copyright (c) 2026 Mohammed Alanazi.
// BitTorrent compact peer addresses are fixed-width IP bytes and a BE port.
function decode(bytes, ipv6) {
  const stride = ipv6 ? 18 : 6;
  if (bytes.length % stride) throw new Error('Malformed compact peer list');
  return Array.from({ length: bytes.length / stride }, (_, index) => {
    const offset = index * stride;
    const host = ipv6
      ? '[' + Array.from({ length: 8 }, (_, group) => bytes.readUInt16BE(offset + group * 2).toString(16)).join(':') + ']'
      : Array.from(bytes.subarray(offset, offset + 4)).join('.');
    return host + ':' + bytes.readUInt16BE(offset + stride - 2);
  });
}
function address(bytes) {
  if (![6, 18].includes(bytes.length)) throw new Error('Malformed compact peer address');
  return decode(bytes, bytes.length === 18)[0];
}
address.multi = bytes => decode(bytes, false);
address.multi6 = bytes => decode(bytes, true);
module.exports = address;
