(() => {
  const BASE_COMPOSER_HEIGHT = 100;
  const BASE_INPUT_HEIGHT = 30;
  const CONTEXT_PREVIEW_LIMIT = 420;
  const timeline = document.getElementById('timeline');
  const composerStack = document.getElementById('composer-stack');
  const composerFrame = document.getElementById('composer-frame');
  const input = document.getElementById('composer-input');
  const send = document.getElementById('send-trigger');
  const compactTrigger = document.getElementById('compact-trigger');
  const jumpLatest = document.getElementById('jump-latest');
  const suggestionRow = document.getElementById('suggestion-row');
  const statusStrip = document.getElementById('status-strip');
  const statusCopy = document.getElementById('status-copy');
  const attachmentShelf = document.getElementById('attachment-shelf');
  const dynamicMessages = document.getElementById('dynamic-messages');
  const stateReadout = document.getElementById('state-readout');
  const contextLabel = document.getElementById('context-label');
  const contextPreviewTitle = document.getElementById('context-preview-title');
  const contextTotal = document.getElementById('context-total');
  const contextIncludedCount = document.getElementById('context-included-count');
  const contextPreviewSummary = document.getElementById('context-preview-summary');
  const contextMenuTitle = document.getElementById('context-menu-title');
  const contextMenuSubtitle = document.getElementById('context-menu-subtitle');
  const contextPhaseChip = document.getElementById('context-phase-chip');
  const contextPhaseLabel = document.getElementById('context-phase-label');
  const contextTechnicalToggle = document.getElementById('context-technical-toggle');
  const resourceSlotDetail = document.getElementById('resource-slot-detail');
  const resourceSlotState = document.getElementById('resource-slot-state');
  const activitySlotState = document.getElementById('activity-slot-state');
  const currentMessageDetail = document.getElementById('current-message-detail');
  const currentMessageState = document.getElementById('current-message-state');
  const compactSourceCount = document.getElementById('compact-source-count');
  const assistantLabel = document.getElementById('assistant-label');
  const assistantSlotTitle = document.getElementById('assistant-slot-title');
  const assistantSlotDetail = document.getElementById('assistant-slot-detail');
  const assistantSlotState = document.getElementById('assistant-slot-state');
  const identityName = document.getElementById('identity-name');
  const modelLabel = document.getElementById('model-label');
  const contextInspector = document.getElementById('context-item-inspector');
  const contextDetailPhase = document.getElementById('context-detail-phase');
  const contextDetailTitle = document.getElementById('context-detail-title');
  const contextDetailSource = document.getElementById('context-detail-source');
  const contextDetailReason = document.getElementById('context-detail-reason');
  const contextDetailBudget = document.getElementById('context-detail-budget');
  const contextDetailTreatment = document.getElementById('context-detail-treatment');
  const contextDetailContent = document.getElementById('context-detail-content');
  const contextDetailClose = document.getElementById('context-detail-close');
  const contextDetailCompleteness = document.getElementById('context-detail-completeness');
  const contextDetailRange = document.getElementById('context-detail-range');
  const contextDetailOpenFull = document.getElementById('context-detail-open-full');
  const contextFullView = document.getElementById('context-full-view');
  const contextFullBack = document.getElementById('context-full-back');
  const contextFullPhase = document.getElementById('context-full-phase');
  const contextFullTitle = document.getElementById('context-full-title');
  const contextFullWrap = document.getElementById('context-full-wrap');
  const contextFullCopy = document.getElementById('context-full-copy');
  const contextFullSearch = document.getElementById('context-full-search');
  const contextFullSearchStatus = document.getElementById('context-full-search-status');
  const contextFullCompleteness = document.getElementById('context-full-completeness');
  const contextFullChars = document.getElementById('context-full-chars');
  const contextFullTokens = document.getElementById('context-full-tokens');
  const contextFullContent = document.getElementById('context-full-content');
  const contextFullSource = document.getElementById('context-full-source');
  const contextFullTreatment = document.getElementById('context-full-treatment');

  const menus = {
    plus: document.getElementById('plus-menu'),
    context: document.getElementById('context-menu'),
    assistant: document.getElementById('assistant-menu'),
    model: document.getElementById('model-menu')
  };

  const triggers = {
    plus: document.getElementById('plus-trigger'),
    context: document.getElementById('context-trigger'),
    assistant: document.getElementById('assistant-trigger'),
    model: document.getElementById('model-trigger')
  };

  const demoButtons = {
    reading: document.getElementById('demo-reading'),
    latest: document.getElementById('demo-latest'),
    running: document.getElementById('demo-running')
  };

  const state = {
    nearBottom: true,
    focused: false,
    openMenu: null,
    running: false,
    runTimer: null,
    activeLayerCount: 9,
    sourceCount: 6,
    attachmentCount: 0,
    statusTimer: null,
    contextViewMode: 'preview',
    showTechnicalContext: false,
    menuReturnFocus: null,
    lastRunSnapshot: null,
    contextSnapshot: null,
    activeContextSlot: null,
    contextDetailReturnFocus: null,
    fullContextSlot: null,
    fullViewReturnFocus: null,
    fullContentWrap: true,
    copyStatusTimer: null
  };

  const attachmentCatalog = {
    file: ['image', 'Composer spacing feedback.png'],
    vault: ['file', 'Chat Studio UX direction.md'],
    link: ['link', 'Product reference link'],
    active: ['file', 'Active note selection'],
    canvas: ['canvas', 'Adaptive composer canvas']
  };

  const contextSlotCatalog = {
    system: {
      title: 'System prompt',
      source: 'Template + conversation settings',
      reason: 'Required base behaviour',
      budget: '~420 / 1,500 tokens',
      treatment: 'Never dropped',
      content: 'You are Peak Assistant inside the current Vault.\nFollow the active conversation instructions.\nAvailable capabilities: Vault Search, file references, and artifacts.\nFocus folder: Peak Assistant.\n[Secrets and provider credentials are never included.]'
    },
    assistant: {
      title: 'Assistant · Research partner',
      source: 'Assistant profile · Research partner',
      reason: 'Selected conversation identity',
      budget: '~138 / 2,000 tokens',
      treatment: 'Framing may compress',
      content: 'Role: Research partner\nPrioritize evidence-backed product and architecture guidance.\nChallenge unclear assumptions before proposing implementation.\nKeep decisions traceable to the current project context.'
    },
    history: {
      title: 'Conversation history',
      source: 'Active conversation · 18 messages',
      reason: 'Preserve turn continuity',
      budget: '~2,960 tokens',
      treatment: 'Active variants only · up to L3',
      content: [
        'You: Review the current Chat Studio composer. I want it to stay quiet while I read, then open naturally when I reach the latest turn.',
        'Assistant: I mapped the current controls before changing the shell. The useful capabilities are already present; the missing piece is a clear interaction rhythm.',
        'You: Keep all the real controls. I do not want a simplified demo that hides what the product can do.',
        'Assistant: The controls stay; their hierarchy changes. Primary intent remains in the text field. Turn context, identity, and routing become compact status chips.',
        'You: The motion in the reference is important. It feels like one object changing state, not two components replacing each other.',
        'Assistant: Scroll upward and the composer becomes a compact reading pill. Return to the latest turn and the same shell expands with one shared easing curve.',
        'You: The bottom of the input still has too much empty space. It should feel compact and intentional.',
        'Assistant: The idle composer is now 100px high, grows only with actual text or attachments, and returns to its base height when cleared.',
        'You: I also need to know the context for the next message, including history, summary, working context, and user profile.',
        'Assistant: The composer now exposes the ordered context stack and distinguishes what will be included, what is frozen at send, and what was actually used.',
        'You: Every context item should be inspectable so I can see the concrete content.',
        'Assistant: Each layer opens into one inline inspector with its source, inclusion reason, token budget, treatment, and serialized content preview.',
        'You: Some content previews will be much longer. How should those behave?',
        'Assistant: Keep a short inline preview, disclose the visible range, and move the exact payload into a full-width reader with search, copy, and wrapping controls.',
        'System event: Active variant 2 replaced an earlier retry. Only the active variant remains in the history layer.',
        'System event: Context budget fitting retained required layers and compressed optional activity signals.',
        'Assistant note: Parent-branch history, inactive variants, and unretrieved web results remain explicitly excluded.',
        'Current state: The next-message composer is ready for an implementation-oriented design review.'
      ].join('\n\n')
    },
    working: {
      title: 'Working context',
      source: 'Current Obsidian workspace',
      reason: 'Ground the answer in current work',
      budget: '~186 / 500 tokens',
      treatment: 'Optional · priority compressed',
      content: 'Active note: Chat Studio redesign.md\nFocus folder: Peak Assistant\nWorking theme: Adaptive composer and message-context audit\nRecent activity: reviewed composer spacing and context pipeline docs'
    },
    summary: {
      title: 'Conversation summary',
      source: 'Durable conversation summary',
      reason: 'Recover older decisions',
      budget: '~312 / 800 tokens',
      treatment: 'Recoverable · may compress',
      content: 'The user is redesigning Chat Studio around a quiet reading state and an adaptive composer. Preserve all real controls, expose the next-message context, align popovers to the composer width, and avoid excess vertical whitespace. The context surface must distinguish predicted, frozen, and actually used inputs.'
    },
    activity: {
      title: 'Activity index',
      source: 'Local activity index · 8 events',
      reason: 'Add lightweight recency signals',
      budget: '~74 / 200 tokens',
      treatment: 'Reduced to counts at L1',
      content: 'Opened: Chat Studio redesign.md\nViewed: chat-context pipeline document\nSearched: conversation summary, user profile\nReviewed: 2 composer recordings\n[…4 more local events]'
    },
    profile: {
      title: 'User profile',
      source: 'Accepted user-profile facts',
      reason: 'Respect durable preferences',
      budget: '~96 / 400 tokens',
      treatment: 'Top categories survive at L1',
      content: 'Language: Chinese-first\nCommunication: direct, owner-facing, evidence-bound\nDesign preference: restrained, modern, compact\nProject preference: durable artifacts and explicit verification boundaries'
    },
    analyses: {
      title: 'Previous analyses',
      source: 'Analysis record index',
      reason: 'No matching record',
      budget: '0 tokens',
      treatment: 'Empty slot omitted',
      content: '[No content included]\nNo recent analysis record matched this turn.'
    },
    resources: {
      title: 'Resource index',
      source: 'This-turn resource references',
      reason: 'Ground claims in selected evidence',
      budget: '~224 / 300 tokens',
      treatment: 'References + summaries only',
      content: '1. Chat Studio UX direction · design convention\n2. Reference recording · 32 seconds\n3. Runtime boundaries · implementation spec\n4. Composer spacing feedback.png · visual evidence\n5. Active note selection · explicit context\n6. Context pipeline document · architecture reference'
    },
    message: {
      title: 'Current user message',
      source: 'Composer draft',
      reason: 'Required current instruction',
      budget: 'Exact text · outside optional budget',
      treatment: 'Never summarized',
      content: '[Captured when the message is sent]'
    }
  };

  function icon(name) {
    return `<svg class="icon"><use href="#icon-${name}"></use></svg>`;
  }

  function distanceFromBottom() {
    return timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop;
  }

  function canScrollVertically(element, deltaY) {
    if (element.scrollHeight <= element.clientHeight + 1) return false;
    if (deltaY < 0) return element.scrollTop > 0;
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }

  function routeComposerWheelToTimeline(event) {
    if (event.ctrlKey || event.deltaY === 0) return;
    const inputTarget = event.target instanceof Element ? event.target.closest('#composer-input') : null;
    if (inputTarget && canScrollVertically(inputTarget, event.deltaY)) return;

    event.preventDefault();
    const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? timeline.clientHeight
        : 1;
    timeline.scrollTop += event.deltaY * deltaScale;
  }

  function updateBottomState() {
    const distance = distanceFromBottom();
    if (state.nearBottom && distance > 160) state.nearBottom = false;
    if (!state.nearBottom && distance < 64) state.nearBottom = true;
    renderComposerState();
  }

  function hasDraft() {
    return Boolean(input.value.trim());
  }

  function hasAttachments() {
    return state.attachmentCount > 0;
  }

  function shouldExpand() {
    return state.nearBottom || state.focused || hasDraft() || hasAttachments() || Boolean(state.openMenu) || state.running;
  }

  function composerStateName(expanded) {
    if (state.running) return 'Running';
    if (!expanded) return 'Reading';
    if (state.openMenu) return 'Menu open';
    if (state.focused || hasDraft() || hasAttachments()) return 'Active';
    return 'Ready';
  }

  function updateDemoButtons(name) {
    Object.values(demoButtons).forEach((button) => button.classList.remove('is-active'));
    if (name === 'Reading') demoButtons.reading.classList.add('is-active');
    if (name === 'Ready' || name === 'Active' || name === 'Menu open') demoButtons.latest.classList.add('is-active');
    if (name === 'Running') demoButtons.running.classList.add('is-active');
  }

  function setComposerHeight() {
    const previousInputHeight = input.style.height;
    input.style.height = '1px';
    const naturalInputHeight = input.scrollHeight;
    input.style.height = previousInputHeight;

    const textGrowth = Math.max(0, Math.min(82, naturalInputHeight - BASE_INPUT_HEIGHT));
    const shelfGrowth = hasAttachments() ? 31 : 0;
    const nextHeight = BASE_COMPOSER_HEIGHT + textGrowth + shelfGrowth;
    composerStack.style.setProperty('--composer-height', `${nextHeight}px`);
  }

  function updateDraftContext() {
    const draftLength = input.value.trim().length;
    const attachmentCopy = state.attachmentCount > 0 ? ` · ${state.attachmentCount} attachment${state.attachmentCount === 1 ? '' : 's'}` : '';
    currentMessageDetail.textContent = draftLength > 0
      ? `${draftLength} draft characters${attachmentCopy} are ready for this turn.`
      : `Exact draft text${attachmentCopy} will be added when you send.`;
    const hasTurnInput = draftLength > 0 || state.attachmentCount > 0;
    setSlotState(currentMessageState, hasTurnInput ? 'Ready' : 'At send', hasTurnInput ? 'is-included' : 'is-pending');
    if (state.activeContextSlot === 'message') refreshContextInspector();
  }

  function setSlotState(element, text, tone) {
    element.textContent = text;
    element.classList.remove('is-included', 'is-excluded', 'is-pending', 'is-compressed', 'is-used');
    element.classList.add(tone);
  }

  function getDetailSnapshot() {
    if (state.contextViewMode === 'preview') {
      return {
        message: input.value.trim(),
        sources: state.sourceCount,
        attachments: state.attachmentCount
      };
    }
    return state.contextSnapshot || state.lastRunSnapshot || {
      message: '',
      sources: state.sourceCount,
      attachments: state.attachmentCount
    };
  }

  function getContextSlotDetail(slot) {
    const base = contextSlotCatalog[slot];
    const detail = { ...base };
    const snapshot = getDetailSnapshot();
    const phase = state.contextViewMode;

    if (slot === 'assistant') {
      const selectedAssistant = assistantLabel.textContent;
      detail.title = `Assistant · ${selectedAssistant}`;
      detail.source = `Assistant profile · ${selectedAssistant}`;
      if (selectedAssistant === 'Default assistant') {
        detail.reason = 'No authored identity selected';
        detail.budget = '0 tokens';
        detail.treatment = 'Empty slot omitted';
        detail.content = '[No assistant-specific content included]';
      }
    }

    if (slot === 'message') {
      const message = snapshot.message || '[No draft text yet]\nExact text will be captured when you send.';
      detail.source = phase === 'preview' ? 'Composer draft' : 'Submitted message snapshot';
      detail.content = message;
      if (snapshot.attachments > 0) detail.content += `\n\nAttachments: ${snapshot.attachments} explicit this-turn reference${snapshot.attachments === 1 ? '' : 's'}`;
    }

    if (slot === 'resources') {
      const resourceLines = base.content.split('\n');
      const visibleCount = phase === 'actual' ? Math.min(4, snapshot.sources) : Math.min(resourceLines.length, snapshot.sources);
      detail.content = resourceLines.slice(0, visibleCount).join('\n');
      if (snapshot.sources > resourceLines.length) detail.content += `\n+ ${snapshot.sources - resourceLines.length} explicit attachment reference${snapshot.sources - resourceLines.length === 1 ? '' : 's'}`;
      if (phase === 'actual') detail.treatment = `${visibleCount} of ${snapshot.sources} summaries used`;
    }

    if (slot === 'activity' && phase === 'actual') {
      detail.budget = '~18 tokens after L1';
      detail.treatment = 'Compressed to counts';
      detail.content = '8 recent local events · 2 opens · 2 searches · 2 reviews · 2 actions';
    }

    if (phase === 'frozen') detail.treatment = `Frozen at send · ${detail.treatment}`;
    if (phase === 'actual' && slot !== 'activity' && slot !== 'resources') detail.treatment = `Recorded receipt · ${detail.treatment}`;

    detail.completeness = 'Complete layer';
    if (slot === 'analyses') detail.completeness = 'Omitted · empty';
    if (slot === 'activity' && phase === 'actual') detail.completeness = 'Compressed at L1';
    if (slot === 'resources' && phase === 'actual') detail.completeness = `Filtered · ${Math.min(4, snapshot.sources)} / ${snapshot.sources}`;

    return detail;
  }

  function renderContextFullContent(content) {
    const query = contextFullSearch.value.trim();
    contextFullContent.replaceChildren();
    if (!query) {
      contextFullContent.textContent = content;
      contextFullSearchStatus.textContent = 'Search exact content';
      return;
    }

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let cursor = 0;
    let matchCount = 0;
    while (cursor < content.length) {
      const matchIndex = lowerContent.indexOf(lowerQuery, cursor);
      if (matchIndex === -1) {
        contextFullContent.append(document.createTextNode(content.slice(cursor)));
        break;
      }
      if (matchIndex > cursor) contextFullContent.append(document.createTextNode(content.slice(cursor, matchIndex)));
      const mark = document.createElement('mark');
      mark.textContent = content.slice(matchIndex, matchIndex + query.length);
      contextFullContent.append(mark);
      matchCount += 1;
      cursor = matchIndex + query.length;
    }
    contextFullSearchStatus.textContent = matchCount === 1 ? '1 match' : `${matchCount} matches`;
  }

  function refreshContextFullViewer() {
    if (!state.fullContextSlot || contextFullView.hidden) return;
    const detail = getContextSlotDetail(state.fullContextSlot);
    const phaseLabels = {
      preview: 'Will include',
      frozen: 'Frozen snapshot',
      actual: 'Actually used'
    };
    contextFullPhase.textContent = phaseLabels[state.contextViewMode];
    contextFullTitle.textContent = detail.title;
    contextFullCompleteness.textContent = detail.completeness;
    contextFullChars.textContent = `${detail.content.length.toLocaleString()} characters`;
    contextFullTokens.textContent = `~${Math.max(1, Math.ceil(detail.content.length / 4)).toLocaleString()} tokens`;
    contextFullSource.textContent = detail.source;
    contextFullTreatment.textContent = detail.treatment;
    contextFullContent.classList.toggle('is-nowrap', !state.fullContentWrap);
    contextFullWrap.classList.toggle('is-active', state.fullContentWrap);
    contextFullWrap.setAttribute('aria-pressed', String(state.fullContentWrap));
    renderContextFullContent(detail.content);
  }

  function openContextFullViewer() {
    if (!state.activeContextSlot) return;
    state.fullContextSlot = state.activeContextSlot;
    state.fullViewReturnFocus = contextDetailOpenFull;
    contextFullSearch.value = '';
    menus.context.classList.add('is-full-view');
    contextFullView.hidden = false;
    refreshContextFullViewer();
    window.setTimeout(() => contextFullSearch.focus({ preventScroll: true }), 0);
  }

  function closeContextFullViewer(restoreFocus = false) {
    if (contextFullView.hidden) return;
    const returnFocus = state.fullViewReturnFocus;
    menus.context.classList.remove('is-full-view');
    contextFullView.hidden = true;
    contextFullSearch.value = '';
    state.fullContextSlot = null;
    state.fullViewReturnFocus = null;
    if (restoreFocus && returnFocus) {
      window.setTimeout(() => returnFocus.focus({ preventScroll: true }), 0);
    }
  }

  function refreshContextInspector() {
    if (!state.activeContextSlot || contextInspector.hidden) return;
    const detail = getContextSlotDetail(state.activeContextSlot);
    const phaseLabels = {
      preview: 'Will include',
      frozen: 'Frozen snapshot',
      actual: 'Actually used'
    };
    contextInspector.dataset.phase = state.contextViewMode;
    contextDetailPhase.textContent = phaseLabels[state.contextViewMode];
    contextDetailTitle.textContent = detail.title;
    contextDetailSource.textContent = detail.source;
    contextDetailReason.textContent = detail.reason;
    contextDetailBudget.textContent = detail.budget;
    contextDetailTreatment.textContent = detail.treatment;
    const hasLongContent = detail.content.length > CONTEXT_PREVIEW_LIMIT;
    const previewContent = hasLongContent ? detail.content.slice(0, CONTEXT_PREVIEW_LIMIT).trimEnd() : detail.content;
    contextInspector.classList.toggle('has-long-content', hasLongContent);
    contextDetailCompleteness.textContent = hasLongContent ? 'Preview truncated' : detail.completeness;
    contextDetailContent.textContent = previewContent;
    contextDetailRange.textContent = hasLongContent
      ? `Showing ${previewContent.length.toLocaleString()} of ${detail.content.length.toLocaleString()} characters`
      : `${detail.content.length.toLocaleString()} characters · complete`;
    contextDetailOpenFull.hidden = !hasLongContent;
    refreshContextFullViewer();
  }

  function closeContextInspector(restoreFocus = false) {
    const returnFocus = state.contextDetailReturnFocus;
    closeContextFullViewer();
    if (returnFocus) {
      returnFocus.setAttribute('aria-expanded', 'false');
      returnFocus.classList.remove('is-inspected');
    }
    state.activeContextSlot = null;
    state.contextDetailReturnFocus = null;
    contextInspector.hidden = true;
    if (restoreFocus && returnFocus) {
      window.setTimeout(() => returnFocus.focus({ preventScroll: true }), 0);
    }
  }

  function openContextInspector(trigger) {
    const slot = trigger.dataset.contextSlot;
    if (state.activeContextSlot === slot) {
      closeContextInspector(true);
      return;
    }

    closeContextInspector();
    state.activeContextSlot = slot;
    state.contextDetailReturnFocus = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('is-inspected');
    trigger.insertAdjacentElement('afterend', contextInspector);
    contextInspector.hidden = false;
    refreshContextInspector();
    window.requestAnimationFrame(() => contextInspector.scrollIntoView({ block: 'nearest' }));
  }

  function renderContextView(mode = 'preview', runSnapshot = null) {
    state.contextViewMode = mode;
    if (mode === 'preview') state.contextSnapshot = null;
    if (runSnapshot) state.contextSnapshot = runSnapshot;
    const snapshot = runSnapshot || state.contextSnapshot || state.lastRunSnapshot || {
      layers: state.activeLayerCount,
      sources: state.sourceCount,
      attachments: state.attachmentCount,
      message: input.value.trim()
    };
    const sourceWord = snapshot.sources === 1 ? 'resource' : 'resources';

    contextPhaseChip.classList.remove('is-preview', 'is-frozen', 'is-actual');
    contextPhaseChip.classList.add(`is-${mode}`);

    if (mode === 'frozen') {
      contextPreviewTitle.textContent = 'Context snapshot';
      contextPreviewSummary.textContent = `Frozen at send · ${snapshot.sources} ${sourceWord} · ${snapshot.attachments} attachments`;
      contextLabel.textContent = 'Snapshot frozen';
      contextMenuTitle.textContent = 'Context snapshot for this run';
      contextMenuSubtitle.textContent = 'Frozen when the message was sent; later edits do not change this run';
      contextPhaseLabel.textContent = 'Frozen';
      contextTotal.textContent = `${snapshot.layers} / 10`;
      contextIncludedCount.textContent = String(snapshot.layers);
      resourceSlotDetail.textContent = `${snapshot.sources} references and summaries were frozen for this run.`;
      setSlotState(resourceSlotState, 'Included', 'is-included');
      setSlotState(activitySlotState, 'Included', 'is-included');
      currentMessageDetail.textContent = `${snapshot.message.length} characters and ${snapshot.attachments} attachments were captured at send.`;
      setSlotState(currentMessageState, 'Included', 'is-included');
      refreshContextInspector();
      return;
    }

    if (mode === 'actual') {
      const usedSources = Math.min(4, snapshot.sources);
      contextPreviewTitle.textContent = 'Context receipt';
      contextPreviewSummary.textContent = `Budget fitted · ${usedSources} of ${snapshot.sources} resources used`;
      contextLabel.textContent = `${snapshot.layers} layers used`;
      contextMenuTitle.textContent = 'Context actually used';
      contextMenuSubtitle.textContent = 'Recorded after retrieval and token-budget fitting completed';
      contextPhaseLabel.textContent = 'Actually used';
      contextTotal.textContent = `${snapshot.layers} / 10`;
      contextIncludedCount.textContent = String(snapshot.layers);
      resourceSlotDetail.textContent = `${usedSources} of ${snapshot.sources} resource summaries were selected after retrieval.`;
      setSlotState(resourceSlotState, `${usedSources} / ${snapshot.sources} used`, 'is-used');
      setSlotState(activitySlotState, 'Compressed', 'is-compressed');
      currentMessageDetail.textContent = `${snapshot.message.length} submitted characters and ${snapshot.attachments} attachments were used.`;
      setSlotState(currentMessageState, 'Used', 'is-used');
      refreshContextInspector();
      return;
    }

    contextPreviewTitle.textContent = 'Context stack';
    contextPreviewSummary.textContent = `History · Summary · Working context · User profile · ${state.sourceCount} resources`;
    contextLabel.textContent = `${state.activeLayerCount} layers ready`;
    contextMenuTitle.textContent = 'Context for next message';
    contextMenuSubtitle.textContent = 'What will be assembled if you send now';
    contextPhaseLabel.textContent = 'Will include';
    contextTotal.textContent = `${state.activeLayerCount} / 10`;
    contextIncludedCount.textContent = String(state.activeLayerCount);
    resourceSlotDetail.textContent = `${state.sourceCount} references and summaries selected for this turn.`;
    setSlotState(resourceSlotState, 'Included', 'is-included');
    setSlotState(activitySlotState, 'Included', 'is-included');
    updateDraftContext();
    refreshContextInspector();
  }

  function renderComposerState() {
    const expanded = shouldExpand();
    const name = composerStateName(expanded);

    composerFrame.classList.toggle('is-expanded', expanded);
    composerFrame.classList.toggle('is-compact', !expanded);
    composerFrame.classList.toggle('is-focused', state.focused);
    composerFrame.classList.toggle('has-menu', Boolean(state.openMenu));
    composerFrame.dataset.state = name.toLowerCase().replace(' ', '-');
    stateReadout.textContent = name;
    if (state.contextViewMode === 'preview') updateDraftContext();
    updateDemoButtons(name);

    const showSuggestions = expanded && state.nearBottom && !state.focused && !hasDraft() && !hasAttachments() && !state.openMenu && !state.running;
    suggestionRow.classList.toggle('is-hidden', !showSuggestions);
    jumpLatest.hidden = state.nearBottom || state.running;

    if (!expanded) {
      composerStack.style.setProperty('--composer-height', '50px');
      return;
    }
    setComposerHeight();
  }

  function closeMenus(restoreFocus = false) {
    const returnFocus = state.menuReturnFocus;
    closeContextInspector();
    state.openMenu = null;
    state.menuReturnFocus = null;
    Object.entries(menus).forEach(([name, menu]) => {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      triggers[name].setAttribute('aria-expanded', 'false');
    });
    if (returnFocus && returnFocus !== triggers.context) returnFocus.setAttribute('aria-expanded', 'false');
    if (!state.running && state.contextViewMode !== 'preview') renderContextView('preview');
    renderComposerState();
    if (restoreFocus && returnFocus) {
      window.setTimeout(() => returnFocus.focus({ preventScroll: true }), 0);
    }
  }

  function openMenu(name, returnFocus = triggers[name], contextMode = null, contextSnapshot = null) {
    if (state.openMenu === name && state.menuReturnFocus === returnFocus) {
      closeMenus(true);
      return;
    }
    closeMenus();
    if (name === 'context') renderContextView(contextMode || (state.running ? 'frozen' : 'preview'), contextSnapshot);
    state.openMenu = name;
    state.menuReturnFocus = returnFocus;
    menus[name].classList.add('is-open');
    menus[name].setAttribute('aria-hidden', 'false');
    triggers[name].setAttribute('aria-expanded', 'true');
    if (returnFocus !== triggers[name]) returnFocus.setAttribute('aria-expanded', 'true');
    renderComposerState();
    window.setTimeout(() => {
      const focusTarget = menus[name].querySelector('input');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }, 180);
  }

  function scrollToLatest(behavior = 'smooth') {
    timeline.scrollTo({ top: timeline.scrollHeight, behavior });
  }

  function scrollToReading() {
    closeMenus();
    input.blur();
    state.focused = false;
    if (hasDraft() || hasAttachments()) {
      input.value = '';
      clearAttachments();
    }
    const maxScroll = Math.max(0, timeline.scrollHeight - timeline.clientHeight);
    timeline.scrollTo({ top: Math.max(80, maxScroll * 0.34), behavior: 'smooth' });
    window.setTimeout(updateBottomState, 280);
  }

  function autoSizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(116, Math.max(BASE_INPUT_HEIGHT, input.scrollHeight))}px`;
    send.disabled = !hasDraft() && !state.running;
    setComposerHeight();
    renderComposerState();
  }

  function showStatus(title, note, duration = 2400) {
    window.clearTimeout(state.statusTimer);
    statusCopy.innerHTML = `<strong>${title}</strong><small>${note}</small>`;
    statusStrip.hidden = false;
    suggestionRow.classList.add('is-hidden');
    if (duration > 0) {
      state.statusTimer = window.setTimeout(() => {
        statusStrip.hidden = true;
        renderComposerState();
      }, duration);
    }
  }

  function hideStatus() {
    window.clearTimeout(state.statusTimer);
    statusStrip.hidden = true;
    renderComposerState();
  }

  function updateSourceCount(delta) {
    state.sourceCount = Math.max(3, state.sourceCount + delta);
    compactSourceCount.textContent = String(state.sourceCount);
    if (state.contextViewMode === 'preview') renderContextView('preview');
  }

  function updateAssistantContext(name) {
    const usesAssistantSlot = name !== 'Default assistant';
    const activeLayers = usesAssistantSlot ? 9 : 8;
    state.activeLayerCount = activeLayers;
    const assistantRow = assistantSlotTitle.closest('.context-slot-row');
    assistantSlotTitle.textContent = `Assistant · ${name}`;
    assistantSlotDetail.textContent = usesAssistantSlot
      ? 'Conversation identity and authored guidance for future turns.'
      : 'No authored Assistant guidance will be added.';
    assistantSlotState.textContent = usesAssistantSlot ? 'Included' : 'Not added';
    assistantSlotState.classList.toggle('is-included', usesAssistantSlot);
    assistantSlotState.classList.toggle('is-excluded', !usesAssistantSlot);
    assistantRow.classList.toggle('is-absent', !usesAssistantSlot);
    if (state.contextViewMode === 'preview') renderContextView('preview');
  }

  function addAttachment(type) {
    const [iconName, label] = attachmentCatalog[type] || attachmentCatalog.file;
    const chip = document.createElement('span');
    chip.className = 'attachment-chip';
    chip.innerHTML = `${icon(iconName)}<span>${label}</span><button type="button" aria-label="Remove ${label}">${icon('x')}</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      chip.remove();
      state.attachmentCount = Math.max(0, state.attachmentCount - 1);
      updateSourceCount(-1);
      attachmentShelf.hidden = state.attachmentCount === 0;
      renderComposerState();
    });
    attachmentShelf.append(chip);
    attachmentShelf.hidden = false;
    state.attachmentCount += 1;
    updateSourceCount(1);
    closeMenus();
    showStatus('Added to this turn', `${label} will travel with the next message`);
    input.focus({ preventScroll: true });
    renderComposerState();
  }

  function clearAttachments() {
    const removed = state.attachmentCount;
    attachmentShelf.innerHTML = '';
    attachmentShelf.hidden = true;
    state.attachmentCount = 0;
    if (removed > 0) updateSourceCount(-removed);
    renderComposerState();
  }

  function setRunning(running) {
    state.running = running;
    send.classList.toggle('is-stop', running);
    send.innerHTML = running ? icon('square') : icon('arrow-up');
    send.setAttribute('aria-label', running ? 'Stop response' : 'Send message');
    send.disabled = false;
    if (running) {
      renderContextView('frozen');
      const snapshot = state.lastRunSnapshot;
      showStatus('Research partner is working', `Using the frozen ${snapshot.layers}-layer snapshot · ${snapshot.sources} resource references`, 0);
    } else {
      renderContextView('preview');
      hideStatus();
      send.disabled = !hasDraft();
    }
    renderComposerState();
  }

  function appendUserMessage(text) {
    const article = document.createElement('article');
    article.className = 'message message-user dynamic-user';
    article.innerHTML = `<div class="message-author">You</div><div class="user-bubble"></div>`;
    article.querySelector('.user-bubble').textContent = text;
    dynamicMessages.append(article);
  }

  function appendAssistantMessage() {
    const snapshot = { ...state.lastRunSnapshot };
    const article = document.createElement('article');
    article.className = 'message message-assistant dynamic-assistant';
    article.innerHTML = `<div class="assistant-avatar">${icon('sparkles')}</div><div class="assistant-copy"><div class="message-author">${assistantLabel.textContent}</div><span>The adaptive shell now preserves your reading space, the explicit context for this turn, and the conversation identity without turning the toolbar into a dashboard.</span><button class="context-receipt" type="button" aria-expanded="false"><span class="receipt-icon">${icon('eye')}</span><span><strong>Context used</strong><small>${snapshot.layers} layers · ${Math.min(4, snapshot.sources)} of ${snapshot.sources} resources</small></span>${icon('chevron-down')}</button></div>`;
    const receipt = article.querySelector('.context-receipt');
    receipt.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenu('context', receipt, 'actual', snapshot);
    });
    dynamicMessages.append(article);
  }

  function finishRun() {
    window.clearTimeout(state.runTimer);
    const keepContextOpen = state.openMenu === 'context';
    const completedSnapshot = { ...state.lastRunSnapshot };
    appendAssistantMessage();
    setRunning(false);
    if (keepContextOpen) renderContextView('actual', completedSnapshot);
    scrollToLatest();
  }

  function startRun(text) {
    if (state.running) {
      window.clearTimeout(state.runTimer);
      setRunning(false);
      showStatus('Run stopped', 'The draft and turn context are still available');
      return;
    }

    const message = text || 'Turn this direction into a complete interaction specification.';
    state.lastRunSnapshot = {
      message,
      layers: state.activeLayerCount,
      sources: state.sourceCount,
      attachments: state.attachmentCount,
      assistant: assistantLabel.textContent,
      model: modelLabel.textContent
    };
    appendUserMessage(message);
    input.value = '';
    input.style.height = `${BASE_INPUT_HEIGHT}px`;
    clearAttachments();
    closeMenus();
    setRunning(true);
    scrollToLatest();
    state.runTimer = window.setTimeout(finishRun, 5200);
  }

  timeline.addEventListener('scroll', updateBottomState, { passive: true });
  composerFrame.addEventListener('wheel', routeComposerWheelToTimeline, { passive: false });

  input.addEventListener('focus', () => {
    state.focused = true;
    renderComposerState();
  });

  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      state.focused = composerStack.contains(document.activeElement);
      renderComposerState();
    }, 0);
  });

  input.addEventListener('input', autoSizeInput);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (hasDraft()) startRun(input.value.trim());
    }
    if (event.key === 'Escape' && state.activeContextSlot) {
      event.preventDefault();
      event.stopPropagation();
      closeContextInspector(true);
      return;
    }
    if (event.key === 'Escape' && state.openMenu) {
      event.preventDefault();
      event.stopPropagation();
      closeMenus(true);
    }
  });

  compactTrigger.addEventListener('click', () => {
    state.focused = true;
    renderComposerState();
    window.setTimeout(() => input.focus({ preventScroll: true }), 120);
  });

  jumpLatest.addEventListener('click', () => scrollToLatest());

  Object.entries(triggers).forEach(([name, trigger]) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenu(name, trigger);
    });
  });

  contextTechnicalToggle.addEventListener('click', () => {
    state.showTechnicalContext = !state.showTechnicalContext;
    menus.context.classList.toggle('show-technical', state.showTechnicalContext);
    contextTechnicalToggle.classList.toggle('is-active', state.showTechnicalContext);
    contextTechnicalToggle.setAttribute('aria-pressed', String(state.showTechnicalContext));
    contextTechnicalToggle.textContent = state.showTechnicalContext ? 'Hide details' : 'Technical details';
  });

  const contextSlotRows = Array.from(document.querySelectorAll('[data-context-slot]'));
  contextSlotRows.forEach((row, index) => {
    row.addEventListener('click', () => openContextInspector(row));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openContextInspector(row);
        return;
      }
      let targetIndex = null;
      if (event.key === 'ArrowDown') targetIndex = Math.min(contextSlotRows.length - 1, index + 1);
      if (event.key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = contextSlotRows.length - 1;
      if (targetIndex === null) return;
      event.preventDefault();
      contextSlotRows[targetIndex].focus({ preventScroll: true });
      contextSlotRows[targetIndex].scrollIntoView({ block: 'nearest' });
    });
  });

  contextDetailClose.addEventListener('click', (event) => {
    event.stopPropagation();
    closeContextInspector(true);
  });

  contextDetailOpenFull.addEventListener('click', (event) => {
    event.stopPropagation();
    openContextFullViewer();
  });

  contextFullBack.addEventListener('click', () => closeContextFullViewer(true));

  contextFullSearch.addEventListener('input', () => {
    if (!state.fullContextSlot) return;
    renderContextFullContent(getContextSlotDetail(state.fullContextSlot).content);
  });

  contextFullWrap.addEventListener('click', () => {
    state.fullContentWrap = !state.fullContentWrap;
    refreshContextFullViewer();
  });

  contextFullCopy.addEventListener('click', async () => {
    if (!state.fullContextSlot) return;
    const copyLabel = contextFullCopy.querySelector('span');
    window.clearTimeout(state.copyStatusTimer);
    try {
      await navigator.clipboard.writeText(getContextSlotDetail(state.fullContextSlot).content);
      copyLabel.textContent = 'Copied';
    } catch {
      copyLabel.textContent = 'Copy unavailable';
    }
    state.copyStatusTimer = window.setTimeout(() => {
      copyLabel.textContent = 'Copy exact';
    }, 1600);
  });

  document.querySelectorAll('[data-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.suggestion;
      input.focus({ preventScroll: true });
      autoSizeInput();
    });
  });

  document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => addAttachment(button.dataset.add));
  });

  document.querySelectorAll('[data-context]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.classList.contains('is-locked')) return;
      const next = !button.classList.contains('is-on');
      button.classList.toggle('is-on', next);
      button.setAttribute('aria-pressed', String(next));
      updateSourceCount(next ? 1 : -1);
      showStatus('Turn context updated', `${state.sourceCount} sources are now available`);
    });
  });

  document.querySelectorAll('[data-assistant]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.assistant;
      document.querySelectorAll('[data-assistant]').forEach((row) => {
        row.classList.toggle('is-selected', row === button);
        row.querySelector('.row-check').innerHTML = row === button ? icon('check') : '';
      });
      assistantLabel.textContent = name;
      updateAssistantContext(name);
      identityName.textContent = name;
      closeMenus();
      showStatus('Conversation identity updated', `${name} will guide future turns`);
    });
  });

  document.querySelectorAll('[data-model]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.model;
      document.querySelectorAll('[data-model]').forEach((row) => {
        row.classList.toggle('is-selected', row === button);
        row.querySelector('.row-check').innerHTML = row === button ? icon('check') : '';
      });
      modelLabel.textContent = name;
      closeMenus();
      showStatus('Model preference updated', name === 'Auto' ? 'Routing will follow task and capability' : `${name} is fixed for this conversation`);
    });
  });

  document.getElementById('model-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('#model-menu [data-model]').forEach((row) => {
      const searchable = `${row.dataset.model} ${row.dataset.search || ''}`.toLowerCase();
      row.hidden = Boolean(query) && !searchable.includes(query);
    });
    document.querySelectorAll('#model-menu .menu-section-label').forEach((label) => {
      let sibling = label.nextElementSibling;
      let hasVisibleModel = false;
      while (sibling && !sibling.classList.contains('menu-section-label')) {
        if (sibling.matches('[data-model]') && !sibling.hidden) hasVisibleModel = true;
        sibling = sibling.nextElementSibling;
      }
      label.hidden = !hasVisibleModel;
    });
  });

  document.getElementById('dismiss-status').addEventListener('click', hideStatus);

  send.addEventListener('click', () => {
    if (state.running) {
      startRun('');
      return;
    }
    if (hasDraft()) startRun(input.value.trim());
  });

  demoButtons.reading.addEventListener('click', scrollToReading);
  demoButtons.latest.addEventListener('click', () => scrollToLatest());
  demoButtons.running.addEventListener('click', () => {
    scrollToLatest('auto');
    startRun('Check the complete composer behaviour in the running state.');
  });

  document.addEventListener('pointerdown', (event) => {
    if (!state.openMenu) return;
    if (composerStack.contains(event.target)) return;
    closeMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !contextFullView.hidden) {
      event.preventDefault();
      closeContextFullViewer(true);
      return;
    }
    if (event.key === 'Escape' && state.activeContextSlot) {
      event.preventDefault();
      closeContextInspector(true);
      return;
    }
    if (event.key === 'Escape' && state.openMenu) {
      event.preventDefault();
      closeMenus(true);
    }
  });

  window.addEventListener('resize', () => {
    setComposerHeight();
    updateBottomState();
  });

  window.addEventListener('load', () => {
    scrollToLatest('auto');
    window.requestAnimationFrame(() => {
      state.nearBottom = true;
      input.style.height = `${BASE_INPUT_HEIGHT}px`;
      renderContextView('preview');
      renderComposerState();
    });
  });
})();
