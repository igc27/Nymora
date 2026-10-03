// Metadata presentation helpers. No network or playback behavior lives here.
const NymoraUI = (() => {
  const useful = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  function mergeMetadata(initial, supplied) {
    const merged = { ...initial };
    for (const item of supplied || []) {
      if (!item || (item.id && item.id !== initial.id) || (item.type && item.type !== initial.type)) continue;
      for (const [key, value] of Object.entries(item)) {
        if (['id', 'type'].includes(key) || !useful(value)) continue;
        if (key === 'videos' && Array.isArray(value)) {
          const videos = new Map((merged.videos || []).filter(v => typeof v.id === 'string').map(v => [v.id, v]));
          for (const video of value) if (typeof video?.id === 'string') {
            const prior = videos.get(video.id) || {};
            videos.set(video.id, { ...prior, ...Object.fromEntries(Object.entries(video).filter(([, v]) => useful(v))) });
          }
          merged.videos = [...videos.values()];
        } else if (key === 'description' && typeof value === 'string') {
          if (!merged.description || value.length > merged.description.length) merged.description = value;
        } else if (Array.isArray(value)) {
          const values = [...(Array.isArray(merged[key]) ? merged[key] : []), ...value];
          const identity = v => typeof v === 'object' && v ? String(v.id || v.name || JSON.stringify(v)) : String(v);
          const unique = new Map();
          for (const v of values) { const id = identity(v); const previous = unique.get(id); unique.set(id, typeof v === 'object' && previous && typeof previous === 'object' ? { ...previous, ...Object.fromEntries(Object.entries(v).filter(([, field]) => useful(field))) } : v); }
          merged[key] = [...unique.values()];
        } else if (!useful(merged[key])) merged[key] = value;
      }
    }
    return merged;
  }
  const catalogKey = c => JSON.stringify([c.addonId, c.type, c.id]);
  function orderedCatalogs(catalogs, settings = {}) {
    const order = Array.isArray(settings.homeCatalogOrder) ? settings.homeCatalogOrder : [];
    const rank = new Map(order.map((key, index) => [key, index]));
    return [...catalogs].sort((a, b) => (rank.get(catalogKey(a)) ?? order.length) - (rank.get(catalogKey(b)) ?? order.length));
  }
  const typingTarget = node => !!node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]');
  return { mergeMetadata, catalogKey, orderedCatalogs, typingTarget };
})();
if (typeof module !== 'undefined') module.exports = NymoraUI;
