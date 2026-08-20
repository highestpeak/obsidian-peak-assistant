const MIN_GRID_ROWS = 32;
const GENERATED_VALUES = [1, 1, 2, 3, 4, '', 5, 7];

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
let draggingSelection = false;
let aiTimers = [];
let aiTypingTimer = null;
let selection = { anchorRow: 2, anchorField: 3, focusRow: 2, focusField: 3 };

const byId = (id) => document.getElementById(id);
const current = () => datasets[activeDatasetId];
const typeLabel = (type) => ({ text: 'Text', singleSelect: 'Single select', number: 'Number', date: 'Date', checkbox: 'Checkbox', link: 'Link', file: 'File', formula: 'Formula' }[type] ?? type);

function filePath(dataset = current()) {
  return `${dataset.folder.replaceAll(' / ', '/')}/${dataset.title}.peaksheet`;
}

function visibleRowCount(dataset = current()) {
  return Math.max(MIN_GRID_ROWS, dataset.rows.length + 1);
}

function renderDocument() {
  const dataset = current();
  clampSelection();
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
  updateSelectionSummary();
}

function renderTable() {
  const dataset = current();
  const table = byId('data-grid');
  const rows = Array.from({ length: visibleRowCount(dataset) }, (_, index) => dataset.rows[index]);
  const gridWidth = 92 + dataset.fields.reduce((total, field) => total + field.width, 0);
  byId('grid-scroll').style.setProperty('--grid-width', `${gridWidth}px`);
  const colgroup = `<colgroup><col style="width:48px">${dataset.fields.map((field) => `<col style="width:${field.width}px">`).join('')}<col style="width:44px"></colgroup>`;
  const head = `<thead><tr><th class="row-index"><button type="button" class="select-all-cells" id="select-all-cells" aria-label="Select all cells"></button></th>${dataset.fields.map((field, index) => `
    <th class="field-head" data-field-index="${index}">
      <div class="field-head-shell" data-field-index="${index}">
        <button type="button" class="field-select-button" data-field-index="${index}" title="Click to select column · Double-click to rename"><span>${escapeHtml(field.name)}</span><small>${escapeHtml(shortType(field.type))}</small></button>
        <button type="button" class="field-menu-trigger${openFieldIndex === index ? ' is-open' : ''}" data-field-index="${index}" aria-label="Configure ${escapeHtml(field.name)}"><svg><use href="#i-chevron"/></svg></button>
      </div>
    </th>`).join('')}<th class="add-field-head"><button type="button" class="add-field-button" id="inline-add-field" aria-label="Add column in one click" title="Add column in one click"><svg><use href="#i-plus"/></svg></button></th></tr></thead>`;
  const body = `<tbody>${rows.map((row, rowIndex) => `<tr class="${row ? '' : 'is-placeholder-row'}">
    <td class="row-index" data-row-index="${rowIndex}">${rowIndex + 1}</td>
    ${dataset.fields.map((field, fieldIndex) => `<td class="cell ${cellClass(field)}" data-row-index="${rowIndex}" data-field-index="${fieldIndex}" tabindex="0">${renderCell(field, row?.[field.id])}</td>`).join('')}
    <td></td>
  </tr>`).join('')}</tbody>`;
  table.innerHTML = `${colgroup}${head}${body}`;
  bindGridEvents();
  paintSelection();
}

function renderCell(field, value) {
  if (field.type === 'checkbox') return value ? '<svg class="check-cell"><use href="#i-check"/></svg>' : '';
  if (value === undefined || value === null || value === '') return '<span class="empty-cell-hint">empty</span>';
  if (field.type === 'formula') return `<span class="calculated-cell">${escapeHtml(value)} <small>days</small></span>`;
  if (field.id === 'status') return `<span class="tag ${statusClass(String(value))}">${escapeHtml(value)}</span>`;
  if (field.id === 'priority' || field.id === 'severity') return `<span class="priority ${String(value).toLowerCase()}">${escapeHtml(value)}</span>`;
  if (field.id === 'task' || field.id === 'feedback' || field.id === 'topic' || field.id === 'user') return `<span class="cell-primary">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function cellClass(field) {
  const classes = [];
  if (field.type === 'number' || field.type === 'formula') classes.push('cell-number');
  if (field.type === 'date') classes.push('cell-date');
  return classes.join(' ');
}

function bindGridEvents() {
  document.querySelectorAll('.field-select-button').forEach((button) => {
    button.addEventListener('click', () => selectColumn(Number(button.dataset.fieldIndex)));
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      beginInlineFieldRename(Number(button.dataset.fieldIndex));
    });
  });
  document.querySelectorAll('.field-menu-trigger').forEach((button) => {
    button.addEventListener('click', (event) => openFieldMenu(Number(button.dataset.fieldIndex), event.currentTarget));
  });
  document.querySelectorAll('.field-head-shell').forEach((header) => {
    header.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openFieldMenu(Number(header.dataset.fieldIndex), header);
    });
  });
  byId('inline-add-field')?.addEventListener('click', addColumnOneClick);
  byId('select-all-cells')?.addEventListener('click', selectAllCells);
  document.querySelectorAll('tbody .row-index').forEach((cell) => {
    cell.addEventListener('click', () => selectRow(Number(cell.dataset.rowIndex)));
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openRowMenu(Number(cell.dataset.rowIndex), event);
    });
  });
  document.querySelectorAll('.data-grid td.cell').forEach((cell) => {
    cell.addEventListener('pointerdown', (event) => startCellSelection(event, cell));
    cell.addEventListener('pointerenter', () => extendDraggedSelection(cell));
    cell.addEventListener('dblclick', () => beginCellEdit(cell));
    cell.addEventListener('keydown', (event) => handleCellKeydown(event, cell));
  });
}

function startCellSelection(event, cell) {
  if (event.button !== 0 || cell.contentEditable === 'true') return;
  event.preventDefault();
  draggingSelection = true;
  const row = Number(cell.dataset.rowIndex);
  const field = Number(cell.dataset.fieldIndex);
  setSelection(row, field, event.shiftKey);
  cell.focus({ preventScroll: true });
}

function extendDraggedSelection(cell) {
  if (!draggingSelection) return;
  selection.focusRow = Number(cell.dataset.rowIndex);
  selection.focusField = Number(cell.dataset.fieldIndex);
  paintSelection();
  updateSelectionSummary();
}

function handleCellKeydown(event, cell) {
  if (event.key === 'Enter') {
    event.preventDefault();
    beginCellEdit(cell);
    return;
  }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  const row = Math.max(0, Math.min(visibleRowCount() - 1, selection.focusRow + move[0]));
  const field = Math.max(0, Math.min(current().fields.length - 1, selection.focusField + move[1]));
  setSelection(row, field, event.shiftKey);
  document.querySelector(`.cell[data-row-index="${row}"][data-field-index="${field}"]`)?.focus({ preventScroll: true });
}

function setSelection(row, field, extend = false) {
  if (!extend) {
    selection.anchorRow = row;
    selection.anchorField = field;
  }
  selection.focusRow = row;
  selection.focusField = field;
  paintSelection();
  updateSelectionSummary();
}

function selectionBounds() {
  return {
    top: Math.min(selection.anchorRow, selection.focusRow),
    bottom: Math.max(selection.anchorRow, selection.focusRow),
    left: Math.min(selection.anchorField, selection.focusField),
    right: Math.max(selection.anchorField, selection.focusField),
  };
}

function paintSelection() {
  const bounds = selectionBounds();
  document.querySelectorAll('.data-grid td.cell').forEach((cell) => {
    cell.classList.remove('is-in-range', 'is-range-top', 'is-range-bottom', 'is-range-left', 'is-range-right', 'is-selected');
    const row = Number(cell.dataset.rowIndex);
    const field = Number(cell.dataset.fieldIndex);
    if (row < bounds.top || row > bounds.bottom || field < bounds.left || field > bounds.right) return;
    cell.classList.add('is-in-range');
    if (row === bounds.top) cell.classList.add('is-range-top');
    if (row === bounds.bottom) cell.classList.add('is-range-bottom');
    if (field === bounds.left) cell.classList.add('is-range-left');
    if (field === bounds.right) cell.classList.add('is-range-right');
    if (row === selection.focusRow && field === selection.focusField) cell.classList.add('is-selected');
  });
  document.querySelectorAll('.field-head-shell').forEach((header) => {
    const field = Number(header.dataset.fieldIndex);
    header.classList.toggle('is-selected', bounds.top === 0 && bounds.bottom === visibleRowCount() - 1 && field >= bounds.left && field <= bounds.right);
  });
}

function updateSelectionSummary() {
  const bounds = selectionBounds();
  const count = (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
  const label = rangeLabel(bounds);
  const values = selectedValues(bounds).filter((value) => value !== '' && value !== undefined && value !== null);
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  let detail = `${count} ${count === 1 ? 'cell' : 'cells'} selected`;
  if (count > 1) detail += ` · ${values.length} values`;
  if (numbers.length > 1) {
    const sum = numbers.reduce((total, value) => total + value, 0);
    detail += ` · Sum ${sum} · Avg ${(sum / numbers.length).toFixed(1)}`;
  }
  byId('cell-reference').textContent = label;
  byId('selection-status').innerHTML = `<i></i> ${escapeHtml(label)} · ${escapeHtml(detail)}`;
  const field = current().fields[selection.focusField];
  const value = current().rows[selection.focusRow]?.[field?.id] ?? '';
  byId('formula-input').value = field?.type === 'formula' ? field.formula : String(value);
  syncAiContext(label, count);
}

function selectedValues(bounds) {
  const values = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let field = bounds.left; field <= bounds.right; field += 1) {
      const definition = current().fields[field];
      values.push(current().rows[row]?.[definition?.id]);
    }
  }
  return values;
}

function rangeLabel(bounds) {
  const start = `${columnName(bounds.left)}${bounds.top + 2}`;
  const end = `${columnName(bounds.right)}${bounds.bottom + 2}`;
  return start === end ? start : `${start}:${end}`;
}

function selectColumn(field) {
  selection = { anchorRow: 0, anchorField: field, focusRow: visibleRowCount() - 1, focusField: field };
  paintSelection();
  updateSelectionSummary();
}

function selectRow(row) {
  selection = { anchorRow: row, anchorField: 0, focusRow: row, focusField: current().fields.length - 1 };
  paintSelection();
  updateSelectionSummary();
}

function selectAllCells() {
  selection = { anchorRow: 0, anchorField: 0, focusRow: visibleRowCount() - 1, focusField: current().fields.length - 1 };
  paintSelection();
  updateSelectionSummary();
}

function clampSelection() {
  const maxRow = visibleRowCount() - 1;
  const maxField = Math.max(0, current().fields.length - 1);
  selection.anchorRow = Math.min(selection.anchorRow, maxRow);
  selection.focusRow = Math.min(selection.focusRow, maxRow);
  selection.anchorField = Math.min(selection.anchorField, maxField);
  selection.focusField = Math.min(selection.focusField, maxField);
}

function beginCellEdit(cell) {
  const rowIndex = Number(cell.dataset.rowIndex);
  const fieldIndex = Number(cell.dataset.fieldIndex);
  const field = current().fields[fieldIndex];
  setSelection(rowIndex, fieldIndex);
  if (field.type === 'formula') {
    showToast('Formula cells are calculated · edit the formula from Ask AI or the formula bar');
    return;
  }
  materializeRow(rowIndex);
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
  const nativeSelection = window.getSelection();
  nativeSelection.removeAllRanges();
  nativeSelection.addRange(range);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    current().rows[rowIndex][field.id] = cell.textContent.trim();
    cell.contentEditable = 'false';
    bumpRevision('Cell updated');
  };
  cell.addEventListener('blur', finish, { once: true });
  cell.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    cell.blur();
  }, { once: true });
}

function materializeRow(rowIndex) {
  while (current().rows.length <= rowIndex) current().rows.push(emptyRow(current()));
}

function addColumnOneClick() {
  closePopovers();
  const index = current().fields.length;
  const id = uniqueFieldId('Untitled');
  current().fields.push({ id, name: 'Untitled', type: 'text', width: 150 });
  current().rows.forEach((row) => { row[id] = ''; });
  selection = { anchorRow: 0, anchorField: index, focusRow: 0, focusField: index };
  bumpRevision('Column added · type a name, then press Enter', () => beginInlineFieldRename(index));
}

function beginInlineFieldRename(index) {
  const button = document.querySelector(`.field-select-button[data-field-index="${index}"]`);
  const field = current().fields[index];
  if (!button || !field) return;
  const input = document.createElement('input');
  input.className = 'field-name-input';
  input.value = field.name;
  input.setAttribute('aria-label', 'Column name');
  button.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const nextName = input.value.trim();
    if (!commit || !nextName || nextName === field.name) {
      renderTable();
      updateSelectionSummary();
      return;
    }
    field.name = nextName;
    bumpRevision(`Column renamed to “${nextName}”`);
  };
  input.addEventListener('blur', () => finish(true), { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
}

function openFieldMenu(index, anchor) {
  closePopovers();
  openFieldIndex = index;
  const field = current().fields[index];
  byId('field-menu-name').textContent = field.name;
  byId('field-menu-type').textContent = typeLabel(field.type);
  positionPopover(byId('field-menu'), anchor.getBoundingClientRect(), 230);
  byId('field-menu').hidden = false;
  document.querySelector(`.field-menu-trigger[data-field-index="${index}"]`)?.classList.add('is-open');
}

function openFieldEditor(index, anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  closePopovers();
  openFieldIndex = index;
  const field = index === null ? null : current().fields[index];
  byId('field-editor-title').textContent = field ? `Edit “${field.name}”` : 'Add column';
  byId('field-name-input').value = field?.name ?? '';
  byId('field-type-select').value = field?.type ?? 'text';
  positionPopover(byId('field-editor'), anchorRect, 292);
  byId('field-editor').hidden = false;
  requestAnimationFrame(() => byId('field-name-input').focus());
}

function saveField() {
  const name = byId('field-name-input').value.trim() || 'Untitled';
  const type = byId('field-type-select').value;
  if (openFieldIndex === null) {
    const id = uniqueFieldId(name);
    current().fields.push({ id, name, type, width: 160 });
    current().rows.forEach((row) => { row[id] = type === 'checkbox' ? false : ''; });
    bumpRevision(`Column “${name}” added`);
    closePopovers();
    return;
  }
  Object.assign(current().fields[openFieldIndex], { name, type });
  bumpRevision(`Field “${name}” saved`);
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
    const id = uniqueFieldId('Untitled');
    const insertAt = action === 'insert-left' ? index : index + 1;
    current().fields.splice(insertAt, 0, { id, name: 'Untitled', type: 'text', width: 150 });
    current().rows.forEach((row) => { row[id] = ''; });
    selection = { anchorRow: 0, anchorField: insertAt, focusRow: 0, focusField: insertAt };
    closePopovers();
    bumpRevision('Column inserted', () => beginInlineFieldRename(insertAt));
    return;
  }
  if (action === 'duplicate') {
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
  byId('row-menu-title').textContent = `Row ${index + 1}`;
  const menu = byId('row-menu');
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 235)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 190)}px`;
  menu.hidden = false;
}

function handleRowAction(action) {
  if (openRowIndex === null) return;
  const dataset = current();
  materializeRow(openRowIndex);
  if (action === 'insert-above' || action === 'insert-below') {
    const index = openRowIndex + (action === 'insert-below' ? 1 : 0);
    dataset.rows.splice(index, 0, emptyRow(dataset));
    bumpRevision('Row inserted');
  } else if (action === 'duplicate') {
    dataset.rows.splice(openRowIndex + 1, 0, { ...dataset.rows[openRowIndex] });
    bumpRevision('Row duplicated');
  } else if (action === 'delete') {
    dataset.rows.splice(openRowIndex, 1);
    bumpRevision('Row deleted');
  }
  closePopovers();
}

function addRecord() {
  const rowIndex = current().rows.length;
  current().rows.push(emptyRow(current()));
  selection = { anchorRow: rowIndex, anchorField: 0, focusRow: rowIndex, focusField: 0 };
  bumpRevision('Row added at the bottom', () => {
    const cell = document.querySelector(`.cell[data-row-index="${rowIndex}"][data-field-index="0"]`);
    cell?.scrollIntoView({ block: 'center', inline: 'nearest' });
    cell?.focus({ preventScroll: true });
  });
}

function emptyRow(dataset) {
  return Object.fromEntries(dataset.fields.map((field) => [field.id, field.type === 'checkbox' ? false : '']));
}

function nonEmptyRows(dataset = current()) {
  return dataset.rows.filter((row) => Object.values(row).some((value) => value !== '' && value !== false && value !== null && value !== undefined));
}

function renderBoard() {
  const dataset = current();
  const rowsWithData = nonEmptyRows(dataset);
  const statusField = dataset.fields.find((field) => field.id === 'status');
  if (!statusField) {
    byId('board-view').innerHTML = '<div class="board-shell"><div class="board-card"><strong>Add a Status field</strong><small>Board groups records by a single-select field.</small></div></div>';
    return;
  }
  const lanes = ['Todo', 'Doing', 'Blocked', 'Done'];
  byId('board-view').innerHTML = `<div class="board-shell">${lanes.map((lane) => {
    const rows = rowsWithData.filter((row) => row.status === lane);
    return `<section class="board-lane"><header class="board-lane-head"><strong>${lane}</strong><span>${rows.length}</span></header>${rows.map((row) => `<article class="board-card"><strong>${escapeHtml(row.task ?? row.feedback ?? row.topic ?? 'Untitled')}</strong><small>${escapeHtml(row.blocker || row.notes || row.category || 'No blocker')}</small><footer><span>${escapeHtml(row.area || row.category || row.channel || '')}</span><span>${escapeHtml(row.due || row.date || '')}</span></footer></article>`).join('')}</section>`;
  }).join('')}</div>`;
}

function renderCalendar() {
  const dataset = current();
  const datedRows = nonEmptyRows(dataset).filter((row) => row.due || row.date);
  const cells = Array.from({ length: 35 }, (_, index) => {
    const day = index + 1;
    const event = datedRows[index % Math.max(1, datedRows.length)];
    const showEvent = event && [2, 5, 8, 12, 15, 18, 23].includes(day);
    return `<div class="calendar-day"><span>${day}</span>${showEvent ? `<span class="calendar-event">${escapeHtml(event.task ?? event.topic ?? event.feedback ?? 'Record')}</span>` : ''}</div>`;
  }).join('');
  byId('calendar-view').innerHTML = `<div class="calendar-shell"><section class="calendar-main"><header class="calendar-head"><strong>August 2026</strong><span>Today · Month</span></header><div class="calendar-grid">${cells}</div></section><aside class="agenda"><strong>Next 7 days</strong>${datedRows.slice(0, 5).map((row) => `<div class="agenda-item"><small>${escapeHtml(row.due || row.date)}</small><span>${escapeHtml(row.task ?? row.topic ?? row.feedback ?? 'Record')}</span></div>`).join('')}</aside></div>`;
}

function renderChart() {
  const dataset = current();
  const rowsWithData = nonEmptyRows(dataset);
  const counts = new Map();
  rowsWithData.forEach((row) => {
    const key = String(row.status || row.category || row.channel || 'Other');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const max = Math.max(1, ...counts.values());
  const bars = [...counts.entries()].map(([label, value]) => `<div class="bar-item"><strong>${value}</strong><div class="bar" style="height:${Math.max(8, value / max * 78)}%"></div><span>${escapeHtml(label)}</span></div>`).join('');
  byId('chart-view').innerHTML = `<div class="chart-shell"><section class="chart-card"><header><strong>Records by ${dataset.fields.some((field) => field.id === 'status') ? 'Status' : 'Category'}</strong><small>${rowsWithData.length} records · live from ${escapeHtml(dataset.title)}.peaksheet</small></header><div class="bar-chart">${bars}</div></section><aside class="chart-config"><strong>Chart configuration</strong><label>Chart type<select><option>Bar</option><option>Line</option><option>Pie</option></select></label><label>Category<select><option>Status</option><option>Area</option><option>Priority</option></select></label><label>Value<select><option>Record count</option></select></label></aside></div>`;
}

function switchDataset(id) {
  if (!datasets[id]) return;
  activeDatasetId = id;
  openFieldIndex = null;
  openRowIndex = null;
  selection = { anchorRow: 0, anchorField: 0, focusRow: 0, focusField: 0 };
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

function bumpRevision(message, afterRender) {
  current().revision += 1;
  renderDocument();
  showToast(message);
  if (afterRender) requestAnimationFrame(afterRender);
}

function closePopovers() {
  document.querySelectorAll('.popover').forEach((popover) => { popover.hidden = true; });
  document.querySelectorAll('.field-menu-trigger.is-open').forEach((button) => button.classList.remove('is-open'));
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

function openAiDrawer() {
  byId('ai-drawer').hidden = false;
  syncAiContext();
  requestAnimationFrame(() => byId('ai-prompt').focus());
}

function closeAiDrawer() {
  clearAiTimers();
  byId('ask-ai-button').classList.remove('is-thinking');
  byId('ai-drawer').hidden = true;
}

function syncAiContext(label = rangeLabel(selectionBounds()), count = selectedCellCount()) {
  if (!byId('ai-selection-label')) return;
  byId('ai-selection-label').textContent = `${label} · ${count} selected ${count === 1 ? 'cell' : 'cells'}`;
  byId('ai-file-label').textContent = `${current().title}.peaksheet`;
  const formulaSuggestion = document.querySelector('[data-ai-mode="formula"]');
  const formulaAvailable = Boolean(generatedFormulaForCurrent());
  formulaSuggestion.disabled = !formulaAvailable;
  formulaSuggestion.title = formulaAvailable ? 'Generate a formula from Status and the date field' : 'This sheet needs Status and Date fields first';
}

function selectedCellCount() {
  const bounds = selectionBounds();
  return (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
}

function runAi() {
  const prompt = byId('ai-prompt').value.trim();
  if (!prompt) {
    byId('ai-prompt').focus();
    return;
  }
  const formulaRequested = /formula|days left|公式/i.test(prompt);
  if (formulaRequested && !generatedFormulaForCurrent()) {
    showToast('This sheet needs Status and Date fields before Peak can build Days left');
    return;
  }
  const formulaMode = formulaRequested;
  clearAiTimers();
  byId('ai-welcome').hidden = true;
  byId('ai-user-message').hidden = false;
  byId('ai-user-message').textContent = prompt;
  byId('ai-run-card').hidden = false;
  byId('ai-formula-card').hidden = true;
  byId('ai-summary-card').hidden = true;
  byId('ai-formula-code').textContent = '';
  byId('ai-formula-code').classList.remove('is-typing');
  byId('ai-formula-check-count').textContent = `${nonEmptyRows().length} rows checked`;
  byId('ask-ai-button').classList.add('is-thinking');
  setAiStep(0, 'Reading selected cells', 8);
  aiTimers.push(setTimeout(() => setAiStep(1, 'Mapping fields to a safe plan', 38), 650));
  aiTimers.push(setTimeout(() => setAiStep(2, formulaMode ? 'Writing and checking formula' : 'Checking the analysis against source rows', 72), 1320));
  aiTimers.push(setTimeout(() => finishAiRun(formulaMode), 1980));
}

function setAiStep(index, status, progress) {
  const ids = ['ai-step-read', 'ai-step-plan', 'ai-step-check'];
  ids.forEach((id, itemIndex) => {
    byId(id).classList.toggle('is-active', itemIndex === index);
    byId(id).classList.toggle('is-done', itemIndex < index);
  });
  byId('ai-run-status').textContent = status;
  byId('ai-run-count').textContent = `${index + 1} / 3`;
  byId('ai-progress-bar').style.width = `${progress}%`;
}

function finishAiRun(formulaMode) {
  ['ai-step-read', 'ai-step-plan', 'ai-step-check'].forEach((id) => {
    byId(id).classList.remove('is-active');
    byId(id).classList.add('is-done');
  });
  byId('ai-run-status').textContent = formulaMode ? 'Formula generated and checked' : `Analysis grounded in ${nonEmptyRows().length} source rows`;
  byId('ai-run-count').textContent = 'Done';
  byId('ai-progress-bar').style.width = '100%';
  byId('ask-ai-button').classList.remove('is-thinking');
  if (!formulaMode) {
    byId('ai-summary-card').hidden = false;
    return;
  }
  byId('ai-formula-card').hidden = false;
  typeFormula(generatedFormulaForCurrent());
}

function typeFormula(formula) {
  const code = byId('ai-formula-code');
  code.textContent = '';
  code.classList.add('is-typing');
  let index = 0;
  aiTypingTimer = setInterval(() => {
    index += 1;
    code.textContent = formula.slice(0, index);
    if (index < formula.length) return;
    clearInterval(aiTypingTimer);
    aiTypingTimer = null;
    code.classList.remove('is-typing');
  }, 18);
}

function clearAiTimers() {
  aiTimers.forEach(clearTimeout);
  aiTimers = [];
  if (aiTypingTimer) clearInterval(aiTypingTimer);
  aiTypingTimer = null;
}

function applyGeneratedFormula() {
  clearAiTimers();
  const formula = generatedFormulaForCurrent();
  if (!formula) {
    showToast('Add a Status and Date field before generating this formula');
    return;
  }
  let index = current().fields.findIndex((field) => field.id === 'days-left');
  if (index < 0) {
    current().fields.push({ id: 'days-left', name: 'Days left', type: 'formula', width: 96, formula });
    current().rows.forEach((row, rowIndex) => { row['days-left'] = GENERATED_VALUES[rowIndex] ?? ''; });
    index = current().fields.length - 1;
  }
  selection = { anchorRow: 0, anchorField: index, focusRow: Math.max(0, current().rows.length - 1), focusField: index };
  byId('ai-formula-card').hidden = true;
  bumpRevision('AI formula inserted · Undo is available', () => {
    const header = document.querySelector(`.field-head[data-field-index="${index}"]`);
    header?.classList.add('is-ai-new');
    header?.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

function generatedFormulaForCurrent() {
  const statusField = current().fields.find((field) => field.id === 'status');
  const dateField = current().fields.find((field) => field.type === 'date');
  if (!statusField || !dateField) return '';
  return `=IF([${statusField.name}]="Done","",MAX(0,DAYS([${dateField.name}],TODAY())))`;
}

function discardGeneratedFormula() {
  clearAiTimers();
  byId('ai-formula-card').hidden = true;
  byId('ai-run-card').hidden = true;
  byId('ai-user-message').hidden = true;
  byId('ai-welcome').hidden = false;
  byId('ai-prompt').value = '';
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
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

document.querySelectorAll('[data-dataset]').forEach((button) => button.addEventListener('click', () => switchDataset(button.dataset.dataset)));
document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[data-field-action]').forEach((button) => button.addEventListener('click', () => handleFieldAction(button.dataset.fieldAction)));
document.querySelectorAll('[data-row-action]').forEach((button) => button.addEventListener('click', () => handleRowAction(button.dataset.rowAction)));
document.querySelectorAll('.close-popover').forEach((button) => button.addEventListener('click', closePopovers));
document.querySelectorAll('[data-ai-prompt]').forEach((button) => button.addEventListener('click', () => {
  byId('ai-prompt').value = button.dataset.aiPrompt;
  runAi();
}));
byId('save-field').addEventListener('click', saveField);
byId('bottom-add-record').addEventListener('click', addRecord);
byId('toolbar-add-record').addEventListener('click', addRecord);
byId('sheet-title').addEventListener('change', renameDataset);
byId('sheet-title').addEventListener('blur', renameDataset);
byId('location-button').addEventListener('click', () => { byId('location-card').hidden = !byId('location-card').hidden; });
byId('ask-ai-button').addEventListener('click', openAiDrawer);
byId('close-ai').addEventListener('click', closeAiDrawer);
byId('ai-submit').addEventListener('click', runAi);
byId('ai-apply-formula').addEventListener('click', applyGeneratedFormula);
byId('ai-cancel-formula').addEventListener('click', discardGeneratedFormula);
byId('ai-prompt').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  runAi();
});
byId('table-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('#data-grid tbody tr').forEach((row) => { row.hidden = query && !row.textContent.toLowerCase().includes(query); });
});
document.addEventListener('pointerup', () => { draggingSelection = false; });
document.addEventListener('pointercancel', () => { draggingSelection = false; });
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.popover, .field-head-shell, .add-field-button, .row-index, .cell, #location-button, #location-card, .ai-drawer, #ask-ai-button')) return;
  closePopovers();
  byId('location-card').hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!byId('ai-drawer').hidden) {
    closeAiDrawer();
    return;
  }
  closePopovers();
});

renderDocument();
switchView('table');
