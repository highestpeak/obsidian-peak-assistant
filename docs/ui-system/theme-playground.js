(function () {
  "use strict";

  var consoleStateKey = "peak-theme-lab-console-v1";
  var consoleState = readConsoleState();

  function readConsoleState() {
    var fallback = { pinned: true, collapsed: false };
    try {
      var stored = JSON.parse(window.localStorage.getItem(consoleStateKey) || "{}");
      return {
        pinned: typeof stored.pinned === "boolean" ? stored.pinned : fallback.pinned,
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
    panel.dataset.pinned = String(consoleState.pinned);
    panel.dataset.collapsed = String(consoleState.collapsed);

    var body = panel.querySelector(".lab-console__body");
    if (body) {
      body.setAttribute("aria-hidden", String(consoleState.collapsed));
      body.inert = consoleState.collapsed;
    }

    var pin = panel.querySelector("[data-lab-console-pin]");
    if (pin) {
      pin.setAttribute("aria-pressed", String(consoleState.pinned));
      pin.title = consoleState.pinned ? "取消吸顶锁定" : "锁定并吸顶";
      var pinLabel = pin.querySelector("[data-lab-console-pin-label]");
      if (pinLabel) pinLabel.textContent = consoleState.pinned ? "已锁定" : "未锁定";
      var pinIcon = pin.querySelector("use");
      if (pinIcon) pinIcon.setAttribute("href", consoleState.pinned ? "#pk-icon-lock" : "#pk-icon-unlock");
    }

    var collapse = panel.querySelector("[data-lab-console-collapse]");
    if (!collapse) return;
    collapse.setAttribute("aria-expanded", String(!consoleState.collapsed));
    collapse.title = consoleState.collapsed ? "展开 Theme State" : "折叠 Theme State";
    var collapseLabel = collapse.querySelector("[data-lab-console-collapse-label]");
    if (collapseLabel) collapseLabel.textContent = consoleState.collapsed ? "展开" : "折叠";
  }

  function toggleConsolePin() {
    consoleState.pinned = !consoleState.pinned;
    persistConsoleState();
    renderConsoleState();
  }

  function toggleConsoleCollapse() {
    consoleState.collapsed = !consoleState.collapsed;
    persistConsoleState();
    renderConsoleState();
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
    var pin = event.target.closest && event.target.closest("[data-lab-console-pin]");
    if (pin) { toggleConsolePin(); return; }
    var collapse = event.target.closest && event.target.closest("[data-lab-console-collapse]");
    if (collapse) { toggleConsoleCollapse(); return; }
    var option = event.target.closest && event.target.closest("[data-lab-option]");
    if (option) { selectOption(option); return; }
    var toggle = event.target.closest && event.target.closest("[data-lab-toggle]");
    if (toggle) { toggleSwitch(toggle); return; }
    var row = event.target.closest && event.target.closest("[data-lab-row]");
    if (row) selectRow(row);
  });

  renderConsoleState();
}());
