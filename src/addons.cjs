'use strict';
const AddonClient = require('../vendor/stremio-addon-client/lib/AddonClient.cjs');
const stringifyRequest = require('../vendor/stremio-addon-client/lib/stringifyRequest.cjs');
const { validURL, json } = require('./network.cjs');
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid addon manifest.');
  for (const key of ['id', 'name', 'version', 'description']) if (typeof manifest[key] !== 'string' || !manifest[key].trim() || manifest[key].length > 10000) throw new Error(`Invalid addon manifest: missing ${key}.`);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version)) throw new Error('Invalid addon version.');
  if (!Array.isArray(manifest.types) || !manifest.types.length || manifest.types.some(t => typeof t !== 'string')) throw new Error('Invalid addon content types.');
  if (!Array.isArray(manifest.resources) || !manifest.resources.length || manifest.resources.some(r => typeof r !== 'string' && (!r || typeof r.name !== 'string'))) throw new Error('Invalid addon resources.');
  for (const resource of manifest.resources) {
    if (typeof resource === 'object') {
      for (const key of ['types', 'idPrefixes']) if (resource[key] !== undefined && (!Array.isArray(resource[key]) || resource[key].some(v => typeof v !== 'string'))) throw new Error('Invalid addon resource filters.');
    }
  }
  if (manifest.idPrefixes !== undefined && (!Array.isArray(manifest.idPrefixes) || manifest.idPrefixes.some(v => typeof v !== 'string'))) throw new Error('Invalid addon ID prefixes.');
  if (manifest.catalogs !== undefined && (!Array.isArray(manifest.catalogs) || manifest.catalogs.some(c => !c || typeof c.type !== 'string' || typeof c.id !== 'string' || (c.extra !== undefined && (!Array.isArray(c.extra) || c.extra.some(e => !e || typeof e.name !== 'string')))))) throw new Error('Invalid addon catalogs.');
  return manifest;
}
function client(descriptor) {
  const url = validURL(descriptor.transportUrl, true);
  return new AddonClient(validateManifest(descriptor.manifest), {
    url,
    get(args, callback) {
      const resourceURL = url.slice(0, -'/manifest.json'.length) + stringifyRequest(args);
      json(resourceURL).then(value => callback(null, value), callback);
    }
  });
}
async function install(url) {
  const transportUrl = validURL(url, true);
  return { transportUrl, manifest: validateManifest(await json(transportUrl)) };
}
function catalogs(descriptors) {
  return descriptors.flatMap(d => (d.manifest.catalogs || []).map(c => ({ ...c, addonId: d.manifest.id, addonName: d.manifest.name, transportUrl: d.transportUrl })));
}
function extraDefinitions(catalog) {
  return catalog.extra || [...(catalog.extraSupported || [])].map(name => ({ name, isRequired: (catalog.extraRequired || []).includes(name) }));
}
async function aggregate(descriptors, resource, type, id, extra = {}) {
  const selected = descriptors.map(client).filter(a => a.isSupported(resource, type, id));
  const settled = await Promise.allSettled(selected.map(a => a.get(resource, type, id, extra)));
  const items = [], errors = [];
  settled.forEach((result, i) => {
    const addon = selected[i];
    if (result.status === 'rejected') errors.push(`${addon.manifest.name}: ${result.reason.message}`);
    else {
      const values = result.value?.[resource === 'meta' ? 'meta' : resource === 'subtitles' ? 'subtitles' : 'streams'];
      if (resource === 'meta') { if (values && !Array.isArray(values)) items.push(values); }
      else if (Array.isArray(values)) values.slice(0, 1000).forEach(v => { if (v && typeof v === 'object') items.push({ ...v, addonName: addon.manifest.name }); });
      else errors.push(`${addon.manifest.name}: invalid ${resource} response.`);
    }
  });
  return { items, errors };
}
async function catalog(descriptors, query) {
  const descriptor = descriptors.find(d => d.transportUrl === query.transportUrl);
  if (!descriptor) throw new Error('This addon is no longer installed.');
  const response = await client(descriptor).get('catalog', query.type, query.id, query.extra || {});
  const metas = response.metas || response.metasDetailed;
  if (!Array.isArray(metas)) throw new Error('Addon returned an invalid catalog.');
  return metas.filter(m => m && typeof m.id === 'string' && typeof m.type === 'string' && typeof m.name === 'string').slice(0, 1000);
}
async function search(descriptors, term) {
  const supported = catalogs(descriptors).filter(c => extraDefinitions(c).some(e => e.name === 'search') && !extraDefinitions(c).some(e => e.isRequired && !['search', 'skip'].includes(e.name)));
  const results = await Promise.allSettled(supported.map(c => catalog(descriptors, { ...c, extra: { search: term } })));
  const found = new Map(), errors = [];
  results.forEach((r, i) => { if (r.status === 'fulfilled') r.value.forEach(m => found.set(`${m.type}:${m.id}`, m)); else errors.push(`${supported[i].addonName}: ${r.reason.message}`); });
  return { items: [...found.values()], errors, supported: supported.length };
}
module.exports = { validateManifest, client, install, catalogs, extraDefinitions, aggregate, catalog, search };
