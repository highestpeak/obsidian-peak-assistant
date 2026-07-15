(function () {
  'use strict';

  const states = ['empty', 'typing', 'multiline', 'vault-picker', 'command-menu', 'attachments', 'reply-target', 'source-scope', 'run-main', 'model-list', 'fixed-model', 'assistant-list', 'assistant-builder', 'running', 'permission', 'narrow'];
  const state = {
    current: 'empty', openSurface: null, theme: 'light', vaultSearch: false, webSearch: false,
    modelMode: 'auto', modelId: null,
    assistantId: 'default', runView: 'main', modelQuery: '', assistantQuery: ''
  };
  // Illustrative design fixtures only; production must read the model catalog.
  const models = [
    { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI', profile: 'OpenAI · Work', caps: ['视觉', '工具', '128K'] },
    { id: 'o3', label: 'o3', provider: 'OpenAI', profile: 'OpenAI · Work', caps: ['推理', '200K'] },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', profile: 'Anthropic · Primary', caps: ['视觉', '工具', '200K'] },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', profile: 'Google · Research', caps: ['视觉', 'PDF', '工具', '2M'] },
    { id: 'gemini-2.0-flash-thinking', label: 'Gemini 2.0 Flash Thinking', provider: 'Google', profile: 'Google · Research', caps: ['推理', '视觉', 'PDF', '1M', '输出 64K'] },
    { id: 'qwen3', label: 'Qwen 3', provider: 'Ollama', profile: 'Ollama · Local', caps: ['本地', '推理', '工具'] }
  ];
  const assistants = [
    { id: 'default', label: '默认助手', note: '没有额外身份与规则', group: '内置' },
    { id: 'evidence-coach', label: '面试证据教练', note: '证据优先，不编造指标', group: '我的助手' },
    { id: 'architecture-reviewer', label: '架构审阅者', note: '优先检查边界、依赖和取舍', group: '我的助手' },
    { id: 'vault-librarian', label: '知识库研究员', note: '先检索、再综合并标明来源', group: '我的助手' },
    { id: 'spoken-editor', label: '口语表达编辑', note: '把长句改成自然、可复述的表达', group: '我的助手' },
    { id: 'system-design', label: '系统设计面试官', note: '沿约束、权衡和故障场景追问', group: '我的助手' },
    { id: 'document-curator', label: '文档整理助手', note: '维护结构、链接和写回建议', group: '我的助手' }
  ];
  const decisions = {
    empty: ['默认空态', '推荐基线', '<p><strong>默认不展示能力目录。</strong>用户首先表达想得到什么，添加、来源与运行偏好保持低噪。</p><p>项目本身已经提供持续上下文，所以不会再用一个重复的项目 chip 占据输入区。</p>'],
    typing: ['正在输入', '结果意图优先', '<p>输入框只承载用户的结果意图。系统能力不写进 placeholder，也不要求用户先理解模型、Agent 或内部路由。</p>'],
    multiline: ['多行增长', '保持工作记忆', '<p>编辑器随内容增长，到上限后内部滚动。底部控制始终保持位置，避免写长任务时跳动。</p>'],
    'vault-picker': ['[[ 选择文档', '唯一文档语法', '<p><strong>[[ 只代表 Vault 文档。</strong>结果支持最近文档、项目范围与高级检索；选中后形成可悬浮预览的显式 chip。</p>'],
    'command-menu': ['/ 调用工作流', '动作而非身份', '<p><strong>/ 代表可执行工作流。</strong>研究、规划、生成图片或文档都属于工作流，不再和助手、模型混在同一个 segmented control。</p>'],
    attachments: ['多种附件', '显式上下文 shelf', '<p>图片、PDF、链接与 Vault 文档共用一个紧凑 shelf，但保留各自的类型与预览行为。只有显式加入的内容才显示。</p>'],
    'reply-target': ['定向追问', '复用主 Composer', '<p>消息上的“追问”动作只设置一个 reply anchor，然后聚焦主 Composer。不会在消息内部再复制一套输入框、取消与发送。</p>'],
    'source-scope': ['检索范围', '独立开关可组合', '<p>项目上下文来自当前对话；<strong>Vault Search 与 Web Search 是两个独立开关</strong>，可以任意组合。显式加入的附件和文档始终随消息发送。</p>'],
    'run-main': ['对话运行设置', '只展示已接线能力', '<p>Composer 不再伪造“快速 / 平衡 / 最佳”。当前只提供真实可保存的<strong>自动模型 / 指定模型</strong>和对话助手；Settings 中的推荐方案、Harness tiers 与尚未传给模型的 Reasoning Effort 都不冒充本轮控制。</p>'],
    'model-list': ['明确选择模型', 'Profile + model', '<p>遵循 AI behavior 是基线。用户也可以按 <strong>Profile、Provider、模型名或能力</strong>搜索并固定具体模型；能力未声明时不假装支持。</p>'],
    'fixed-model': ['已固定模型', '可见且可逆', '<p>手动覆盖后，Composer 明确显示模型名。重新选择“自动模型”即可恢复路由，避免形成隐藏状态。</p>'],
    'assistant-list': ['选择助手', '当前对话默认身份', '<p>助手本身是长期可复用配置；选择后成为<strong>当前对话的默认身份</strong>，不是一次性运行参数。默认助手不露出，自定义助手会在发送前持续回显。</p>'],
    'assistant-builder': ['AI 创建助手', 'Prompt 优先，设置按需', '<p>一段可编辑 Prompt 是助手的主要定义。AI 只生成名称与摘要预览；知识范围、工具和默认模型收进可选高级设置，保存前仍由用户确认。</p>'],
    running: ['运行中', '随时可打断', '<p>发送按钮原位变成停止，输入框仍可编辑下一条 steer。运行过程应在消息流中给回执，不把 Composer 变成仪表盘。</p>'],
    permission: ['按需授权', '只在需要时出现', '<p>Web、写文件或其他敏感动作只有真正发生时才申请权限，并说明范围。授权不常驻在默认输入框。</p>'],
    narrow: ['窄栏压缩', '保留同一心智', '<p>窄栏不换一套信息架构，只压缩来源与模型文字。添加、来源、运行、发送四个锚点仍保持原位。</p>']
  };

  const stage = document.getElementById('lab-stage');
  const input = document.getElementById('lab-input');
  const shelf = document.getElementById('context-shelf');
  const validation = document.getElementById('validation-row');
  const send = document.getElementById('send-trigger');
  const plusMenu = document.getElementById('plus-menu');
  const sourceMenu = document.getElementById('source-menu');
  const runMenu = document.getElementById('run-menu');
  const vaultPicker = document.getElementById('vault-picker');
  const commandMenu = document.getElementById('command-menu');
  const assistantLayer = document.getElementById('assistant-layer');

  function escapeHtml(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function selectedModelLabel() {
    if (state.modelMode === 'auto') return '自动模型';
    const model = models.find((item) => item.id === state.modelId);
    return model ? `${model.profile} · ${model.label}` : '自动模型';
  }

  function sourceLabel() {
    const labels = ['项目上下文'];
    if (state.vaultSearch) labels.push('Vault');
    if (state.webSearch) labels.push('Web');
    return labels.join(' + ');
  }

  function updateTriggers() {
    document.getElementById('source-label').textContent = sourceLabel();
    document.getElementById('model-label').textContent = selectedModelLabel();
  }

  function updateAssistantChip() {
    shelf.querySelector('[data-assistant-indicator]')?.remove();
    if (state.assistantId === 'default') {
      shelf.classList.toggle('has-items', Boolean(shelf.children.length));
      return;
    }
    const assistant = assistants.find((item) => item.id === state.assistantId);
    const chip = document.createElement('span');
    chip.className = 'shelf-item is-assistant';
    chip.dataset.assistantIndicator = 'true';
    chip.innerHTML = `<i>AI</i><strong>对话助手 · ${escapeHtml(assistant?.label || '自定义助手')}</strong><button type="button" aria-label="恢复默认助手">×</button>`;
    shelf.prepend(chip);
    shelf.classList.add('has-items');
  }

  function shelfItem(type, title, options = {}) {
    if (type === 'image') return '<span class="shelf-item is-image"><img src="./preview-light.png" alt="Chat Studio 界面参考"></span>';
    return `<span class="shelf-item ${options.reply ? 'is-reply' : ''}" data-type="${type}"><i>${escapeHtml(options.mark || type.slice(0, 2).toUpperCase())}</i><strong>${escapeHtml(title)}</strong><button type="button" aria-label="移除">×</button></span>`;
  }

  function setShelf(html) {
    shelf.innerHTML = html;
    updateAssistantChip();
    shelf.classList.toggle('has-items', Boolean(shelf.children.length));
  }

  function setInput(value) {
    input.value = value;
    input.style.height = 'auto';
    input.style.height = `${Math.min(154, input.scrollHeight)}px`;
    send.disabled = !value.trim();
  }

  function renderPlusMenu() {
    plusMenu.innerHTML = `
      <button class="popover-row" type="button" data-add="files"><span>＋</span><span><strong>添加文件或图片</strong><small>PDF、图片、Office、Canvas、Excalidraw</small></span><span></span></button>
      <button class="popover-row" type="button" data-open="vault"><span>[[</span><span><strong>引用知识库文档</strong><small>与在正文输入 [[ 使用同一选择器</small></span><span></span></button>
      <button class="popover-row" type="button" data-add="link"><span>↗</span><span><strong>添加链接</strong><small>粘贴后生成富预览</small></span><span></span></button>`;
  }

  function renderSourceMenu() {
    const options = [
      ['project', 'P', '项目上下文', '当前项目与显式引用 · 始终包含', true, true],
      ['vault', 'V', 'Vault Search', '检索知识库中的其他文档', state.vaultSearch, false],
      ['web', 'W', 'Web Search', '需要最新或外部资料时开启', state.webSearch, false]
    ];
    sourceMenu.innerHTML = `<div class="source-menu-head"><strong>本轮可用信息</strong><small>检索能力可组合；显式附件不受这里影响</small></div>${options.map(([id, mark, label, note, on, locked]) => `<button class="popover-row source-toggle ${on ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}" type="button" data-source-toggle="${id}" aria-pressed="${on}" ${locked ? 'disabled' : ''}><span>${mark}</span><span><strong>${label}</strong><small>${note}</small></span><span class="mini-switch" aria-hidden="true"></span></button>`).join('')}`;
  }

  function renderVaultPicker() {
    vaultPicker.innerHTML = `<label class="picker-search"><input type="search" value="Interview" placeholder="搜索 Vault 或输入支持的检索语法"></label><div class="picker-results">
      <button class="picker-row is-selected" type="button" data-vault="interview-story-bank.md"><span>MD</span><span><strong>interview-story-bank.md</strong><small>AI / Interview · 3,865 words</small></span><span>↵</span></button>
      <button class="picker-row" type="button" data-vault="stateless-redesign.md"><span>MD</span><span><strong>stateless-redesign.md</strong><small>Projects / Architecture · 2,104 words</small></span><span></span></button>
      <button class="picker-row" type="button" data-vault="evidence-matrix.pdf"><span>PDF</span><span><strong>evidence-matrix.pdf</strong><small>Resources · 48 pages</small></span><span></span></button>
      <button class="picker-row" type="button" data-vault="Interview/Story Cards"><span>DIR</span><span><strong>Interview / Story Cards</strong><small>Folder · 12 files</small></span><span></span></button>
      </div><div class="picker-hint">folder:Interview · tag:evidence · ext:pdf · -draft · "exact phrase"</div>`;
  }

  function renderCommandMenu() {
    const commands = [
      ['研究', '研究', '先形成计划，再检索来源并生成带引用的报告'],
      ['规划', '规划', '把目标拆成可执行步骤与检查点'],
      ['图片', '图片', '生成或编辑图片'],
      ['文档', '文档', '生成可保存到 Vault 的文档产物'],
      ['表格', '表格', '生成结构化数据或 Base'],
      ['代码', '代码', '生成、解释或审阅代码']
    ];
    commandMenu.innerHTML = `<label class="picker-search"><input type="search" value="/" placeholder="输入工作流名称"></label><div class="picker-results">${commands.map(([id, label, note], index) => `<button class="picker-row ${index === 0 ? 'is-selected' : ''}" type="button" data-command="${id}"><span>/</span><span><strong>${label}</strong><small>${note}</small></span><span>${index === 0 ? '↵' : ''}</span></button>`).join('')}</div><div class="picker-hint">工作流决定如何完成任务；它不是模型，也不是助手身份。</div>`;
  }

  function runHead(title, subtitle, back) {
    return `<div class="popover-head"><button type="button" data-run-back aria-label="返回" style="${back ? '' : 'visibility:hidden'}">←</button><span><strong>${title}</strong><small>${subtitle}</small></span></div>`;
  }

  function capabilityTags(caps) {
    return `<span class="cap-tags">${caps.map((cap) => `<span>${escapeHtml(cap)}</span>`).join('')}</span>`;
  }

  function modelMatches(model) {
    const query = state.modelQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return [model.id, model.label, model.provider, model.profile, ...model.caps].join(' ').toLocaleLowerCase().includes(query);
  }

  function assistantMatches(assistant) {
    const query = state.assistantQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${assistant.label} ${assistant.note} ${assistant.group}`.toLocaleLowerCase().includes(query);
  }

  function renderRunMenu() {
    if (state.runView === 'model') {
      const filtered = models.filter(modelMatches);
      const groups = [...new Set(filtered.map((model) => model.profile))];
      runMenu.innerHTML = `${runHead('选择模型', '实际选择值是 Profile + model；能力由目录提供', true)}<div class="popover-body model-picker-body">
        <label class="run-list-search"><span>⌕</span><input id="model-search" type="search" value="${escapeHtml(state.modelQuery)}" placeholder="搜索模型、Profile、Provider 或能力"></label>
        <button class="popover-row ${state.modelMode === 'auto' ? 'is-selected' : ''}" type="button" data-model="auto"><span>↺</span><span><strong>自动模型</strong><small>使用当前对话模型；未设置时使用默认 Agent 模型</small></span><span class="row-check">${state.modelMode === 'auto' ? '✓' : ''}</span></button>
        <div class="capability-note"><span>可检索：推理 · 视觉 · PDF · 工具 · Web · 上下文</span><small>当前目录没有 imageGeneration=true，不伪造“生图模型”。</small></div>
        ${groups.map((profile) => `<section class="model-profile"><span class="profile-label">${escapeHtml(profile)}</span>${filtered.filter((model) => model.profile === profile).map((model) => `<button class="popover-row model-row ${state.modelId === model.id ? 'is-selected' : ''}" type="button" data-model="${model.id}"><span>${model.provider.slice(0, 1)}</span><span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.provider)} / ${escapeHtml(model.id)}</small>${capabilityTags(model.caps)}</span><span class="row-check">${state.modelId === model.id ? '✓' : ''}</span></button>`).join('')}</section>`).join('') || '<div class="picker-empty">没有匹配模型</div>'}</div>`;
      return;
    }
    if (state.runView === 'assistant') {
      const filtered = assistants.filter(assistantMatches);
      const groups = [...new Set(filtered.map((assistant) => assistant.group))];
      runMenu.innerHTML = `${runHead('选择助手', '可搜索；选择后成为当前对话默认', true)}<div class="popover-body assistant-picker-body"><label class="run-list-search"><span>⌕</span><input id="assistant-search" type="search" value="${escapeHtml(state.assistantQuery)}" placeholder="搜索助手名称或用途"></label>${groups.map((group) => `<section><span class="profile-label">${escapeHtml(group)}</span>${filtered.filter((assistant) => assistant.group === group).map((assistant) => `<button class="popover-row ${state.assistantId === assistant.id ? 'is-selected' : ''}" type="button" data-assistant="${assistant.id}"><span>${assistant.id === 'default' ? '○' : 'AI'}</span><span><strong>${escapeHtml(assistant.label)}</strong><small>${escapeHtml(assistant.note)}</small></span><span class="row-check">${state.assistantId === assistant.id ? '✓' : ''}</span></button>`).join('')}</section>`).join('') || '<div class="picker-empty">没有匹配助手</div>'}<button class="popover-row create-assistant" type="button" data-create-assistant><span>✦</span><span><strong>用 AI 创建助手</strong><small>用一段 Prompt 生成可检查预览</small></span><span>→</span></button></div>`;
      return;
    }
    const assistant = assistants.find((item) => item.id === state.assistantId);
    runMenu.innerHTML = `${runHead('对话运行设置', '只展示当前已有真实状态的控制', false)}<div class="popover-body"><span class="popover-label">模型</span>
      <button class="popover-row" type="button" data-run-view="model"><span>M</span><span><strong>模型</strong><small>${escapeHtml(selectedModelLabel())}${state.modelMode === 'auto' ? '' : ' · 当前对话覆盖'}</small></span><span>›</span></button>
      <span class="popover-label">对话助手</span>
      <button class="popover-row" type="button" data-run-view="assistant"><span>AI</span><span><strong>助手</strong><small>${assistant?.label || '默认助手'}${state.assistantId === 'default' ? ' · 默认不露出身份' : ''}</small></span><span>›</span></button>
      <div class="run-note">Settings 的推荐方案只是全局配置入口；Fast Lookup / Research / Stronger 是 Agent tiers；Reasoning Effort 当前尚未映射到运行请求，所以这里都不画成可用按钮。工作流仍通过 <kbd>/</kbd> 调用。</div></div>`;
  }

  function closeSurfaces() {
    state.openSurface = null;
    [plusMenu, sourceMenu, runMenu, vaultPicker, commandMenu].forEach((surface) => { surface.classList.remove('is-open'); surface.setAttribute('aria-hidden', 'true'); });
    ['plus-trigger', 'source-trigger', 'run-trigger'].forEach((id) => document.getElementById(id).setAttribute('aria-expanded', 'false'));
  }

  function openSurface(name) {
    closeSurfaces();
    state.openSurface = name;
    const surface = ({ plus: plusMenu, source: sourceMenu, run: runMenu, vault: vaultPicker, command: commandMenu })[name];
    if (name === 'source') renderSourceMenu();
    if (name === 'run') renderRunMenu();
    surface.classList.add('is-open');
    surface.setAttribute('aria-hidden', 'false');
    const triggerId = ({ plus: 'plus-trigger', source: 'source-trigger', run: 'run-trigger' })[name];
    if (triggerId) document.getElementById(triggerId).setAttribute('aria-expanded', 'true');
  }

  function openAssistantBuilder() {
    closeSurfaces();
    assistantLayer.classList.add('is-open');
    assistantLayer.setAttribute('aria-hidden', 'false');
  }

  function closeAssistantBuilder() {
    assistantLayer.classList.remove('is-open');
    assistantLayer.setAttribute('aria-hidden', 'true');
  }

  function renderDecision() {
    const [title, status, copy] = decisions[state.current];
    document.getElementById('decision-title').textContent = title;
    document.getElementById('decision-status').textContent = status;
    document.getElementById('decision-copy').innerHTML = copy;
  }

  function renderState() {
    closeSurfaces();
    closeAssistantBuilder();
    stage.dataset.state = state.current;
    document.querySelectorAll('.state-button').forEach((button) => button.classList.toggle('is-active', button.dataset.state === state.current));
    setShelf('');
    validation.textContent = '';
    validation.classList.remove('is-visible');
    document.querySelector('.permission-strip')?.remove();
    send.classList.remove('is-stop');
    send.textContent = '↑';
    setInput('');

    if (state.current === 'typing') setInput('总结这些材料的共同设计原则');
    if (state.current === 'multiline') setInput('先扫描当前项目里的 UI/UX 文档。\n然后按输入、运行过程、富内容回答和产物分类。\n最后生成一份可以逐项审阅的组件目录。');
    if (state.current === 'vault-picker') { setInput('对比 [[interview'); openSurface('vault'); }
    if (state.current === 'command-menu') { setInput('/'); openSurface('command'); }
    if (state.current === 'attachments') {
      setShelf(`${shelfItem('image', '')}${shelfItem('pdf', 'competitor-ui.pdf', { mark: 'PDF' })}${shelfItem('url', 'openai.com', { mark: '↗' })}${shelfItem('vault', 'message-renderer-audit.md', { mark: '[[' })}`);
      setInput('比较这些材料，整理成带来源的设计决策');
    }
    if (state.current === 'reply-target') {
      setShelf(shelfItem('reply', '追问：为什么选择这三类经历？', { reply: true, mark: '↩' }));
      setInput('第二类的证据具体来自哪些文档？');
    }
    if (state.current === 'source-scope') { setInput('只根据我已有的项目材料回答'); openSurface('source'); }
    if (state.current === 'run-main') { setInput('整理一份完整的竞品与能力差距分析'); state.runView = 'main'; openSurface('run'); }
    if (state.current === 'model-list') { setInput('使用我指定的模型完成这轮分析'); state.runView = 'model'; openSurface('run'); }
    if (state.current === 'fixed-model') { state.modelMode = 'fixed'; state.modelId = 'gemini-2.0-flash-thinking'; updateTriggers(); setInput('使用固定模型审阅这份架构方案'); state.runView = 'model'; openSurface('run'); }
    if (state.current === 'assistant-list') { setInput('只根据证据整理面试故事'); state.runView = 'assistant'; openSurface('run'); }
    if (state.current === 'assistant-builder') { setInput('帮我创建一个可以反复使用的面试证据助手'); openAssistantBuilder(); }
    if (state.current === 'running') { setInput('继续完善 Chat Studio 的产品定位与能力边界'); send.disabled = false; send.classList.add('is-stop'); send.textContent = ''; }
    if (state.current === 'permission') {
      setInput('核对 ChatGPT、Codex 与 NotebookLM 的最新能力');
      const strip = document.createElement('div');
      strip.className = 'permission-strip';
      strip.innerHTML = '<span>需要访问 Web 才能核对最新产品资料</span><button type="button">允许本轮</button>';
      document.getElementById('lab-composer').insertBefore(strip, document.querySelector('.lab-composer-foot'));
    }
    if (state.current === 'narrow') setInput('窄栏仍保持相同的输入心智');
    updateTriggers();
    renderDecision();
  }

  function setState(next, updateHash = true) {
    state.current = states.includes(next) ? next : 'empty';
    if (updateHash) history.replaceState(null, '', `#${state.current}`);
    renderState();
  }

  renderPlusMenu();
  renderSourceMenu();
  renderVaultPicker();
  renderCommandMenu();

  document.querySelectorAll('.state-button').forEach((button) => button.addEventListener('click', () => setState(button.dataset.state)));
  document.getElementById('plus-trigger').addEventListener('click', () => state.openSurface === 'plus' ? closeSurfaces() : openSurface('plus'));
  document.getElementById('source-trigger').addEventListener('click', () => state.openSurface === 'source' ? closeSurfaces() : openSurface('source'));
  document.getElementById('run-trigger').addEventListener('click', () => { state.runView = 'main'; state.openSurface === 'run' ? closeSurfaces() : openSurface('run'); });

  plusMenu.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open]')?.dataset.open;
    if (open) { openSurface(open); return; }
    const add = event.target.closest('[data-add]')?.dataset.add;
    if (!add) return;
    setShelf(add === 'files' ? `${shelfItem('image', '')}${shelfItem('pdf', 'new-document.pdf', { mark: 'PDF' })}` : shelfItem('url', 'https://example.com', { mark: '↗' }));
    closeSurfaces();
  });

  sourceMenu.addEventListener('click', (event) => {
    event.stopPropagation();
    const option = event.target.closest('[data-source-toggle]');
    if (!option) return;
    if (option.dataset.sourceToggle === 'vault') state.vaultSearch = !state.vaultSearch;
    if (option.dataset.sourceToggle === 'web') state.webSearch = !state.webSearch;
    updateTriggers();
    renderSourceMenu();
  });

  runMenu.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target.closest('[data-run-back]')) { state.runView = 'main'; renderRunMenu(); return; }
    const view = event.target.closest('[data-run-view]')?.dataset.runView;
    if (view) { state.runView = view; renderRunMenu(); return; }
    const model = event.target.closest('[data-model]')?.dataset.model;
    if (model) {
      state.modelMode = model === 'auto' ? 'auto' : 'fixed';
      state.modelId = model === 'auto' ? null : model;
      updateTriggers();
      renderRunMenu();
      return;
    }
    const assistant = event.target.closest('[data-assistant]')?.dataset.assistant;
    if (assistant) {
      state.assistantId = assistant;
      updateAssistantChip();
      closeSurfaces();
      return;
    }
    if (event.target.closest('[data-create-assistant]')) { setState('assistant-builder'); }
  });

  runMenu.addEventListener('input', (event) => {
    if (event.target.matches('#model-search')) {
      state.modelQuery = event.target.value;
      renderRunMenu();
      const search = document.getElementById('model-search');
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
      return;
    }
    if (!event.target.matches('#assistant-search')) return;
    state.assistantQuery = event.target.value;
    renderRunMenu();
    const search = document.getElementById('assistant-search');
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  });

  vaultPicker.addEventListener('click', (event) => {
    const picked = event.target.closest('[data-vault]')?.dataset.vault;
    if (!picked) return;
    setShelf(shelfItem('vault', picked, { mark: '[[' }));
    setInput(input.value.replace(/\[\[[^\n]*$/, '') + `[[${picked}]] `);
    closeSurfaces();
    input.focus();
  });

  commandMenu.addEventListener('click', (event) => {
    const command = event.target.closest('[data-command]')?.dataset.command;
    if (!command) return;
    setShelf(shelfItem('workflow', `工作流 · ${command}`, { mark: '/' }));
    setInput(input.value.replace(/\/[^\n]*$/, '') + `请按“${command}”工作流完成：`);
    closeSurfaces();
    input.focus();
  });

  shelf.addEventListener('click', (event) => {
    if (!event.target.closest('.shelf-item > button')) return;
    const item = event.target.closest('.shelf-item');
    if (item?.matches('[data-assistant-indicator]')) {
      state.assistantId = 'default';
      updateAssistantChip();
      return;
    }
    item?.remove();
    shelf.classList.toggle('has-items', Boolean(shelf.children.length));
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(154, input.scrollHeight)}px`;
    send.disabled = !input.value.trim();
    if (input.value.endsWith('[[')) openSurface('vault');
    if (input.value.endsWith('/')) openSurface('command');
  });

  document.getElementById('lab-composer').addEventListener('submit', (event) => {
    event.preventDefault();
    if (send.disabled) return;
    setState(state.current === 'running' ? 'typing' : 'running');
  });

  document.getElementById('close-builder').addEventListener('click', () => setState('assistant-list'));
  document.getElementById('generate-assistant').addEventListener('click', () => {
    const draft = document.getElementById('assistant-draft');
    draft.querySelector('.draft-status em').textContent = '正在生成…';
    setTimeout(() => {
      document.getElementById('assistant-name').value = '面试证据教练';
      document.getElementById('assistant-summary').value = '根据明确提供或允许检索的材料整理证据；区分事实与推断，证据不足时直接提醒。';
      draft.classList.add('is-ready');
      draft.querySelector('.draft-status em').textContent = 'Prompt 与预览可编辑 · 尚未保存';
      document.getElementById('preview-assistant').disabled = false;
      document.getElementById('save-assistant').disabled = false;
    }, 620);
  });
  document.getElementById('preview-assistant').addEventListener('click', () => { document.getElementById('assistant-draft').querySelector('.draft-status em').textContent = '预览通过 · 尚未保存'; });
  document.getElementById('save-assistant').addEventListener('click', () => { state.assistantId = 'evidence-coach'; setState('assistant-list'); });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('theme-dark', state.theme === 'dark');
    document.body.classList.toggle('theme-light', state.theme === 'light');
  });

  document.addEventListener('click', (event) => {
    if (!state.openSurface) return;
    if (event.target.closest('.lab-popover, .picker-surface, #plus-trigger, #source-trigger, #run-trigger')) return;
    closeSurfaces();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (assistantLayer.classList.contains('is-open')) { setState('assistant-list'); return; }
      if (state.openSurface) { closeSurfaces(); return; }
    }
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const keyMap = { '1': 'empty', '2': 'typing', '3': 'multiline', '4': 'vault-picker', '5': 'command-menu', '6': 'attachments', '7': 'reply-target', '8': 'source-scope', '9': 'run-main', '0': 'model-list' };
    if (keyMap[event.key]) setState(keyMap[event.key]);
  });
  window.addEventListener('hashchange', () => setState(location.hash.slice(1), false));

  setState(location.hash.slice(1) || 'empty', false);
}());
