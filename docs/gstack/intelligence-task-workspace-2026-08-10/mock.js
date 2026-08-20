const tasks = {
  planning: {
    label: 'AI Assistant 规划', members: ['AI-peakAssistant-M…'], updatePolicy: '停笔后更新', lastSidecarView: 'suggestions', lastUpdate: '17:35',
    briefTitle: '把 Intelligence 变成可持续的任务工作台', briefDescription: '当前激活 Session 正在追踪；切换到别的 Session 后这里会暂停。',
    userMessage: '我希望保存多个任务，但一次只追踪正在工作的这个 Session。', assistantMessage: 'Tab 保存任务 Session；只有当前 Tab 继续收集，其他 Session 保留建议、草稿和 History。',
    suggestions: [['把 Tab 明确定义为任务 Session', '一次只激活并追踪一个 Session。'], ['让任务文档数量可以直接管理', '成员可查看、加入和移除，变化有回执。'], ['统一 Sidecar 与 Native Modal 的 Session 状态', '两个宿主共享草稿、Run、建议和 History。'], ['保留材料浏览器的完整入口', '窄栏预览与宽幅 List / Folder / Graph 共用快照。']],
    materials: [['Composer Intelligence Sidecar', '当前窄栏交互合同', '94'], ['Native Modal 设计', '原生 Markdown companion', '90'], ['Frozen Run 合同', '写回目标不可漂移', '86']],
    history: [['AI', '记录 Session 模型的产品决策', '17:28 · 当前文档 · +42 −7'], ['U', '补充 Native Modal 的宿主边界', '17:04 · 当前段落 · +18']],
  },
  provider: {
    label: 'Provider 测评', members: ['Provider 测评框架.md', 'OpenRouter 用量记录.md', '模型能力矩阵.md', '测试场景集合.md', '近期模型更新.md', '评测决策记录.md'], updatePolicy: '编辑时更新', lastSidecarView: 'suggestions', lastUpdate: '17:42',
    briefTitle: '建立可持续更新的 Provider 能力评测', briefDescription: '固定评测口径，并让成本、能力与更新时间都能回到真实来源。',
    userMessage: '把模型能力、成本和最近更新时间整理成一个可以持续维护的框架。', assistantMessage: '先固定评测维度，再把每次新评测作为同一 Session 的 Run。新增文档必须明确加入这个 Session。',
    suggestions: [['先固定评测维度，再比较模型', '避免每次测评的口径跟着材料变化。'], ['补充真实成本与用量来源', '当前文档只有能力判断，缺少账单证据。'], ['把最近两次测试归入同一 Run 系列', '便于比较版本变化与结论漂移。'], ['给每个结论附上验证时间', '过期结论可以被快速识别。'], ['区分目录价格与真实账单', 'Provider 标价不等于实际工作负载成本。'], ['把测试场景固定为可重复输入', '后续模型升级时可以直接复测。']],
    materials: [['Provider 测评框架', '当前 Session 主文档', '96'], ['OpenRouter 用量记录', '成本与调用证据', '92'], ['模型能力矩阵', '能力标签来源', '88'], ['测试场景集合', '可重复评测输入', '85'], ['近期模型更新', '时效性材料', '81'], ['评测决策记录', '历史口径', '78']],
    history: [['AI', '补充 OpenRouter 成本证据', '17:39 · 成本章节 · +31'], ['U', '加入 Claude 新版本测试', '16:56 · Session 成员 · +1'], ['AI', '重排模型能力矩阵', '16:20 · 表格 · +12 −9'], ['U', '确认评测维度 v2', '15:43 · 决策记录 · Run #18']],
  },
  landing: {
    label: 'Landing Page 重写', members: ['Landing Page Brief.md', '用户价值叙事.md', 'Graph Composer 证据.md'], updatePolicy: '停笔后更新', lastSidecarView: 'suggestions', lastUpdate: '昨天 21:18',
    briefTitle: '把 Graph 与 Composer 放回首页主叙事', briefDescription: '该 Session 已保存；切换到这里后才恢复追踪。',
    userMessage: '让普通用户一眼知道 Peak Assistant 真正能做什么。', assistantMessage: '建议以“看清整个系统、回到来源工作”为主线，用 Graph 和 Composer 的具体动作证明价值。',
    suggestions: [['首页首屏先说具体结果', '减少泛化的 AI workspace 表述。'], ['让 Graph 与 Composer 成为主角', '它们是当前最清楚的用户价值。'], ['补充一条可验证的工作流', '从 Graph 回到来源完成编辑。']],
    materials: [['Landing Page Brief', '当前叙事基线', '95'], ['Graph 能力审计', '可验证能力', '89'], ['Composer 证据', '来源内工作', '86']], history: [['U', '建立首页重写 Session', '昨天 · 3 篇文档 · Run #12']],
  },
  graph: {
    label: 'Graph 收口', members: ['Graph 能力审计.md', 'File Atlas Graph.md', 'AI Graph Artifact.md', 'Vault Intelligence.md'], updatePolicy: '仅手动', lastSidecarView: 'suggestions', lastUpdate: '周五 18:02',
    briefTitle: '完成现有 Graph，而不是新增第五套 Graph', briefDescription: '该 Session 当前暂停；激活后才检查新的建议。',
    userMessage: '把现有四层 Graph 的边界讲清楚。', assistantMessage: '下一步应补交接与证据定位，而不是再增加一套 Graph。',
    suggestions: [['补齐跨 surface 上下文交接', '优先解决结果如何回到来源。'], ['统一 evidence locator', '避免 Graph 结论无法精确定位。']], materials: [['Graph 能力审计', '四层结构', '96'], ['File Atlas Graph', '当前文档邻域', '90'], ['AI Graph Artifact', '版本化图文件', '84']], history: [['AI', '确认四层 Graph 边界', '周五 · 决策记录 · Run #9']],
  },
};

const candidateMembers = ['产品定价.md', 'Provider Roadmap.md', '模型更新日志.md', '用户访谈摘要.md'];
const reviewSets = {
  provider: {
    title: '统一 Provider 评测框架',
    files: [
      { name: 'Provider 测评框架.md', operation: 'modify', additions: 24, deletions: 6, conflict: false, changes: [{ title: '固定四个评测维度', status: 'pending', additions: 14, deletions: 2 }, { title: '增加证据要求', status: 'pending', additions: 10, deletions: 4 }] },
      { name: '模型能力矩阵.md', operation: 'modify', additions: 18, deletions: 11, conflict: false, changes: [{ title: '统一矩阵列定义', status: 'pending', additions: 12, deletions: 8 }, { title: '补充最近验证时间', status: 'pending', additions: 6, deletions: 3 }] },
      { name: 'OpenRouter 用量记录.md', operation: 'modify', additions: 31, deletions: 2, conflict: false, changes: [{ title: '补齐单位成本', status: 'pending', additions: 22, deletions: 0 }, { title: '关联评测 Run', status: 'pending', additions: 9, deletions: 2 }] },
      { name: 'Provider 发布摘要.md', operation: 'create', additions: 54, deletions: 0, conflict: false, changes: [{ title: '创建 Provider 发布摘要', status: 'pending', additions: 54, deletions: 0 }] },
      { name: '评测结论索引.md', operation: 'modify', additions: 12, deletions: 0, conflict: false, changes: [{ title: '补充结论索引', status: 'pending', additions: 12, deletions: 0 }] },
      { name: '过期价格说明.md', operation: 'modify', additions: 0, deletions: 9, conflict: true, changes: [{ title: '移除过期价格段落', status: 'pending', additions: 0, deletions: 9 }] },
      { name: 'Provider 对外内容通稿.md', operation: 'create', additions: 128, deletions: 0, conflict: false, changes: [{ title: '创建完整的对外内容通稿', status: 'pending', additions: 128, deletions: 0 }] },
      { name: '旧版 Provider 评测.md', operation: 'delete', additions: 0, deletions: 86, conflict: false, changes: [{ title: '删除已被替代的旧版评测', status: 'pending', additions: 0, deletions: 86 }] },
    ],
  },
};

const reviewStateByTask = { provider: { active: true, fileIndex: 1, changeIndex: 0, historyRecorded: false } };
const taskUiState = {};
let activeTaskId = 'provider';
let activeSidecarView = 'suggestions';
let activeModalView = 'suggestions';
let paneOpen = true;
let documentView = 'composer';
let composerContentWidth = 'readable';
let workspaceHistoryPosition = 0;
let documentTransactionPosition = 2;
const workspaceHistoryLength = 3;
const documentTransactionLength = 2;
let reviewPopoverOpen = false;
let reviewPopoverExplicit = false;
let reviewPopoverCloseTimer = null;
let policyPopoverExplicit = false;
let policyPopoverCloseTimer = null;
let relatedModalView = 'list';
let relatedModalSelection = 0;
let relatedSemantic = false;

function activeTask() { return tasks[activeTaskId]; }

function uiState(taskId = activeTaskId) {
  if (!taskUiState[taskId]) {
    taskUiState[taskId] = {
      suggestionsExpanded: false,
      materialPinned: 0,
      materialPreview: null,
      organizedThoughts: [],
      autoPrepare: false,
      history: { source: 'all', effects: [], statuses: [], targets: [] },
    };
  }
  return taskUiState[taskId];
}

function ensureReviewModel(taskId = activeTaskId) {
  if (!reviewSets[taskId]) {
    reviewSets[taskId] = {
      title: `完成“${tasks[taskId].label}”的跨文件调整`,
      files: tasks[taskId].members.slice(0, 4).map((name, index) => ({ name, conflict: false, changes: [{ title: index ? '同步任务上下文' : '补充完成标准', status: 'pending' }] })),
    };
  }
  if (!reviewStateByTask[taskId]) reviewStateByTask[taskId] = { active: false, fileIndex: 0, changeIndex: 0, historyRecorded: false };
  return { set: reviewSets[taskId], state: reviewStateByTask[taskId] };
}

function fileCounts(file) {
  const accepted = file.changes.filter((change) => change.status === 'accepted').length;
  const rejected = file.changes.filter((change) => change.status === 'rejected').length;
  return { total: file.changes.length, accepted, rejected, resolved: accepted + rejected, pending: file.changes.length - accepted - rejected };
}

function fileChangeMeta(file, counts) {
  if (!file || !counts) return { operation: 'context', label: '仅作为任务上下文', detail: '这次 Change Set 不会写入这个文档。', additions: 0, deletions: 0 };
  const operation = file.operation || 'modify';
  const copy = {
    modify: ['修改文档', '接受后只写入已审阅的局部改动。'],
    create: ['新增文档', '接受后将在 Vault 中创建这个新文档。'],
    delete: ['删除整篇', '接受后会将整篇文档移入 Obsidian 回收站，仍可恢复。'],
  };
  return {
    operation,
    label: copy[operation][0],
    detail: copy[operation][1],
    additions: file.additions ?? counts.total * 8,
    deletions: file.deletions ?? counts.total * 3,
  };
}

function fileChangeInlineMarkup(file, counts) {
  const meta = fileChangeMeta(file, counts);
  if (!counts) return '<span class="file-row-meta is-context"><small>上下文</small></span>';
  const pendingChanges = file.changes.filter((change) => change.status === 'pending');
  const hasPerChangeStats = pendingChanges.every((change) => Number.isFinite(change.additions) && Number.isFinite(change.deletions));
  const ratio = counts.pending / Math.max(1, counts.total);
  const additions = hasPerChangeStats ? pendingChanges.reduce((sum, change) => sum + change.additions, 0) : Math.round(meta.additions * ratio);
  const deletions = hasPerChangeStats ? pendingChanges.reduce((sum, change) => sum + change.deletions, 0) : Math.round(meta.deletions * ratio);
  return `<span class="file-row-meta is-${meta.operation}" aria-label="${meta.detail}"><small class="file-additions">${additions ? `+${additions}` : ''}</small><small class="file-deletions">${deletions ? `−${deletions}` : ''}</small></span>`;
}

function reviewCounts(set) {
  return set.files.map(fileCounts).reduce((sum, row) => ({ total: sum.total + row.total, accepted: sum.accepted + row.accepted, rejected: sum.rejected + row.rejected, resolved: sum.resolved + row.resolved, pending: sum.pending + row.pending }), { total: 0, accepted: 0, rejected: 0, resolved: 0, pending: 0 });
}

function closeFloatingPanels(except = null) {
  document.querySelectorAll('[data-create-popover], [data-policy-popover], [data-history-filter-popover], [data-capability-menu]').forEach((panel) => {
    if (panel === except) return;
    panel.hidden = true;
  });
  if (except !== document.querySelector('[data-policy-popover]')) policyPopoverExplicit = false;
}

function taskTabsMarkup() {
  return Object.entries(tasks).map(([id, task]) => `
    <div class="task-tab ${id === activeTaskId ? 'is-active' : ''}" role="presentation" data-task-container="${id}">
      <button type="button" class="task-select" data-task="${id}" role="tab" aria-selected="${id === activeTaskId}" title="${task.label}"><svg><use href="#i-sparkles"/></svg><span>${task.label}</span></button>
      <button type="button" class="task-close" data-close-task="${id}" aria-label="关闭 ${task.label}"><svg><use href="#i-x"/></svg></button>
    </div>`).join('');
}

function renderTaskTabs() {
  document.querySelectorAll('[data-task-list]').forEach((list) => {
    list.innerHTML = taskTabsMarkup();
    list.onwheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    };
  });
  document.querySelectorAll('[data-task]').forEach((button) => button.addEventListener('click', () => {
    activeTaskId = button.dataset.task;
    activeSidecarView = activeTask().lastSidecarView || 'suggestions';
    reviewPopoverOpen = false;
    reviewPopoverExplicit = false;
    closeFloatingPanels();
    renderAll();
  }));
  document.querySelectorAll('[data-close-task]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = Object.keys(tasks);
    if (ids.length === 1) return;
    const closing = button.dataset.closeTask;
    const index = ids.indexOf(closing);
    delete tasks[closing];
    if (closing === activeTaskId) activeTaskId = Object.keys(tasks)[Math.min(index, Object.keys(tasks).length - 1)];
    activeSidecarView = activeTask().lastSidecarView || 'suggestions';
    renderAll();
  }));
  requestAnimationFrame(() => document.querySelectorAll('[data-task-list]').forEach((list) => list.querySelector('.task-tab.is-active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })));
}

function suggestionMarkup(task, modal = false) {
  const state = uiState();
  const items = modal || state.suggestionsExpanded ? task.suggestions : task.suggestions.slice(0, 3);
  return items.map((item, index) => {
    const open = state.openSuggestion === index;
    return `<article class="suggestion-row ${index === 0 ? 'is-primary' : ''} ${open ? 'is-open' : ''}">
      <span class="suggestion-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="suggestion-copy">
        <button type="button" class="suggestion-main" data-suggestion-index="${index}" data-modal-context="${modal}"><strong>${item[0]}</strong><small>${item[1]}</small></button>
        ${open ? `<p class="suggestion-detail">这条建议可以定位到当前正文；只有显式进入对话或 Review 才会继续，不会自动写入。</p>` : ''}
        <footer><span>当前任务清单 · 可定位证据</span><button type="button" data-ask-suggestion="${index}" data-modal-context="${modal}">问 Copilot</button><button type="button" data-defer-suggestion="${index}" title="移到后面" aria-label="移到后面"><svg><use href="#i-list-end"/></svg></button></footer>
      </div>
    </article>`;
  }).join('');
}

function materialInfo(task, index) {
  const item = task.materials[index] || task.materials[0];
  return {
    title: item?.[0] || '当前文档',
    reason: item?.[1] || '当前 Session 来源',
    score: Number(item?.[2] || Math.max(70, 96 - index * 5)),
    excerpt: `围绕“${task.briefTitle}”提供可定位、可审阅的来源内容；它只作为上下文，不会自动成为写入目标。`,
    path: `kb/${activeTaskId}/${String(item?.[0] || 'current-document').replaceAll(' ', '-').toLowerCase()}.md`,
  };
}

function selectedMaterialIndex() {
  const state = uiState();
  return state.materialPreview ?? Math.min(state.materialPinned, Math.max(0, activeTask().materials.length - 1));
}

function materialMarkup(task) {
  const selected = selectedMaterialIndex();
  const pinned = uiState().materialPinned;
  return task.materials.slice(0, 3).map((item, index) => {
    const material = materialInfo(task, index);
    return `<button type="button" class="material-row" data-material-index="${index}" data-previewed="${selected === index}" aria-pressed="${pinned === index}">
      <span class="material-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="material-copy"><strong>${material.title}</strong><small>${material.reason}</small></span>
      <b>${material.score}%</b>
    </button>`;
  }).join('');
}

function materialPreviewMarkup(task) {
  const material = materialInfo(task, selectedMaterialIndex());
  return `<header><strong>材料预览</strong><span>悬浮预览 · 点击固定</span></header>
    <div class="material-preview-copy"><strong>${material.title}</strong><span>${material.reason}</span><p>${material.excerpt}</p><small>${material.path}</small></div>
    <footer><button type="button" class="open-all-materials" data-open-related><svg><use href="#i-expand"/></svg>查看全部材料</button><span></span><button type="button" data-preview-source>查看来源</button><button type="button" data-preview-bring>带入协作</button></footer>`;
}

function thoughtsForTask(task) {
  return task.thoughts || [
    [`把“${task.label}”的判断标准沉淀成模板`, '可能放入任务说明或决策记录。'],
    ['以后比较新版本时保留同一证据口径', '来自最近一次 Copilot Run。'],
  ];
}

function thoughtMarkup(task) {
  const organized = uiState().organizedThoughts;
  return thoughtsForTask(task).map((thought, index) => `
    <details class="thought-row ${organized.includes(index) ? 'is-organized' : ''}">
      <summary><span><strong>${thought[0]}</strong><small>${thought[1]}</small></span><svg><use href="#i-down"/></svg></summary>
      <div><small>来自 Copilot Run #${21 - index}</small><button type="button" data-bring-thought="${index}">带入协作</button><button type="button" data-organize-thought="${index}">${organized.includes(index) ? '已安放' : '标为已安放'}</button></div>
    </details>`).join('');
}

const historySourceLabels = { all: '全部', generation: 'AI 生成', copilot: 'Copilot', document: '正文编辑' };
const historyEffectLabels = { analyze: '分析', rewrite: '改写', insert: '新增' };
const historyStatusLabels = { pending: '待审阅', completed: '已完成', rolledback: '已回滚' };
const historyTargetLabels = { paragraph: '整段', list: '列表项' };

function historyRecords(task) {
  const effectCycle = ['rewrite', 'insert', 'analyze', 'rewrite'];
  const targetCycle = ['paragraph', 'list', 'paragraph', 'paragraph'];
  return task.history.map((item, index) => {
    const parts = item[2].split(' · ');
    const source = item[0] === 'U' ? 'document' : index % 3 === 2 ? 'generation' : 'copilot';
    const status = source !== 'document' && index === 0 ? 'pending' : 'completed';
    return {
      id: `${activeTaskId}-${index}`,
      title: item[1],
      source,
      effect: effectCycle[index % effectCycle.length],
      status,
      target: targetCycle[index % targetCycle.length],
      time: parts[0] || '刚刚',
      targetLabel: parts[1] || '当前正文',
      delta: parts.slice(2).join(' · ') || 'Run 中保留',
      instruction: `围绕“${task.label}”执行：${item[1]}`,
      before: `− 旧内容仍未体现 ${item[1]} 的来源与状态。`,
      after: `+ 已记录 ${item[1]}，并保留可定位的 Run 与正文锚点。`,
    };
  });
}

function filteredHistoryRecords(task) {
  const filters = uiState().history;
  return historyRecords(task).filter((record) => {
    if (filters.source !== 'all' && record.source !== filters.source) return false;
    if (filters.effects.length && !filters.effects.includes(record.effect)) return false;
    if (filters.statuses.length && !filters.statuses.includes(record.status)) return false;
    if (filters.targets.length && !filters.targets.includes(record.target)) return false;
    return true;
  });
}

function historyRowsMarkup(records) {
  if (!records.length) return '<div class="history-empty">当前筛选下没有活动。</div>';
  return `<section class="history-day"><header><span>今天</span><b>${records.length} 条活动</b></header>${records.map((record) => `
    <button type="button" class="history-row" data-history-record="${record.id}">
      <span class="history-kind history-${record.source}"><svg><use href="${record.source === 'document' ? '#i-edit' : '#i-sparkles'}"/></svg></span>
      <span class="history-copy"><span><strong>${record.title}</strong><em class="status-${record.status}">${historyStatusLabels[record.status]}</em></span><small>${record.targetLabel}</small><b>${record.delta}</b></span>
      <time>${record.time}</time><svg class="history-chevron"><use href="#i-chevron"/></svg>
    </button>`).join('')}</section>`;
}

function facetMarkup(type, label, values, records) {
  const selected = uiState().history[type];
  return `<section class="history-facet"><strong>${label}</strong><div>${Object.entries(values).map(([value, copy]) => {
    const count = records.filter((record) => record[type === 'effects' ? 'effect' : type === 'statuses' ? 'status' : 'target'] === value).length;
    if (!count) return '';
    return `<button type="button" data-history-facet="${type}" data-history-facet-value="${value}" aria-pressed="${selected.includes(value)}"><i></i><span>${copy}</span><b>${count}</b></button>`;
  }).join('')}</div></section>`;
}

function renderHistory() {
  const task = activeTask();
  const all = historyRecords(task);
  const filtered = filteredHistoryRecords(task);
  const filters = uiState().history;
  document.querySelector('[data-history-source-filters]').innerHTML = Object.entries(historySourceLabels).map(([value, label]) => {
    const count = value === 'all' ? all.length : all.filter((record) => record.source === value).length;
    return `<button type="button" data-history-source="${value}" class="${filters.source === value ? 'is-active' : ''}">${label} <small>${count}</small></button>`;
  }).join('');
  document.querySelector('[data-history-facets]').innerHTML = facetMarkup('effects', '改动方式', historyEffectLabels, all) + facetMarkup('statuses', '结果状态', historyStatusLabels, all) + facetMarkup('targets', '作用范围', historyTargetLabels, all);
  document.querySelector('[data-sidecar-history]').innerHTML = historyRowsMarkup(filtered);
  document.querySelector('[data-history-filtered-count]').textContent = String(filtered.length);
  document.querySelector('[data-history-filter-showing]').textContent = String(filtered.length);
  const activeCount = filters.effects.length + filters.statuses.length + filters.targets.length;
  const countBadge = document.querySelector('[data-history-active-filter-count]');
  countBadge.hidden = activeCount === 0;
  countBadge.textContent = String(activeCount);
  document.querySelector('[data-history-filter-reset]').hidden = activeCount === 0;

  document.querySelectorAll('[data-history-source]').forEach((button) => button.addEventListener('click', () => {
    filters.source = button.dataset.historySource;
    renderHistory();
  }));
  document.querySelectorAll('[data-history-facet]').forEach((button) => button.addEventListener('click', () => {
    const list = filters[button.dataset.historyFacet];
    const value = button.dataset.historyFacetValue;
    filters[button.dataset.historyFacet] = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    renderHistory();
  }));
  document.querySelectorAll('[data-history-record]').forEach((button) => button.addEventListener('click', () => openHistoryDetail(button.dataset.historyRecord)));
}

function bindSuggestionInteractions() {
  document.querySelectorAll('[data-suggestion-index]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.suggestionIndex);
    uiState().openSuggestion = uiState().openSuggestion === index ? null : index;
    renderTaskData();
  }));
  document.querySelectorAll('[data-ask-suggestion]').forEach((button) => button.addEventListener('click', () => {
    const item = activeTask().suggestions[Number(button.dataset.askSuggestion)];
    activeTask().userMessage = `围绕这条建议继续：${item?.[0] || ''}`;
    if (button.dataset.modalContext === 'true') {
      setHostView('modal', 'talk');
      document.querySelector('[data-modal-prompt]')?.focus();
      return;
    }
    openSidecarTalk();
  }));
  document.querySelectorAll('[data-defer-suggestion]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.deferSuggestion);
    const [item] = activeTask().suggestions.splice(index, 1);
    activeTask().suggestions.push(item);
    renderTaskData();
  }));
}

function bindMaterialInteractions() {
  document.querySelectorAll('[data-material-index]').forEach((button) => {
    const index = Number(button.dataset.materialIndex);
    button.addEventListener('mouseenter', () => previewMaterial(index));
    button.addEventListener('focus', () => previewMaterial(index));
    button.addEventListener('mouseleave', clearMaterialPreview);
    button.addEventListener('blur', clearMaterialPreview);
    button.addEventListener('click', () => {
      uiState().materialPinned = index;
      uiState().materialPreview = null;
      renderMaterials();
    });
  });
}

function previewMaterial(index) {
  uiState().materialPreview = index;
  document.querySelectorAll('[data-material-index]').forEach((button) => { button.dataset.previewed = String(Number(button.dataset.materialIndex) === index); });
  document.querySelector('[data-material-preview]').innerHTML = materialPreviewMarkup(activeTask());
  bindMaterialPreviewActions();
}

function clearMaterialPreview() {
  uiState().materialPreview = null;
  document.querySelectorAll('[data-material-index]').forEach((button) => { button.dataset.previewed = String(Number(button.dataset.materialIndex) === uiState().materialPinned); });
  document.querySelector('[data-material-preview]').innerHTML = materialPreviewMarkup(activeTask());
  bindMaterialPreviewActions();
}

function bindMaterialPreviewActions() {
  document.querySelector('[data-open-related]')?.addEventListener('click', () => openRelatedModal('list'));
  document.querySelector('[data-preview-source]')?.addEventListener('click', (event) => { event.currentTarget.textContent = '已定位'; });
  document.querySelector('[data-preview-bring]')?.addEventListener('click', () => {
    activeTask().userMessage = `把“${materialInfo(activeTask(), selectedMaterialIndex()).title}”带入协作。`;
    openSidecarTalk();
  });
}

function renderMaterials() {
  document.querySelector('[data-sidecar-materials]').innerHTML = materialMarkup(activeTask());
  document.querySelector('[data-material-preview]').innerHTML = materialPreviewMarkup(activeTask());
  bindMaterialInteractions();
  bindMaterialPreviewActions();
}

function bindThoughtInteractions() {
  document.querySelectorAll('[data-bring-thought]').forEach((button) => button.addEventListener('click', () => {
    activeTask().userMessage = `继续整理这个想法：${thoughtsForTask(activeTask())[Number(button.dataset.bringThought)]?.[0] || ''}`;
    openSidecarTalk();
  }));
  document.querySelectorAll('[data-organize-thought]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.organizeThought);
    const organized = uiState().organizedThoughts;
    uiState().organizedThoughts = organized.includes(index) ? organized.filter((item) => item !== index) : [...organized, index];
    document.querySelector('[data-sidecar-thoughts]').innerHTML = thoughtMarkup(activeTask());
    bindThoughtInteractions();
  }));
}

function renderTaskData() {
  const task = activeTask();
  document.querySelectorAll('[data-scope-count], [data-members-count]').forEach((node) => { node.textContent = String(task.members.length); });
  document.querySelectorAll('[data-update-policy]').forEach((node) => { node.textContent = task.updatePolicy; });
  document.querySelectorAll('[data-last-update]').forEach((node) => { node.textContent = `更新于 ${task.lastUpdate}`; });
  document.querySelectorAll('[data-brief-title]').forEach((node) => { node.textContent = task.briefTitle; });
  document.querySelectorAll('[data-brief-description]').forEach((node) => { node.textContent = task.briefDescription; });
  document.querySelectorAll('[data-suggestion-count]').forEach((node) => { node.textContent = String(task.suggestions.length); });
  document.querySelectorAll('[data-material-count]').forEach((node) => { node.textContent = String(task.materials.length); });
  document.querySelectorAll('[data-thought-count]').forEach((node) => { node.textContent = String(thoughtsForTask(task).length - uiState().organizedThoughts.length); });
  document.querySelectorAll('[data-history-count]').forEach((node) => { node.textContent = String(task.history.length); });
  document.querySelectorAll('[data-sidecar-talk-title], [data-prompt-task], [data-modal-task-title]').forEach((node) => { node.textContent = task.label; });
  document.querySelectorAll('[data-user-message]').forEach((node) => { node.textContent = task.userMessage; });
  document.querySelectorAll('[data-assistant-message]').forEach((node) => { node.textContent = task.assistantMessage; });
  document.querySelector('[data-sidecar-suggestions]').innerHTML = suggestionMarkup(task, false);
  document.querySelector('[data-modal-suggestions]').innerHTML = suggestionMarkup(task, true);
  document.querySelector('[data-sidecar-thoughts]').innerHTML = thoughtMarkup(task);
  document.querySelector('[data-toggle-suggestions]').innerHTML = uiState().suggestionsExpanded ? '收起' : `查看全部 <span>${task.suggestions.length}</span> 条建议`;
  document.querySelectorAll('[data-policy]').forEach((button) => button.classList.toggle('is-selected', button.dataset.policy === task.updatePolicy));
  document.querySelector('[data-auto-prepare]').setAttribute('aria-checked', String(uiState().autoPrepare));
  bindSuggestionInteractions();
  bindThoughtInteractions();
  renderMaterials();
  renderHistory();
}

function taskDocumentRows(set, state) {
  const pendingNames = new Set(state.active ? set.files.filter((file) => fileCounts(file).pending > 0).map((file) => file.name) : []);
  return activeTask().members.map((name, index) => ({ name, index })).filter(({ name }) => !pendingNames.has(name)).map(({ name, index }) => {
    return `<div class="task-document-row"><button type="button"><svg><use href="#i-file"/></svg><span>${name}</span></button>${fileChangeInlineMarkup(null, null)}<button type="button" data-remove-member="${index}" aria-label="从任务移除 ${name}" ${activeTask().members.length === 1 ? 'disabled' : ''}><svg><use href="#i-x"/></svg></button></div>`;
  }).join('');
}

function currentChangeSetRows(set, state) {
  return set.files.map((file, index) => ({ file, index, counts: fileCounts(file) })).filter(({ counts }) => counts.pending > 0).map(({ file, index, counts }) => {
    const operation = file.operation || 'modify';
    return `<button type="button" class="change-set-row is-${operation} ${index === state.fileIndex ? 'is-current' : ''}" data-review-file-index="${index}"><svg><use href="#i-file"/></svg><span>${file.name}</span>${file.conflict ? '<em>冲突</em>' : ''}${fileChangeInlineMarkup(file, counts)}</button>`;
  }).join('');
}

function renderReview() {
  const { set, state } = ensureReviewModel();
  const counts = reviewCounts(set);
  state.fileIndex = Math.max(0, Math.min(state.fileIndex, set.files.length - 1));
  const file = set.files[state.fileIndex];
  state.changeIndex = Math.max(0, Math.min(state.changeIndex, file.changes.length - 1));
  const change = file.changes[state.changeIndex];
  const editReview = state.active && counts.pending > 0 && documentView === 'composer';
  const notRaw = documentView !== 'native';
  document.querySelector('[data-review-anchor]').hidden = !notRaw;
  document.querySelector('[data-review-controls]').hidden = !editReview;
  document.querySelector('[data-review-file-controls]').hidden = !editReview;
  document.querySelector('[data-review-docs-group]').hidden = !notRaw;
  document.querySelector('[data-default-document]').hidden = editReview;
  document.querySelector('[data-review-document]').hidden = !editReview;
  document.querySelector('[data-workspace-active-label]').textContent = editReview ? file.name : 'AI-peakAssistant-M…';
  document.querySelector('.document-scroll').dataset.reviewActive = String(editReview);
  const popover = document.querySelector('[data-review-popover]');
  const popoverVisible = notRaw && reviewPopoverOpen;
  popover.classList.toggle('is-open', popoverVisible);
  popover.setAttribute('aria-hidden', String(!popoverVisible));
  document.querySelector('[data-review-progress-label]').textContent = state.active ? `${counts.resolved} / ${counts.total} 已审` : '只读上下文';
  document.querySelector('[data-review-progress-bar]').style.width = `${Math.round((counts.resolved / Math.max(1, counts.total)) * 100)}%`;
  document.querySelectorAll('[data-chat-review-progress]').forEach((node) => { node.style.width = `${Math.round((counts.resolved / Math.max(1, counts.total)) * 100)}%`; });
  document.querySelector('[data-task-document-list]').innerHTML = taskDocumentRows(set, state);
  const currentRows = state.active ? currentChangeSetRows(set, state) : '';
  const pendingFiles = state.active ? set.files.filter((candidate) => fileCounts(candidate).pending > 0).length : 0;
  const contextFiles = activeTask().members.filter((name) => !state.active || !set.files.some((candidate) => candidate.name === name && fileCounts(candidate).pending > 0)).length;
  document.querySelector('[data-change-set-list]').innerHTML = currentRows;
  document.querySelector('[data-review-summary]').textContent = state.active ? `${pendingFiles} 个文件 · ${counts.pending} 处待审改动` : '当前没有打开的 Change Set';
  document.querySelector('[data-context-document-count]').textContent = String(contextFiles);
  document.querySelector('[data-task-context-section]').hidden = contextFiles === 0;
  document.querySelectorAll('[data-review-receipt-title]').forEach((node) => { node.textContent = `计划修改 ${set.files.length} 个文件`; });
  document.querySelectorAll('[data-review-receipt-meta]').forEach((node) => { node.textContent = counts.pending ? `${counts.total} 处改动 · ${counts.pending} 待审 · 尚未写入` : `${counts.total} 处改动 · 审阅完成`; });
  document.querySelectorAll('[data-review-receipt-action]').forEach((node) => { node.textContent = state.active ? '在 Composer 中审阅' : '开始审阅'; });
  const pendingChangeIndexes = file.changes.map((candidate, index) => candidate.status === 'pending' ? index : -1).filter((index) => index >= 0);
  const pendingFileIndexes = set.files.map((candidate, index) => fileCounts(candidate).pending > 0 ? index : -1).filter((index) => index >= 0);
  document.querySelector('[data-review-change-position]').textContent = `${Math.max(0, pendingChangeIndexes.indexOf(state.changeIndex)) + 1} / ${Math.max(1, pendingChangeIndexes.length)}`;
  document.querySelector('[data-review-file-position]').textContent = `${Math.max(0, pendingFileIndexes.indexOf(state.fileIndex)) + 1} / ${Math.max(1, pendingFileIndexes.length)}`;
  document.querySelector('[data-review-reject]').disabled = change.status !== 'pending';
  document.querySelector('[data-review-accept]').disabled = change.status !== 'pending';
  document.querySelector('[data-review-prev-change]').disabled = pendingChangeIndexes.length <= 1;
  document.querySelector('[data-review-next-change]').disabled = pendingChangeIndexes.length <= 1;
  document.querySelector('[data-review-prev-file]').disabled = pendingFileIndexes.length <= 1;
  document.querySelector('[data-review-next-file]').disabled = pendingFileIndexes.length <= 1;
  document.querySelectorAll('[data-review-file-index]').forEach((button) => button.addEventListener('click', () => selectReviewFile(Number(button.dataset.reviewFileIndex))));
  document.querySelectorAll('[data-remove-member]').forEach((button) => button.addEventListener('click', () => {
    if (activeTask().members.length === 1) return;
    const removed = activeTask().members.splice(Number(button.dataset.removeMember), 1)[0];
    activeTask().history.unshift(['U', `从任务移除 ${removed}`, '刚刚 · 任务文档 · −1']);
    renderAll();
    reviewPopoverOpen = true;
    renderReview();
  }));
}

function renderComposerChrome() {
  const surface = document.querySelector('.composer-surface');
  const widthButton = document.querySelector('[data-content-width-toggle]');
  const wide = composerContentWidth === 'wide';
  surface.dataset.contentWidth = composerContentWidth;
  widthButton.setAttribute('aria-pressed', String(wide));
  widthButton.title = wide ? '切换为窄屏' : '切换为宽屏';
  widthButton.setAttribute('aria-label', widthButton.title);
  document.querySelector('[data-content-width-icon]').setAttribute('href', wide ? '#i-readable' : '#i-wide');
  document.querySelector('[data-workspace-back]').disabled = workspaceHistoryPosition >= workspaceHistoryLength - 1;
  document.querySelector('[data-workspace-forward]').disabled = workspaceHistoryPosition <= 0;
  document.querySelector('[data-document-undo]').disabled = documentTransactionPosition <= 0;
  document.querySelector('[data-document-redo]').disabled = documentTransactionPosition >= documentTransactionLength;
}

function selectReviewFile(index) {
  const { set, state } = ensureReviewModel();
  state.fileIndex = (index + set.files.length) % set.files.length;
  const pending = set.files[state.fileIndex].changes.findIndex((change) => change.status === 'pending');
  state.changeIndex = pending >= 0 ? pending : 0;
  renderReview();
}

function moveReviewChange(delta) {
  const { set, state } = ensureReviewModel();
  const changes = set.files[state.fileIndex].changes;
  const pendingIndexes = changes.map((change, index) => change.status === 'pending' ? index : -1).filter((index) => index >= 0);
  if (!pendingIndexes.length) return;
  const current = Math.max(0, pendingIndexes.indexOf(state.changeIndex));
  state.changeIndex = pendingIndexes[(current + delta + pendingIndexes.length) % pendingIndexes.length];
  renderReview();
}

function moveReviewFile(delta) {
  const { set, state } = ensureReviewModel();
  const pendingIndexes = set.files.map((file, index) => fileCounts(file).pending > 0 ? index : -1).filter((index) => index >= 0);
  if (!pendingIndexes.length) return;
  const current = Math.max(0, pendingIndexes.indexOf(state.fileIndex));
  selectReviewFile(pendingIndexes[(current + delta + pendingIndexes.length) % pendingIndexes.length]);
}

function resolveCurrentReview(status) {
  const { set, state } = ensureReviewModel();
  const change = set.files[state.fileIndex].changes[state.changeIndex];
  if (change.status !== 'pending') return;
  change.status = status;
  const ordered = set.files.flatMap((file, fileIndex) => file.changes.map((candidate, changeIndex) => ({ candidate, fileIndex, changeIndex })));
  const current = ordered.findIndex((item) => item.fileIndex === state.fileIndex && item.changeIndex === state.changeIndex);
  const next = [...ordered.slice(current + 1), ...ordered.slice(0, current)].find((item) => item.candidate.status === 'pending');
  if (next) { state.fileIndex = next.fileIndex; state.changeIndex = next.changeIndex; }
  const counts = reviewCounts(set);
  if (!counts.pending && !state.historyRecorded) {
    activeTask().history.unshift(['AI', set.title, `刚刚 · ${set.files.length} 个文件 · +${counts.accepted} −${counts.rejected}`]);
    state.historyRecorded = true;
  }
  renderTaskData();
  renderReview();
}

function setHostView(host, view) {
  if (host === 'sidecar') { activeSidecarView = view; activeTask().lastSidecarView = view; }
  if (host === 'modal') activeModalView = view;
  document.querySelectorAll(`[data-host="${host}"]`).forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  document.querySelectorAll(`[data-${host}-panel]`).forEach((panel) => {
    const active = panel.dataset[`${host}Panel`] === view;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  if (host === 'sidecar' && view === 'history') renderHistory();
}

function renderDocumentView() {
  const native = documentView === 'native';
  document.querySelector('.workspace-main').dataset.documentMode = documentView;
  document.querySelectorAll('[data-document-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.documentView === documentView));
  document.querySelector('[data-document-panel="composer"]').hidden = native;
  document.querySelector('[data-document-panel="native"]').hidden = !native;
  const modalOpen = !document.querySelector('[data-modal-scrim]').hidden;
  document.querySelector('.intelligence-toggle').classList.toggle('is-active', native ? modalOpen : paneOpen);
}

function renderAll() {
  renderTaskTabs();
  renderTaskData();
  setHostView('sidecar', activeSidecarView);
  setHostView('modal', activeModalView);
  document.querySelector('.workspace-main').dataset.paneOpen = String(paneOpen);
  renderComposerChrome();
  renderDocumentView();
  renderReview();
}

function openSidecarTalk() {
  paneOpen = true;
  closeFloatingPanels();
  setHostView('sidecar', 'talk');
  document.querySelector('.workspace-main').dataset.paneOpen = 'true';
  renderTaskData();
  document.querySelector('[data-sidecar-prompt]')?.focus();
}

function openReview() {
  const { set, state } = ensureReviewModel();
  state.active = true;
  const pendingFile = set.files.findIndex((file) => file.changes.some((change) => change.status === 'pending'));
  if (pendingFile >= 0) selectReviewFile(pendingFile);
  document.querySelector('[data-modal-scrim]').hidden = true;
  documentView = 'composer';
  paneOpen = true;
  reviewPopoverOpen = false;
  closeFloatingPanels();
  renderAll();
}

function showReviewPopover() {
  if (documentView === 'native') return;
  if (reviewPopoverCloseTimer) window.clearTimeout(reviewPopoverCloseTimer);
  reviewPopoverOpen = true;
  renderReview();
}

function scheduleReviewPopoverClose() {
  if (reviewPopoverCloseTimer) window.clearTimeout(reviewPopoverCloseTimer);
  reviewPopoverCloseTimer = window.setTimeout(() => {
    const trigger = document.querySelector('[data-members-button]');
    const popover = document.querySelector('[data-review-popover]');
    if (trigger.matches(':hover') || trigger.contains(document.activeElement)) return;
    if (popover.matches(':hover') || popover.contains(document.activeElement)) return;
    reviewPopoverOpen = false;
    reviewPopoverExplicit = false;
    renderReview();
  }, 180);
}

function showPolicyPopover() {
  if (policyPopoverCloseTimer) window.clearTimeout(policyPopoverCloseTimer);
  document.querySelector('[data-policy-popover]').hidden = false;
}

function schedulePolicyPopoverClose() {
  if (policyPopoverCloseTimer) window.clearTimeout(policyPopoverCloseTimer);
  policyPopoverCloseTimer = window.setTimeout(() => {
    const region = document.querySelector('.sidecar-context-actions');
    if (region.matches(':hover') || region.contains(document.activeElement)) return;
    document.querySelector('[data-policy-popover]').hidden = true;
    policyPopoverExplicit = false;
  }, 180);
}

function togglePanel(panel) {
  const opening = panel.hidden;
  closeFloatingPanels(panel);
  panel.hidden = !opening;
  if (opening && panel.matches('[data-create-popover]')) document.querySelector('[data-new-task-name]')?.focus();
}

function sendConversation(textarea) {
  const value = textarea.value.trim();
  if (!value) return;
  activeTask().userMessage = value;
  activeTask().assistantMessage = '收到。对话继续使用当前 Session 的任务文档；任何写入仍会先生成可审阅的 Change Set。';
  textarea.value = '';
  renderTaskData();
}

function openRelatedModal(view = 'list') {
  relatedModalView = view;
  relatedModalSelection = Math.min(selectedMaterialIndex(), activeTask().materials.length - 1);
  document.querySelector('[data-related-materials-modal]').hidden = false;
  renderRelatedModal();
}

function closeRelatedModal() { document.querySelector('[data-related-materials-modal]').hidden = true; }

function relatedItems() {
  const query = document.querySelector('[data-related-filter]').value.trim().toLowerCase();
  return activeTask().materials.map((_, index) => ({ ...materialInfo(activeTask(), index), index })).filter((item) => !query || `${item.title} ${item.reason} ${item.path}`.toLowerCase().includes(query));
}

function relatedListMarkup(items) {
  return `<div class="related-list">${items.map((item) => `<button type="button" data-related-item="${item.index}" class="${item.index === relatedModalSelection ? 'is-selected' : ''}"><span>${String(item.index + 1).padStart(2, '0')}</span><span><strong>${item.title}</strong><small>${item.reason}</small></span><b>${item.score}%</b></button>`).join('')}</div>`;
}

function relatedTreeMarkup(items) {
  const groups = [{ name: 'docs/provider', items: items.slice(0, 3) }, { name: 'evidence/runs', items: items.slice(3) }];
  return `<div class="related-tree">${groups.filter((group) => group.items.length).map((group) => `<section><header><svg><use href="#i-folder"/></svg>${group.name}<b>${group.items.length}</b></header>${group.items.map((item) => `<button type="button" data-related-item="${item.index}" class="${item.index === relatedModalSelection ? 'is-selected' : ''}"><svg><use href="#i-file"/></svg><span>${item.title}</span><small>${item.score}%</small></button>`).join('')}</section>`).join('')}</div>`;
}

function relatedGraphMarkup(items) {
  const positions = [[50, 12], [18, 30], [82, 30], [18, 72], [82, 72], [50, 90]];
  const edges = items.map((_, order) => `<line x1="50" y1="50" x2="${positions[order % positions.length][0]}" y2="${positions[order % positions.length][1]}"/>`).join('');
  return `<div class="related-graph ${relatedSemantic ? 'show-semantic' : ''}"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${edges}<line class="semantic-edge" x1="18" y1="72" x2="82" y2="72"/></svg><span class="current-node">当前正文</span>${items.map((item, order) => `<button type="button" data-related-item="${item.index}" class="graph-node ${item.index === relatedModalSelection ? 'is-selected' : ''}" style="left:${positions[order % positions.length][0]}%;top:${positions[order % positions.length][1]}%"><strong>${item.title}</strong><small>${item.score}%</small></button>`).join('')}</div>`;
}

function renderRelatedModal() {
  const items = relatedItems();
  document.querySelectorAll('[data-related-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.relatedView === relatedModalView));
  document.querySelector('[data-related-semantic]').classList.toggle('is-active', relatedSemantic);
  const projection = document.querySelector('[data-related-projection]');
  projection.innerHTML = relatedModalView === 'graph' ? relatedGraphMarkup(items) : relatedModalView === 'tree' ? relatedTreeMarkup(items) : relatedListMarkup(items);
  const selected = materialInfo(activeTask(), relatedModalSelection);
  document.querySelector('[data-related-inspector]').innerHTML = `<span>来源详情</span><strong>${selected.title}</strong><small>${selected.reason}</small><p>${selected.excerpt}</p><code>${selected.path}</code><button type="button" data-modal-view-source>查看来源</button>`;
  document.querySelectorAll('[data-related-item]').forEach((button) => button.addEventListener('click', () => { relatedModalSelection = Number(button.dataset.relatedItem); renderRelatedModal(); }));
  document.querySelector('[data-modal-view-source]').addEventListener('click', (event) => { event.currentTarget.textContent = '已定位'; });
}

function openHistoryDetail(id) {
  const record = historyRecords(activeTask()).find((item) => item.id === id);
  if (!record) return;
  document.querySelector('[data-history-detail-title]').textContent = record.title;
  document.querySelector('[data-history-detail-meta]').textContent = `${historySourceLabels[record.source]} · ${historyStatusLabels[record.status]} · ${record.time}`;
  document.querySelector('[data-history-detail-instruction]').textContent = record.instruction;
  document.querySelector('[data-history-detail-before]').textContent = record.before;
  document.querySelector('[data-history-detail-after]').textContent = record.after;
  document.querySelector('[data-history-detail-modal]').hidden = false;
}

function closeHistoryDetail() { document.querySelector('[data-history-detail-modal]').hidden = true; }

document.querySelectorAll('[data-host][data-view]').forEach((button) => button.addEventListener('click', () => setHostView(button.dataset.host, button.dataset.view)));
document.querySelectorAll('[data-document-view]').forEach((button) => button.addEventListener('click', () => {
  documentView = button.dataset.documentView;
  if (documentView === 'native') reviewPopoverOpen = false;
  if (documentView !== 'native') document.querySelector('[data-modal-scrim]').hidden = true;
  closeFloatingPanels();
  renderAll();
}));

document.querySelector('[data-content-width-toggle]').addEventListener('click', () => {
  composerContentWidth = composerContentWidth === 'wide' ? 'readable' : 'wide';
  renderComposerChrome();
});

document.querySelector('[data-workspace-back]').addEventListener('click', () => {
  workspaceHistoryPosition = Math.min(workspaceHistoryLength - 1, workspaceHistoryPosition + 1);
  renderComposerChrome();
});

document.querySelector('[data-workspace-forward]').addEventListener('click', () => {
  workspaceHistoryPosition = Math.max(0, workspaceHistoryPosition - 1);
  renderComposerChrome();
});

document.querySelector('[data-document-undo]').addEventListener('click', () => {
  documentTransactionPosition = Math.max(0, documentTransactionPosition - 1);
  renderComposerChrome();
});

document.querySelector('[data-document-redo]').addEventListener('click', () => {
  documentTransactionPosition = Math.min(documentTransactionLength, documentTransactionPosition + 1);
  renderComposerChrome();
});

document.querySelector('.intelligence-toggle').addEventListener('click', () => {
  if (documentView === 'native') {
    document.querySelector('[data-modal-scrim]').hidden = false;
    activeModalView = 'suggestions';
    renderAll();
    return;
  }
  paneOpen = !paneOpen;
  renderAll();
});

document.querySelector('[data-close-pane]').addEventListener('click', () => { paneOpen = false; renderAll(); });
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { document.querySelector('[data-modal-scrim]').hidden = true; renderDocumentView(); }));
document.querySelector('[data-modal-scrim]').addEventListener('click', (event) => { if (event.target.matches('[data-modal-scrim]')) { event.currentTarget.hidden = true; renderDocumentView(); } });

document.querySelectorAll('[data-open-create]').forEach((button) => button.addEventListener('click', () => togglePanel(document.querySelector('[data-create-popover]'))));
document.querySelectorAll('[data-close-create]').forEach((button) => button.addEventListener('click', () => { document.querySelector('[data-create-popover]').hidden = true; }));
document.querySelector('[data-create-popover]').addEventListener('click', (event) => { if (event.target.matches('[data-create-popover]')) event.currentTarget.hidden = true; });
document.querySelector('[data-create-task]').addEventListener('click', () => {
  const input = document.querySelector('[data-new-task-name]');
  const label = input.value.trim() || '新任务';
  const id = `task-${Date.now()}`;
  tasks[id] = { label, members: ['AI-peakAssistant-M…'], updatePolicy: '停笔后更新', lastSidecarView: 'suggestions', lastUpdate: '刚刚', briefTitle: `开始推进“${label}”`, briefDescription: '这个 Session 已成为唯一正在追踪的任务；其他 Session 已暂停。', userMessage: `帮我开始整理“${label}”。`, assistantMessage: 'Session 已建立。当前文档已加入。', suggestions: [['先写清完成标准', '明确结果，后续建议才不会漂移。'], ['确认还需要哪些任务文档', '成员变化只影响读取上下文。']], materials: [['当前文档', 'Session 起始来源', '100']], history: [['U', '创建任务 Session', '刚刚 · 1 篇文档 · Run #1']] };
  activeTaskId = id;
  activeSidecarView = 'suggestions';
  document.querySelector('[data-create-popover]').hidden = true;
  renderAll();
});

const policyRegion = document.querySelector('.sidecar-context-actions');
policyRegion.addEventListener('mouseenter', showPolicyPopover);
policyRegion.addEventListener('mouseleave', schedulePolicyPopoverClose);
policyRegion.addEventListener('focusin', showPolicyPopover);
policyRegion.addEventListener('focusout', (event) => { if (!event.relatedTarget || !policyRegion.contains(event.relatedTarget)) schedulePolicyPopoverClose(); });
document.querySelector('[data-policy-button]').addEventListener('click', () => {
  if (policyPopoverExplicit) {
    document.querySelector('[data-policy-popover]').hidden = true;
    policyPopoverExplicit = false;
    return;
  }
  showPolicyPopover();
  policyPopoverExplicit = true;
});
document.querySelector('[data-close-policy]').addEventListener('click', () => { document.querySelector('[data-policy-popover]').hidden = true; policyPopoverExplicit = false; });
document.querySelectorAll('[data-policy]').forEach((button) => button.addEventListener('click', () => {
  activeTask().updatePolicy = button.dataset.policy;
  activeTask().lastUpdate = '刚刚';
  renderTaskData();
  showPolicyPopover();
}));
document.querySelector('[data-auto-prepare]').addEventListener('click', () => { uiState().autoPrepare = !uiState().autoPrepare; renderTaskData(); showPolicyPopover(); });

document.querySelector('[data-add-member]').addEventListener('click', () => {
  const candidate = candidateMembers.find((name) => !activeTask().members.includes(name));
  if (!candidate) { document.querySelector('[data-member-receipt]').textContent = '没有更多演示文档'; return; }
  activeTask().members.push(candidate);
  activeTask().history.unshift(['U', `加入 ${candidate}`, '刚刚 · 任务文档 · +1']);
  document.querySelector('[data-member-receipt]').textContent = `已加入 ${candidate}`;
  reviewPopoverOpen = true;
  renderAll();
});

document.querySelector('[data-members-button]').addEventListener('click', () => {
  if (reviewPopoverExplicit) { reviewPopoverOpen = false; reviewPopoverExplicit = false; renderReview(); return; }
  reviewPopoverOpen = true;
  reviewPopoverExplicit = true;
  renderReview();
});

document.querySelectorAll('[data-refresh-suggestions]').forEach((button) => button.addEventListener('click', (event) => { activeTask().lastUpdate = '刚刚'; event.currentTarget.classList.add('is-complete'); renderTaskData(); }));
document.querySelector('[data-refresh-materials]').addEventListener('click', (event) => { activeTask().lastUpdate = '刚刚'; event.currentTarget.innerHTML = '<svg><use href="#i-check"/></svg>已更新'; renderTaskData(); });
document.querySelector('[data-start-copilot]').addEventListener('click', openSidecarTalk);
document.querySelector('[data-open-ai-graphs]').addEventListener('click', () => openRelatedModal('graph'));
document.querySelector('[data-toggle-suggestions]').addEventListener('click', () => { uiState().suggestionsExpanded = !uiState().suggestionsExpanded; renderTaskData(); });
document.querySelector('[data-all-capabilities]').addEventListener('click', () => togglePanel(document.querySelector('[data-capability-menu]')));
document.querySelectorAll('[data-capability-menu] button, .capability-strip > button:not([data-all-capabilities])').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('[data-sidecar-prompt]').value = `${button.textContent.trim()}：`;
  document.querySelector('[data-capability-menu]').hidden = true;
  document.querySelector('[data-sidecar-prompt]').focus();
}));
document.querySelector('[data-attach-context]').addEventListener('click', (event) => { event.currentTarget.classList.toggle('is-active'); document.querySelector('[data-prompt-context-status]').textContent = event.currentTarget.classList.contains('is-active') ? '已加入 1 个附件' : '上下文已就绪'; });
document.querySelector('.model-select').addEventListener('click', (event) => {
  const label = event.currentTarget.querySelector('[data-model-label]');
  label.textContent = label.textContent === 'Auto model' ? 'GPT-5.6' : 'Auto model';
});

document.querySelector('[data-send-sidecar-prompt]').addEventListener('click', () => sendConversation(document.querySelector('[data-sidecar-prompt]')));
document.querySelector('[data-send-prompt]').addEventListener('click', () => sendConversation(document.querySelector('[data-modal-prompt]')));
document.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', openReview));
document.querySelectorAll('[data-receipt-tab]').forEach((button) => button.addEventListener('click', () => { button.parentElement.querySelectorAll('button').forEach((current) => current.classList.remove('is-active')); button.classList.add('is-active'); }));

document.querySelector('[data-history-more]').addEventListener('click', () => togglePanel(document.querySelector('[data-history-filter-popover]')));
document.querySelector('[data-history-filter-done]').addEventListener('click', () => { document.querySelector('[data-history-filter-popover]').hidden = true; });
document.querySelector('[data-history-filter-reset]').addEventListener('click', () => { uiState().history.effects = []; uiState().history.statuses = []; uiState().history.targets = []; renderHistory(); });

document.querySelectorAll('[data-close-related-modal]').forEach((button) => button.addEventListener('click', closeRelatedModal));
document.querySelector('[data-related-materials-modal]').addEventListener('click', (event) => { if (event.target.matches('[data-related-materials-modal]')) closeRelatedModal(); });
document.querySelector('[data-related-filter]').addEventListener('input', renderRelatedModal);
document.querySelectorAll('[data-related-view]').forEach((button) => button.addEventListener('click', () => { relatedModalView = button.dataset.relatedView; renderRelatedModal(); }));
document.querySelector('[data-related-semantic]').addEventListener('click', () => { relatedSemantic = !relatedSemantic; renderRelatedModal(); });
document.querySelector('[data-related-fit]').addEventListener('click', (event) => { event.currentTarget.textContent = '已适合'; });
document.querySelector('[data-related-bring]').addEventListener('click', () => { activeTask().userMessage = `把“${materialInfo(activeTask(), relatedModalSelection).title}”带入协作。`; closeRelatedModal(); openSidecarTalk(); });

document.querySelector('[data-close-history-detail]').addEventListener('click', closeHistoryDetail);
document.querySelector('[data-history-detail-modal]').addEventListener('click', (event) => { if (event.target.matches('[data-history-detail-modal]')) closeHistoryDetail(); });
document.querySelector('[data-history-detail-run]').addEventListener('click', (event) => { event.currentTarget.textContent = '已打开'; });
document.querySelector('[data-history-detail-locate]').addEventListener('click', (event) => { event.currentTarget.textContent = '已定位'; });

const reviewPopoverTrigger = document.querySelector('[data-members-button]');
const reviewPopover = document.querySelector('[data-review-popover]');
[reviewPopoverTrigger, reviewPopover].forEach((region) => {
  region.addEventListener('mouseenter', showReviewPopover);
  region.addEventListener('mouseleave', scheduleReviewPopoverClose);
  region.addEventListener('focusin', showReviewPopover);
  region.addEventListener('focusout', scheduleReviewPopoverClose);
});
document.querySelector('[data-review-prev-change]').addEventListener('click', () => moveReviewChange(-1));
document.querySelector('[data-review-next-change]').addEventListener('click', () => moveReviewChange(1));
document.querySelector('[data-review-prev-file]').addEventListener('click', () => moveReviewFile(-1));
document.querySelector('[data-review-next-file]').addEventListener('click', () => moveReviewFile(1));
document.querySelector('[data-review-reject]').addEventListener('click', () => resolveCurrentReview('rejected'));
document.querySelector('[data-review-accept]').addEventListener('click', () => resolveCurrentReview('accepted'));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!document.querySelector('[data-related-materials-modal]').hidden) { closeRelatedModal(); return; }
  if (!document.querySelector('[data-history-detail-modal]').hidden) { closeHistoryDetail(); return; }
  if (reviewPopoverOpen) { reviewPopoverOpen = false; reviewPopoverExplicit = false; renderReview(); return; }
  const floating = [...document.querySelectorAll('[data-create-popover], [data-policy-popover], [data-history-filter-popover], [data-capability-menu]')].find((panel) => !panel.hidden);
  if (floating) { floating.hidden = true; return; }
  if (!document.querySelector('[data-modal-scrim]').hidden) { document.querySelector('[data-modal-scrim]').hidden = true; renderDocumentView(); }
});

renderAll();
