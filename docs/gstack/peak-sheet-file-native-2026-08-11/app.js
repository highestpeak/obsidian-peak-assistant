const datasets = {
  launch: {
    title: 'Launch Tracker', folder: 'Product / Launch', revision: 18,
    fields: [
      { id: 'task', name: 'Task', type: 'text', width: 220 },
      { id: 'area', name: 'Area', type: 'singleSelect', width: 80 },
      { id: 'priority', name: 'Priority', type: 'singleSelect', width: 72 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 88 },
      { id: 'due', name: 'Due date', type: 'date', width: 80 },
      { id: 'blocker', name: 'Blocker', type: 'text', width: 130 },
      { id: 'owner', name: 'Owner', type: 'text', width: 72 },
      { id: 'notes', name: 'Notes', type: 'text', width: 130 },
    ],
    rows: [
      { task: 'Finish onboarding empty states', area: 'Product', priority: 'P0', status: 'Doing', due: 'Aug 12', blocker: 'Copy approval', owner: 'Jike', notes: 'First-run path must be testable' },
      { task: 'Verify AI Search provider routing', area: 'Agent', priority: 'P0', status: 'Blocked', due: 'Aug 12', blocker: 'Missing live-provider receipt', owner: 'Jike', notes: 'Keep simulator evidence separate' },
      { task: 'Close Composer IME regression', area: 'UI', priority: 'P0', status: 'Doing', due: 'Aug 13', blocker: 'Real Obsidian QA', owner: 'Jike', notes: 'Record one short interaction clip' },
      { task: 'Publish beta installation guide', area: 'Launch', priority: 'P1', status: 'Todo', due: 'Aug 14', blocker: '', owner: 'Jike', notes: 'Screenshots after final build' },
      { task: 'Run 500-row Sheet performance check', area: 'Performance', priority: 'P1', status: 'Todo', due: 'Aug 15', blocker: '', owner: 'Jike', notes: 'Owner-device evidence' },
      { task: 'Review landing capability claims', area: 'Growth', priority: 'P1', status: 'Done', due: 'Aug 10', blocker: '', owner: 'Jike', notes: 'Evidence locator attached' },
      { task: 'Prepare beta feedback triage', area: 'Launch', priority: 'P2', status: 'Todo', due: 'Aug 16', blocker: '', owner: 'Jike', notes: 'Use shared severity rubric' },
      { task: 'Freeze release candidate', area: 'Launch', priority: 'P0', status: 'Todo', due: 'Aug 18', blocker: 'Open P0 blockers', owner: 'Jike', notes: 'Only after recovery exercise' },
    ],
  },
  beta: {
    title: 'Beta Feedback', folder: 'Product / Launch', revision: 9,
    fields: [
      { id: 'user', name: 'User', type: 'text', width: 90 },
      { id: 'feedback', name: 'Feedback', type: 'text', width: 220 },
      { id: 'category', name: 'Category', type: 'singleSelect', width: 90 },
      { id: 'severity', name: 'Severity', type: 'singleSelect', width: 75 },
      { id: 'repro', name: 'Reproducible', type: 'checkbox', width: 90 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 90 },
      { id: 'task', name: 'Related task', type: 'link', width: 140 },
      { id: 'notes', name: 'Notes', type: 'text', width: 130 },
    ],
    rows: [
      { user: 'Beta 014', feedback: 'Search result opens the wrong preview tab', category: 'Search', severity: 'P0', repro: true, status: 'Doing', task: 'Verify AI Search provider routing', notes: 'Occurs after switching modes' },
      { user: 'Beta 008', feedback: 'Onboarding provider copy is unclear', category: 'Onboarding', severity: 'P1', repro: true, status: 'Todo', task: 'Finish onboarding empty states', notes: 'Needs plain-language outcome' },
      { user: 'Beta 021', feedback: 'Composer selection jumps with Chinese IME', category: 'Composer', severity: 'P0', repro: true, status: 'Blocked', task: 'Close Composer IME regression', notes: 'Video attached' },
      { user: 'Beta 003', feedback: 'Graph detail is much easier to understand now', category: 'Graph', severity: 'P2', repro: false, status: 'Done', task: '', notes: 'Positive signal' },
    ],
  },
  content: {
    title: 'Launch Content', folder: 'Product / Launch / Marketing', revision: 12,
    fields: [
      { id: 'channel', name: 'Channel', type: 'singleSelect', width: 100 },
      { id: 'content', name: 'Content type', type: 'singleSelect', width: 100 },
      { id: 'topic', name: 'Topic', type: 'text', width: 250 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 90 },
      { id: 'date', name: 'Publish date', type: 'date', width: 100 },
      { id: 'link', name: 'Link', type: 'link', width: 180 },
      { id: 'result', name: 'Result', type: 'number', width: 90 },
    ],
    rows: [
      { channel: 'Website', content: 'Landing page', topic: 'See the whole system. Work inside the source.', status: 'Doing', date: 'Aug 17', link: '/launch', result: 0 },
      { channel: 'X', content: 'Thread', topic: 'Graph + Composer launch walkthrough', status: 'Todo', date: 'Aug 18', link: '', result: 0 },
      { channel: 'YouTube', content: 'Demo', topic: 'From source note to reviewed artifact', status: 'Todo', date: 'Aug 19', link: '', result: 0 },
      { channel: 'Newsletter', content: 'Email', topic: 'Private beta invitation', status: 'Done', date: 'Aug 10', link: '/beta', result: 42 },
    ],
  },
};

let activeDatasetId = 'launch';
let activeView = 'table';
let openFieldIndex = null;
let openRowIndex = null;
let toastTimer = null;

const byId = (id) => document.getElementById(id);
const current = () => datasets[activeDatasetId];
const typeLabel = (type) => ({ text: 'Text', singleSelect: 'Single select', number: 'Number', date: 'Date', checkbox: 'Checkbox', link: 'Link', file: 'File' }[type] ?? type);

function filePath(dataset = current()) {
  return `${dataset.folder.replaceAll(' / ', '/')}/${dataset.title}.peaksheet`;
}

function renderDocument() {
  const dataset = current();
  byId('tab-name').textContent = dataset.title;
  byId('sheet-title').value = dataset.title;
  byId('file-folder').textContent = dataset.folder;
  byId('file-name').textContent = `${dataset.title}.peaksheet`;
  byId('file-status').textContent = filePath(dataset);
  byId('location-path').textContent = filePath(dataset);
  byId('revision').textContent = dataset.revision;
  byId('record-count').textContent = dataset.rows.length;
  document.querySelectorAll('[data-dataset]').forEach((button) => button.classList.toggle('is-active', button.dataset.dataset === activeDatasetId));
  renderTable();
  renderBoard();
  renderCalendar();
  renderChart();
}

function renderTable() {
  const dataset = current();
  const table = byId('data-grid');
  const colgroup = `<colgroup><col style="width:48px">${dataset.fields.map((field) => `<col style="width:${field.width}px">`).join('')}<col style="width:44px"></colgroup>`;
  const head = `<thead><tr><th class="row-index">#</th>${dataset.fields.map((field, index) => `
    <th class="field-head" data-field-index="${index}">
      <button type="button" class="field-head-button${openFieldIndex === index ? ' is-open' : ''}" data-field-index="${index}">
        <span>${escapeHtml(field.name)}</span><small>${escapeHtml(shortType(field.type))}</small><svg><use href="#i-chevron"/></svg>
      </button>
    </th>`).join('')}<th class="add-field-head"><button type="button" class="add-field-button" id="inline-add-field" aria-label="Add column"><svg><use href="#i-plus"/></svg></button></th></tr></thead>`;
  const body = `<tbody>${dataset.rows.map((row, rowIndex) => `<tr>
    <td class="row-index" data-row-index="${rowIndex}">${rowIndex + 1}</td>
    ${dataset.fields.map((field, fieldIndex) => `<td class="cell ${cellClass(field, rowIndex, fieldIndex)}" data-row-index="${rowIndex}" data-field-index="${fieldIndex}" tabindex="0">${renderCell(field, row[field.id])}</td>`).join('')}
    <td></td>
  </tr>`).join('')}</tbody>`;
  table.innerHTML = `${colgroup}${head}${body}`;
  bindGridEvents();
}

function renderCell(field, value) {
  if (field.type === 'checkbox') return value ? '<svg class="check-cell"><use href="#i-check"/></svg>' : '';
  if (field.id === 'status') return `<span class="tag ${statusClass(String(value ?? ''))}">${escapeHtml(String(value ?? ''))}</span>`;
  if (field.id === 'priority' || field.id === 'severity') return `<span class="priority ${String(value ?? '').toLowerCase()}">${escapeHtml(String(value ?? ''))}</span>`;
  if (field.id === 'task' || field.id === 'feedback' || field.id === 'topic' || field.id === 'user') return `<span class="cell-primary">${escapeHtml(String(value ?? ''))}</span>`;
  return escapeHtml(String(value ?? ''));
}

function cellClass(field, rowIndex, fieldIndex) {
  const classes = [];
  if (field.type === 'number') classes.push('cell-number');
  if (field.type === 'date') classes.push('cell-date');
  if (activeDatasetId === 'launch' && rowIndex === 2 && fieldIndex === 3) classes.push('is-selected');
  return classes.join(' ');
}

function bindGridEvents() {
  document.querySelectorAll('.field-head-button').forEach((button) => {
    button.addEventListener('click', (event) => openFieldMenu(Number(button.dataset.fieldIndex), event.currentTarget));
    button.addEventListener('contextmenu', (event) => { event.preventDefault(); openFieldMenu(Number(button.dataset.fieldIndex), event.currentTarget); });
  });
  byId('inline-add-field')?.addEventListener('click', (event) => openFieldEditor(null, event.currentTarget));
  document.querySelectorAll('tbody .row-index').forEach((cell) => {
    cell.addEventListener('contextmenu', (event) => { event.preventDefault(); openRowMenu(Number(cell.dataset.rowIndex), event); });
  });
  document.querySelectorAll('.data-grid td.cell').forEach((cell) => {
    cell.addEventListener('click', () => selectCell(cell));
    cell.addEventListener('dblclick', () => beginCellEdit(cell));
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') beginCellEdit(cell);
    });
  });
}

function selectCell(cell) {
  document.querySelectorAll('.data-grid td.cell.is-selected').forEach((candidate) => candidate.classList.remove('is-selected'));
  cell.classList.add('is-selected');
  const row = Number(cell.dataset.rowIndex);
  const field = Number(cell.dataset.fieldIndex);
  byId('cell-reference').textContent = `${columnName(field)}${row + 2}`;
  byId('selection-status').innerHTML = `<i></i> ${columnName(field)}${row + 2} · 1 cell selected`;
  const definition = current().fields[field];
  byId('formula-input').value = String(current().rows[row][definition.id] ?? '');
}

function beginCellEdit(cell) {
  const rowIndex = Number(cell.dataset.rowIndex);
  const fieldIndex = Number(cell.dataset.fieldIndex);
  const field = current().fields[fieldIndex];
  if (field.type === 'checkbox') {
    current().rows[rowIndex][field.id] = !current().rows[rowIndex][field.id];
    bumpRevision('Checkbox updated');
    return;
  }
  cell.textContent = String(current().rows[rowIndex][field.id] ?? '');
  cell.contentEditable = 'true';
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const finish = () => {
    current().rows[rowIndex][field.id] = cell.textContent.trim();
    cell.contentEditable = 'false';
    cell.removeEventListener('blur', finish);
    bumpRevision('Cell updated');
  };
  cell.addEventListener('blur', finish);
  cell.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    cell.blur();
    if (rowIndex === current().rows.length - 1 && fieldIndex === current().fields.length - 1) addRecord();
  }, { once: true });
}

function openFieldMenu(index, anchor) {
  closePopovers();
  openFieldIndex = index;
  const field = current().fields[index];
  byId('field-menu-name').textContent = field.name;
  byId('field-menu-type').textContent = typeLabel(field.type);
  positionPopover(byId('field-menu'), anchor.getBoundingClientRect(), 230);
  byId('field-menu').hidden = false;
  renderTable();
}

function openFieldEditor(index, anchor) {
  closePopovers();
  openFieldIndex = index;
  const field = index === null ? null : current().fields[index];
  byId('field-editor-title').textContent = field ? `Edit “${field.name}”` : 'Add column';
  byId('field-name-input').value = field?.name ?? '';
  byId('field-type-select').value = field?.type ?? 'text';
  const rect = anchor.getBoundingClientRect();
  positionPopover(byId('field-editor'), rect, 292);
  byId('field-editor').hidden = false;
  requestAnimationFrame(() => byId('field-name-input').focus());
}

function saveField() {
  const name = byId('field-name-input').value.trim() || 'New field';
  const type = byId('field-type-select').value;
  if (openFieldIndex === null) {
    const id = uniqueFieldId(name);
    current().fields.push({ id, name, type, width: 160 });
    current().rows.forEach((row) => { row[id] = type === 'checkbox' ? false : ''; });
    bumpRevision(`Column “${name}” added`);
  } else {
    Object.assign(current().fields[openFieldIndex], { name, type });
    bumpRevision(`Field “${name}” saved`);
  }
  closePopovers();
}

function handleFieldAction(action) {
  const index = openFieldIndex;
  if (index === null || !current().fields[index]) return;
  const field = current().fields[index];
  if (action === 'edit') {
    const menuRect = byId('field-menu').getBoundingClientRect();
    openFieldEditor(index, { getBoundingClientRect: () => menuRect });
    return;
  }
  if (action === 'insert-left' || action === 'insert-right') {
    const id = uniqueFieldId('New field');
    const insertAt = action === 'insert-left' ? index : index + 1;
    current().fields.splice(insertAt, 0, { id, name: 'New field', type: 'text', width: 160 });
    current().rows.forEach((row) => { row[id] = ''; });
    bumpRevision('New column inserted');
  } else if (action === 'duplicate') {
    const id = uniqueFieldId(`${field.id}-copy`);
    current().fields.splice(index + 1, 0, { ...field, id, name: `${field.name} copy` });
    current().rows.forEach((row) => { row[id] = row[field.id]; });
    bumpRevision(`Column “${field.name}” duplicated`);
  } else if (action === 'delete') {
    current().fields.splice(index, 1);
    current().rows.forEach((row) => { delete row[field.id]; });
    bumpRevision(`Column “${field.name}” deleted`);
  } else {
    showToast(`${field.name}: ${action.replace('-', ' ')}`);
  }
  closePopovers();
}

function openRowMenu(index, event) {
  closePopovers();
  openRowIndex = index;
  byId('row-menu-title').textContent = `Record ${index + 1}`;
  const menu = byId('row-menu');
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 235)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 190)}px`;
  menu.hidden = false;
}

function handleRowAction(action) {
  if (openRowIndex === null) return;
  const dataset = current();
  if (action === 'insert-above' || action === 'insert-below') {
    const index = openRowIndex + (action === 'insert-below' ? 1 : 0);
    dataset.rows.splice(index, 0, emptyRow(dataset));
    bumpRevision('Record inserted');
  } else if (action === 'duplicate') {
    dataset.rows.splice(openRowIndex + 1, 0, { ...dataset.rows[openRowIndex] });
    bumpRevision('Record duplicated');
  } else if (action === 'delete') {
    dataset.rows.splice(openRowIndex, 1);
    bumpRevision('Record deleted');
  }
  closePopovers();
}

function addRecord() {
  current().rows.push(emptyRow(current()));
  bumpRevision('New record added at the bottom');
  requestAnimationFrame(() => { byId('grid-scroll').scrollTop = byId('grid-scroll').scrollHeight; });
}

function emptyRow(dataset) {
  return Object.fromEntries(dataset.fields.map((field) => [field.id, field.type === 'checkbox' ? false : '']));
}

function renderBoard() {
  const dataset = current();
  const statusField = dataset.fields.find((field) => field.id === 'status');
  if (!statusField) {
    byId('board-view').innerHTML = '<div class="board-shell"><div class="board-card"><strong>Add a Status field</strong><small>Board groups records by a single-select field.</small></div></div>';
    return;
  }
  const lanes = ['Todo', 'Doing', 'Blocked', 'Done'];
  byId('board-view').innerHTML = `<div class="board-shell">${lanes.map((lane) => {
    const rows = dataset.rows.filter((row) => row.status === lane);
    return `<section class="board-lane"><header class="board-lane-head"><strong>${lane}</strong><span>${rows.length}</span></header>${rows.map((row) => `<article class="board-card"><strong>${escapeHtml(String(row.task ?? row.feedback ?? row.topic ?? 'Untitled'))}</strong><small>${escapeHtml(String(row.blocker || row.notes || row.category || 'No blocker'))}</small><footer><span>${escapeHtml(String(row.area || row.category || row.channel || ''))}</span><span>${escapeHtml(String(row.due || row.date || ''))}</span></footer></article>`).join('')}</section>`;
  }).join('')}</div>`;
}

function renderCalendar() {
  const dataset = current();
  const datedRows = dataset.rows.filter((row) => row.due || row.date);
  const cells = Array.from({ length: 35 }, (_, index) => {
    const day = index + 1;
    const event = datedRows[index % Math.max(1, datedRows.length)];
    const showEvent = event && [2, 5, 8, 12, 15, 18, 23].includes(day);
    return `<div class="calendar-day"><span>${day}</span>${showEvent ? `<span class="calendar-event">${escapeHtml(String(event.task ?? event.topic ?? event.feedback ?? 'Record'))}</span>` : ''}</div>`;
  }).join('');
  byId('calendar-view').innerHTML = `<div class="calendar-shell"><section class="calendar-main"><header class="calendar-head"><strong>August 2026</strong><span>Today · Month</span></header><div class="calendar-grid">${cells}</div></section><aside class="agenda"><strong>Next 7 days</strong>${datedRows.slice(0, 5).map((row) => `<div class="agenda-item"><small>${escapeHtml(String(row.due || row.date))}</small><span>${escapeHtml(String(row.task ?? row.topic ?? row.feedback ?? 'Record'))}</span></div>`).join('')}</aside></div>`;
}

function renderChart() {
  const dataset = current();
  const counts = new Map();
  dataset.rows.forEach((row) => {
    const key = String(row.status || row.category || row.channel || 'Other');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const max = Math.max(1, ...counts.values());
  const bars = [...counts.entries()].map(([label, value]) => `<div class="bar-item"><strong>${value}</strong><div class="bar" style="height:${Math.max(8, value / max * 78)}%"></div><span>${escapeHtml(label)}</span></div>`).join('');
  byId('chart-view').innerHTML = `<div class="chart-shell"><section class="chart-card"><header><strong>Records by ${dataset.fields.some((field) => field.id === 'status') ? 'Status' : 'Category'}</strong><small>${dataset.rows.length} records · live from ${escapeHtml(dataset.title)}.peaksheet</small></header><div class="bar-chart">${bars}</div></section><aside class="chart-config"><strong>Chart configuration</strong><label>Chart type<select><option>Bar</option><option>Line</option><option>Pie</option></select></label><label>Category<select><option>Status</option><option>Area</option><option>Priority</option></select></label><label>Value<select><option>Record count</option></select></label></aside></div>`;
}

function switchDataset(id) {
  if (!datasets[id]) return;
  activeDatasetId = id;
  openFieldIndex = null;
  openRowIndex = null;
  closePopovers();
  renderDocument();
  showToast(`Opened ${current().title}.peaksheet from the Vault`);
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll('.view-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === view));
}

function renameDataset() {
  const value = byId('sheet-title').value.trim();
  if (!value || value === current().title) return;
  current().title = value;
  bumpRevision(`File renamed to ${value}.peaksheet`);
}

function bumpRevision(message) {
  current().revision += 1;
  renderDocument();
  showToast(message);
}

function closePopovers() {
  document.querySelectorAll('.popover').forEach((popover) => { popover.hidden = true; });
  openFieldIndex = null;
  openRowIndex = null;
}

function positionPopover(popover, rect, width) {
  const left = Math.min(rect.left, window.innerWidth - width - 10);
  const top = Math.min(rect.bottom + 4, window.innerHeight - 360);
  popover.style.left = `${Math.max(8, left)}px`;
  popover.style.top = `${Math.max(8, top)}px`;
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function uniqueFieldId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
  const ids = new Set(current().fields.map((field) => field.id));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function shortType(type) {
  return ({ singleSelect: 'select', checkbox: 'check' }[type] ?? type);
}

function statusClass(status) {
  return ({ Todo: 'todo', Doing: 'doing', Blocked: 'blocked', Done: 'done' }[status] ?? 'todo');
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

document.querySelectorAll('[data-dataset]').forEach((button) => button.addEventListener('click', () => switchDataset(button.dataset.dataset)));
document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[data-field-action]').forEach((button) => button.addEventListener('click', () => handleFieldAction(button.dataset.fieldAction)));
document.querySelectorAll('[data-row-action]').forEach((button) => button.addEventListener('click', () => handleRowAction(button.dataset.rowAction)));
document.querySelectorAll('.close-popover').forEach((button) => button.addEventListener('click', closePopovers));
byId('save-field').addEventListener('click', saveField);
byId('bottom-add-record').addEventListener('click', addRecord);
byId('toolbar-add-record').addEventListener('click', addRecord);
byId('sheet-title').addEventListener('change', renameDataset);
byId('sheet-title').addEventListener('blur', renameDataset);
byId('location-button').addEventListener('click', () => { byId('location-card').hidden = !byId('location-card').hidden; });
byId('table-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('#data-grid tbody tr').forEach((row) => { row.hidden = query && !row.textContent.toLowerCase().includes(query); });
});
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.popover, .field-head-button, .add-field-button, .row-index, #location-button, #location-card')) return;
  closePopovers();
  byId('location-card').hidden = true;
});

renderDocument();
switchView('table');
