// ===== Studio Index — app logic =====

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
function renderDecorated() {
  const pins = entries.filter(e => e.pinned);
  const container = document.getElementById('dc-pins');
  const countEl = document.getElementById('dc-pin-count');

  if (pins.length === 0) {
    container.innerHTML = `<div class="dc-empty">Nothing pinned yet. Open the full ledger and pin an entry to have it show up here.</div>`;
    countEl.textContent = entries.length === 0 ? 'No entries yet' : `0 pinned of ${entries.length} total`;
    return;
  }

  container.innerHTML = pins.map(e => `
    <a class="dc-pin" href="${e.url || '#'}" target="${e.url ? '_blank' : '_self'}" rel="noopener">
      <span class="em">${e.custom_fields?.emoji || iconForType(e.entry_type)}</span>
      <div class="info">
        <div class="t">${escapeHtml(e.title)} <span class="pin-star">👑</span></div>
        <div class="s">${TYPE_LABEL[e.entry_type]}${e.status ? ' · ' + e.status.replace(/^\S+\s/, '') : ''}</div>
      </div>
      <span class="arrow">→</span>
    </a>
  `).join('');
  countEl.textContent = `${pins.length} pinned of ${entries.length} total`;
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
  const docsHtml = (e.linked_docs || []).map(d =>
    `<a class="doc-chip" href="${d.url}" target="_blank" rel="noopener">${docIcon(d.doc_type)} ${escapeHtml(d.title)}</a>`
  ).join('');
  const tagsHtml = (e.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  const statusDot = e.status ? `<div class="status-dot ${STATUS_CLASS[e.status] || 'live'}" title="${escapeHtml(e.status)}"></div>` : '';

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
  return { doc: '📄', link: '🔗', canvas: '🎨', repo: '🔗' }[type] || '📄';
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
  row.className = 'dyn-row doc-row';
  row.innerHTML = `
    <input type="text" class="doc-title" placeholder="e.g. GitHub repo" value="${escapeAttr(title)}">
    <input type="url" class="doc-url" placeholder="https://…" value="${escapeAttr(url)}">
    <button type="button" class="row-remove" onclick="this.closest('.dyn-row').remove()">×</button>
  `;
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
    const docRows = [...document.querySelectorAll('#docs-list .dyn-row')]
      .map(row => ({
        entry_id: entryId,
        title: row.querySelector('.doc-title').value.trim(),
        url: row.querySelector('.doc-url').value.trim()
      }))
      .filter(d => d.title && d.url);
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
