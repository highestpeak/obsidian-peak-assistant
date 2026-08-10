(function (global) {
  "use strict";

  var catalog = global.PeakUICatalog;
  if (!catalog) throw new Error("PeakUICatalog must load before catalog-runtime.js");

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sourceGroup(label, paths) {
    var group = element("div", "inventory-sources__group");
    group.appendChild(element("b", "", label));
    var list = element("div", "inventory-sources__links");
    paths.forEach(function (path) {
      var link = element("a", "pk-chip inventory-source-link", path.split("/").pop());
      link.href = path;
      link.title = path;
      list.appendChild(link);
    });
    group.appendChild(list);
    return group;
  }

  function referenceCard(scene, reference) {
    var figure = element("figure", "inventory-reference");
    var button = element("button", "inventory-reference__image");
    button.type = "button";
    button.dataset.referenceImage = reference.image;
    button.dataset.referenceLabel = scene.title + " · " + reference.label;
    var image = element("img");
    image.src = reference.image;
    image.alt = scene.title + " · " + reference.label;
    image.loading = "lazy";
    button.appendChild(image);
    var caption = element("figcaption");
    var copy = element("div");
    copy.appendChild(element("b", "", reference.label));
    copy.appendChild(element("span", "", "录屏 " + reference.second + "s"));
    caption.appendChild(copy);
    caption.appendChild(element("span", "pk-chip", "Reference"));
    figure.append(button, caption);
    return figure;
  }

  function renderScene(scene, index) {
    var section = element("section", "inventory-scene");
    section.id = scene.id;
    var head = element("header", "inventory-scene__head");
    var number = element("span", "inventory-scene__number", String(index + 1).padStart(2, "0"));
    var copy = element("div", "inventory-scene__copy");
    copy.appendChild(element("h2", "", scene.title));
    copy.appendChild(element("p", "", scene.productJob));
    var states = element("div", "inventory-states");
    scene.states.forEach(function (state) { states.appendChild(element("span", "pk-chip", state.label)); });
    head.append(number, copy, states);

    var references = element("div", "inventory-references");
    scene.references.forEach(function (reference) { references.appendChild(referenceCard(scene, reference)); });

    var sources = element("div", "inventory-sources");
    sources.appendChild(sourceGroup("Production source", scene.production));
    sources.appendChild(sourceGroup("Design reference", scene.designs));
    var contract = element("div", "inventory-scene__contract");
    contract.appendChild(element("b", "", "验收边界"));
    contract.appendChild(element("span", "", "截图回答外观；源码回答结构；真实 Obsidian 回答交互。Theme Lab 不承担本场景的像素复刻。"));
    sources.appendChild(contract);

    section.append(head, references, sources);
    return section;
  }

  function renderNavigation() {
    var nav = document.querySelector("[data-inventory-nav]");
    if (!nav) return;
    catalog.scenes.forEach(function (scene, index) {
      var link = element("a", "", String(index + 1).padStart(2, "0") + " " + scene.title);
      link.href = "#" + scene.id;
      nav.appendChild(link);
    });
  }

  function renderRecording() {
    var root = document.querySelector("[data-recording-meta]");
    if (!root) return;
    var copy = element("div");
    copy.appendChild(element("span", "pk-eyebrow", "LOCKED RECORDING SOURCE"));
    copy.appendChild(element("b", "", catalog.recording.file));
    copy.appendChild(element("span", "", catalog.recording.duration + " · " + catalog.recording.viewport));
    var hash = element("code", "", "SHA-256 " + catalog.recording.sha256);
    root.append(copy, hash);
  }

  function openLightbox(button) {
    var overlay = element("div", "inventory-lightbox");
    overlay.dataset.inventoryLightbox = "true";
    var close = element("button", "pk-btn inventory-lightbox__close", "关闭");
    close.type = "button";
    close.dataset.lightboxClose = "true";
    var image = element("img");
    image.src = button.dataset.referenceImage;
    image.alt = button.dataset.referenceLabel;
    var caption = element("span", "", button.dataset.referenceLabel);
    overlay.append(close, image, caption);
    document.body.appendChild(overlay);
    close.focus();
  }

  function closeLightbox() {
    var overlay = document.querySelector("[data-inventory-lightbox]");
    if (overlay) overlay.remove();
  }

  function boot() {
    renderNavigation();
    renderRecording();
    var root = document.querySelector("[data-inventory-root]");
    if (root) catalog.scenes.forEach(function (scene, index) { root.appendChild(renderScene(scene, index)); });
  }

  document.addEventListener("click", function (event) {
    var reference = event.target.closest && event.target.closest("[data-reference-image]");
    if (reference) { openLightbox(reference); return; }
    if (event.target.closest && event.target.closest("[data-lightbox-close]")) closeLightbox();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeLightbox(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}(window));
