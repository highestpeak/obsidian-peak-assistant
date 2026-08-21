(function () {
  'use strict';

  const fixtures = window.ChatStudioFixtures;
  const defaults = {
    view: 'active',
    activeProjectId: 'project-interview',
    activeConversationId: 'conversation-story',
    leftWidth: 248,
    rightWidth: 304,
    rightCollapsed: false,
    rightTab: 'outline',
    expandedProjects: new Set(fixtures.projects.filter((project) => project.open).map((project) => project.id)),
    expandedTopics: new Set(fixtures.topics.filter((topic) => topic.open).map((topic) => topic.id)),
    theme: 'light',
    reviewVariant: 'canonical',
    reviewOpen: false,
    indexQuery: '',
    indexDirection: 'all',
    indexType: 'all',
    conversationQuery: '',
    conversationTypeFilter: 'all',
    conversationTypeMenuOpen: false,
    vaultDocumentQuery: '',
    titleAlternate: false,
    titlePhase: 'idle',
    titleRunId: 0,
    openSurface: null,
    openRunView: 'main',
    modelMode: 'auto',
    modelId: null,
    modelQuery: '',
    modelFilterOpen: false,
    modelCapabilities: new Set(),
    modelContextMin: 0,
    assistantId: 'default',
    assistantQuery: '',
    vaultSearch: false,
    webSearch: false,
    replyTarget: null,
    workflowId: null,
    addedDocument: null,
    projectTab: 'conversations',
    projectDescriptionEditing: false,
    projectDescriptionDraft: '',
    projectDescriptionOverrides: {},
    rawMessageText: '',
    composerFocused: false,
    contextDetailId: null,
    contextStackMode: 'next',
    drafts: {}
  };

  const state = {
    ...defaults,
    expandedProjects: new Set(defaults.expandedProjects),
    expandedTopics: new Set(defaults.expandedTopics),
    modelCapabilities: new Set(defaults.modelCapabilities),
    projectDescriptionOverrides: { ...defaults.projectDescriptionOverrides },
    drafts: { ...defaults.drafts }
  };

  const path = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icons = {
    search: path('<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>'),
    plus: path('<path d="M12 5v14M5 12h14"></path>'),
    squarePen: path('<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="m16 3 5 5-9 9-5 1 1-5z"></path>'),
    chevronDown: path('<path d="m7 10 5 5 5-5"></path>'),
    chevronRight: path('<path d="m9 18 6-6-6-6"></path>'),
    chevronLeft: path('<path d="m15 18-6-6 6-6"></path>'),
    check: path('<path d="m5 12 4 4L19 6"></path>'),
    chevronsUp: path('<path d="m17 11-5-5-5 5M17 18l-5-5-5 5"></path>'),
    folder: path('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"></path>'),
    folderOpen: path('<path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 2h7.5A1.5 1.5 0 0 1 20 7.5V9"></path><path d="m3 9 2 10h13l3-10z"></path>'),
    message: path('<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>'),
    pin: path('<path d="m12 17 5-5-2-2 1-5-7 7-5 1-2-2 5-5"></path><path d="m7 17-4 4"></path>'),
    bookmark: path('<path d="M6 3h12v18l-6-4-6 4z"></path>'),
    externalLink: path('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>'),
    refresh: path('<path d="M20 6v5h-5M4 18v-5h5"></path><path d="M6.1 9A7 7 0 0 1 18.7 6.5L20 11M4 13l1.3 4.5A7 7 0 0 0 17.9 15"></path>'),
    panelRight: path('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path>'),
    panelRightClose: path('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16m4-4-2-2 2-2"></path>'),
    database: path('<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>'),
    globe: path('<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>'),
    arrowUp: path('<path d="m6 12 6-6 6 6M12 6v12"></path>'),
    copy: path('<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>'),
    star: path('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"></path>'),
    gitBranch: path('<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="7" r="2"></circle><circle cx="6" cy="19" r="2"></circle><path d="M6 7v10M8 12h4a6 6 0 0 0 6-3"></path>'),
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg>',
    file: path('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>'),
    fileText: path('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6M8 13h8M8 17h6"></path>'),
    fileCode: path('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6m-9 5-2 2 2 2m4-4 2 2-2 2"></path>'),
    paperclip: path('<path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5L13 2a4 4 0 0 1 5.7 5.7L9.6 16.8a2 2 0 0 1-2.8-2.8L15 5.8"></path>'),
    image: path('<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m21 15-5-5L5 20"></path>'),
    table: path('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 4v16"></path>'),
    code: path('<path d="m8 9-4 3 4 3m8-6 4 3-4 3m-3-9-2 12"></path>'),
    diagram: path('<rect x="3" y="4" width="6" height="5" rx="1"></rect><rect x="15" y="15" width="6" height="5" rx="1"></rect><path d="M9 6.5h3a3 3 0 0 1 3 3V15"></path>'),
    link: path('<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"></path>'),
    wrench: path('<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2z"></path>'),
    x: path('<path d="m6 6 12 12M18 6 6 18"></path>'),
    history: path('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path>'),
    briefcase: path('<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"></path>'),
    flask: path('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"></path>'),
    layers: path('<path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"></path>'),
    mapPin: path('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"></path><circle cx="12" cy="10" r="2"></circle>'),
    layoutGrid: path('<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>'),
    sliders: path('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>'),
    network: path('<circle cx="12" cy="5" r="2"></circle><circle cx="5" cy="18" r="2"></circle><circle cx="19" cy="18" r="2"></circle><path d="m11 7-5 9m7-9 5 9M7 18h10"></path>'),
    chart: path('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path>'),
    route: path('<circle cx="6" cy="19" r="2"></circle><circle cx="18" cy="5" r="2"></circle><path d="M6 17c0-5 12-3 12-10"></path>'),
    bot: path('<rect x="4" y="6" width="16" height="13" rx="3"></rect><path d="M12 2v4M8 11h.01M16 11h.01M9 15h6"></path>'),
    listTree: path('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>'),
    palette: path('<path d="M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.3H18a3 3 0 0 0 3-3A8.4 8.4 0 0 0 12 3z"></path><circle cx="7.5" cy="10" r="1"></circle><circle cx="10" cy="6.8" r="1"></circle><circle cx="14" cy="6.5" r="1"></circle><circle cx="17" cy="9" r="1"></circle>'),
    ruler: path('<path d="m4 15 11-11 5 5-11 11H4z"></path><path d="m13 6 2 2m-5 1 2 2m-5 1 2 2"></path>'),
    activity: path('<path d="M3 12h4l2-7 4 14 2-7h6"></path>'),
    bookOpen: path('<path d="M3 5a5 5 0 0 1 5-1l4 2v15l-4-2a5 5 0 0 0-5 1zM21 5a5 5 0 0 0-5-1l-4 2v15l4-2a5 5 0 0 1 5 1z"></path>'),
    sparkles: path('<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"></path>'),
    cpu: path('<rect x="7" y="7" width="10" height="10" rx="2"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"></path>'),
    gauge: path('<path d="M4 19a9 9 0 1 1 16 0M12 13l4-4"></path>'),
    brain: path('<path d="M9.5 4A3.5 3.5 0 0 0 6 7.5v.3A4 4 0 0 0 4 15a4 4 0 0 0 5.5 3.7M14.5 4A3.5 3.5 0 0 1 18 7.5v.3A4 4 0 0 1 20 15a4 4 0 0 1-5.5 3.7M9.5 4v16M14.5 4v16"></path>'),
    reply: path('<path d="m9 17-5-5 5-5"></path><path d="M4 12h9a7 7 0 0 1 7 7"></path>'),
    eye: path('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="2.5"></circle>'),
    fileJson: path('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6M9 13c-1 0-1.5.5-1.5 1.5S7 16 6 16m9-3c1 0 1.5.5 1.5 1.5S17 16 18 16"></path>'),
    filePlus: path('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6M12 12v6M9 15h6"></path>'),
    checkSquare: path('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m8 12 3 3 5-6"></path>'),
    pencil: path('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"></path>')
  };

  const messageAdaptiveActions = [
    { id: 'followup', label: '追问', menuLabel: '定向追问', detail: '回到主 Composer，并带上这条回答', icon: 'reply', priority: 1 },
    { id: 'save', label: '保存', menuLabel: '保存到 Vault', detail: '写入项目的 Chat Saves', icon: 'filePlus', priority: 2 },
    { id: 'raw', label: '原始', menuLabel: '查看原始消息', detail: '角色、模型、时间与原始正文', icon: 'eye', priority: 3 },
    { id: 'markdown', label: 'MD', menuLabel: '复制为 Markdown', detail: '保留列表与代码结构', icon: 'copy', priority: 4 },
    { id: 'json', label: 'JSON', menuLabel: '复制为 JSON', detail: '用于调试或外部工作流', icon: 'fileJson', priority: 5 }
  ];

  const elements = {
    app: document.getElementById('app'),
    studio: document.getElementById('studio'),
    centrePanel: document.getElementById('centre-panel'),
    rightPanel: document.getElementById('right-panel'),
    rightSplitter: document.getElementById('right-splitter'),
    restoreRight: document.getElementById('restore-right'),
    leftContent: document.getElementById('left-content'),
    rightContent: document.getElementById('right-content'),
    conversationBody: document.getElementById('conversation-body'),
    composerWrap: document.querySelector('.composer-wrap'),
    conversationTitle: document.getElementById('conversation-title'),
    conversationScope: document.getElementById('conversation-scope'),
    conversationSearchInput: document.getElementById('conversation-search-input'),
    conversationSearch: document.getElementById('conversation-search'),
    conversationSearchResults: document.getElementById('conversation-search-results'),
    conversationTypeTrigger: document.getElementById('conversation-type-trigger'),
    conversationTypeLabel: document.getElementById('conversation-type-label'),
    conversationTypeMenu: document.getElementById('conversation-type-menu'),
    vaultDocumentInput: document.getElementById('vault-document-picker-input'),
    vaultDocumentResults: document.getElementById('vault-document-picker-results'),
    indexSearch: document.getElementById('index-search'),
    composerInput: document.getElementById('composer-input'),
    composerContext: document.getElementById('composer-context'),
    composer: document.getElementById('composer'),
    compactComposer: document.getElementById('composer-compact'),
    contextStackTrigger: document.getElementById('context-stack-trigger'),
    contextStackCount: document.getElementById('context-stack-count'),
    compactContextCount: document.getElementById('compact-context-count'),
    contextStackPopover: document.getElementById('context-stack-popover'),
    contextStackPopoverBody: document.getElementById('context-stack-popover-body'),
    contextStackClose: document.getElementById('context-stack-close'),
    sendButton: document.getElementById('send-button'),
    reviewDrawer: document.getElementById('review-drawer'),
    nativeSearchLayer: document.getElementById('native-search-handoff-layer'),
    conversationSearchLayer: document.getElementById('conversation-search-layer'),
    vaultDocumentLayer: document.getElementById('vault-document-picker-layer'),
    plusMenu: document.getElementById('composer-plus-menu'),
    workflowPopover: document.getElementById('workflow-popover'),
    runPopover: document.getElementById('run-popover'),
    runPanelBody: document.getElementById('run-panel-body'),
    sourcePopover: document.getElementById('source-popover'),
    typeFilterMenu: document.getElementById('type-filter-menu'),
    overlayRoot: document.getElementById('overlay-root'),
    resourceHover: document.getElementById('resource-hover'),
    reviewLeftWidth: document.getElementById('review-left-width'),
    reviewCentreWidth: document.getElementById('review-centre-width'),
    reviewRightWidth: document.getElementById('review-right-width'),
    reviewState: document.getElementById('review-state'),
    reviewVariant: document.getElementById('review-variant'),
    indexCount: document.getElementById('index-count'),
    rawMessageLayer: document.getElementById('raw-message-layer'),
    rawMessageContent: document.getElementById('raw-message-content'),
    headerOpenSource: document.getElementById('header-open-source'),
    regenerateTitle: document.getElementById('regenerate-title')
  };

  function icon(name) {
    const normalized = String(name || 'message').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return icons[normalized] || icons.message;
  }

  function decorateIcons(root) {
    root.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });
    root.querySelectorAll('[data-icon-button]').forEach((node) => { node.innerHTML = icon(node.dataset.iconButton); });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function currentConversation() {
    return state.activeConversationId === 'conversation-catalog' || state.view === 'catalog'
      ? fixtures.catalogConversation
      : fixtures.activeConversation;
  }

  function currentProject() {
    return fixtures.projects.find((project) => project.id === state.activeProjectId) || fixtures.projects[0];
  }

  function currentDraftKey() {
    if (state.view === 'project') return `project:${state.activeProjectId}`;
    if (state.view === 'new') return `new:${state.activeProjectId || 'standalone'}`;
    return `conversation:${state.activeConversationId || 'none'}`;
  }

  function saveCurrentDraft() {
    const value = elements.composerInput.value;
    if (value) state.drafts[currentDraftKey()] = value;
    else delete state.drafts[currentDraftKey()];
  }

  function restoreCurrentDraft() {
    const value = state.drafts[currentDraftKey()] || '';
    elements.composerInput.value = value;
    elements.composerInput.style.height = 'auto';
    elements.composerInput.style.height = value ? `${Math.min(128, elements.composerInput.scrollHeight)}px` : 'auto';
    elements.sendButton.disabled = !value.trim();
    updateStartSurfaceDraftState();
  }

  function conversationRow(conversation, options = {}) {
    const selected = conversation.id === state.activeConversationId;
    const leading = options.pinned ? 'pin' : (conversation.icon || 'message');
    const draggable = options.project || options.recent ? 'true' : 'false';
    const href = conversation.href ? ` data-href="${conversation.href}"` : '';
    return `<button class="nav-row ${options.child ? 'is-child' : ''} ${selected ? 'is-selected' : ''}" type="button" data-conversation="${conversation.id}"${href} draggable="${draggable}">
      <span class="nav-leading">${icon(leading)}</span><span class="row-label">${escapeHtml(conversation.title)}</span>
      <span class="row-trailing"><span class="row-time">${escapeHtml(conversation.meta || conversation.time || '')}</span><span class="row-menu" data-row-menu="${conversation.id}" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-label="对话菜单">${icon('more')}</span></span>
    </button>`;
  }

  function renderLeft() {
    const pinned = fixtures.pinned.map((conversation) => conversationRow(conversation, { pinned: true })).join('');
    const projectRows = fixtures.projects.map((project) => {
      const expanded = state.expandedProjects.has(project.id);
      const selected = state.view === 'project' && state.activeProjectId === project.id;
      const children = expanded ? project.conversations.map((conversation) => conversationRow(conversation, { child: true, project: true })).join('') : '';
      return `<div class="project-block" data-project-drop="${project.id}">
        <div class="nav-row is-project ${selected ? 'is-selected' : ''}">
          <button class="project-disclosure" type="button" data-project-toggle="${project.id}" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'} ${escapeHtml(project.name)}">${expanded ? icon('chevronDown') : icon('chevronRight')}</button>
          <button class="project-open" type="button" data-project-open="${project.id}" aria-label="打开项目 ${escapeHtml(project.name)}"><span class="nav-leading">${icon(expanded ? 'folderOpen' : (project.icon || 'folder'))}</span><span class="row-label">${escapeHtml(project.name)}</span></button>
          <button class="row-menu" type="button" data-project-menu="${project.id}" aria-haspopup="menu" aria-expanded="false" aria-label="项目菜单">${icon('more')}</button>
        </div>${children}</div>`;
    }).join('');
    const recents = fixtures.recents.map((group) => `<div class="recent-group"><div class="section-label subsection-label"><span>${escapeHtml(group.label)}</span></div>${group.conversations.map((conversation) => conversationRow(conversation, { recent: true })).join('')}</div>`).join('');

    elements.leftContent.innerHTML = `
      <section class="nav-section"><div class="section-label"><span>${icon('pin')}置顶</span><span>${fixtures.pinned.length}</span></div>${pinned}</section>
      <section class="nav-section"><div class="section-label"><span>项目</span><span>${fixtures.projects.length}</span></div>${projectRows}</section>
      <section class="nav-section"><div class="section-label"><span>最近</span><button class="section-link" type="button" data-open-history>查看全部</button></div>${recents}</section>`;
  }

  function messageActions(time, targetId, excerpt) {
    const id = escapeHtml(targetId || 'assistant-latest');
    const copy = escapeHtml(excerpt || '');
    const adaptive = messageAdaptiveActions.map((action) => `<button class="meta-action meta-action--adaptive" type="button" data-message-inline-action="${action.id}" data-action-priority="${action.priority}" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="${action.menuLabel}" title="${action.menuLabel}">${icon(action.icon)}<span>${action.label}</span></button>`).join('');
    return `<div class="message-meta" data-message-actions="${id}"><span class="model-chip">gpt-5</span><span class="message-time">${time}</span><div class="message-action-strip">
      <button class="meta-action" type="button" data-message-core data-message-direct="copy" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="复制回答">${icon('copy')}<span>复制</span></button>
      <button class="meta-action" type="button" data-message-core data-message-direct="retry" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="重新生成">${icon('refresh')}<span>重试</span></button>
      <button class="meta-action" type="button" data-message-core data-message-direct="star" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="收藏回答" aria-pressed="false">${icon('star')}<span>收藏</span></button>
      <button class="meta-action" type="button" data-message-core data-message-direct="branch" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="创建分支">${icon('gitBranch')}<span>分支</span></button>
      <button class="meta-action meta-action--compact" type="button" data-message-core data-message-direct="trace" data-message-id="${id}" data-message-excerpt="${copy}" aria-label="查看 Trace">${icon('activity')}<span>Trace</span></button>
      ${adaptive}
      <button class="meta-action meta-action--icon" type="button" data-message-menu="${id}" data-message-excerpt="${copy}" aria-haspopup="menu" aria-expanded="false" aria-label="更多消息操作" hidden>${icon('more')}</button></div></div>`;
  }

  function layoutMessageActions() {
    document.querySelectorAll('.message-meta[data-message-actions]').forEach((row) => {
      const strip = row.querySelector('.message-action-strip');
      const overflow = row.querySelector('[data-message-menu]');
      const adaptive = [...row.querySelectorAll('[data-message-inline-action]')];
      if (!strip || !overflow) return;
      row.classList.remove('is-compact-core');
      adaptive.forEach((button) => { button.hidden = false; });
      overflow.hidden = true;
      const hidden = [];
      const overflows = () => strip.scrollWidth > strip.clientWidth + 1;
      if (overflows()) {
        overflow.hidden = false;
        adaptive.sort((a, b) => Number(b.dataset.actionPriority) - Number(a.dataset.actionPriority)).forEach((button) => {
          if (!overflows()) return;
          button.hidden = true;
          hidden.push(button.dataset.messageInlineAction);
        });
      }
      if (overflows()) row.classList.add('is-compact-core');
      const orderedHidden = messageAdaptiveActions.filter((action) => hidden.includes(action.id)).map((action) => action.id);
      row.dataset.overflowActions = orderedHidden.join(',');
      overflow.hidden = orderedHidden.length === 0;
      overflow.setAttribute('aria-label', orderedHidden.length ? `更多消息操作，${orderedHidden.length} 项` : '更多消息操作');
    });
  }

  function scheduleMessageActionLayout() {
    requestAnimationFrame(layoutMessageActions);
  }

  function suggestedNext(suggestions, targetId, excerpt) {
    const items = suggestions || [];
    const visible = items.slice(0, 2);
    return `<div class="suggestions"><span class="suggestions-label">接下来</span>${visible.map((suggestion) => `<button class="suggestion-chip" type="button" data-suggestion="${escapeHtml(suggestion)}">${icon('externalLink')}<span>${escapeHtml(suggestion)}</span></button>`).join('')}
      <button class="suggestion-more" type="button" data-suggestion-menu data-message-id="${escapeHtml(targetId)}" data-message-excerpt="${escapeHtml(excerpt || '')}" aria-haspopup="menu" aria-expanded="false"><span>更多</span>${icon('chevronDown')}</button></div>`;
  }

  function stateSupplement() {
    if (state.view === 'streaming') return '<div class="state-callout"><span class="streaming-dot" aria-hidden="true"></span><span>正在组织回答；你仍可继续输入下一条要求。</span></div>';
    if (state.view === 'tool-run') return `<div class="agent-origin">${icon('bot')}<strong>Research agent</strong><span>3 tools · 18s</span></div><button class="tool-strip" type="button">${icon('wrench')}<span>读取 12 份材料，搜索 3 个主题，生成证据矩阵</span><span>${icon('chevronDown')}</span></button>`;
    if (state.view === 'resources') return `<div class="resource-strip">${icon('paperclip')}<span>已加入 2 个 Vault 文档和 1 个 PDF</span></div>`;
    return '';
  }

  function renderStandardCentre() {
    const conversation = fixtures.activeConversation;
    if (state.view === 'new') {
      elements.conversationBody.innerHTML = `<section class="new-chat-start" aria-labelledby="new-chat-greeting">
        <div class="new-chat-greeting"><strong id="new-chat-greeting">今天想推进什么？</strong><span>从一个想法开始，或继续最近的工作。</span></div>
        <div id="new-composer-slot" class="new-composer-slot"></div>
        <div class="new-chat-starters" aria-label="开始建议">
          <button type="button" data-start-prompt="继续我最近在做的工作">${icon('history')}<span>继续最近的工作</span></button>
          <button type="button" data-start-prompt="总结最近新增或修改的笔记">${icon('fileText')}<span>总结最近的笔记</span></button>
          <button type="button" data-start-prompt="在知识库里找与当前问题相关的材料">${icon('search')}<span>查找相关材料</span></button>
        </div>
      </section>`;
      return;
    }
    if (state.view === 'empty') {
      elements.conversationBody.innerHTML = '<div class="empty-state"><div><strong>选择一个对话</strong><span>置顶、项目和最近记录都在左侧。</span></div></div>';
      return;
    }
    elements.conversationBody.innerHTML = `<div class="message-list">
      <div class="date-separator"><span>${escapeHtml(conversation.date)}</span></div>
      <div id="turn-previous-user" class="user-message">${escapeHtml(conversation.previousUser)}</div>
      <article id="turn-previous-assistant" class="assistant-message"><div class="assistant-body"><p>${escapeHtml(conversation.previousAssistantIntro)}</p><ul>${conversation.previousPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></div></article>
      <div id="turn-current-user" class="user-message">${escapeHtml(conversation.user)}</div>
      ${stateSupplement()}
      <article id="turn-current-assistant" class="assistant-message"><div class="assistant-body"><p>${escapeHtml(conversation.assistantIntro)}</p><ul>${conversation.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></div>
        ${messageActions('10:43', 'turn-current-assistant', conversation.assistantIntro)}
        ${suggestedNext(conversation.suggestedNext, 'turn-current-assistant', conversation.assistantIntro)}
      </article></div>`;
  }

  function renderProjectTab(project) {
    if (state.projectTab === 'resources') {
      const resources = project.resources || [];
      return `<section class="project-tab-panel"><div class="project-section-head"><div><strong>项目资源</strong><span>加入项目后可被对话显式引用；不会自动把全部正文塞进每一轮。</span></div><button class="text-button project-secondary-action" type="button" data-project-action="add-resource">${icon('plus')}<span>添加资源</span></button></div>
        <div class="project-resource-list">${resources.map((resource) => `<button class="project-resource-row" type="button" data-resource-preview="${escapeHtml(resource.title)}"><span class="project-resource-icon">${icon(resource.kind)}</span><span><strong>${escapeHtml(resource.title)}</strong><small>${escapeHtml(resource.meta)}</small></span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
    }
    if (state.projectTab === 'starred') {
      const starred = project.starred || [];
      return `<section class="project-tab-panel"><div class="project-section-head"><div><strong>收藏消息</strong><span>跨对话保留值得复用的结论和证据边界。</span></div></div>
        <div class="project-starred-list">${starred.map((item) => `<button class="project-starred-row" type="button"><span>${icon('star')}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span>${icon('externalLink')}</button>`).join('') || '<div class="project-empty">这个项目还没有收藏消息。</div>'}</div></section>`;
    }
    if (state.projectTab === 'plans') {
      const plans = project.plans || [];
      return `<section class="project-tab-panel"><div class="project-section-head"><div><strong>项目计划</strong><span>计划是项目层的持续状态，不等同于单轮 Agent 的临时执行步骤。</span></div><button class="text-button project-secondary-action" type="button" data-project-action="new-plan">${icon('plus')}<span>新建计划</span></button></div>
        <div class="project-plan-list">${plans.map((plan) => `<article class="project-plan-row"><span class="project-plan-check">${icon(plan.progress === 100 ? 'checkSquare' : 'listTree')}</span><div><strong>${escapeHtml(plan.title)}</strong><small>${escapeHtml(plan.meta)}</small><span class="project-progress"><i style="width:${Math.max(0, Math.min(100, plan.progress || 0))}%"></i></span></div><button class="icon-button" type="button" aria-label="打开计划">${icon('chevronRight')}</button></article>`).join('') || '<div class="project-empty">还没有项目计划。</div>'}</div></section>`;
    }
    return `<section class="project-tab-panel"><div class="project-section-head"><div><strong>项目对话</strong><span>所有对话共享项目归属，但每一轮仍只使用显式加入的上下文。</span></div><button class="text-button project-secondary-action" type="button" data-project-new>${icon('squarePen')}<span>新对话</span></button></div>
      <div class="project-conversation-list">${project.conversations.map((conversation) => `<button class="project-conversation-row" type="button" data-project-conversation="${conversation.id}"><span class="project-conversation-icon">${icon('message')}</span><span><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(conversation.time || conversation.meta || '')}</small></span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
  }

  function projectDescription(project) {
    return state.projectDescriptionOverrides[project.id] || project.summary || project.description || '';
  }

  function renderProjectDescription(project) {
    if (!state.projectDescriptionEditing) {
      return `<button class="project-description-display" type="button" data-project-description-edit aria-label="编辑项目说明"><span>${escapeHtml(projectDescription(project))}</span><span class="project-description-affordance">${icon('pencil')}<small>编辑</small></span></button>`;
    }
    return `<div class="project-description-editor">
      <label for="project-description-input">项目说明</label>
      <textarea id="project-description-input" data-project-description-input rows="2">${escapeHtml(state.projectDescriptionDraft)}</textarea>
      <div class="project-description-editor-foot"><span id="project-description-status">直接修改，或让 AI 先生成一版可编辑草稿。</span><div>
        <button class="project-description-ai" type="button" data-project-description-ai>${icon('sparkles')}<span>AI 改写</span></button>
        <button class="text-button" type="button" data-project-description-cancel>取消</button>
        <button class="project-description-save" type="button" data-project-description-save>保存</button>
      </div></div>
    </div>`;
  }

  function beginProjectDescriptionEdit() {
    const project = currentProject();
    state.projectDescriptionEditing = true;
    state.projectDescriptionDraft = projectDescription(project);
    renderCentre();
    requestAnimationFrame(() => {
      const input = document.getElementById('project-description-input');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function cancelProjectDescriptionEdit() {
    state.projectDescriptionEditing = false;
    state.projectDescriptionDraft = '';
    renderCentre();
  }

  function saveProjectDescription() {
    const description = state.projectDescriptionDraft.trim();
    if (!description) {
      showToast('项目说明不能为空');
      document.getElementById('project-description-input')?.focus();
      return;
    }
    state.projectDescriptionOverrides[state.activeProjectId] = description;
    state.projectDescriptionEditing = false;
    state.projectDescriptionDraft = '';
    renderCentre();
    showToast('项目说明已保存');
  }

  function generateProjectDescription() {
    const project = currentProject();
    const button = document.querySelector('[data-project-description-ai]');
    const status = document.getElementById('project-description-status');
    if (!button || !status) return;
    button.disabled = true;
    status.textContent = 'AI 正在根据项目对话与资源生成…';
    setTimeout(() => {
      if (!state.projectDescriptionEditing || state.view !== 'project') return;
      const generated = `围绕 ${project.name} 汇集可验证的材料，沉淀可检索、可追问、可复用的项目知识，并持续明确证据边界与下一步。`;
      state.projectDescriptionDraft = generated;
      const input = document.getElementById('project-description-input');
      const currentButton = document.querySelector('[data-project-description-ai]');
      const currentStatus = document.getElementById('project-description-status');
      if (input) input.value = generated;
      if (currentButton) currentButton.disabled = false;
      if (currentStatus) currentStatus.textContent = 'AI 草稿已生成；你可以继续修改，保存前不会覆盖原说明。';
      input?.focus();
    }, 520);
  }

  function renderProjectCentre() {
    const project = currentProject();
    const stats = project.stats || { conversations: project.conversations.length, messages: 0, starred: 0, resources: (project.resources || []).length };
    const tabs = [['conversations', '对话', stats.conversations], ['starred', '收藏', stats.starred], ['resources', '资源', stats.resources], ['plans', '计划', (project.plans || []).length]];
    elements.conversationBody.innerHTML = `<div class="project-page">
      <section class="project-hero${state.projectDescriptionEditing ? ' is-editing-description' : ''}"><span class="project-hero-icon">${icon(project.icon || 'folder')}</span><div class="project-hero-copy"><span class="project-eyebrow">PROJECT</span><strong>${escapeHtml(project.name)}</strong>${renderProjectDescription(project)}</div><div class="project-hero-actions"><button class="project-primary-action" type="button" data-project-new>${icon('squarePen')}<span>新对话</span></button></div></section>
      <div class="project-stats" aria-label="项目统计"><span><strong>${stats.conversations}</strong><small>对话</small></span><span><strong>${stats.messages}</strong><small>消息</small></span><span><strong>${stats.starred}</strong><small>收藏</small></span><span><strong>${stats.resources}</strong><small>资源</small></span></div>
      <section class="project-start-surface" aria-labelledby="project-start-greeting">
        <div class="new-chat-greeting project-chat-greeting"><strong id="project-start-greeting">今天想在这个项目里推进什么？</strong><span>从现有对话、项目材料或下一步计划继续。</span></div>
        <div id="project-composer-slot" class="project-composer-slot" aria-label="在项目中开始新对话"></div>
        <div class="new-chat-starters project-chat-starters" aria-label="项目开始建议">
          <button type="button" data-start-prompt="继续 ${escapeHtml(project.name)} 最近的工作">${icon('history')}<span>继续项目工作</span></button>
          <button type="button" data-start-prompt="总结 ${escapeHtml(project.name)} 的材料和最近进展">${icon('fileText')}<span>总结项目进展</span></button>
          <button type="button" data-start-prompt="根据 ${escapeHtml(project.name)} 的现有资料，建议下一步最值得推进的事项">${icon('route')}<span>规划下一步</span></button>
        </div>
      </section>
      <nav class="project-page-tabs" aria-label="项目视图">${tabs.map(([id, label, count]) => `<button class="${state.projectTab === id ? 'is-active' : ''}" type="button" data-project-tab="${id}" aria-pressed="${state.projectTab === id}"><span>${label}</span><small>${count}</small></button>`).join('')}</nav>
      ${renderProjectTab(project)}
    </div>`;
  }

  function fileCard(type, title, meta, preview) {
    return `<button class="attachment-file" type="button" ${preview ? `data-resource-preview="${escapeHtml(title)}"` : ''}><span class="file-badge" data-file-type="${type.toLowerCase()}">${type}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span></button>`;
  }

  function renderCatalogCentre() {
    elements.conversationBody.innerHTML = `<div class="catalog-list">
      <div class="date-separator"><span>输入类型</span></div>
      <section id="catalog-images" class="catalog-turn catalog-turn--user">
        <div class="catalog-label"><span>用户输入 · 图片组合</span><small>1 / 2 / 3 / 4 / 5–7 / 8+ 有不同布局规则</small></div>
        <div class="permutation-switch" aria-label="图片数量"><button type="button" data-image-count="1">1</button><button class="is-active" type="button" data-image-count="2">2</button><button type="button" data-image-count="3">3</button><button type="button" data-image-count="4">4</button><button type="button" data-image-count="6">6</button><button type="button" data-image-count="8">8+</button></div>
        <div id="catalog-image-grid" class="attachment-images" data-count="2"></div>
        <div class="user-message">比较这两版 Chat Studio 的中栏密度，并把结论写进设计决策。</div>
      </section>

      <section id="catalog-files" class="catalog-turn catalog-turn--user">
        <div class="catalog-label"><span>用户输入 · 文件、URL 与 Vault 上下文</span><small>文件卡只用于附件；Vault 文档保持轻量 chip</small></div>
        <div class="attachment-file-stack">${fileCard('PDF', 'competitor-chat-ui.pdf', '2.8 MB · 48 pages', true)}${fileCard('DOCX', 'interview-notes.docx', '640 KB', false)}${fileCard('MD', 'message-renderer-audit.md', 'Vault · 3,865 words', true)}${fileCard('EXC', 'context-map.excalidraw', 'Vault drawing', false)}</div>
        <div class="file-type-cluster"><span data-type="csv">CSV</span><span data-type="xlsx">XLSX</span><span data-type="pptx">PPTX</span><span data-type="json">JSON</span><span data-type="canvas">CNV</span><span data-type="zip">ZIP</span><small>5+ 文件时切换为 chip cluster</small></div>
        <button class="url-card" type="button"><span class="url-thumb">${icon('globe')}</span><span><small>openai.com</small><strong>Introducing the Codex app</strong><em>Threads organized by projects, parallel agents, artifacts and review…</em></span></button>
        <div class="vault-context-row"><button class="context-chip" type="button" data-resource-preview="interview-story-bank.md">${icon('fileText')}<span>[[interview-story-bank]]</span></button><button class="context-chip" type="button">${icon('folder')}<span>项目 · NZ Software Interview</span></button></div>
        <div class="user-message">根据这些材料，列出当前 Chat 缺失的输入与输出组件。</div>
      </section>

      <div class="date-separator"><span>富内容回答</span></div>
      <section id="catalog-rich-text" class="catalog-output">
        <div class="catalog-label"><span>Streamdown 正文能力</span><small>这些属于正文渲染，不需要再包装成 Artifact 卡</small></div>
        <div class="content-capability-row"><span>Markdown</span><span>引用</span><span>Callout</span><span>Math</span><span>[[Wikilink]]</span><span>Markdown Image</span><span>CJK</span><span>Base</span></div>
      </section>
      <section id="catalog-table" class="catalog-output" data-catalog-anchor="table">
        <div class="catalog-label"><span>Markdown 表格</span><small>表格控制只在 hover 时出现</small></div>
        <div class="rich-table-wrap"><div class="block-actions"><button>${icon('copy')}</button><button>${icon('more')}</button></div><table><thead><tr><th>类型</th><th>输入心智</th><th>推荐展示</th></tr></thead><tbody><tr><td>Vault 文档</td><td>[[ 文档</td><td>Chip + hover preview</td></tr><tr><td>工作流</td><td>/ 命令</td><td>命令菜单 + 状态回执</td></tr><tr><td>文档产物</td><td>要求结果</td><td>Artifact receipt</td></tr></tbody></table></div>
      </section>

      <section id="catalog-code" class="catalog-output" data-catalog-anchor="code">
        <div class="catalog-label"><span>代码、Diff 与 JSON</span><small>代码是可复制内容，Diff 是可审阅工作产物</small></div>
        <div class="code-block"><div class="code-head"><span>typescript · MessageRenderer.tsx</span><button>${icon('copy')} 复制</button></div><pre><code><span class="code-add">+ if (message.artifacts?.length) {</span>\n<span class="code-add">+   return &lt;ArtifactRail items={message.artifacts} /&gt;;</span>\n<span class="code-remove">- return &lt;GenericFileCard /&gt;;</span>\n<span class="code-add">+ }</span></code></pre></div>
      </section>

      <section id="catalog-diagram" class="catalog-output" data-catalog-anchor="diagram">
        <div class="catalog-label"><span>Mermaid / 图表</span><small>复制、下载、全屏、缩放</small></div>
        <div class="diagram-block"><div class="diagram-node">用户输入</div><span>→</span><div class="diagram-node">上下文组装</div><span>→</span><div class="diagram-node is-accent">回答 + 产物</div><div class="block-actions"><button>${icon('externalLink')}</button><button>${icon('more')}</button></div></div>
      </section>

      <section id="catalog-artifacts" class="catalog-output" data-catalog-anchor="artifacts">
        <div class="catalog-label"><span>生成型 Artifact</span><small>这是当前产品缺口：底层可生成，但 Chat 缺少专用结果组件</small></div>
        <div class="artifact-receipt-grid">
          <button class="artifact-receipt">${icon('image')}<span><strong>chat-studio-variant.png</strong><small>Image · 2048×1280</small></span><em>预览</em></button>
          <button class="artifact-receipt">${icon('fileText')}<span><strong>Story Cards.docx</strong><small>Document · 已保存</small></span><em>打开</em></button>
          <button class="artifact-receipt">${icon('diagram')}<span><strong>system-map.excalidraw</strong><small>Drawing · Vault</small></span><em>编辑</em></button>
          <button class="artifact-receipt">${icon('database')}<span><strong>interview-index.base</strong><small>Obsidian Bases</small></span><em>保存并打开</em></button>
        </div>
      </section>

      <section id="catalog-process" class="catalog-output" data-catalog-anchor="process">
        <div class="catalog-label"><span>Agent / Reasoning / Tool</span><small>只有存在非默认 Agent、工具或多模型切换时才显示身份</small></div>
        <div class="agent-origin">${icon('bot')}<strong>Research agent</strong><span>gpt-5 · 深入 · 4 tools · 24s</span></div>
        <button class="reasoning-row" type="button">${icon('brain')}<span><strong>分析过程</strong><small>默认折叠；streaming 时可展开</small></span>${icon('chevronRight')}</button>
        <button class="tool-strip" type="button">${icon('wrench')}<span>搜索 Vault、读取 6 份文档、生成 4 个产物</span>${icon('chevronDown')}</button>
        <div class="message-state-row"><span data-state="streaming">Streaming</span><span data-state="error">Error</span><span data-state="cancelled">Cancelled</span><span data-state="timeout">Timeout</span></div>
        <div class="capability-suggestion">${icon('globe')}<span>这项任务可能需要最新资料。</span><button type="button" data-enable-web>启用 Web Search</button><button type="button" aria-label="关闭">×</button></div>
        ${messageActions('11:20', 'catalog-process', '搜索 Vault、读取 6 份文档、生成 4 个产物')}
      </section>
    </div>`;
    renderCatalogImageGrid(2);
  }

  function renderCatalogImageGrid(count) {
    const grid = document.getElementById('catalog-image-grid');
    if (!grid) return;
    const visible = count >= 8 ? 4 : count;
    grid.dataset.count = String(count);
    grid.innerHTML = Array.from({ length: visible }, (_, index) => `<button type="button"><img src="${index % 2 === 0 ? './preview-light.png' : './gate0-1440.png'}" alt="Chat Studio 参考图 ${index + 1}">${count >= 8 && index === visible - 1 ? '<span class="image-more">+4</span>' : ''}</button>`).join('');
  }

  function renderCentre() {
    const conversation = currentConversation();
    placeComposerInShell();
    elements.centrePanel.dataset.view = state.view;
    const projectView = state.view === 'project';
    if (state.titlePhase === 'idle') {
      const title = projectView ? currentProject().name : (state.titleAlternate ? conversation.alternateTitle : conversation.title);
      elements.conversationTitle.textContent = state.view === 'new' ? '新对话' : title;
    }
    elements.conversationTitle.classList.toggle('is-thinking', state.titlePhase === 'thinking');
    elements.conversationTitle.classList.toggle('is-typing', state.titlePhase === 'typing');
    elements.conversationScope.textContent = state.view === 'new' ? '' : (projectView ? '项目主页' : conversation.scope);
    elements.headerOpenSource.hidden = projectView;
    elements.regenerateTitle.hidden = projectView;
    if (projectView) renderProjectCentre();
    else if (state.view === 'catalog' || state.activeConversationId === 'conversation-catalog') renderCatalogCentre();
    else renderStandardCentre();
    placeComposerForCurrentView();
    decorateIcons(elements.conversationBody);
    renderComposerContext();
    renderContextStack();
    updateAdaptiveComposer();
    updateStartSurfaceDraftState();
    scheduleMessageActionLayout();
  }

  function placeComposerInShell() {
    if (elements.composerWrap.parentElement === elements.centrePanel && elements.composerWrap.previousElementSibling === elements.conversationBody) return;
    elements.centrePanel.insertBefore(elements.composerWrap, elements.conversationBody.nextSibling);
  }

  function placeComposerForCurrentView() {
    const slotId = state.view === 'project' ? 'project-composer-slot' : state.view === 'new' ? 'new-composer-slot' : null;
    if (!slotId) return;
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.appendChild(elements.composerWrap);
  }

  function updateStartSurfaceDraftState() {
    document.querySelectorAll('.new-chat-start, .project-start-surface').forEach((start) => {
      start.classList.toggle('has-draft', Boolean(elements.composerInput.value.trim()));
    });
  }

  function isActiveConversationPlacement() {
    return state.view === 'active' || state.view === 'catalog';
  }

  function isNearConversationBottom() {
    const body = elements.conversationBody;
    return body.scrollHeight - body.clientHeight - body.scrollTop <= 96;
  }

  function contextStackLayers() {
    const assistant = assistants.find((item) => item.id === state.assistantId);
    const resources = 1 + (state.addedDocument ? 1 : 0) + (state.vaultSearch ? 1 : 0) + (state.webSearch ? 1 : 0);
    return [
      { group: 'Foundation', id: 'system', title: 'System prompt', summary: 'Peak Assistant 的安全、格式与工具边界。', state: 'Required', source: 'runtime policy', reason: '每个 turn 都需要', treatment: 'Exact at send time' },
      { group: 'Foundation', id: 'assistant', title: assistant?.label || 'Assistant', summary: assistant?.summary || '默认对话身份；没有额外的自定义指令。', state: assistant ? 'Included' : 'Empty', source: assistant ? 'saved assistant' : 'no selection', reason: assistant ? '你为本次对话选择的身份' : '没有额外身份层', treatment: assistant ? 'Preview only' : 'Not included' },
      { group: 'Conversation & work', id: 'history', title: 'Recent history', summary: '当前 active variant 的最近消息。', state: 'Required', source: 'conversation history', reason: '保持本轮上下文连续', treatment: 'May be compressed to fit budget' },
      { group: 'Conversation & work', id: 'working', title: 'Working context', summary: state.view === 'catalog' ? 'Chat Studio UI/UX 项目与当前资料。' : '面试准备项目与当前文档。', state: 'Included', source: 'project + active note', reason: '当前工作空间', treatment: 'Preview only' },
      { group: 'Conversation & work', id: 'summary', title: 'Conversation summary', summary: '已持久化的较早对话压缩摘要。', state: 'Included', source: 'conversation summary', reason: '补足窗口外历史', treatment: 'Compressed' },
      { group: 'Conversation & work', id: 'activity-index', title: 'Activity index', summary: '本对话已生成的关键活动与可定位结果。', state: 'Included', source: 'conversation activity index', reason: '避免重复查找已完成工作', treatment: 'Preview only' },
      { group: 'Personal context', id: 'profile', title: 'User profile', summary: '中文优先、引用证据、保持边界清楚。', state: 'Included', source: 'user profile', reason: '长期表达偏好', treatment: 'Preview only' },
      { group: 'Retrieval & this turn', id: 'previous-analysis', title: 'Previous analysis', summary: '当前 active variant 的最近分析结论。', state: 'Included', source: 'active variant', reason: '延续已验证的判断', treatment: 'Preview only' },
      { group: 'Retrieval & this turn', id: 'resources', title: `${resources} resource index`, summary: state.addedDocument ? `显式文件：${state.addedDocument}` : '项目资料与显式引用。', state: 'Included', source: 'attachments + explicit refs', reason: '本轮选择的资料', treatment: 'Actual consulted sources appear in receipt' }
    ];
  }

  function renderContextStack() {
    const layers = contextStackLayers();
    const groups = new Map();
    layers.forEach((layer) => groups.set(layer.group, [...(groups.get(layer.group) || []), layer]));
    const frozen = state.view === 'streaming' || state.view === 'tool-run';
    const layerRows = [...groups.entries()].map(([group, rows]) => `<div class="context-stack-group">${escapeHtml(group)}</div>${rows.map((layer, index) => {
      const open = state.contextDetailId === layer.id;
      return `<button class="context-stack-row ${open ? 'is-open' : ''}" type="button" data-context-layer="${layer.id}" aria-expanded="${open}"><span class="context-stack-row__order">${String(index + 1).padStart(2, '0')}</span><span class="context-stack-row__copy"><strong>${escapeHtml(layer.title)}</strong><small>${escapeHtml(layer.summary)}</small></span><span class="context-stack-state">${escapeHtml(layer.state)}</span></button>${open ? `<section class="context-stack-detail"><p>${escapeHtml(layer.summary)}</p><dl><dt>来源</dt><dd>${escapeHtml(layer.source)}</dd><dt>为何包含</dt><dd>${escapeHtml(layer.reason)}</dd><dt>处理</dt><dd>${escapeHtml(layer.treatment)}</dd></dl></section>` : ''}`;
    }).join('')}`).join('');
    const active = layers.filter((layer) => layer.state !== 'Empty').length;
    const receipt = `<div class="context-stack-receipt"><div class="context-stack-receipt__summary"><strong>Last receipt</strong><span>已冻结 · ${active} 个层级</span></div><dl><dt>Model</dt><dd>GPT-5 · OpenAI</dd><dt>Context</dt><dd>${active} 个显式层级；资源按实际检索写入</dd><dt>Outcome</dt><dd>发送后可从消息回执复查实际使用的资源。</dd></dl></div>`;
    elements.contextStackPopoverBody.innerHTML = state.contextStackMode === 'receipt'
      ? `<div class="context-stack-list">${receipt}</div><aside class="context-stack-excluded"><strong>回执边界</strong><small>这是已发生的运行记录，不会反过来改变下一条消息的预计范围。</small><div>未使用的候选资料不会出现在回执中。</div><div>模型、工具与实际资源以发送时冻结结果为准。</div></aside>`
      : `<div class="context-stack-list"><div class="context-stack-metrics"><strong>${frozen ? 'Frozen' : 'Expected'}</strong><span>${active} 个 active layers · 自动预算</span></div>${layerRows}</div><aside class="context-stack-excluded"><strong>不在本轮</strong><small>明确排除能避免“整个 Vault 都会自动送进模型”的误解。</small><div>整个 Vault：只会经 Vault Search 检索后进入。</div><div>未选择的文档与未执行的 Web 结果。</div><div>Inactive variants 与 parent branch 的非 active history。</div></aside>`;
    elements.contextStackCount.textContent = `${active} 项`;
    elements.compactContextCount.textContent = String(active);
  }

  function updateAdaptiveComposer() {
    const active = isActiveConversationPlacement();
    const hasDraft = Boolean(elements.composerInput.value.trim());
    const hasContext = Boolean(state.replyTarget || state.workflowId || state.addedDocument || state.assistantId !== 'default');
    const hasOpenSurface = Boolean(state.openSurface);
    const inputFocused = document.activeElement === elements.composerInput;
    const expanded = !active || isNearConversationBottom() || inputFocused || hasDraft || hasContext || hasOpenSurface;
    elements.composer.dataset.display = expanded ? 'expanded' : 'compact';
    elements.composer.dataset.placement = active ? 'active' : 'start';
    if (!active && state.openSurface === 'context') closeSurfaces();
  }

  function positionContextStackPopover() {
    const trigger = elements.contextStackTrigger.getBoundingClientRect();
    const width = Math.min(trigger.width, window.innerWidth - 32);
    elements.contextStackPopover.style.width = `${width}px`;
    elements.contextStackPopover.style.left = `${Math.max(16, Math.min(trigger.left, window.innerWidth - width - 16))}px`;
    elements.contextStackPopover.style.top = `${Math.max(16, trigger.top - Math.min(560, window.innerHeight - 32) - 8)}px`;
  }

  function renderComposerContext() {
    const catalog = state.view === 'catalog' || state.activeConversationId === 'conversation-catalog';
    const project = currentProject();
    const documentChip = state.view === 'project'
      ? `<button class="context-chip" type="button">${icon('folder')}<span>项目 · ${escapeHtml(project.name)}</span></button>`
      : state.view === 'new' || state.view === 'empty'
      ? ''
      : catalog
        ? `<button class="context-chip" type="button" data-resource-preview="message-renderer-audit.md">${icon('fileText')}<span>message-renderer-audit.md</span>${icon('x')}</button>`
        : `<button class="context-chip" type="button" data-resource-preview="interview-story-bank.md">${icon('fileText')}<span>interview-story-bank.md</span>${icon('x')}</button>`;
    const replyChip = state.replyTarget
      ? `<button class="context-chip is-reply" type="button" data-remove-reply aria-label="移除追问定位">${icon('reply')}<span>追问：${escapeHtml(state.replyTarget.excerpt)}</span>${icon('x')}</button>`
      : '';
    const assistant = assistants.find((item) => item.id === state.assistantId);
    const assistantChip = state.assistantId !== 'default'
      ? `<button class="context-chip is-assistant" type="button" data-reset-assistant aria-label="恢复默认助手">${icon('bot')}<span>对话助手 · ${escapeHtml(assistant?.label || '自定义助手')}</span>${icon('x')}</button>`
      : '';
    const workflow = workflows.find((item) => item.id === state.workflowId);
    const workflowChip = workflow
      ? `<button class="context-chip is-workflow" type="button" data-remove-workflow aria-label="移除本轮工作流">${icon('route')}<span>本轮工作流 · ${escapeHtml(workflow.label)}</span>${icon('x')}</button>`
      : '';
    const addedDocumentChip = state.addedDocument
      ? `<button class="context-chip" type="button" data-remove-document data-resource-preview="${escapeHtml(state.addedDocument)}">${icon('fileText')}<span>${escapeHtml(state.addedDocument)}</span>${icon('x')}</button>`
      : '';
    elements.composerContext.innerHTML = `${replyChip}${assistantChip}${workflowChip}${documentChip}${addedDocumentChip}`;
    elements.composerInput.placeholder = state.replyTarget ? '继续追问这条回答…' : state.view === 'project' ? `在 ${project.name} 中开始新对话…` : '问你的项目、资料或当前工作…';
  }

  function activeTopics() {
    return state.view === 'catalog' || state.activeConversationId === 'conversation-catalog' ? fixtures.catalogTopics : fixtures.topics;
  }

  function activeStarredTopics() {
    return activeTopics().map((topic) => ({ ...topic, rows: topic.rows.filter((row) => row.starred) })).filter((topic) => topic.rows.length > 0);
  }

  function activeArtifacts() {
    return state.view === 'catalog' || state.activeConversationId === 'conversation-catalog' ? fixtures.catalogArtifacts : fixtures.artifacts;
  }

  const typeOptions = [
    ['all', '全部类型', 'layers'], ['text', '消息', 'message'], ['image', '图片', 'image'],
    ['document', '文档', 'fileText'], ['link', '链接', 'link'], ['context', '知识库上下文', 'bookOpen'],
    ['table', '表格 / 数据', 'table'], ['code', '代码 / Diff', 'code'], ['diagram', '图表', 'diagram'],
    ['drawing', 'Canvas / Drawing', 'network'], ['database', 'Bases', 'database'], ['process', '运行过程', 'wrench']
  ];

  function typeForKind(kind) {
    return ({ image: 'image', file: 'document', paperclip: 'document', link: 'link', bookOpen: 'context', folder: 'context', table: 'table', code: 'code', diagram: 'diagram', canvas: 'drawing', excalidraw: 'drawing', database: 'database', brain: 'process', wrench: 'process', bot: 'process', sparkles: 'process', message: 'text', messageUser: 'text' })[String(kind).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] || 'text';
  }

  function targetForRow(title) {
    const targets = {
      'Story Cards 的目标与边界': 'turn-previous-user', '证据索引的三层结构': 'turn-previous-assistant',
      '筛选最完整经历': 'turn-current-user', '证据完整度分组': 'turn-current-assistant',
      '建议的整理顺序': 'turn-current-assistant', '先从性能优化开始': 'turn-current-assistant',
      '图片组合与预览': 'catalog-images', 'PDF / DOCX / Markdown': 'catalog-files',
      '链接富预览': 'catalog-files', 'Vault 文档与 [[wikilink]]': 'catalog-files', '项目级上下文': 'catalog-files',
      '表格与结构化数据': 'catalog-table', '代码与 Diff': 'catalog-code', 'Mermaid / 图表': 'catalog-diagram',
      '生成图片': 'catalog-artifacts', '生成文档': 'catalog-artifacts', 'Obsidian Bases': 'catalog-artifacts',
      'Reasoning disclosure': 'catalog-process', 'Tool sequence': 'catalog-process', 'Agent / Persona identity': 'catalog-process',
      'Suggested next / Capability': 'catalog-process'
    };
    return targets[title] || 'turn-current-assistant';
  }

  function activeResources() {
    const catalog = state.view === 'catalog' || state.activeConversationId === 'conversation-catalog';
    const inputs = catalog ? [
      { title: '2 张界面参考图', meta: 'Image · 用户上传', kind: 'image', type: 'image', target: 'catalog-images' },
      { title: 'competitor-chat-ui.pdf', meta: 'PDF · 48 pages', kind: 'fileText', type: 'document', target: 'catalog-files' },
      { title: 'Introducing the Codex app', meta: 'URL · openai.com', kind: 'link', type: 'link', target: 'catalog-files' },
      { title: 'message-renderer-audit.md', meta: 'Vault 文档', kind: 'bookOpen', type: 'context', target: 'catalog-files' },
      { title: 'Chat Studio UI/UX', meta: '项目上下文', kind: 'folder', type: 'context', target: 'catalog-files' }
    ] : [
      { title: 'interview-story-bank.md', meta: 'Vault 文档', kind: 'bookOpen', type: 'context', target: 'turn-current-user' },
      { title: 'NZ Software Interview', meta: '项目上下文', kind: 'folder', type: 'context', target: 'turn-current-user' }
    ];
    const outputs = activeArtifacts().map((artifact) => ({
      title: artifact.title, meta: `${artifact.type} · ${artifact.state}`, kind: artifact.kind,
      type: typeForKind(artifact.kind), target: catalog ? 'catalog-artifacts' : 'turn-current-assistant'
    }));
    return [
      ...inputs.map((item) => ({ ...item, direction: 'input' })),
      ...outputs.map((item) => ({ ...item, direction: 'output' }))
    ];
  }

  function renderTypeFilterMenu() {
    elements.typeFilterMenu.innerHTML = typeOptions.map(([id, label, iconName]) => `<button class="type-filter-option ${state.indexType === id ? 'is-selected' : ''}" type="button" role="menuitemradio" aria-checked="${state.indexType === id}" data-index-type="${id}"><span>${icon(iconName)}</span><span>${label}</span><span class="type-check">${state.indexType === id ? icon('check') : ''}</span></button>`).join('');
    document.getElementById('type-filter-label').textContent = typeOptions.find(([id]) => id === state.indexType)?.[1] || '全部类型';
  }

  function renderRight() {
    const query = state.indexQuery.trim().toLocaleLowerCase();
    renderTypeFilterMenu();
    document.querySelectorAll('[data-direction]').forEach((button) => button.classList.toggle('is-active', button.dataset.direction === state.indexDirection));
    if (state.view === 'project') {
      elements.rightContent.innerHTML = '';
      elements.indexCount.textContent = '';
      return;
    }
    if (state.view === 'new' || state.view === 'empty') {
      elements.rightContent.innerHTML = '<div class="empty-state"><div><strong>还没有对话索引</strong><span>发送第一条消息后，大纲与资源会在这里出现。</span></div></div>';
      elements.indexCount.textContent = '0 条索引';
      return;
    }
    if (state.rightTab === 'resources') {
      const resources = activeResources().filter((resource) => {
        if (state.indexDirection !== 'all' && resource.direction !== state.indexDirection) return false;
        if (state.indexType !== 'all' && resource.type !== state.indexType) return false;
        return !query || `${resource.title} ${resource.meta}`.toLocaleLowerCase().includes(query);
      });
      const directions = [['input', '本轮引用'], ['output', '本轮生成']];
      elements.rightContent.innerHTML = directions.map(([direction, label]) => {
        const items = resources.filter((resource) => resource.direction === direction);
        if (!items.length) return '';
        return `<section class="artifact-group"><div class="section-label"><span>${label}</span><span>${items.length}</span></div>${items.map((resource) => `<button class="artifact-row" type="button" data-index-target="${resource.target}" data-resource-direction="${direction}" data-resource-type="${resource.type}"><span class="artifact-icon">${icon(resource.kind)}</span><span class="artifact-meta"><span class="artifact-title">${escapeHtml(resource.title)}</span><span class="artifact-type">${escapeHtml(resource.meta)}</span></span></button>`).join('')}</section>`;
      }).join('') || '<div class="empty-state"><div><strong>没有匹配资源</strong><span>调整方向或类型筛选。</span></div></div>';
      elements.indexCount.textContent = `${resources.length} 项资源`;
      return;
    }
    if (state.rightTab === 'starred') {
      let rowCount = 0;
      const topics = activeStarredTopics().map((topic) => {
        const rows = topic.rows.filter((row) => !query || row.title.toLocaleLowerCase().includes(query));
        if (!rows.length) return '';
        rowCount += rows.length;
        return `<section class="topic"><div class="topic-head is-static"><span>${escapeHtml(topic.title)}</span><span class="topic-count">${rows.length}</span></div>${rows.map((row) => `<button class="index-row" type="button" data-index-target="${targetForRow(row.title)}"><span class="index-kind">${icon(row.kind)}</span><span class="index-copy"><span class="index-title">${escapeHtml(row.title)}</span><span class="index-time">${escapeHtml(row.time)}</span></span></button>`).join('')}</section>`;
      }).join('');
      elements.rightContent.innerHTML = topics || '<div class="empty-state"><div><strong>还没有收藏</strong><span>在对话中收藏一条内容后，它会在这里保留。</span></div></div>';
      elements.indexCount.textContent = `${rowCount} 条收藏`;
      return;
    }
    let rowCount = 0;
    const topics = activeTopics().map((topic) => {
      const rows = topic.rows.filter((row) => {
        if (state.indexType !== 'all' && typeForKind(row.kind) !== state.indexType) return false;
        return !query || row.title.toLocaleLowerCase().includes(query);
      });
      if (query && !topic.title.toLocaleLowerCase().includes(query) && rows.length === 0) return '';
      if (!query && state.indexType !== 'all' && rows.length === 0) return '';
      const expanded = query ? true : state.expandedTopics.has(topic.id);
      rowCount += rows.length;
      return `<section class="topic"><button class="topic-head" type="button" data-topic="${topic.id}" aria-expanded="${expanded}">${expanded ? icon('chevronDown') : icon('chevronRight')}<span>${escapeHtml(topic.title)}</span><span class="topic-count">${rows.length}</span></button>${expanded ? rows.map((row) => `<button class="index-row" type="button" data-index-target="${targetForRow(row.title)}"><span class="index-kind">${icon(row.kind)}</span><span class="index-copy"><span class="index-title">${escapeHtml(row.title)}</span><span class="index-time">${escapeHtml(row.time)}</span></span></button>`).join('') : ''}</section>`;
    }).join('');
    elements.rightContent.innerHTML = topics || '<div class="empty-state">没有匹配内容</div>';
    elements.indexCount.textContent = `${rowCount} 条索引`;
  }

  function kindLabel(kind) {
    return ({ image: '图片', diagram: '图表', table: '表格 / 数据', file: '文档', canvas: 'Canvas', excalidraw: 'Drawing', code: '代码', database: 'Bases' })[kind] || '其他';
  }

  const workflows = [
    { id: 'research', label: '研究' },
    { id: 'plan', label: '规划' },
    { id: 'image', label: '生成或编辑图片' },
    { id: 'document', label: '生成文档' }
  ];
  // Illustrative design fixtures only; production must read the model catalog.
  const models = [
    { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI', profile: 'OpenAI · Work', caps: ['视觉', '工具', '128K'], capabilities: ['vision', 'tools'], contextK: 128 },
    { id: 'o3', label: 'o3', provider: 'OpenAI', profile: 'OpenAI · Work', caps: ['推理', '200K'], capabilities: ['reasoning'], contextK: 200 },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', profile: 'Anthropic · Primary', caps: ['视觉', '工具', '200K'], capabilities: ['vision', 'tools'], contextK: 200 },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', profile: 'Google · Research', caps: ['视觉', 'PDF', '工具', '2M'], capabilities: ['vision', 'pdf', 'tools'], contextK: 2000 },
    { id: 'gemini-2.0-flash-thinking', label: 'Gemini 2.0 Flash Thinking', provider: 'Google', profile: 'Google · Research', caps: ['推理', '视觉', 'PDF', '1M', '输出 64K'], capabilities: ['reasoning', 'vision', 'pdf'], contextK: 1000 },
    { id: 'qwen3', label: 'Qwen 3', provider: 'Ollama', profile: 'Ollama · Local', caps: ['本地', '推理', '工具'], capabilities: ['local', 'reasoning', 'tools'], contextK: null }
  ];
  const modelCapabilityOptions = [
    ['vision', '视觉'], ['tools', '工具'], ['reasoning', '推理'], ['pdf', 'PDF'], ['local', '本地']
  ];
  const modelContextOptions = [[0, '全部'], [128, '≥128K'], [1000, '≥1M']];
  const assistants = [
    { id: 'default', label: '默认助手', note: '不添加额外身份与规则', group: '内置' },
    { id: 'evidence-coach', label: '面试证据教练', note: '只基于证据，避免夸大经历', group: '我的助手' },
    { id: 'architecture-reviewer', label: '架构审阅者', note: '优先检查边界、依赖和取舍', group: '我的助手' },
    { id: 'vault-librarian', label: '知识库研究员', note: '先检索、再综合并标明来源', group: '我的助手' },
    { id: 'spoken-editor', label: '口语表达编辑', note: '把长句改成自然、可复述的表达', group: '我的助手' },
    { id: 'system-design', label: '系统设计面试官', note: '沿约束、权衡和故障场景追问', group: '我的助手' }
  ];

  function selectedModelLabel() {
    if (state.modelMode === 'auto') return '自动模型';
    const model = models.find((item) => item.id === state.modelId);
    return model ? `${model.profile} · ${model.label}` : '自动模型';
  }

  function updateRunTrigger() {
    document.getElementById('run-model-label').textContent = selectedModelLabel();
  }

  function modelCapabilityTags(model) {
    return `<span class="model-cap-tags">${model.caps.map((cap) => `<span>${escapeHtml(cap)}</span>`).join('')}</span>`;
  }

  function modelFilterCount() {
    return state.modelCapabilities.size + (state.modelContextMin > 0 ? 1 : 0);
  }

  function modelFilterPanel() {
    if (!state.modelFilterOpen) return '';
    return `<section class="model-filter-panel" aria-label="模型筛选">
      <div class="model-filter-row"><span>能力</span><div>${modelCapabilityOptions.map(([id, label]) => `<button class="${state.modelCapabilities.has(id) ? 'is-active' : ''}" type="button" data-model-capability="${id}" aria-pressed="${state.modelCapabilities.has(id)}">${label}</button>`).join('')}</div></div>
      <div class="model-filter-row"><span>上下文</span><div>${modelContextOptions.map(([value, label]) => `<button class="${state.modelContextMin === value ? 'is-active' : ''}" type="button" data-model-context="${value}" aria-pressed="${state.modelContextMin === value}">${label}</button>`).join('')}</div></div>
      ${modelFilterCount() ? '<button class="model-filter-clear" type="button" data-model-filter-clear>清除筛选</button>' : ''}
    </section>`;
  }

  function renderRunPanel() {
    const title = document.getElementById('run-panel-title');
    const subtitle = document.getElementById('run-panel-subtitle');
    const back = document.getElementById('run-back');
    back.classList.toggle('is-visible', state.openRunView !== 'main');
    if (state.openRunView === 'model') {
      title.textContent = '选择模型';
      subtitle.textContent = '搜索或按模型目录已声明的能力筛选';
      const query = state.modelQuery.trim().toLocaleLowerCase();
      const filteredModels = models.filter((model) => {
        if (query && !`${model.id} ${model.label} ${model.provider} ${model.profile} ${model.caps.join(' ')}`.toLocaleLowerCase().includes(query)) return false;
        if ([...state.modelCapabilities].some((capability) => !model.capabilities.includes(capability))) return false;
        if (state.modelContextMin > 0 && (!model.contextK || model.contextK < state.modelContextMin)) return false;
        return true;
      });
      const profileGroups = [...new Set(filteredModels.map((model) => model.profile))];
      const groupedModels = profileGroups.map((profile) => `<section class="model-profile-group"><div class="run-group-label">${escapeHtml(profile)}</div>${filteredModels.filter((model) => model.profile === profile).map((model) => `<button class="run-choice run-choice--model ${state.modelId === model.id ? 'is-selected' : ''}" type="button" data-model="${model.id}"><span class="model-monogram">${escapeHtml(model.provider.slice(0, 1))}</span><span class="model-choice-copy"><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.id)} · ${escapeHtml(model.provider)}</small>${modelCapabilityTags(model)}</span><span class="run-choice-check">${state.modelId === model.id ? icon('check') : ''}</span></button>`).join('')}</section>`).join('');
      const filterCount = modelFilterCount();
      elements.runPanelBody.innerHTML = `<div class="model-search-row"><label class="run-search">${icon('search')}<input type="search" data-model-search value="${escapeHtml(state.modelQuery)}" placeholder="搜索 Profile、Provider 或模型 ID"></label><button class="model-filter-trigger ${filterCount ? 'is-active' : ''}" type="button" data-model-filter-toggle aria-expanded="${state.modelFilterOpen}">${icon('sliders')}<span>筛选</span>${filterCount ? `<em>${filterCount}</em>` : ''}</button></div>
        ${modelFilterPanel()}
        <button class="run-choice is-prominent ${state.modelMode === 'auto' ? 'is-selected' : ''}" type="button" data-model="auto"><span class="run-choice-icon">${icon('sparkles')}</span><span><strong>自动模型</strong><small>使用当前对话覆盖；否则回到默认 Agent Profile</small></span><span class="run-choice-check">${state.modelMode === 'auto' ? icon('check') : ''}</span></button>
        ${groupedModels || '<div class="run-empty">没有匹配的已配置模型</div>'}
        <div class="capability-note">能力标签只显示模型目录已声明的内容；未知能力不推断。当前目录没有已启用的图片生成模型。</div>`;
      return;
    }
    if (state.openRunView === 'assistant') {
      title.textContent = '选择助手';
      subtitle.textContent = '搜索并复用对话身份；默认助手不额外注入身份';
      const query = state.assistantQuery.trim().toLocaleLowerCase();
      const filteredAssistants = assistants.filter((assistant) => !query || `${assistant.label} ${assistant.note} ${assistant.group}`.toLocaleLowerCase().includes(query));
      const assistantGroups = [...new Set(filteredAssistants.map((assistant) => assistant.group))];
      const groupedAssistants = assistantGroups.map((group) => `<section class="assistant-group"><div class="run-group-label">${escapeHtml(group)}</div>${filteredAssistants.filter((assistant) => assistant.group === group).map((assistant) => `<button class="run-choice ${state.assistantId === assistant.id ? 'is-selected' : ''}" type="button" data-assistant="${assistant.id}"><span class="run-choice-icon">${icon(assistant.id === 'default' ? 'message' : 'bot')}</span><span><strong>${escapeHtml(assistant.label)}</strong><small>${escapeHtml(assistant.note)}</small></span><span class="run-choice-check">${state.assistantId === assistant.id ? icon('check') : ''}</span></button>`).join('')}</section>`).join('');
      elements.runPanelBody.innerHTML = `<label class="run-search">${icon('search')}<input type="search" data-assistant-search value="${escapeHtml(state.assistantQuery)}" placeholder="搜索助手名称或用途"></label>
        ${groupedAssistants || '<div class="run-empty">没有匹配的助手</div>'}
        <a class="assistant-create-link" href="./composer-lab.html#assistant-builder">${icon('sparkles')}<span><strong>用 AI 创建助手</strong><small>先用一段话生成草稿；知识、工具与模型按需展开</small></span>${icon('externalLink')}</a>`;
      return;
    }
    title.textContent = '模型与助手';
    subtitle.textContent = '对话默认值；必要时可以明确覆盖';
    const assistant = assistants.find((item) => item.id === state.assistantId);
    elements.runPanelBody.innerHTML = `<button class="run-drilldown" type="button" data-run-view="model"><span>${icon('cpu')}</span><span><strong>模型</strong><small>${escapeHtml(selectedModelLabel())}${state.modelMode === 'auto' ? ' · 对话默认' : ' · 明确覆盖'}</small></span>${icon('chevronRight')}</button>
      <button class="run-drilldown" type="button" data-run-view="assistant"><span>${icon('bot')}</span><span><strong>助手</strong><small>${escapeHtml(assistant?.label || '默认助手')}</small></span>${icon('chevronRight')}</button>
      <div class="run-footnote">Settings 的推荐配置、Agent Harness 层级与 reasoning 设置不是同一件事；在运行链路真正接通前，这里不把它们画成本轮可用的“快速 / 平衡 / 最佳”。工作流仍通过 <kbd>/</kbd> 调用。</div>`;
  }

  function updateSourceTrigger() {
    const enabled = ['项目上下文'];
    if (state.vaultSearch) enabled.push('Vault');
    if (state.webSearch) enabled.push('Web');
    document.getElementById('source-chip-label').textContent = enabled.join(' + ');
    document.querySelectorAll('[data-source-toggle]').forEach((button) => {
      const key = button.dataset.sourceToggle;
      const selected = key === 'project' || (key === 'vault' ? state.vaultSearch : state.webSearch);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  const vaultDocumentFixtures = [
    { title: 'interview-story-bank.md', path: 'AI/Interview/interview-story-bank.md' },
    { title: 'stateless-redesign.md', path: 'Projects/Architecture/stateless-redesign.md' },
    { title: 'chat-studio-ui-ux.md', path: 'Design/Specs/chat-studio-ui-ux.md' },
    { title: 'context-architecture-review.md', path: 'Peak Modernization/context-architecture-review.md' },
    { title: 'composer-context-patterns.md', path: 'Design/Research/composer-context-patterns.md' }
  ];

  const conversationTypeOptions = [
    ['all', '全部', 'message'],
    ['chat', '对话', 'message'],
    ['agent', 'Agent', 'bot'],
    ['plan', '计划', 'listTree'],
    ['canvas', 'Canvas', 'palette'],
    ['template', '模板', 'ruler'],
    ['custom', '自定义', 'wrench']
  ];

  function getConversationType(item) {
    const type = item.conversationType;
    const kind = typeof type === 'string' ? type : type?.kind;
    return conversationTypeOptions.some(([id]) => id === kind) ? kind : 'chat';
  }

  function conversationTypeOption(kind) {
    return conversationTypeOptions.find(([id]) => id === kind) || conversationTypeOptions[1];
  }

  function conversationTypeDetail(item) {
    const kind = getConversationType(item);
    if (kind === 'template') return item.conversationType?.templateName || '模板';
    if (kind === 'custom') return item.conversationType?.label || '自定义';
    return conversationTypeOption(kind)[1];
  }

  function collectConversationSearchRows() {
    const rows = new Map();
    const add = (item, group) => {
      if (item.entryKind && item.entryKind !== 'conversation') return;
      if (rows.has(item.id)) return;
      rows.set(item.id, { ...item, group, conversationKind: getConversationType(item) });
    };
    fixtures.pinned.forEach((item) => add(item, '置顶'));
    fixtures.projects.forEach((project) => project.conversations.forEach((item) => add(item, project.name)));
    fixtures.recents.forEach((group) => group.conversations.forEach((item) => add(item, group.label)));
    return [...rows.values()];
  }

  function renderConversationTypeMenu(rows) {
    const counts = rows.reduce((result, item) => {
      result[item.conversationKind] = (result[item.conversationKind] || 0) + 1;
      return result;
    }, {});
    const visibleOptions = conversationTypeOptions.filter(([id]) => id === 'all' || counts[id]);
    const active = conversationTypeOption(state.conversationTypeFilter);
    elements.conversationTypeLabel.textContent = `类型 · ${active[1]}`;
    elements.conversationTypeTrigger.setAttribute('aria-expanded', String(state.conversationTypeMenuOpen));
    elements.conversationTypeMenu.classList.toggle('is-open', state.conversationTypeMenuOpen);
    elements.conversationTypeMenu.setAttribute('aria-hidden', String(!state.conversationTypeMenuOpen));
    elements.conversationTypeMenu.innerHTML = visibleOptions.map(([id, label, iconName]) => `<button class="conversation-type-option ${state.conversationTypeFilter === id ? 'is-selected' : ''}" type="button" role="menuitemradio" aria-checked="${state.conversationTypeFilter === id}" data-conversation-type="${id}"><span class="conversation-type-option__icon">${icon(iconName)}</span><span>${label}</span><small>${id === 'all' ? rows.length : counts[id]}</small><span class="conversation-type-option__check">${state.conversationTypeFilter === id ? icon('check') : ''}</span></button>`).join('');
  }

  function renderConversationSearch() {
    const query = state.conversationQuery.trim().toLocaleLowerCase();
    const rows = collectConversationSearchRows();
    renderConversationTypeMenu(rows);
    const filtered = rows.filter((item) => {
      if (state.conversationTypeFilter !== 'all' && item.conversationKind !== state.conversationTypeFilter) return false;
      return !query || `${item.title} ${item.meta || item.time || ''} ${item.group}`.toLocaleLowerCase().includes(query);
    });
    const activeType = conversationTypeOption(state.conversationTypeFilter)[1];
    elements.conversationSearchResults.innerHTML = filtered.slice(0, 20).map((item) => {
      const [, , iconName] = conversationTypeOption(item.conversationKind);
      const detail = conversationTypeDetail(item);
      const badge = item.conversationKind === 'chat' ? '' : `<em class="conversation-type-badge">${escapeHtml(detail)}</em>`;
      return `<button type="button" class="focused-picker-row" data-conversation-result="${item.id}" data-conversation-kind="${item.conversationKind}"><span>${icon(iconName)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.group)} · ${escapeHtml(item.meta || item.time || '')}${badge}</small></span><kbd>↵</kbd></button>`;
    }).join('') || `<div class="focused-picker-empty"><strong>没有匹配的${state.conversationTypeFilter === 'all' ? '对话标题' : activeType}</strong><span>${query ? '尝试更短的关键词，或切换类型。' : '切换类型查看其他对话。'}</span></div>`;
  }

  function renderVaultDocumentPicker() {
    const query = state.vaultDocumentQuery.trim().toLocaleLowerCase();
    const filtered = vaultDocumentFixtures.filter((item) => !query || `${item.title} ${item.path}`.toLocaleLowerCase().includes(query));
    elements.vaultDocumentResults.innerHTML = filtered.map((item) => `<button type="button" class="focused-picker-row" data-vault-document="${escapeHtml(item.title)}"><span>${icon('fileText')}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.path)}</small></span><kbd>↵</kbd></button>`).join('') || '<div class="focused-picker-empty"><strong>没有匹配的文档</strong><span>这里只按示例文件名和路径筛选。</span></div>';
  }

  function openConversationSearch() {
    state.conversationQuery = '';
    state.conversationTypeFilter = 'all';
    state.conversationTypeMenuOpen = false;
    elements.conversationSearchInput.value = '';
    openSurface('conversation-search');
  }

  function openVaultDocumentPicker() {
    state.vaultDocumentQuery = '';
    elements.vaultDocumentInput.value = '';
    openSurface('vault-picker');
  }

  function positionSurface(surface, anchor, side, placement = 'above') {
    const rect = anchor.getBoundingClientRect();
    surface.style.left = side === 'left' ? `${Math.round(rect.left)}px` : `${Math.round(rect.right - surface.offsetWidth)}px`;
    surface.style.top = placement === 'below'
      ? `${Math.round(rect.bottom + 6)}px`
      : `${Math.round(rect.top - surface.offsetHeight - 8)}px`;
  }

  function openSurface(name, anchor) {
    closeSurfaces();
    state.openSurface = name;
    const layerSurfaces = {
      'native-search': elements.nativeSearchLayer,
      'conversation-search': elements.conversationSearchLayer,
      'vault-picker': elements.vaultDocumentLayer,
      'raw-message': elements.rawMessageLayer
    };
    if (layerSurfaces[name]) {
      const layer = layerSurfaces[name];
      layer.classList.add('is-open');
      layer.setAttribute('aria-hidden', 'false');
      if (name === 'conversation-search') {
        renderConversationSearch();
        setTimeout(() => elements.conversationSearchInput.focus(), 0);
      }
      if (name === 'vault-picker') {
        renderVaultDocumentPicker();
        setTimeout(() => elements.vaultDocumentInput.focus(), 0);
      }
      return;
    }
    const surfaces = { plus: elements.plusMenu, workflow: elements.workflowPopover, run: elements.runPopover, source: elements.sourcePopover, type: elements.typeFilterMenu, context: elements.contextStackPopover };
    const surface = surfaces[name];
    if (!surface) return;
    if (name === 'run') renderRunPanel();
    if (name === 'type') renderTypeFilterMenu();
    surface.classList.add('is-open');
    surface.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      if (name === 'context') positionContextStackPopover();
      else positionSurface(surface, anchor, ['plus', 'workflow'].includes(name) ? 'left' : 'right', name === 'type' ? 'below' : 'above');
    });
    anchor?.setAttribute('aria-expanded', 'true');
  }

  function closeSurfaces() {
    state.openSurface = null;
    state.conversationTypeMenuOpen = false;
    [elements.nativeSearchLayer, elements.conversationSearchLayer, elements.vaultDocumentLayer, elements.rawMessageLayer].forEach((surface) => {
      surface.classList.remove('is-open');
      surface.setAttribute('aria-hidden', 'true');
    });
    [elements.plusMenu, elements.workflowPopover, elements.runPopover, elements.sourcePopover, elements.typeFilterMenu, elements.contextStackPopover].forEach((surface) => { surface.classList.remove('is-open'); surface.setAttribute('aria-hidden', 'true'); });
    document.getElementById('composer-plus').setAttribute('aria-expanded', 'false');
    document.getElementById('source-settings').setAttribute('aria-expanded', 'false');
    document.getElementById('run-settings').setAttribute('aria-expanded', 'false');
    document.getElementById('type-filter-trigger').setAttribute('aria-expanded', 'false');
    elements.conversationTypeTrigger.setAttribute('aria-expanded', 'false');
    elements.contextStackTrigger.setAttribute('aria-expanded', 'false');
    updateAdaptiveComposer();
    elements.conversationTypeMenu.classList.remove('is-open');
    elements.conversationTypeMenu.setAttribute('aria-hidden', 'true');
    closeTransientMenus();
  }

  function showResourcePreview(anchor) {
    const rect = anchor.getBoundingClientRect();
    elements.resourceHover.classList.add('is-open');
    elements.resourceHover.setAttribute('aria-hidden', 'false');
    const width = 320;
    elements.resourceHover.style.left = `${Math.min(window.innerWidth - width - 12, rect.left)}px`;
    elements.resourceHover.style.top = `${Math.max(12, rect.top - 168)}px`;
  }

  function hideResourcePreview() {
    elements.resourceHover.classList.remove('is-open');
    elements.resourceHover.setAttribute('aria-hidden', 'true');
  }

  function applyLayout() {
    const projectHome = state.view === 'project';
    const rightHidden = state.rightCollapsed || projectHome;
    elements.studio.style.setProperty('--left-width', `${state.leftWidth}px`);
    elements.studio.style.setProperty('--right-width', `${state.rightWidth}px`);
    elements.studio.classList.toggle('is-right-collapsed', state.rightCollapsed);
    elements.studio.classList.toggle('is-project-home', projectHome);
    elements.rightPanel.inert = rightHidden;
    elements.rightPanel.setAttribute('aria-hidden', String(rightHidden));
    elements.rightSplitter.tabIndex = rightHidden ? -1 : 0;
    elements.app.classList.remove('variant-a', 'variant-b', 'variant-c');
    if (state.reviewVariant !== 'canonical') elements.app.classList.add(`variant-${state.reviewVariant}`);
    document.body.classList.toggle('theme-dark', state.theme === 'dark');
    document.body.classList.toggle('theme-light', state.theme === 'light');
    document.documentElement.style.colorScheme = state.theme;
    scheduleMessageActionLayout();
  }

  function renderReview() {
    elements.reviewDrawer.classList.toggle('is-open', state.reviewOpen);
    elements.reviewDrawer.setAttribute('aria-hidden', String(!state.reviewOpen));
    elements.reviewLeftWidth.textContent = `${Math.round(state.leftWidth)} px`;
    elements.reviewRightWidth.textContent = state.view === 'project' ? '项目页不显示' : state.rightCollapsed ? '已收起' : `${Math.round(state.rightWidth)} px`;
    elements.reviewCentreWidth.textContent = `${Math.round(document.getElementById('centre-panel').getBoundingClientRect().width)} px`;
    elements.reviewState.textContent = state.view;
    elements.reviewVariant.textContent = state.reviewVariant;
  }

  function renderTabs() {
    document.querySelectorAll('.right-tab').forEach((tab) => {
      const active = tab.dataset.tab === state.rightTab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelector('.right-filterbar').classList.toggle('is-resources', state.rightTab === 'resources');
    elements.indexSearch.placeholder = '搜索当前对话';
  }

  function renderAll() {
    applyLayout();
    renderLeft();
    renderCentre();
    renderRight();
    renderTabs();
    updateRunTrigger();
    updateSourceTrigger();
    requestAnimationFrame(renderReview);
  }

  function setView(view, updateHash) {
    state.view = fixtures.reviewStates.some((item) => item.hash === view) ? view : 'active';
    if (state.view === 'catalog') {
      state.activeConversationId = 'conversation-catalog';
      state.expandedTopics = new Set(fixtures.catalogTopics.filter((topic) => topic.open).map((topic) => topic.id));
    }
    if (state.view === 'project') {
      state.activeConversationId = null;
      state.projectTab = 'conversations';
    }
    if (state.view === 'active' && (!state.activeConversationId || state.activeConversationId === 'conversation-catalog')) state.activeConversationId = 'conversation-story';
    if (state.view === 'artifacts' || state.view === 'resources') state.rightTab = 'resources';
    if (updateHash) history.replaceState(null, '', `#${state.view}`);
    renderAll();
  }

  function resetState() {
    Object.assign(state, {
      view: 'active', activeProjectId: defaults.activeProjectId, activeConversationId: defaults.activeConversationId,
      leftWidth: defaults.leftWidth, rightWidth: defaults.rightWidth, rightCollapsed: false, rightTab: 'outline',
      expandedProjects: new Set(defaults.expandedProjects), expandedTopics: new Set(defaults.expandedTopics),
      theme: 'light', reviewVariant: 'canonical', indexQuery: '', indexDirection: 'all', indexType: 'all',
      conversationQuery: '', conversationTypeFilter: 'all', conversationTypeMenuOpen: false, vaultDocumentQuery: '',
      titleAlternate: false, titlePhase: 'idle', titleRunId: 0, openRunView: 'main', modelMode: 'auto', modelId: null, modelQuery: '',
      modelFilterOpen: false, modelCapabilities: new Set(), modelContextMin: 0,
      assistantId: 'default', assistantQuery: '', vaultSearch: false, webSearch: false, replyTarget: null, workflowId: null, addedDocument: null,
      projectTab: 'conversations', projectDescriptionEditing: false, projectDescriptionDraft: '', projectDescriptionOverrides: {}, rawMessageText: '', drafts: {}
    });
    elements.indexSearch.value = '';
    elements.conversationSearchInput.value = '';
    elements.vaultDocumentInput.value = '';
    closeSurfaces();
    history.replaceState(null, '', '#active');
    renderAll();
  }

  function configureSplitter(element, side) {
    let dragStart = null;
    const bounds = side === 'left' ? [200, 300] : [220, 360];
    const defaultWidth = side === 'left' ? defaults.leftWidth : defaults.rightWidth;
    function finishDrag(event) {
      if (!dragStart) return;
      dragStart = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      element.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
    }
    element.addEventListener('pointerdown', (event) => {
      dragStart = { x: event.clientX, width: side === 'left' ? state.leftWidth : state.rightWidth };
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
      document.body.classList.add('is-resizing');
    });
    element.addEventListener('pointermove', (event) => {
      if (!dragStart) return;
      const delta = event.clientX - dragStart.x;
      const next = side === 'left' ? dragStart.width + delta : dragStart.width - delta;
      const width = Math.min(bounds[1], Math.max(bounds[0], next));
      if (side === 'left') state.leftWidth = width;
      else state.rightWidth = width;
      applyLayout();
      renderReview();
    });
    element.addEventListener('pointerup', finishDrag);
    element.addEventListener('pointercancel', finishDrag);
    element.addEventListener('dblclick', () => { if (side === 'left') state.leftWidth = defaultWidth; else state.rightWidth = defaultWidth; renderAll(); });
    element.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const physical = event.key === 'ArrowRight' ? 4 : -4;
      const delta = side === 'left' ? physical : -physical;
      const current = side === 'left' ? state.leftWidth : state.rightWidth;
      const width = Math.min(bounds[1], Math.max(bounds[0], current + delta));
      if (side === 'left') state.leftWidth = width; else state.rightWidth = width;
      renderAll();
    });
  }

  function regenerateTitle() {
    if (state.titlePhase !== 'idle') return;
    state.titlePhase = 'thinking';
    state.titleRunId += 1;
    const runId = state.titleRunId;
    const button = document.getElementById('regenerate-title');
    button.classList.add('is-spinning');
    elements.conversationTitle.classList.add('is-thinking');
    elements.conversationTitle.setAttribute('aria-label', '正在生成新标题');
    setTimeout(() => {
      if (runId !== state.titleRunId) return;
      state.titleAlternate = !state.titleAlternate;
      const title = state.titleAlternate ? currentConversation().alternateTitle : currentConversation().title;
      state.titlePhase = 'typing';
      elements.conversationTitle.textContent = '';
      elements.conversationTitle.classList.remove('is-thinking');
      elements.conversationTitle.classList.add('is-typing');
      [...title].forEach((character, index) => setTimeout(() => {
        if (runId === state.titleRunId) elements.conversationTitle.textContent += character;
      }, index * 42));
      setTimeout(() => {
        if (runId !== state.titleRunId) return;
        state.titlePhase = 'idle';
        button.classList.remove('is-spinning');
        elements.conversationTitle.classList.remove('is-typing');
        elements.conversationTitle.removeAttribute('aria-label');
      }, title.length * 42 + 180);
    }, 420);
  }

  function showRowMenu(anchor, id) {
    closeTransientMenus();
    const menu = document.createElement('div');
    menu.className = 'row-context-menu';
    menu.setAttribute('role', 'menu');
    const pinned = fixtures.pinned.some((conversation) => conversation.id === id);
    menu.innerHTML = `<button type="button" role="menuitem">${icon('pin')}<span>${pinned ? '取消置顶' : '置顶'}</span></button><button type="button" role="menuitem">${icon('squarePen')}<span>重命名</span></button><button type="button" role="menuitem">${icon('folder')}<span>移到项目</span></button><span class="menu-separator" role="separator"></span><button type="button" role="menuitem">${icon('history')}<span>归档</span></button><button type="button" role="menuitem" class="is-danger">${icon('x')}<span>删除</span></button>`;
    menu.dataset.forRow = id;
    elements.overlayRoot.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(window.innerWidth - 190, rect.right + 4)}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 8, rect.top)}px`;
    menu.querySelector('button')?.focus();
  }

  function showProjectMenu(anchor, id) {
    closeTransientMenus();
    const menu = document.createElement('div');
    menu.className = 'row-context-menu project-context-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<button type="button" role="menuitem" data-project-menu-action="open">${icon('folderOpen')}<span>打开项目主页</span></button><button type="button" role="menuitem" data-project-menu-action="new">${icon('squarePen')}<span>新建项目对话</span></button><button type="button" role="menuitem" data-project-menu-action="rename">${icon('pencil')}<span>重命名项目</span></button><span class="menu-separator" role="separator"></span><button type="button" role="menuitem">${icon('history')}<span>归档项目</span></button>`;
    elements.overlayRoot.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(window.innerWidth - 196, rect.right + 4)}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 8, rect.top)}px`;
    menu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-project-menu-action]')?.dataset.projectMenuAction;
      if (!action) return;
      if (action === 'open') openProject(id);
      if (action === 'new') startProjectConversation(id);
      if (action === 'rename') showToast('项目重命名会在真实表单中完成');
      closeTransientMenus();
    });
    menu.querySelector('button')?.focus();
  }

  function closeTransientMenus() {
    document.querySelectorAll('.row-context-menu, .message-action-menu, .suggested-next-menu').forEach((menu) => menu.remove());
    document.querySelectorAll('[data-row-menu][aria-expanded="true"], [data-project-menu][aria-expanded="true"], [data-message-menu][aria-expanded="true"], [data-suggestion-menu][aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function positionTransientMenu(menu, anchor, width) {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = width || menu.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const below = rect.bottom + 6;
    const top = below + menu.offsetHeight <= window.innerHeight - 8 ? below : Math.max(8, rect.top - menu.offsetHeight - 6);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function messageRecord(id, excerpt) {
    const conversation = currentConversation();
    const content = id === 'turn-current-assistant' && conversation.points
      ? `${conversation.assistantIntro}\n\n${conversation.points.map((point) => `- ${point}`).join('\n')}`
      : excerpt || '消息内容';
    return {
      id,
      role: 'assistant',
      model: state.modelMode === 'fixed' ? state.modelId : 'gpt-5',
      createdAt: '2026-07-15T10:43:00+12:00',
      content
    };
  }

  function fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  function copyText(text, confirmation) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    showToast(confirmation);
  }

  function fillComposer(value) {
    elements.composerInput.value = value;
    elements.composerInput.style.height = 'auto';
    elements.composerInput.style.height = `${Math.min(128, elements.composerInput.scrollHeight)}px`;
    elements.sendButton.disabled = !value.trim();
    saveCurrentDraft();
    updateStartSurfaceDraftState();
    elements.composerInput.focus();
    document.getElementById('composer').scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function setReplyTarget(id, excerpt) {
    state.replyTarget = { id, excerpt: excerpt || '上一条回答' };
    renderComposerContext();
    elements.composerInput.focus();
    document.getElementById('composer').scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function openRawMessage(record) {
    state.rawMessageText = JSON.stringify(record, null, 2);
    elements.rawMessageContent.textContent = state.rawMessageText;
    closeTransientMenus();
    openSurface('raw-message');
  }

  function runMessageAdaptiveAction(action, id, excerpt) {
    const record = messageRecord(id, excerpt);
    if (action === 'raw') {
      openRawMessage(record);
      return;
    }
    if (action === 'markdown') copyText(record.content, '已复制为 Markdown');
    if (action === 'json') copyText(JSON.stringify(record, null, 2), '已复制为 JSON');
    if (action === 'save') showToast('已保存到项目 / Chat Saves');
    if (action === 'followup') setReplyTarget(id, excerpt);
    closeTransientMenus();
  }

  function showMessageMenu(anchor, id, excerpt) {
    closeTransientMenus();
    const hiddenIds = (anchor.closest('.message-meta')?.dataset.overflowActions || '').split(',').filter(Boolean);
    const hiddenActions = messageAdaptiveActions.filter((action) => hiddenIds.includes(action.id));
    if (!hiddenActions.length) return;
    const menu = document.createElement('div');
    menu.className = 'message-action-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = hiddenActions.map((action) => `<button type="button" role="menuitem" data-message-more-action="${action.id}">${icon(action.icon)}<span><strong>${action.menuLabel}</strong><small>${action.detail}</small></span></button>`).join('');
    elements.overlayRoot.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    positionTransientMenu(menu, anchor, 244);
    menu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-message-more-action]')?.dataset.messageMoreAction;
      if (!action) return;
      runMessageAdaptiveAction(action, id, excerpt);
    });
    menu.querySelector('button')?.focus();
  }

  function showSuggestedMenu(anchor, id, excerpt) {
    closeTransientMenus();
    const remaining = (currentConversation().suggestedNext || []).slice(2);
    const menu = document.createElement('div');
    menu.className = 'suggested-next-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<span class="transient-menu-label">继续追问</span>${remaining.map((item) => `<button type="button" role="menuitem" data-suggestion="${escapeHtml(item)}">${icon('message')}<span>${escapeHtml(item)}</span></button>`).join('') || '<span class="transient-menu-empty">没有更多建议</span>'}
      <span class="menu-separator" role="separator"></span><span class="transient-menu-label">处理这条回答</span>
      <button type="button" role="menuitem" data-suggested-action="rewrite">${icon('pencil')}<span>改写得更简洁</span></button>
      <button type="button" role="menuitem" data-suggested-action="checklist">${icon('checkSquare')}<span>转成检查清单</span></button>
      <button type="button" role="menuitem" data-suggested-action="save">${icon('filePlus')}<span>保存到 Vault</span></button>
      <button type="button" role="menuitem" data-suggested-action="custom">${icon('reply')}<span>自定义追问…</span></button>`;
    elements.overlayRoot.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    positionTransientMenu(menu, anchor, 248);
    menu.addEventListener('click', (event) => {
      const suggestion = event.target.closest('[data-suggestion]')?.dataset.suggestion;
      if (suggestion) fillComposer(suggestion);
      const action = event.target.closest('[data-suggested-action]')?.dataset.suggestedAction;
      if (action === 'rewrite') fillComposer('请把这条回答改写得更简洁，并保留关键证据边界。');
      if (action === 'checklist') fillComposer('把这条回答转换成一份可执行的检查清单。');
      if (action === 'save') showToast('已保存到项目 / Chat Saves');
      if (action === 'custom') setReplyTarget(id, excerpt);
      if (suggestion || action) closeTransientMenus();
    });
    menu.querySelector('button')?.focus();
  }

  function openProject(id) {
    saveCurrentDraft();
    state.activeProjectId = id;
    state.activeConversationId = null;
    state.view = 'project';
    state.projectTab = 'conversations';
    state.rightTab = 'outline';
    state.assistantId = 'default';
    state.workflowId = null;
    state.addedDocument = null;
    state.modelMode = 'auto';
    state.modelId = null;
    state.vaultSearch = false;
    state.webSearch = false;
    state.replyTarget = null;
    restoreCurrentDraft();
    history.replaceState(null, '', '#project');
    renderAll();
  }

  function startProjectConversation(id) {
    saveCurrentDraft();
    state.activeProjectId = id;
    state.activeConversationId = null;
    state.replyTarget = null;
    state.workflowId = null;
    setView('new', true);
    restoreCurrentDraft();
  }

  function showToast(message) {
    document.querySelector('.mock-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'mock-toast';
    toast.textContent = message;
    elements.overlayRoot.appendChild(toast);
    setTimeout(() => toast.classList.add('is-visible'), 0);
    setTimeout(() => toast.remove(), 2200);
  }

  function bindEvents() {
    elements.leftContent.addEventListener('click', (event) => {
      const historyButton = event.target.closest('[data-open-history]');
      if (historyButton) {
        openConversationSearch();
        return;
      }
      const rowMenu = event.target.closest('[data-row-menu]');
      if (rowMenu) { event.stopPropagation(); showRowMenu(rowMenu, rowMenu.dataset.rowMenu); return; }
      const projectMenu = event.target.closest('[data-project-menu]');
      if (projectMenu) { event.stopPropagation(); showProjectMenu(projectMenu, projectMenu.dataset.projectMenu); return; }
      const projectToggle = event.target.closest('[data-project-toggle]');
      if (projectToggle) {
        const id = projectToggle.dataset.projectToggle;
        if (state.expandedProjects.has(id)) state.expandedProjects.delete(id); else state.expandedProjects.add(id);
        renderLeft();
        return;
      }
      const projectOpen = event.target.closest('[data-project-open]');
      if (projectOpen) {
        openProject(projectOpen.dataset.projectOpen);
        return;
      }
      const conversationButton = event.target.closest('[data-conversation]');
      if (!conversationButton) return;
      if (conversationButton.dataset.href) { location.href = conversationButton.dataset.href; return; }
      saveCurrentDraft();
      state.activeConversationId = conversationButton.dataset.conversation;
      state.view = state.activeConversationId === 'conversation-catalog' ? 'catalog' : 'active';
      state.assistantId = 'default';
      state.workflowId = null;
      state.rightTab = 'outline';
      state.expandedTopics = new Set(activeTopics().filter((topic) => topic.open).map((topic) => topic.id));
      restoreCurrentDraft();
      history.replaceState(null, '', `#${state.view}`);
      renderAll();
    });
    elements.leftContent.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-conversation]');
      if (row && event.dataTransfer) event.dataTransfer.setData('text/plain', row.dataset.conversation);
    });
    elements.leftContent.addEventListener('dragover', (event) => {
      const project = event.target.closest('[data-project-drop]');
      if (!project) return;
      event.preventDefault();
      project.classList.add('is-drop-target');
    });
    elements.leftContent.addEventListener('dragleave', (event) => event.target.closest('[data-project-drop]')?.classList.remove('is-drop-target'));
    elements.leftContent.addEventListener('drop', (event) => {
      const project = event.target.closest('[data-project-drop]');
      if (!project) return;
      event.preventDefault();
      project.classList.remove('is-drop-target');
      const projectName = fixtures.projects.find((item) => item.id === project.dataset.projectDrop)?.name || '项目';
      showToast(`已移入 ${projectName}；后续消息将使用该项目上下文`);
    });
    elements.rightContent.addEventListener('click', (event) => {
      const topicButton = event.target.closest('[data-topic]');
      if (topicButton) {
        const id = topicButton.dataset.topic;
        if (state.expandedTopics.has(id)) state.expandedTopics.delete(id); else state.expandedTopics.add(id);
        renderRight();
        return;
      }
      const targetButton = event.target.closest('[data-index-target]');
      if (!targetButton) return;
      const target = document.getElementById(targetButton.dataset.indexTarget);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelectorAll('.is-located').forEach((node) => node.classList.remove('is-located'));
      target.classList.add('is-located');
      setTimeout(() => target.classList.remove('is-located'), 1600);
    });
    elements.conversationBody.addEventListener('click', (event) => {
      const startPrompt = event.target.closest('[data-start-prompt]');
      if (startPrompt) {
        fillComposer(startPrompt.dataset.startPrompt);
        return;
      }
      if (event.target.closest('[data-project-description-edit]')) {
        beginProjectDescriptionEdit();
        return;
      }
      if (event.target.closest('[data-project-description-ai]')) {
        generateProjectDescription();
        return;
      }
      if (event.target.closest('[data-project-description-cancel]')) {
        cancelProjectDescriptionEdit();
        return;
      }
      if (event.target.closest('[data-project-description-save]')) {
        saveProjectDescription();
        return;
      }
      const projectTab = event.target.closest('[data-project-tab]');
      if (projectTab) {
        state.projectTab = projectTab.dataset.projectTab;
        renderCentre();
        renderRight();
        return;
      }
      if (event.target.closest('[data-project-new]')) {
        startProjectConversation(state.activeProjectId);
        return;
      }
      const projectConversation = event.target.closest('[data-project-conversation]');
      if (projectConversation) {
        saveCurrentDraft();
        state.activeConversationId = projectConversation.dataset.projectConversation;
        state.view = 'active';
        state.rightTab = 'outline';
        restoreCurrentDraft();
        history.replaceState(null, '', '#active');
        renderAll();
        return;
      }
      const projectAction = event.target.closest('[data-project-action]')?.dataset.projectAction;
      if (projectAction) {
        const messages = { 'add-resource': '已打开项目资源选择器', 'new-plan': '已打开项目计划草稿' };
        showToast(messages[projectAction] || '项目操作');
        return;
      }
      if (event.target.closest('[data-enable-web]')) {
        state.webSearch = true;
        updateSourceTrigger();
        showToast('本轮已启用 Web Search；项目上下文保持不变');
        return;
      }
      const adaptiveAction = event.target.closest('[data-message-inline-action]');
      if (adaptiveAction) {
        runMessageAdaptiveAction(adaptiveAction.dataset.messageInlineAction, adaptiveAction.dataset.messageId, adaptiveAction.dataset.messageExcerpt);
        return;
      }
      const direct = event.target.closest('[data-message-direct]');
      if (direct) {
        const action = direct.dataset.messageDirect;
        const record = messageRecord(direct.dataset.messageId, direct.dataset.messageExcerpt);
        if (action === 'copy') copyText(record.content, '已复制回答');
        if (action === 'retry') showToast('已用相同上下文重新生成');
        if (action === 'star') {
          const selected = direct.getAttribute('aria-pressed') !== 'true';
          direct.setAttribute('aria-pressed', String(selected));
          direct.classList.toggle('is-active', selected);
          showToast(selected ? '已收藏到当前项目' : '已取消收藏');
        }
        if (action === 'branch') showToast('已从这条回答创建分支对话');
        if (action === 'trace') showToast('已打开本轮 Trace 摘要');
        return;
      }
      const messageMenu = event.target.closest('[data-message-menu]');
      if (messageMenu) {
        showMessageMenu(messageMenu, messageMenu.dataset.messageMenu, messageMenu.dataset.messageExcerpt);
        return;
      }
      const suggestion = event.target.closest('[data-suggestion]');
      if (suggestion) {
        fillComposer(suggestion.dataset.suggestion);
        return;
      }
      const suggestionMenu = event.target.closest('[data-suggestion-menu]');
      if (suggestionMenu) {
        showSuggestedMenu(suggestionMenu, suggestionMenu.dataset.messageId, suggestionMenu.dataset.messageExcerpt);
        return;
      }
      const followup = event.target.closest('[data-message-action="followup"]');
      if (followup) {
        setReplyTarget(followup.dataset.messageId, followup.dataset.messageExcerpt);
        return;
      }
      const imageCountButton = event.target.closest('[data-image-count]');
      if (!imageCountButton) return;
      document.querySelectorAll('[data-image-count]').forEach((button) => button.classList.toggle('is-active', button === imageCountButton));
      renderCatalogImageGrid(Number(imageCountButton.dataset.imageCount));
    });
    elements.conversationBody.addEventListener('input', (event) => {
      if (!event.target.matches('[data-project-description-input]')) return;
      state.projectDescriptionDraft = event.target.value;
    });
    elements.conversationBody.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-project-description-input]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelProjectDescriptionEdit();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveProjectDescription();
      }
    });
    elements.indexSearch.addEventListener('input', (event) => { state.indexQuery = event.target.value; renderRight(); });
    elements.conversationSearchInput.addEventListener('input', (event) => {
      state.conversationQuery = event.target.value;
      renderConversationSearch();
    });
    elements.conversationSearch.addEventListener('click', (event) => {
      if (event.target.closest('[data-conversation-type-trigger], #conversation-type-trigger')) {
        state.conversationTypeMenuOpen = !state.conversationTypeMenuOpen;
        renderConversationSearch();
        return;
      }
      const type = event.target.closest('[data-conversation-type]')?.dataset.conversationType;
      if (!type) return;
      state.conversationTypeFilter = type;
      state.conversationTypeMenuOpen = false;
      renderConversationSearch();
      elements.conversationSearchInput.focus();
    });
    elements.vaultDocumentInput.addEventListener('input', (event) => {
      state.vaultDocumentQuery = event.target.value;
      renderVaultDocumentPicker();
    });
    [elements.nativeSearchLayer, elements.conversationSearchLayer, elements.vaultDocumentLayer, elements.rawMessageLayer].forEach((layer) => {
      layer.addEventListener('mousedown', (event) => { if (event.target === layer) closeSurfaces(); });
    });
    elements.nativeSearchLayer.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-native-search]')) closeSurfaces();
    });
    elements.rawMessageLayer.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-raw-message]')) closeSurfaces();
      if (event.target.closest('[data-copy-raw-message]')) copyText(state.rawMessageText, '已复制原始 JSON');
    });
    elements.conversationSearchResults.addEventListener('click', (event) => {
      const row = event.target.closest('[data-conversation-result]');
      if (!row) return;
      if (row.dataset.href) { location.href = row.dataset.href; return; }
      const id = row.dataset.conversationResult;
      saveCurrentDraft();
      state.activeConversationId = id;
      state.view = id === 'conversation-catalog' ? 'catalog' : 'active';
      restoreCurrentDraft();
      history.replaceState(null, '', `#${state.view}`);
      renderAll();
      closeSurfaces();
    });
    elements.vaultDocumentResults.addEventListener('click', (event) => {
      const row = event.target.closest('[data-vault-document]');
      if (!row) return;
      const title = row.dataset.vaultDocument;
      elements.composerInput.value = `${elements.composerInput.value.replace(/\[\[[^\n]*$/, '')}[[${title}]] `;
      elements.composerInput.style.height = `${Math.min(128, elements.composerInput.scrollHeight)}px`;
      elements.sendButton.disabled = false;
      state.addedDocument = title;
      saveCurrentDraft();
      renderComposerContext();
      closeSurfaces();
      elements.composerInput.focus();
    });
    elements.composerInput.addEventListener('input', (event) => {
      event.target.style.height = 'auto';
      event.target.style.height = `${Math.min(128, event.target.scrollHeight)}px`;
      elements.sendButton.disabled = !event.target.value.trim();
      saveCurrentDraft();
      updateStartSurfaceDraftState();
      renderContextStack();
      updateAdaptiveComposer();
      if (event.target.value.endsWith('[[')) openVaultDocumentPicker();
      if (event.target.value.endsWith('/')) openSurface('workflow', document.getElementById('composer-plus'));
    });
    elements.composerInput.addEventListener('focus', () => { state.composerFocused = true; updateAdaptiveComposer(); });
    elements.composerInput.addEventListener('blur', () => { state.composerFocused = false; updateAdaptiveComposer(); });
    elements.compactComposer.addEventListener('click', () => { state.composerFocused = true; updateAdaptiveComposer(); elements.composerInput.focus(); });
    elements.contextStackTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.openSurface === 'context') { closeSurfaces(); return; }
      renderContextStack();
      openSurface('context', event.currentTarget);
    });
    elements.contextStackClose.addEventListener('click', () => closeSurfaces());
    elements.contextStackPopover.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-context-stack-mode]');
      if (mode) {
        state.contextStackMode = mode.dataset.contextStackMode;
        document.querySelectorAll('[data-context-stack-mode]').forEach((tab) => {
          const active = tab.dataset.contextStackMode === state.contextStackMode;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', String(active));
        });
        renderContextStack();
        return;
      }
      const layer = event.target.closest('[data-context-layer]');
      if (!layer) return;
      state.contextDetailId = state.contextDetailId === layer.dataset.contextLayer ? null : layer.dataset.contextLayer;
      renderContextStack();
    });
    elements.conversationBody.addEventListener('scroll', () => updateAdaptiveComposer(), { passive: true });
    elements.composerContext.addEventListener('click', (event) => {
      if (event.target.closest('[data-remove-reply]')) state.replyTarget = null;
      else if (event.target.closest('[data-remove-workflow]')) state.workflowId = null;
      else if (event.target.closest('[data-remove-document]')) state.addedDocument = null;
      else if (event.target.closest('[data-reset-assistant]')) state.assistantId = 'default';
      else return;
      updateRunTrigger();
      renderComposerContext();
      renderContextStack();
      updateAdaptiveComposer();
    });
    elements.sendButton.addEventListener('click', () => {
      if (!elements.composerInput.value.trim()) return;
      showToast(state.replyTarget ? '已作为定向追问发送' : '消息已发送');
      elements.composerInput.value = '';
      elements.composerInput.style.height = 'auto';
      elements.sendButton.disabled = true;
      updateStartSurfaceDraftState();
      state.replyTarget = null;
      state.workflowId = null;
      delete state.drafts[currentDraftKey()];
      renderComposerContext();
      renderContextStack();
      updateAdaptiveComposer();
    });
    document.querySelectorAll('.right-tab').forEach((tab) => tab.addEventListener('click', () => { state.rightTab = tab.dataset.tab; renderRight(); renderTabs(); }));
    document.getElementById('direction-filter').addEventListener('click', (event) => {
      const button = event.target.closest('[data-direction]');
      if (!button) return;
      state.indexDirection = button.dataset.direction;
      renderRight();
    });
    document.getElementById('type-filter-trigger').addEventListener('click', (event) => {
      event.stopPropagation();
      state.openSurface === 'type' ? closeSurfaces() : openSurface('type', event.currentTarget);
    });
    elements.typeFilterMenu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-index-type]');
      if (!option) return;
      state.indexType = option.dataset.indexType;
      closeSurfaces();
      renderRight();
    });
    document.getElementById('collapse-right').addEventListener('click', () => { state.rightCollapsed = true; renderAll(); });
    document.getElementById('restore-right').addEventListener('click', () => { state.rightCollapsed = false; renderAll(); });
    document.getElementById('new-thread').addEventListener('click', () => {
      saveCurrentDraft();
      state.assistantId = 'default';
      state.replyTarget = null;
      state.workflowId = null;
      state.addedDocument = null;
      state.modelMode = 'auto';
      state.modelId = null;
      state.vaultSearch = false;
      state.webSearch = false;
      setView('new', true);
      restoreCurrentDraft();
    });
    document.getElementById('open-workspace-search').addEventListener('click', () => {
      openSurface('native-search');
    });
    document.getElementById('regenerate-title').addEventListener('click', regenerateTitle);
    document.getElementById('composer-plus').addEventListener('click', (event) => { event.stopPropagation(); state.openSurface === 'plus' ? closeSurfaces() : openSurface('plus', event.currentTarget); });
    document.getElementById('source-settings').addEventListener('click', (event) => { event.stopPropagation(); state.openSurface === 'source' ? closeSurfaces() : openSurface('source', event.currentTarget); });
    document.getElementById('run-settings').addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.openSurface === 'run') { closeSurfaces(); return; }
      state.openRunView = 'main';
      openSurface('run', event.currentTarget);
    });
    elements.plusMenu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-composer-action]')?.dataset.composerAction;
      if (!action) return;
      if (action === 'vault') {
        elements.composerInput.value = `${elements.composerInput.value}[[`;
        openVaultDocumentPicker();
        return;
      }
      const labels = { files: '已打开文件选择器', link: '粘贴链接后会生成资源预览' };
      showToast(labels[action]);
      closeSurfaces();
    });
    elements.workflowPopover.addEventListener('click', (event) => {
      const workflow = event.target.closest('[data-workflow]')?.dataset.workflow;
      if (!workflow) return;
      state.workflowId = workflow;
      elements.composerInput.value = elements.composerInput.value.replace(/\/\s*$/, '');
      elements.sendButton.disabled = !elements.composerInput.value.trim();
      renderComposerContext();
      closeSurfaces();
      elements.composerInput.focus();
    });
    elements.sourcePopover.addEventListener('click', (event) => {
      const option = event.target.closest('[data-source-toggle]');
      if (!option || option.dataset.sourceToggle === 'project') return;
      if (option.dataset.sourceToggle === 'vault') state.vaultSearch = !state.vaultSearch;
      if (option.dataset.sourceToggle === 'web') state.webSearch = !state.webSearch;
      updateSourceTrigger();
    });
    document.getElementById('run-back').addEventListener('click', () => {
      state.openRunView = 'main';
      renderRunPanel();
    });
    elements.runPanelBody.addEventListener('click', (event) => {
      event.stopPropagation();
      const viewButton = event.target.closest('[data-run-view]');
      if (viewButton) {
        state.openRunView = viewButton.dataset.runView;
        renderRunPanel();
        return;
      }
      if (event.target.closest('[data-model-filter-toggle]')) {
        state.modelFilterOpen = !state.modelFilterOpen;
        renderRunPanel();
        return;
      }
      const capability = event.target.closest('[data-model-capability]')?.dataset.modelCapability;
      if (capability) {
        if (state.modelCapabilities.has(capability)) state.modelCapabilities.delete(capability);
        else state.modelCapabilities.add(capability);
        renderRunPanel();
        return;
      }
      const context = event.target.closest('[data-model-context]')?.dataset.modelContext;
      if (context !== undefined) {
        state.modelContextMin = Number(context);
        renderRunPanel();
        return;
      }
      if (event.target.closest('[data-model-filter-clear]')) {
        state.modelCapabilities.clear();
        state.modelContextMin = 0;
        renderRunPanel();
        return;
      }
      const model = event.target.closest('[data-model]');
      if (model) {
        state.modelMode = model.dataset.model === 'auto' ? 'auto' : 'fixed';
        state.modelId = model.dataset.model === 'auto' ? null : model.dataset.model;
        updateRunTrigger();
        renderRunPanel();
        return;
      }
      const assistant = event.target.closest('[data-assistant]');
      if (!assistant) return;
      state.assistantId = assistant.dataset.assistant;
      renderComposerContext();
      closeSurfaces();
    });
    elements.runPanelBody.addEventListener('input', (event) => {
      if (event.target.matches('[data-model-search]')) state.modelQuery = event.target.value;
      else if (event.target.matches('[data-assistant-search]')) state.assistantQuery = event.target.value;
      else return;
      const selector = event.target.matches('[data-model-search]') ? '[data-model-search]' : '[data-assistant-search]';
      renderRunPanel();
      const input = elements.runPanelBody.querySelector(selector);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
    document.getElementById('close-review').addEventListener('click', () => { state.reviewOpen = false; renderReview(); });
    document.addEventListener('mouseover', (event) => { const target = event.target.closest('[data-resource-preview]'); if (target) showResourcePreview(target); });
    document.addEventListener('mouseout', (event) => { if (event.target.closest('[data-resource-preview]')) hideResourcePreview(); });
    document.addEventListener('click', (event) => {
      if (state.openSurface === 'plus' && !event.target.closest('#composer-plus-menu, #composer-plus')) closeSurfaces();
      if (state.openSurface === 'workflow' && !event.target.closest('#workflow-popover, #composer-plus')) closeSurfaces();
      if (state.openSurface === 'run' && !event.target.closest('#run-popover, #run-settings')) closeSurfaces();
      if (state.openSurface === 'source' && !event.target.closest('#source-popover, #source-settings')) closeSurfaces();
      if (state.openSurface === 'context' && !event.target.closest('#context-stack-popover, #context-stack-trigger')) closeSurfaces();
      if (state.openSurface === 'type' && !event.target.closest('#type-filter-menu, #type-filter-trigger')) closeSurfaces();
      if (!event.target.closest('.row-context-menu, .message-action-menu, .suggested-next-menu, [data-row-menu], [data-project-menu], [data-message-menu], [data-suggestion-menu]')) closeTransientMenus();
    });
    window.addEventListener('resize', () => { renderReview(); closeSurfaces(); scheduleMessageActionLayout(); updateAdaptiveComposer(); });
    window.addEventListener('hashchange', () => setView(location.hash.slice(1), false));
    configureSplitter(document.getElementById('left-splitter'), 'left');
    configureSplitter(document.getElementById('right-splitter'), 'right');
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (state.openSurface) { closeSurfaces(); return; }
        if (document.querySelector('.row-context-menu, .message-action-menu, .suggested-next-menu')) { closeTransientMenus(); return; }
      }
      const editing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (editing) return;
      const key = event.key.toLocaleLowerCase();
      if (key === 'd') { state.reviewOpen = !state.reviewOpen; renderReview(); return; }
      if (key === 't') { state.theme = state.theme === 'light' ? 'dark' : 'light'; renderAll(); return; }
      if (key === 'r') { resetState(); return; }
      if (['a', 'b', 'c'].includes(key)) { state.reviewVariant = key; renderAll(); return; }
      const number = Number(event.key);
      if (number >= 1 && number <= fixtures.reviewStates.length) setView(fixtures.reviewStates[number - 1].hash, true);
    });
  }

  function initialiseFromUrl() {
    const parameters = new URLSearchParams(location.search);
    const variant = parameters.get('variant');
    if (['a', 'b', 'c', 'centre-a', 'centre-b', 'centre-c'].includes(variant)) state.reviewVariant = variant.slice(-1);
    if (window.innerWidth < 1000) {
      state.leftWidth = 200;
      state.rightWidth = 220;
    }
    setView(location.hash.slice(1) || 'active', false);
  }

  decorateIcons(document);
  bindEvents();
  initialiseFromUrl();
}());
