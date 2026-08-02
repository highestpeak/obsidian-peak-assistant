const initialCommands = [
  { plugin: 'calendar', pluginName: 'Calendar', version: '1.5.10', id: 'calendar:open-week', name: 'Open weekly calendar', summary: 'Opens the weekly calendar view; expected effect: active view changes, Vault content stays unchanged.', risk: 'read', state: 'allowed', ai: true },
  { plugin: 'calendar', pluginName: 'Calendar', version: '1.5.10', id: 'calendar:open-month', name: 'Open monthly calendar', summary: 'Opens the monthly calendar; expected effect: active view changes, Vault content stays unchanged.', risk: 'read', state: 'off', ai: true },
  { plugin: 'periodic-notes', pluginName: 'Periodic Notes', version: '0.0.17', id: 'periodic-notes:create-weekly', name: 'Create weekly note', summary: 'May create a Markdown file and open it; expected effect: file count and active file can change.', risk: 'edit', state: 'off', ai: true },
  { plugin: 'periodic-notes', pluginName: 'Periodic Notes', version: '0.0.17', id: 'periodic-notes:open-daily', name: 'Open daily note', summary: 'Opens today’s note and may create it if missing; expected effect is stated directly here.', risk: 'edit', state: 'off', ai: true },
  { plugin: 'dataview', pluginName: 'Dataview', version: '0.5.68', id: 'dataview:force-refresh-views', name: 'Force refresh all views', summary: 'Refreshes visible Dataview results; expected effect: rendered query views update.', risk: 'read', state: 'off', ai: true },
  { plugin: 'dataview', pluginName: 'Dataview', version: '0.5.68', id: 'dataview:rebuild-index', name: 'Rebuild full index', summary: 'Potentially expensive maintenance command; destructive classification excludes it from Copilot.', risk: 'destructive', state: 'unavailable', reason: 'Destructive commands cannot be exposed to Copilot.', ai: true },
  { plugin: 'templater-obsidian', pluginName: 'Templater', version: '2.9.1', id: 'templater-obsidian:replace-in-file-templater', name: 'Replace templates in active file', summary: 'Changes the active Markdown file; expected effect: current file content changes.', risk: 'edit', state: 'off', ai: true },
  { plugin: 'templater-obsidian', pluginName: 'Templater', version: '2.9.1', id: 'templater-obsidian:create-new-note-from-template', name: 'Create note from template', summary: 'Opens a template picker that Copilot cannot safely complete.', risk: 'unknown', state: 'unavailable', reason: 'Modal-only command.', ai: true },
  { plugin: 'quickadd', pluginName: 'QuickAdd', version: '2.4.1', id: 'quickadd:open-capture', name: 'Open capture modal', summary: 'Opens QuickAdd’s interactive chooser rather than completing a deterministic action.', risk: 'unknown', state: 'unavailable', reason: 'Modal-only command.', ai: true },
  { plugin: 'file-chucker', pluginName: 'File Chucker', version: '1.2.0', id: 'file-chucker:move-active-file', name: 'Move active file', summary: 'Moves the current file; expected effect: active path changes and requires edit permission.', risk: 'edit', state: 'off', ai: false },
];

let commands = structuredClone(initialCommands);
let pendingBulk = { mode: 'filtered', indexes: [] };
let toastTimer = null;
let scanTimer = null;

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
  return { allowed: 'Allowed', off: 'Not allowed', unavailable: 'Unavailable' }[state];
}

function accessControl(command, index) {
  if (command.state === 'unavailable') {
    return `<div class="access-cell"><div><button type="button" class="access-unavailable" disabled><svg><use href="#i-lock"/></svg><span>Unavailable</span></button><span class="system-note"><svg><use href="#i-lock"/></svg>${escapeHtml(command.reason)}</span></div></div>`;
  }
  return `<div class="access-cell">
    <button type="button" class="access-toggle" data-access-toggle="${index}" data-state="${command.state}" role="switch" aria-checked="${command.state === 'allowed'}" aria-label="Allow ${escapeHtml(command.name)}">
      <span class="access-toggle__track" aria-hidden="true"><i></i></span>
      <span>${command.state === 'allowed' ? 'Allowed' : 'Not allowed'}</span>
    </button>
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
    ${accessControl(command, index)}
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
  document.getElementById('result-count').textContent = `${entries.length} command${entries.length === 1 ? '' : 's'}`;
  document.getElementById('eligible-summary').textContent = `${eligibleFiltered.length} eligible for bulk Allow`;
  document.getElementById('allow-filtered-label').textContent = `Allow filtered · ${eligibleFiltered.length}`;
  document.getElementById('filtered-menu-count').textContent = eligibleFiltered.length;
  document.getElementById('all-menu-count').textContent = eligibleAll.length;
  document.getElementById('allow-filtered').disabled = eligibleFiltered.length === 0;
  batchToggle.disabled = entries.length === 0;
  document.getElementById('footer-summary').textContent = `Showing ${entries.length} of ${commands.length} commands across ${groups.size} plugin${groups.size === 1 ? '' : 's'}`;
  document.getElementById('approved-total').textContent = commands.filter((command) => command.state === 'allowed').length;
  document.getElementById('not-allowed-total').textContent = commands.filter((command) => command.state === 'off').length;
  document.getElementById('excluded-total').textContent = commands.filter(isSystemExcluded).length;
}

function openBulkConfirm(mode) {
  const entries = mode === 'all' ? commands.map((command, index) => ({ command, index })) : filteredEntries();
  const indexes = entries.filter(({ command }) => isBulkEligible(command)).map(({ index }) => index);
  if (indexes.length === 0) return;
  pendingBulk = { mode, indexes };
  document.getElementById('confirm-title').textContent = `Allow ${indexes.length} command${indexes.length === 1 ? '' : 's'}?`;
  document.getElementById('confirm-copy').textContent = mode === 'all'
    ? 'This applies across every plugin, but only to currently eligible commands.'
    : 'This applies only to commands in the current filter and preserves system exclusions.';
  document.getElementById('confirm-list').innerHTML = indexes.slice(0, 6).map((index) => `<span><svg><use href="#i-check"/></svg>${escapeHtml(commands[index].pluginName)} · ${escapeHtml(commands[index].name)}</span>`).join('') + (indexes.length > 6 ? `<span>+ ${indexes.length - 6} more commands</span>` : '');
  const excluded = commands.filter(isSystemExcluded).length;
  document.getElementById('confirm-exclusion-copy').textContent = `${excluded} unknown, destructive, modal-only, or unavailable commands remain excluded.`;
  document.querySelector('#confirm-bulk span').textContent = 'Allow commands';
  bulkModal.hidden = false;
}

function closeMenus() {
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
  const toggle = event.target.closest('[data-access-toggle]');
  if (!toggle) return;
  const index = Number(toggle.dataset.accessToggle);
  commands[index].state = commands[index].state === 'allowed' ? 'off' : 'allowed';
  render();
  showToast(`${commands[index].name}: ${stateLabel(commands[index].state)}`);
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
  for (const index of pendingBulk.indexes) commands[index].state = 'allowed';
  bulkModal.hidden = true;
  render();
  showToast(`${pendingBulk.indexes.length} commands changed to Allowed`);
});
bulkModal.addEventListener('click', (event) => { if (event.target === bulkModal) bulkModal.hidden = true; });

function runScan() {
  if (scanTimer) return;
  const steps = [
    { plugin: 'Reading enabled plugin commands…', plugins: 0, commands: 0, percent: 8 },
    { plugin: 'Calendar · comparing 2 commands with the last scan', plugins: 1, commands: 2, percent: 24 },
    { plugin: 'Periodic Notes · checking editor requirements', plugins: 2, commands: 4, percent: 42 },
    { plugin: 'Dataview · excluding unsafe maintenance actions', plugins: 3, commands: 6, percent: 58 },
    { plugin: 'Templater · detecting commands that require a modal', plugins: 4, commands: 8, percent: 74 },
    { plugin: 'Preparing explanations for new and changed commands', plugins: 6, commands: 10, percent: 91 },
    { plugin: 'Review is ready · access decisions unchanged', plugins: 6, commands: 10, percent: 100 },
  ];
  let index = 0;
  const scanButton = document.getElementById('scan-button');
  const scanProgress = document.getElementById('scan-progress');
  scanProgress.hidden = false;
  scanButton.disabled = true;
  scanButton.classList.add('is-scanning');
  document.getElementById('scan-button-label').textContent = 'Scanning…';
  commandList.classList.add('is-scanning');
  commandList.setAttribute('aria-busy', 'true');

  const applyStep = () => {
    const step = steps[index];
    document.getElementById('scan-current-plugin').textContent = step.plugin;
    document.getElementById('scan-plugin-count').textContent = `${step.plugins} / 6 plugins`;
    document.getElementById('scan-command-count').textContent = `${step.commands} commands found`;
    document.getElementById('scan-percent').textContent = `${step.percent}%`;
    document.getElementById('scan-progress-bar').style.width = `${step.percent}%`;
    if (step.percent === 100) document.getElementById('scan-phase').textContent = 'Scan complete';
    index += 1;
    if (index < steps.length) return;
    window.clearInterval(scanTimer);
    scanTimer = null;
    window.setTimeout(() => {
      scanProgress.hidden = true;
      scanButton.disabled = false;
      scanButton.classList.remove('is-scanning');
      document.getElementById('scan-button-label').textContent = 'Scan commands';
      commandList.classList.remove('is-scanning');
      commandList.setAttribute('aria-busy', 'false');
      document.getElementById('scan-phase').textContent = 'Preparing commands for review';
      showToast('Scan complete · review ready · access unchanged');
    }, 700);
  };

  applyStep();
  scanTimer = window.setInterval(applyStep, 360);
}

document.getElementById('scan-button').addEventListener('click', runScan);
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
