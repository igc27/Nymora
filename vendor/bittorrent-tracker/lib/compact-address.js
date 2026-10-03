// Original Nymora code, MIT, Copyright (c) 2026 Mohammed Alanazi.
// Decode the BitTorrent compact peer list (BEP 23 / BEP 7).
function addresses (bytes, ipv6) {
  const stride = ipv6 ? 18 : 6
  if (bytes.length % stride) throw new Error('Malformed compact peer list')
  return Array.from({ length: bytes.length / stride }, (_, index) => {
    const offset = index * stride
    const host = ipv6
      ? '[' + Array.from({ length: 8 }, (_, group) => bytes.readUInt16BE(offset + group * 2).toString(16)).join(':') + ']'
      : Array.from(bytes.subarray(offset, offset + 4)).join('.')
    return host + ':' + bytes.readUInt16BE(offset + stride - 2)
  })
}
export default { multi: bytes => addresses(bytes, false), multi6: bytes => addresses(bytes, true) }
