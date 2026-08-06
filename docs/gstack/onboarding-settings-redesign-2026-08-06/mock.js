const sprite = `
<svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">
  <symbol id="i-spark" viewBox="0 0 24 24"><path d="m12 3 1.3 4.3L17.5 9l-4.2 1.7L12 15l-1.3-4.3L6.5 9l4.2-1.7L12 3Z"/><path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></symbol>
  <symbol id="i-chat" viewBox="0 0 24 24"><path d="M7 18.5 3.5 21v-5A8 8 0 1 1 7 18.5Z"/><path d="M8 9h8M8 13h5"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></symbol>
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></symbol>
  <symbol id="i-cpu" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3M10 10h4v4h-4z"/></symbol>
  <symbol id="i-plug" viewBox="0 0 24 24"><path d="m12 22 3-3-4-4-3 3 4 4Z"/><path d="m14 16 5-5M17 8l3 3M15 6l3 3M4 4l6 6"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
  <symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></symbol>
  <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 17 5-5 4 4 2-2 5 5"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></symbol>
  <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></symbol>
  <symbol id="i-zap" viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3 2.7 20h18.6L12 3Z"/><path d="M12 9v5M12 17.5v.2"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></symbol>
  <symbol id="i-code" viewBox="0 0 24 24"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></symbol>
</svg>`;

document.body.insertAdjacentHTML('afterbegin', sprite);

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.dataset.open = 'true';
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.dataset.open = 'false';
  }, 1800);
}

function initOnboarding() {
  const panels = [...document.querySelectorAll('[data-onboarding-panel]')];
  if (!panels.length) return;
  const navItems = [...document.querySelectorAll('[data-step-target]')];
  const nextButton = document.querySelector('[data-onboarding-next]');
  const backButton = document.querySelector('[data-onboarding-back]');
  const counter = document.querySelector('[data-step-counter]');
  const progress = document.querySelector('[data-step-progress]');
  let current = 0;

  const labels = ['Choose your first goal', 'Connect one AI', 'Review smart defaults', 'Check your vault', 'Start your first task'];

  function render() {
    panels.forEach((panel, index) => {
      panel.hidden = index !== current;
    });
    navItems.forEach((item, index) => {
      item.dataset.state = index < current ? 'done' : index === current ? 'active' : 'future';
      const number = item.querySelector('.step-nav__number');
      if (number) number.innerHTML = index < current ? icon('check') : String(index + 1);
    });
    if (counter) counter.textContent = `Step ${current + 1} of ${panels.length} · ${labels[current]}`;
    if (progress) progress.style.setProperty('--progress', `${((current + 1) / panels.length) * 100}%`);
    if (backButton) backButton.style.visibility = current === 0 ? 'hidden' : 'visible';
    if (nextButton) {
      nextButton.innerHTML = current === panels.length - 1
        ? `Finish setup ${icon('check')}`
        : `Continue ${icon('arrow')}`;
    }
  }

  navItems.forEach((item, index) => item.addEventListener('click', () => {
    current = index;
    render();
  }));
  nextButton?.addEventListener('click', () => {
    if (current < panels.length - 1) {
      current += 1;
      render();
      return;
    }
    showToast('Prototype: setup would finish after a real surface opens.');
  });
  backButton?.addEventListener('click', () => {
    current = Math.max(0, current - 1);
    render();
  });

  const providerCards = [...document.querySelectorAll('[data-provider]')];
  const formName = document.querySelector('[data-provider-form-name]');
  providerCards.forEach((card) => card.addEventListener('click', () => {
    providerCards.forEach((candidate) => candidate.dataset.selected = 'false');
    card.dataset.selected = 'true';
    if (formName) formName.textContent = `Connect ${card.dataset.provider}`;
  }));

  document.querySelector('[data-test-connection]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.textContent = 'Testing…';
    window.setTimeout(() => {
      button.innerHTML = `${icon('check')} Verified`;
      button.classList.add('btn--primary');
      document.querySelector('[data-connection-receipt]')?.removeAttribute('hidden');
    }, 650);
  });

  document.querySelectorAll('[data-launch-action]').forEach((button) => button.addEventListener('click', () => {
    showToast(`Prototype launch: ${button.dataset.launchAction}`);
  }));

  const outcomeCards = [...document.querySelectorAll('.onboarding-outcome')];
  outcomeCards.forEach((card) => card.addEventListener('click', () => {
    outcomeCards.forEach((candidate) => candidate.dataset.selected = 'false');
    card.dataset.selected = 'true';
  }));

  render();
}

function initSettings() {
  const panels = [...document.querySelectorAll('[data-settings-panel]')];
  if (!panels.length) return;
  const navItems = [...document.querySelectorAll('[data-settings-target]')];
  const title = document.querySelector('[data-settings-title]');
  const root = document.querySelector('[data-settings-root]');
  const modeButtons = [...document.querySelectorAll('[data-settings-mode-target]')];

  function openPanel(id) {
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== id;
    });
    navItems.forEach((item) => {
      item.dataset.active = item.dataset.settingsTarget === id ? 'true' : 'false';
    });
    const active = navItems.find((item) => item.dataset.settingsTarget === id);
    if (title && active) title.textContent = active.textContent.trim();
  }

  navItems.forEach((item) => item.addEventListener('click', () => openPanel(item.dataset.settingsTarget)));
  document.querySelectorAll('[data-settings-open]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.settingsOpen)));
  document.querySelectorAll('.toggle').forEach((button) => button.addEventListener('click', () => {
    button.dataset.on = button.dataset.on === 'true' ? 'false' : 'true';
    showToast('Saved · effective immediately');
  }));
  document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.toast)));
  const requested = window.location.hash.replace('#', '');
  const advancedPanelIds = new Set(
    panels.filter((panel) => panel.hasAttribute('data-advanced-only')).map((panel) => panel.dataset.settingsPanel),
  );

  function setMode(mode) {
    if (root) root.dataset.mode = mode;
    modeButtons.forEach((button) => {
      button.dataset.active = button.dataset.settingsModeTarget === mode ? 'true' : 'false';
    });
    const activePanel = panels.find((panel) => !panel.hidden)?.dataset.settingsPanel;
    if (mode === 'standard' && advancedPanelIds.has(activePanel)) openPanel('overview');
    showToast(mode === 'advanced' ? 'Advanced controls are now visible.' : 'Standard view restored. Advanced settings are preserved.');
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.settingsModeTarget)));
  const initialPanel = panels.some((panel) => panel.dataset.settingsPanel === requested) ? requested : 'overview';
  if (advancedPanelIds.has(initialPanel)) setMode('advanced');
  openPanel(initialPanel);
}

function initStartVariants() {
  const panels = [...document.querySelectorAll('[data-variant-panel]')];
  if (!panels.length) return;
  const options = [...document.querySelectorAll('[data-variant-target]')];
  const title = document.querySelector('[data-variant-title]');
  const sub = document.querySelector('[data-variant-sub]');
  const copy = {
    a: ['Variant A · Choose a goal', 'Task-first · balanced product coverage'],
    b: ['Variant B · See the workspace', 'Surface-first · strongest product map'],
    c: ['Variant C · Start from a note', 'Context-first · shortest path to first success'],
  };

  function openVariant(id) {
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.variantPanel !== id;
    });
    options.forEach((option) => {
      option.dataset.active = option.dataset.variantTarget === id ? 'true' : 'false';
    });
    if (title) title.textContent = copy[id][0];
    if (sub) sub.textContent = copy[id][1];
  }

  options.forEach((option) => option.addEventListener('click', () => openVariant(option.dataset.variantTarget)));
  openVariant('a');
}

function initPicker() {
  const cards = [...document.querySelectorAll('[data-model-card]')];
  if (!cards.length) return;
  const selection = document.querySelector('[data-model-selection]');
  cards.forEach((card) => card.addEventListener('click', () => {
    cards.forEach((candidate) => candidate.dataset.selected = 'false');
    card.dataset.selected = 'true';
    if (selection) selection.textContent = card.dataset.modelName;
  }));

  const filters = [...document.querySelectorAll('[data-filter]')];
  filters.forEach((filter) => filter.addEventListener('click', () => {
    filter.dataset.active = filter.dataset.active === 'true' ? 'false' : 'true';
  }));

  const query = document.querySelector('[data-model-query]');
  query?.addEventListener('input', () => {
    const value = query.value.trim().toLowerCase();
    document.querySelectorAll('[data-searchable-model]').forEach((row) => {
      row.hidden = value.length > 0 && !row.textContent.toLowerCase().includes(value);
    });
  });

  document.querySelector('[data-use-model]')?.addEventListener('click', () => showToast('Prototype: model binding saved.'));
}

initOnboarding();
initSettings();
initPicker();
initStartVariants();
