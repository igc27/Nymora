// Hls is loaded from the pinned local hls.js distribution by index.html.
const root = document.getElementById('app');
const call = (op, value) => window.nymora.call(op, value);
let state, page = 'Home', generation = 0, currentPlayer = null, preparingSource = false, activeStreamKey = null;
function cancelStreamRequest() { const key = activeStreamKey; activeStreamKey = null; if (key) call('streamsCancel', { key }).catch(() => {}); }
const navItems = ['Home', 'Discover', 'Search', 'Library', 'Addons', 'Settings'];
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  children.flat().forEach(child => { if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child))); });
  return node;
}
const button = (label, action, cls = 'button') => el('button', { className: cls, onclick: async () => { try { await action(); } catch (e) { toast(e.message); } } }, label);
function toast(message, undo) { const node = document.getElementById('toast'); node.replaceChildren(document.createTextNode(message)); if (undo) node.append(button('Undo', undo, 'button small subtle')); node.classList.toggle('action-toast', !!undo); node.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.classList.remove('visible'); node.classList.remove('action-toast'); }, 7000); }
function safeImage(url) { try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; } }
const icons = {
  play: 'M8 5l12 7-12 7z', pause: 'M8 5v14M16 5v14', back: 'M8 5L3 10l5 5M3 10h10a7 7 0 1 1-6 10', forward: 'M16 5l5 5-5 5M21 10H11a7 7 0 1 0 6 10',
  volume: 'M11 5L6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14', mute: 'M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6',
  fullscreen: 'M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6', subtitles: 'M3 5h18v14H3zM6 10h4M6 14h4M14 10h4M14 14h4', audio: 'M4 9v6M8 5v14M12 3v18M16 5v14M20 9v6', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', close: 'M6 6l12 12M18 6L6 18'
};
function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', icons[name]); svg.append(path); return svg; }
function iconButton(label, name, action) { const node = button(icon(name), action, 'icon-button'); node.setAttribute('aria-label', label); node.title = label; return node; }
function updateIcon(node, label, name) { node.replaceChildren(icon(name)); node.setAttribute('aria-label', label); node.title = label; }
const clock = NymoraUI.clock;
function heading(title, caption) { return el('header', { className: 'page-heading' }, el('div', {}, el('p', { className: 'eyebrow' }, 'YOUR SCREEN. YOUR SOURCES.'), el('h1', {}, title), caption && el('p', { className: 'muted' }, caption))); }
function empty(title, message, action) { return el('div', { className: 'empty' }, el('span', { className: 'empty-symbol' }, '◎'), el('h2', {}, title), el('p', {}, message), action); }
function errorBlock(message, retry) { return el('div', { className: 'error', role: 'alert' }, el('p', {}, message), retry && button('Retry', retry, 'button small')); }
function addonWarning(message) { return el('p', { className: 'addon-warning', role: 'status' }, message); }
function applyAppearance() {
  document.body.dataset.posterStyle = state.settings.posterStyle || 'portrait';
  document.body.dataset.interfaceStyle = state.settings.interfaceStyle || 'classic';
}
// Watch actual foreground frame cadence; expensive blur is optional decoration.
let frameSample = [], lastFrame = 0;
function sampleEffects(now) {
  if (document.visibilityState === 'visible' && document.body.dataset.interfaceStyle === 'glass' && !document.body.classList.contains('reduced-effects')) {
    if (lastFrame) frameSample.push(now - lastFrame); lastFrame = now;
    if (frameSample.length >= 180) { if (frameSample.filter(ms => ms > 50).length > 45) document.body.classList.add('reduced-effects'); frameSample = []; }
  } else { lastFrame = 0; frameSample = []; }
  requestAnimationFrame(sampleEffects);
}
requestAnimationFrame(sampleEffects);
function playStartupSound() { const audio = new Audio('nymora-cue.wav'); audio.volume = .28; return audio.play().catch(() => {}); }
async function showIntro(preview = false) {
  if (!preview && !state.settings.startupIntro && !state.settings.startupSound) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.settings.startupSound) playStartupSound();
  if (!preview && !state.settings.startupIntro) return;
  const intro = el('div', { className: `startup-intro ${reduced ? 'intro-still' : ''}`, role: 'status', 'aria-label': 'Nymora startup' }, el('div', { className: 'intro-logo' }, el('img', { src: 'logo.svg', alt: '', width: 80 }), el('span', { className: 'intro-dot' })), el('strong', {}, 'NYMORA'));
  document.body.append(intro);
  await new Promise(resolve => setTimeout(resolve, reduced ? 200 : 1400)); intro.remove();
}
const copyP2PDiagnostics = () => call('copyP2PDiagnostics').then(() => toast('Redacted P2P diagnostics copied.'));
function card(meta, progress) {
  const landscape = state.settings.posterStyle === 'landscape', wide = safeImage(meta.background || meta.backdrop), image = landscape ? wide || safeImage(meta.poster) : safeImage(meta.poster) || wide;
  const art = el('div', { className: `poster ${landscape && !wide ? 'portrait-in-wide' : !landscape && !safeImage(meta.poster) ? 'wide-in-portrait' : ''}` }, image ? el('img', { src: image, alt: '', loading: 'lazy', onerror: event => event.target.remove() }) : el('span', { className: 'poster-letter' }, (meta.name || '?').slice(0, 1)), progress?.watched && el('span', { className: 'badge' }, 'Watched'));
  if (progress?.duration) art.append(el('div', { className: 'progress-bar' }, el('i', { style: `width:${Math.min(100, 100 * progress.position / progress.duration)}%` })));
  const node = el('button', { className: 'card', onclick: () => { clearPreview(); openDetails(meta, progress).catch(e => toast(e.message)); }, 'aria-label': `Open ${meta.name}` }, art, el('strong', {}, meta.name), el('span', { className: 'card-info' }, progress?.episodeName || [meta.releaseInfo || meta.year, NymoraUI.runtime(meta.runtime), meta.type].filter(Boolean).join(' · ')), progress && !progress.watched && el('span', { className: 'muted' }, `${clock(progress.position)} / ${clock(progress.duration)}`));
  node.addEventListener('pointerenter', () => { clearPreview(); previewTimer = setTimeout(() => showPreview(node, meta, progress), 850); });
  node.addEventListener('pointerleave', clearPreview); node.addEventListener('blur', clearPreview); return node;
}
let previewTimer, preview, previewCard;
function clearPreview() { clearTimeout(previewTimer); preview?.remove(); previewCard?.removeAttribute('aria-describedby'); preview = null; previewCard = null; }
function showPreview(node, meta, progress) {
  if (!node.isConnected || currentPlayer) return;
  const bounds = node.getBoundingClientRect(); previewCard = node;
  preview = el('aside', { className: 'hover-preview', id: 'title-preview', role: 'tooltip' }, el('strong', {}, meta.name), el('p', { className: 'metadata-line' }, [meta.releaseInfo || meta.year, meta.imdbRating && `IMDb ${meta.imdbRating}`, NymoraUI.runtime(meta.runtime)].filter(Boolean).join(' · ')), meta.description && el('p', { className: 'preview-description' }, meta.description), meta.genres?.length && el('p', { className: 'tags' }, meta.genres.join(' · ')), progress?.duration > 0 && el('p', { className: 'muted' }, `${Math.round(progress.position / progress.duration * 100)}% watched`));
  node.setAttribute('aria-describedby', 'title-preview'); document.body.append(preview);
  preview.style.left = `${Math.max(12, Math.min(innerWidth - 332, bounds.left))}px`; preview.style.top = `${Math.max(40, Math.min(innerHeight - preview.offsetHeight - 16, bounds.top + 40))}px`;
}
function continueCards(entries) {
  return el('div', { className: 'cards' }, entries.map(progress => {
    const saved = state.library.find(m => m.type === progress.type && m.id === progress.mediaId);
    const wrapper = el('div', { className: 'card-wrap' }, card({ ...saved, ...progress, background: saved?.background, id: progress.mediaId }, progress));
    const remove = iconButton(`Remove ${progress.episodeName || progress.name} from Continue Watching`, 'close', async () => {
      const key = `${progress.type}:${progress.id}`, parent = wrapper.parentNode, next = wrapper.nextSibling, token = generation;
      state = await call('dismissContinuing', { key }); wrapper.remove();
      toast('Removed from Continue Watching', async () => { state = await call('dismissContinuing', { key, undo: true }); if (page === 'Home' && generation === token && parent.isConnected) parent.insertBefore(wrapper, next?.parentNode === parent ? next : null); toast('Restored to Continue Watching'); });
    }); remove.classList.add('continue-remove'); wrapper.append(remove); return wrapper;
  }));
}
function cards(metas, progress) { return el('div', { className: 'cards' }, metas.map((m, i) => card(m, progress?.[i]))); }
function shell() {
  clearPreview();
  const content = el('main', { id: 'content' });
  root.replaceChildren(el('aside', { className: 'sidebar' }, el('div', { className: 'wordmark' }, el('img', { src: 'logo.svg', alt: 'Nymora', width: 40 }), el('span', {}, 'NYMORA')), el('nav', { 'aria-label': 'Main navigation' }, navItems.map((item, index) => { const node = button(item, () => navigate(item), `nav-item ${page === item ? 'active' : ''} nav-${index}`); node.setAttribute('aria-label', item); return node; })), null), content);
  return content;
}
async function navigate(target) {
  cancelStreamRequest();
  if (currentPlayer) await currentPlayer.close();
  page = target; const token = ++generation; const content = shell();
  if (target === 'Home') content.classList.add('home-page');
  content.append(heading(target, target === 'Home' ? 'A quiet place for everything you want to watch.' : undefined));
  try {
    state = await call('state');
    applyAppearance();
    if (token !== generation) return;
    if (state.warning) content.append(errorBlock(state.warning));
    if (target === 'Addons') return showAddons(content);
    if (target === 'Settings') return showSettings(content);
    if (target === 'Library') return showLibrary(content);
    if (target === 'Search') return showSearch(content);
    if (target === 'Discover') return showDiscover(content, token);
    await showHome(content, token);
  } catch (e) { if (token === generation) content.append(errorBlock(e.message, () => navigate(target))); }
}
async function showHome(content, token) {
  const progress = Object.values(state.progress).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const continuing = progress.filter(p => !p.watched && p.position > 0 && !(state.dismissedContinuing || []).includes(`${p.type}:${p.id}`));
  if (continuing.length) content.append(el('section', { className: 'continue-row' }, el('h2', {}, 'Continue Watching'), continueCards(continuing)));
  const catalogs = await call('catalogs');
  if (token !== generation) return;
  if (!catalogs.length) { content.append(empty('Make room for a good story', 'Install an addon to bring its catalogs into Nymora. Your library and watch history stay on this device.', button('Add your first addon', () => navigate('Addons'), 'button primary'))); return; }
  // Required search-only or filtered catalogs must not be queried without their required extras.
  const browseable = NymoraUI.orderedCatalogs(catalogs, state.settings).filter(c => !extras(c).some(e => e.isRequired) && !(state.settings.hiddenCatalogs || []).includes(NymoraUI.catalogKey(c)));
  if (!browseable.length) content.append(empty('Your catalogs need a filter', 'Use Discover to choose a filter, or Search for addons that support search.', button('Open Discover', () => navigate('Discover'))));
  await Promise.all(browseable.map(async c => {
    const section = el('section', { className: 'catalog-row', 'data-catalog-key': NymoraUI.catalogKey(c) }, el('div', { className: 'section-heading' }, el('h2', {}, `${c.name || c.id} · ${c.type === 'movie' ? 'Movies' : c.type === 'series' ? 'Series' : c.type}`), el('span', { className: 'muted' }, c.addonName)), el('p', { className: 'muted' }, 'Loading catalog…'));
    content.append(section);
    const load = async () => {
      try {
        const metas = await call('catalog', c); if (token !== generation) return;
        section.lastChild.remove(); section.append(metas.length ? cards(metas.slice(0, 18)) : empty('No titles yet', 'This addon returned an empty catalog.'));
      } catch (e) { if (token === generation) { section.lastChild.remove(); section.append(errorBlock(e.message, load)); } }
    };
    await load();
  }));
}
function extras(catalog) { return catalog.extra || (catalog.extraSupported || []).map(name => ({ name, isRequired: (catalog.extraRequired || []).includes(name) })); }
async function showDiscover(content, token) {
  const catalogs = await call('catalogs'); if (token !== generation) return;
  if (!catalogs.length) { content.append(empty('No catalogs installed', 'Install an addon to browse movies and series.', button('Open Addons', () => navigate('Addons')))); return; }
  const select = el('select', { 'aria-label': 'Catalog' }, catalogs.map((c, i) => el('option', { value: i }, `${c.addonName} · ${c.name || c.id} (${c.type})`)));
  const filters = el('div', { className: 'filters' }), results = el('div'), loadMore = button('Load more', () => load(false));
  let catalog, offset, values, requestId = 0;
  async function load(reset) {
    const id = ++requestId; loadMore.disabled = true;
    if (reset) { offset = 0; results.replaceChildren(el('p', { className: 'muted' }, 'Loading…')); }
    try {
      const extra = {};
      for (const [name, node] of values) { if (node.value) extra[name] = node.value; }
      const missing = extras(catalog).find(e => e.isRequired && e.name !== 'skip' && !extra[e.name]);
      if (missing) { results.replaceChildren(empty('Choose a filter', `This catalog requires ${missing.name}.`)); return; }
      if (extras(catalog).some(e => e.name === 'skip')) extra.skip = offset;
      const metas = await call('catalog', { ...catalog, extra });
      if (token !== generation || id !== requestId) return;
      if (reset) results.replaceChildren();
      if (metas.length) { results.append(cards(metas)); offset += metas.length; }
      else if (reset) results.append(empty('No titles found', 'Try another catalog or filter.'));
      loadMore.hidden = !metas.length || !extras(catalog).some(e => e.name === 'skip');
    } catch (e) { if (id === requestId) results.replaceChildren(errorBlock(e.message, () => load(true))); }
    finally { if (id === requestId) loadMore.disabled = false; }
  }
  function choose() {
    catalog = catalogs[Number(select.value)]; offset = 0; values = []; filters.replaceChildren();
    extras(catalog).filter(e => e.name !== 'skip').forEach(e => {
      const field = e.options ? el('select', { 'aria-label': e.name }, !e.isRequired && el('option', { value: '' }, 'All'), e.options.map(v => el('option', { value: v }, v))) : el('input', { 'aria-label': e.name, placeholder: e.name });
      field.addEventListener('change', () => load(true)); values.push([e.name, field]); filters.append(el('label', {}, e.name, field));
    });
    load(true);
  }
  select.addEventListener('change', choose);
  content.append(el('div', { className: 'filter-bar' }, el('label', {}, 'Catalog', select), filters), results, loadMore); choose();
}
function showSearch(content) {
  const field = el('input', { type: 'search', placeholder: 'Search your installed addon catalogs', 'aria-label': 'Search titles', maxlength: 500 });
  const results = el('div'); let requestId = 0;
  const recent = el('section', { className: 'recent-searches' });
  function renderRecent() {
    recent.hidden = !!field.value.trim(); recent.replaceChildren();
    if (!(state.searchHistory || []).length) return;
    recent.append(el('div', { className: 'section-heading' }, el('h2', {}, 'Recent Searches'), button('Clear search history', async () => { state = await call('recentSearch', { clear: true }); renderRecent(); }, 'button subtle small')));
    for (const term of state.searchHistory) recent.append(el('div', { className: 'recent-search-row' }, button(term, () => { field.value = term; return run(); }, 'button subtle'), button('×', async () => { state = await call('recentSearch', { term, remove: true }); renderRecent(); }, 'button subtle small')));
  }
  const run = async () => {
    const term = field.value.trim(), id = ++requestId;
    if (!term) { results.replaceChildren(); renderRecent(); return; }
    state = await call('recentSearch', { term }); renderRecent(); results.replaceChildren(el('p', { className: 'muted' }, 'Searching…'));
    try {
      const result = await call('search', { term }); if (id !== requestId || page !== 'Search') return;
      results.replaceChildren(el('h2', {}, `Results for “${term}”`));
      result.errors.forEach(error => results.append(errorBlock(error)));
      results.append(result.items.length ? cards(result.items) : empty(result.supported ? 'No matches' : 'No searchable catalogs', result.supported ? 'Try another title.' : 'Install an addon that declares a search catalog.'));
    } catch (e) { if (id === requestId) results.replaceChildren(errorBlock(e.message, run)); }
  };
  field.addEventListener('input', () => { renderRecent(); if (!field.value.trim()) { ++requestId; results.replaceChildren(); } });
  content.append(el('form', { className: 'search-form', onsubmit: e => { e.preventDefault(); run().catch(e => toast(e.message)); } }, field, el('button', { className: 'button primary', type: 'submit' }, 'Search')), recent, results); renderRecent(); field.focus();
}
function showLibrary(content) {
  const list = el('div'), tabs = el('div', { className: 'library-tabs', role: 'tablist', 'aria-label': 'Library sections' });
  const entries = Object.values(state.progress).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function render(tab) {
    tabs.querySelectorAll('button').forEach(node => { const active = node.textContent === tab; node.setAttribute('aria-selected', String(active)); node.classList.toggle('primary', active); });
    list.replaceChildren();
    if (tab !== 'WATCHLIST') {
      const progress = entries.filter(p => tab === 'WATCHED' ? p.watched : !p.watched && p.position > 0);
      list.append(progress.length ? cards(progress.map(p => ({ ...state.library.find(m => m.type === p.type && m.id === p.mediaId), ...p, id: p.mediaId })), progress) : empty(tab === 'WATCHED' ? 'Your watched history' : 'Nothing in progress', tab === 'WATCHED' ? 'Completed and marked-watched titles and episodes appear here.' : 'Start a title and return whenever you are ready.')); return;
    }
    if (!state.library.length) { list.append(empty('Keep your next watch close', 'Save movies and series from their details page.')); return; }
    for (const type of [...new Set(state.library.map(m => m.type))]) {
      const titles = state.library.filter(m => m.type === type), progress = titles.map(m => entries.find(p => p.mediaId === m.id && p.type === m.type));
      list.append(el('section', {}, el('h2', {}, type === 'series' ? 'Series' : type === 'movie' ? 'Movies' : type), cards(titles, progress)));
    }
  }
  for (const tab of ['WATCHLIST', 'WATCHED', 'IN PROGRESS']) { const node = button(tab, () => render(tab), 'button subtle'); node.setAttribute('role', 'tab'); tabs.append(node); }
  content.append(tabs, list); render('WATCHLIST');
}
function showAddons(content) {
  const input = el('input', { type: 'url', placeholder: 'https://your-addon.example/manifest.json', 'aria-label': 'Addon manifest URL' });
  const status = el('div', { role: 'status' }), install = el('button', { className: 'button primary', type: 'submit' }, 'Install addon');
  const form = el('form', { className: 'panel addon-form', onsubmit: async event => {
    event.preventDefault(); install.disabled = true; status.textContent = 'Checking addon manifest…';
    try { state = await call('install', { url: input.value }); toast('Addon installed.'); await navigate('Addons'); }
    catch (e) { status.replaceChildren(errorBlock(e.message)); }
    finally { install.disabled = false; }
  } }, el('h2', {}, 'Add by URL'), el('p', { className: 'muted' }, 'Bring a compatible addon. Its developer independently provides its catalogs and sources.'), el('div', { className: 'inline-form' }, input, install), status);
  content.append(el('h2', {}, `Installed addons (${state.addons.length})`));
  if (!state.addons.length) content.append(empty('Your collection starts here', 'Choose a compatible provider below, or add your own manifest URL.'));
  const installed = el('div', { className: 'addon-grid' });
  for (const addon of state.addons) {
    const m = addon.manifest, image = safeImage(m.logo);
    const actions = el('div', { className: 'actions' }, button('Remove', async () => { state = await call('remove', { transportUrl: addon.transportUrl }); await navigate('Addons'); }, 'button subtle small'));
    if (m.behaviorHints?.configurable || m.behaviorHints?.configurationRequired) actions.prepend(button('Configure', () => call('external', { url: addon.transportUrl.replace(/\/manifest\.json$/, '/configure') }), 'button small'));
    installed.append(el('article', { className: 'addon-card addon' }, el('div', { className: 'addon-identity' }, image ? el('img', { src: image, alt: '', loading: 'lazy', onerror: e => e.target.remove() }) : el('span', { className: 'addon-avatar' }, m.name.slice(0, 1)), el('div', {}, el('h3', {}, m.name), el('span', { className: 'muted' }, `v${m.version} · ${m.types.join(' / ')}`))), el('p', {}, m.description), el('div', { className: 'capabilities' }, m.resources.map(r => el('span', {}, r.name || r))), actions));
  }
  content.append(installed, el('section', { className: 'recommended' }, el('h2', {}, 'Recommended / Compatible'), el('article', { className: 'addon-card' }, el('div', { className: 'addon-identity' }, el('span', { className: 'addon-avatar' }, 'C'), el('div', {}, el('h3', {}, 'Cinemeta'), el('span', { className: 'muted' }, 'Compatible provider · Independently operated by Stremio'))), el('p', {}, 'Movie and series catalogs and metadata. No playable media is bundled. Installing enables requests to this third-party service.'), el('div', { className: 'capabilities' }, el('span', {}, 'catalog'), el('span', {}, 'meta')), el('div', { className: 'actions' }, state.addons.some(a => a.manifest.id === 'com.linvo.cinemeta') ? el('span', { className: 'tags' }, 'Installed') : button('Install Cinemeta', async () => { await call('install', { url: 'https://v3-cinemeta.strem.io/manifest.json' }); await navigate('Addons'); }, 'button primary small'), button('Provider terms', () => call('external', { url: 'https://www.stremio.com/tos' }), 'button subtle small')))), form);
}
async function showSettings(content) { return NymoraSettings.show(content, undefined, catalogSettings); }
async function catalogSettings(content) {
  const catalogs = await call('catalogs'), panel = el('section', { className: 'panel catalog-settings', 'aria-label': 'Home / Catalogs' });
  content.append(panel);
  function render() {
    const ordered = NymoraUI.orderedCatalogs(catalogs, state.settings);
    panel.replaceChildren(el('h2', {}, 'Home / Catalogs'), el('p', { className: 'muted' }, 'Continue Watching stays first. Catalog order changes only your Home layout.'), !ordered.length && el('p', { className: 'muted' }, 'Installed catalog rows will appear here.'));
    ordered.forEach((catalog, index) => {
      const key = NymoraUI.catalogKey(catalog), hidden = (state.settings.hiddenCatalogs || []).includes(key);
      const move = async offset => { const keys = ordered.map(NymoraUI.catalogKey); [keys[index], keys[index + offset]] = [keys[index + offset], keys[index]]; state = await call('settings', { homeCatalogOrder: keys }); render(); };
      const up = button('Move Up', () => move(-1), 'button subtle small'); up.disabled = index === 0;
      const down = button('Move Down', () => move(1), 'button subtle small'); down.disabled = index === ordered.length - 1;
      const row = el('div', { className: 'catalog-setting-row', 'data-catalog-key': key }, el('div', {}, el('strong', {}, `${catalog.name || catalog.id} · ${catalog.type}`), el('small', { className: 'muted' }, catalog.addonName, extras(catalog).some(e => e.isRequired) && ' · Discover filter required')), el('div', { className: 'actions' }, up, down, button(hidden ? 'Show row' : 'Hide row', async () => { const hiddenCatalogs = state.settings.hiddenCatalogs || []; state = await call('settings', { hiddenCatalogs: hidden ? hiddenCatalogs.filter(k => k !== key) : [...hiddenCatalogs, key] }); render(); }, 'button subtle small')));
      row.prepend(el('span', { className: 'catalog-grip', draggable: true, title: 'Drag to reorder; Move Up and Move Down also work', 'aria-hidden': 'true', ondragstart: e => { e.dataTransfer.setData('application/x-nymora-catalog', key); e.dataTransfer.effectAllowed = 'move'; } }, '⋮⋮'));
      row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      row.addEventListener('drop', async e => { e.preventDefault(); const dragged = e.dataTransfer.getData('application/x-nymora-catalog'), keys = ordered.map(NymoraUI.catalogKey), from = keys.indexOf(dragged); if (from < 0 || from === index) return; keys.splice(from, 1); keys.splice(index, 0, dragged); try { state = await call('settings', { homeCatalogOrder: keys }); render(); } catch (error) { toast(error.message); } });
      panel.append(row);
    });
    if (ordered.length) panel.append(button('Reset layout', async () => { state = await call('settings', { homeCatalogOrder: [], hiddenCatalogs: [] }); render(); toast('Home layout reset.'); }, 'button small'));
  }
  render();
}
function synopsis(text) {
  const paragraph = el('p', { className: 'description' }, text), wrapper = el('div', { className: 'synopsis' }, paragraph);
  const more = button('More', () => { const expanded = paragraph.classList.toggle('expanded'); more.textContent = expanded ? 'Less' : 'More'; more.setAttribute('aria-expanded', String(expanded)); }, 'button text-button small'); more.setAttribute('aria-expanded', 'false');
  if (String(text).length > 180) wrapper.append(more);
  return wrapper;
}
function renderHero(target, meta) {
  const image = safeImage(meta.poster), backdrop = safeImage(meta.background || meta.backdrop);
  target.replaceChildren(backdrop && el('img', { className: 'hero-backdrop', src: backdrop, alt: '', onerror: e => e.target.remove() }), el('div', { className: 'hero-content' }, image ? el('img', { className: 'detail-poster', src: image, alt: '', loading: 'lazy', onerror: e => e.target.remove() }) : el('div', { className: 'detail-poster poster-fallback' }, (meta.name || '?').slice(0, 1)), el('div', { className: 'hero-copy' }, el('p', { className: 'eyebrow' }, meta.type), el('h1', {}, meta.name), el('p', { className: 'metadata-line' }, [meta.releaseInfo || meta.year, NymoraUI.runtime(meta.runtime), meta.imdbRating && `IMDb ${meta.imdbRating}`].filter(Boolean).join(' · ')), meta.genres?.length && el('p', { className: 'tags' }, meta.genres.join(' · ')), meta.description && synopsis(meta.description))));
}
function episodeFacts(video, progress) { return [video.released && String(video.released).slice(0, 10), NymoraUI.runtime(video.runtime), (video.imdbRating || video.rating) && `Rating ${video.imdbRating || video.rating}`, progress?.watched ? 'Watched' : progress?.position ? `Continue at ${clock(progress.position)}` : ''].filter(Boolean).join(' · '); }
function renderCast(target, meta, back) {
  const people = meta.cast || [];
  target.replaceChildren(); if (!Array.isArray(people) || !people.length) return;
  const row = el('div', { className: 'cast-row' }); target.append(el('h2', {}, 'Cast'), row);
  for (const supplied of people) {
    const person = typeof supplied === 'string' ? { name: supplied } : supplied;
    if (!person?.name) continue;
    const image = safeImage(person.portrait || person.photo || person.image);
    const contents = [el('div', { className: 'cast-portrait' }, image ? el('img', { src: image, alt: '', loading: 'lazy', onerror: e => e.target.remove() }) : el('span', {}, person.name.split(' ').map(part => part.slice(0, 1)).slice(0, 2).join(''))), el('strong', {}, person.name), person.character && el('span', { className: 'muted' }, person.character)];
    const item = person.id && typeof person.id === 'string' ? button(contents, () => openPerson(person, back), 'cast-card') : el('div', { className: 'cast-card' }, ...contents);
    row.append(item);
  }
}
async function openPerson(person, back) {
  cancelStreamRequest(); page = 'Person'; const token = ++generation, content = shell();
  content.append(button('Back to title', back, 'button subtle small'));
  const display = el('div'); content.append(display);
  function render(value) {
    const image = safeImage(value.portrait || value.photo || value.image);
    display.replaceChildren(el('section', { className: 'person-hero' }, image && el('img', { src: image, alt: '', className: 'person-portrait' }), el('div', {}, el('p', { className: 'eyebrow' }, 'PERSON'), el('h1', {}, value.name), value.bio || value.biography ? synopsis(value.bio || value.biography) : el('p', { className: 'muted' }, 'No biography was supplied by your metadata providers.'))));
    const known = [...(value.knownFor || []), ...(value.knownMovies || []).map(m => ({ ...m, type: 'movie' })), ...(value.knownSeries || []).map(m => ({ ...m, type: 'series' }))].filter(m => typeof m.id === 'string' && m.name && ['movie', 'series'].includes(m.type));
    for (const type of ['movie', 'series']) { const items = known.filter(m => m.type === type); if (items.length) display.append(el('section', {}, el('h2', {}, type === 'movie' ? 'Known movies' : 'Known series'), cards(items))); }
  }
  render(person);
  // Only providers declaring the supplied person ID/type will receive this query.
  try { const result = await call('meta', { type: 'person', id: person.id }); if (token === generation) render(NymoraUI.mergeMetadata({ ...person, type: 'person' }, result.items)); } catch {}
}
function languageName(code) { return ({ eng: 'English', en: 'English', ara: 'Arabic · العربية', ar: 'Arabic · العربية', spa: 'Spanish', fra: 'French', deu: 'German', jpn: 'Japanese', por: 'Portuguese', rus: 'Russian', hin: 'Hindi', zho: 'Chinese' })[code] || code; }
async function openDetails(initial, resume) {
  cancelStreamRequest(); if (currentPlayer) await currentPlayer.close();
  page = 'Details'; const token = ++generation, content = shell();
  content.classList.add('detail-page'); content.append(el('p', { className: 'muted', role: 'status' }, 'Loading title…'));
  state = await call('state'); if (token !== generation) return;
  let meta = initial, problems = [];
  // Preserve early movie source querying while richer metadata loads independently.
  let firstMovieSources = initial.type === 'movie' ? call('streamsStart', { type: initial.type, id: initial.id }).then(value => ({ value }), error => ({ error })) : null;
  const metadataRequest = call('meta', { type: initial.type, id: initial.id }).then(value => ({ value }), error => ({ error }));
  const mergeMetadata = result => {
    if (result.error) { problems.push(result.error.message); return; }
    meta = NymoraUI.mergeMetadata(initial, result.value.items); problems = result.value.errors;
  };
  if (initial.type !== 'movie') mergeMetadata(await metadataRequest);
  if (token !== generation) return;
  content.replaceChildren();
  const save = button(state.library.some(m => m.id === meta.id && m.type === meta.type) ? 'Remove from Library' : 'Save to Library', async () => { state = await call('library', meta); save.textContent = state.library.some(m => m.id === meta.id && m.type === meta.type) ? 'Remove from Library' : 'Save to Library'; });
  const details = el('section', { className: 'details hero' }), cast = el('section', { className: 'cast-section' }), additional = el('section', { className: 'additional-metadata' });
  const sources = el('section', { className: 'sources' });
  const renderMetadata = () => {
    renderHero(details, meta); renderCast(cast, meta, () => openDetails(meta, resume));
    additional.replaceChildren(...(meta.director?.length ? [el('p', { className: 'muted' }, 'Directed by ' + meta.director.map(p => typeof p === 'string' ? p : p.name).filter(Boolean).join(', '))] : []));
    problems.forEach(p => additional.append(addonWarning(p)));
  };
  renderMetadata(); content.append(details);
  if (initial.type === 'movie') metadataRequest.then(result => { if (token === generation) { mergeMetadata(result); renderMetadata(); } });
  let sourceGeneration = 0;
  const loadStreams = async video => {
    cancelStreamRequest();
    const requestId = ++sourceGeneration;
    const loading = el('p', { className: 'muted', role: 'status' }, 'Querying installed stream addons…');
    const cardsContainer = el('div', { className: 'source-cards' });
    const notices = el('div', { className: 'source-notices' });
    sources.replaceChildren(el('h2', {}, video.name ? `Sources · ${video.name}` : 'Watch / Sources'), loading);
    const progress = state.progress[`${meta.type}:${video.id}`];
    let resumePosition = progress && !progress.watched ? progress.position : 0;
    if (resumePosition > 0) {
      const resumeToggle = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Resume saved progress', onchange: e => { resumePosition = e.target.checked ? progress.position : 0; } });
      sources.append(el('label', { className: 'resume-choice' }, resumeToggle, `Resume from ${clock(progress.position)}`));
    }
    sources.append(cardsContainer, notices);
    let key;
    const current = () => token === generation && requestId === sourceGeneration;
    try {
      const pending = firstMovieSources; firstMovieSources = null;
      const initialResponse = pending && await pending;
      if (initialResponse?.error) throw initialResponse.error;
      key = initialResponse?.value || await call('streamsStart', { type: meta.type, id: video.id });
      if (!current()) { await call('streamsCancel', { key }); return; }
      activeStreamKey = key;
      let rendered = 0, revision = -1;
      for (;;) {
        const response = await call('streamsState', { key });
        if (!current() || activeStreamKey !== key) return;
        if (response.revision !== revision) {
          revision = response.revision;
          for (const stream of response.items.slice(rendered)) {
            const hints = stream.behaviorHints || {};
            const bytes = stream.videoSize ?? hints.videoSize;
            cardsContainer.append(button(el('div', {}, el('span', { className: 'source-label' }, stream.addonName), el('h3', {}, stream.name || stream.title || 'Stream'), stream.name && stream.title && el('p', {}, stream.title), el('p', { className: 'muted' }, [stream.description, stream.filename || hints.filename, bytes && `${Math.round(bytes / 1048576)} MB`, stream.language, stream.quality, Number.isInteger(stream.seeders) && stream.seeders >= 0 ? `${stream.seeders} seeders (addon-reported)` : ''].filter(Boolean).join(' · ')), stream.nymoraP2P && el('p', { className: 'p2p-label' }, state.p2pNoticeAccepted ? 'BitTorrent / P2P' : 'BitTorrent / P2P · acknowledgement required')), () => startPlayer(meta, video, stream, resumePosition), 'source'));
          }
          rendered = response.items.length;
          notices.replaceChildren(...[...response.notices, ...response.errors].map(addonWarning));
          if (response.errors.length) notices.append(button('Copy Addon Diagnostics', () => call('copyAddonDiagnostics', { key }).then(() => toast('Redacted addon diagnostics copied.')), 'button subtle small'));
          loading.textContent = response.done ? '' : `Waiting for ${response.pending} addon${response.pending === 1 ? '' : 's'}…`;
        }
        if (response.done) {
          loading.remove();
          if (!rendered) cardsContainer.append(empty('No streams available', 'No playable sources were returned. Install a stream addon or retry.', button('Retry sources', () => loadStreams(video))));
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) { if (current() && (!key || activeStreamKey === key)) { loading.remove(); notices.append(addonWarning(e.message), button('Retry sources', () => loadStreams(video), 'button subtle small')); } }
  };
  if (meta.type === 'series') {
    const videos = (meta.videos || []).filter(v => typeof v.id === 'string');
    if (!videos.length) content.append(empty('No episodes supplied', 'Your metadata providers did not supply an episode list.', button('Retry metadata', () => openDetails(initial, resume))));
    else {
      const seasons = [...new Set(videos.map(v => v.season ?? 0))].sort((a, b) => a - b);
      const season = el('select', { 'aria-label': 'Season' }, seasons.map(s => el('option', { value: s }, s === 0 ? 'Specials' : `Season ${s}`)));
      const episodes = el('div', { className: 'episodes' }), paging = el('div', { className: 'episode-pagination' });
      const episodeSection = el('section', { className: 'episode-section' }, el('div', { className: 'section-heading' }, el('h2', {}, 'Episodes'), season), episodes, paging);
      const episodeView = el('section', { className: 'episode-view', hidden: true });
      let episodePage = 0;
      function showEpisodes() {
        const selected = videos.filter(v => String(v.season ?? 0) === season.value).sort((a, b) => (a.episode || 0) - (b.episode || 0));
        const count = Math.ceil(selected.length / 24); episodePage = Math.max(0, Math.min(episodePage, count - 1));
        episodes.replaceChildren(...selected.slice(episodePage * 24, episodePage * 24 + 24).map(v => {
          const progress = state.progress[`${meta.type}:${v.id}`];
          const thumbnail = safeImage(v.thumbnail || v.image);
          const label = `${v.episode !== undefined ? `${v.episode}. ` : ''}${v.title || v.name || v.id}`;
          const pick = button(el('div', { className: 'episode-content' }, el('div', { className: `episode-art ${state.settings.blurEpisodeThumbnails ? 'spoiler-blur' : ''}` }, thumbnail ? el('img', { src: thumbnail, alt: '', loading: 'lazy', onerror: e => e.target.remove() }) : el('span', {}, v.episode ?? '▶'), progress?.duration && el('div', { className: 'progress-bar' }, el('i', { style: `width:${Math.min(100, 100 * progress.position / progress.duration)}%` }))), el('div', { className: 'episode-info' }, el('strong', {}, label), el('p', { className: 'muted' }, episodeFacts(v, progress)))), () => openEpisode(v), 'episode');
          return el('article', { className: 'episode-row' }, pick, button(progress?.watched ? 'Mark unwatched' : 'Mark watched', async () => { state = await call('watched', { type: meta.type, id: v.id, mediaId: meta.id, name: meta.name, poster: meta.poster, watched: !progress?.watched }); showEpisodes(); }, 'button subtle small'));
        }));
        paging.replaceChildren();
        if (count > 1) {
          const previous = button('Previous episodes', () => { episodePage--; showEpisodes(); }, 'button subtle small'); previous.disabled = episodePage === 0;
          const next = button('Next episodes', () => { episodePage++; showEpisodes(); }, 'button subtle small'); next.disabled = episodePage >= count - 1;
          const jump = el('select', { 'aria-label': 'Episode page', onchange: () => { episodePage = Number(jump.value); showEpisodes(); } }, Array.from({ length: count }, (_, index) => el('option', { value: index }, `${index * 24 + 1}–${Math.min(selected.length, (index + 1) * 24)}`))); jump.value = String(episodePage);
          paging.append(previous, el('span', { className: 'muted' }, `${selected.length} episodes`), jump, next);
        }
      }
      function backToEpisodes() { cancelStreamRequest(); ++sourceGeneration; episodeView.hidden = true; episodeSection.hidden = false; details.hidden = false; cast.hidden = false; additional.hidden = false; showEpisodes(); content.scrollIntoView({ block: 'start' }); season.focus(); }
      async function openEpisode(video) {
        details.hidden = true; cast.hidden = true; additional.hidden = true; episodeSection.hidden = true; episodeView.hidden = false;
        const image = safeImage(video.thumbnail || video.image);
        const episodeTitle = video.title || video.name || video.id;
        episodeView.replaceChildren(button('Back to Episodes', backToEpisodes, 'button subtle small'), el('div', { className: 'episode-hero' }, el('p', { className: 'eyebrow' }, meta.name), el('p', { className: 'muted' }, [video.season !== undefined && `Season ${video.season}`, video.episode !== undefined && `Episode ${video.episode}`].filter(Boolean).join(' · ')), el('h1', {}, episodeTitle), image && el('div', { className: `episode-image ${state.settings.blurEpisodeThumbnails ? 'spoiler-blur' : ''}` }, el('img', { src: image, alt: '', loading: 'lazy' })), el('p', { className: 'muted' }, episodeFacts(video, state.progress[`${meta.type}:${video.id}`])), video.overview || video.description ? synopsis(video.overview || video.description) : null), sources);
        content.scrollIntoView({ block: 'start' }); episodeView.querySelector('button').focus();
        await loadStreams({ ...video, name: episodeTitle });
      }
      season.addEventListener('change', () => { episodePage = 0; showEpisodes(); });
      const resumedVideo = resume && videos.find(v => v.id === resume.id);
      if (resumedVideo) { season.value = String(resumedVideo.season ?? 0); episodePage = Math.floor(videos.filter(v => String(v.season ?? 0) === season.value).sort((a, b) => (a.episode || 0) - (b.episode || 0)).findIndex(v => v.id === resumedVideo.id) / 24); }
      showEpisodes(); content.append(episodeSection, episodeView, cast, additional, el('div', { className: 'title-actions' }, save));
      if (resumedVideo) await openEpisode(resumedVideo);
    }
  } else {
    const progress = state.progress[`${meta.type}:${meta.id}`];
    content.append(sources, cast, additional, el('div', { className: 'title-actions' }, save, button(progress?.watched ? 'Mark unwatched' : 'Mark watched', async () => { state = await call('watched', { type: meta.type, id: meta.id, mediaId: meta.id, name: meta.name, poster: meta.poster, watched: !progress?.watched }); await openDetails(meta); }, 'button subtle')));
    await loadStreams({ id: initial.id });
  }
}
async function prepareSource(stream) {
  if (preparingSource || currentPlayer) throw new Error('Exit or cancel the current playback session first.');
  preparingSource = true;
  const text = el('p', { role: 'status', 'data-testid': 'preparation-status' }, 'Preparing source…');
  const diagnosticsText = el('p', { className: 'muted', 'data-testid': 'discovery-diagnostics' });
  const stage = el('dialog', { className: 'preparation', 'aria-label': 'Preparing playback' }, el('h2', {}, 'Preparing playback'), text, diagnosticsText, button('Copy P2P Diagnostics', copyP2PDiagnostics, 'button subtle'), button('Cancel preparation', () => call('stop'), 'button subtle'));
  document.body.append(stage); stage.showModal();
  stage.addEventListener('cancel', event => { event.preventDefault(); call('stop').catch(e => toast(e.message)); });
  const timer = setInterval(async () => { try { const status = await call('playbackStatus'); if (status.message) text.textContent = status.message; if (stream.nymoraP2P && status.phase !== 'awaiting-consent') diagnosticsText.textContent = `Peers: ${status.peers} · Trackers: ${status.trackerWarnings || 0} warnings · DHT: ${status.dhtStatus || 'starting'} · Metadata: ${status.metadataState || 'not started'} · ${Math.round((status.discoveryElapsedMs || 0) / 1000)}s`; } catch {} }, 400);
  try { return await call('source', stream); }
  catch (error) { if (stream.nymoraP2P) { const sources = document.querySelector('.sources'); sources?.append(el('div', { className: 'p2p-failure', role: 'alert' }, el('p', {}, error.message), button('Copy P2P Diagnostics', copyP2PDiagnostics))); } throw error; }
  finally { clearInterval(timer); stage.close(); stage.remove(); preparingSource = false; }
}
async function startPlayer(meta, episode, stream, start) {
  const source = await prepareSource(stream);
  if (source.cancelled) return;
  cancelStreamRequest();
  if (source.p2p) stream = { ...stream, behaviorHints: { ...stream.behaviorHints, filename: source.filename, videoSize: source.videoSize } };
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const video = el('video', { playsinline: true, 'aria-label': 'Media player' });
  video.volume = state.settings.volume;
  const overlay = el('div', { className: 'subtitle-overlay', dir: 'auto', 'aria-live': 'off', 'data-testid': 'subtitle-overlay' });
  overlay.style.fontSize = `${state.settings.subtitleSize}px`;
  overlay.dataset.appearance = state.settings.subtitleAppearance;
  const playerError = el('div', { className: 'player-error', role: 'alert', hidden: true });
  const status = el('span', { className: 'player-status', role: 'status' }, 'Connecting…');
  const p2pInfo = el('span', { className: 'p2p-stats', 'data-testid': 'p2p-stats' });
  const p2pTimer = source.p2p ? setInterval(async () => { try { const details = await call('playbackStatus'); p2pInfo.textContent = `${details.peers} peers · ↓ ${(details.downloadSpeed / 1048576).toFixed(1)} MB/s`; if (details.phase === 'error') failed(details.message); } catch {} }, 1000) : null;
  const togglePlay = () => video.paused ? video.play() : video.pause();
  const play = iconButton('Pause', 'pause', togglePlay);
  const mute = iconButton('Mute', 'volume', () => { video.muted = !video.muted; updateIcon(mute, video.muted ? 'Unmute' : 'Mute', video.muted ? 'mute' : 'volume'); });
  const seek = el('input', { type: 'range', min: 0, max: 0, step: 0.1, value: 0, 'aria-label': 'Playback position', oninput: event => { if (Number.isFinite(video.duration)) video.currentTime = Number(event.target.value); } });
  const time = el('span', { className: 'time' }, '0:00 / 0:00');
  const volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: video.volume, 'aria-label': 'Volume', oninput: event => { video.volume = Number(event.target.value); }, onchange: () => call('settings', { volume: video.volume }).catch(e => toast(e.message)) });
  const subtitleSelect = el('select', { 'aria-label': 'Subtitle track' }, el('option', { value: '' }, 'Subtitles off'));
  const audioSelect = el('select', { 'aria-label': 'Audio track' }, el('option', { value: '' }, 'Default audio'));
  const delay = el('input', { type: 'number', min: -120, max: 120, step: 0.5, value: state.settings.subtitleDelay, 'aria-label': 'Subtitle delay', onchange: async () => { state = await call('settings', { subtitleDelay: Number(delay.value) }); delay.value = state.settings.subtitleDelay; } });
  const size = el('input', { type: 'range', min: 16, max: 72, value: state.settings.subtitleSize, 'aria-label': 'Player subtitle size', oninput: () => { overlay.style.fontSize = `${size.value}px`; }, onchange: async () => { state = await call('settings', { subtitleSize: Number(size.value) }); } });
  let hls, cues = [], subtitleResults = [], closed = false, lastSave = 0, subtitleRequest = 0;
  const subtitleStatus = el('span', { className: 'muted' });
  const speedPill = el('div', { className: 'speed-pill', hidden: true, role: 'status', 'data-testid': 'speed-indicator' }, '2× Speed');
  const seekFeedback = el('div', { className: 'seek-feedback', hidden: true, role: 'status', 'data-testid': 'seek-feedback' });
  const speed = el('select', { 'aria-label': 'Playback speed', onchange: () => { if (!spaceHeld) video.playbackRate = Number(speed.value); } }, [0.5, 1, 1.25, 1.5, 2].map(rate => el('option', { value: rate }, `${rate}×`))); speed.value = '1';
  const menus = [];
  function playerMenu(title, ...children) { const menu = el('section', { className: 'player-menu', hidden: true, 'aria-label': title }, el('h2', {}, title), ...children); menus.push(menu); return menu; }
  const subtitleMenu = playerMenu('Subtitles', el('label', {}, 'Track', subtitleSelect), el('div', { className: 'actions' }, button('Refresh subtitles', loadSubtitleResults, 'button small'), button('Local subtitle', async () => { const selected = await call('localSubtitle'); if (selected) { ++subtitleRequest; cues = selected.cues; subtitleSelect.value = ''; subtitleStatus.textContent = selected.name; renderSubtitles(); } }, 'button small')), el('label', {}, 'Delay (s)', delay), el('label', {}, 'Text size', size), subtitleStatus);
  const audioMenu = playerMenu('Audio', el('label', {}, 'Track', audioSelect));
  const settingsMenu = playerMenu('Player settings', el('label', {}, 'Speed', speed), el('p', { className: 'muted' }, 'Space: play / pause · Hold Space: 2× speed\n← / →: seek · ↑ / ↓: volume · M: mute · F: fullscreen'));
  function closeMenus() { menus.forEach(menu => { menu.hidden = true; }); menuButtons.forEach(node => node.setAttribute('aria-expanded', 'false')); }
  const menuButtons = [];
  function menuButton(label, name, menu) { const node = iconButton(label, name, () => { const show = menu.hidden; closeMenus(); menu.hidden = !show; node.setAttribute('aria-expanded', String(show)); showControls(); }); node.setAttribute('aria-expanded', 'false'); menuButtons.push(node); return node; }
  const fullscreenButton = iconButton('Fullscreen', 'fullscreen', toggleFullscreen); fullscreenButton.append(el('span', {}, 'Fullscreen')); fullscreenButton.classList.add('fullscreen-button'); fullscreenButton.title = 'Fullscreen (F)';
  const layer = el('div', { className: 'player-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Playing ${meta.name}`, tabindex: -1 },
    el('div', { className: 'video-stage' }, video, overlay, playerError, speedPill, seekFeedback),
    el('header', { className: 'player-header' }, el('div', { className: 'player-title' }, el('strong', {}, meta.name), el('span', { className: 'muted' }, episode.name || ''), status, p2pInfo), iconButton('Exit player', 'close', close)),
    el('div', { className: 'player-controls' }, el('div', { className: 'timeline' }, seek, time), el('div', { className: 'control-row' }, play, iconButton('Seek back 10 seconds', 'back', () => seekBy(-10)), iconButton('Seek forward 10 seconds', 'forward', () => seekBy(10)), mute, volume, el('div', { className: 'control-spacer' }), menuButton('Audio', 'audio', audioMenu), menuButton('Subtitles', 'subtitles', subtitleMenu), menuButton('Player settings', 'settings', settingsMenu), fullscreenButton)), ...menus);
  document.body.append(layer);
  root.inert = true; layer.focus();
  let hideTimer, feedbackTimer, spaceTimer, clickTimer, spaceDown = false, spaceHeld = false, previousSpeed = 1, fullscreenEnabled = false, pointerControls = false, keyboardControls = false, controlsDragging = false;
  function showControls() {
    layer.classList.remove('controls-hidden'); clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (closed || video.paused || pointerControls || controlsDragging || menus.some(menu => !menu.hidden) || (keyboardControls && (layer.querySelector('.player-controls')?.contains(document.activeElement) || layer.querySelector('.player-header')?.contains(document.activeElement)))) return;
      layer.classList.add('controls-hidden');
    }, 2500);
  }
  const controls = layer.querySelector('.player-controls');
  controls.addEventListener('pointerenter', () => { pointerControls = true; showControls(); });
  controls.addEventListener('pointerleave', () => { pointerControls = false; showControls(); });
  controls.addEventListener('pointerdown', () => { controlsDragging = true; keyboardControls = false; showControls(); });
  function releaseControls() { controlsDragging = false; showControls(); }
  window.addEventListener('pointerup', releaseControls); window.addEventListener('pointercancel', releaseControls);
  layer.addEventListener('pointermove', () => { keyboardControls = false; showControls(); });
  layer.addEventListener('keydown', event => { if (event.code === 'Tab') keyboardControls = true; });
  layer.addEventListener('focusin', showControls); layer.addEventListener('focusout', showControls);
  video.addEventListener('click', event => { clearTimeout(clickTimer); if (event.detail < 2) clickTimer = setTimeout(() => { closeMenus(); Promise.resolve(togglePlay()).catch(e => toast(e.message)); showControls(); }, 230); });
  video.addEventListener('dblclick', () => { clearTimeout(clickTimer); toggleFullscreen().catch(e => toast(e.message)); });
  function seekBy(seconds) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    seekFeedback.textContent = seconds < 0 ? '↶ 10s' : '10s ↷'; seekFeedback.classList.toggle('backward', seconds < 0); seekFeedback.hidden = false;
    clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { seekFeedback.hidden = true; }, 800); showControls();
  }
  async function toggleFullscreen() { fullscreenEnabled = await call('fullscreen'); layer.classList.toggle('native-fullscreen', fullscreenEnabled); showControls(); }
  function releaseSpace(toggle = false) {
    clearTimeout(spaceTimer);
    const wasDown = spaceDown, wasHeld = spaceHeld; spaceDown = false; spaceHeld = false;
    if (wasHeld) video.playbackRate = previousSpeed;
    speedPill.hidden = true;
    if (toggle && wasDown && !wasHeld) Promise.resolve(togglePlay()).catch(e => toast(e.message));
  }
  function onBlur() { releaseSpace(); }
  function keyup(event) { if (event.code === 'Space' && spaceDown) { event.preventDefault(); releaseSpace(!NymoraUI.typingTarget(event.target)); showControls(); } }
  showControls();
  async function save() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    state = await call('progress', { id: episode.id, mediaId: meta.id, type: meta.type, name: meta.name, episodeName: episode.name || '', poster: meta.poster, position: video.currentTime, duration: video.duration });
  }
  async function close() {
    if (closed) return; closed = true;
    clearInterval(p2pTimer);
    clearTimeout(hideTimer); clearTimeout(feedbackTimer); clearTimeout(clickTimer); releaseSpace();
    await save().catch(e => toast(`Unable to save progress: ${e.message}`));
    video.pause(); hls?.destroy(); video.removeAttribute('src'); video.load();
    document.removeEventListener('keydown', shortcuts); document.removeEventListener('keyup', keyup); window.removeEventListener('blur', onBlur); window.removeEventListener('beforeunload', saveOnExit);
    window.removeEventListener('pointerup', releaseControls); window.removeEventListener('pointercancel', releaseControls);
    const fullscreen = await call('state'); state = fullscreen;
    await call('stop'); layer.remove(); root.inert = false; currentPlayer = null; document.body.style.overflow = previousOverflow;
    await call('fullscreen', { enabled: false });
  }
  function saveOnExit() { save(); }
  function shortcuts(event) {
    if (NymoraUI.typingTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyM', 'KeyF', 'Escape'].includes(event.code)) return;
    event.preventDefault(); if (event.repeat) return; showControls();
    if (event.code === 'Space') {
      if (spaceDown) return; spaceDown = true;
      spaceTimer = setTimeout(() => { if (!spaceDown || closed) return; previousSpeed = video.playbackRate; spaceHeld = true; video.playbackRate = 2; speedPill.hidden = false; }, 350);
    } else if (event.code === 'ArrowLeft') seekBy(-10);
    else if (event.code === 'ArrowRight') seekBy(10);
    else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') { video.volume = Math.max(0, Math.min(1, video.volume + (event.code === 'ArrowUp' ? 0.05 : -0.05))); volume.value = video.volume; call('settings', { volume: video.volume }).catch(e => toast(e.message)); }
    else if (event.code === 'KeyM') mute.click();
    else if (event.code === 'KeyF') toggleFullscreen().catch(e => toast(e.message));
    else if (event.code === 'Escape') { releaseSpace(); closeMenus(); if (fullscreenEnabled) { fullscreenEnabled = false; call('fullscreen', { enabled: false }).catch(e => toast(e.message)); } }
  }
  window.addEventListener('beforeunload', saveOnExit); window.addEventListener('blur', onBlur); document.addEventListener('keydown', shortcuts); document.addEventListener('keyup', keyup);
  currentPlayer = { close, fullscreen: enabled => { fullscreenEnabled = enabled; layer.classList.toggle('native-fullscreen', enabled); showControls(); } };
  video.addEventListener('loadedmetadata', () => { seek.max = Number.isFinite(video.duration) ? video.duration : 0; if (start && start < video.duration - 1) video.currentTime = start; status.textContent = 'Ready'; refreshAudio(); });
  video.addEventListener('playing', () => { status.textContent = 'Playing'; playerError.hidden = true; });
  video.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  video.addEventListener('play', () => { updateIcon(play, 'Pause', 'pause'); showControls(); });
  video.addEventListener('pause', () => { updateIcon(play, 'Play', 'play'); showControls(); if (!closed) { status.textContent = 'Paused'; save().catch(e => toast(e.message)); } });
  video.addEventListener('ended', async () => {
    status.textContent = 'Finished';
    await save().catch(e => toast(e.message));
    if (source.p2p) {
      clearInterval(p2pTimer); await call('stop').catch(e => toast(e.message));
      play.disabled = true; seek.disabled = true;
      p2pInfo.textContent = 'P2P session closed · exit to choose a source again';
    }
  });
  video.addEventListener('seeked', () => save().catch(e => toast(e.message)));
  function renderSubtitles() {
    const subtitleTime = video.currentTime - Number(delay.value || 0);
    const text = cues.filter(c => c.start <= subtitleTime && c.end > subtitleTime).map(c => c.text).join('\n');
    overlay.replaceChildren(text ? el('span', { className: 'subtitle-cue' }, text) : '');
  }
  video.addEventListener('timeupdate', () => { seek.value = video.currentTime; time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`; renderSubtitles(); if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save().catch(e => toast(e.message)); } });
  function failed(message) { status.textContent = 'Playback failed'; playerError.hidden = false; playerError.replaceChildren(el('h2', {}, 'Playback failed'), el('p', {}, message), el('p', {}, 'Try another source.'), button('Return to sources', close)); }
  video.addEventListener('error', () => failed([3, 4].includes(video.error?.code) ? source.p2p ? 'Torrent metadata and video bytes arrived, but this codec or container cannot be decoded by Nymora’s Chromium player. Choose a compatible source.' : 'Unsupported stream or codec.' : 'Video data could not be read. Check the source connection.'));
  let audioPreferenceApplied = false;
  function refreshAudio() {
    const tracks = hls?.audioTracks || [...(video.audioTracks || [])];
    audioSelect.replaceChildren(...(tracks.length ? tracks.map((track, i) => el('option', { value: i }, track.name || track.label || languageName(track.lang || track.language || '') || `Audio ${i + 1}`)) : [el('option', { value: '' }, 'Default audio')]));
    audioSelect.disabled = tracks.length <= 1;
    if (hls && hls.audioTrack >= 0) audioSelect.value = hls.audioTrack;
    if (!audioPreferenceApplied && state.settings.audioLanguage) {
      const index = tracks.findIndex(track => NymoraUI.languageMatches(track.lang || track.language, state.settings.audioLanguage));
      if (index >= 0) { audioPreferenceApplied = true; audioSelect.value = index; if (hls) hls.audioTrack = index; else [...video.audioTracks].forEach((track, i) => { track.enabled = i === index; }); }
    }
  }
  audioSelect.addEventListener('change', () => { const index = Number(audioSelect.value), tracks = hls?.audioTracks || [...(video.audioTracks || [])]; audioPreferenceApplied = true; if (hls) hls.audioTrack = index; else if (video.audioTracks) [...video.audioTracks].forEach((track, i) => { track.enabled = i === index; }); const language = tracks[index]?.lang || tracks[index]?.language; if (language) call('settings', { audioLanguage: language }).then(value => { state = value; }).catch(e => toast(e.message)); });
  function embeddedTracks() {
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i]; track.mode = 'disabled';
      if (!subtitleSelect.querySelector(`option[value="embedded:${i}"]`)) subtitleSelect.append(el('option', { value: `embedded:${i}` }, track.label || languageName(track.language) || `Embedded ${i + 1}`));
    }
  }
  video.textTracks.addEventListener('addtrack', embeddedTracks);
  if (source.hls) {
    if (!Hls.isSupported()) { failed('HLS playback is unavailable on this system.'); return; }
    hls = new Hls({ enableWorker: true });
    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) failed(`HLS ${data.type}: ${data.details}`); });
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, refreshAudio);
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      subtitleSelect.querySelectorAll('option[value^="hls:"]').forEach(o => o.remove());
      hls.subtitleTracks.forEach((track, i) => subtitleSelect.append(el('option', { value: `hls:${i}` }, track.name || languageName(track.lang) || `Embedded ${i + 1}`)));
    });
    hls.loadSource(source.url); hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(e => toast(e.message)));
  } else { video.src = source.url; video.play().catch(e => { if (!closed) failed(e.message); }); }
  async function loadSubtitleResults() {
    subtitleStatus.textContent = 'Querying subtitles…';
    try {
      const hints = stream.behaviorHints || {};
      const extra = { videoID: episode.id };
      if (hints.filename) extra.filename = hints.filename;
      if (hints.videoSize) extra.videoSize = hints.videoSize;
      if (hints.videoHash) extra.videoHash = hints.videoHash;
      const result = await call('subtitles', { type: meta.type, id: episode.id, extra });
      if (closed) return;
      subtitleResults = [...(stream.subtitles || []), ...result.items].filter(s => typeof s.url === 'string');
      subtitleSelect.querySelectorAll('option[value^="addon:"]').forEach(o => o.remove());
      subtitleResults.forEach((s, i) => subtitleSelect.append(el('option', { value: `addon:${i}` }, `${s.label || languageName(s.lang)}${s.addonName ? ` · ${s.addonName}` : ''}`)));
      subtitleStatus.textContent = result.errors.length ? result.errors.join(' | ') : subtitleResults.length ? `${subtitleResults.length} tracks available` : 'No addon subtitles returned';
      if (!subtitleSelect.value) {
        const index = subtitleResults.findIndex(s => s.lang === state.settings.subtitleLanguage || (state.settings.subtitleLanguage === 'ara' && s.lang === 'ar') || (state.settings.subtitleLanguage === 'eng' && s.lang === 'en'));
        if (index >= 0) { subtitleSelect.value = `addon:${index}`; await selectSubtitle(); }
      }
    } catch (e) { if (!closed) subtitleStatus.textContent = `Subtitles unavailable: ${e.message}`; }
  }
  async function selectSubtitle() {
    const requestId = ++subtitleRequest; cues = []; overlay.textContent = '';
    [...video.textTracks].forEach(t => { t.mode = 'disabled'; });
    if (hls) { hls.subtitleTrack = -1; hls.subtitleDisplay = false; }
    const [kind, raw] = subtitleSelect.value.split(':'), index = Number(raw);
    if (kind === 'addon') {
      subtitleStatus.textContent = 'Loading subtitle…';
      try {
        const loaded = await call('subtitleFile', { url: subtitleResults[index].url });
        if (closed || requestId !== subtitleRequest) return;
        cues = loaded; subtitleStatus.textContent = subtitleResults[index].label || languageName(subtitleResults[index].lang); renderSubtitles();
        state = await call('settings', { subtitleLanguage: subtitleResults[index].lang || 'eng' });
      } catch (e) { if (requestId === subtitleRequest) subtitleStatus.textContent = `Subtitle failed: ${e.message}`; }
    } else if (kind === 'hls' && hls) { hls.subtitleDisplay = true; hls.subtitleTrack = index; subtitleStatus.textContent = 'Embedded HLS subtitles'; }
    else if (kind === 'embedded' && video.textTracks[index]) { video.textTracks[index].mode = 'showing'; subtitleStatus.textContent = 'Embedded subtitles'; }
    else subtitleStatus.textContent = 'Subtitles off';
  }
  subtitleSelect.addEventListener('change', selectSubtitle);
  await loadSubtitleResults();
}
window.addEventListener('unhandledrejection', event => { toast(event.reason?.message || 'Something went wrong. Please retry.'); });
let consentDialog, consentNonce;
window.nymora.onP2PNotice(notice => {
  consentDialog?.remove(); consentNonce = notice.nonce;
  const answer = async accepted => {
    consentDialog.querySelectorAll('button').forEach(node => { node.disabled = true; });
    try { await call('p2pNoticeAnswer', { nonce: notice.nonce, accepted }); if (accepted) state = await call('state'); }
    catch (error) { toast(error.message); consentDialog?.querySelectorAll('button').forEach(node => { node.disabled = false; }); }
  };
  consentDialog = el('dialog', { className: 'consent-dialog', 'aria-labelledby': 'consent-title' }, el('span', { className: 'notice-icon', 'aria-hidden': 'true' }, '!'), el('p', { className: 'eyebrow' }, 'BEFORE YOU STREAM'), el('h2', { id: 'consent-title' }, notice.title), el('p', { className: 'notice-message' }, notice.message), ...notice.detail.split('\n\n').map(text => el('p', { className: 'muted' }, text)), el('p', { className: 'notice-remember' }, 'Nymora will remember your acknowledgement on this device. You can reset it in Settings → P2P & Network.'), el('div', { className: 'actions' }, button('Cancel', () => answer(false), 'button subtle'), button('I Understand — Play', () => answer(true), 'button primary')));
  consentDialog.addEventListener('cancel', event => { event.preventDefault(); answer(false); });
  document.body.append(consentDialog); consentDialog.showModal(); consentDialog.querySelector('button').focus();
});
window.nymora.onP2PNoticeDismiss(nonce => { if (nonce !== consentNonce) return; consentDialog?.close(); consentDialog?.remove(); consentDialog = null; consentNonce = null; });
window.nymora.onFullscreen(enabled => currentPlayer?.fullscreen(enabled));
window.nymora.onClose(async () => { try { if (currentPlayer) await currentPlayer.close(); } finally { await call('quitReady'); } });
const titlebar = el('div', { className: 'window-titlebar', 'aria-label': 'Window controls', ondblclick: event => { if (!event.target.closest('button')) call('windowControl', { action: 'maximize' }); } }, el('span', { className: 'window-label' }, el('img', { src: 'logo.svg', alt: '', width: 16 }), 'Nymora'), el('div', { className: 'window-buttons' }, ...[['Minimize window', 'minimize', '−'], ['Maximize or restore window', 'maximize', '□'], ['Close window', 'close', '×']].map(([label, action, text]) => { const node = button(text, () => call('windowControl', { action }), 'window-button'); node.setAttribute('aria-label', label); return node; })));
document.body.prepend(titlebar);
navigate('Home').then(() => showIntro());
