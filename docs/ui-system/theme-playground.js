(function () {
  "use strict";

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

  document.addEventListener("click", function (event) {
    var option = event.target.closest && event.target.closest("[data-lab-option]");
    if (option) { selectOption(option); return; }
    var toggle = event.target.closest && event.target.closest("[data-lab-toggle]");
    if (toggle) toggleSwitch(toggle);
  });
}());
