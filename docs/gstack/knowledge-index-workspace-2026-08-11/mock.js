const DEMO_STATES = {
  running: {
    heroEyebrow: 'Search is ready',
    heroTitle: 'You can use your vault while deeper indexing continues.',
    heroDescription: 'Keyword search is available across 4,812 files. Semantic coverage and summaries are still being built in the background.',
    runKicker: 'Running now',
    runTitle: 'First full index',
    runMeta: 'Started 18 min ago · 4,860 files',
    runPercent: '72%',
    runEta: 'About 34 min remaining',
    runProgress: 72,
    activeStageCopy: '4,102 / 4,860 files',
    activeStageEta: '12m left',
    currentFile: 'Research/AI systems/provider-routing.md',
    costCopy: 'Est. AI cost NZ$2.18',
    problemCount: '3',
    capabilities: {
      search: { progress: 99, copy: '4,812 / 4,860', status: 'Ready', tone: 'ready' },
      semantic: { progress: 84, copy: '4,102 / 4,860', status: '84%', tone: 'running' },
      enrichment: { progress: 61, copy: '2,984 / 4,860', status: '61%', tone: 'running' },
      graph: { progress: 0, copy: 'Waiting for enrichment', status: 'Waiting', tone: 'waiting' },
    },
    stages: ['complete', 'complete', 'running', 'waiting', 'waiting'],
  },
  attention: {
    heroEyebrow: 'Search remains available',
    heroTitle: 'Three items need attention; the healthy part of the index is still working.',
    heroDescription: 'Peak kept the last valid results and continued wherever it was safe. Fix only the affected files or model dependency.',
    runKicker: 'Continuing with issues',
    runTitle: 'First full index',
    runMeta: '3 recoverable issues · 4,860 files',
    runPercent: '72%',
    runEta: 'Waiting on 3 decisions',
    runProgress: 72,
    activeStageCopy: '4,102 complete · 1 stale',
    activeStageEta: 'Needs review',
    currentFile: 'Archive/contracts/2024-supplier-agreement.pdf',
    costCopy: 'No additional charge until retry',
    problemCount: '3',
    capabilities: {
      search: { progress: 99, copy: '4,812 / 4,860', status: 'Ready', tone: 'ready' },
      semantic: { progress: 84, copy: '4,102 / 4,860', status: 'Available · 84%', tone: 'warning' },
      enrichment: { progress: 61, copy: '16 images waiting', status: 'Needs model', tone: 'warning' },
      graph: { progress: 0, copy: 'Last updated yesterday', status: 'Out of date', tone: 'warning' },
    },
    stages: ['complete', 'complete', 'running', 'waiting', 'waiting'],
  },
  complete: {
    heroEyebrow: 'Index is up to date',
    heroTitle: 'Your vault is searchable, enriched and ready for structural exploration.',
    heroDescription: 'All eligible files completed the selected Full index plan. Three excluded files remain visible in the last run receipt.',
    runKicker: 'Last run completed',
    runTitle: 'First full index',
    runMeta: 'Completed today at 23:07 · 4,860 files',
    runPercent: '100%',
    runEta: 'Finished in 52 min',
    runProgress: 100,
    activeStageCopy: '4,860 / 4,860 files',
    activeStageEta: 'Complete',
    currentFile: 'No active item',
    costCopy: 'Actual AI cost NZ$1.94',
    problemCount: '0',
    capabilities: {
      search: { progress: 100, copy: '4,860 / 4,860', status: 'Ready', tone: 'ready' },
      semantic: { progress: 100, copy: '4,860 / 4,860', status: 'Ready', tone: 'ready' },
      enrichment: { progress: 100, copy: '4,860 / 4,860', status: 'Ready', tone: 'ready' },
      graph: { progress: 100, copy: 'Updated at 23:07', status: 'Updated', tone: 'ready' },
    },
    stages: ['complete', 'complete', 'complete', 'complete', 'complete'],
  },
};

const body = document.body;
const views = [...document.querySelectorAll('[data-view]')];
const sideButtons = [...document.querySelectorAll('.side-nav [data-view-target]')];
const toast = document.querySelector('[data-toast]');
const toastCopy = document.querySelector('[data-toast-copy]');
const settingsDrawer = document.querySelector('[data-settings-drawer]');
let toastTimer = 0;
let paused = false;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastCopy.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function activateView(name) {
  views.forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  });
  sideButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewTarget === name);
  });
}

function bindText(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach((node) => {
    node.textContent = value;
  });
}

function updateCapability(name, data) {
  const row = document.querySelector(`[data-capability="${name}"]`);
  if (!row) return;
  row.querySelector('.progress-line i').style.width = `${data.progress}%`;
  row.querySelector('[data-progress-copy]').textContent = data.copy;
  row.querySelector('[data-status-copy]').textContent = data.status;
  const status = row.querySelector('.status-label');
  status.className = `status-label is-${data.tone}`;
}

function updateStages(stageStates) {
  const rows = [...document.querySelectorAll('[data-stage-list] .stage-row')];
  rows.forEach((row, index) => {
    const state = stageStates[index] ?? 'waiting';
    row.className = `stage-row is-${state}`;
    const node = row.querySelector('.stage-node');
    if (state === 'complete') {
      node.innerHTML = '<svg><use href="#i-check"></use></svg>';
      return;
    }
    if (state === 'running') {
      node.innerHTML = '<i></i>';
      return;
    }
    node.innerHTML = '';
  });
}

function applyDemoState(name) {
  const state = DEMO_STATES[name];
  if (!state) return;
  body.dataset.demoState = name;
  document.querySelectorAll('[data-demo-state-button]').forEach((button) => {
    button.dataset.active = button.dataset.demoStateButton === name ? 'true' : 'false';
  });
  Object.entries(state).forEach(([key, value]) => {
    if (typeof value === 'string') bindText(key, value);
  });
  document.querySelectorAll('[data-bind-progress="run"]').forEach((node) => {
    node.style.width = `${state.runProgress}%`;
  });
  document.querySelectorAll('[data-problem-count]').forEach((node) => {
    node.textContent = state.problemCount;
  });
  Object.entries(state.capabilities).forEach(([key, value]) => updateCapability(key, value));
  updateStages(state.stages);
  paused = false;
  document.querySelectorAll('[data-pause-label]').forEach((node) => { node.textContent = 'Pause'; });
  activateView('overview');
}

document.querySelectorAll('[data-view-target]').forEach((button) => {
  button.addEventListener('click', () => activateView(button.dataset.viewTarget));
});

document.querySelectorAll('[data-demo-state-button]').forEach((button) => {
  button.addEventListener('click', () => applyDemoState(button.dataset.demoStateButton));
});

document.querySelectorAll('[data-problem-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    button.closest('.problem-row')?.classList.toggle('is-open');
  });
});

document.querySelectorAll('[data-stage-list] .stage-row').forEach((button) => {
  button.addEventListener('click', () => activateView('run'));
});

document.querySelectorAll('[data-open-settings]').forEach((button) => {
  button.addEventListener('click', () => { settingsDrawer.hidden = false; });
});

document.querySelectorAll('[data-close-settings]').forEach((button) => {
  button.addEventListener('click', () => { settingsDrawer.hidden = true; });
});

settingsDrawer.addEventListener('click', (event) => {
  if (event.target === settingsDrawer) settingsDrawer.hidden = true;
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'pause') {
      paused = !paused;
      document.querySelectorAll('[data-pause-label]').forEach((node) => {
        node.textContent = paused ? 'Resume' : 'Pause';
      });
      showToast(paused ? 'Mock: task paused. Search stays available.' : 'Mock: task resumed.');
      return;
    }
    if (action === 'update') {
      applyDemoState('running');
      showToast('Mock: update task opened as the current run.');
      return;
    }
    if (action === 'retry') {
      applyDemoState('running');
      showToast('Mock: retry added only the affected items.');
      return;
    }
    if (action === 'open-search') {
      showToast('Mock: Search can open before deeper indexing finishes.');
      return;
    }
    if (action === 'cancel') {
      showToast('Mock: a real cancel would require scope confirmation.');
      return;
    }
    if (action === 'review-cost') {
      showToast('Mock: cost review opens before paid enrichment begins.');
      return;
    }
    if (action === 'settings-toast') {
      settingsDrawer.hidden = true;
      showToast('Mock: this would deep-link to Peak Settings.');
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  settingsDrawer.hidden = true;
});

applyDemoState('running');
