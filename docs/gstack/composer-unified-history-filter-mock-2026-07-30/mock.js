const state = {
  source: 'all',
  effect: new Set(),
  status: new Set(),
  target: new Set(),
};

const labels = {
  effect: {
    rewrite: '改写',
    insert: '新增',
    transform: '结构调整',
  },
  status: {
    pending: '待审阅',
    'not-adopted': '未采用',
    accepted: '已采用',
  },
  target: {
    block: '整段',
    unit: '列表项',
    selection: '文本选区',
  },
};

const allRows = [...document.querySelectorAll('.history-row')];
const popover = document.querySelector('#filter-popover');
const moreFilter = document.querySelector('#more-filter');
const activeFilters = document.querySelector('#active-filters');
const advancedCount = document.querySelector('#advanced-count');
const resultHint = document.querySelector('#result-hint');
const visibleCount = document.querySelector('#visible-count');
const totalCount = document.querySelector('#total-count');
const emptyState = document.querySelector('#empty-state');

function advancedFilterCount() {
  return state.effect.size + state.status.size + state.target.size;
}

function rowMatches(row) {
  if (state.source !== 'all' && row.dataset.source !== state.source) return false;
  if (state.effect.size > 0 && !state.effect.has(row.dataset.effect)) return false;
  if (state.status.size > 0 && !state.status.has(row.dataset.status)) return false;
  if (state.target.size > 0 && !state.target.has(row.dataset.target)) return false;
  return true;
}

function renderRows() {
  let count = 0;
  allRows.forEach((row) => {
    const matches = rowMatches(row);
    row.hidden = !matches;
    if (matches) count += 1;
  });
  resultHint.textContent = `示例中显示 ${count} 条`;
  visibleCount.textContent = `${count} 条`;
  totalCount.textContent = state.source === 'all' && advancedFilterCount() === 0
    ? '17 条活动'
    : `当前 ${count} 条`;
  emptyState.hidden = count > 0;
}

function renderAdvancedFilters() {
  const count = advancedFilterCount();
  advancedCount.hidden = count === 0;
  advancedCount.textContent = String(count);
  moreFilter.classList.toggle('has-filter', count > 0);
  activeFilters.replaceChildren();

  Object.entries(labels).forEach(([group, groupLabels]) => {
    state[group].forEach((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'active-filter';
      chip.dataset.group = group;
      chip.dataset.value = value;
      chip.innerHTML = `${groupLabels[value]}<svg><use href="#i-x"/></svg>`;
      chip.addEventListener('click', () => {
        state[group].delete(value);
        const option = document.querySelector(
          `[data-filter-group="${group}"][data-filter-value="${value}"]`,
        );
        option?.classList.remove('is-selected');
        render();
      });
      activeFilters.append(chip);
    });
  });
  activeFilters.hidden = count === 0;
}

function render() {
  renderAdvancedFilters();
  renderRows();
}

function setPopover(open) {
  popover.classList.toggle('is-open', open);
  moreFilter.classList.toggle('is-open', open);
  moreFilter.setAttribute('aria-expanded', String(open));
}

document.querySelectorAll('.source-filter').forEach((button) => {
  button.addEventListener('click', () => {
    state.source = button.dataset.source;
    document.querySelectorAll('.source-filter').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });
    render();
  });
});

document.querySelectorAll('[data-filter-group]').forEach((button) => {
  button.addEventListener('click', () => {
    const group = button.dataset.filterGroup;
    const value = button.dataset.filterValue;
    if (state[group].has(value)) state[group].delete(value);
    else state[group].add(value);
    button.classList.toggle('is-selected', state[group].has(value));
    render();
  });
});

moreFilter.addEventListener('click', () => {
  setPopover(!popover.classList.contains('is-open'));
});

document.querySelector('#close-filter').addEventListener('click', () => setPopover(false));
document.querySelector('#done-filter').addEventListener('click', () => setPopover(false));
document.querySelector('#clear-filter').addEventListener('click', () => {
  state.effect.clear();
  state.status.clear();
  state.target.clear();
  document.querySelectorAll('[data-filter-group]').forEach((button) => {
    button.classList.remove('is-selected');
  });
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setPopover(false);
});

render();
