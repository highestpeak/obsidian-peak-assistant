(function (global) {
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

  function showReference(file) {
    var preview = document.querySelector("[data-image-preview]");
    var empty = document.querySelector(".ai-reference__empty");
    if (!preview || !empty || !file) return;
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      preview.src = String(reader.result || "");
      preview.hidden = false;
      empty.hidden = true;
    });
    reader.readAsDataURL(file);
  }

  function clearReference() {
    var preview = document.querySelector("[data-image-preview]");
    var empty = document.querySelector(".ai-reference__empty");
    var input = document.querySelector("[data-image-input]");
    if (preview) { preview.removeAttribute("src"); preview.hidden = true; }
    if (empty) empty.hidden = false;
    if (input) input.value = "";
  }

  function announce(message) {
    var node = document.querySelector("[data-theme-status]");
    if (!node) return;
    node.textContent = message;
    global.setTimeout(function () { node.textContent = "Theme state 已同步"; }, 1800);
  }

  document.addEventListener("click", function (event) {
    var option = event.target.closest && event.target.closest("[data-lab-option]");
    if (option) { selectOption(option); return; }
    var toggle = event.target.closest && event.target.closest("[data-lab-toggle]");
    if (toggle) { toggleSwitch(toggle); return; }
    if (event.target.closest && event.target.closest("[data-image-clear]")) { clearReference(); return; }
    if (event.target.closest && event.target.closest("[data-copy-image-prompt]")) {
      var prompt = document.querySelector("[data-image-prompt]");
      if (prompt) copyText(prompt.textContent.trim()).then(function () { announce("图片换肤 Prompt 已复制"); });
    }
  });

  document.addEventListener("change", function (event) {
    var input = event.target.closest && event.target.closest("[data-image-input]");
    if (input && input.files && input.files[0]) showReference(input.files[0]);
  });
}(window));
