const scenarioButtons = [...document.querySelectorAll('[data-scenario]')];
const originButtons = [...document.querySelectorAll('[data-origin]')];
const composerScene = document.querySelector('.composer-scene');
const nativeScene = document.querySelector('.native-scene');
const intelligencePanel = document.querySelector('.intelligence-panel');
const intelligenceToggle = document.querySelector('.intelligence-toggle');
const originDemo = document.querySelector('.origin-demo');
const focusSourceLabel = document.querySelector('#focus-source-label');
const focusSourceValue = document.querySelector('#focus-source-value');

const originPresentations = {
  toolbar: {
    label: '正在关注',
    value: '“AI 应该贴着当前块给出候选动作”',
  },
  'automatic-suggestion': {
    label: '来自自动建议',
    value: '“补一个输出型 PKM 产品的具体例子”',
  },
  'ask-copilot': {
    label: '来自正文块的「问 Copilot」',
    value: '“AI 应该贴着当前块给出候选动作”',
  },
  'comment-handoff': {
    label: '来自评论交接',
    value: '“这里需要解释候选动作与聊天框的边界”',
  },
};

function selectScenario(name, userTransition = false) {
  scenarioButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.scenario === name));
  const native = name === 'native';
  composerScene.hidden = native;
  nativeScene.hidden = !native;
  originDemo.hidden = name !== 'intelligence';
  composerScene.dataset.scenario = name;
  intelligenceToggle.setAttribute('aria-pressed', String(name === 'intelligence'));
  if (name === 'intelligence' && userTransition) {
    intelligencePanel.classList.remove('user-open');
    requestAnimationFrame(() => {
      intelligencePanel.classList.add('user-open');
      window.setTimeout(() => intelligencePanel.classList.remove('user-open'), 240);
    });
  }
}

function selectOrigin(origin) {
  const presentation = originPresentations[origin] ?? originPresentations.toolbar;
  originButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.origin === origin));
  focusSourceLabel.textContent = presentation.label;
  focusSourceValue.textContent = presentation.value;
  selectScenario('intelligence', true);
}

scenarioButtons.forEach((button) => {
  button.addEventListener('click', () => selectScenario(button.dataset.scenario, button.dataset.scenario === 'intelligence'));
});
originButtons.forEach((button) => {
  button.addEventListener('click', () => selectOrigin(button.dataset.origin));
});
document.querySelectorAll('[data-context-open]').forEach((button) => {
  button.addEventListener('click', () => selectOrigin(button.dataset.contextOpen));
});
document.querySelector('[data-action="native"]').addEventListener('click', () => selectScenario('native'));
document.querySelector('.open-composer-action').addEventListener('click', () => selectScenario('first'));
document.querySelector('.panel-close').addEventListener('click', () => selectScenario('first'));
intelligenceToggle.addEventListener('click', () => {
  const open = intelligenceToggle.getAttribute('aria-pressed') === 'true';
  selectScenario(open ? 'first' : 'intelligence', !open);
});

selectScenario('intelligence', false);
