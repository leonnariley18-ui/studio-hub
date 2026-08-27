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
let editingEntryId = null;

const STATUS_CLASS = { '🟢 Live': 'live', '🟡 In progress': 'progress', '🟣 Stalled': 'stalled', '🔵 Reference': 'ref' };
const TYPE_LABEL = { app: 'App/Site', project: 'Project', note: 'Future note' };

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  initSky();
  const savedMode = localStorage.getItem('studio_sky_mode') || 'day';
  setSky(savedMode);
  loadAll();

  document.getElementById('entry-form').addEventListener('submit', handleEntrySubmit);
  document.querySelectorAll('.type-tab').forEach(t => t.addEventListener('click', () => setEntryType(t.dataset.type)));
});

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
      .select('*, category:categories(id, name), linked_docs(*)')
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

function getFilteredEntries() {
  if (!activeCategoryFilter) return entries;
  return entries.filter(e => e.category_id === activeCategoryFilter);
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
        <a class="dc-pin" href="${e.url || '#'}" target="${e.url ? '_blank' : '_self'}" rel="noopener">
          <span class="em">${e.custom_fields?.emoji || iconForType(e.entry_type)}</span>
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

// ---------- Filters ----------
function renderFilters() {
  const el = document.getElementById('filters');
  if (categories.length === 0) { el.innerHTML = ''; return; }
  const allChip = `<span class="chip ${!activeCategoryFilter ? 'on' : ''}" onclick="setCategoryFilter(null)">All</span>`;
  const catChips = categories.map(c =>
    `<span class="chip ${activeCategoryFilter === c.id ? 'on' : ''}" onclick="setCategoryFilter('${c.id}')">${escapeHtml(c.name)}</span>`
  ).join('');
  el.innerHTML = allChip + catChips;
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

  el.innerHTML = groups.map(g => `
    <div class="group">
      <div class="group-head"><h2>${escapeHtml(g.cat.name)}</h2><span class="count">${g.items.length} ${g.items.length === 1 ? 'entry' : 'entries'}</span></div>
      <div class="grid">${g.items.map(cardHtml).join('')}</div>
    </div>
  `).join('');
}

function cardHtml(e) {
  const fieldsHtml = Object.entries(e.custom_fields || {})
    .filter(([k]) => k !== 'emoji')
    .map(([k, v]) => `<div class="field-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`)
    .join('');
  const docsHtml = (e.linked_docs || []).map(d => {
    if (isPreviewable(d.url)) {
      return `<button type="button" class="doc-chip" onclick="openDocPreview('${escapeAttr(d.title)}', '${escapeAttr(d.url)}')">${docIcon(d.doc_type)} ${escapeHtml(d.title)}</button>`;
    }
    return `<a class="doc-chip" href="${d.url}" target="_blank" rel="noopener">${docIcon(d.doc_type)} ${escapeHtml(d.title)}</a>`;
  }).join('');
  const tagsHtml = (e.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  const statusDot = e.status ? `<div class="status-dot ${STATUS_CLASS[e.status] || 'live'}" title="${escapeHtml(e.status)}"></div>` : '';
  const dateRangeHtml = formatDateRange(e.start_date, e.end_date, e.entry_type === 'note');

  return `
    <div class="card ${e.entry_type === 'note' ? 'type-note' : ''}">
      <div class="type-rail ${e.entry_type}"></div>
      <div class="card-top">
        <div class="card-title">
          ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>` : escapeHtml(e.title)}
          ${e.pinned ? '<span class="pin-star">👑</span>' : ''}
        </div>
        ${statusDot}
      </div>
      ${dateRangeHtml ? `<div class="card-daterange">${dateRangeHtml}</div>` : ''}
      ${e.custom_fields?.description ? `<div class="card-desc">${escapeHtml(e.custom_fields.description)}</div>` : ''}
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
  pdf: 'iframe', html: 'iframe', htm: 'iframe',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio',
  txt: 'text', json: 'text', csv: 'text', md: 'text'
};

function previewKind(url) {
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  const ext = clean.split('.').pop();
  return PREVIEW_KINDS[ext] || null;
}

function isPreviewable(url) {
  return previewKind(url) !== null;
}

// iframe is the fallback for PDF/HTML — the browser renders those itself,
// with its own native chrome, which we can't restyle to match day/night.
// Everything else gets built with our own themed markup so it actually
// looks like part of the dashboard.
async function openDocPreview(title, url) {
  document.getElementById('doc-preview-title').textContent = title;
  document.getElementById('doc-preview-open-tab').href = url;
  document.getElementById('doc-preview-overlay').classList.add('open');

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
  } else {
    body.innerHTML = `<iframe class="preview-frame" src="${url}" title="Document preview"></iframe>`;
  }
}

function closeDocPreview() {
  document.getElementById('doc-preview-overlay').classList.remove('open');
  document.getElementById('doc-preview-body').innerHTML = '';
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
function renderLog() {
  const el = document.getElementById('log-view');
  const filtered = getFilteredEntries();
  if (filtered.length === 0) {
    el.innerHTML = entries.length === 0 ? '' : `<div class="empty-state">No entries in this category yet.</div>`;
    return;
  }
  el.innerHTML = filtered.map(e => {
    const date = new Date(e.created_at);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const statusClass = e.status ? (STATUS_CLASS[e.status] || 'live') : (e.entry_type === 'note' ? 'idea' : 'live');
    const statusLabel = e.status ? e.status.replace(/^\S+\s/, '') : (e.entry_type === 'note' ? 'idea' : '');
    return `
      <div class="log-row">
        <div class="date">${dateStr}</div>
        <div class="type-pip ${e.entry_type}" title="${TYPE_LABEL[e.entry_type]}"></div>
        <div class="main"><strong>${escapeHtml(e.title)}</strong>${e.custom_fields?.description ? `<span class="desc">${escapeHtml(e.custom_fields.description)}</span>` : ''}</div>
        ${statusLabel ? `<div class="badge ${statusClass}">${escapeHtml(statusLabel)}</div>` : ''}
      </div>
    `;
  }).join('');
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

async function promptNewCategory() {
  if (!supabase) return showToast('Not connected to Supabase.');
  const name = prompt('New category name:');
  if (!name || !name.trim()) return;
  const { data, error } = await supabase.from('categories').insert({ name: name.trim(), sort_order: categories.length }).select().single();
  if (error) return showToast('Could not add category: ' + error.message);
  categories.push(data);
  categories.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  populateCategorySelect(data.id);
  renderFilters();
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
  const form = document.getElementById('entry-form');
  form.reset();
  document.getElementById('custom-fields-list').innerHTML = '';
  document.getElementById('docs-list').innerHTML = '';
  populateCategorySelect();

  const entry = entryId ? entries.find(e => e.id === entryId) : null;

  document.getElementById('entry-modal-title').textContent = entry ? 'Edit entry' : 'New entry';
  document.getElementById('delete-entry-btn').style.display = entry ? '' : 'none';

  const type = entry?.entry_type || 'app';
  setEntryType(type);

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

  let entryId = editingEntryId;
  if (entryId) {
    const { error } = await supabase.from('entries').update(payload).eq('id', entryId);
    if (error) return showToast('Save failed: ' + error.message);
  } else {
    const { data, error } = await supabase.from('entries').insert(payload).select().single();
    if (error) return showToast('Save failed: ' + error.message);
    entryId = data.id;
  }

  // Replace linked docs wholesale for simplicity.
  if (type !== 'note') {
    await supabase.from('linked_docs').delete().eq('entry_id', entryId);
    const docRows = [];
    for (const row of document.querySelectorAll('#docs-list .doc-row-wrap')) {
      const title = row.querySelector('.doc-title').value.trim();
      const file = row.querySelector('.doc-file-input').files[0];
      let url = row.querySelector('.doc-url').value.trim();
      let docType = 'link';

      if (file) {
        const path = `${entryId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('studio-hub-files').upload(path, file, { upsert: true });
        if (upErr) { showToast('Upload failed for "' + file.name + '": ' + upErr.message); continue; }
        url = supabase.storage.from('studio-hub-files').getPublicUrl(path).data.publicUrl;
        docType = 'file';
      } else if (row.dataset.existingUrl) {
        url = row.dataset.existingUrl;
        docType = 'file';
      }

      if (title && url) docRows.push({ entry_id: entryId, title, url, doc_type: docType });
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

async function deleteCurrentEntry() {
  if (!supabase) return showToast('Not connected to Supabase.');
  if (!editingEntryId) return;
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  const { error } = await supabase.from('entries').delete().eq('id', editingEntryId);
  if (error) return showToast('Delete failed: ' + error.message);
  closeEntryModal();
  await loadEntries();
  renderAll();
  showToast('Entry deleted');
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

async function importJSON() {
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

  if (!confirm('This replaces everything currently on the dashboard with the backup. Continue?')) return;

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
      layout: e.layout || null
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
  setSky, setMode, setView, setCategoryFilter,
  openEntryModal, closeEntryModal, promptNewCategory, addCustomFieldRow, addDocRow, deleteCurrentEntry,
  openBackupModal, closeBackupModal, exportJSON, importJSON, clearAllData,
  handleBackupFileChosen, showClearDataWarning, hideClearDataWarning, toggleLayoutEdit,
  openDocPreview, closeDocPreview, openPreviewInfoModal, closePreviewInfoModal
});

})();
