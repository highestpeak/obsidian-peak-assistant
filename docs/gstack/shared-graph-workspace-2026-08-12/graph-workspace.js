const SVG_ICONS = {
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  tree: '<path d="M6 3v12M6 8h7M6 15h7"/><rect x="13" y="5" width="8" height="6" rx="1"/><rect x="13" y="12" width="8" height="6" rx="1"/>',
  graph: '<circle cx="5" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.2 10.8 7.6-3.6M7.4 13l9.2 4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16M9 9l-3 3 3 3"/>',
  workflow: '<rect x="3" y="4" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M9 6.5h4a3 3 0 0 1 3 3V15M8 18h7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4.5a2 2 0 0 1 3 0L16 17l1.2-1.2a2 2 0 0 1 2.8 0"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  minimize: '<path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sparkles: '<path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Z"/><path d="m19 13-.8 2.2L16 16l2.2.8L19 19l.8-2.2L22 16l-2.2-.8L19 13Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${SVG_ICONS[name] ?? ''}</svg>`;
}

const PHYSICAL_LAYOUTS = ['Constellation', 'Community', 'Flow →', '↓', 'Folders', 'Orbit'];
const AI_LAYOUTS = ['Topology', 'Thinking tree', 'Bridges', 'Timeline', 'Gaps'];
const slidingSegmentAnimations = new WeakMap();

const GRAPH_VARIANTS = {
  world: {
    nodes: [
      { id: 'n1', label: 'Peak Assistant', meta: '19 links · result', x: 49, y: 44, selected: true },
      { id: 'n2', label: 'Composer architecture', meta: '12 links', x: 25, y: 24 },
      { id: 'n3', label: 'AI Search', meta: '9 links', x: 72, y: 23 },
      { id: 'n4', label: 'File Atlas', meta: '11 links', x: 25, y: 64 },
      { id: 'n5', label: 'Vault Intelligence', meta: '8 links', x: 73, y: 64 },
      { id: 'n6', label: 'Graph renderer', meta: 'semantic match', x: 49, y: 78, muted: true },
    ],
    edges: [['n1','n2'],['n1','n3'],['n1','n4'],['n1','n5'],['n1','n6'],['n2','n4'],['n3','n5'],['n2','n5','semantic']],
  },
  local: {
    nodes: [
      { id: 'n1', label: 'Peak Composer Visual Parity QA', meta: 'current document', x: 48, y: 45, selected: true },
      { id: 'n2', label: 'Information management', meta: '8 outgoing', x: 23, y: 24 },
      { id: 'n3', label: 'Graph and information tools', meta: '5 incoming', x: 73, y: 24 },
      { id: 'n4', label: 'Knowledge base', meta: 'one hop', x: 18, y: 65 },
      { id: 'n5', label: 'Product research', meta: 'one hop', x: 75, y: 64 },
      { id: 'n6', label: 'UOA guide.pdf', meta: 'two hop', x: 48, y: 77, muted: true },
    ],
    edges: [['n1','n2'],['n1','n3'],['n1','n4'],['n1','n5'],['n3','n6'],['n4','n6'],['n2','n5','semantic']],
  },
  sources: {
    nodes: [
      { id: 'n1', label: 'mess', meta: 'cited source', x: 48, y: 42, selected: true },
      { id: 'n2', label: 'Performance notes', meta: 'cited source', x: 21, y: 23 },
      { id: 'n3', label: 'AI Workflow', meta: 'cited source', x: 75, y: 23 },
      { id: 'n4', label: 'Design feedback loops', meta: 'vault neighbor', x: 20, y: 66 },
      { id: 'n5', label: 'Models of Models', meta: 'vault neighbor', x: 75, y: 64 },
      { id: 'n6', label: 'Unlinked cited file', meta: 'isolated match', x: 48, y: 79, muted: true },
    ],
    edges: [['n1','n2'],['n1','n3'],['n1','n4'],['n1','n5'],['n2','n4'],['n3','n5'],['n2','n5','semantic']],
  },
  composer: {
    nodes: [
      { id: 'n1', label: 'Current document', meta: 'Composer source', x: 48, y: 43, selected: true },
      { id: 'n2', label: 'Selected paragraph', meta: 'active context', x: 21, y: 22 },
      { id: 'n3', label: 'Related product spec', meta: 'one hop', x: 75, y: 23 },
      { id: 'n4', label: 'Research evidence', meta: 'attached context', x: 20, y: 65 },
      { id: 'n5', label: 'Implementation note', meta: 'one hop', x: 75, y: 64 },
      { id: 'n6', label: 'Potential source', meta: 'semantic match', x: 48, y: 78, muted: true },
    ],
    edges: [['n1','n2'],['n1','n3'],['n1','n4'],['n1','n5'],['n2','n4'],['n3','n5'],['n2','n5','semantic']],
  },
  ai: {
    nodes: [
      { id: 'n1', label: 'Graph workspace unification', meta: 'reviewed assertion', x: 48, y: 42, selected: true, kind: 'assertion' },
      { id: 'n2', label: 'Shared Cytoscape renderer', meta: 'reviewed assertion', x: 20, y: 22, kind: 'assertion' },
      { id: 'n3', label: 'Capability manifest', meta: 'proposed relation', x: 75, y: 22, kind: 'assertion' },
      { id: 'n4', label: 'Graph renderer governance', meta: 'source evidence', x: 18, y: 65, kind: 'source' },
      { id: 'n5', label: 'File Atlas source', meta: 'source evidence', x: 76, y: 64, kind: 'source' },
      { id: 'n6', label: 'How should Mini Map adapt?', meta: 'open question', x: 48, y: 79, kind: 'question' },
    ],
    edges: [['n1','n2','evidence'],['n1','n3','evidence'],['n2','n4','evidence'],['n3','n5','evidence'],['n1','n6','semantic'],['n4','n5','semantic']],
  },
};

function parseCsv(value) {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function actionButton(name, label, extraClass = '') {
  return `<button class="icon-button ${extraClass}" type="button" data-action="${name}" aria-label="${label}" title="${label}">${icon(name)}</button>`;
}

function buildSegment(labels, active, dataName) {
  return labels.map((label) => {
    const value = label.toLowerCase().replaceAll(' ', '-').replace('→', 'lr').replace('↓', 'tb');
    return `<button type="button" data-${dataName}="${value}" data-label="${label}" class="${label === active ? 'is-active' : ''}">${label}</button>`;
  }).join('');
}

function buildViewSegment(labels, active) {
  return labels.map((label) => {
    const value = label.toLowerCase();
    return `<button type="button" data-view="${value}" data-label="${label}" class="${label === active ? 'is-active' : ''}" aria-label="${label}" title="${label}">${icon(value, 'view-icon')}<span class="view-label">${label}</span></button>`;
  }).join('');
}

function buildScopeButtons(scopes, active, disabled = false) {
  return scopes.map((scope) => {
    const label = scope === 'one-hop' ? 'One hop' : scope === 'two-hop' ? 'Two hop' : 'AI Graph';
    return `<button type="button" data-scope="${scope}" class="${scope === active ? 'is-active' : ''}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }).join('');
}

function directSegmentButtons(segment) {
  return Array.from(segment?.children ?? []).filter((child) => child.matches('button, a'));
}

function activeSegmentButton(segment) {
  return directSegmentButtons(segment).find((button) => button.classList.contains('is-active'));
}

function segmentIndicatorColor(button) {
  return button?.dataset.scope === 'one-hop' ? 'var(--blue)' : 'var(--accent)';
}

function segmentMotionDuration(segment, distance) {
  if (segment.matches('[data-layout-segment]')) {
    return Math.min(170, Math.max(110, 96 + distance * .22));
  }
  if (segment.matches('[data-scope-segment]')) {
    return Math.min(155, Math.max(100, 90 + distance * .18));
  }
  return Math.min(145, Math.max(95, 86 + distance * .16));
}

function setSegmentIndicatorGeometry(indicator, x, width) {
  indicator.style.transform = `translateX(${x}px)`;
  indicator.style.width = `${width}px`;
}

function smoothMotion(progress) {
  return progress * progress * (3 - 2 * progress);
}

function staggeredMotion(progress, delay, span) {
  return smoothMotion(Math.max(0, Math.min(1, (progress - delay) / span)));
}

function syncSlidingSegment(segment, animate = true) {
  const indicator = segment?.querySelector(':scope > [data-segment-indicator]');
  const active = activeSegmentButton(segment);
  if (!indicator || !active) return;

  const segmentRect = segment.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  if (!segmentRect.width || !activeRect.width) return;

  const runningFrame = slidingSegmentAnimations.get(segment);
  if (runningFrame) cancelAnimationFrame(runningFrame);

  indicator.style.backgroundColor = segmentIndicatorColor(active);
  const indicatorRect = indicator.getBoundingClientRect();
  const startLeft = indicatorRect.width ? indicatorRect.left : activeRect.left;
  const startWidth = indicatorRect.width || activeRect.width;
  const initialDistance = Math.abs(activeRect.left - startLeft);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!animate || reduceMotion || initialDistance < 1) {
    setSegmentIndicatorGeometry(indicator, activeRect.left - segmentRect.left - segment.clientLeft, activeRect.width);
    segment.classList.add('is-indicator-ready');
    return;
  }

  const duration = segmentMotionDuration(segment, initialDistance);
  const startedAt = performance.now();

  const moveIndicator = (now) => {
    const currentSegmentRect = segment.getBoundingClientRect();
    const currentActiveRect = active.getBoundingClientRect();
    const progress = Math.min(1, (now - startedAt) / duration);
    const targetLeft = currentActiveRect.left;
    const startRight = startLeft + startWidth;
    const targetRight = targetLeft + currentActiveRect.width;
    const movingRight = targetLeft + currentActiveRect.width / 2 >= startLeft + startWidth / 2;
    const leadingProgress = staggeredMotion(progress, 0, .94);
    const trailingProgress = staggeredMotion(progress, .04, .96);
    const leftProgress = movingRight ? trailingProgress : leadingProgress;
    const rightProgress = movingRight ? leadingProgress : trailingProgress;
    const left = startLeft + (targetLeft - startLeft) * leftProgress;
    const right = startRight + (targetRight - startRight) * rightProgress;
    const x = left - currentSegmentRect.left - segment.clientLeft;
    const width = Math.max(1, right - left);
    setSegmentIndicatorGeometry(indicator, x, width);

    if (progress < 1) {
      slidingSegmentAnimations.set(segment, requestAnimationFrame(moveIndicator));
      return;
    }

    slidingSegmentAnimations.delete(segment);
    setSegmentIndicatorGeometry(indicator, targetLeft - currentSegmentRect.left - segment.clientLeft, currentActiveRect.width);
  };

  segment.classList.add('is-indicator-ready');
  slidingSegmentAnimations.set(segment, requestAnimationFrame(moveIndicator));
}

function mountSlidingSegment(segment) {
  if (!segment) return;
  segment.dataset.slidingSegmentMounted = 'true';
  segment.classList.add('sliding-segment');
  if (segment.querySelector(':scope > [data-segment-indicator]')) return;
  const indicator = document.createElement('span');
  indicator.className = 'segment-active-indicator';
  indicator.dataset.segmentIndicator = '';
  indicator.setAttribute('aria-hidden', 'true');
  segment.prepend(indicator);
  requestAnimationFrame(() => syncSlidingSegment(segment, false));
}

function activateSlidingSegmentButton(segment, button) {
  directSegmentButtons(segment).forEach((peer) => peer.classList.toggle('is-active', peer === button));
  syncSlidingSegment(segment, true);
}

function resyncWorkspaceSegments(workspace, animate = false) {
  requestAnimationFrame(() => {
    workspace.querySelectorAll('.sliding-segment').forEach((segment) => syncSlidingSegment(segment, animate));
  });
}

function graphNodesHtml(variant) {
  return variant.nodes.map((node) => `
    <button
      type="button"
      class="graph-node${node.selected ? ' is-selected' : ''}${node.muted ? ' is-muted' : ''}"
      data-node-id="${node.id}"
      data-kind="${node.kind ?? 'file'}"
      style="left:${node.x}%;top:${node.y}%;transform:translate(-50%,-50%)"
    ><strong>${node.label}</strong><small>${node.meta}</small></button>`).join('');
}

function edgePath(from, to) {
  const dx = to.x - from.x;
  const bend = Math.abs(dx) > 35 ? 2.5 : -1.5;
  const c1x = from.x + dx * .42;
  const c2x = from.x + dx * .62;
  return `M ${from.x * 10} ${from.y * 6} C ${c1x * 10} ${(from.y + bend) * 6}, ${c2x * 10} ${(to.y - bend) * 6}, ${to.x * 10} ${to.y * 6}`;
}

function graphEdgesHtml(variant) {
  const byId = new Map(variant.nodes.map((node) => [node.id, node]));
  const paths = variant.edges.map(([fromId, toId, kind]) => {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    return `<path class="${kind ?? 'physical'}" d="${edgePath(from, to)}"/>`;
  }).join('');
  return `
    <svg class="graph-edges" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#596574"/></marker></defs>
      ${paths}
    </svg>`;
}

function minimapHtml(variant) {
  const dots = variant.nodes.map((node) => `<circle cx="${node.x * 1.18}" cy="${node.y * .72}" r="3"/>`).join('');
  const lines = variant.edges.map(([fromId, toId]) => {
    const from = variant.nodes.find((node) => node.id === fromId);
    const to = variant.nodes.find((node) => node.id === toId);
    return `<line x1="${from.x * 1.18}" y1="${from.y * .72}" x2="${to.x * 1.18}" y2="${to.y * .72}"/>`;
  }).join('');
  return `<div class="graph-minimap" aria-label="Graph minimap"><svg viewBox="0 0 118 72" aria-hidden="true">${lines}${dots}<rect x="12" y="10" width="88" height="50" rx="4"/></svg></div>`;
}

function alternateResultViewHtml(viewName) {
  const tree = viewName.toLowerCase() === 'tree';
  const rows = [
    ['Peak Assistant', 'kb2-learn-prd/Peak Assistant.md'],
    ['Graph and information tools', 'C-总2-领域探索'],
    ['Information management', 'B-AI Requirements'],
    ['Composer architecture', 'docs/superpowers/specs'],
    ['Vault Intelligence review', 'kb2-tech-articles'],
  ];
  return `<div class="alternate-result-view ${tree ? 'is-tree' : 'is-list'}" aria-label="${viewName} result preview">
    ${rows.map(([title, path], index) => `<div class="alternate-result-row" style="--result-depth:${tree ? Math.min(index, 2) : 0}"><i>${tree ? (index < 2 ? '⌄' : '·') : '◇'}</i><span><strong>${title}</strong><small>${path}</small></span></div>`).join('')}
  </div>`;
}

function renderGraphContent(workspace, variantName) {
  const canvas = workspace.querySelector('[data-graph-canvas]');
  const variant = GRAPH_VARIANTS[variantName] ?? GRAPH_VARIANTS.local;
  canvas.dataset.variant = variantName;
  canvas.querySelector('[data-graph-stage]').innerHTML = graphEdgesHtml(variant) + graphNodesHtml(variant);
  canvas.querySelector('[data-minimap-slot]').innerHTML = minimapHtml(variant);
  const selected = variant.nodes.find((node) => node.selected) ?? variant.nodes[0];
  updateInspector(workspace, selected, variantName === 'ai');
  bindGraphNodes(workspace, variantName);
}

function renderWorkspaceView(workspace, viewName, variantName) {
  const graphActive = !viewName || viewName.toLowerCase() === 'graph';
  const canvas = workspace.querySelector('[data-graph-canvas]');
  const modeControl = workspace.querySelector('[data-graph-mode-control]');
  const scopeExtension = workspace.querySelector('[data-scope-extension]');
  workspace.dataset.activeView = graphActive ? 'graph' : viewName.toLowerCase();
  modeControl?.classList.toggle('is-graph-expanded', graphActive && Boolean(scopeExtension));
  if (scopeExtension) {
    scopeExtension.setAttribute('aria-hidden', graphActive ? 'false' : 'true');
    scopeExtension.querySelectorAll('button').forEach((button) => { button.disabled = !graphActive; });
  }
  workspace.querySelectorAll('[data-graph-only]').forEach((element) => {
    element.hidden = !graphActive;
  });
  canvas.classList.toggle('is-result-projection', !graphActive);
  resyncWorkspaceSegments(workspace, true);

  if (graphActive) {
    canvas.setAttribute('aria-label', 'Graph canvas. Hold Shift to inspect. Press I to pin.');
    renderGraphContent(workspace, variantName);
    workspace.querySelector('[data-node-inspector]').hidden = false;
    return;
  }

  canvas.setAttribute('aria-label', `${viewName} result view`);
  canvas.querySelector('[data-graph-stage]').innerHTML = alternateResultViewHtml(viewName);
  canvas.querySelector('[data-node-inspector]').hidden = true;
  workspace.querySelector('[data-minimap-slot]').innerHTML = '';
}

function updateInspector(workspace, node, aiMode) {
  const inspector = workspace.querySelector('[data-node-inspector]');
  inspector.querySelector('[data-inspector-type]').textContent = aiMode ? 'AI GRAPH EVIDENCE' : 'GRAPH NODE';
  inspector.querySelector('[data-inspector-title]').textContent = node.label;
  inspector.querySelector('[data-inspector-copy]').textContent = aiMode
    ? `${node.meta}. Grounded relation details and source evidence stay attached to this selection.`
    : `${node.meta}. Hold Shift for a transient preview or press I to keep this card pinned.`;
}

function bindGraphNodes(workspace, variantName) {
  const canvas = workspace.querySelector('[data-graph-canvas]');
  const variant = GRAPH_VARIANTS[variantName] ?? GRAPH_VARIANTS.local;
  canvas.querySelectorAll('[data-node-id]').forEach((button) => {
    button.addEventListener('click', () => {
      canvas.querySelectorAll('[data-node-id]').forEach((node) => node.classList.remove('is-selected'));
      button.classList.add('is-selected');
      updateInspector(workspace, variant.nodes.find((node) => node.id === button.dataset.nodeId), variantName === 'ai');
      workspace.querySelector('[data-node-inspector]').hidden = false;
    });
  });
}

function renderLayoutOptions(workspace, labels, active) {
  const layout = workspace.querySelector('[data-layout-segment]');
  layout.innerHTML = buildSegment(labels, active, 'layout');
  mountSlidingSegment(layout);
  layout.querySelectorAll('[data-layout]').forEach((button) => {
    button.addEventListener('click', () => {
      activateSlidingSegmentButton(layout, button);
      showFeedback(workspace, `${button.dataset.label} layout`);
    });
  });
}

function showFeedback(workspace, message) {
  const canvas = workspace.querySelector('[data-graph-canvas]');
  canvas.querySelector('[data-tool-feedback]')?.remove();
  const feedback = document.createElement('div');
  feedback.className = 'tool-feedback';
  feedback.dataset.toolFeedback = '';
  feedback.textContent = message;
  canvas.appendChild(feedback);
  window.setTimeout(() => feedback.remove(), 1200);
}

function mountGraphWorkspace(workspace) {
  const scopes = parseCsv(workspace.dataset.scopeOptions);
  const defaultScope = workspace.dataset.scope || scopes[0] || '';
  const views = parseCsv(workspace.dataset.viewOptions);
  const defaultView = workspace.dataset.view || views[0] || '';
  const physicalLayouts = parseCsv(workspace.dataset.layoutOptions).length
    ? parseCsv(workspace.dataset.layoutOptions)
    : PHYSICAL_LAYOUTS;
  const defaultLayout = workspace.dataset.layout || physicalLayouts[0];
  const baseVariant = workspace.dataset.variant || 'local';
  const contextCopy = workspace.dataset.context || 'Relationship graph';
  const showContext = workspace.dataset.showContext === 'true';
  const initialAi = defaultScope === 'ai' || baseVariant === 'ai';
  const initialGraphView = !defaultView || defaultView.toLowerCase() === 'graph';

  workspace.innerHTML = `
    <div class="graph-primary-bar">
      <div class="graph-scope-area">
        ${views.length ? `<div class="graph-mode-control${scopes.length > 1 && initialGraphView ? ' is-graph-expanded' : ''}" data-graph-mode-control>
          <div class="segment view" data-view-segment>${buildViewSegment(views, defaultView)}</div>
          ${scopes.length > 1 ? `<div class="scope-extension" data-scope-segment data-scope-extension aria-hidden="${initialGraphView ? 'false' : 'true'}">${buildScopeButtons(scopes, defaultScope, !initialGraphView)}</div>` : ''}
        </div>` : scopes.length > 1 ? `<div class="segment scope" data-scope-segment data-graph-only>${buildScopeButtons(scopes, defaultScope)}</div>` : ''}
        ${showContext ? `<span class="graph-context-copy">${contextCopy}</span>` : ''}
      </div>
      <div class="graph-layout-area" data-graph-only><div class="segment layout" data-layout-segment></div></div>
    </div>
    <div class="graph-action-bar" data-graph-only>
      <button class="icon-button label-button is-active" type="button" data-action="semantic" aria-label="Toggle semantic edges"><span class="switch"></span><span data-layer-label>${initialAi ? 'Evidence links' : 'Semantic edges'}</span></button>
      <span class="separator"></span>
      <button class="icon-button label-button" type="button" data-action="nodes" aria-label="Open node list">${icon('panel')}<span>Nodes</span></button>
      ${actionButton('workflow', 'Copy graph as Mermaid')}
      ${actionButton('image', 'Copy graph as image')}
      <span class="separator"></span>
      ${actionButton('minus', 'Zoom out')}
      <span class="zoom-value" data-zoom-value>100%</span>
      ${actionButton('plus', 'Zoom in')}
      ${actionButton('scan', 'Fit entire graph')}
      ${actionButton('focus', 'Readable view')}
      <span class="separator"></span>
      ${actionButton('maximize', 'View graph fullscreen')}
    </div>
    <div class="graph-canvas" data-graph-canvas tabindex="0" aria-label="Graph canvas. Hold Shift to inspect. Press I to pin.">
      <div data-graph-stage></div>
      <div class="node-inspector" data-node-inspector style="left:56%;top:12%">
        <header><span data-inspector-type>GRAPH NODE</span><b data-pin-status>PINNED · I</b></header>
        <strong data-inspector-title></strong>
        <p data-inspector-copy></p>
        <footer><span>Shift preview · I keeps open</span><button type="button" data-inspector-open>Open source</button></footer>
      </div>
      <div class="graph-keyboard-help" data-graph-only><kbd>Shift</kbd> inspect <span>·</span><kbd>I</kbd> pin <span>·</span><kbd>↑↓</kbd> navigate <span>·</span><kbd>Enter</kbd> open</div>
      <div data-minimap-slot data-graph-only></div>
    </div>`;

  renderLayoutOptions(workspace, initialAi ? AI_LAYOUTS : physicalLayouts, initialAi ? 'Topology' : defaultLayout);
  mountSlidingSegment(workspace.querySelector('[data-view-segment]'));
  mountSlidingSegment(workspace.querySelector('[data-scope-segment]'));
  renderGraphContent(workspace, initialAi ? 'ai' : baseVariant);

  let currentScope = defaultScope;
  let zoom = 100;
  let pinned = true;
  const canvas = workspace.querySelector('[data-graph-canvas]');
  const inspector = workspace.querySelector('[data-node-inspector]');
  workspace.dataset.activeView = defaultView ? defaultView.toLowerCase() : 'graph';

  workspace.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      activateSlidingSegmentButton(workspace.querySelector('[data-view-segment]'), button);
      const variantName = currentScope === 'ai' ? 'ai' : baseVariant;
      renderWorkspaceView(workspace, button.dataset.label, variantName);
    });
  });

  workspace.querySelectorAll('[data-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      currentScope = button.dataset.scope;
      activateSlidingSegmentButton(workspace.querySelector('[data-scope-segment]'), button);
      const aiMode = currentScope === 'ai';
      workspace.querySelector('[data-layer-label]').textContent = aiMode ? 'Evidence links' : 'Semantic edges';
      renderLayoutOptions(workspace, aiMode ? AI_LAYOUTS : physicalLayouts, aiMode ? 'Topology' : defaultLayout);
      renderGraphContent(workspace, aiMode ? 'ai' : baseVariant);
      showFeedback(workspace, aiMode ? 'AI Graph artifact view' : `${button.textContent} relationship view`);
    });
  });

  workspace.querySelector('[data-action="semantic"]').addEventListener('click', (event) => {
    event.currentTarget.classList.toggle('is-active');
    canvas.querySelectorAll('.semantic').forEach((edge) => {
      edge.style.display = event.currentTarget.classList.contains('is-active') ? '' : 'none';
    });
  });

  workspace.querySelector('[data-action="nodes"]').addEventListener('click', () => {
    const existing = canvas.querySelector('[data-node-list]');
    if (existing) { existing.remove(); return; }
    const variantName = currentScope === 'ai' ? 'ai' : baseVariant;
    const variant = GRAPH_VARIANTS[variantName];
    const popover = document.createElement('div');
    popover.className = 'node-list-popover';
    popover.dataset.nodeList = '';
    popover.innerHTML = `<header><strong>Nodes</strong><span>${variant.nodes.length} visible</span></header>${variant.nodes.map((node) => `<button type="button" data-list-node="${node.id}"><span>${node.label}</span><span>${node.meta}</span></button>`).join('')}`;
    canvas.appendChild(popover);
    popover.querySelectorAll('[data-list-node]').forEach((button) => {
      button.addEventListener('click', () => {
        canvas.querySelector(`[data-node-id="${button.dataset.listNode}"]`)?.click();
        popover.remove();
      });
    });
  });

  workspace.querySelector('[data-action="workflow"]').addEventListener('click', () => showFeedback(workspace, 'Mermaid copied'));
  workspace.querySelector('[data-action="image"]').addEventListener('click', () => showFeedback(workspace, 'Image copied'));
  workspace.querySelector('[data-action="minus"]').addEventListener('click', () => {
    zoom = Math.max(40, zoom - 20);
    workspace.querySelector('[data-zoom-value]').textContent = `${zoom}%`;
  });
  workspace.querySelector('[data-action="plus"]').addEventListener('click', () => {
    zoom = Math.min(240, zoom + 20);
    workspace.querySelector('[data-zoom-value]').textContent = `${zoom}%`;
  });
  workspace.querySelector('[data-action="scan"]').addEventListener('click', () => {
    zoom = 82;
    workspace.querySelector('[data-zoom-value]').textContent = `${zoom}%`;
    showFeedback(workspace, 'Entire graph fitted');
  });
  workspace.querySelector('[data-action="focus"]').addEventListener('click', () => {
    zoom = 100;
    workspace.querySelector('[data-zoom-value]').textContent = '100%';
    showFeedback(workspace, 'Readable view restored');
  });
  workspace.querySelector('[data-action="maximize"]').addEventListener('click', (event) => {
    const full = workspace.classList.toggle('is-fullscreen');
    event.currentTarget.innerHTML = icon(full ? 'minimize' : 'maximize');
    event.currentTarget.title = full ? 'Exit graph fullscreen' : 'View graph fullscreen';
    event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
  });

  canvas.addEventListener('keydown', (event) => {
    if (workspace.dataset.activeView !== 'graph') return;
    if (event.key === 'Shift') inspector.hidden = false;
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      pinned = !pinned;
      inspector.hidden = !pinned;
      inspector.querySelector('[data-pin-status]').textContent = pinned ? 'PINNED · I' : 'PREVIEW · SHIFT';
    }
    if (event.key === 'Escape') {
      const list = canvas.querySelector('[data-node-list]');
      if (list) { list.remove(); return; }
      if (!inspector.hidden) { pinned = false; inspector.hidden = true; return; }
      if (workspace.classList.contains('is-fullscreen')) workspace.querySelector('[data-action="maximize"]').click();
    }
  });
  canvas.addEventListener('keyup', (event) => {
    if (workspace.dataset.activeView !== 'graph') return;
    if (event.key === 'Shift' && !pinned) inspector.hidden = true;
  });
  workspace.querySelector('[data-inspector-open]').addEventListener('click', () => showFeedback(workspace, currentScope === 'ai' ? 'Evidence source opened' : 'Vault source opened'));
}

function mountPrototypeNavigation() {
  const page = document.body.dataset.page;
  document.querySelectorAll('[data-prototype-page]').forEach((link) => {
    if (link.dataset.prototypePage === page) link.setAttribute('aria-current', 'page');
  });
}

document.querySelectorAll('[data-graph-workspace]').forEach(mountGraphWorkspace);
mountPrototypeNavigation();

document.querySelectorAll('[data-static-segment] button').forEach((button) => {
  button.addEventListener('click', () => {
    button.parentElement.querySelectorAll('button').forEach((peer) => peer.classList.toggle('is-active', peer === button));
  });
});
