// Hls is loaded from the pinned local hls.js distribution by index.html.
const root = document.getElementById('app');
const call = (op, value) => window.nymora.call(op, value);
let state, page = 'Home', generation = 0, currentPlayer = null;
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
function toast(message) { const node = document.getElementById('toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), 7000); }
function safeImage(url) { try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; } }
function clock(seconds) { if (!Number.isFinite(seconds)) return '0:00'; const s = Math.floor(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function heading(title, caption) { return el('header', { className: 'page-heading' }, el('div', {}, el('p', { className: 'eyebrow' }, 'YOUR SCREEN. YOUR SOURCES.'), el('h1', {}, title), caption && el('p', { className: 'muted' }, caption))); }
function empty(title, message, action) { return el('div', { className: 'empty' }, el('span', { className: 'empty-symbol' }, '◎'), el('h2', {}, title), el('p', {}, message), action); }
function errorBlock(message, retry) { return el('div', { className: 'error', role: 'alert' }, el('p', {}, message), retry && button('Retry', retry, 'button small')); }
function card(meta, progress) {
  const image = safeImage(meta.poster);
  const art = el('div', { className: 'poster' }, image ? el('img', { src: image, alt: '', loading: 'lazy', onerror: event => event.target.remove() }) : el('span', { className: 'poster-letter' }, (meta.name || '?').slice(0, 1)), progress?.watched && el('span', { className: 'badge' }, 'Watched'));
  if (progress?.duration) art.append(el('div', { className: 'progress-bar' }, el('i', { style: `width:${Math.min(100, 100 * progress.position / progress.duration)}%` })));
  return el('button', { className: 'card', onclick: () => openDetails(meta, progress).catch(e => toast(e.message)), 'aria-label': `Open ${meta.name}` }, art, el('strong', {}, meta.name), el('span', { className: 'card-info' }, progress?.episodeName || [meta.releaseInfo, meta.type].filter(Boolean).join(' · ')), progress && !progress.watched && el('span', { className: 'muted' }, `${clock(progress.position)} / ${clock(progress.duration)}`));
}
function cards(metas, progress) { return el('div', { className: 'cards' }, metas.map((m, i) => card(m, progress?.[i]))); }
function shell() {
  const content = el('main', { id: 'content' });
  root.replaceChildren(el('aside', { className: 'sidebar' }, el('div', { className: 'wordmark' }, el('img', { src: 'logo.svg', alt: 'Nymora', width: 40 }), el('span', {}, 'NYMORA')), el('nav', { 'aria-label': 'Main navigation' }, navItems.map((item, index) => { const node = button(item, () => navigate(item), `nav-item ${page === item ? 'active' : ''} nav-${index}`); node.setAttribute('aria-label', item); return node; })), el('div', { className: 'sidebar-foot' }, el('span', { className: 'status-dot' }), 'Local by design', el('small', {}, 'Independent. Open source.'))), content);
  return content;
}
async function navigate(target) {
  if (currentPlayer) await currentPlayer.close();
  page = target; const token = ++generation; const content = shell();
  content.append(heading(target, target === 'Home' ? 'A quiet place for everything you want to watch.' : undefined));
  try {
    state = await call('state');
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
  const continuing = progress.filter(p => !p.watched && p.position > 0);
  if (continuing.length) content.append(el('section', {}, el('h2', {}, 'Continue Watching'), cards(continuing.map(p => ({ ...p, id: p.mediaId })), continuing)));
  const watched = progress.filter(p => p.watched).slice(0, 12);
  if (watched.length) content.append(el('section', {}, el('h2', {}, 'Recently Watched'), cards(watched.map(p => ({ ...p, id: p.mediaId })), watched)));
  const catalogs = await call('catalogs');
  if (token !== generation) return;
  if (!catalogs.length) { content.append(empty('Make room for a good story', 'Install an addon to bring its catalogs into Nymora. Your library and watch history stay on this device.', button('Add your first addon', () => navigate('Addons'), 'button primary'))); return; }
  // Required search-only or filtered catalogs must not be queried without their required extras.
  const browseable = catalogs.filter(c => !extras(c).some(e => e.isRequired));
  if (!browseable.length) content.append(empty('Your catalogs need a filter', 'Use Discover to choose a filter, or Search for addons that support search.', button('Open Discover', () => navigate('Discover'))));
  await Promise.all(browseable.map(async c => {
    const section = el('section', {}, el('div', { className: 'section-heading' }, el('h2', {}, `${c.name || c.id} · ${c.type === 'movie' ? 'Movies' : c.type === 'series' ? 'Series' : c.type}`), el('span', { className: 'muted' }, c.addonName)), el('p', { className: 'muted' }, 'Loading catalog…'));
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
  const run = async () => {
    const term = field.value.trim(), id = ++requestId;
    if (!term) return; results.replaceChildren(el('p', { className: 'muted' }, 'Searching…'));
    try {
      const result = await call('search', { term }); if (id !== requestId || page !== 'Search') return;
      results.replaceChildren(el('h2', {}, `Results for “${term}”`));
      result.errors.forEach(error => results.append(errorBlock(error)));
      results.append(result.items.length ? cards(result.items) : empty(result.supported ? 'No matches' : 'No searchable catalogs', result.supported ? 'Try another title.' : 'Install an addon that declares a search catalog.'));
    } catch (e) { if (id === requestId) results.replaceChildren(errorBlock(e.message, run)); }
  };
  content.append(el('form', { className: 'search-form', onsubmit: e => { e.preventDefault(); run(); } }, field, el('button', { className: 'button primary', type: 'submit' }, 'Search')), results); field.focus();
}
function showLibrary(content) {
  if (!state.library.length) { content.append(empty('Keep your next watch close', 'Save movies and series from their details page.')); return; }
  for (const type of [...new Set(state.library.map(m => m.type))]) {
    const titles = state.library.filter(m => m.type === type);
    const progress = titles.map(m => Object.values(state.progress).filter(p => p.mediaId === m.id && p.type === m.type).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]);
    content.append(el('section', {}, el('h2', {}, type === 'series' ? 'Series' : type === 'movie' ? 'Movies' : type), cards(titles, progress)));
  }
}
function showAddons(content) {
  const input = el('input', { type: 'url', placeholder: 'https://your-addon.example/manifest.json', 'aria-label': 'Addon manifest URL' });
  const status = el('div', { role: 'status' }), install = el('button', { className: 'button primary', type: 'submit' }, 'Install addon');
  const form = el('form', { className: 'panel addon-form', onsubmit: async event => {
    event.preventDefault(); install.disabled = true; status.textContent = 'Checking addon manifest…';
    try { state = await call('install', { url: input.value }); toast('Addon installed.'); await navigate('Addons'); }
    catch (e) { status.replaceChildren(errorBlock(e.message)); }
    finally { install.disabled = false; }
  } }, el('h2', {}, 'Bring your own sources'), el('p', { className: 'muted' }, 'Install a compatible addon using its manifest URL. Addons are independent services; their catalogs and streams are provided by their developers.'), el('div', { className: 'inline-form' }, input, install), status);
  content.append(form, el('h2', {}, `Installed addons (${state.addons.length})`));
  if (!state.addons.length) content.append(empty('A clean start', 'Nymora has no preinstalled media sources.'));
  for (const addon of state.addons) {
    const m = addon.manifest;
    const actions = el('div', { className: 'actions' }, button('Remove', async () => { state = await call('remove', { transportUrl: addon.transportUrl }); await navigate('Addons'); }, 'button subtle'));
    if (m.behaviorHints?.configurable || m.behaviorHints?.configurationRequired) actions.prepend(button('Configure', () => call('external', { url: addon.transportUrl.replace(/\/manifest\.json$/, '/configure') })));
    content.append(el('article', { className: 'panel addon' }, el('div', {}, el('h3', {}, m.name, el('span', { className: 'version' }, `v${m.version}`)), el('p', {}, m.description), el('p', { className: 'muted' }, `Resources: ${m.resources.map(r => r.name || r).join(', ')}`), el('p', { className: 'muted' }, `Content: ${m.types.join(', ')}`), el('p', { className: 'mono muted' }, addon.transportUrl)), actions));
  }
}
async function showSettings(content) {
  const language = el('select', { 'aria-label': 'Preferred subtitle language' }, ['eng', 'ara', 'spa', 'fra', 'deu', 'jpn', 'por', 'rus', 'hin', 'zho'].map(code => el('option', { value: code }, languageName(code))));
  if (![...language.options].some(o => o.value === state.settings.subtitleLanguage)) language.append(el('option', { value: state.settings.subtitleLanguage }, state.settings.subtitleLanguage));
  language.value = state.settings.subtitleLanguage;
  language.addEventListener('change', async () => { state = await call('settings', { subtitleLanguage: language.value }); toast('Subtitle preference saved.'); });
  const size = el('input', { type: 'range', min: 16, max: 72, value: state.settings.subtitleSize, 'aria-label': 'Subtitle size' });
  size.addEventListener('change', async () => { state = await call('settings', { subtitleSize: Number(size.value) }); });
  const notices = el('pre', { className: 'notices', hidden: true });
  content.append(el('section', { className: 'panel settings' }, el('h2', {}, 'Subtitles'), el('label', {}, 'Preferred language', language), el('label', {}, 'Text size', size), el('p', { className: 'muted' }, 'Arabic, English and other Unicode subtitles render with automatic text direction. Adjust timing in the player.')),
    el('section', { className: 'panel' }, el('h2', {}, 'Storage & privacy'), el('p', {}, 'Your addons, library, settings and playback progress stay on this computer. Nymora does not collect analytics or upload watch history.'), el('p', { className: 'mono muted' }, state.dataDirectory), el('p', { className: 'muted' }, 'Installed addons receive requests for the titles you browse and play. Removing an addon does not erase your library or history.')),
    el('section', { className: 'panel' }, el('div', { className: 'wordmark' }, el('img', { src: 'logo.svg', alt: '', width: 40 }), el('h2', {}, 'NYMORA')), el('p', {}, `Version ${state.appVersion}`), el('p', {}, 'Nymora is an independent open-source project. It is not affiliated with, sponsored by, or endorsed by Stremio.'), el('p', {}, 'Copyright © 2026 Mohammed Alanazi. Original Nymora modifications, branding, interface components, and project-specific code. Portions are derived from third-party open-source projects and remain subject to their original licenses and copyright notices.'), el('p', {}, 'Nymora code: MIT. Stremio addon-client components: MIT, Copyright © 2019 SmartCode OOD. Electron: MIT; Chromium and hls.js: their respective bundled notices.'), el('div', { className: 'actions' }, button('GitHub repository', () => call('external', { url: 'https://github.com/igc27/Nymora' })), button('Open-source notices', async () => { notices.textContent = await call('notices'); notices.hidden = !notices.hidden; })), notices),
    el('section', { className: 'panel' }, el('h2', {}, 'Playback support'), el('p', {}, 'Direct HTTP(S) video and HLS streams supported by Chromium. Some codecs, torrent/infoHash streams, DRM streams and external-service-only sources need engines or services that are not included. If a source fails, choose another source. ASS/SSA subtitles use plain text; authored styling is not preserved. Subtitle files must be UTF-8.')));
}
function languageName(code) { return ({ eng: 'English', en: 'English', ara: 'Arabic · العربية', ar: 'Arabic · العربية', spa: 'Spanish', fra: 'French', deu: 'German', jpn: 'Japanese', por: 'Portuguese', rus: 'Russian', hin: 'Hindi', zho: 'Chinese' })[code] || code; }
async function openDetails(initial, resume) {
  const token = ++generation; page = 'Details'; const content = shell();
  content.append(button('← Back to Home', () => navigate('Home'), 'button subtle'), el('p', { className: 'muted' }, 'Loading details…'));
  let meta = initial, problems = [];
  try {
    const result = await call('meta', { type: initial.type, id: initial.id });
    if (result.items.length) meta = { ...initial, ...result.items[0] };
    problems = result.errors;
  } catch (e) { problems.push(e.message); }
  if (token !== generation) return;
  content.lastChild.remove();
  const saved = state.library.some(m => m.id === meta.id && m.type === meta.type);
  const save = button(saved ? 'Remove from Library' : 'Save to Library', async () => { state = await call('library', meta); save.textContent = state.library.some(m => m.id === meta.id && m.type === meta.type) ? 'Remove from Library' : 'Save to Library'; });
  const image = safeImage(meta.poster);
  const details = el('section', { className: 'details' }, image && el('img', { className: 'detail-poster', src: image, alt: '' }), el('div', {}, el('p', { className: 'eyebrow' }, meta.type), el('h1', {}, meta.name), el('p', { className: 'muted' }, [meta.releaseInfo, meta.runtime, meta.imdbRating && `Rating ${meta.imdbRating}`].filter(Boolean).join(' · ')), meta.genres?.length && el('p', { className: 'tags' }, meta.genres.join(' · ')), meta.description && el('p', { className: 'description' }, meta.description), Array.isArray(meta.cast) && el('p', { className: 'muted' }, `Cast: ${meta.cast.join(', ')}`), Array.isArray(meta.director) && el('p', { className: 'muted' }, `Director: ${meta.director.join(', ')}`), save));
  content.append(details); problems.forEach(p => content.append(errorBlock(p, () => openDetails(initial, resume))));
  const sources = el('section', { className: 'sources' });
  let sourceGeneration = 0;
  const loadStreams = async video => {
    const requestId = ++sourceGeneration;
    sources.replaceChildren(el('h2', {}, video.name ? `Sources · ${video.name}` : 'Choose a source'), el('p', { className: 'muted' }, 'Querying installed stream addons…'));
    try {
      const response = await call('streams', { type: meta.type, id: video.id });
      if (token !== generation || requestId !== sourceGeneration) return;
      sources.lastChild.remove();
      response.errors.forEach(e => sources.append(errorBlock(e, () => loadStreams(video))));
      const progress = state.progress[`${meta.type}:${video.id}`];
      let resumePosition = progress && !progress.watched ? progress.position : 0;
      if (resumePosition > 0) {
        const resumeToggle = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Resume saved progress', onchange: e => { resumePosition = e.target.checked ? progress.position : 0; } });
        sources.append(el('label', { className: 'resume-choice' }, resumeToggle, `Resume from ${clock(progress.position)}`));
      }
      if (!response.items.length) sources.append(empty('No streams available', 'Install an addon that provides streams for this title, or retry the available addons.', button('Retry sources', () => loadStreams(video))));
      for (const stream of response.items) {
        const hints = stream.behaviorHints || {};
        const available = !!stream.url;
        sources.append(button(el('div', {}, el('span', { className: 'source-label' }, stream.addonName), el('h3', {}, stream.name || stream.title || 'Stream'), stream.name && stream.title && el('p', {}, stream.title), el('p', { className: 'muted' }, [stream.description, hints.filename, hints.videoSize && `${Math.round(hints.videoSize / 1048576)} MB`, stream.language, stream.quality].filter(Boolean).join(' · ')), !available && el('p', { className: 'muted' }, stream.infoHash ? 'Torrent source · streaming engine not included' : 'External or unsupported source')), () => startPlayer(meta, video, stream, resumePosition), 'source'));
      }
    } catch (e) { if (requestId === sourceGeneration) { sources.lastChild.remove(); sources.append(errorBlock(e.message, () => loadStreams(video))); } }
  };
  if (meta.type === 'series') {
    const videos = (meta.videos || []).filter(v => typeof v.id === 'string');
    if (!videos.length) content.append(empty('No episodes supplied', 'The installed metadata addons did not provide an episode list.', button('Retry metadata', () => openDetails(initial, resume))));
    else {
      const seasons = [...new Set(videos.map(v => v.season ?? 0))].sort((a, b) => a - b);
      const season = el('select', { 'aria-label': 'Season' }, seasons.map(s => el('option', { value: s }, s === 0 ? 'Specials' : `Season ${s}`)));
      const episodes = el('div', { className: 'episodes' });
      function showEpisodes() {
        episodes.replaceChildren(...videos.filter(v => String(v.season ?? 0) === season.value).sort((a, b) => (a.episode || 0) - (b.episode || 0)).map(v => {
          const progress = state.progress[`${meta.type}:${v.id}`];
          const pick = button(el('div', {}, el('strong', {}, `${v.episode ? `${v.episode}. ` : ''}${v.title || v.name || v.id}`), el('p', { className: 'muted' }, [v.released && String(v.released).slice(0, 10), progress?.watched ? 'Watched' : progress?.position ? `In progress · ${clock(progress.position)}` : ''].filter(Boolean).join(' · '))), () => { episodes.querySelectorAll('.episode').forEach(n => n.classList.remove('selected')); pick.classList.add('selected'); return loadStreams({ ...v, name: v.title || v.name || v.id }); }, 'button episode');
          return el('div', { className: 'episode-row' }, pick, button(progress?.watched ? 'Mark unwatched' : 'Mark watched', async () => { state = await call('watched', { type: meta.type, id: v.id, mediaId: meta.id, name: meta.name, poster: meta.poster, watched: !progress?.watched }); showEpisodes(); }, 'button subtle small'));
        }));
      }
      season.addEventListener('change', showEpisodes);
      const resumedVideo = resume && videos.find(v => v.id === resume.id);
      if (resumedVideo) season.value = resumedVideo.season ?? 0;
      showEpisodes(); content.append(el('section', {}, el('h2', {}, 'Episodes'), season, episodes));
      if (resumedVideo) await loadStreams({ ...resumedVideo, name: resumedVideo.title || resumedVideo.name || resumedVideo.id });
    }
  } else {
    const progress = state.progress[`${meta.type}:${meta.id}`];
    content.append(button(progress?.watched ? 'Mark unwatched' : 'Mark watched', async () => { state = await call('watched', { type: meta.type, id: meta.id, mediaId: meta.id, name: meta.name, poster: meta.poster, watched: !progress?.watched }); await openDetails(meta); }, 'button subtle'));
    await loadStreams({ id: meta.id });
  }
  content.append(sources);
}
async function startPlayer(meta, episode, stream, start) {
  if (currentPlayer) await currentPlayer.close();
  const source = await call('source', stream);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const video = el('video', { playsinline: true, 'aria-label': 'Media player' });
  video.volume = state.settings.volume;
  const overlay = el('div', { className: 'subtitle-overlay', dir: 'auto', 'aria-live': 'off', 'data-testid': 'subtitle-overlay' });
  overlay.style.fontSize = `${state.settings.subtitleSize}px`;
  const playerError = el('div', { className: 'player-error', role: 'alert', hidden: true });
  const status = el('span', { className: 'player-status', role: 'status' }, 'Connecting…');
  const play = button('Pause', () => video.paused ? video.play() : video.pause());
  const mute = button('Mute', () => { video.muted = !video.muted; mute.textContent = video.muted ? 'Unmute' : 'Mute'; });
  const seek = el('input', { type: 'range', min: 0, max: 0, step: 0.1, value: 0, 'aria-label': 'Playback position', oninput: event => { if (Number.isFinite(video.duration)) video.currentTime = Number(event.target.value); } });
  const time = el('span', { className: 'time' }, '0:00 / 0:00');
  const volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: video.volume, 'aria-label': 'Volume', oninput: event => { video.volume = Number(event.target.value); }, onchange: () => call('settings', { volume: video.volume }).catch(e => toast(e.message)) });
  const subtitleSelect = el('select', { 'aria-label': 'Subtitle track' }, el('option', { value: '' }, 'Subtitles off'));
  const audioSelect = el('select', { 'aria-label': 'Audio track' }, el('option', { value: '' }, 'Default audio'));
  const delay = el('input', { type: 'number', min: -120, max: 120, step: 0.5, value: state.settings.subtitleDelay, 'aria-label': 'Subtitle delay', onchange: async () => { state = await call('settings', { subtitleDelay: Number(delay.value) }); delay.value = state.settings.subtitleDelay; } });
  const size = el('input', { type: 'range', min: 16, max: 72, value: state.settings.subtitleSize, 'aria-label': 'Player subtitle size', oninput: () => { overlay.style.fontSize = `${size.value}px`; }, onchange: async () => { state = await call('settings', { subtitleSize: Number(size.value) }); } });
  let hls, cues = [], subtitleResults = [], closed = false, lastSave = 0, subtitleRequest = 0;
  const subtitleStatus = el('span', { className: 'muted' });
  const layer = el('div', { className: 'player-layer', role: 'dialog', 'aria-label': `Playing ${meta.name}` }, el('header', { className: 'player-header' }, el('div', {}, el('strong', {}, meta.name), el('span', { className: 'muted' }, episode.name || stream.name || ''), status), button('Exit player', close, 'button subtle')), el('div', { className: 'video-stage' }, video, overlay, playerError), el('div', { className: 'player-controls' }, el('div', { className: 'timeline' }, seek, time), el('div', { className: 'control-row' }, play, button('−10s', () => { video.currentTime = Math.max(0, video.currentTime - 10); }), button('+10s', () => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10); }), mute, volume, button('Fullscreen', () => call('fullscreen')), el('label', {}, 'Audio', audioSelect)), el('div', { className: 'control-row subtitle-controls' }, el('label', {}, 'Subtitles', subtitleSelect), button('Refresh subtitles', loadSubtitleResults, 'button small'), button('Local subtitle', async () => { const selected = await call('localSubtitle'); if (selected) { ++subtitleRequest; cues = selected.cues; subtitleSelect.value = ''; subtitleStatus.textContent = selected.name; } }, 'button small'), el('label', {}, 'Delay (s)', delay), el('label', {}, 'Text size', size), subtitleStatus)));
  document.body.append(layer);
  async function save() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    state = await call('progress', { id: episode.id, mediaId: meta.id, type: meta.type, name: meta.name, episodeName: episode.name || '', poster: meta.poster, position: video.currentTime, duration: video.duration });
  }
  async function close() {
    if (closed) return; closed = true;
    await save().catch(e => toast(`Unable to save progress: ${e.message}`));
    video.pause(); hls?.destroy(); video.removeAttribute('src'); video.load();
    document.removeEventListener('keydown', shortcuts); window.removeEventListener('beforeunload', saveOnExit);
    const fullscreen = await call('state'); state = fullscreen;
    await call('stop'); layer.remove(); currentPlayer = null; document.body.style.overflow = previousOverflow;
    await call('fullscreen', { enabled: false });
  }
  function saveOnExit() { save(); }
  function shortcuts(event) { if (['INPUT', 'SELECT'].includes(event.target.tagName)) return; if (event.code === 'Space') { event.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); } if (event.code === 'Escape') close().catch(e => toast(e.message)); }
  window.addEventListener('beforeunload', saveOnExit); document.addEventListener('keydown', shortcuts);
  currentPlayer = { close };
  video.addEventListener('loadedmetadata', () => { seek.max = Number.isFinite(video.duration) ? video.duration : 0; if (start && start < video.duration - 1) video.currentTime = start; status.textContent = 'Ready'; refreshAudio(); });
  video.addEventListener('playing', () => { status.textContent = 'Playing'; playerError.hidden = true; });
  video.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  video.addEventListener('play', () => { play.textContent = 'Pause'; });
  video.addEventListener('pause', () => { play.textContent = 'Play'; if (!closed) { status.textContent = 'Paused'; save().catch(e => toast(e.message)); } });
  video.addEventListener('ended', () => { status.textContent = 'Finished'; save().catch(e => toast(e.message)); });
  video.addEventListener('seeked', () => save().catch(e => toast(e.message)));
  function renderSubtitles() {
    const subtitleTime = video.currentTime - Number(delay.value || 0);
    overlay.textContent = cues.filter(c => c.start <= subtitleTime && c.end > subtitleTime).map(c => c.text).join('\n');
  }
  video.addEventListener('timeupdate', () => { seek.value = video.currentTime; time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`; renderSubtitles(); if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save().catch(e => toast(e.message)); } });
  function failed(message) { status.textContent = 'Playback failed'; playerError.hidden = false; playerError.replaceChildren(el('h2', {}, 'Playback failed'), el('p', {}, message), el('p', {}, 'Try another source.'), button('Return to sources', close)); }
  video.addEventListener('error', () => failed(video.error?.code === 4 ? 'Unsupported stream or codec.' : 'Unable to connect or decode this stream.'));
  function refreshAudio() {
    const tracks = hls?.audioTracks || [...(video.audioTracks || [])];
    audioSelect.replaceChildren(...(tracks.length ? tracks.map((track, i) => el('option', { value: i }, track.name || track.label || languageName(track.lang || track.language || '') || `Audio ${i + 1}`)) : [el('option', { value: '' }, 'Default audio')]));
    audioSelect.disabled = tracks.length <= 1;
    if (hls && hls.audioTrack >= 0) audioSelect.value = hls.audioTrack;
  }
  audioSelect.addEventListener('change', () => { const index = Number(audioSelect.value); if (hls) hls.audioTrack = index; else if (video.audioTracks) [...video.audioTracks].forEach((track, i) => { track.enabled = i === index; }); });
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
window.nymora.onClose(async () => { try { if (currentPlayer) await currentPlayer.close(); } finally { await call('quitReady'); } });
navigate('Home');
