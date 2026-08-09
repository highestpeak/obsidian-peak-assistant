(function () {
  "use strict";

  var APPLY_MESSAGE = "peak-design-system-preview:apply";
  var READY_MESSAGE = "peak-design-system-preview:ready";
  var APPLIED_MESSAGE = "peak-design-system-preview:applied";
  var STYLE_ID = "peak-design-system-preview-bridge";
  var activePayload = null;

  var bridgeCss = [
    "html[data-peak-preview-motion='reduced'] *,",
    "html[data-peak-preview-motion='reduced'] *::before,",
    "html[data-peak-preview-motion='reduced'] *::after {",
    "  animation-duration: .001ms !important;",
    "  animation-iteration-count: 1 !important;",
    "  scroll-behavior: auto !important;",
    "  transition-duration: .001ms !important;",
    "}",
    "html[data-peak-preview-density='compact'] :where(",
    "  .row, .native-row, .result-row, .history-row, .list-row, .file-row,",
    "  .artifact-row, .base-row, .idx-row, .tab-row, .tag-row, .suggest-row,",
    "  .enhance-row, .rail-item, .topic-row, .source-row, .mode-option,",
    "  .intel-card, .pk-row",
    ") {",
    "  padding-top: 6px !important;",
    "  padding-bottom: 6px !important;",
    "}",
    "html[data-peak-preview-density='compact'] :where(",
    "  .page, .stage, .desktop-stage, .prototype-section",
    ") {",
    "  --peak-preview-block-gap: 8px;",
    "}",
    "html[data-peak-preview-appearance='dark'] body {",
    "  background: var(--peak-preview-bg) !important;",
    "  color: var(--peak-preview-text) !important;",
    "}",
    "html[data-peak-preview-appearance='dark'] :where(",
    "  .prototype-bar, .surface-switcher, .tabs, .stage-tools",
    ") {",
    "  border-color: var(--peak-preview-border) !important;",
    "  background: var(--peak-preview-surface-raised) !important;",
    "}",
    "html[data-peak-preview-appearance='dark'] :where(input, textarea, select) {",
    "  border-color: var(--peak-preview-border) !important;",
    "  background: var(--peak-preview-surface) !important;",
    "  color: var(--peak-preview-text) !important;",
    "}",
    "html[data-peak-preview='true'] body {",
    "  transition: background-color 150ms ease, color 150ms ease;",
    "}"
  ].join("\n");

  function ensureBridgeStyle() {
    var style = document.getElementById(STYLE_ID);
    if (style) return style;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = bridgeCss;
    document.head.appendChild(style);
    return style;
  }

  function collectThemeRoots() {
    var roots = [document.documentElement];
    if (document.body) roots.push(document.body);
    document.querySelectorAll(".pktw-root, .peak-design-root").forEach(function (root) {
      roots.push(root);
    });
    return roots;
  }

  function applyVariables(target, variables) {
    Object.keys(variables || {}).forEach(function (name) {
      target.style.setProperty(name, variables[name]);
    });
  }

  function applyVariablesToRoots(variables) {
    collectThemeRoots().forEach(function (root) {
      applyVariables(root, variables);
    });
  }

  function notify(type, payload) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
      type: type,
      title: document.title,
      href: window.location.href,
      payload: payload || null
    }, "*");
  }

  function applyPreview(payload) {
    if (!payload || !payload.variables) return;
    activePayload = payload;
    ensureBridgeStyle();

    var root = document.documentElement;
    var body = document.body;
    root.dataset.peakPreview = "true";
    root.dataset.peakPreviewPack = payload.pack;
    root.dataset.peakPreviewAppearance = payload.appearance;
    root.dataset.peakPreviewDensity = payload.density;
    root.dataset.peakPreviewRadius = payload.radius;
    root.dataset.peakPreviewMotion = payload.motion;
    root.style.colorScheme = payload.appearance;

    if (body) {
      body.classList.toggle("theme-dark", payload.appearance === "dark");
      body.dataset.theme = payload.appearance;
    }

    applyVariablesToRoots(payload.variables);
    notify(APPLIED_MESSAGE, {
      id: payload.id,
      pack: payload.pack,
      appearance: payload.appearance,
      density: payload.density,
      radius: payload.radius,
      motion: payload.motion
    });
  }

  window.addEventListener("message", function (event) {
    var message = event.data;
    if (event.source !== window.parent) return;
    if (!message || message.type !== APPLY_MESSAGE) return;
    applyPreview(message.payload);
  });

  var observer = new MutationObserver(function (records) {
    if (!activePayload) return;
    var hasNewThemeRoot = records.some(function (record) {
      return Array.from(record.addedNodes).some(function (node) {
        if (!(node instanceof Element)) return false;
        return node.matches(".pktw-root, .peak-design-root") || Boolean(node.querySelector(".pktw-root, .peak-design-root"));
      });
    });
    if (hasNewThemeRoot) applyVariablesToRoots(activePayload.variables);
  });

  function announceReady() {
    ensureBridgeStyle();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    notify(READY_MESSAGE);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", announceReady, { once: true });
  } else {
    announceReady();
  }
}());
