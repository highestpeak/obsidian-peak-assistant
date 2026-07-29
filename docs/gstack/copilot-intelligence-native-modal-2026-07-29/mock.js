const panels = Array.from(document.querySelectorAll('[data-panel]'));
const tabs = Array.from(document.querySelectorAll('.top-tab'));
const scrim = document.querySelector('.modal-scrim');
const prompt = document.querySelector('.prompt-row textarea');

function showPanel(name) {
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
    panel.classList.toggle('is-active', panel.dataset.panel === name);
  });
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === name);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => showPanel(tab.dataset.view));
});

document.getElementById('close-modal')?.addEventListener('click', () => {
  scrim.classList.remove('is-open');
});

document.getElementById('open-modal')?.addEventListener('click', () => {
  scrim.classList.add('is-open');
  showPanel('copilot');
});

const promptBySuggestion = {
  boundary: '帮我把这段补清楚：为什么它应该是独立弹窗，不应该塞进 File Atlas。',
  summary: '补充自动 summary 不能默认出现的原因，保持和 Composer Copilot 建议一致。',
  review: '把这个问题交给 Composer Review，并只保留这边的上下文入口。',
};

document.querySelectorAll('[data-suggestion]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-suggestion]').forEach((current) => current.classList.remove('is-active'));
    button.classList.add('is-active');
    prompt.value = promptBySuggestion[button.dataset.suggestion] || prompt.value;
  });
});

document.querySelectorAll('[data-material]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-material]').forEach((current) => current.classList.remove('is-active'));
    button.classList.add('is-active');
  });
});
