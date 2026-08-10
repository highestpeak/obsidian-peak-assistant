(function () {
  "use strict";

  var consoleStateKey = "peak-theme-lab-console-v1";
  var consoleState = readConsoleState();
  var activeThemeMenuTrigger = null;

  function readConsoleState() {
    var fallback = { collapsed: false };
    try {
      var stored = JSON.parse(window.localStorage.getItem(consoleStateKey) || "{}");
      return {
        collapsed: typeof stored.collapsed === "boolean" ? stored.collapsed : fallback.collapsed
      };
    } catch (_) { return fallback; }
  }

  function persistConsoleState() {
    try { window.localStorage.setItem(consoleStateKey, JSON.stringify(consoleState)); } catch (_) { /* file origin may reject storage */ }
  }

  function renderConsoleState() {
    var panel = document.querySelector("[data-lab-console]");
    if (!panel) return;
    panel.dataset.collapsed = String(consoleState.collapsed);

    var body = panel.querySelector(".lab-console__body");
    if (body) {
      body.setAttribute("aria-hidden", String(consoleState.collapsed));
      body.inert = consoleState.collapsed;
    }

    var collapse = panel.querySelector("[data-lab-console-collapse]");
    if (!collapse) return;
    collapse.setAttribute("aria-expanded", String(!consoleState.collapsed));
    collapse.title = consoleState.collapsed ? "展开 Theme State" : "折叠 Theme State";
    var collapseLabel = collapse.querySelector("[data-lab-console-collapse-label]");
    if (collapseLabel) collapseLabel.textContent = consoleState.collapsed ? "展开" : "折叠";
  }

  function toggleConsoleCollapse() {
    consoleState.collapsed = !consoleState.collapsed;
    if (!consoleState.collapsed) closeThemeAxisMenu(false);
    persistConsoleState();
    renderConsoleState();
  }

  function displayThemeValue(system, key, value) {
    if (key === "pack" && system.packs[value]) return system.packs[value].label;
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
  }

  function renderCompactThemeControls() {
    var runtime = window.PeakThemeRuntime;
    var system = window.PeakThemeSystem;
    if (!runtime || !system) return;
    var state = runtime.getState();
    document.querySelectorAll("[data-lab-theme-menu-trigger]").forEach(function (button) {
      var key = button.dataset.labThemeMenuTrigger;
      var values = system.axes[key];
      if (!values || !values.length) return;
      var name = button.dataset.axisName || key;
      var label = name + ": " + displayThemeValue(system, key, state[key]) + " · 点击查看选项";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.dataset.value = state[key];
    });
    var accent = document.querySelector(".lab-console__accent");
    if (accent) accent.title = "Accent: " + state.accent + " · 点击选择颜色";
    if (activeThemeMenuTrigger) renderThemeAxisMenu(activeThemeMenuTrigger, false);
  }

  function createCheckIcon() {
    var icon = document.createElement("span");
    icon.className = "lab-console__axis-check";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    return icon;
  }

  function renderThemeAxisMenu(trigger, focusSelected) {
    var runtime = window.PeakThemeRuntime;
    var system = window.PeakThemeSystem;
    if (!runtime || !system) return;
    var menu = document.querySelector("[data-lab-theme-axis-menu], .lab-console__axis-menu");
    var panel = document.querySelector("[data-lab-console]");
    if (!menu || !panel) return;
    var key = trigger.dataset.labThemeMenuTrigger;
    var values = system.axes[key];
    if (!values || !values.length) return;
    var state = runtime.getState();
    var name = trigger.dataset.axisName || key;
    var title = menu.querySelector("[data-lab-theme-menu-title]");
    var current = menu.querySelector("[data-lab-theme-menu-current]");
    var options = menu.querySelector("[data-lab-theme-menu-options]");
    if (!title || !current || !options) return;
    title.textContent = name;
    current.textContent = "当前：" + displayThemeValue(system, key, state[key]);
    options.replaceChildren();
    var selectedButton = null;

    values.forEach(function (value) {
      var option = document.createElement("button");
      var selected = state[key] === value;
      option.type = "button";
      option.dataset.labThemeSelect = key;
      option.dataset.value = value;
      option.dataset.selected = String(selected);
      option.setAttribute("role", "menuitemradio");
      option.setAttribute("aria-checked", String(selected));

      var marker = document.createElement("span");
      marker.className = "lab-console__axis-option-marker";
      marker.setAttribute("aria-hidden", "true");
      if (key === "pack" && system.packs[value]) marker.style.setProperty("--axis-marker", system.packs[value].accent);
      else marker.textContent = String(value).charAt(0).toUpperCase();

      var label = document.createElement("span");
      label.textContent = displayThemeValue(system, key, value);
      option.append(marker, label, createCheckIcon());
      options.appendChild(option);
      if (selected) selectedButton = option;
    });

    menu.hidden = false;
    menu.setAttribute("aria-label", name + " options");
    document.querySelectorAll("[data-lab-theme-menu-trigger]").forEach(function (button) {
      button.setAttribute("aria-expanded", String(button === trigger));
    });
    activeThemeMenuTrigger = trigger;

    var panelRect = panel.getBoundingClientRect();
    var triggerRect = trigger.getBoundingClientRect();
    var menuWidth = menu.offsetWidth || 238;
    var left = Math.max(10, Math.min(triggerRect.left - panelRect.left, panelRect.width - menuWidth - 10));
    menu.style.left = left + "px";
    if (focusSelected !== false && selectedButton) window.requestAnimationFrame(function () { selectedButton.focus(); });
  }

  function closeThemeAxisMenu(restoreFocus) {
    var menu = document.querySelector(".lab-console__axis-menu");
    if (!menu || menu.hidden) return;
    var trigger = activeThemeMenuTrigger;
    menu.hidden = true;
    document.querySelectorAll("[data-lab-theme-menu-trigger]").forEach(function (button) { button.setAttribute("aria-expanded", "false"); });
    activeThemeMenuTrigger = null;
    if (restoreFocus && trigger) trigger.focus();
  }

  function toggleThemeAxisMenu(trigger) {
    var menu = document.querySelector(".lab-console__axis-menu");
    if (activeThemeMenuTrigger === trigger && menu && !menu.hidden) { closeThemeAxisMenu(true); return; }
    closeThemeAxisMenu(false);
    renderThemeAxisMenu(trigger, true);
  }

  function selectThemeAxis(option) {
    var runtime = window.PeakThemeRuntime;
    var system = window.PeakThemeSystem;
    if (!runtime || !system) return;
    var key = option.dataset.labThemeSelect;
    var value = option.dataset.value;
    if (!system.axes[key] || system.axes[key].indexOf(value) === -1) return;
    var next = runtime.getState();
    next[key] = value;
    if (key === "pack") next.accent = system.packs[value].accent;
    runtime.apply(next);
    closeThemeAxisMenu(true);
  }

  function selectOption(button) {
    var group = button.closest("[data-lab-group]");
    if (!group) return;
    group.querySelectorAll("[data-lab-option]").forEach(function (candidate) {
      var selected = candidate === button;
      candidate.dataset.selected = String(selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
  }

  function toggleSwitch(button) {
    var on = button.dataset.on !== "true";
    button.dataset.on = String(on);
    button.setAttribute("aria-pressed", String(on));
  }

  function selectRow(row) {
    var scope = row.closest("[data-lab-selectable]");
    if (!scope) return;
    scope.querySelectorAll("[data-lab-row]").forEach(function (candidate) {
      var selected = candidate === row;
      candidate.dataset.selected = String(selected);
      candidate.setAttribute("aria-selected", String(selected));
    });
  }

  document.addEventListener("click", function (event) {
    var themeSelection = event.target.closest && event.target.closest("[data-lab-theme-select]");
    if (themeSelection) { selectThemeAxis(themeSelection); return; }
    var themeMenuTrigger = event.target.closest && event.target.closest("[data-lab-theme-menu-trigger]");
    if (themeMenuTrigger) { toggleThemeAxisMenu(themeMenuTrigger); return; }
    var insideThemeMenu = event.target.closest && event.target.closest(".lab-console__axis-menu");
    if (activeThemeMenuTrigger && !insideThemeMenu) closeThemeAxisMenu(false);
    var collapse = event.target.closest && event.target.closest("[data-lab-console-collapse]");
    if (collapse) { toggleConsoleCollapse(); return; }
    var option = event.target.closest && event.target.closest("[data-lab-option]");
    if (option) { selectOption(option); return; }
    var toggle = event.target.closest && event.target.closest("[data-lab-toggle]");
    if (toggle) { toggleSwitch(toggle); return; }
    var row = event.target.closest && event.target.closest("[data-lab-row]");
    if (row) selectRow(row);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !activeThemeMenuTrigger) return;
    event.preventDefault();
    closeThemeAxisMenu(true);
  });

  document.addEventListener("peak-theme-change", renderCompactThemeControls);
  renderConsoleState();
  renderCompactThemeControls();
}());
