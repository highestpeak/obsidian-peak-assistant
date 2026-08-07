const conceptCopy = {
  tabs: {
    badge: 'Variant A · familiar',
    title: '顶部分类标签',
    copy: '最接近传统桌面设置。没有左栏，内容宽度更充足；但分类超过 7 个后会开始拥挤。',
  },
  home: {
    badge: 'Variant B · recommended',
    title: 'Settings Home → 聚焦详情',
    copy: '入口先展示全部能力和健康状态，再进入单一分类。最容易一眼看懂，但打开具体设置会多一次点击。',
  },
  search: {
    badge: 'Variant C · fastest',
    title: '搜索优先控制中心',
    copy: '直接按用户语言搜索 model、index、Composer 或 privacy。效率最高，但必须保留快捷入口帮助用户发现功能。',
  },
  outline: {
    badge: 'Variant D · complete',
    title: '单页 Outline',
    copy: '全部设置留在一篇可扫描文档中，通过顶部 jump bar 与折叠段落导航。完整但容易随着功能增长变长。',
  },
};

function initSettingsConcepts() {
  const targets = [...document.querySelectorAll('[data-settings-concept-target]')];
  const panels = [...document.querySelectorAll('[data-settings-concept]')];
  if (!targets.length || !panels.length) return;

  const badge = document.querySelector('[data-concept-badge]');
  const title = document.querySelector('[data-concept-title]');
  const copy = document.querySelector('[data-concept-copy]');

  function openConcept(id) {
    if (!conceptCopy[id]) return;
    targets.forEach((target) => {
      target.dataset.active = target.dataset.settingsConceptTarget === id ? 'true' : 'false';
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.settingsConcept !== id;
    });
    if (badge) badge.textContent = conceptCopy[id].badge;
    if (title) title.textContent = conceptCopy[id].title;
    if (copy) copy.textContent = conceptCopy[id].copy;
    window.history.replaceState(null, '', `#${id}`);
  }

  targets.forEach((target) => target.addEventListener('click', () => {
    openConcept(target.dataset.settingsConceptTarget);
  }));

  const requested = window.location.hash.replace('#', '');
  openConcept(conceptCopy[requested] ? requested : 'tabs');
}

function initSettingsHomeConcept() {
  const root = document.querySelector('[data-settings-home]');
  if (!root) return;
  const home = root.querySelector('[data-home-page="home"]');
  const detail = root.querySelector('[data-home-page="detail"]');
  const location = root.querySelector('[data-home-location]');

  root.querySelectorAll('[data-home-open]').forEach((button) => button.addEventListener('click', () => {
    if (home) home.hidden = true;
    if (detail) detail.hidden = false;
    if (location) location.textContent = button.dataset.homeOpen === 'ai' ? 'AI & models' : 'Focused category example';
  }));

  root.querySelectorAll('[data-home-preview]').forEach((button) => button.addEventListener('click', () => {
    showToast(`Variant B: ${button.dataset.homePreview} would open as the same focused detail page.`);
  }));

  root.querySelector('[data-home-back]')?.addEventListener('click', () => {
    if (home) home.hidden = false;
    if (detail) detail.hidden = true;
    if (location) location.textContent = 'Home';
  });
}

function initConceptLocalNavigation() {
  document.querySelectorAll('.concept-tabs__nav, .outline-jumpbar').forEach((nav) => {
    nav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((candidate) => {
        candidate.dataset.active = candidate === button ? 'true' : 'false';
      });
    }));
  });
}

function initSearchFirstConcept() {
  const query = document.querySelector('[data-concept-search]');
  if (!query) return;
  const entries = [...document.querySelectorAll('[data-search-entry]')];
  const empty = document.querySelector('[data-concept-search-empty]');

  function filterResults() {
    const value = query.value.trim().toLowerCase();
    let visible = 0;
    entries.forEach((entry) => {
      entry.hidden = value.length > 0 && !entry.dataset.searchEntry.includes(value);
      if (!entry.hidden) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  query.addEventListener('input', filterResults);
  filterResults();
}

function initVariantToggles() {
  document.querySelectorAll('[data-variant-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
    toggle.dataset.on = toggle.dataset.on === 'true' ? 'false' : 'true';
  }));
}

initSettingsConcepts();
initSettingsHomeConcept();
initSearchFirstConcept();
initVariantToggles();
initConceptLocalNavigation();
