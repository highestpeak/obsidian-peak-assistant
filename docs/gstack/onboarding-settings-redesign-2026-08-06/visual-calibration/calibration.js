const STORAGE_KEY = "peak-settings-visual-calibration-v1";

const buttons = [...document.querySelectorAll("[data-reference] [data-aspect]")];
const noneButton = document.querySelector("[data-none]");
const summary = document.querySelector("[data-summary]");
const copyButton = document.querySelector("[data-copy]");
const clearButton = document.querySelector("[data-clear]");

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { picks: {}, none: false };
  } catch {
    return { picks: {}, none: false };
  }
}

let state = readState();

function selectedSummary() {
  if (state.none) return "这些真实产品参考也全部不喜欢，需要扩大视觉范围。";

  const lines = Object.entries(state.picks)
    .filter(([, aspects]) => aspects.length > 0)
    .map(([name, aspects]) => `${name}（${aspects.join("、")}）`);

  if (lines.length === 0) return "还没有选择。只点一个局部也可以。";
  return `我比较喜欢：${lines.join("；")}。`;
}

function render() {
  for (const button of buttons) {
    const reference = button.closest("[data-reference]").dataset.reference;
    const aspect = button.dataset.aspect;
    const selected = state.picks[reference]?.includes(aspect) ?? false;
    button.setAttribute("aria-pressed", String(selected));
  }

  noneButton.setAttribute("aria-pressed", String(state.none));
  summary.textContent = selectedSummary();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    const reference = button.closest("[data-reference]").dataset.reference;
    const aspect = button.dataset.aspect;
    const current = new Set(state.picks[reference] ?? []);

    if (current.has(aspect)) current.delete(aspect);
    else current.add(aspect);

    state.picks[reference] = [...current];
    state.none = false;
    render();
  });
}

noneButton.addEventListener("click", () => {
  state = { picks: {}, none: !state.none };
  render();
});

clearButton.addEventListener("click", () => {
  state = { picks: {}, none: false };
  render();
});

copyButton.addEventListener("click", async () => {
  const text = selectedSummary();

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }

  const original = copyButton.textContent;
  copyButton.textContent = "已复制";
  window.setTimeout(() => { copyButton.textContent = original; }, 1200);
});

render();
