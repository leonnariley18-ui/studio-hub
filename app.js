// ===== Studio Index — app logic =====
// Wrapped in an IIFE with a load guard so this file is safe to execute more
// than once on the same page (e.g. a stale cached duplicate <script> tag,
// or a leftover service worker from the old site re-serving it) — without
// this, a second execution throws "Identifier already declared" on the
// `let`/`const` below and the whole page hangs on "Loading…".
(function () {
  if (window.__STUDIO_INDEX_LOADED__) return;
  window.__STUDIO_INDEX_LOADED__ = true;

const cfg = window.STUDIO_HUB_CONFIG;
let supabase = null;
try {
  if (window.supabase) {
    supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      db: { schema: cfg.schema }
    });
  }
} catch (e) {
  console.error('Supabase client failed to initialize:', e);
}

let categories = [];   // [{id, name, sort_order}]
let entries = [];      // [{...entry, category: {id,name}, linked_docs: [...]}]
let currentView = 'grid';
let activeCategoryFilter = null;
let activeTagFilters = new Set();
let editingEntryId = null;
let pendingLogoFile = null;
let removeLogoFlag = false;
let logSort = { key: 'date', dir: 'desc' };
let collapsedCategories = new Set(JSON.parse(localStorage.getItem('studio_collapsed_categories') || '[]'));

const STATUS_CLASS = { '🟢 Live': 'live', '🟡 In progress': 'progress', '🟣 Stalled': 'stalled', '🔵 Reference': 'ref' };
const TYPE_LABEL = { app: 'App/Site', project: 'Project', note: 'Future note' };

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  initSky();
  const savedMode = localStorage.getItem('studio_sky_mode') || 'day';
  setSky(savedMode);
  loadAll();
  initTitleCarousel();

  document.getElementById('entry-form').addEventListener('submit', handleEntrySubmit);
  document.querySelectorAll('.type-tab').forEach(t => t.addEventListener('click', () => setEntryType(t.dataset.type)));
});

// ---------- Title font carousel: breathes between faces every 30s ----------
// Each candidate is checked with the Font Loading API before it's allowed
// into rotation — a font that fails to actually load in this visitor's
// browser (blocked by an ad blocker, a flaky connection, etc.) gets
// silently excluded instead of falling back to a generic cursive font.
const TITLE_FONT_CANDIDATES = [
  { cls: 'font-italiana', family: 'Italiana' },
  { cls: 'font-allura', family: 'Allura' },
  { cls: 'font-herrvon', family: 'Herr Von Muellerhoff' },
  { cls: 'font-josefin', family: 'Josefin Sans' }
];
let currentTitleFont = 'font-italiana';

async function initTitleCarousel() {
  const el = document.querySelector('h1.title');
  if (!el || !('fonts' in document)) return;

  const checks = await Promise.all(TITLE_FONT_CANDIDATES.map(async f => {
    try {
      await document.fonts.load(`400 16px "${f.family}"`);
    } catch (e) { /* fall through to the check below */ }
    return document.fonts.check(`400 16px "${f.family}"`) ? f.cls : null;
  }));
  const verified = checks.filter(Boolean);

  if (verified.length === 0) return; // keep whatever's already showing (font-italiana default)

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BREATHE_MS = 1000;
  const CYCLE_MS = 30000;

  currentTitleFont = verified[Math.floor(Math.random() * verified.length)];
  TITLE_FONT_CANDIDATES.forEach(f => el.classList.remove(f.cls));
  el.classList.add(currentTitleFont);

  if (verified.length < 2) return; // nothing to alternate with

  setInterval(() => {
    const options = verified.filter(f => f !== currentTitleFont);
    const next = options[Math.floor(Math.random() * options.length)];

    if (reduceMotion) {
      el.classList.remove(currentTitleFont);
      el.classList.add(next);
      currentTitleFont = next;
      return;
    }

    el.classList.add('breathing');
    setTimeout(() => {
      el.classList.remove(currentTitleFont);
      el.classList.add(next);
      currentTitleFont = next;
      el.classList.remove('breathing');
    }, BREATHE_MS);
  }, CYCLE_MS);
}

async function loadAll() {
  if (!supabase) {
    showToast('Could not connect to Supabase — check your connection and reload.');
    renderAll();
    return;
  }
  await Promise.all([loadCategories(), loadEntries()]);
  renderAll();
}

async function loadCategories() {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name');
    if (error) return showToast('Could not load categories: ' + error.message);
    categories = data || [];
  } catch (e) {
    showToast('Could not reach Supabase: ' + e.message);
  }
}

async function loadEntries() {
  try {
    const { data, error } = await supabase
      .from('entries')
      .select('*, category:categories(id, name), linked_docs(*), entry_logs(*)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return showToast('Could not load entries: ' + error.message);
    entries = data || [];
  } catch (e) {
    showToast('Could not reach Supabase: ' + e.message);
  }
}

function renderAll() {
  renderTopMeta();
  renderDecorated();
  renderStats();
  renderFilters();
  renderGrid();
  renderLog();
}

// ---------- Sky / atmosphere ----------
function initSky() {
  const starsContainer = document.getElementById('stars');
  for (let i = 0; i < 46; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const big = Math.random() < 0.18;
    const size = big ? (Math.random() * 8 + 10) : (Math.random() * 5 + 4);
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.top = (Math.random() * 70) + '%';
    s.style.left = (Math.random() * 100) + '%';
    s.style.setProperty('--dur', (Math.random() * 3 + 2) + 's');
    s.style.setProperty('--del', (Math.random() * 4) + 's');
    s.style.setProperty('--max', (Math.random() * 0.4 + 0.6));
    starsContainer.appendChild(s);
  }

  const glintsContainer = document.getElementById('glints');
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('div');
    b.className = 'beam';
    b.style.left = (i * 20 - 8 + Math.random() * 6) + '%';
    b.style.setProperty('--dur', (Math.random() * 6 + 11) + 's');
    b.style.setProperty('--max', (Math.random() * 0.15 + 0.4));
    b.style.setProperty('--x0', (-14 + Math.random() * 6) + 'vw');
    b.style.setProperty('--x1', (8 + Math.random() * 10) + 'vw');
    b.style.animationDelay = (Math.random() * -20) + 's';
    glintsContainer.appendChild(b);
  }
}

function setSky(mode) {
  document.documentElement.setAttribute('data-mode', mode);
  document.getElementById('btn-day').classList.toggle('active', mode === 'day');
  document.getElementById('btn-night').classList.toggle('active', mode === 'night');
  localStorage.setItem('studio_sky_mode', mode);
}

// ---------- Mode / view switching ----------
function setMode(mode) {
  document.getElementById('decorated-view').style.display = mode === 'decorated' ? 'flex' : 'none';
  document.getElementById('detailed-view').style.display = mode === 'detailed' ? 'block' : 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setView(view) {
  currentView = view;
  document.getElementById('btn-view-grid').classList.toggle('active', view === 'grid');
  document.getElementById('btn-view-log').classList.toggle('active', view === 'log');
  document.getElementById('grid-view').style.display = view === 'grid' ? '' : 'none';
  document.getElementById('log-view').style.display = view === 'log' ? 'block' : 'none';
}

function setCategoryFilter(catId) {
  activeCategoryFilter = activeCategoryFilter === catId ? null : catId;
  renderFilters();
  renderGrid();
  renderLog();
}

function setTagFilter(tag) {
  if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
  else activeTagFilters.add(tag);
  renderFilters();
  renderGrid();
  renderLog();
}

function getFilteredEntries() {
  return entries.filter(e => {
    const matchesCategory = !activeCategoryFilter || e.category_id === activeCategoryFilter;
    const matchesTags = activeTagFilters.size === 0 || (e.tags || []).some(t => activeTagFilters.has(t));
    return matchesCategory && matchesTags;
  });
}

// ---------- Top meta / stats ----------
function renderTopMeta() {
  const el = document.getElementById('top-meta');
  el.innerHTML = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} logged`;
}

function renderStats() {
  const el = document.getElementById('stats');
  const counts = { app: 0, project: 0, note: 0 };
  entries.forEach(e => { if (counts[e.entry_type] !== undefined) counts[e.entry_type]++; });
  el.innerHTML = `
    <div class="stat"><div class="n">${entries.length}</div><div class="l">Tracked</div></div>
    <div class="stat"><div class="n">${counts.app}</div><div class="l">App/Site</div></div>
    <div class="stat"><div class="n">${counts.project}</div><div class="l">Project</div></div>
    <div class="stat"><div class="n">${counts.note}</div><div class="l">Future note</div></div>
  `;
}

// ---------- Decorated view ----------
let layoutGrid = null;
let layoutEditMode = false;

function renderDecorated() {
  const pins = entries.filter(e => e.pinned);
  const container = document.getElementById('dc-pins-grid');
  const countEl = document.getElementById('dc-pin-count');

  if (layoutGrid) { layoutGrid.destroy(false); layoutGrid = null; }

  if (pins.length === 0) {
    container.innerHTML = `<div class="dc-empty">Nothing pinned yet. Open the full ledger and pin an entry to have it show up here.</div>`;
    countEl.textContent = entries.length === 0 ? 'No entries yet' : `0 pinned of ${entries.length} total`;
    return;
  }

  container.innerHTML = pins.map(e => {
    const l = e.layout || {};
    return `
    <div class="grid-stack-item" data-entry-id="${e.id}" gs-x="${l.x ?? ''}" gs-y="${l.y ?? ''}" gs-w="${l.w || 3}" gs-h="${l.h || 1}">
      <div class="grid-stack-item-content">
        <a class="dc-pin" href="${e.url || 'javascript:void(0)'}" ${e.url ? 'target="_blank" rel="noopener"' : ''} onclick="handlePinClick(event, '${e.id}')">
          ${e.logo_url ? `<img class="pin-logo" src="${e.logo_url}" alt="">` : `<span class="em">${e.custom_fields?.emoji || iconForType(e.entry_type)}</span>`}
          <div class="info">
            <div class="t">${escapeHtml(e.title)} <span class="pin-star">👑</span></div>
            <div class="s">${TYPE_LABEL[e.entry_type]}${e.status ? ' · ' + e.status.replace(/^\S+\s/, '') : ''}</div>
          </div>
          <span class="arrow">→</span>
        </a>
      </div>
    </div>
  `;
  }).join('');
  countEl.textContent = `${pins.length} pinned of ${entries.length} total`;

  if (window.GridStack) {
    layoutGrid = GridStack.init({
      column: 12,
      cellHeight: 64,
      margin: 6,
      float: true,
      staticGrid: !layoutEditMode
    }, container);
    layoutGrid.on('change', (ev, changedItems) => {
      (changedItems || []).forEach(item => saveEntryLayout(item.el.dataset.entryId, item.x, item.y, item.w, item.h));
    });
  }
}

async function saveEntryLayout(entryId, x, y, w, h) {
  if (!supabase || !entryId) return;
  const entry = entries.find(e => e.id === entryId);
  if (entry) entry.layout = { x, y, w, h };
  await supabase.from('entries').update({ layout: { x, y, w, h } }).eq('id', entryId);
}

function toggleLayoutEdit() {
  layoutEditMode = !layoutEditMode;
  const btn = document.getElementById('layout-edit-toggle');
  const container = document.getElementById('dc-pins-grid');
  btn.classList.toggle('active', layoutEditMode);
  btn.textContent = layoutEditMode ? '✓ Done arranging' : '🔧 Edit layout';
  container.classList.toggle('edit-mode', layoutEditMode);
  if (layoutGrid) layoutGrid.setStatic(!layoutEditMode);

  closeBackupModal();
  setMode('decorated');
  showToast(layoutEditMode ? 'Layout editing on — drag or resize your pins (saves as you go)' : 'Layout locked — everything’s already saved');
}

function iconForType(t) { return t === 'note' ? '💡' : t === 'project' ? '🎨' : '🔗'; }

// A pinned entry with no URL used to be a dead link (href="#"). Now it
// falls back to previewing/opening its first linked doc, or — if it has
// neither — tells you so with a toast instead of doing nothing. Never
// jumps into editing from the Decorated (home) view.
function handlePinClick(ev, entryId) {
  const entry = entries.find(x => x.id === entryId);
  if (entry && entry.url) return; // real URL: let the normal link/new-tab behavior happen
  ev.preventDefault();
  if (!entry) return;

  const firstDoc = (entry.linked_docs || [])[0];
  if (firstDoc) {
    if (isPreviewable(firstDoc.url)) openDocPreview(firstDoc.title, firstDoc.url);
    else window.open(firstDoc.url, '_blank', 'noopener');
    return;
  }

  showToast('No link or doc on this entry yet — add one from the full ledger.');
}

// ---------- Filters ----------
function renderFilters() {
  const el = document.getElementById('filters');
  if (categories.length === 0) {
    el.innerHTML = '';
  } else {
    const allChip = `<span class="chip ${!activeCategoryFilter ? 'on' : ''}" onclick="setCategoryFilter(null)">All</span>`;
    const catChips = categories.map(c =>
      `<span class="chip ${activeCategoryFilter === c.id ? 'on' : ''}" onclick="setCategoryFilter('${c.id}')">${escapeHtml(c.name)}</span>`
    ).join('');
    el.innerHTML = allChip + catChips;
  }

  renderTagFilters();
}

function renderTagFilters() {
  const el = document.getElementById('tag-filters');
  const allTags = [...new Set(entries.flatMap(e => e.tags || []))].sort();
  if (allTags.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = allTags.map(t =>
    `<span class="chip tag-chip ${activeTagFilters.has(t) ? 'on' : ''}" onclick="setTagFilter('${escapeAttr(t)}')">#${escapeHtml(t)}</span>`
  ).join('');
}

// ---------- Grid view ----------
function renderGrid() {
  const el = document.getElementById('grid-view');
  const filtered = getFilteredEntries();

  if (entries.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="big">Nothing logged yet</div>Click "+ New entry" to add your first app, project, or note. Categories are yours to create as you go.</div>`;
    return;
  }
  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state">No entries in this category yet.</div>`;
    return;
  }

  const uncategorized = filtered.filter(e => !e.category_id);
  const groups = categories
    .map(c => ({ cat: c, items: filtered.filter(e => e.category_id === c.id) }))
    .filter(g => g.items.length > 0);
  if (uncategorized.length > 0) groups.push({ cat: { name: 'Uncategorized' }, items: uncategorized });

  const toolbar = `
    <div class="grid-toolbar">
      <button type="button" onclick="setAllCategoriesCollapsed(true)">Collapse all</button>
      <button type="button" onclick="setAllCategoriesCollapsed(false)">Expand all</button>
    </div>`;

  const sections = groups.map(g => {
    const catKey = g.cat.id || '__uncategorized__';
    const collapsed = collapsedCategories.has(catKey);
    return `
    <div class="cat-section ${collapsed ? 'collapsed' : ''}">
      <div class="group-head cat-header" onclick="toggleCategoryCollapsed('${escapeAttr(catKey)}')">
        <div class="cat-header-left"><span class="chev">▾</span><h2>${escapeHtml(g.cat.name)}</h2></div>
        <span class="count">${g.items.length} ${g.items.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <div class="grid cat-body">${g.items.map(cardHtml).join('')}</div>
    </div>
  `;
  }).join('');

  el.innerHTML = toolbar + sections;
}

function toggleCategoryCollapsed(catKey) {
  if (collapsedCategories.has(catKey)) collapsedCategories.delete(catKey);
  else collapsedCategories.add(catKey);
  localStorage.setItem('studio_collapsed_categories', JSON.stringify([...collapsedCategories]));
  renderGrid();
}

function setAllCategoriesCollapsed(collapsed) {
  if (collapsed) {
    const uncategorized = getFilteredEntries().some(e => !e.category_id);
    collapsedCategories = new Set(categories.map(c => c.id).concat(uncategorized ? ['__uncategorized__'] : []));
  } else {
    collapsedCategories = new Set();
  }
  localStorage.setItem('studio_collapsed_categories', JSON.stringify([...collapsedCategories]));
  renderGrid();
}

function cardHtml(e) {
  const fieldsHtml = Object.entries(e.custom_fields || {})
    .filter(([k]) => k !== 'emoji' && k !== 'description')
    .map(([k, v]) => `<div class="field-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`)
    .join('');
  const docsHtml = (e.linked_docs || []).map(d => {
    if (isPreviewable(d.url)) {
      return `<button type="button" class="doc-chip" onclick="openDocPreview('${escapeAttr(d.title)}', '${escapeAttr(d.url)}')">${docIcon(d.doc_type)} ${escapeHtml(d.title)}</button>`;
    }
    return `<a class="doc-chip" href="${d.url}" target="_blank" rel="noopener">${docIcon(d.doc_type)} ${escapeHtml(d.title)}</a>`;
  }).join('');
  const tagsHtml = (e.tags || []).map(t => `<span class="tag" onclick="setTagFilter('${escapeAttr(t)}')">#${escapeHtml(t)}</span>`).join('');
  const statusDot = e.status ? `<div class="status-dot ${STATUS_CLASS[e.status] || 'live'}" title="${escapeHtml(e.status)}"></div>` : '';
  const dateRangeHtml = formatDateRange(e.start_date, e.end_date, e.entry_type === 'note');

  return `
    <div class="card ${e.entry_type === 'note' ? 'type-note' : ''}">
      <div class="type-rail ${e.entry_type}"></div>
      <div class="card-top">
        <div class="card-title">
          ${e.logo_url ? `<img class="card-logo" src="${e.logo_url}" alt="">` : ''}
          ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>` : escapeHtml(e.title)}
          ${e.pinned ? '<span class="pin-star">👑</span>' : ''}
        </div>
        ${statusDot}
      </div>
      ${dateRangeHtml ? `<div class="card-daterange">${dateRangeHtml}</div>` : ''}
      ${e.custom_fields?.description ? `<div class="card-desc" title="${escapeAttr(e.custom_fields.description)}">${escapeHtml(e.custom_fields.description)}</div>` : ''}
      ${fieldsHtml ? `<div class="fields">${fieldsHtml}</div>` : ''}
      ${docsHtml ? `<div class="card-docs">${docsHtml}</div>` : ''}
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
      <div class="card-actions">
        <button onclick="openEntryModal('${e.id}')">Edit</button>
      </div>
    </div>
  `;
}

function docIcon(type) {
  return { doc: '📄', link: '🔗', canvas: '🎨', repo: '🔗', file: '📎' }[type] || '📄';
}

const PREVIEW_KINDS = {
  pdf: 'iframe',
  // Rendered via fetch + iframe.srcdoc, NOT iframe.src — see openDocPreview.
  // Whatever content-type Supabase Storage actually serves a file as has
  // proven unreliable to control from the upload side; srcdoc sidesteps
  // that entirely by having the browser treat the fetched text as HTML
  // unconditionally, regardless of any Content-Type header.
  html: 'html', htm: 'html',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio',
  txt: 'text', json: 'text', csv: 'text', md: 'text'
};

// Some browsers/OSes report an empty File.type for less common extensions,
// which made every upload default to Supabase Storage's own fallback of
// text/plain — the exact bug that made uploaded HTML render as raw code
// instead of a page. Always resolve a real content type before uploading.
const EXTENSION_MIME = {
  html: 'text/html', htm: 'text/html', pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  txt: 'text/plain', json: 'application/json', csv: 'text/csv', md: 'text/markdown'
};

function resolveContentType(file) {
  // Extension wins over the browser's own File.type when we recognize it:
  // some Linux/Chrome setups report generic types like
  // application/octet-stream for .html when the OS's MIME database is
  // missing an entry, which is exactly what made an uploaded HTML file
  // render as raw text instead of a page. Only trust the browser's type
  // for extensions we don't have an explicit mapping for.
  const ext = file.name.split('.').pop().toLowerCase();
  if (EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  return file.type || 'application/octet-stream';
}

// supabase-js's upload() only honors the `contentType` option for
// non-Blob request bodies (ArrayBuffer, string, streams) — a browser File
// object is itself a Blob, so passing one takes a completely different
// path that relies on the File's own native .type, and `contentType` as
// an option is silently ignored. Confirmed live: even after forcing the
// File's own .type, the server still served the upload as text/plain.
// The fix that actually works, matching Supabase's own documented
// pattern: read the file into raw bytes first, so it's neither a File
// nor a Blob, which forces the library into the branch that puts our
// contentType directly on the request header.
async function uploadFile(bucket, path, file, extraOptions = {}) {
  const buffer = await file.arrayBuffer();
  return supabase.storage.from(bucket).upload(path, buffer, {
    ...extraOptions,
    contentType: resolveContentType(file)
  });
}

function previewKind(url) {
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  const ext = clean.split('.').pop();
  return PREVIEW_KINDS[ext] || null;
}

function isPreviewable(url) {
  return previewKind(url) !== null;
}

// Raw iframe src is only used for PDF now — the browser renders that
// itself with its own native chrome, which we can't restyle to match
// day/night. HTML is fetched and injected via srcdoc instead of src (see
// the 'html' branch below) so it renders correctly regardless of what
// content-type Supabase actually served it as. Everything else gets
// built with our own themed markup so it looks like part of the
// dashboard.
let currentPreviewBlobUrl = null;

async function openDocPreview(title, url) {
  document.getElementById('doc-preview-title').textContent = title;
  document.getElementById('doc-preview-open-tab').href = url;
  document.getElementById('doc-preview-overlay').classList.add('open');

  if (currentPreviewBlobUrl) {
    URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }

  const kind = previewKind(url);
  const body = document.getElementById('doc-preview-body');
  body.innerHTML = '';

  if (kind === 'image') {
    body.innerHTML = `<div class="preview-media-pane"><img src="${url}" alt="${escapeAttr(title)}"></div>`;
  } else if (kind === 'video') {
    body.innerHTML = `<div class="preview-media-pane"><video src="${url}" controls autoplay></video></div>`;
  } else if (kind === 'audio') {
    body.innerHTML = `<div class="preview-media-pane preview-audio-pane"><audio src="${url}" controls autoplay></audio></div>`;
  } else if (kind === 'text') {
    body.innerHTML = `<pre class="preview-text">Loading…</pre>`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      body.innerHTML = `<pre class="preview-text">${escapeHtml(text)}</pre>`;
    } catch (e) {
      body.innerHTML = `<pre class="preview-text">Could not load this file. Try "Open in new tab" instead.</pre>`;
    }
  } else if (kind === 'html') {
    body.innerHTML = `<iframe class="preview-frame" title="Document preview"></iframe>`;
    try {
      const res = await fetch(url);
      let html = await res.text();
      // Injects a <base> so any relative links/images/scripts in the
      // uploaded page still resolve against its real folder, since
      // srcdoc content has no URL of its own to resolve them against.
      const baseHref = url.slice(0, url.lastIndexOf('/') + 1);
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
      } else {
        html = `<base href="${baseHref}">` + html;
      }
      body.querySelector('iframe').srcdoc = html;

      // "Open in new tab" needs its own correctly-typed copy — a direct
      // link to the raw file would hit the same wrong-content-type issue
      // srcdoc sidesteps. A blob URL carries our own explicit type,
      // independent of whatever Supabase actually served it as.
      const blob = new Blob([html], { type: 'text/html' });
      currentPreviewBlobUrl = URL.createObjectURL(blob);
      document.getElementById('doc-preview-open-tab').href = currentPreviewBlobUrl;
    } catch (e) {
      body.innerHTML = `<pre class="preview-text">Could not load this file. Try "Open in new tab" instead.</pre>`;
    }
  } else {
    body.innerHTML = `<iframe class="preview-frame" src="${url}" title="Document preview"></iframe>`;
  }
}

function closeDocPreview() {
  document.getElementById('doc-preview-overlay').classList.remove('open');
  document.getElementById('doc-preview-body').innerHTML = '';
  if (currentPreviewBlobUrl) {
    URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }
}

// ---------- Generic confirm modal (replaces window.confirm) ----------
let confirmModalCallback = null;

function showConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  const btn = document.getElementById('confirm-modal-confirm-btn');
  btn.textContent = confirmLabel;
  btn.className = danger ? 'btn-danger' : 'btn-primary';
  confirmModalCallback = onConfirm;
  document.getElementById('confirm-modal-overlay').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal-overlay').classList.remove('open');
  confirmModalCallback = null;
}

function confirmModalConfirmed() {
  const cb = confirmModalCallback;
  closeConfirmModal();
  if (cb) cb();
}

function openPreviewInfoModal() {
  document.getElementById('preview-info-overlay').classList.add('open');
}
function closePreviewInfoModal() {
  document.getElementById('preview-info-overlay').classList.remove('open');
}

function formatMonthYear(str) {
  if (!str) return null;
  const [y, m] = str.split('-').map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDateRange(start, end, isProjected) {
  const s = formatMonthYear(start);
  const e = formatMonthYear(end);
  if (!s && !e) return '';
  const prefix = isProjected ? 'Projected: ' : '';
  if (s && e) return `${prefix}${s} – ${e}`;
  if (s) return `${prefix}${s} – present`;
  return `${prefix}through ${e}`;
}

// ---------- Log view ----------
const LOG_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' }
];

function logSortValue(e, key) {
  if (key === 'date') return e.start_date || e.created_at || '';
  if (key === 'title') return (e.title || '').toLowerCase();
  if (key === 'category') return (e.category?.name || '').toLowerCase();
  if (key === 'status') return (e.status || '').toLowerCase();
  return '';
}

function setLogSort(key) {
  if (logSort.key === key) logSort.dir = logSort.dir === 'asc' ? 'desc' : 'asc';
  else logSort = { key, dir: key === 'date' ? 'desc' : 'asc' };
  renderLog();
}

function renderLog() {
  const el = document.getElementById('log-view');
  const filtered = getFilteredEntries();
  if (filtered.length === 0) {
    el.innerHTML = entries.length === 0 ? '' : `<div class="empty-state">No entries in this category yet.</div>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = logSortValue(a, logSort.key);
    const bv = logSortValue(b, logSort.key);
    if (av < bv) return logSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return logSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const headHtml = LOG_COLUMNS.map(c => {
    const arrow = logSort.key === c.key ? (logSort.dir === 'asc' ? '▴' : '▾') : '·';
    return `<th onclick="setLogSort('${c.key}')">${c.label} <span class="arrow">${arrow}</span></th>`;
  }).join('');

  const rowsHtml = sorted.map(e => {
    const dateStr = e.start_date
      ? formatMonthYear(e.start_date)
      : new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const statusClass = e.status ? (STATUS_CLASS[e.status] || 'live') : (e.entry_type === 'note' ? 'idea' : 'live');
    const statusLabel = e.status ? e.status.replace(/^\S+\s/, '') : (e.entry_type === 'note' ? 'idea' : '');
    const docs = e.linked_docs || [];
    const firstDoc = docs[0];
    const tagsHtml = (e.tags || []).map(t => `<span class="tag-chip" onclick="setTagFilter('${escapeAttr(t)}')">#${escapeHtml(t)}</span>`).join('');

    const visitBtn = e.url
      ? `<a class="log-icon-btn" href="${e.url}" target="_blank" rel="noopener" title="Open site">↗</a>`
      : `<span class="log-icon-btn disabled" title="No URL set">↗</span>`;

    const docsBtn = firstDoc
      ? `<button type="button" class="log-icon-btn" title="Docs" onclick="${isPreviewable(firstDoc.url) ? `openDocPreview('${escapeAttr(firstDoc.title)}', '${escapeAttr(firstDoc.url)}')` : `window.open('${escapeAttr(firstDoc.url)}', '_blank', 'noopener')`}">📄${docs.length > 1 ? `<span class="log-icon-badge">${docs.length}</span>` : ''}</button>`
      : `<span class="log-icon-btn disabled" title="No docs">📄</span>`;

    return `
      <tr>
        <td>${dateStr}</td>
        <td><div class="row-title"><span class="type-pip ${e.entry_type}" title="${TYPE_LABEL[e.entry_type]}"></span>${e.logo_url ? `<img class="row-logo-img" src="${e.logo_url}" alt="">` : ''}<strong>${escapeHtml(e.title)}</strong></div></td>
        <td>${e.category?.name ? `<span class="chip">${escapeHtml(e.category.name)}</span>` : ''}</td>
        <td>${statusLabel ? `<div class="badge ${statusClass}">${escapeHtml(statusLabel)}</div>` : ''}</td>
        <td class="log-tags-cell">${tagsHtml}</td>
        <td>
          <div class="log-row-end">
            ${visitBtn}
            ${docsBtn}
            <button class="log-icon-btn" title="Edit" onclick="openEntryModal('${e.id}')">✎</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <table class="log-table">
      <thead><tr>${headHtml}<th>Tags</th><th></th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

// ================= ENTRY MODAL =================
function setEntryType(type) {
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('entry-form').dataset.type = type;
  const isNote = type === 'note';
  document.getElementById('f-url-field').style.display = isNote ? 'none' : '';
  document.getElementById('f-status-field').style.display = isNote ? 'none' : '';
  document.getElementById('f-pin-field').style.display = isNote ? 'none' : '';
  document.getElementById('f-docs-section').style.display = isNote ? 'none' : '';
  document.getElementById('f-custom-fields-section').style.display = isNote ? 'none' : '';
  document.getElementById('f-start-date-label').textContent = isNote ? 'Projected start' : 'Start';
  document.getElementById('f-end-date-label').textContent = isNote ? 'Projected end' : 'End';
}

function populateCategorySelect(selectedId) {
  const sel = document.getElementById('f-category');
  sel.innerHTML = '<option value="">— none —</option>' +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

function promptNewCategory() {
  if (!supabase) return showToast('Not connected to Supabase.');
  document.getElementById('new-category-name').value = '';
  document.getElementById('category-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('new-category-name').focus(), 50);
}

function closeCategoryModal() {
  document.getElementById('category-modal-overlay').classList.remove('open');
}

async function submitNewCategory() {
  const name = document.getElementById('new-category-name').value.trim();
  if (!name) return;
  const { data, error } = await supabase.from('categories').insert({ name, sort_order: categories.length }).select().single();
  if (error) return showToast('Could not add category: ' + error.message);
  categories.push(data);
  categories.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  populateCategorySelect(data.id);
  renderFilters();
  closeCategoryModal();
  showToast('Category added');
}

function addCustomFieldRow(key = '', value = '') {
  const list = document.getElementById('custom-fields-list');
  const row = document.createElement('div');
  row.className = 'dyn-row custom-field-row';
  row.innerHTML = `
    <input type="text" class="cf-key" placeholder="field name" value="${escapeAttr(key)}">
    <input type="text" class="cf-value" placeholder="value" value="${escapeAttr(value)}">
    <button type="button" class="row-remove" onclick="this.closest('.dyn-row').remove()">×</button>
  `;
  list.appendChild(row);
}

function addDocRow(title = '', url = '', docType = 'link') {
  const list = document.getElementById('docs-list');
  const row = document.createElement('div');
  row.className = 'doc-row-wrap';
  const isFile = docType === 'file';
  row.innerHTML = `
    <div class="dyn-row doc-row">
      <input type="text" class="doc-title" placeholder="e.g. GitHub repo" value="${escapeAttr(title)}">
      <input type="url" class="doc-url" placeholder="https://…" value="${escapeAttr(isFile ? '' : url)}" ${isFile ? 'disabled' : ''}>
      <button type="button" class="row-remove" onclick="this.closest('.doc-row-wrap').remove()">×</button>
    </div>
    <div class="doc-row-file">
      <input type="file" class="doc-file-input">
      <span class="doc-file-status">${isFile ? '📎 ' + escapeHtml(title || 'uploaded file') : ''}</span>
    </div>
  `;
  if (isFile) row.dataset.existingUrl = url;
  const fileInput = row.querySelector('.doc-file-input');
  const urlInput = row.querySelector('.doc-url');
  const statusEl = row.querySelector('.doc-file-status');
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      const titleInput = row.querySelector('.doc-title');
      if (!titleInput.value.trim()) {
        titleInput.value = fileInput.files[0].name.replace(/\.[^/.]+$/, '');
      }
      urlInput.value = '';
      urlInput.disabled = true;
      statusEl.textContent = '📎 ' + fileInput.files[0].name + ' (will upload on save)';
      delete row.dataset.existingUrl;
    }
  });
  list.appendChild(row);
}

function openEntryModal(entryId) {
  editingEntryId = entryId || null;
  pendingLogoFile = null;
  removeLogoFlag = false;
  const form = document.getElementById('entry-form');
  form.reset();
  document.getElementById('custom-fields-list').innerHTML = '';
  document.getElementById('docs-list').innerHTML = '';
  document.getElementById('f-logo-file').value = '';
  populateCategorySelect();

  const entry = entryId ? entries.find(e => e.id === entryId) : null;

  document.getElementById('entry-modal-title').textContent = entry ? 'Edit entry' : 'New entry';
  document.getElementById('delete-entry-btn').style.display = entry ? '' : 'none';

  const type = entry?.entry_type || 'app';
  setEntryType(type);
  renderLogoPreview(entry?.logo_url || null);
  renderEntryHistory(entry);

  if (entry) {
    document.getElementById('f-title').value = entry.title || '';
    document.getElementById('f-url').value = entry.url || '';
    populateCategorySelect(entry.category_id);
    document.getElementById('f-status').value = entry.status || '🟢 Live';
    document.getElementById('f-description').value = entry.custom_fields?.description || '';
    document.getElementById('f-start-date').value = entry.start_date || '';
    document.getElementById('f-end-date').value = entry.end_date || '';
    document.getElementById('f-tags').value = (entry.tags || []).join(', ');
    document.getElementById('f-pinned').checked = !!entry.pinned;
    Object.entries(entry.custom_fields || {}).forEach(([k, v]) => {
      if (k !== 'description' && k !== 'emoji') addCustomFieldRow(k, v);
    });
    (entry.linked_docs || []).forEach(d => addDocRow(d.title, d.url, d.doc_type));
  }

  document.getElementById('entry-modal-overlay').classList.add('open');
}

function closeEntryModal() {
  document.getElementById('entry-modal-overlay').classList.remove('open');
  editingEntryId = null;
  pendingLogoFile = null;
  removeLogoFlag = false;
}

// ---------- Logo upload ----------
function renderLogoPreview(url) {
  const preview = document.getElementById('f-logo-preview');
  const removeBtn = document.getElementById('f-logo-remove-btn');
  if (url) {
    preview.src = url;
    preview.style.display = '';
    removeBtn.style.display = '';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    removeBtn.style.display = 'none';
  }
}

function handleLogoFileChosen(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  pendingLogoFile = file;
  removeLogoFlag = false;
  const reader = new FileReader();
  reader.onload = () => renderLogoPreview(reader.result);
  reader.readAsDataURL(file);
}

function removeLogo() {
  pendingLogoFile = null;
  removeLogoFlag = true;
  document.getElementById('f-logo-file').value = '';
  renderLogoPreview(null);
}

// ---------- Entry activity history ----------
function renderEntryHistory(entry) {
  const section = document.getElementById('f-history-section');
  const list = document.getElementById('entry-history-list');
  if (!entry || !(entry.entry_logs || []).length) {
    section.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  section.style.display = '';
  const sorted = [...entry.entry_logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  list.innerHTML = sorted.map(log => {
    const label = log.event_type === 'created' ? 'Added' : 'Updated';
    const dateStr = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<div class="history-row"><span class="history-label">${label}</span><span class="history-date">${dateStr}</span></div>`;
  }).join('');
}

async function handleEntrySubmit(ev) {
  ev.preventDefault();
  if (!supabase) return showToast('Not connected to Supabase.');
  const type = document.getElementById('entry-form').dataset.type || 'app';
  const title = document.getElementById('f-title').value.trim();
  if (!title) return;

  const customFields = {};
  const description = document.getElementById('f-description').value.trim();
  if (description) customFields.description = description;
  document.querySelectorAll('#custom-fields-list .dyn-row').forEach(row => {
    const k = row.querySelector('.cf-key').value.trim();
    const v = row.querySelector('.cf-value').value.trim();
    if (k && v) customFields[k] = v;
  });

  const tags = document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const categoryId = document.getElementById('f-category').value || null;

  const payload = {
    entry_type: type,
    title,
    url: type === 'note' ? null : (document.getElementById('f-url').value.trim() || null),
    category_id: categoryId,
    status: type === 'note' ? null : document.getElementById('f-status').value,
    start_date: document.getElementById('f-start-date').value || null,
    end_date: document.getElementById('f-end-date').value || null,
    tags,
    custom_fields: customFields,
    pinned: type === 'note' ? false : document.getElementById('f-pinned').checked
  };

  if (removeLogoFlag) payload.logo_url = null;

  let entryId = editingEntryId;
  if (entryId) {
    const { error } = await supabase.from('entries').update(payload).eq('id', entryId);
    if (error) return showToast('Save failed: ' + error.message);
    await supabase.from('entry_logs').insert({ entry_id: entryId, event_type: 'updated' });
  } else {
    const { data, error } = await supabase.from('entries').insert(payload).select().single();
    if (error) return showToast('Save failed: ' + error.message);
    entryId = data.id;
    await supabase.from('entry_logs').insert({ entry_id: entryId, event_type: 'created' });
  }

  if (pendingLogoFile) {
    const path = `logos/${entryId}/${Date.now()}-${pendingLogoFile.name}`;
    const { error: upErr } = await uploadFile('studio-hub-files', path, pendingLogoFile, { upsert: true });
    if (upErr) {
      showToast('Entry saved, but logo upload failed: ' + upErr.message);
    } else {
      const logoUrl = supabase.storage.from('studio-hub-files').getPublicUrl(path).data.publicUrl;
      await supabase.from('entries').update({ logo_url: logoUrl }).eq('id', entryId);
    }
  }

  // Replace linked docs wholesale for simplicity.
  if (type !== 'note') {
    await supabase.from('linked_docs').delete().eq('entry_id', entryId);
    const docRows = [];
    for (const row of document.querySelectorAll('#docs-list .doc-row-wrap')) {
      let title = row.querySelector('.doc-title').value.trim();
      const file = row.querySelector('.doc-file-input').files[0];
      let url = row.querySelector('.doc-url').value.trim();
      let docType = 'link';

      if (file) {
        if (!title) title = file.name.replace(/\.[^/.]+$/, '');
        const path = `${entryId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await uploadFile('studio-hub-files', path, file, { upsert: true });
        if (upErr) { showToast('Upload failed for "' + file.name + '": ' + upErr.message); continue; }
        url = supabase.storage.from('studio-hub-files').getPublicUrl(path).data.publicUrl;
        docType = 'file';
      } else if (row.dataset.existingUrl) {
        url = row.dataset.existingUrl;
        docType = 'file';
      }

      if (!title || !url) {
        if (title || url || file) showToast('Skipped a linked doc — needs both a title and a file or URL.');
        continue;
      }
      docRows.push({ entry_id: entryId, title, url, doc_type: docType });
    }
    if (docRows.length > 0) {
      const { error: docErr } = await supabase.from('linked_docs').insert(docRows);
      if (docErr) showToast('Entry saved, but docs failed: ' + docErr.message);
    }
  }

  closeEntryModal();
  await loadEntries();
  renderAll();
  showToast(editingEntryId ? 'Entry updated' : 'Entry added');
}

function deleteCurrentEntry() {
  if (!supabase) return showToast('Not connected to Supabase.');
  if (!editingEntryId) return;
  const entryId = editingEntryId;
  showConfirmModal({
    title: 'Delete entry?',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {
      const { error } = await supabase.from('entries').delete().eq('id', entryId);
      if (error) return showToast('Delete failed: ' + error.message);
      closeEntryModal();
      await loadEntries();
      renderAll();
      showToast('Entry deleted');
    }
  });
}

// ================= BACKUP / RESTORE / CLEAR =================
function openBackupModal() {
  document.getElementById('backup-modal-overlay').classList.add('open');
  hideClearDataWarning();
}
function closeBackupModal() {
  document.getElementById('backup-modal-overlay').classList.remove('open');
}

function handleBackupFileChosen(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('import-json-input').value = reader.result;
    showToast('File loaded — click Restore to apply it');
  };
  reader.onerror = () => showToast('Could not read that file.');
  reader.readAsText(file);
}

function showClearDataWarning() {
  document.getElementById('clear-data-idle').style.display = 'none';
  document.getElementById('clear-data-warning').style.display = '';
}
function hideClearDataWarning() {
  document.getElementById('clear-data-idle').style.display = '';
  document.getElementById('clear-data-warning').style.display = 'none';
}

function exportJSON() {
  const payload = {
    exported_at: new Date().toISOString(),
    categories: categories.map(c => ({ name: c.name, sort_order: c.sort_order })),
    entries: entries.map(e => ({
      entry_type: e.entry_type,
      title: e.title,
      url: e.url,
      category_name: e.category?.name || null,
      status: e.status,
      start_date: e.start_date || null,
      end_date: e.end_date || null,
      tags: e.tags || [],
      custom_fields: e.custom_fields || {},
      pinned: e.pinned,
      layout: e.layout || null,
      logo_url: e.logo_url || null,
      linked_docs: (e.linked_docs || []).map(d => ({ title: d.title, url: d.url, doc_type: d.doc_type }))
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studio-index-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
}

function importJSON() {
  if (!supabase) return showToast('Not connected to Supabase.');
  const raw = document.getElementById('import-json-input').value.trim();
  if (!raw) return showToast('Paste a backup JSON first.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return showToast('Invalid JSON: ' + e.message);
  }
  if (!Array.isArray(parsed.entries)) return showToast('Invalid backup: missing "entries" array.');

  showConfirmModal({
    title: 'Restore this backup?',
    message: 'This replaces everything currently on the dashboard.',
    confirmLabel: 'Restore',
    danger: true,
    onConfirm: () => performImportJSON(parsed)
  });
}

async function performImportJSON(parsed) {
  showToast('Restoring…');

  // Wipe current data (linked_docs cascades from entries).
  await supabase.from('entries').delete().not('id', 'is', null);
  await supabase.from('categories').delete().not('id', 'is', null);

  // Recreate categories, building a name -> new id map.
  const catNameToId = {};
  const cats = Array.isArray(parsed.categories) ? parsed.categories : [];
  for (const c of cats) {
    const { data, error } = await supabase.from('categories').insert({ name: c.name, sort_order: c.sort_order || 0 }).select().single();
    if (!error) catNameToId[c.name] = data.id;
  }

  // Recreate entries, then their linked docs.
  for (const e of parsed.entries) {
    const categoryId = e.category_name ? catNameToId[e.category_name] || null : null;
    const { data: newEntry, error } = await supabase.from('entries').insert({
      entry_type: e.entry_type || 'app',
      title: e.title,
      url: e.url || null,
      category_id: categoryId,
      status: e.status || null,
      start_date: e.start_date || null,
      end_date: e.end_date || null,
      tags: e.tags || [],
      custom_fields: e.custom_fields || {},
      pinned: !!e.pinned,
      layout: e.layout || null,
      logo_url: e.logo_url || null
    }).select().single();
    if (error || !newEntry) continue;

    const docs = (e.linked_docs || [])
      .filter(d => d.title && d.url)
      .map(d => ({ entry_id: newEntry.id, title: d.title, url: d.url, doc_type: d.doc_type || 'link' }));
    if (docs.length > 0) await supabase.from('linked_docs').insert(docs);
  }

  document.getElementById('import-json-input').value = '';
  closeBackupModal();
  await loadAll();
  showToast('Backup restored');
}

async function clearAllData() {
  if (!supabase) return showToast('Not connected to Supabase.');

  await supabase.from('entries').delete().not('id', 'is', null);
  await supabase.from('categories').delete().not('id', 'is', null);

  hideClearDataWarning();
  closeBackupModal();
  await loadAll();
  showToast('All data cleared');
}

// ---------- Utilities ----------
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// Inline HTML attributes (onclick="...") in index.html and in strings
// rendered here need these on window, since they're not module exports.
Object.assign(window, {
  setSky, setMode, setView, setCategoryFilter, setTagFilter,
  openEntryModal, closeEntryModal, promptNewCategory, addCustomFieldRow, addDocRow, deleteCurrentEntry,
  openBackupModal, closeBackupModal, exportJSON, importJSON, clearAllData,
  handleBackupFileChosen, showClearDataWarning, hideClearDataWarning, toggleLayoutEdit,
  openDocPreview, closeDocPreview, openPreviewInfoModal, closePreviewInfoModal,
  handleLogoFileChosen, removeLogo,
  closeConfirmModal, confirmModalConfirmed, closeCategoryModal, submitNewCategory,
  handlePinClick, setLogSort, toggleCategoryCollapsed, setAllCategoriesCollapsed
});

})();
