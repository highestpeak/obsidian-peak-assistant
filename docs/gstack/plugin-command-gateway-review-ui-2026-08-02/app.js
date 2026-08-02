const initialCommands = [
  { plugin: 'calendar', pluginName: 'Calendar', version: '1.5.10', id: 'calendar:open-week', name: 'Open weekly calendar', summary: 'Open the weekly calendar view when the user explicitly asks to inspect their schedule.', risk: 'read', purpose: 'planning', state: 'allowed', ai: true },
  { plugin: 'calendar', pluginName: 'Calendar', version: '1.5.10', id: 'calendar:open-month', name: 'Open monthly calendar', summary: 'Navigate to the monthly calendar without modifying Vault content.', risk: 'read', purpose: 'navigation', state: 'off', ai: true },
  { plugin: 'periodic-notes', pluginName: 'Periodic Notes', version: '0.0.17', id: 'periodic-notes:create-weekly', name: 'Create weekly note', summary: 'Create or open this week’s periodic note; may add a Markdown file and change the active file.', risk: 'edit', purpose: 'planning', state: 'off', ai: true },
  { plugin: 'periodic-notes', pluginName: 'Periodic Notes', version: '0.0.17', id: 'periodic-notes:open-daily', name: 'Open daily note', summary: 'Open today’s note. If the plugin creates a missing note, host observations will record the change.', risk: 'edit', purpose: 'planning', state: 'off', ai: true },
  { plugin: 'dataview', pluginName: 'Dataview', version: '0.5.68', id: 'dataview:force-refresh-views', name: 'Force refresh all views', summary: 'Refresh visible Dataview results without granting access to arbitrary plugin commands.', risk: 'read', purpose: 'query', state: 'off', ai: true },
  { plugin: 'dataview', pluginName: 'Dataview', version: '0.5.68', id: 'dataview:rebuild-index', name: 'Rebuild full index', summary: 'Potentially expensive maintenance command; classified as destructive and excluded from automatic use.', risk: 'destructive', purpose: 'system', state: 'unavailable', reason: 'Destructive commands cannot be exposed to Copilot.', ai: true },
  { plugin: 'templater-obsidian', pluginName: 'Templater', version: '2.9.1', id: 'templater-obsidian:replace-in-file-templater', name: 'Replace templates in active file', summary: 'Resolve templates inside the active editor. Requires an active Markdown editor.', risk: 'edit', purpose: 'formatting', state: 'blocked', ai: true },
  { plugin: 'templater-obsidian', pluginName: 'Templater', version: '2.9.1', id: 'templater-obsidian:create-new-note-from-template', name: 'Create note from template', summary: 'Opens a template picker; Copilot cannot safely complete the interactive modal.', risk: 'unknown', purpose: 'capture', state: 'unavailable', reason: 'Modal-only command.', ai: true },
  { plugin: 'quickadd', pluginName: 'QuickAdd', version: '2.4.1', id: 'quickadd:open-capture', name: 'Open capture modal', summary: 'Opens QuickAdd’s interactive chooser rather than completing a deterministic action.', risk: 'unknown', purpose: 'capture', state: 'unavailable', reason: 'Modal-only command.', ai: true },
  { plugin: 'file-chucker', pluginName: 'File Chucker', version: '1.2.0', id: 'file-chucker:move-active-file', name: 'Move active file', summary: 'Move the current file according to plugin rules; requires per-run edit permission.', risk: 'edit', purpose: 'formatting', state: 'off', ai: false },
];

let commands = structuredClone(initialCommands);
let pendingBulk = { mode: 'filtered', indexes: [] };
let openAccessIndex = null;
let toastTimer = null;

const commandList = document.getElementById('command-list');
const searchInput = document.getElementById('search-input');
const pluginFilter = document.getElementById('plugin-filter');
const riskFilter = document.getElementById('risk-filter');
const stateFilter = document.getElementById('state-filter');
const batchMenu = document.getElementById('batch-menu');
const batchToggle = document.getElementById('batch-toggle');
const bulkModal = document.getElementById('bulk-modal');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isSystemExcluded(command) {
  return command.state === 'unavailable' || command.risk === 'unknown' || command.risk === 'destructive';
}

function isBulkEligible(command) {
  return !isSystemExcluded(command) && command.state === 'off' && (command.risk === 'read' || command.risk === 'edit');
}

function filteredEntries() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  return commands
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => {
      if (pluginFilter.value !== 'all' && command.plugin !== pluginFilter.value) return false;
      if (riskFilter.value !== 'all' && command.risk !== riskFilter.value) return false;
      if (stateFilter.value !== 'all' && command.state !== stateFilter.value) return false;
      if (!query) return true;
      return [command.plugin, command.pluginName, command.id, command.name, command.summary]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });
}

function stateLabel(state) {
  return { allowed: 'Allowed', blocked: 'Blocked', off: 'Off', unavailable: 'Unavailable' }[state];
}

function purposeLabel(purpose) {
  return { navigation: 'Navigation', capture: 'Capture', planning: 'Planning', query: 'Query', formatting: 'Formatting', system: 'System', other: 'Other' }[purpose] ?? purpose;
}

function accessMenu(command, index) {
  if (command.state === 'unavailable') {
    return `<div class="access-cell"><div><button type="button" class="access-button" data-state="unavailable" disabled><span>Unavailable</span><svg><use href="#i-lock"/></svg></button><span class="system-note"><svg><use href="#i-lock"/></svg>${escapeHtml(command.reason)}</span></div></div>`;
  }
  const isOpen = openAccessIndex === index;
  return `<div class="access-cell">
    <button type="button" class="access-button" data-state="${command.state}" data-access-index="${index}" aria-expanded="${isOpen}"><span>${stateLabel(command.state)}</span><svg><use href="#i-chevron-down"/></svg></button>
    <div class="access-menu" data-menu-index="${index}" ${isOpen ? '' : 'hidden'}>
      <button type="button" data-choice="allowed" data-command-index="${index}"><svg><use href="#i-check"/></svg>Allow</button>
      <button type="button" data-choice="blocked" data-command-index="${index}"><svg><use href="#i-ban"/></svg>Block</button>
      <button type="button" data-choice="off" data-command-index="${index}"><svg><use href="#i-refresh"/></svg>Turn off</button>
    </div>
  </div>`;
}

function commandRow(command, index) {
  return `<article class="command-row" data-command-id="${escapeHtml(command.id)}">
    <div class="command-main">
      <div class="command-title-line"><span class="command-title">${escapeHtml(command.name)}</span>${command.ai ? '<span class="inline-badge inline-badge--ai">AI analyzed</span>' : '<span class="inline-badge">Metadata only</span>'}</div>
      <span class="command-id">${escapeHtml(command.id)}</span>
      <p class="command-summary">${escapeHtml(command.summary)}</p>
    </div>
    <div><span class="risk-pill" data-risk="${command.risk}">${escapeHtml(command.risk)}</span></div>
    <label class="cell-select"><select data-purpose-index="${index}" ${isSystemExcluded(command) ? 'disabled' : ''}>${['navigation','capture','planning','query','formatting','system','other'].map((purpose) => `<option value="${purpose}" ${purpose === command.purpose ? 'selected' : ''}>${purposeLabel(purpose)}</option>`).join('')}</select><svg><use href="#i-chevron-down"/></svg></label>
    ${accessMenu(command, index)}
  </article>`;
}

function render() {
  const entries = filteredEntries();
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.command.plugin;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  if (entries.length === 0) {
    commandList.innerHTML = '<div class="empty-state">No commands match the current filters.</div>';
  } else {
    commandList.innerHTML = [...groups.values()].map((group) => {
      const first = group[0].command;
      const eligible = group.filter(({ command }) => isBulkEligible(command)).length;
      return `<section class="plugin-group">
        <header class="plugin-header"><div class="plugin-identity"><svg><use href="#i-plug"/></svg><strong>${escapeHtml(first.pluginName)}</strong><span class="plugin-meta">${escapeHtml(first.plugin)} · ${escapeHtml(first.version)}</span></div><div class="plugin-counts"><span>${group.length} shown</span>${eligible > 0 ? `<span class="badge badge--accent">${eligible} eligible</span>` : ''}</div></header>
        ${group.map(({ command, index }) => commandRow(command, index)).join('')}
      </section>`;
    }).join('');
  }

  const eligibleFiltered = entries.filter(({ command }) => isBulkEligible(command));
  const eligibleAll = commands.filter(isBulkEligible);
  const filteredNonSystem = entries.filter(({ command }) => !isSystemExcluded(command));
  document.getElementById('result-count').textContent = `${entries.length} command${entries.length === 1 ? '' : 's'}`;
  document.getElementById('eligible-summary').textContent = `${eligibleFiltered.length} eligible for bulk Allow`;
  document.getElementById('allow-filtered-label').textContent = `Allow filtered · ${eligibleFiltered.length}`;
  document.getElementById('filtered-menu-count').textContent = eligibleFiltered.length;
  document.getElementById('all-menu-count').textContent = eligibleAll.length;
  document.getElementById('block-menu-count').textContent = filteredNonSystem.length;
  document.getElementById('allow-filtered').disabled = eligibleFiltered.length === 0;
  batchToggle.disabled = entries.length === 0;
  document.getElementById('footer-summary').textContent = `Showing ${entries.length} of ${commands.length} commands across ${groups.size} plugin${groups.size === 1 ? '' : 's'}`;
  document.getElementById('approved-total').textContent = commands.filter((command) => command.state === 'allowed').length;
  document.getElementById('off-total').textContent = commands.filter((command) => command.state === 'off').length;
  document.getElementById('blocked-total').textContent = commands.filter((command) => command.state === 'blocked').length;
  document.getElementById('excluded-total').textContent = commands.filter(isSystemExcluded).length;
}

function openBulkConfirm(mode) {
  const entries = mode === 'all' ? commands.map((command, index) => ({ command, index })) : filteredEntries();
  const indexes = mode === 'block'
    ? entries.filter(({ command }) => !isSystemExcluded(command)).map(({ index }) => index)
    : entries.filter(({ command }) => isBulkEligible(command)).map(({ index }) => index);
  if (indexes.length === 0) return;
  pendingBulk = { mode, indexes };
  const verb = mode === 'block' ? 'Block' : 'Allow';
  document.getElementById('confirm-title').textContent = `${verb} ${indexes.length} command${indexes.length === 1 ? '' : 's'}?`;
  document.getElementById('confirm-copy').textContent = mode === 'all'
    ? 'This applies across every plugin, but only to currently eligible Off commands.'
    : 'This applies only to commands in the current filter and preserves system exclusions.';
  document.getElementById('confirm-list').innerHTML = indexes.slice(0, 6).map((index) => `<span><svg><use href="#${mode === 'block' ? 'i-ban' : 'i-check'}"/></svg>${escapeHtml(commands[index].pluginName)} · ${escapeHtml(commands[index].name)}</span>`).join('') + (indexes.length > 6 ? `<span>+ ${indexes.length - 6} more commands</span>` : '');
  const excluded = commands.filter(isSystemExcluded).length;
  document.getElementById('confirm-exclusion-copy').textContent = `${excluded} unknown, destructive, modal-only, or unavailable commands remain excluded.`;
  document.querySelector('#confirm-bulk span').textContent = `${verb} commands`;
  bulkModal.hidden = false;
}

function closeMenus() {
  openAccessIndex = null;
  batchMenu.hidden = true;
  batchToggle.setAttribute('aria-expanded', 'false');
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  document.getElementById('toast-copy').textContent = message;
  document.getElementById('toast').hidden = false;
  toastTimer = window.setTimeout(() => { document.getElementById('toast').hidden = true; }, 1800);
}

commandList.addEventListener('click', (event) => {
  const accessButton = event.target.closest('[data-access-index]');
  if (accessButton) {
    const index = Number(accessButton.dataset.accessIndex);
    openAccessIndex = openAccessIndex === index ? null : index;
    batchMenu.hidden = true;
    render();
    return;
  }
  const choice = event.target.closest('[data-choice]');
  if (!choice) return;
  const index = Number(choice.dataset.commandIndex);
  commands[index].state = choice.dataset.choice;
  openAccessIndex = null;
  render();
  showToast(`${commands[index].name}: ${stateLabel(commands[index].state)}`);
});

commandList.addEventListener('change', (event) => {
  const select = event.target.closest('[data-purpose-index]');
  if (!select) return;
  commands[Number(select.dataset.purposeIndex)].purpose = select.value;
});

for (const control of [searchInput, pluginFilter, riskFilter, stateFilter]) {
  control.addEventListener(control === searchInput ? 'input' : 'change', () => { closeMenus(); render(); });
}

document.getElementById('clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  pluginFilter.value = 'all';
  riskFilter.value = 'all';
  stateFilter.value = 'all';
  closeMenus();
  render();
});

document.getElementById('allow-filtered').addEventListener('click', () => openBulkConfirm('filtered'));
batchToggle.addEventListener('click', () => {
  const next = batchMenu.hidden;
  batchMenu.hidden = !next;
  batchToggle.setAttribute('aria-expanded', String(next));
});
batchMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bulk]');
  if (!button) return;
  batchMenu.hidden = true;
  batchToggle.setAttribute('aria-expanded', 'false');
  openBulkConfirm(button.dataset.bulk);
});

document.getElementById('cancel-confirm').addEventListener('click', () => { bulkModal.hidden = true; });
document.getElementById('confirm-bulk').addEventListener('click', () => {
  const nextState = pendingBulk.mode === 'block' ? 'blocked' : 'allowed';
  for (const index of pendingBulk.indexes) commands[index].state = nextState;
  bulkModal.hidden = true;
  render();
  showToast(`${pendingBulk.indexes.length} commands changed to ${stateLabel(nextState)}`);
});
bulkModal.addEventListener('click', (event) => { if (event.target === bulkModal) bulkModal.hidden = true; });

document.getElementById('scan-button').addEventListener('click', () => showToast('Scan complete · 10 commands found'));
document.getElementById('analyze-button').addEventListener('click', () => showToast('AI draft refreshed · access unchanged'));
document.getElementById('reset-demo').addEventListener('click', () => {
  commands = structuredClone(initialCommands);
  searchInput.value = '';
  pluginFilter.value = 'all';
  riskFilter.value = 'all';
  stateFilter.value = 'all';
  closeMenus();
  render();
  showToast('Mock data reset');
});

for (const plugin of [...new Map(initialCommands.map((command) => [command.plugin, command.pluginName])).entries()]) {
  const option = document.createElement('option');
  option.value = plugin[0];
  option.textContent = plugin[1];
  pluginFilter.append(option);
}

render();
