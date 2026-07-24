const patterns = Array.from(document.querySelectorAll("[data-pattern-id]"));
const viewButtons = Array.from(document.querySelectorAll("[data-view]"));
const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
const descriptions = {
  work: "带 AI 洞察与候选定位点的工作状态，不展开具体改动。",
  all: "所有候选在各自对象内展开；接受与拒绝只处理当前一处。",
  clean: "只看 Composer 渲染后的原始内容，不显示洞察、告警和候选标记。",
};
let activeIndex = 0;
let activeFilter = "all";

function visiblePatterns() {
  return patterns.filter((pattern) => !pattern.hidden);
}

function pendingPatterns() {
  return patterns.filter((pattern) => pattern.dataset.status === "pending");
}

function syncState() {
  const visible = visiblePatterns();
  activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, visible.length - 1)));
  patterns.forEach((pattern) => pattern.classList.remove("is-active"));
  const active = visible[activeIndex];
  active?.classList.add("is-active");
  const pending = pendingPatterns().length;
  document.getElementById("pending-total").textContent = `${pending} 处待审`;
  document.getElementById("active-change").textContent = visible.length ? `第 ${activeIndex + 1} 处` : "没有匹配项";
  document.getElementById("dock-copy").textContent = `${pending} 处待审 · ${visible.length} 种样式可见`;
}

function setView(view) {
  document.body.dataset.view = view;
  viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  document.getElementById("view-description").textContent = descriptions[view];
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  history.replaceState({}, "", url);
}

function setFilter(filter) {
  activeFilter = filter;
  patterns.forEach((pattern) => {
    pattern.hidden = filter !== "all" && pattern.dataset.category !== filter;
  });
  filterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.filter === filter));
  activeIndex = 0;
  syncState();
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("button[data-view]")?.dataset.view;
  if (view) return setView(view);
  const filter = event.target.closest("[data-filter]")?.dataset.filter;
  if (filter) return setFilter(filter);
  const decision = event.target.closest("[data-decision]")?.dataset.decision;
  if (decision) {
    const pattern = event.target.closest("[data-pattern-id]");
    pattern.dataset.status = decision === "accept" ? "accepted" : "rejected";
    syncState();
    return;
  }
  const step = event.target.closest("[data-step]")?.dataset.step;
  if (step) {
    const visible = visiblePatterns();
    if (!visible.length) return;
    activeIndex = (activeIndex + (step === "next" ? 1 : -1) + visible.length) % visible.length;
    syncState();
    visible[activeIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const imageView = event.target.closest("[data-image-view]")?.dataset.imageView;
  if (imageView) {
    const figure = event.target.closest(".image-change");
    figure.dataset.imageVersion = imageView;
    figure.querySelectorAll("[data-image-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.imageView === imageView));
  }
});

patterns.forEach((pattern) => {
  pattern.addEventListener("click", () => {
    const visible = visiblePatterns();
    activeIndex = visible.indexOf(pattern);
    syncState();
  });
});

const params = new URLSearchParams(window.location.search);
setView(params.get("view") || "all");
setFilter(params.get("filter") || activeFilter);
