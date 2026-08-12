(function (global) {
  "use strict";

  var system = global.PeakThemeSystem;
  if (!system) throw new Error("PeakThemeSystem must load before theme-runtime.js");

  var sourceId = "peak-theme-" + Math.random().toString(36).slice(2);
  var state = sanitize(readInitialState());
  var channel = null;
  var openedWindows = [];

  try { channel = new BroadcastChannel(system.channel); } catch (_) { channel = null; }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitize(candidate) {
    var next = Object.assign({}, system.defaults, candidate || {});
    Object.keys(system.axes).forEach(function (key) {
      if (system.axes[key].indexOf(next[key]) === -1) next[key] = system.defaults[key];
    });
    if (!/^#[0-9a-f]{6}$/i.test(String(next.accent || ""))) next.accent = system.packs[next.pack].accent;
    next.accent = String(next.accent).toLowerCase();
    next.composer = sanitizeComposer(candidate && candidate.composer);
    next.graph = sanitizeGraph(candidate && candidate.graph);
    return next;
  }

  function sanitizeComposer(candidate) {
    var input = candidate && typeof candidate === "object" ? candidate : {};
    var preset = system.composerPresets[input.preset] ? input.preset : system.composerDefaults.preset;
    var sourceOverrides = input.overrides && typeof input.overrides === "object" ? input.overrides : {};
    var overrides = {};

    Object.keys(system.composerOverrideOptions).forEach(function (key) {
      if (system.composerOverrideOptions[key].indexOf(sourceOverrides[key]) !== -1) overrides[key] = sourceOverrides[key];
    });
    Object.keys(system.composerOverrideRanges).forEach(function (key) {
      if (!Number.isFinite(Number(sourceOverrides[key]))) return;
      var range = system.composerOverrideRanges[key];
      overrides[key] = Math.max(range[0], Math.min(range[1], Number(sourceOverrides[key])));
    });
    return { preset: preset, overrides: overrides };
  }

  function sanitizeGraph(candidate) {
    var input = candidate && typeof candidate === "object" ? candidate : {};
    var next = Object.assign({}, system.graphDefaults);
    Object.keys(system.graphOptions).forEach(function (key) {
      if (system.graphOptions[key].indexOf(input[key]) !== -1) next[key] = input[key];
    });
    Object.keys(system.graphRanges).forEach(function (key) {
      if (!Number.isFinite(Number(input[key]))) return;
      var range = system.graphRanges[key];
      next[key] = Math.max(range[0], Math.min(range[1], Number(input[key])));
    });
    return next;
  }

  function readInitialState() {
    var fromUrl = {};
    try {
      var params = new URLSearchParams(global.location.search);
      Object.keys(system.defaults).forEach(function (key) {
        if (params.has(key)) fromUrl[key] = params.get(key);
      });
    } catch (_) { /* direct file fallback */ }

    var stored = {};
    try { stored = JSON.parse(global.localStorage.getItem(system.stateKey) || "{}"); } catch (_) { stored = {}; }
    return Object.assign({}, stored, fromUrl);
  }

  function hexRgb(hex) {
    var value = String(hex).replace("#", "");
    return [0, 2, 4].map(function (offset) { return parseInt(value.slice(offset, offset + 2), 16); });
  }

  function toHex(value) {
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  }

  function mix(a, b, amount) {
    var aa = hexRgb(a);
    var bb = hexRgb(b);
    return "#" + aa.map(function (value, index) { return toHex(value + (bb[index] - value) * amount); }).join("");
  }

  function rgba(hex, alpha) {
    var rgb = hexRgb(hex);
    return "rgba(" + rgb.join(", ") + ", " + alpha + ")";
  }

  function relativeLuminance(hex) {
    var rgb = hexRgb(hex).map(function (value) { return value / 255; });
    return rgb.reduce(function (sum, value, index) {
      var channelValue = value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      return sum + channelValue * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  }

  function contrastRatio(a, b) {
    var aa = relativeLuminance(a);
    var bb = relativeLuminance(b);
    return (Math.max(aa, bb) + 0.05) / (Math.min(aa, bb) + 0.05);
  }

  function contrastText(hex) {
    var darkText = "#000000";
    var lightText = "#ffffff";
    return contrastRatio(hex, darkText) >= contrastRatio(hex, lightText) ? darkText : lightText;
  }

  function accessibleAccentText(accent, surface, dark) {
    var candidate = accent;
    var destination = dark ? "#ffffff" : "#000000";
    var tintSurface = mix(surface, accent, dark ? 0.18 : 0.10);
    for (var step = 0; step <= 10; step += 1) {
      candidate = mix(accent, destination, step / 10);
      if (contrastRatio(candidate, surface) >= 4.5 && contrastRatio(candidate, tintSurface) >= 4.5) return candidate;
    }
    return dark ? "#ffffff" : "#17191d";
  }

  function resolve(next) {
    var pack = system.packs[next.pack];
    var palette = pack[next.appearance];
    var dark = next.appearance === "dark";
    var accent = next.accent;
    var radius = {
      square: ["2px", "4px", "6px", "8px"],
      balanced: ["4px", "8px", "12px", "16px"],
      soft: ["7px", "12px", "18px", "24px"]
    }[next.radius];
    var type = {
      compact: [9.5, 10.5, 11.5, 12.5, 13.5, 15, 19, 26],
      default: [10, 11, 12, 13, 14, 16, 20, 28],
      large: [11, 12, 13, 14, 15.5, 17.5, 22, 31]
    }[next.typography];
    var shadows = {
      flat: ["none", "none", "none", "none"],
      subtle: dark
        ? ["0 1px 2px rgba(0,0,0,.30)", "0 5px 16px rgba(0,0,0,.38)", "0 12px 32px rgba(0,0,0,.52)", "0 18px 48px rgba(0,0,0,.64)"]
        : ["0 1px 2px rgba(24,31,39,.06)", "0 5px 16px rgba(24,31,39,.09)", "0 12px 32px rgba(24,31,39,.14)", "0 18px 48px rgba(24,31,39,.18)"],
      layered: dark
        ? ["0 1px 3px rgba(0,0,0,.42)", "0 8px 24px rgba(0,0,0,.52)", "0 18px 44px rgba(0,0,0,.66)", "0 28px 72px rgba(0,0,0,.78)"]
        : ["0 1px 3px rgba(24,31,39,.10)", "0 8px 24px rgba(24,31,39,.14)", "0 18px 44px rgba(24,31,39,.20)", "0 28px 72px rgba(24,31,39,.25)"]
    }[next.elevation];
    var success = dark ? "#55d98b" : "#147b45";
    var warning = dark ? "#f4bf52" : "#a65712";
    var error = dark ? "#ff8188" : "#bd3743";
    var info = dark ? "#70a7ff" : "#2769cf";
    var accentText = accessibleAccentText(accent, palette.surface, dark);
    var graphSelected = mix(palette.surface, accent, dark ? 0.32 : 0.16);
    var graphRelated = mix(palette.surface, accent, dark ? 0.16 : 0.08);
    var graphAi = mix(palette.surface, info, dark ? 0.20 : 0.10);

    return {
      "--pk-bg": palette.background,
      "--pk-bg-secondary": palette.canvas,
      "--pk-bg-tertiary": palette.sunken,
      "--pk-surface": palette.surface,
      "--pk-surface-raised": palette.raised,
      "--pk-surface-sunken": palette.sunken,
      "--pk-surface-overlay": mix(palette.surface, dark ? "#ffffff" : "#000000", dark ? 0.04 : 0.01),
      "--pk-border": palette.border,
      "--pk-border-soft": mix(palette.border, palette.surface, 0.42),
      "--pk-border-strong": palette.strong,
      "--pk-border-accent": rgba(accent, dark ? 0.40 : 0.28),
      "--pk-text-primary": palette.text,
      "--pk-text-secondary": palette.muted,
      "--pk-text-tertiary": palette.faint,
      "--pk-text-faint": mix(palette.faint, palette.surface, 0.35),
      "--pk-text-inverted": contrastText(accent),
      "--pk-accent": accent,
      "--pk-accent-hover": mix(accent, dark ? "#ffffff" : "#000000", dark ? 0.18 : 0.12),
      "--pk-accent-tint": rgba(accent, dark ? 0.18 : 0.10),
      "--pk-accent-soft": rgba(accent, dark ? 0.34 : 0.22),
      "--pk-accent-text": accentText,
      "--pk-accent-fg": contrastText(accent),
      "--pk-success": success,
      "--pk-success-text": success,
      "--pk-success-bg": rgba(success, dark ? 0.16 : 0.10),
      "--pk-success-border": rgba(success, 0.28),
      "--pk-warning": warning,
      "--pk-warning-text": warning,
      "--pk-warning-bg": rgba(warning, dark ? 0.17 : 0.10),
      "--pk-warning-border": rgba(warning, 0.28),
      "--pk-error": error,
      "--pk-error-text": error,
      "--pk-error-bg": rgba(error, dark ? 0.17 : 0.10),
      "--pk-error-border": rgba(error, 0.28),
      "--pk-info": info,
      "--pk-info-text": info,
      "--pk-info-bg": rgba(info, dark ? 0.17 : 0.10),
      "--pk-info-border": rgba(info, 0.28),
      "--pk-teal": dark ? "#4bd2c4" : "#167c73",
      "--pk-teal-bg": dark ? "rgba(75,210,196,.16)" : "rgba(22,124,115,.10)",
      "--pk-state-hover": dark ? "rgba(255,255,255,.06)" : "rgba(22,27,34,.045)",
      "--pk-state-active": dark ? "rgba(255,255,255,.10)" : "rgba(22,27,34,.075)",
      "--pk-state-selected": rgba(accent, dark ? 0.20 : 0.11),
      "--pk-graph-node-bg": palette.surface,
      "--pk-graph-node-text": palette.text,
      "--pk-graph-node-selected-bg": graphSelected,
      "--pk-graph-node-selected-text": palette.text,
      "--pk-graph-node-related-bg": graphRelated,
      "--pk-graph-node-ai-bg": graphAi,
      "--pk-graph-edge": mix(palette.strong, palette.text, dark ? 0.14 : 0.08),
      "--pk-skeleton": palette.border,
      "--pk-shadow-sm": shadows[0],
      "--pk-shadow-md": shadows[1],
      "--pk-shadow-card": shadows[1],
      "--pk-shadow-popover": shadows[2],
      "--pk-shadow-modal": shadows[3],
      "--pk-radius-sm": radius[0],
      "--pk-radius-md": radius[1],
      "--pk-radius-lg": radius[2],
      "--pk-radius-xl": radius[3],
      "--pk-radius-pill": "999px",
      "--pk-radius-full": "999px",
      "--pk-text-xs": type[0] + "px",
      "--pk-text-sm": type[1] + "px",
      "--pk-text-base": type[2] + "px",
      "--pk-text-md": type[3] + "px",
      "--pk-text-lg": type[4] + "px",
      "--pk-text-xl": type[5] + "px",
      "--pk-text-2xl": type[6] + "px",
      "--pk-text-3xl": type[7] + "px",
      "--pk-density-row": next.density === "compact" ? "34px" : "42px",
      "--pk-density-pad": next.density === "compact" ? "8px" : "12px",
      "--pk-transition-fast": next.motion === "reduced" ? "0ms" : "100ms ease",
      "--pk-transition-base": next.motion === "reduced" ? "0ms" : "150ms ease",
      "--pk-transition-slow": next.motion === "reduced" ? "0ms" : "300ms ease"
    };
  }

  function composerValues(next) {
    var composer = sanitizeComposer(next && next.composer);
    var preset = system.composerPresets[composer.preset];
    return Object.assign({}, preset.values, composer.overrides);
  }

  function resolveComposer(next) {
    var value = composerValues(next);
    var fonts = {
      interface: ["var(--pk-font-sans)", "var(--pk-font-sans)"],
      "reading-serif": ["ui-serif, 'Songti SC', 'Noto Serif CJK SC', Georgia, serif", "ui-serif, 'Songti SC', 'Noto Serif CJK SC', Georgia, serif"],
      hybrid: ["ui-serif, 'Songti SC', 'Noto Serif CJK SC', Georgia, serif", "var(--pk-font-sans)"]
    }[value.fontPair];
    var headingScale = {
      quiet: [1.7, 1.4, 1.2, 1.08, 1, 0.94],
      clear: [2.08, 1.58, 1.3, 1.13, 1.02, 0.94],
      strong: [2.46, 1.78, 1.4, 1.17, 1.04, 0.94]
    }[value.headingEmphasis];
    var quote = {
      rail: ["3px", "transparent", "normal"],
      tint: ["3px", "var(--pk-accent-tint)", "normal"],
      plain: ["0px", "transparent", "italic"]
    }[value.quoteStyle];
    var callout = {
      outlined: ["var(--pk-surface)", "var(--pk-border-accent)"],
      tinted: ["var(--pk-accent-tint)", "var(--pk-border-accent)"],
      quiet: ["var(--pk-surface-sunken)", "var(--pk-border-soft)"]
    }[value.calloutStyle];
    var code = {
      flat: ["var(--pk-surface-sunken)", "transparent", "none"],
      outlined: ["var(--pk-surface-sunken)", "var(--pk-border)", "none"],
      raised: ["var(--pk-surface-raised)", "var(--pk-border-soft)", "var(--pk-shadow-md)"]
    }[value.codeSurface];
    var media = {
      flush: ["0px", "transparent", "none", "0px"],
      framed: ["var(--pk-radius-md)", "var(--pk-border)", "none", "8px"],
      soft: ["var(--pk-radius-lg)", "var(--pk-border-soft)", "var(--pk-shadow-card)", "10px"]
    }[value.mediaFrame];
    var body = Number(value.bodySizePx);

    return {
      "--pk-doc-body-font": fonts[0],
      "--pk-doc-heading-font": fonts[1],
      "--pk-doc-body-size": body + "px",
      "--pk-doc-body-line-height": String(value.bodyLineHeight),
      "--pk-doc-measure": value.contentMeasurePx + "px",
      "--pk-doc-paragraph-gap": value.paragraphGapPx + "px",
      "--pk-doc-heading-1-size": (body * headingScale[0]).toFixed(2) + "px",
      "--pk-doc-heading-2-size": (body * headingScale[1]).toFixed(2) + "px",
      "--pk-doc-heading-3-size": (body * headingScale[2]).toFixed(2) + "px",
      "--pk-doc-heading-4-size": (body * headingScale[3]).toFixed(2) + "px",
      "--pk-doc-heading-5-size": (body * headingScale[4]).toFixed(2) + "px",
      "--pk-doc-heading-6-size": (body * headingScale[5]).toFixed(2) + "px",
      "--pk-doc-list-indent": value.listIndentPx + "px",
      "--pk-doc-list-gap": value.listGapPx + "px",
      "--pk-doc-quote-border-width": quote[0],
      "--pk-doc-quote-bg": quote[1],
      "--pk-doc-quote-font-style": quote[2],
      "--pk-doc-callout-bg": callout[0],
      "--pk-doc-callout-border": callout[1],
      "--pk-doc-code-bg": code[0],
      "--pk-doc-code-border": code[1],
      "--pk-doc-code-shadow": code[2],
      "--pk-doc-table-row-height": value.tableDensity === "compact" ? "32px" : "40px",
      "--pk-doc-media-radius": media[0],
      "--pk-doc-media-border": media[1],
      "--pk-doc-media-shadow": media[2],
      "--pk-doc-media-padding": media[3],
      "--pk-doc-math-scale": value.mathScale === "compact" ? "0.9" : value.mathScale === "large" ? "1.12" : "1",
      "--pk-doc-math-size": value.mathScale === "compact" ? "0.98em" : value.mathScale === "large" ? "1.21em" : "1.08em"
    };
  }

  function resolveGraph(next) {
    var value = sanitizeGraph(next && next.graph);
    return {
      "--pk-graph-node-scale": String(value.nodeScale),
      "--pk-graph-label-size": value.labelSizePx + "px",
      "--pk-graph-edge-width": value.edgeWidthPx + "px",
      "--pk-graph-layout-spacing": String(value.layoutSpacing),
      "--pk-graph-canvas-pattern": value.canvasPattern
    };
  }

  function exportPayload() {
    var theme = clone(state);
    var composer = theme.composer;
    var graph = theme.graph;
    delete theme.composer;
    delete theme.graph;
    return { version: system.version, theme: theme, composer: composer, graph: graph };
  }

  function apply(next, options) {
    state = sanitize(next);
    var variables = Object.assign({}, resolve(state), resolveComposer(state), resolveGraph(state));
    document.documentElement.dataset.peakAppearance = state.appearance;
    document.documentElement.style.colorScheme = state.appearance;
    if (document.body) {
      document.body.dataset.peakAppearance = state.appearance;
      document.body.classList.toggle("theme-light", state.appearance === "light");
      document.body.classList.toggle("theme-dark", state.appearance === "dark");
    }
    document.querySelectorAll(".peak-design-root, .pktw-root").forEach(function (root) {
      root.dataset.themePack = state.pack;
      root.dataset.appearance = state.appearance;
      root.dataset.density = state.density;
      root.dataset.radius = state.radius;
      root.dataset.typography = state.typography;
      root.dataset.elevation = state.elevation;
      root.dataset.motion = state.motion;
      root.dataset.composerPreset = state.composer.preset;
      root.dataset.graphNodeShape = state.graph.nodeShape;
      root.dataset.graphCanvasPattern = state.graph.canvasPattern;
      Object.keys(variables).forEach(function (name) { root.style.setProperty(name, variables[name]); });
    });
    syncControls();
    renderState();
    if (!options || options.persist !== false) persist();
    if (!options || options.broadcast !== false) publish();
    document.dispatchEvent(new CustomEvent("peak-theme-change", { detail: clone(state) }));
  }

  function syncControls() {
    document.querySelectorAll("[data-theme-control]").forEach(function (control) {
      var key = control.dataset.themeControl;
      if (!(key in state)) return;
      if (control.type === "radio") control.checked = control.value === state[key];
      else control.value = state[key];
    });
    document.querySelectorAll("[data-theme-option]").forEach(function (option) {
      var key = option.dataset.themeOption;
      option.dataset.selected = String(option.dataset.value === state[key]);
      option.setAttribute("aria-pressed", String(option.dataset.value === state[key]));
    });
    var resolvedComposer = composerValues(state);
    document.querySelectorAll("[data-composer-theme-control]").forEach(function (control) {
      var key = control.dataset.composerThemeControl;
      control.value = key === "preset" ? state.composer.preset : resolvedComposer[key];
    });
    document.querySelectorAll("[data-composer-theme-value]").forEach(function (node) {
      var key = node.dataset.composerThemeValue;
      node.textContent = String(resolvedComposer[key]);
    });
    document.querySelectorAll("[data-composer-preset]").forEach(function (option) {
      var selected = option.dataset.composerPreset === state.composer.preset && Object.keys(state.composer.overrides).length === 0;
      option.dataset.selected = String(selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-graph-theme-control]").forEach(function (control) {
      var key = control.dataset.graphThemeControl;
      if (!(key in state.graph)) return;
      control.value = state.graph[key];
    });
    document.querySelectorAll("[data-graph-theme-value]").forEach(function (node) {
      var key = node.dataset.graphThemeValue;
      node.textContent = String(state.graph[key]);
    });
  }

  function renderState() {
    var pack = system.packs[state.pack];
    document.querySelectorAll("[data-theme-summary]").forEach(function (node) {
      node.textContent = pack.label + " · " + state.appearance + " · " + state.density + " · " + state.radius;
    });
    document.querySelectorAll("[data-theme-json]").forEach(function (node) {
      node.textContent = JSON.stringify(exportPayload(), null, 2);
    });
    document.querySelectorAll("[data-composer-theme-summary]").forEach(function (node) {
      var preset = system.composerPresets[state.composer.preset];
      node.textContent = preset.label + (Object.keys(state.composer.overrides).length ? " · Custom" : " · Preset");
    });
    document.querySelectorAll("[data-graph-theme-summary]").forEach(function (node) {
      node.textContent = state.graph.nodeShape + " · " + state.graph.labelSizePx + "px label · " + state.graph.edgeWidthPx + "px edge";
    });
  }

  function persist() {
    try { global.localStorage.setItem(system.stateKey, JSON.stringify(state)); } catch (_) { /* file origin may reject storage */ }
  }

  function publish() {
    var message = { type: "peak-theme-state", sourceId: sourceId, state: clone(state) };
    if (channel) channel.postMessage(message);
    openedWindows = openedWindows.filter(function (target) {
      if (!target || target.closed) return false;
      try { target.postMessage(message, "*"); } catch (_) { return false; }
      return true;
    });
    try { if (global.opener && !global.opener.closed) global.opener.postMessage(message, "*"); } catch (_) { /* no opener */ }
  }

  function receive(message) {
    if (!message || message.type !== "peak-theme-state" || message.sourceId === sourceId) return;
    apply(message.state, { broadcast: false });
  }

  if (channel) channel.addEventListener("message", function (event) { receive(event.data); });
  global.addEventListener("message", function (event) { receive(event.data); });
  global.addEventListener("storage", function (event) {
    if (event.key !== system.stateKey || !event.newValue) return;
    try { apply(JSON.parse(event.newValue), { broadcast: false, persist: false }); } catch (_) { /* invalid external state */ }
  });

  function bindControls() {
    document.addEventListener("input", function (event) {
      var graphControl = event.target.closest && event.target.closest("[data-graph-theme-control]");
      if (graphControl) {
        var graphKey = graphControl.dataset.graphThemeControl;
        var graphNext = clone(state);
        graphNext.graph[graphKey] = graphControl.type === "number" || graphControl.type === "range"
          ? Number(graphControl.value)
          : graphControl.value;
        apply(graphNext);
        return;
      }
      var composerControl = event.target.closest && event.target.closest("[data-composer-theme-control]");
      if (composerControl) {
        var composerKey = composerControl.dataset.composerThemeControl;
        var composerNext = clone(state);
        if (composerKey === "preset") composerNext.composer = { preset: composerControl.value, overrides: {} };
        else {
          composerNext.composer.overrides = Object.assign({}, composerNext.composer.overrides);
          composerNext.composer.overrides[composerKey] = composerControl.type === "number" || composerControl.type === "range"
            ? Number(composerControl.value)
            : composerControl.value;
        }
        apply(composerNext);
        return;
      }
      var control = event.target.closest && event.target.closest("[data-theme-control]");
      if (!control) return;
      var key = control.dataset.themeControl;
      var next = Object.assign({}, state);
      next[key] = control.value;
      if (key === "pack") next.accent = system.packs[control.value].accent;
      apply(next);
    });

    document.addEventListener("click", function (event) {
      var composerPreset = event.target.closest && event.target.closest("[data-composer-preset]");
      if (composerPreset) {
        var presetNext = clone(state);
        presetNext.composer = { preset: composerPreset.dataset.composerPreset, overrides: {} };
        apply(presetNext);
        return;
      }

      var composerReset = event.target.closest && event.target.closest("[data-composer-theme-reset]");
      if (composerReset) {
        var resetNext = clone(state);
        resetNext.composer = clone(system.composerDefaults);
        apply(resetNext);
        announce("Composer 文档样式已恢复");
        return;
      }

      var graphReset = event.target.closest && event.target.closest("[data-graph-theme-reset]");
      if (graphReset) {
        var graphResetNext = clone(state);
        graphResetNext.graph = clone(system.graphDefaults);
        apply(graphResetNext);
        announce("Graph 组件样式已恢复");
        return;
      }

      var option = event.target.closest && event.target.closest("[data-theme-option]");
      if (option) {
        var key = option.dataset.themeOption;
        var next = Object.assign({}, state);
        next[key] = option.dataset.value;
        if (key === "pack") next.accent = system.packs[next.pack].accent;
        apply(next);
        return;
      }

      var reset = event.target.closest && event.target.closest("[data-theme-reset]");
      if (reset) { apply(system.defaults); return; }

      var exportButton = event.target.closest && event.target.closest("[data-theme-export]");
      if (exportButton) {
        var payload = JSON.stringify(exportPayload(), null, 2);
        copyText(payload).then(function () { announce("Theme JSON 已复制"); });
        return;
      }

      var importButton = event.target.closest && event.target.closest("[data-theme-import]");
      if (importButton) {
        var input = global.prompt("粘贴 Theme JSON");
        if (!input) return;
        try {
          var parsed = JSON.parse(input);
          var imported = Object.assign({}, parsed.theme || parsed);
          if (parsed.composer) imported.composer = parsed.composer;
          if (parsed.graph) imported.graph = parsed.graph;
          apply(imported);
          announce("Theme JSON 已应用");
        } catch (_) { announce("Theme JSON 无效"); }
        return;
      }

      var openTarget = event.target.closest && event.target.closest("[data-open-theme-page]");
      if (openTarget) {
        event.preventDefault();
        var url = openTarget.getAttribute("href") || openTarget.dataset.openThemePage;
        var opened = global.open(url, "_blank");
        if (opened) {
          openedWindows.push(opened);
          global.setTimeout(publish, 180);
          global.setTimeout(publish, 600);
        }
      }
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return Promise.resolve();
  }

  function announce(message) {
    var node = document.querySelector("[data-theme-status]");
    if (!node) return;
    node.textContent = message;
    global.setTimeout(function () { node.textContent = "Theme State 已跨页面同步"; }, 1800);
  }

  function boot() {
    bindControls();
    apply(state, { broadcast: false });
    global.setTimeout(publish, 120);
  }

  global.PeakThemeRuntime = Object.freeze({
    getState: function () { return clone(state); },
    apply: function (next) { apply(next); },
    resolve: resolve,
    resolveComposer: resolveComposer,
    resolveGraph: resolveGraph
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}(window));
