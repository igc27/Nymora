'use strict';
const NOTICE = Object.freeze({
  type: 'warning', title: 'P2P Streaming Notice',
  message: 'This source uses BitTorrent peer-to-peer technology.',
  detail: 'While streaming, Nymora may download and upload parts of the file to other peers, and your IP address may be visible to participants in the P2P network.\n\nOnly continue if you are authorized to access this content and its use complies with applicable laws. Availability and legality may depend on the source and applicable laws.\n\nThis notice does not grant permission to access copyrighted content. Third-party addons and sources are independently provided.',
  buttons: ['Cancel', 'I Understand — Play'], defaultId: 0, cancelId: 0, noLink: true
});
module.exports = { NOTICE };
