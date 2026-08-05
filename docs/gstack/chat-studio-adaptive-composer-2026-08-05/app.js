(() => {
  const BASE_COMPOSER_HEIGHT = 100;
  const BASE_INPUT_HEIGHT = 30;
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
  const contextTotal = document.getElementById('context-total');
  const contextIncludedCount = document.getElementById('context-included-count');
  const contextPreviewSummary = document.getElementById('context-preview-summary');
  const resourceSlotDetail = document.getElementById('resource-slot-detail');
  const currentMessageDetail = document.getElementById('current-message-detail');
  const currentMessageState = document.getElementById('current-message-state');
  const compactSourceCount = document.getElementById('compact-source-count');
  const assistantLabel = document.getElementById('assistant-label');
  const assistantSlotTitle = document.getElementById('assistant-slot-title');
  const assistantSlotDetail = document.getElementById('assistant-slot-detail');
  const assistantSlotState = document.getElementById('assistant-slot-state');
  const identityName = document.getElementById('identity-name');
  const modelLabel = document.getElementById('model-label');

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
    statusTimer: null
  };

  const attachmentCatalog = {
    file: ['image', 'Composer spacing feedback.png'],
    vault: ['file', 'Chat Studio UX direction.md'],
    link: ['link', 'Product reference link'],
    active: ['file', 'Active note selection'],
    canvas: ['canvas', 'Adaptive composer canvas']
  };

  function icon(name) {
    return `<svg class="icon"><use href="#icon-${name}"></use></svg>`;
  }

  function distanceFromBottom() {
    return timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop;
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
      ? `${draftLength} draft characters${attachmentCopy} · exact text is added at send time`
      : `Exact draft text${attachmentCopy} · added at send time · never replaced by a summary`;
    currentMessageState.textContent = draftLength > 0 || state.attachmentCount > 0 ? 'Ready' : 'At send';
    currentMessageState.classList.toggle('is-included', draftLength > 0 || state.attachmentCount > 0);
    currentMessageState.classList.toggle('is-pending', draftLength === 0 && state.attachmentCount === 0);
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
    updateDraftContext();
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

  function closeMenus() {
    state.openMenu = null;
    Object.entries(menus).forEach(([name, menu]) => {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      triggers[name].setAttribute('aria-expanded', 'false');
    });
    renderComposerState();
  }

  function openMenu(name) {
    if (state.openMenu === name) {
      closeMenus();
      return;
    }
    closeMenus();
    state.openMenu = name;
    menus[name].classList.add('is-open');
    menus[name].setAttribute('aria-hidden', 'false');
    triggers[name].setAttribute('aria-expanded', 'true');
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
    resourceSlotDetail.textContent = `${state.sourceCount} resource references and summaries · optional · max 300 · raw files are not preloaded`;
    contextPreviewSummary.textContent = `History · Summary · Working context · User profile · ${state.sourceCount} resources`;
  }

  function updateAssistantContext(name) {
    const usesAssistantSlot = name !== 'Default assistant';
    const activeLayers = usesAssistantSlot ? 9 : 8;
    state.activeLayerCount = activeLayers;
    const assistantRow = assistantSlotTitle.closest('.context-slot-row');
    assistantSlotTitle.textContent = `Assistant · ${name}`;
    assistantSlotDetail.textContent = usesAssistantSlot
      ? 'Persona and authored instructions · optional · max 2,000 · compress framing only'
      : 'No authored Assistant instructions · optional empty slot renders nothing';
    assistantSlotState.textContent = usesAssistantSlot ? 'Included' : 'Not added';
    assistantSlotState.classList.toggle('is-included', usesAssistantSlot);
    assistantSlotState.classList.toggle('is-excluded', !usesAssistantSlot);
    assistantRow.classList.toggle('is-absent', !usesAssistantSlot);
    contextLabel.textContent = `${activeLayers} / 10 active`;
    contextTotal.textContent = `${activeLayers} / 10`;
    contextIncludedCount.textContent = String(activeLayers);
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
      showStatus('Research partner is working', `Assembling ${state.activeLayerCount} context layers · ${state.sourceCount} resource references`, 0);
    } else {
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
    const article = document.createElement('article');
    article.className = 'message message-assistant dynamic-assistant';
    article.innerHTML = `<div class="assistant-avatar">${icon('sparkles')}</div><div class="assistant-copy"><div class="message-author">${assistantLabel.textContent}</div><span>The adaptive shell now preserves your reading space, the explicit context for this turn, and the conversation identity without turning the toolbar into a dashboard.</span></div>`;
    dynamicMessages.append(article);
  }

  function finishRun() {
    window.clearTimeout(state.runTimer);
    appendAssistantMessage();
    setRunning(false);
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
    appendUserMessage(message);
    input.value = '';
    input.style.height = `${BASE_INPUT_HEIGHT}px`;
    clearAttachments();
    closeMenus();
    setRunning(true);
    scrollToLatest();
    state.runTimer = window.setTimeout(finishRun, 2200);
  }

  timeline.addEventListener('scroll', updateBottomState, { passive: true });

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
    if (event.key === 'Escape') closeMenus();
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
      openMenu(name);
    });
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
    if (event.key === 'Escape') closeMenus();
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
      renderComposerState();
    });
  });
})();
