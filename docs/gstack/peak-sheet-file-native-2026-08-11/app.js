const MIN_GRID_ROWS = 64;
const MIN_GRID_COLUMNS = 30;
const GENERATED_VALUES = [1, 1, 2, 3, 4, '', 5, 7];
const FIELD_WIDTH_CONTRACT = {
  text: { default: 220, min: 160, max: 520 },
  link: { default: 200, min: 144, max: 520 },
  singleSelect: { default: 112, min: 104, max: 220 },
  checkbox: { default: 104, min: 96, max: 152 },
  date: { default: 108, min: 96, max: 180 },
  number: { default: 96, min: 84, max: 180 },
  file: { default: 180, min: 144, max: 360 },
  formula: { default: 120, min: 96, max: 260 },
  scriptOutput: { default: 140, min: 112, max: 280 },
};
const SCRIPT_LIBRARY = {
  normalize: { title: 'Normalize salary', saved: 'Saved locally · just now', summary: 'salary → parse currency → normalize → salary_number' },
  domain: { title: 'Extract company domain', saved: 'Saved locally · yesterday', summary: 'website → parse hostname → company_domain' },
  score: { title: 'Score opportunities', saved: 'Draft · not saved yet', summary: 'priority + status + selected signals → launch_score' },
};

const datasets = {
  launch: {
    title: 'Launch Tracker', folder: 'Product / Launch', revision: 18,
    fields: [
      { id: 'task', name: 'Task', type: 'text', width: 220 },
      { id: 'area', name: 'Area', type: 'singleSelect', width: 112 },
      { id: 'priority', name: 'Priority', type: 'singleSelect', width: 104 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 112 },
      { id: 'due', name: 'Due date', type: 'date', width: 108 },
      { id: 'blocker', name: 'Blocker', type: 'text', width: 190 },
      { id: 'owner', name: 'Owner', type: 'text', width: 104 },
      { id: 'notes', name: 'Notes', type: 'text', width: 220 },
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
      { id: 'user', name: 'User', type: 'text', width: 108 },
      { id: 'feedback', name: 'Feedback', type: 'text', width: 220 },
      { id: 'category', name: 'Category', type: 'singleSelect', width: 112 },
      { id: 'severity', name: 'Severity', type: 'singleSelect', width: 104 },
      { id: 'repro', name: 'Reproducible', type: 'checkbox', width: 112 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 112 },
      { id: 'task', name: 'Related task', type: 'link', width: 200 },
      { id: 'notes', name: 'Notes', type: 'text', width: 220 },
    ],
    rows: [
      { user: 'Beta 014', feedback: 'Search result opens the wrong preview tab', category: 'Search', severity: 'P0', repro: true, status: 'Doing', task: 'Verify AI Search provider routing', notes: 'Occurs after switching modes' },
      { user: 'Beta 008', feedback: 'Onboarding provider copy is unclear', category: 'Onboarding', severity: 'P1', repro: true, status: 'Todo', task: 'Finish onboarding empty states', notes: 'Needs plain-language outcome' },
      { user: 'Beta 021', feedback: 'Composer selection jumps with Chinese IME', category: 'Composer', severity: 'P0', repro: true, status: 'Blocked', task: 'Close Composer IME regression', notes: 'Video attached' },
      { user: 'Beta 003', feedback: 'Graph detail is much easier to understand now', category: 'Graph', severity: 'P2', repro: false, status: 'Done', task: '', notes: 'Positive signal' },
    ],
  },
  blank: {
    title: 'Blank Sheet', folder: 'Product / Launch', revision: 1,
    fields: [],
    rows: [],
  },
  content: {
    title: 'Launch Content', folder: 'Product / Launch / Marketing', revision: 12,
    fields: [
      { id: 'channel', name: 'Channel', type: 'singleSelect', width: 112 },
      { id: 'content', name: 'Content type', type: 'singleSelect', width: 124 },
      { id: 'topic', name: 'Topic', type: 'text', width: 250 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 112 },
      { id: 'date', name: 'Publish date', type: 'date', width: 108 },
      { id: 'link', name: 'Link', type: 'link', width: 200 },
      { id: 'result', name: 'Result', type: 'number', width: 96 },
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
let scriptTimer = null;
let rangeClipboard = '';
let gridState = { activeCell: { row: 2, field: 3 }, anchorRow: 2, anchorField: 3, focusRow: 2, focusField: 3, mode: 'navigation' };
let overlayState = { id: null, trigger: null };
let boardDragRowIndex = null;
let calendarCursor = new Date(2026, 7, 1);
let projectionFlashRowIndex = null;
let projectionFlashTimer = null;
let tableQuery = '';
let tableFilters = [];
let tableSorts = [];
let tableGroupFields = [];
let filterDraft = [];
let sortDraft = [];
let groupDraft = [];

const byId = (id) => document.getElementById(id);
const current = () => datasets[activeDatasetId];
const typeLabel = (type) => ({ text: 'Text', singleSelect: 'Single select', number: 'Number', date: 'Date', checkbox: 'Checkbox', link: 'Link', file: 'File', formula: 'Formula', scriptOutput: 'Script output' }[type] ?? type);

function widthContract(field) {
  return FIELD_WIDTH_CONTRACT[field?.type] ?? FIELD_WIDTH_CONTRACT.text;
}

function fieldWidth(field) {
  if (!field) return 160;
  const contract = widthContract(field);
  const width = field?.width ?? contract.default;
  return Math.max(contract.min, Math.min(contract.max, width));
}

function updateGridWidth() {
  const columns = Array.from({ length: visibleColumnCount() }, (_, index) => current().fields[index]);
  byId('grid-scroll').style.setProperty('--grid-width', `${92 + columns.reduce((total, field) => total + fieldWidth(field), 0)}px`);
}

function filePath(dataset = current()) {
  return `${dataset.folder.replaceAll(' / ', '/')}/${dataset.title}.peaksheet`;
}

function visibleRowCount(dataset = current()) {
  return Math.max(MIN_GRID_ROWS, dataset.rows.length + 1);
}

function visibleColumnCount(dataset = current()) {
  return Math.max(MIN_GRID_COLUMNS, dataset.fields.length + 1);
}

function renderDocument() {
  const dataset = current();
  clampSelection();
  byId('tab-name').textContent = dataset.title;
  byId('sheet-title').value = dataset.title;
  byId('file-folder').textContent = dataset.folder;
  byId('file-name').textContent = `${dataset.title}.peaksheet`;
  byId('file-status').textContent = filePath(dataset);
  byId('revision').textContent = dataset.revision;
  byId('record-count').textContent = dataset.rows.length;
  document.querySelectorAll('[data-dataset]').forEach((button) => button.classList.toggle('is-active', button.dataset.dataset === activeDatasetId));
  renderTable();
  renderBoard();
  renderCalendar();
  updateSelectionSummary();
}

function renderTable() {
  const dataset = current();
  const table = byId('data-grid');
  const materializedRows = dataset.rows.map((row, rowIndex) => ({ row, rowIndex }));
  const orderedRows = tableSorts.length
    ? [...materializedRows].sort((left, right) => compareRowsByRules(left.row, right.row, tableSorts))
    : materializedRows;
  const rows = tableGroupFields.length ? groupedTableRows(orderedRows) : orderedRows;
  while (rows.length < visibleRowCount(dataset)) rows.push({ row: undefined, rowIndex: rows.length });
  const columns = Array.from({ length: visibleColumnCount(dataset) }, (_, index) => dataset.fields[index]);
  updateGridWidth();
  const colgroup = `<colgroup><col style="width:48px">${columns.map((field) => `<col style="width:${fieldWidth(field)}px">`).join('')}<col style="width:44px"></colgroup>`;
  const head = `<thead><tr><th class="row-index"><button type="button" class="select-all-cells" id="select-all-cells" aria-label="Select all cells"></button></th>${columns.map((field, index) => `
    <th class="field-head${field ? '' : ' is-virtual'}" data-field-index="${index}">
      <div class="field-head-shell" data-field-index="${index}">
        <button type="button" class="field-select-button" data-field-index="${index}" title="Click to select · Double-click to name and structure"><span class="column-letter">${columnName(index)}</span><span class="field-title${field ? '' : ' is-general'}">${escapeHtml(field?.name ?? 'General')}</span><small>${escapeHtml(shortType(field?.type ?? 'text'))}</small></button>
        <button type="button" class="field-menu-trigger${openFieldIndex === index ? ' is-open' : ''}" data-field-index="${index}" data-overlay-trigger="${field ? 'field-menu' : 'field-editor'}" aria-haspopup="${field ? 'menu' : 'dialog'}" aria-controls="${field ? 'field-menu' : 'field-editor'}" aria-expanded="${openFieldIndex === index}" aria-label="Configure ${escapeHtml(field?.name ?? `Column ${columnName(index)}`)}"><svg><use href="#i-chevron"/></svg></button>${field ? `<span class="field-resize-handle" data-field-index="${index}" tabindex="0" role="separator" aria-orientation="vertical" aria-label="Resize ${escapeHtml(field.name)} column"></span>` : ''}
      </div>
    </th>`).join('')}<th class="add-field-head"><button type="button" class="add-field-button" id="inline-add-field" aria-label="Create typed field" title="Create Select, Formula, File, or another typed field"><svg><use href="#i-plus"/></svg></button></th></tr></thead>`;
  const body = `<tbody>${rows.map((entry, displayIndex) => {
    if (entry.kind === 'group') return `<tr class="grouped-row grouped-row-level-${entry.level}"><td colspan="${columns.length + 2}"><span>${escapeHtml(entry.label)}</span><small>${entry.count} records</small></td></tr>`;
    const { row, rowIndex } = entry;
    return `<tr class="${row ? '' : 'is-placeholder-row'}${rowIndex === projectionFlashRowIndex ? ' is-projection-flash' : ''}"${row && !tableGroupFields.length && !rowMatchesTableView(row) ? ' hidden' : ''}>
    <td class="row-index" data-row-index="${rowIndex}">${displayIndex + 1}</td>
    ${columns.map((field, fieldIndex) => `<td class="cell ${cellClass(field)}${field ? '' : ' is-virtual'}" data-row-index="${rowIndex}" data-field-index="${fieldIndex}" tabindex="0">${renderCell(field, field ? row?.[field.id] : undefined)}</td>`).join('')}
    <td></td>
  </tr>`;
  }).join('')}</tbody>`;
  table.innerHTML = `${colgroup}${head}${body}`;
  bindGridEvents();
  paintSelection();
  updateTableRecordCount();
}

function rowMatchesTableView(row) {
  if (!row) return true;
  const queryMatches = !tableQuery || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(tableQuery));
  if (!queryMatches) return false;
  return tableFilters.every(({ fieldId, value }) => String(row[fieldId] ?? '').toLowerCase().includes(value.toLowerCase()));
}

function groupedTableRows(rows) {
  const output = [];
  const previous = [];
  const matchingRows = rows.filter(({ row }) => rowMatchesTableView(row));
  matchingRows.forEach((entry) => {
    tableGroupFields.forEach((fieldId, level) => {
      const field = current().fields.find((candidate) => candidate.id === fieldId);
      const value = String(entry.row[fieldId] || 'Blank');
      if (previous[level] === value && previous.slice(0, level).every((parent, index) => parent === String(entry.row[tableGroupFields[index]] || 'Blank'))) return;
      previous.length = level + 1;
      previous[level] = value;
      const count = matchingRows.filter(({ row }) => tableGroupFields.slice(0, level + 1).every((id) => String(row[id] || 'Blank') === String(entry.row[id] || 'Blank'))).length;
      output.push({ kind: 'group', level, label: `${field?.name ?? 'Field'}: ${value}`, count });
    });
    output.push(entry);
  });
  return output;
}

function updateTableRecordCount() {
  const materialized = nonEmptyRows();
  const visible = materialized.filter(rowMatchesTableView).length;
  byId('record-count').textContent = String(tableQuery || tableFilters.length ? visible : materialized.length);
  byId('filter-button')?.classList.toggle('is-active', tableFilters.length > 0);
  byId('sort-button')?.classList.toggle('is-active', tableSorts.length > 0);
  byId('group-button')?.classList.toggle('is-active', tableGroupFields.length > 0);
}

function compareRowsByRules(left, right, rules) {
  for (const { fieldId, direction } of rules) {
    const field = current().fields.find((candidate) => candidate.id === fieldId);
    const leftValue = sortableValue(left[fieldId], field?.type);
    const rightValue = sortableValue(right[fieldId], field?.type);
    const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    if (compared !== 0) return direction === 'desc' ? -compared : compared;
  }
  return 0;
}

function renderCell(field, value) {
  if (!field) return '<span class="empty-cell-hint">empty</span>';
  if (field.type === 'checkbox') return value ? '<svg class="check-cell"><use href="#i-check"/></svg>' : '';
  if (value === undefined || value === null || value === '') return '<span class="empty-cell-hint">empty</span>';
  if (field.type === 'formula' || field.type === 'scriptOutput') return `<span class="calculated-cell">${escapeHtml(value)} <small>${field.id === 'days-left' ? 'days' : field.type === 'formula' ? 'ƒx' : 'script'}</small></span>`;
  if (field.id === 'status') return `<span class="tag ${statusClass(String(value))}">${escapeHtml(value)}</span>`;
  if (field.id === 'priority' || field.id === 'severity') return `<span class="priority ${String(value).toLowerCase()}">${escapeHtml(value)}</span>`;
  if (field.id === 'task' || field.id === 'feedback' || field.id === 'topic' || field.id === 'user') return `<span class="cell-primary">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function cellClass(field) {
  const classes = [];
  if (!field) return '';
  if (field.type === 'number' || field.type === 'formula' || field.type === 'scriptOutput') classes.push('cell-number');
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
  document.querySelectorAll('.field-resize-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => startFieldResize(event, Number(handle.dataset.fieldIndex), handle));
    handle.addEventListener('keydown', (event) => resizeFieldWithKeyboard(event, Number(handle.dataset.fieldIndex)));
  });
  document.querySelectorAll('.field-head-shell').forEach((header) => {
    header.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openFieldMenu(Number(header.dataset.fieldIndex), header);
    });
  });
  byId('inline-add-field')?.addEventListener('click', (event) => openFieldEditor(null, event.currentTarget));
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
    cell.addEventListener('paste', pasteIntoGrid);
  });
}

function startFieldResize(event, index, handle) {
  const field = current().fields[index];
  if (!field || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = fieldWidth(field);
  const contract = widthContract(field);
  handle.setPointerCapture?.(event.pointerId);
  handle.classList.add('is-active');
  byId('peak-sheet-root')?.classList.add('is-resizing');
  const move = (moveEvent) => {
    field.width = Math.max(contract.min, Math.min(contract.max, startWidth + moveEvent.clientX - startX));
    const column = byId('data-grid').querySelectorAll('col')[index + 1];
    if (column) column.style.width = `${field.width}px`;
    updateGridWidth();
  };
  const stop = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', stop);
    handle.classList.remove('is-active');
    byId('peak-sheet-root')?.classList.remove('is-resizing');
    showToast(`${field.name} width ${Math.round(field.width)}px`);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', stop, { once: true });
  document.addEventListener('pointercancel', stop, { once: true });
}

function resizeFieldWithKeyboard(event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const field = current().fields[index];
  if (!field) return;
  event.preventDefault();
  const contract = widthContract(field);
  const step = event.shiftKey ? 24 : 8;
  if (event.key === 'Home') field.width = contract.min;
  if (event.key === 'End') field.width = contract.max;
  if (event.key === 'ArrowLeft') field.width = Math.max(contract.min, fieldWidth(field) - step);
  if (event.key === 'ArrowRight') field.width = Math.min(contract.max, fieldWidth(field) + step);
  renderTable();
  document.querySelector(`.field-resize-handle[data-field-index="${index}"]`)?.focus();
  showToast(`${field.name} width ${Math.round(field.width)}px`);
}

function startCellSelection(event, cell) {
  if (event.button !== 0 || cell.contentEditable === 'true') return;
  event.preventDefault();
  draggingSelection = true;
  gridState.mode = 'selecting';
  const row = Number(cell.dataset.rowIndex);
  const field = Number(cell.dataset.fieldIndex);
  setSelection(row, field, event.shiftKey);
  cell.focus({ preventScroll: true });
}

function extendDraggedSelection(cell) {
  if (!draggingSelection) return;
  gridState.focusRow = Number(cell.dataset.rowIndex);
  gridState.focusField = Number(cell.dataset.fieldIndex);
  gridState.activeCell = { row: gridState.focusRow, field: gridState.focusField };
  paintSelection();
  updateSelectionSummary();
}

function handleCellKeydown(event, cell) {
  if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault();
    beginCellEdit(cell);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    clearSelectedRange();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && ['c', 'x'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    copySelectedRange(event.key.toLowerCase() === 'x');
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;
  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    beginCellEdit(cell, event.key);
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const field = Math.max(0, Math.min(visibleColumnCount() - 1, gridState.focusField + (event.shiftKey ? -1 : 1)));
    setSelection(gridState.focusRow, field);
    document.querySelector(`.cell[data-row-index="${gridState.focusRow}"][data-field-index="${field}"]`)?.focus({ preventScroll: true });
    return;
  }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  const row = Math.max(0, Math.min(visibleRowCount() - 1, gridState.focusRow + move[0]));
  const field = Math.max(0, Math.min(visibleColumnCount() - 1, gridState.focusField + move[1]));
  setSelection(row, field, event.shiftKey);
  document.querySelector(`.cell[data-row-index="${row}"][data-field-index="${field}"]`)?.focus({ preventScroll: true });
}

function setSelection(row, field, extend = false) {
  if (!extend) {
    gridState.anchorRow = row;
    gridState.anchorField = field;
  }
  gridState.focusRow = row;
  gridState.focusField = field;
  gridState.activeCell = { row, field };
  gridState.mode = 'navigation';
  paintSelection();
  updateSelectionSummary();
}

function selectionBounds() {
  return {
    top: Math.min(gridState.anchorRow, gridState.focusRow),
    bottom: Math.max(gridState.anchorRow, gridState.focusRow),
    left: Math.min(gridState.anchorField, gridState.focusField),
    right: Math.max(gridState.anchorField, gridState.focusField),
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
    if (row === gridState.focusRow && field === gridState.focusField) cell.classList.add('is-selected');
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
  const field = current().fields[gridState.focusField];
  const value = current().rows[gridState.focusRow]?.[field?.id] ?? '';
  byId('formula-input').value = field?.type === 'formula' ? field.formula : String(value);
  syncFormulaInputWidth();
  setFormulaShortcutVisible(false);
  syncAiContext(label, count);
}

function syncFormulaInputWidth() {
  const input = byId('formula-input');
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return;
  const style = window.getComputedStyle(input);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = Math.ceil(context.measureText(input.value || ' ').width + 20);
  const resolvedWidth = Math.max(108, Math.min(500, width));
  input.style.width = `${resolvedWidth}px`;
  input.parentElement?.style.setProperty('--formula-input-width', `${resolvedWidth}px`);
}

function setFormulaShortcutVisible(visible) {
  byId('formula-shortcut-badge').classList.toggle('is-visible', visible);
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

function clearSelectedRange() {
  const bounds = selectionBounds();
  let changed = 0;
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const record = current().rows[row];
    if (!record) continue;
    for (let fieldIndex = bounds.left; fieldIndex <= bounds.right; fieldIndex += 1) {
      const field = current().fields[fieldIndex];
      if (!field || field.type === 'formula' || field.type === 'scriptOutput') continue;
      record[field.id] = field.type === 'checkbox' ? false : '';
      changed += 1;
    }
  }
  if (!changed) {
    showToast('Nothing materialized in this range yet');
    return;
  }
  bumpRevision(`${changed} cells cleared`);
}

function copySelectedRange(cut = false) {
  const bounds = selectionBounds();
  const lines = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const values = [];
    for (let fieldIndex = bounds.left; fieldIndex <= bounds.right; fieldIndex += 1) {
      const field = current().fields[fieldIndex];
      values.push(field ? String(current().rows[row]?.[field.id] ?? '') : '');
    }
    lines.push(values.join('\t'));
  }
  rangeClipboard = lines.join('\n');
  navigator.clipboard?.writeText(rangeClipboard).catch(() => {});
  showToast(`${rangeLabel(bounds)} copied as TSV${cut ? ' and cleared' : ''}`);
  if (cut) clearSelectedRange();
}

function pasteIntoGrid(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || rangeClipboard;
  if (!text) return;
  const matrix = text.replace(/\r/g, '').split('\n').filter((line, index, lines) => line || index < lines.length - 1).map((line) => line.split('\t'));
  if (!matrix.length) return;
  const startRow = gridState.focusRow;
  const startField = gridState.focusField;
  const maxWidth = Math.max(...matrix.map((row) => row.length));
  materializeField(startField + maxWidth - 1);
  materializeRow(startRow + matrix.length - 1);
  matrix.forEach((values, rowOffset) => values.forEach((value, fieldOffset) => {
    const field = current().fields[startField + fieldOffset];
    if (field.type === 'formula' || field.type === 'scriptOutput') return;
    current().rows[startRow + rowOffset][field.id] = field.type === 'checkbox' ? /^(true|1|yes|✓)$/i.test(value) : value;
  }));
  gridState = { activeCell: { row: startRow, field: startField }, anchorRow: startRow, anchorField: startField, focusRow: startRow + matrix.length - 1, focusField: startField + maxWidth - 1, mode: 'navigation' };
  bumpRevision(`${matrix.length} × ${maxWidth} range pasted and materialized`);
}

function rangeLabel(bounds) {
  const start = `${columnName(bounds.left)}${bounds.top + 2}`;
  const end = `${columnName(bounds.right)}${bounds.bottom + 2}`;
  return start === end ? start : `${start}:${end}`;
}

function selectColumn(field) {
  gridState = { activeCell: { row: 0, field }, anchorRow: 0, anchorField: field, focusRow: visibleRowCount() - 1, focusField: field, mode: 'navigation' };
  paintSelection();
  updateSelectionSummary();
}

function selectRow(row) {
  gridState = { activeCell: { row, field: 0 }, anchorRow: row, anchorField: 0, focusRow: row, focusField: visibleColumnCount() - 1, mode: 'navigation' };
  paintSelection();
  updateSelectionSummary();
}

function selectAllCells() {
  gridState = { activeCell: { row: 0, field: 0 }, anchorRow: 0, anchorField: 0, focusRow: visibleRowCount() - 1, focusField: visibleColumnCount() - 1, mode: 'navigation' };
  paintSelection();
  updateSelectionSummary();
}

function clampSelection() {
  const maxRow = visibleRowCount() - 1;
  const maxField = visibleColumnCount() - 1;
  gridState.anchorRow = Math.min(gridState.anchorRow, maxRow);
  gridState.focusRow = Math.min(gridState.focusRow, maxRow);
  gridState.anchorField = Math.min(gridState.anchorField, maxField);
  gridState.focusField = Math.min(gridState.focusField, maxField);
  gridState.activeCell = { row: gridState.focusRow, field: gridState.focusField };
}

function beginCellEdit(cell, initialText = null) {
  const rowIndex = Number(cell.dataset.rowIndex);
  const fieldIndex = Number(cell.dataset.fieldIndex);
  const initialFieldCount = current().fields.length;
  const initialRowCount = current().rows.length;
  const field = materializeField(fieldIndex);
  setSelection(rowIndex, fieldIndex);
  if (field.type === 'formula' || field.type === 'scriptOutput') {
    showToast('Formula cells are calculated · edit the formula from Ask AI or the formula bar');
    return;
  }
  materializeRow(rowIndex);
  if (field.type === 'checkbox') {
    current().rows[rowIndex][field.id] = !current().rows[rowIndex][field.id];
    bumpRevision('Checkbox updated');
    return;
  }
  const originalValue = String(current().rows[rowIndex][field.id] ?? '');
  cell.textContent = initialText === null ? originalValue : initialText;
  cell.contentEditable = 'true';
  gridState.mode = 'editing';
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  if (initialText !== null) range.collapse(false);
  const nativeSelection = window.getSelection();
  nativeSelection.removeAllRanges();
  nativeSelection.addRange(range);
  let finished = false;
  const finish = (commit = true, move = null) => {
    if (finished) return;
    finished = true;
    if (!commit) {
      current().rows[rowIndex][field.id] = originalValue;
      rollbackVirtualFields(initialFieldCount);
      current().rows.splice(initialRowCount);
    } else {
      current().rows[rowIndex][field.id] = cell.textContent.trim();
    }
    cell.contentEditable = 'false';
    gridState.mode = 'navigation';
    if (move) {
      const nextRow = Math.max(0, Math.min(visibleRowCount() - 1, rowIndex + move[0]));
      const nextField = Math.max(0, Math.min(visibleColumnCount() - 1, fieldIndex + move[1]));
      gridState = { activeCell: { row: nextRow, field: nextField }, anchorRow: nextRow, anchorField: nextField, focusRow: nextRow, focusField: nextField, mode: 'navigation' };
    }
    if (!commit) {
      renderDocument();
      showToast('Edit cancelled');
      return;
    }
    bumpRevision(initialFieldCount <= fieldIndex ? `Column ${columnName(fieldIndex)} and row ${rowIndex + 1} materialized` : 'Cell updated', () => {
      const target = document.querySelector(`.cell[data-row-index="${gridState.focusRow}"][data-field-index="${gridState.focusField}"]`);
      target?.focus({ preventScroll: true });
    });
  };
  cell.addEventListener('blur', () => finish(true), { once: true });
  cell.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true, [1, 0]);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      finish(true, [0, event.shiftKey ? -1 : 1]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
}

function materializeRow(rowIndex) {
  while (current().rows.length <= rowIndex) current().rows.push(emptyRow(current()));
}

function materializeField(fieldIndex) {
  while (current().fields.length <= fieldIndex) {
    const nextIndex = current().fields.length;
    const name = `Column ${columnName(nextIndex)}`;
    const id = uniqueFieldId(name);
    current().fields.push({ id, name, type: 'text', width: FIELD_WIDTH_CONTRACT.text.default });
    current().rows.forEach((row) => { row[id] = ''; });
  }
  return current().fields[fieldIndex];
}

function rollbackVirtualFields(initialFieldCount) {
  while (current().fields.length > initialFieldCount) {
    const removed = current().fields.pop();
    current().rows.forEach((row) => { delete row[removed.id]; });
  }
}

function beginInlineFieldRename(index) {
  const button = document.querySelector(`.field-select-button[data-field-index="${index}"]`);
  const existingField = current().fields[index];
  if (!button) return;
  const input = document.createElement('input');
  input.className = 'field-name-input';
  input.value = existingField?.name ?? '';
  input.placeholder = `Name column ${columnName(index)}`;
  input.setAttribute('aria-label', 'Column name');
  button.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const nextName = input.value.trim();
    if (!commit || !nextName || nextName === existingField?.name) {
      renderTable();
      updateSelectionSummary();
      return;
    }
    const field = materializeField(index);
    field.name = nextName;
    bumpRevision(existingField ? `Column renamed to “${nextName}”` : `Typed field “${nextName}” materialized`);
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
  if (!current().fields[index]) {
    openFieldEditor(index, anchor);
    return;
  }
  const field = current().fields[index];
  openOverlay('field-menu', anchor, () => {
    openFieldIndex = index;
    byId('field-menu-name').textContent = field.name;
    byId('field-menu-type').textContent = typeLabel(field.type);
    positionPopover(byId('field-menu'), anchor.getBoundingClientRect(), 230);
    anchor.classList.add('is-open');
  });
}

function openFieldEditor(index, anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  const field = index === null ? null : current().fields[index];
  openOverlay('field-editor', anchor, () => {
    openFieldIndex = index;
    byId('field-editor-title').textContent = field ? `Edit “${field.name}”` : index === null ? 'Create typed field' : `Structure column ${columnName(index)}`;
    byId('field-name-input').value = field?.name ?? '';
    byId('field-type-select').value = field?.type ?? 'text';
    positionPopover(byId('field-editor'), anchorRect, 292);
  }, 'field-name-input');
}

function saveField() {
  const name = byId('field-name-input').value.trim() || (openFieldIndex === null ? 'Untitled' : `Column ${columnName(openFieldIndex)}`);
  const type = byId('field-type-select').value;
  if (openFieldIndex === null) {
    const id = uniqueFieldId(name);
    current().fields.push({ id, name, type, width: widthContract({ type }).default });
    current().rows.forEach((row) => { row[id] = type === 'checkbox' ? false : ''; });
    bumpRevision(`Column “${name}” added`);
    closePopovers();
    return;
  }
  Object.assign(materializeField(openFieldIndex), { name, type });
  bumpRevision(`Field “${name}” saved`);
  closeOverlay({ restoreFocus: false });
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
    current().fields.splice(insertAt, 0, { id, name: 'Untitled', type: 'text', width: FIELD_WIDTH_CONTRACT.text.default });
    current().rows.forEach((row) => { row[id] = ''; });
    gridState = { activeCell: { row: 0, field: insertAt }, anchorRow: 0, anchorField: insertAt, focusRow: 0, focusField: insertAt, mode: 'navigation' };
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
  const anchor = event.currentTarget;
  openOverlay('row-menu', anchor, () => {
    openRowIndex = index;
    byId('row-menu-title').textContent = `Row ${index + 1}`;
    positionPopover(byId('row-menu'), { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY }, 230);
  });
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
  const row = emptyRow(current());
  const primaryField = current().fields.find((field) => ['task', 'feedback', 'topic'].includes(field.id));
  const statusField = current().fields.find((field) => field.id === 'status');
  const dateField = current().fields.find((field) => field.type === 'date');
  if (primaryField) row[primaryField.id] = 'Untitled record';
  if (statusField) row[statusField.id] = 'Todo';
  if (activeView === 'calendar' && dateField) row[dateField.id] = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(calendarCursor);
  current().rows.push(row);
  gridState = { activeCell: { row: rowIndex, field: 0 }, anchorRow: rowIndex, anchorField: 0, focusRow: rowIndex, focusField: 0, mode: 'navigation' };
  bumpRevision('Row added at the bottom', () => {
    if (activeView !== 'table') return;
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
  const statusField = dataset.fields.find((field) => field.id === 'status');
  if (!statusField) {
    byId('board-view').innerHTML = '<div class="board-shell"><div class="board-card"><strong>Add a Status field</strong><small>Board groups records by a single-select field.</small></div></div>';
    return;
  }
  const lanes = ['Todo', 'Doing', 'Blocked', 'Done'];
  const rowsWithData = dataset.rows.map((row, index) => ({ row, index })).filter(({ row }) => Object.values(row).some((value) => value !== '' && value !== false && value !== null && value !== undefined));
  byId('board-view').innerHTML = `<div class="board-shell" aria-label="Status board for ${escapeHtml(dataset.title)}">${lanes.map((lane) => {
    const rows = rowsWithData.filter(({ row }) => row[statusField.id] === lane);
    return `<section class="board-lane" data-status="${lane}"><header class="board-lane-head"><span><strong>${lane}</strong><small>${statusField.name}</small></span><span>${rows.length}</span></header><div class="board-lane-body" data-status="${lane}" aria-label="Drop records into ${lane}">${rows.map(({ row, index }) => `<article class="board-card" draggable="true" data-row-index="${index}" tabindex="0"><strong>${escapeHtml(row.task ?? row.feedback ?? row.topic ?? 'Untitled')}</strong><small>${escapeHtml(row.blocker || row.notes || row.category || 'No details')}</small><footer><span>${escapeHtml(row.area || row.category || row.channel || '')}</span><span>${escapeHtml(row.due || row.date || '')}</span></footer></article>`).join('')}<span class="board-drop-hint">Drop here</span></div></section>`;
  }).join('')}</div>`;
  bindBoardEvents();
}

function bindBoardEvents() {
  document.querySelectorAll('.board-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      boardDragRowIndex = Number(card.dataset.rowIndex);
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.rowIndex);
    });
    card.addEventListener('dragend', () => {
      boardDragRowIndex = null;
      document.querySelectorAll('.board-lane-body.is-drop-target').forEach((lane) => lane.classList.remove('is-drop-target'));
      document.querySelectorAll('.board-card.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
    });
    card.addEventListener('click', () => openRecordFromProjection(Number(card.dataset.rowIndex)));
  });
  document.querySelectorAll('.board-lane-body').forEach((lane) => {
    lane.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      lane.classList.add('is-drop-target');
    });
    lane.addEventListener('dragleave', (event) => {
      if (lane.contains(event.relatedTarget)) return;
      lane.classList.remove('is-drop-target');
    });
    lane.addEventListener('drop', (event) => {
      event.preventDefault();
      lane.classList.remove('is-drop-target');
      moveBoardRecord(Number(event.dataTransfer.getData('text/plain') || boardDragRowIndex), lane.dataset.status);
    });
  });
}

function moveBoardRecord(rowIndex, status) {
  const statusField = current().fields.find((field) => field.id === 'status');
  const row = current().rows[rowIndex];
  if (!statusField || !row || row[statusField.id] === status) return;
  row[statusField.id] = status;
  bumpRevision(`Moved “${row.task ?? row.feedback ?? row.topic ?? 'Record'}” to ${status}`);
}

function openRecordFromProjection(rowIndex) {
  const taskFieldIndex = Math.max(0, current().fields.findIndex((field) => ['task', 'feedback', 'topic', 'user'].includes(field.id)));
  if (!rowMatchesTableView(current().rows[rowIndex])) {
    tableQuery = '';
    tableFilters = [];
    byId('table-search').value = '';
  }
  gridState = { activeCell: { row: rowIndex, field: taskFieldIndex }, anchorRow: rowIndex, anchorField: taskFieldIndex, focusRow: rowIndex, focusField: taskFieldIndex, mode: 'navigation' };
  projectionFlashRowIndex = rowIndex;
  clearTimeout(projectionFlashTimer);
  switchView('table');
  renderTable();
  updateSelectionSummary();
  requestAnimationFrame(() => {
    const cell = document.querySelector(`.cell[data-row-index="${rowIndex}"][data-field-index="${taskFieldIndex}"]`);
    cell?.scrollIntoView({ block: 'center', inline: 'nearest' });
    cell?.focus({ preventScroll: true });
  });
  projectionFlashTimer = setTimeout(() => {
    projectionFlashRowIndex = null;
    document.querySelector('#data-grid tbody tr.is-projection-flash')?.classList.remove('is-projection-flash');
  }, 1500);
  showToast('Opened the same record in Table view');
}

function renderCalendar() {
  const dataset = current();
  const dateField = dataset.fields.find((field) => field.type === 'date');
  if (!dateField) {
    byId('calendar-view').innerHTML = '<div class="calendar-empty"><strong>Add a Date field</strong><small>Calendar is a view of the same records, placed by one date field.</small></div>';
    return;
  }
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarCursor);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rowsByDay = new Map();
  dataset.rows.forEach((row, index) => {
    const date = parseSheetDate(row[dateField.id]);
    if (!date || date.getFullYear() !== year || date.getMonth() !== month) return;
    const items = rowsByDay.get(date.getDate()) ?? [];
    items.push({ row, index });
    rowsByDay.set(date.getDate(), items);
  });
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return '<div class="calendar-day is-outside"></div>';
    const records = rowsByDay.get(day) ?? [];
    return `<div class="calendar-day" data-calendar-day="${day}"><span>${day}</span>${records.slice(0, 3).map(({ row, index: rowIndex }) => `<button type="button" class="calendar-event" data-row-index="${rowIndex}">${escapeHtml(row.task ?? row.topic ?? row.feedback ?? 'Untitled')}</button>`).join('')}${records.length > 3 ? `<button type="button" class="calendar-more" data-calendar-day="${day}">+${records.length - 3} more</button>` : ''}</div>`;
  }).join('');
  const upcoming = [...rowsByDay.entries()].flatMap(([, rows]) => rows).slice(0, 5);
  byId('calendar-view').innerHTML = `<div class="calendar-shell"><section class="calendar-main"><header class="calendar-head"><strong>${monthLabel}</strong><div class="calendar-controls"><button type="button" class="calendar-icon-button" data-calendar-action="previous" aria-label="Previous month">‹</button><button type="button" class="calendar-today-button" data-calendar-action="today">Today</button><button type="button" class="calendar-icon-button" data-calendar-action="next" aria-label="Next month">›</button><span class="calendar-view-label">Month</span><button type="button" class="calendar-new-button" data-calendar-action="new"><svg><use href="#i-plus"/></svg>New</button></div></header><div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="calendar-grid">${cells}</div></section><aside class="agenda"><header><strong>Upcoming</strong><small>${dateField.name}</small></header>${upcoming.length ? upcoming.map(({ row, index }) => `<button type="button" class="agenda-item" data-row-index="${index}"><small>${escapeHtml(row[dateField.id])}</small><span>${escapeHtml(row.task ?? row.topic ?? row.feedback ?? 'Untitled')}</span></button>`).join('') : '<div class="agenda-empty">No records in this month</div>'}</aside></div>`;
  bindCalendarEvents();
}

function parseSheetDate(value) {
  if (!value) return null;
  const match = String(value).match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (!match) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months.indexOf(match[1]);
  return month < 0 ? null : new Date(2026, month, Number(match[2]));
}

function bindCalendarEvents() {
  document.querySelectorAll('[data-calendar-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.calendarAction === 'previous') calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    if (button.dataset.calendarAction === 'next') calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    if (button.dataset.calendarAction === 'today') calendarCursor = new Date(2026, 7, 1);
    if (button.dataset.calendarAction === 'new') addRecord();
    renderCalendar();
  }));
  document.querySelectorAll('.calendar-event, .agenda-item').forEach((item) => item.addEventListener('click', () => openRecordFromProjection(Number(item.dataset.rowIndex))));
}

function switchDataset(id) {
  if (!datasets[id]) return;
  activeDatasetId = id;
  openFieldIndex = null;
  openRowIndex = null;
  gridState = { activeCell: { row: 0, field: 0 }, anchorRow: 0, anchorField: 0, focusRow: 0, focusField: 0, mode: 'navigation' };
  closeOverlay({ restoreFocus: false });
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

function openOverlay(id, trigger, configure, focusTargetId = '') {
  if (overlayState.id === id && overlayState.trigger === trigger) {
    closeOverlay({ restoreFocus: false });
    return false;
  }
  closeOverlay({ restoreFocus: false });
  const overlay = byId(id);
  overlay.hidden = false;
  overlayState = { id, trigger };
  trigger?.setAttribute('aria-expanded', 'true');
  configure?.();
  if (focusTargetId) requestAnimationFrame(() => byId(focusTargetId)?.focus());
  return true;
}

function closeOverlay({ restoreFocus = true } = {}) {
  if (!overlayState.id) return;
  const { id, trigger } = overlayState;
  if (id === 'ai-drawer') clearAiTimers();
  if (id === 'ai-drawer') byId('ask-ai-button').classList.remove('is-thinking');
  if (id === 'scripts-drawer' && scriptTimer) clearInterval(scriptTimer);
  if (id === 'scripts-drawer') scriptTimer = null;
  byId(id).hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.field-menu-trigger.is-open').forEach((button) => button.classList.remove('is-open'));
  overlayState = { id: null, trigger: null };
  openFieldIndex = null;
  openRowIndex = null;
  if (restoreFocus && trigger?.isConnected && trigger.getClientRects().length) requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
}

function closePopovers(options) {
  if (['field-menu', 'field-editor', 'group-menu', 'row-menu', 'filter-menu', 'sort-menu'].includes(overlayState.id)) closeOverlay(options);
}

function positionPopover(popover, rect, width) {
  const margin = 8;
  const height = popover.getBoundingClientRect().height || 260;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  const below = rect.bottom + 6;
  const above = rect.top - height - 6;
  const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, above);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function openScriptsDrawer() {
  openOverlay('scripts-drawer', byId('scripts-button'), () => {
    byId('script-selection-count').textContent = `${selectedCellCount()} ${selectedCellCount() === 1 ? 'cell' : 'cells'}`;
    const rowCount = nonEmptyRows().length;
    byId('script-view-count').textContent = `${rowCount} rows`;
    byId('script-all-count').textContent = `${rowCount} rows`;
  });
}

function closeScriptsDrawer() {
  if (overlayState.id === 'scripts-drawer') closeOverlay();
}

function previewScript() {
  const total = nonEmptyRows().length;
  if (!total) {
    showToast('Materialize at least one row before previewing a script');
    return;
  }
  const unchanged = Math.min(3, Math.floor(total / 3));
  byId('script-preview-changed').textContent = String(total - unchanged);
  byId('script-preview-unchanged').textContent = String(unchanged);
  byId('script-preview').hidden = false;
  byId('script-progress').hidden = true;
  showToast('Preview ready · the local file is unchanged');
}

function runScript() {
  if (scriptTimer) clearInterval(scriptTimer);
  const total = nonEmptyRows().length;
  if (!total) {
    showToast('Materialize at least one row before running a script');
    return;
  }
  const unchanged = Math.min(3, Math.floor(total / 3));
  const changed = total - unchanged;
  byId('script-preview').hidden = true;
  byId('script-progress').hidden = false;
  byId('latest-script-run').hidden = true;
  let completed = 0;
  scriptTimer = setInterval(() => {
    completed = Math.min(total, completed + Math.max(1, Math.ceil(total / 18)));
    const percent = Math.round(completed / total * 100);
    byId('script-progress-label').textContent = `Running ${completed} / ${total}`;
    byId('script-progress-percent').textContent = `${percent}%`;
    byId('script-progress-bar').style.width = `${percent}%`;
    byId('script-progress-detail').textContent = completed < total ? `${Math.min(changed, Math.round(completed * changed / total))} changed · checking locally…` : `${changed} changed · ${unchanged} unchanged · 0 failed`;
    if (completed < total) return;
    clearInterval(scriptTimer);
    scriptTimer = null;
    byId('latest-script-result').textContent = `${changed} changed · ${unchanged} unchanged · 0 failed`;
    byId('latest-script-run').hidden = false;
    showToast('Local script complete · history saved in this sheet');
  }, 70);
}

function openPeakShare(trigger = byId('share-button')) {
  openOverlay('peakshare-card', trigger);
}

function closePeakShare() {
  if (overlayState.id === 'peakshare-card') closeOverlay();
}

function openGroupMenu(anchor) {
  openOverlay('group-menu', anchor, () => {
    groupDraft = [...tableGroupFields];
    if (!groupDraft.length && current().fields.length) groupDraft = [(current().fields.find((field) => field.id === 'status') ?? current().fields[0]).id];
    renderGroupRules();
    renderGroupPreview();
    positionPopover(byId('group-menu'), anchor.getBoundingClientRect(), 286);
  });
}

function fieldOptions(selectedId = '') {
  return current().fields.map((field) => `<option value="${escapeHtml(field.id)}"${field.id === selectedId ? ' selected' : ''}>${escapeHtml(field.name)}</option>`).join('');
}

function fieldValueOptions(fieldId, selectedValue = '') {
  const values = [...new Set(nonEmptyRows().map((row) => String(row[fieldId] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return `<option value="">Choose value</option>${values.map((value) => `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
}

function openFilterMenu(anchor) {
  if (!current().fields.length) {
    showToast('Add a field before filtering this view');
    return;
  }
  openOverlay('filter-menu', anchor, () => {
    filterDraft = tableFilters.map((rule) => ({ ...rule }));
    if (!filterDraft.length) filterDraft = [{ fieldId: current().fields[0].id, value: '' }];
    renderFilterRules();
    positionPopover(byId('filter-menu'), anchor.getBoundingClientRect(), 286);
  });
}

function renderFilterRules() {
  byId('filter-rules').innerHTML = filterDraft.map((rule, index) => `<div class="rule-row" data-rule-index="${index}"><select class="filter-rule-field" aria-label="Filter field">${fieldOptions(rule.fieldId)}</select><select class="filter-rule-value" aria-label="Filter value">${fieldValueOptions(rule.fieldId, rule.value)}</select><button type="button" class="remove-rule" data-remove-filter="${index}" aria-label="Remove filter">×</button></div>`).join('');
}

function applyTableFilter() {
  tableFilters = filterDraft.filter((rule) => rule.fieldId && rule.value);
  renderTable();
  closePopovers();
  showToast(tableFilters.length ? `${tableFilters.length} filters applied with AND` : 'Filter cleared');
}

function openSortMenu(anchor) {
  if (!current().fields.length) {
    showToast('Add a field before sorting this view');
    return;
  }
  openOverlay('sort-menu', anchor, () => {
    sortDraft = tableSorts.map((rule) => ({ ...rule }));
    if (!sortDraft.length) sortDraft = [{ fieldId: current().fields[0].id, direction: 'asc' }];
    renderSortRules();
    positionPopover(byId('sort-menu'), anchor.getBoundingClientRect(), 286);
  });
}

function renderSortRules() {
  byId('sort-rules').innerHTML = sortDraft.map((rule, index) => `<div class="rule-row" data-rule-index="${index}"><select class="sort-rule-field" aria-label="Sort field">${fieldOptions(rule.fieldId)}</select><select class="sort-rule-direction" aria-label="Sort order"><option value="asc"${rule.direction === 'asc' ? ' selected' : ''}>A → Z</option><option value="desc"${rule.direction === 'desc' ? ' selected' : ''}>Z → A</option></select><button type="button" class="remove-rule" data-remove-sort="${index}" aria-label="Remove sort">×</button></div>`).join('');
}

function sortableValue(value, type) {
  if (type === 'date') return parseSheetDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (type === 'number') return Number(value) || 0;
  if (type === 'checkbox') return value ? 1 : 0;
  return String(value ?? '');
}

function applyTableSort() {
  tableSorts = sortDraft.filter((rule) => rule.fieldId);
  renderTable();
  closePopovers();
  showToast(tableSorts.length ? `${tableSorts.length} sort rules applied in order` : 'Sort cleared');
}

function renderGroupPreview() {
  const fields = groupDraft.map((fieldId) => current().fields.find((field) => field.id === fieldId)).filter(Boolean);
  const counts = new Map();
  nonEmptyRows().forEach((row) => {
    const label = fields.map((field) => String(row[field.id] || 'Blank')).join(' · ');
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const entries = [...counts.entries()].slice(0, 6);
  byId('group-preview').innerHTML = entries.length ? entries.map(([label, count]) => `<span>${escapeHtml(label)} <b>${count}</b></span>`).join('') : '<span>No materialized rows <b>0</b></span>';
}

function renderGroupRules() {
  byId('group-rules').innerHTML = groupDraft.map((fieldId, index) => `<div class="rule-row" data-rule-index="${index}"><select class="group-rule-field" aria-label="Group field">${fieldOptions(fieldId)}</select><span class="rule-order">${index + 1}</span><button type="button" class="remove-rule" data-remove-group="${index}" aria-label="Remove group field">×</button></div>`).join('');
}

function openAiDrawer() {
  // Opening AI must preserve the user's grid viewport; focus moves to the composer only on explicit user intent.
  openOverlay('ai-drawer', byId('ask-ai-button'), syncAiContext);
}

function closeAiDrawer() {
  byId('ask-ai-button').classList.remove('is-thinking');
  if (overlayState.id === 'ai-drawer') closeOverlay();
}

function syncAiContext(label = rangeLabel(selectionBounds()), count = selectedCellCount()) {
  if (!byId('ai-selection-label')) return;
  byId('ai-selection-label').textContent = `${label} · ${count} selected ${count === 1 ? 'cell' : 'cells'}`;
  byId('ai-file-label').textContent = `${current().title}.peaksheet`;
  const formulaSuggestion = document.querySelector('[data-ai-mode="formula"]');
  const formulaAvailable = Boolean(generatedFormulaForCurrent());
  formulaSuggestion.disabled = !formulaAvailable;
  formulaSuggestion.title = formulaAvailable ? 'Generate a formula from Status and the date field' : 'This sheet needs Status and Date fields first';
  const activeField = current().fields[gridState.focusField];
  document.querySelectorAll('[data-ai-mode="explain"], [data-ai-mode="fix"]').forEach((button) => {
    button.disabled = activeField?.type !== 'formula';
    button.title = activeField?.type === 'formula' ? 'Use the active formula cell' : 'Select a formula cell first';
  });
  byId('script-selection-count').textContent = `${count} ${count === 1 ? 'cell' : 'cells'}`;
}

function selectedCellCount() {
  const bounds = selectionBounds();
  return (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
}

function runAi(modeOverride = '') {
  const prompt = byId('ai-prompt').value.trim();
  if (!prompt) {
    byId('ai-prompt').focus();
    return;
  }
  const aiMode = modeOverride || (/explain/i.test(prompt) ? 'explain' : /fix|repair/i.test(prompt) ? 'fix' : /formula|days left|公式/i.test(prompt) ? 'formula' : 'analysis');
  const activeFormula = current().fields[gridState.focusField]?.formula;
  if (aiMode === 'formula' && !generatedFormulaForCurrent()) {
    showToast('This sheet needs Status and Date fields before Peak can build Days left');
    return;
  }
  if (['explain', 'fix'].includes(aiMode) && !activeFormula) {
    showToast('Select a formula cell first');
    return;
  }
  const formulaMode = aiMode !== 'analysis';
  clearAiTimers();
  byId('ai-welcome').hidden = true;
  byId('ai-user-message').hidden = false;
  byId('ai-user-message').textContent = prompt;
  byId('ai-run-card').hidden = false;
  byId('ai-formula-card').hidden = true;
  byId('ai-summary-card').hidden = true;
  byId('ai-formula-code').textContent = '';
  byId('ai-formula-code').classList.remove('is-typing');
  byId('ai-formula-explanation').hidden = true;
  byId('ai-formula-check-count').textContent = `${nonEmptyRows().length} rows checked`;
  byId('ask-ai-button').classList.add('is-thinking');
  setAiStep(0, 'Reading selected cells', 8);
  aiTimers.push(setTimeout(() => setAiStep(1, 'Mapping fields to a safe plan', 38), 650));
  aiTimers.push(setTimeout(() => setAiStep(2, formulaMode ? 'Writing and checking formula' : 'Checking the analysis against source rows', 72), 1320));
  aiTimers.push(setTimeout(() => finishAiRun(aiMode), 1980));
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

function finishAiRun(aiMode) {
  const formulaMode = aiMode !== 'analysis';
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
  byId('ai-apply-formula').hidden = aiMode !== 'formula';
  byId('ai-cancel-formula').textContent = aiMode === 'formula' ? 'Discard' : 'Close';
  const formula = aiMode === 'formula' ? generatedFormulaForCurrent() : current().fields[gridState.focusField]?.formula;
  typeFormula(formula);
  if (aiMode === 'explain') byId('ai-formula-explanation').hidden = false;
  if (aiMode === 'fix') {
    byId('ai-formula-explanation').textContent = 'No invalid references found. Peak normalized the date guard and preserved blank completed rows.';
    byId('ai-formula-explanation').hidden = false;
  }
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
  gridState = { activeCell: { row: 0, field: index }, anchorRow: 0, anchorField: index, focusRow: Math.max(0, current().rows.length - 1), focusField: index, mode: 'navigation' };
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
  runAi(button.dataset.aiMode ?? '');
}));
document.querySelectorAll('.open-peakshare').forEach((button) => button.addEventListener('click', () => openPeakShare()));
document.querySelectorAll('.saved-script').forEach((button) => button.addEventListener('click', () => {
  const script = SCRIPT_LIBRARY[button.dataset.script];
  document.querySelectorAll('.saved-script').forEach((candidate) => candidate.classList.toggle('is-active', candidate === button));
  byId('script-title').textContent = script.title;
  byId('script-saved-state').textContent = script.saved;
  byId('script-summary-code').textContent = script.summary;
  byId('script-preview').hidden = true;
  byId('script-progress').hidden = true;
}));
byId('save-field').addEventListener('click', saveField);
byId('typed-field-button').addEventListener('click', (event) => openFieldEditor(null, event.currentTarget));
byId('sheet-title').addEventListener('change', renameDataset);
byId('sheet-title').addEventListener('blur', renameDataset);
byId('share-button').addEventListener('click', (event) => openPeakShare(event.currentTarget));
byId('close-peakshare').addEventListener('click', closePeakShare);
byId('cancel-peakshare').addEventListener('click', closePeakShare);
byId('continue-peakshare').addEventListener('click', () => { closePeakShare(); showToast('PeakShare handoff preview · the local file remains unchanged'); });
byId('scripts-button').addEventListener('click', openScriptsDrawer);
byId('close-scripts').addEventListener('click', closeScriptsDrawer);
byId('preview-script').addEventListener('click', previewScript);
byId('run-script').addEventListener('click', runScript);
byId('save-script').addEventListener('click', () => showToast('Script saved locally in this .peaksheet'));
byId('edit-script').addEventListener('click', () => showToast('Script editor opens in the next local step'));
byId('new-script').addEventListener('click', () => showToast('New local script draft created'));
byId('add-record').addEventListener('click', addRecord);
byId('filter-button').addEventListener('click', (event) => openFilterMenu(event.currentTarget));
byId('sort-button').addEventListener('click', (event) => openSortMenu(event.currentTarget));
byId('add-filter-rule').addEventListener('click', () => {
  filterDraft.push({ fieldId: current().fields[filterDraft.length % current().fields.length]?.id ?? '', value: '' });
  renderFilterRules();
});
byId('filter-rules').addEventListener('change', (event) => {
  const index = Number(event.target.closest('.rule-row')?.dataset.ruleIndex);
  if (!Number.isInteger(index)) return;
  if (event.target.matches('.filter-rule-field')) filterDraft[index] = { fieldId: event.target.value, value: '' };
  if (event.target.matches('.filter-rule-value')) filterDraft[index] = { ...filterDraft[index], value: event.target.value };
  renderFilterRules();
});
byId('filter-rules').addEventListener('click', (event) => {
  const index = Number(event.target.closest('[data-remove-filter]')?.dataset.removeFilter);
  if (!Number.isInteger(index)) return;
  filterDraft.splice(index, 1);
  renderFilterRules();
});
byId('apply-filter').addEventListener('click', applyTableFilter);
byId('clear-filter').addEventListener('click', () => {
  tableFilters = [];
  renderTable();
  closePopovers();
  showToast('Filter cleared');
});
byId('add-sort-rule').addEventListener('click', () => {
  sortDraft.push({ fieldId: current().fields[sortDraft.length % current().fields.length]?.id ?? '', direction: 'asc' });
  renderSortRules();
});
byId('sort-rules').addEventListener('change', (event) => {
  const index = Number(event.target.closest('.rule-row')?.dataset.ruleIndex);
  if (!Number.isInteger(index)) return;
  if (event.target.matches('.sort-rule-field')) sortDraft[index] = { ...sortDraft[index], fieldId: event.target.value };
  if (event.target.matches('.sort-rule-direction')) sortDraft[index] = { ...sortDraft[index], direction: event.target.value };
  renderSortRules();
});
byId('sort-rules').addEventListener('click', (event) => {
  const index = Number(event.target.closest('[data-remove-sort]')?.dataset.removeSort);
  if (!Number.isInteger(index)) return;
  sortDraft.splice(index, 1);
  renderSortRules();
});
byId('apply-sort').addEventListener('click', applyTableSort);
byId('clear-sort').addEventListener('click', () => {
  tableSorts = [];
  renderTable();
  closePopovers();
  showToast('Original table order restored');
});
byId('group-button').addEventListener('click', (event) => openGroupMenu(event.currentTarget));
byId('add-group-rule').addEventListener('click', () => {
  groupDraft.push(current().fields[groupDraft.length % current().fields.length]?.id ?? '');
  renderGroupRules();
  renderGroupPreview();
});
byId('group-rules').addEventListener('change', (event) => {
  const index = Number(event.target.closest('.rule-row')?.dataset.ruleIndex);
  if (!Number.isInteger(index) || !event.target.matches('.group-rule-field')) return;
  groupDraft[index] = event.target.value;
  renderGroupRules();
  renderGroupPreview();
});
byId('group-rules').addEventListener('click', (event) => {
  const index = Number(event.target.closest('[data-remove-group]')?.dataset.removeGroup);
  if (!Number.isInteger(index)) return;
  groupDraft.splice(index, 1);
  renderGroupRules();
  renderGroupPreview();
});
byId('apply-group').addEventListener('click', () => {
  tableGroupFields = groupDraft.filter(Boolean);
  renderTable();
  closePopovers();
  showToast(tableGroupFields.length ? `${tableGroupFields.length} group fields applied in order` : 'Grouping cleared');
});
byId('clear-group').addEventListener('click', () => {
  tableGroupFields = [];
  renderTable();
  closePopovers();
  showToast('Grouping cleared');
});
byId('ask-ai-button').addEventListener('click', openAiDrawer);
byId('close-ai').addEventListener('click', closeAiDrawer);
byId('ai-submit').addEventListener('click', () => runAi());
byId('ai-apply-formula').addEventListener('click', applyGeneratedFormula);
byId('ai-cancel-formula').addEventListener('click', discardGeneratedFormula);
byId('ai-explain-formula').addEventListener('click', () => { byId('ai-formula-explanation').hidden = !byId('ai-formula-explanation').hidden; });
byId('ai-fix-formula').addEventListener('click', () => { byId('ai-formula-explanation').textContent = 'Formula check passed. References, result type, and blank-row behavior are valid.'; byId('ai-formula-explanation').hidden = false; showToast('Formula checked · no destructive change needed'); });
byId('ai-prompt').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  runAi();
});
byId('formula-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.metaKey) return;
  event.preventDefault();
  openAiDrawer();
  byId('ai-prompt').value = 'Add a Days left formula column for unfinished tasks';
  runAi('formula');
});
byId('formula-input').addEventListener('input', (event) => {
  syncFormulaInputWidth();
  setFormulaShortcutVisible(Boolean(event.currentTarget.value.trim()));
});
byId('formula-input').addEventListener('blur', () => setFormulaShortcutVisible(false));
byId('table-search').addEventListener('input', (event) => {
  tableQuery = event.target.value.trim().toLowerCase();
  renderTable();
});
document.addEventListener('pointerup', () => { draggingSelection = false; if (gridState.mode === 'selecting') gridState.mode = 'navigation'; });
document.addEventListener('pointercancel', () => { draggingSelection = false; if (gridState.mode === 'selecting') gridState.mode = 'navigation'; });
document.addEventListener('pointerdown', (event) => {
  if (!overlayState.id) return;
  const overlay = byId(overlayState.id);
  if (overlay?.contains(event.target) || overlayState.trigger?.contains(event.target)) return;
  closeOverlay();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (overlayState.id) closeOverlay();
});

renderDocument();
switchView('table');
