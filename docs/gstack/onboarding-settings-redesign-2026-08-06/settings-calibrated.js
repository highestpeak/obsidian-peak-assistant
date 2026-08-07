const root = document.body;
const themeButton = document.querySelector('[data-theme-toggle]');
const search = document.querySelector('[data-settings-search]');
const searchResults = document.querySelector('[data-search-results]');
const searchItems = [...document.querySelectorAll('[data-search-item]')];
const searchEmpty = document.querySelector('[data-search-empty]');
const providerBackdrop = document.querySelector('[data-provider-backdrop]');
const toast = document.querySelector('[data-toast]');
const saveState = document.querySelector('[data-save-state]');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 1600);
}

function showSaved(message = '所有更改已保存') {
  saveState.lastChild.textContent = message;
  window.setTimeout(() => { saveState.lastChild.textContent = '所有更改已保存'; }, 1400);
}

themeButton.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  themeButton.textContent = next === 'dark' ? '切换浅色' : '切换深色';
});

function closeSearch() {
  searchResults.hidden = true;
}

search.addEventListener('input', () => {
  const value = search.value.trim().toLowerCase();
  searchResults.hidden = value.length === 0;
  let visible = 0;
  for (const item of searchItems) {
    const matches = `${item.dataset.keywords} ${item.textContent}`.toLowerCase().includes(value);
    item.hidden = value.length > 0 && !matches;
    if (!item.hidden) visible += 1;
  }
  searchEmpty.hidden = visible > 0;
});

search.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  search.value = '';
  closeSearch();
  search.blur();
});

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return;
  event.preventDefault();
  search.focus();
  search.select();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.global-search')) closeSearch();
});

for (const item of searchItems) {
  item.addEventListener('click', () => {
    const target = document.getElementById(item.dataset.target);
    closeSearch();
    search.value = '';
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('flash-target');
    window.requestAnimationFrame(() => target.classList.add('flash-target'));
  });
}

function openProviderDrawer() {
  providerBackdrop.hidden = false;
  document.querySelector('[data-close-provider]').focus();
}

function closeProviderDrawer() {
  providerBackdrop.hidden = true;
}

document.querySelectorAll('[data-open-provider]').forEach((button) => button.addEventListener('click', openProviderDrawer));
document.querySelector('[data-close-provider]').addEventListener('click', closeProviderDrawer);
providerBackdrop.addEventListener('click', (event) => {
  if (event.target === providerBackdrop) closeProviderDrawer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !providerBackdrop.hidden) closeProviderDrawer();
});

document.querySelectorAll('[data-preview-page]').forEach((button) => button.addEventListener('click', () => {
  showToast('本轮只聚焦 AI 与模型页面的视觉方向');
}));

document.querySelectorAll('[data-row-action]').forEach((button) => button.addEventListener('click', () => {
  showToast(`${button.dataset.rowAction} · 在当前页面打开连接详情`);
}));

document.querySelectorAll('[data-model-select]').forEach((select) => select.addEventListener('change', () => {
  showSaved('刚刚保存 · 立即生效');
}));

document.querySelector('[data-reset-models]').addEventListener('click', () => {
  document.querySelectorAll('[data-model-select]').forEach((select) => { select.selectedIndex = 0; });
  showToast('所有工作模型已恢复为自动');
  showSaved('刚刚保存 · 立即生效');
});

document.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
  button.dataset.on = button.dataset.on === 'true' ? 'false' : 'true';
  showSaved('刚刚保存 · 立即生效');
}));

document.querySelector('[data-test-all]').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.textContent = '测试中…';
  window.setTimeout(() => {
    button.textContent = '全部正常';
    showToast('OpenAI、OpenRouter、Ollama 与 Codex CLI 均可使用');
    window.setTimeout(() => { button.textContent = '全部测试'; }, 1500);
  }, 700);
});
