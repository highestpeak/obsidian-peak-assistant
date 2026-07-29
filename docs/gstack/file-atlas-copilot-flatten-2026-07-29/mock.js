const surface = document.getElementById('surface');
const flattenToggle = document.getElementById('flattenToggle');
const selectedTitle = document.getElementById('selectedTitle');
const selectedKind = document.getElementById('selectedKind');
const selectedLines = document.getElementById('selectedLines');
const selectedPath = document.getElementById('selectedPath');
const suggestedPrompt = document.getElementById('suggestedPrompt');
const suggestionTitle = document.getElementById('suggestionTitle');
const runReceipt = document.getElementById('runReceipt');

function selectedNodePath(node) {
  return node.querySelector('.node-main em')?.textContent || 'Document';
}

function selectNode(node) {
  document.querySelectorAll('.node.selected').forEach((current) => current.classList.remove('selected'));
  node.classList.add('selected');
  selectedTitle.textContent = node.dataset.title || node.querySelector('strong')?.textContent || 'Selected element';
  selectedKind.textContent = node.dataset.kind || 'Block';
  selectedLines.textContent = node.dataset.lines || '-';
  selectedPath.textContent = selectedNodePath(node);
  suggestedPrompt.textContent = selectedNodePath(node);
  suggestionTitle.textContent = node.dataset.prompt || '围绕当前元素生成建议。';
  runReceipt.innerHTML = '<span><svg><use href="#i-clock"/></svg> Ready</span><p>作用域已更新；不会直接改正文。</p>';
}

document.querySelectorAll('.node').forEach((node) => {
  node.addEventListener('click', () => selectNode(node));
});

flattenToggle.addEventListener('click', () => {
  const isFlat = surface.classList.toggle('flat-mode');
  flattenToggle.classList.toggle('is-active', isFlat);
  flattenToggle.title = isFlat ? 'Restore hierarchy' : 'Flatten all hierarchy';
  flattenToggle.setAttribute('aria-label', flattenToggle.title);
  runReceipt.innerHTML = isFlat
    ? '<span><svg><use href="#i-check"/></svg> Flat list</span><p>层级没有丢失；path crumb 保留原始父级，筛选和搜索继续按同一批元素工作。</p>'
    : '<span><svg><use href="#i-check"/></svg> Tree restored</span><p>已恢复原始 heading/list/resource 层级关系。</p>';
});

const actionCopy = {
  ask: {
    title: '问 Copilot',
    body: '会打开与 Composer 相同的 Copilot 对话入口，并携带当前 Atlas 元素作为上下文。',
  },
  carry: {
    title: '带入协作',
    body: '带着当前元素进入协作输入框，不在 Atlas 里直接写入正文。',
  },
  review: {
    title: '打开 Composer Review',
    body: '需要全面 review 或写入候选时跳转到 Composer Review；Atlas 不做持续 review 面板。',
  },
};

document.querySelectorAll('[data-run]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-run]').forEach((current) => current.classList.remove('is-active'));
    button.classList.add('is-active');
    const copy = actionCopy[button.dataset.run] || actionCopy.ask;
    runReceipt.innerHTML = '<span><svg><use href="#i-spark"/></svg> ' + copy.title + '</span><p>' + copy.body + '</p>';
  });
});
