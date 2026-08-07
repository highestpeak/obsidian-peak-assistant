function initNativeSettings() {
  const root = document.querySelector('[data-native-root]');
  if (!root) return;
  const panels = [...root.querySelectorAll('[data-native-panel]')];
  const targets = [...root.querySelectorAll('[data-native-target]')];
  const location = root.querySelector('[data-native-location]');
  const content = root.querySelector('.native-settings__content');
  const query = root.querySelector('[data-native-query]');
  const results = root.querySelector('[data-native-results]');
  const resultButtons = [...root.querySelectorAll('[data-native-result]')];
  const empty = root.querySelector('[data-native-empty]');

  function openPanel(id) {
    if (!panels.some((panel) => panel.dataset.nativePanel === id)) return;
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.nativePanel !== id;
    });
    targets.forEach((target) => {
      const active = target.dataset.nativeTarget === id;
      target.dataset.active = active ? 'true' : 'false';
      target.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const active = targets.find((target) => target.dataset.nativeTarget === id);
    if (location && active) location.textContent = active.textContent.trim();
    if (content) content.scrollTop = 0;
  }

  function closeSearch() {
    if (results) results.hidden = true;
    if (query) query.value = '';
    resultButtons.forEach((button) => {
      button.hidden = false;
    });
    if (empty) empty.hidden = true;
  }

  targets.forEach((target) => target.addEventListener('click', () => {
    openPanel(target.dataset.nativeTarget);
    closeSearch();
  }));

  root.querySelectorAll('[data-native-open]').forEach((button) => button.addEventListener('click', () => {
    openPanel(button.dataset.nativeOpen);
  }));

  resultButtons.forEach((button) => button.addEventListener('click', () => {
    openPanel(button.dataset.nativeResult);
    closeSearch();
  }));

  query?.addEventListener('input', () => {
    const value = query.value.trim().toLowerCase();
    if (results) results.hidden = value.length === 0;
    let visible = 0;
    resultButtons.forEach((button) => {
      button.hidden = value.length > 0 && !button.dataset.nativeKeywords.includes(value);
      if (!button.hidden) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  });

  query?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeSearch();
    query.blur();
  });

  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    query?.focus();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.native-search, .native-search-results')) return;
    if (results) results.hidden = true;
  });

  root.querySelectorAll('[data-native-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
    toggle.dataset.on = toggle.dataset.on === 'true' ? 'false' : 'true';
    showToast('Saved · effective immediately');
  }));

  root.querySelectorAll('[data-native-toast]').forEach((button) => button.addEventListener('click', () => {
    showToast(button.dataset.nativeToast);
  }));

  openPanel('general');
}

initNativeSettings();
