const fileConfigs = {
  image: {
    name: 'harbour-light.png',
    path: 'Assets/Photography/harbour-light.png',
    badge: 'PNG',
    badgeClass: 'image-badge',
    status: 'Original preserved · revision 7',
    toolbarMeta: 'Natural pixels · 3024 × 2016',
    scopeTitle: 'Whole image',
    scopeDetail: 'Original bitmap · 3024 × 2016 · source hash bound',
    chips: ['pixels', 'OCR', 'metadata'],
    suggestions: [
      ['Describe and OCR', 'Describe the visual hierarchy and extract its labels.'],
      ['Edit selected region', 'Remove the selected object and preserve the surrounding layout.'],
    ],
    disclosure: 'Vision model · image will be sent',
    candidate: 'New image version · original unchanged',
    manifest: [
      ['Scope', 'whole image'],
      ['Revision', 'sha256:67a…9be'],
      ['Included', 'bitmap, OCR, metadata'],
      ['Excluded', 'other Vault files'],
      ['Writeback', 'save as version'],
    ],
  },
  html: {
    name: 'research-dashboard.html',
    path: 'Reports/Research/research-dashboard.html',
    badge: 'HTML',
    badgeClass: 'html-badge',
    status: 'Safe preview · scripts and network isolated',
    toolbarMeta: 'Project bundle · HTML + CSS + JS + data',
    scopeTitle: 'Visible DOM + source',
    scopeDetail: '#signals · source lines 3–6 · rendered state attached',
    chips: ['DOM', 'source', 'console', 'bundle'],
    suggestions: [
      ['Explain dashboard', 'Explain how these metrics are calculated and identify missing source evidence.'],
      ['Patch selected element', 'Make the selected metric clearer without changing the surrounding layout.'],
    ],
    disclosure: 'Local source first · runtime actions require permission',
    candidate: 'HTML source patch · preview smoke check passed',
    manifest: [
      ['Scope', '#signals + source lines 3–6'],
      ['Bundle', 'HTML, dashboard.css, dashboard.js, metrics.json'],
      ['Runtime', 'safe preview · no network'],
      ['Console', '0 errors · 0 warnings'],
      ['Writeback', 'revision-guarded source patch'],
    ],
  },
  pdf: {
    name: 'information-foraging.pdf',
    path: 'Papers/Information Retrieval/information-foraging.pdf',
    badge: 'PDF',
    badgeClass: 'pdf-badge',
    status: 'Original PDF read-only · native viewer retained',
    toolbarMeta: 'Page 7 / 24 · extracted local text',
    scopeTitle: 'Current page',
    scopeDetail: 'Page 7 · extracted text · no PDF binary upload',
    chips: ['page 7', 'selection', 'citation'],
    suggestions: [
      ['Explain selection', 'Explain the highlighted passage and preserve its page citation.'],
      ['Compare pages', 'Compare the navigation argument on pages 6–8.'],
    ],
    disclosure: 'Page text only · binary remains local',
    candidate: 'Annotation note · PDF unchanged',
    manifest: [
      ['Scope', 'page 7'],
      ['Included', 'extracted text, copied selection'],
      ['Excluded', 'PDF binary, unrelated pages'],
      ['Citation', 'information-foraging.pdf#page=7'],
      ['Writeback', 'sibling Markdown annotation'],
    ],
  },
  code: {
    name: 'pipeline.py',
    path: 'src/research/pipeline.py',
    badge: 'PY',
    badgeClass: 'code-badge',
    status: 'Native source · execution disabled',
    toolbarMeta: 'Python · 3 direct imports · 7 references',
    scopeTitle: 'build_context · lines 25–26',
    scopeDetail: 'Selection + symbol references + imports + linked Markdown note',
    chips: ['selection', 'symbol', 'imports', 'notes'],
    suggestions: [
      ['Explain call chain', 'Explain how build_context flows into execute_plan across files.'],
      ['Prepare refactor', 'Make context policy explicit and update every reference and test.'],
    ],
    disclosure: 'Code context only · nothing will run',
    candidate: 'Atomic multi-file patch · 3 files',
    manifest: [
      ['Scope', 'build_context · lines 25–26'],
      ['References', '7 in 4 files'],
      ['Related note', 'pipeline-test.md'],
      ['Excluded', '.env, ignored files, credentials'],
      ['Writeback', 'reviewed multi-file transaction'],
    ],
  },
  canvas: {
    name: 'knowledge-map.canvas',
    path: 'Maps/Research/knowledge-map.canvas',
    badge: 'CAN',
    badgeClass: 'canvas-badge',
    status: 'Native Canvas · source revision 19',
    toolbarMeta: '1 node selected · 4 connected edges',
    scopeTitle: 'Selected Canvas node',
    scopeDetail: 'Research question · node bounds + connected edges + file refs',
    chips: ['node', 'edges', 'layout', 'file refs'],
    suggestions: [
      ['Explain subgraph', 'Explain how the selected question connects sources, decisions, and open gaps.'],
      ['Suggest structure', 'Propose missing links and a clearer layout without deleting nodes.'],
    ],
    disclosure: 'Native renderer retained · typed graph patch',
    candidate: 'Canvas object patch · 2 edges + layout',
    manifest: [
      ['Scope', 'selected node + connected edges'],
      ['Included', 'IDs, labels, bounds, file refs'],
      ['Unknown fields', 'preserved'],
      ['Layout', 'review separately from semantics'],
      ['Writeback', 'typed graph patch'],
    ],
  },
  excalidraw: {
    name: 'system-flow.excalidraw',
    path: 'Diagrams/System/system-flow.excalidraw.md',
    badge: 'EX',
    badgeClass: 'excalidraw-badge',
    status: 'Plugin scene · revision 12',
    toolbarMeta: '2 elements selected · 1 binding',
    scopeTitle: 'Selected scene elements',
    scopeDetail: 'Review group · bounds + text + bindings + scene preview',
    chips: ['elements', 'groups', 'bindings', 'z-order'],
    suggestions: [
      ['Explain diagram', 'Explain the source-to-review-to-output flow and identify ambiguity.'],
      ['Refine scene', 'Clarify the Review step and preserve all plugin metadata and bindings.'],
    ],
    disclosure: 'Scene structure + preview · bitmap pixels excluded',
    candidate: 'Scene patch · 3 objects · metadata preserved',
    manifest: [
      ['Scope', '2 elements + 1 binding'],
      ['Included', 'IDs, text, groups, bounds, z-order'],
      ['Preview', 'scene screenshot attached'],
      ['Unknown metadata', 'preserved'],
      ['Writeback', 'typed scene patch'],
    ],
  },
};

const state = {
  file: 'image',
  candidateVisible: false,
};

const body = document.body;
const fileButtons = [...document.querySelectorAll('[data-file-target]')];
const surfaces = [...document.querySelectorAll('[data-surface]')];
const toolbars = [...document.querySelectorAll('[data-toolbar-for]')];
const headerBadge = document.querySelector('#active-file-badge');
const fileName = document.querySelector('#active-file-name');
const filePath = document.querySelector('#active-file-path');
const fileStatus = document.querySelector('#active-file-status');
const toolbarMeta = document.querySelector('#toolbar-meta');
const scopeTitle = document.querySelector('#scope-title');
const scopeDetail = document.querySelector('#scope-detail');
const scopeChips = document.querySelector('#scope-chips');
const suggestions = document.querySelector('#suggestion-list');
const prompt = document.querySelector('#copilot-prompt');
const modelDisclosure = document.querySelector('#model-disclosure');
const contextFileName = document.querySelector('#context-file-name');
const contextManifest = document.querySelector('#context-manifest');
const candidateBar = document.querySelector('[data-candidate-bar]');
const candidateTitle = document.querySelector('#candidate-title');
const runStatus = document.querySelector('[data-run-status]');
const runTitle = document.querySelector('#run-title');
const runDetail = document.querySelector('#run-detail');
const historyList = document.querySelector('#history-list');
const toast = document.querySelector('[data-toast]');

function renderChips(values) {
  scopeChips.replaceChildren(...values.map((value) => {
    const chip = document.createElement('span');
    chip.textContent = value;
    return chip;
  }));
}

function renderSuggestions(values) {
  suggestions.replaceChildren(...values.map(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.suggestion = value;
    button.textContent = label;
    return button;
  }));
}

function renderManifest(values) {
  contextManifest.replaceChildren(...values.map(([term, description]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = description;
    row.append(dt, dd);
    return row;
  }));
}

function setFile(nextFile, updateHash = true) {
  if (!fileConfigs[nextFile]) return;
  state.file = nextFile;
  const config = fileConfigs[nextFile];

  body.dataset.activeFile = nextFile;
  fileButtons.forEach((button) => {
    const active = button.dataset.fileTarget === nextFile;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  surfaces.forEach((surface) => {
    const active = surface.dataset.surface === nextFile;
    surface.hidden = !active;
    surface.classList.toggle('is-active', active);
  });
  toolbars.forEach((toolbar) => { toolbar.hidden = toolbar.dataset.toolbarFor !== nextFile; });

  headerBadge.className = `header-badge ${config.badgeClass}`;
  headerBadge.textContent = config.badge;
  fileName.textContent = config.name;
  filePath.textContent = config.path;
  fileStatus.textContent = config.status;
  toolbarMeta.textContent = config.toolbarMeta;
  scopeTitle.textContent = config.scopeTitle;
  scopeDetail.textContent = config.scopeDetail;
  renderChips(config.chips);
  renderSuggestions(config.suggestions);
  prompt.value = config.suggestions[0][1];
  modelDisclosure.textContent = config.disclosure;
  contextFileName.textContent = config.name;
  renderManifest(config.manifest);

  candidateBar.hidden = true;
  runStatus.hidden = true;
  state.candidateVisible = false;
  if (updateHash) history.replaceState(null, '', `#${nextFile}`);
}

function setActiveButton(button, selector) {
  document.querySelectorAll(selector).forEach((candidate) => candidate.classList.toggle('is-active', candidate === button));
}

function updateScope(title, detail, chips) {
  scopeTitle.textContent = title;
  scopeDetail.textContent = detail;
  renderChips(chips);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 1800);
}

function showCandidate() {
  const config = fileConfigs[state.file];
  state.candidateVisible = true;
  candidateTitle.textContent = config.candidate;
  candidateBar.hidden = false;
  runStatus.hidden = false;
  runTitle.textContent = 'Candidate prepared';
  runDetail.textContent = 'Review the exact scope and writeback before accepting.';
  showToast('Candidate ready for review');
}

fileButtons.forEach((button) => {
  button.addEventListener('click', () => setFile(button.dataset.fileTarget));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const visibleButtons = fileButtons.filter((item) => !item.hidden);
    const currentIndex = visibleButtons.indexOf(button);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next = visibleButtons[(currentIndex + direction + visibleButtons.length) % visibleButtons.length];
    next.focus();
  });
});

document.querySelector('#file-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  fileButtons.forEach((button) => {
    button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query);
  });
});

document.querySelectorAll('[data-sidecar-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.sidecarTab;
    document.querySelectorAll('[data-sidecar-tab]').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('is-active', active);
      candidate.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-sidecar-view]').forEach((view) => {
      const active = view.dataset.sidecarView === tab;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
  });
});

suggestions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-suggestion]');
  if (!button) return;
  prompt.value = button.dataset.suggestion;
  prompt.focus();
});

document.querySelector('[data-run-copilot]').addEventListener('click', showCandidate);
document.querySelector('[data-candidate-dismiss]').addEventListener('click', () => {
  candidateBar.hidden = true;
  runStatus.hidden = true;
  state.candidateVisible = false;
  showToast('Candidate dismissed · source unchanged');
});
document.querySelector('[data-candidate-review]').addEventListener('click', () => {
  if (state.file === 'code') {
    document.querySelector('[data-code-mode="review"]').click();
    return;
  }
  document.querySelector('[data-sidecar-tab="context"]').click();
  showToast('Showing candidate scope and writeback contract');
});
document.querySelector('[data-candidate-accept]').addEventListener('click', () => {
  const config = fileConfigs[state.file];
  candidateBar.hidden = true;
  runStatus.hidden = true;
  state.candidateVisible = false;
  fileStatus.textContent = state.file === 'pdf' ? 'Annotation saved · original PDF unchanged' : 'Candidate accepted · new revision recorded';
  const entry = document.createElement('article');
  entry.innerHTML = `<span>Just now</span><strong>${config.name}</strong><p>${config.candidate}</p>`;
  historyList.prepend(entry);
  showToast('Accepted safely · history updated');
});

document.querySelectorAll('[data-image-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-image-tool]');
    const tool = button.dataset.imageTool;
    document.querySelector('[data-image-overlay]').hidden = tool !== 'crop';
    document.querySelector('[data-image-pin]').hidden = tool !== 'inspect';
    if (tool === 'crop') updateScope('Crop region', 'Natural pixels · x 614–2454 · y 322–1602', ['pixels', 'region', 'source hash']);
    if (tool === 'inspect') updateScope('Detected diagram label', 'OCR: “Context & Workspaces” · confidence 96%', ['OCR', 'object', 'metadata']);
    if (tool === 'view') updateScope(fileConfigs.image.scopeTitle, fileConfigs.image.scopeDetail, fileConfigs.image.chips);
  });
});

document.querySelectorAll('[data-html-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-html-mode]');
    document.querySelector('[data-html-workbench]').dataset.mode = button.dataset.htmlMode;
    toolbarMeta.textContent = `${button.textContent} mode · safe local preview`;
  });
});
document.querySelector('[data-html-pick]').addEventListener('click', (event) => {
  event.currentTarget.classList.toggle('is-active');
  const selected = event.currentTarget.classList.contains('is-active');
  document.querySelector('[data-selected-dom]').classList.toggle('selected-dom', selected);
  if (selected) updateScope('Selected DOM element', '#signals article:first-child · source lines 3–6', ['DOM', 'source range', 'computed view']);
  else updateScope(fileConfigs.html.scopeTitle, fileConfigs.html.scopeDetail, fileConfigs.html.chips);
});

document.querySelectorAll('[data-pdf-page]').forEach((button) => {
  button.addEventListener('click', () => {
    const page = button.dataset.pdfPage;
    document.querySelectorAll('[data-pdf-page]').forEach((candidate) => candidate.classList.toggle('is-active', candidate.dataset.pdfPage === page));
    document.querySelector('[data-pdf-page-label]').textContent = page;
    toolbarMeta.textContent = `Page ${page} / 24 · extracted local text`;
    updateScope(`Current page · ${page}`, `Page ${page} · extracted text · no PDF binary upload`, [`page ${page}`, 'citation', 'local text']);
  });
});
document.querySelector('[data-pdf-selection]').addEventListener('click', (event) => {
  event.currentTarget.classList.toggle('is-active');
  updateScope('Copied PDF selection', `Page ${document.querySelector('[data-pdf-page-label]').textContent} · 18 words · citation bound`, ['selection', 'page citation', 'local text']);
});

document.querySelectorAll('[data-code-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-code-mode]');
    const mode = button.dataset.codeMode;
    document.querySelectorAll('[data-code-view]').forEach((view) => { view.hidden = view.dataset.codeView !== mode; });
    if (mode === 'references') updateScope('Reference graph', 'build_context · 7 references in 4 files', ['definition', 'callers', 'tests', 'notes']);
    if (mode === 'review') updateScope('Atomic multi-file patch', 'pipeline.py + context.py + tests/test_pipeline.py', ['3 files', '+18 −7', 'all-or-nothing']);
    if (mode === 'source') updateScope(fileConfigs.code.scopeTitle, fileConfigs.code.scopeDetail, fileConfigs.code.chips);
  });
});
document.querySelectorAll('[data-symbol]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-symbol]');
    updateScope(`Symbol · ${button.dataset.symbol}`, `Definition, references, diagnostics and related notes for ${button.dataset.symbol}`, ['symbol', 'references', 'diagnostics']);
  });
});
document.querySelectorAll('[data-related-file]').forEach((button) => {
  button.addEventListener('click', () => updateScope('Related source added', `${button.textContent.trim()} · explicitly included in context`, ['related file', 'explicit scope']));
});

document.querySelectorAll('[data-canvas-scope]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-canvas-scope]');
    const scope = button.dataset.canvasScope;
    document.querySelector('[data-canvas-board]').dataset.scope = scope;
    const labels = { selection: ['Selected node', '1 node · 4 connected edges'], subgraph: ['Current subgraph', '4 nodes · 4 edges · visible bounds'], whole: ['Whole Canvas', '5 nodes · 4 edges · full revision'] };
    updateScope(labels[scope][0], labels[scope][1], [scope, 'node IDs', 'edges', 'layout']);
  });
});
document.querySelectorAll('[data-canvas-node]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-canvas-node]').forEach((node) => node.classList.toggle('selected-node', node === button));
    updateScope(`Canvas node · ${button.dataset.canvasNode}`, 'Selected node ID + label + bounds + connected edges', ['node', 'edges', 'file refs']);
  });
});

document.querySelectorAll('[data-scene-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-scene-mode]');
    const mode = button.dataset.sceneMode;
    document.querySelector('[data-scene-board]').dataset.mode = mode;
    const details = {
      elements: ['Selected scene elements', '2 elements · text + group + bounds'],
      bindings: ['Scene bindings', '1 arrow binding · source and target IDs preserved'],
      preview: ['Typed patch preview', '3 objects changed · unknown metadata preserved'],
    };
    updateScope(details[mode][0], details[mode][1], [mode, 'element IDs', 'scene revision']);
  });
});
document.querySelectorAll('[data-scene-element]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(button, '[data-scene-element]');
    document.querySelector('[data-scene-selection]').textContent = button.dataset.sceneElement;
    updateScope(`Scene element · ${button.dataset.sceneElement}`, 'Element IDs + bounds + group + bindings + z-order', ['element', 'bounds', 'bindings']);
  });
});

window.addEventListener('hashchange', () => setFile(location.hash.slice(1), false));
const initialFile = fileConfigs[location.hash.slice(1)] ? location.hash.slice(1) : 'image';
setFile(initialFile, false);
