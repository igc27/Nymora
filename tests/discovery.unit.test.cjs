'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalizeTorrent}=require('../src/torrent-source.cjs');
const {diagnostics,causeCode}=require('../src/p2p-diagnostics.cjs');
const hash='a'.repeat(40);
test('Discovery preserves magnet peers, multiple addon tracker fields, behavior hints and DHT nodes',()=>{
  const s=normalizeTorrent({magnet:`magnet:?xt=urn:btih:${hash}&x.pe=192.0.2.1:6881&tr=udp%3A%2F%2Ftracker.example%3A1337`,fileIdx:5,trackers:['tracker:https://tracker.example/announce'],announce:['http://other.example/announce'],sources:['dht:router.example:6881','tracker:udp://third.example:6969'],behaviorHints:{announce:['https://fourth.example/announce'],sources:['tracker:https://fifth.example/announce'],filename:'video.mp4',videoSize:42}});
  assert.equal(s.trackers.length,6);assert.deepEqual(s.peerAddresses,['192.0.2.1:6881']);assert.match(s.magnet,/x.pe=/);assert.equal(s.dhtNodes[0].host,'router.example');assert.equal(s.fileIdx,5);assert.equal(s.filename,'video.mp4');assert.equal(s.videoSize,42);
});
test('Diagnostic export allows only requested fields and redacts tracker passkeys/configuration secrets',()=>{
  const source={infoHash:hash,fileIdx:5,filename:'https://addon.example/private-token',videoSize:42,trackers:['https://tracker.example/secret-passkey/announce?apikey=private-key'],transportUrl:'https://addon.example/private-config/manifest.json',token:'playback-secret'};
  const state={dhtEnabled:true,pexEnabled:true,lsdEnabled:true,peers:4,metadataState:'received',discoveryElapsedMs:1500,errorCode:'METADATA_TIMEOUT',causeCode:'TIMEOUT',rawError:'credentials',authorization:'Basic secret'};
  const d=diagnostics(source,state);assert.deepEqual(Object.keys(d),['infoHash','fileIdx','filenameHint','videoSize','trackerCount','trackerURLs','dhtEnabled','pexEnabled','lsdEnabled','peerCount','metadataState','elapsedDiscoveryMs','engineError','cause']);assert.doesNotMatch(JSON.stringify(d),/private|passkey|apikey|credentials|Basic|playback-secret/);assert.equal(d.trackerURLs[0],'https://tracker.example/[redacted]?[redacted]');
});
test('Underlying fetch causes distinguish DNS, TLS, reset, timeout, refusal and blocked network without raw messages',()=>{
  for(const [code,expected]of [['ENOTFOUND','DNS_FAILURE'],['CERT_HAS_EXPIRED','TLS_FAILURE'],['ECONNRESET','CONNECTION_RESET'],['UND_ERR_CONNECT_TIMEOUT','TIMEOUT'],['ECONNREFUSED','CONNECTION_REFUSED'],['EACCES','NETWORK_UNREACHABLE']])assert.equal(causeCode({cause:{code},message:'https://private.example/token'}),expected);
});
