const records = [
  { id: 'r-01', company: 'Halcyon', domain: 'halcyon.dev', role: 'Senior Engineer', stage: 'Interview', stageKind: 'interview', workMode: 'Remote', location: 'Auckland', applied: 'Jul 22', next: 'Fri 10:30', fit: 92, color: 'lilac', note: 'Platform ownership · TypeScript' },
  { id: 'r-02', company: 'Orbit', domain: 'orbit.nz', role: 'Platform Engineer', stage: 'Replied', stageKind: 'replied', workMode: 'Hybrid', location: 'Wellington', applied: 'Jul 21', next: 'Aug 2', fit: 88, color: 'blue', note: 'Distributed systems · AWS' },
  { id: 'r-03', company: 'Northstar', domain: 'northstar.ai', role: 'Staff Engineer', stage: 'Applied', stageKind: 'applied', workMode: 'Remote', location: 'Auckland', applied: 'Jul 20', next: 'Follow up', fit: 84, color: 'green', note: 'AI infrastructure · React' },
  { id: 'r-04', company: 'Koru Labs', domain: 'korulabs.co.nz', role: 'Full-stack Engineer', stage: 'Follow up', stageKind: 'followup', workMode: 'Remote', location: 'Christchurch', applied: 'Jul 18', next: 'Today', fit: 81, color: 'orange', note: 'Product engineering · Node.js' },
  { id: 'r-05', company: 'Sundial', domain: 'sundial.app', role: 'Backend Engineer', stage: 'Applied', stageKind: 'applied', workMode: 'On-site', location: 'Auckland', applied: 'Jul 17', next: 'Aug 1', fit: 76, color: 'red', note: 'Payments · Go' },
  { id: 'r-06', company: 'Tide', domain: 'tide.studio', role: 'Product Engineer', stage: 'Interview', stageKind: 'interview', workMode: 'Remote', location: 'Wellington', applied: 'Jul 15', next: 'Thu 15:00', fit: 90, color: 'blue', note: 'Collaboration · TypeScript' },
  { id: 'r-07', company: 'Fern', domain: 'fern.systems', role: 'Senior Developer', stage: 'Replied', stageKind: 'replied', workMode: 'Hybrid', location: 'Christchurch', applied: 'Jul 13', next: 'Aug 3', fit: 79, color: 'green', note: 'Developer tools · Python' },
  { id: 'r-08', company: 'Aster', domain: 'aster.io', role: 'Software Engineer', stage: 'Offer', stageKind: 'offer', workMode: 'Remote', location: 'Auckland', applied: 'Jul 10', next: 'Review offer', fit: 94, color: 'lilac', note: 'Knowledge tools · Electron' },
];

const viewMeta = {
  table: { title: 'Table', description: '可编辑主视图 · 24 records', icon: 'i-table', phase: '首版闭环', footer: 'Table 可写 · 变更必须经过 transaction commit' },
  chart: { title: 'Chart', description: '只读派生视图 · revision 12', icon: 'i-chart', phase: '首版闭环', footer: 'Chart 只读 · 与 Table 共享 Dataset revision' },
  board: { title: 'Board', description: '按申请阶段分组 · View adapter 概念', icon: 'i-board', phase: '后续阶段', footer: 'Board 概念视图 · 不属于首版交付范围' },
  gallery: { title: 'Gallery', description: '公司与岗位卡片 · View adapter 概念', icon: 'i-gallery', phase: '后续阶段', footer: 'Gallery 概念视图 · 是否实现由真实工作流决定' },
  calendar: { title: 'Calendar', description: '面试与跟进日期 · View adapter 概念', icon: 'i-calendar', phase: '后续阶段', footer: 'Calendar 概念视图 · 日期只是 Dataset 字段投影' },
  map: { title: 'Map', description: '按岗位位置聚合 · Spatial adapter 概念', icon: 'i-map', phase: '后续阶段', footer: 'Map 概念视图 · 位置数据仍由 Dataset 拥有' },
  globe: { title: '3D globe', description: 'Spatial adapter 实验方向', icon: 'i-globe', phase: '实验', footer: '3D globe 仅为 adapter 实验 · 不进入核心 view 清单' },
};

const state = {
  view: 'table',
  remoteOnly: false,
  query: '',
  selectedRecordId: null,
  receiptCreated: false,
};

const stage = document.querySelector('#view-stage');
const activeFilterRow = document.querySelector('#active-filter-row');
const remoteFilterButton = document.querySelector('#remote-filter');
const recordSearch = document.querySelector('#record-search');
const planCard = document.querySelector('#plan-card');
const runCount = document.querySelector('#run-count');
const toast = document.querySelector('#toast');

function icon(id) {
  return `<svg><use href="#${id}"/></svg>`;
}

function filteredRecords() {
  const query = state.query.trim().toLowerCase();
  return records.filter((record) => {
    if (state.remoteOnly && record.workMode !== 'Remote') return false;
    if (!query) return true;
    return [record.company, record.role, record.stage, record.location, record.workMode]
      .some((value) => value.toLowerCase().includes(query));
  });
}

function phaseBanner() {
  if (state.view === 'table' || state.view === 'chart') return '';
  return `
    <section class="concept-banner">
      ${icon('i-info')}
      <span>
        <strong>后续 View adapter 概念</strong>
        <small>这张视图用于验证同一 Dataset 的投影方向，不代表已实现或进入首版范围。</small>
      </span>
    </section>
  `;
}

function renderTable() {
  const visible = filteredRecords();
  if (visible.length === 0) {
    stage.innerHTML = `
      <section class="empty-records">
        ${icon('i-search')}
        <strong>没有符合条件的 records</strong>
        <span>清除搜索或筛选后再试。</span>
      </section>
    `;
    return;
  }

  const rows = visible.map((record) => `
    <tr data-record-id="${record.id}" class="${state.selectedRecordId === record.id ? 'is-selected' : ''}">
      <td><input type="checkbox" aria-label="选择 ${record.company}"></td>
      <td>
        <span class="company-cell">
          <span class="company-avatar ${record.color}">${record.company[0]}</span>
          <span><strong>${record.company}</strong><small>${record.domain}</small></span>
        </span>
      </td>
      <td>${record.role}</td>
      <td><span class="stage-pill ${record.stageKind}">${record.stage}</span></td>
      <td><span class="work-pill">${record.workMode}</span></td>
      <td>${record.location}</td>
      <td>${record.next}</td>
      <td><span class="score-pill ${record.fit < 80 ? 'mid' : ''}">${record.fit}</span></td>
    </tr>
  `).join('');

  stage.innerHTML = `
    <section class="table-shell">
      <table class="record-table">
        <colgroup><col><col><col><col><col><col><col><col></colgroup>
        <thead>
          <tr>
            <th><input type="checkbox" aria-label="选择所有 records"></th>
            <th>Company</th>
            <th>Role</th>
            <th>Stage</th>
            <th>Work mode</th>
            <th>Location</th>
            <th>Next step</th>
            <th>Fit</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;

  stage.querySelectorAll('tbody tr').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.matches('input')) return;
      state.selectedRecordId = row.dataset.recordId;
      renderTable();
    });
  });
}

function renderChart() {
  stage.innerHTML = `
    <section class="chart-view">
      <div class="kpi-grid">
        <article class="kpi-card"><span>Applications</span><strong>24</strong><small>本月 +9</small></article>
        <article class="kpi-card"><span>Replies</span><strong>8</strong><small>回复率 33%</small></article>
        <article class="kpi-card"><span>Interviews</span><strong>3</strong><small>本周 +2</small></article>
        <article class="kpi-card"><span>Average fit</span><strong>84</strong><small>高于上月 5 分</small></article>
      </div>
      <div class="chart-layout">
        <article class="chart-card">
          <header class="card-heading">
            <span><strong>申请漏斗</strong><small>同一 Dataset revision 12 的只读投影</small></span>
            <em>最近 6 周</em>
          </header>
          <svg class="funnel-chart" viewBox="0 0 540 210" role="img" aria-label="最近六周的申请与回复柱状图">
            <line class="chart-grid-line" x1="42" y1="30" x2="520" y2="30"/>
            <line class="chart-grid-line" x1="42" y1="75" x2="520" y2="75"/>
            <line class="chart-grid-line" x1="42" y1="120" x2="520" y2="120"/>
            <line class="chart-grid-line" x1="42" y1="165" x2="520" y2="165"/>
            <text class="chart-axis-label" x="10" y="34">12</text>
            <text class="chart-axis-label" x="15" y="79">8</text>
            <text class="chart-axis-label" x="15" y="124">4</text>
            <text class="chart-axis-label" x="19" y="169">0</text>
            <rect class="chart-bar" x="65" y="132" width="25" height="33" rx="3"/>
            <rect class="chart-bar secondary" x="93" y="154" width="25" height="11" rx="3"/>
            <rect class="chart-bar" x="140" y="109" width="25" height="56" rx="3"/>
            <rect class="chart-bar secondary" x="168" y="143" width="25" height="22" rx="3"/>
            <rect class="chart-bar" x="215" y="87" width="25" height="78" rx="3"/>
            <rect class="chart-bar secondary" x="243" y="132" width="25" height="33" rx="3"/>
            <rect class="chart-bar" x="290" y="64" width="25" height="101" rx="3"/>
            <rect class="chart-bar secondary" x="318" y="120" width="25" height="45" rx="3"/>
            <rect class="chart-bar" x="365" y="42" width="25" height="123" rx="3"/>
            <rect class="chart-bar secondary" x="393" y="109" width="25" height="56" rx="3"/>
            <rect class="chart-bar" x="440" y="76" width="25" height="89" rx="3"/>
            <rect class="chart-bar secondary" x="468" y="132" width="25" height="33" rx="3"/>
            <text class="chart-axis-label" x="72" y="188">W1</text>
            <text class="chart-axis-label" x="147" y="188">W2</text>
            <text class="chart-axis-label" x="222" y="188">W3</text>
            <text class="chart-axis-label" x="297" y="188">W4</text>
            <text class="chart-axis-label" x="372" y="188">W5</text>
            <text class="chart-axis-label" x="447" y="188">W6</text>
          </svg>
        </article>
        <article class="distribution-card">
          <header class="card-heading">
            <span><strong>阶段分布</strong><small>24 records</small></span>
          </header>
          <div class="distribution-list">
            <div class="distribution-row"><span>Applied</span><span class="distribution-bar"><span style="width: 72%"></span></span><b>11</b></div>
            <div class="distribution-row"><span>Replied</span><span class="distribution-bar"><span style="width: 45%"></span></span><b>6</b></div>
            <div class="distribution-row"><span>Interview</span><span class="distribution-bar"><span style="width: 28%"></span></span><b>4</b></div>
            <div class="distribution-row"><span>Offer</span><span class="distribution-bar"><span style="width: 12%"></span></span><b>1</b></div>
          </div>
        </article>
        <article class="source-card">
          <header class="card-heading">
            <span><strong>渠道回复率</strong><small>由同一 Dataset 字段聚合，不保存第二份统计数据</small></span>
          </header>
          <div class="source-columns">
            <div class="source-metric"><span>Referral</span><strong>58%</strong><small>7 applications</small></div>
            <div class="source-metric"><span>Company site</span><strong>35%</strong><small>9 applications</small></div>
            <div class="source-metric"><span>LinkedIn</span><strong>25%</strong><small>6 applications</small></div>
            <div class="source-metric"><span>Recruiter</span><strong>50%</strong><small>2 applications</small></div>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderBoard() {
  const groups = [
    ['Applied', records.filter((record) => record.stageKind === 'applied')],
    ['Replied', records.filter((record) => record.stageKind === 'replied' || record.stageKind === 'followup')],
    ['Interview', records.filter((record) => record.stageKind === 'interview')],
    ['Offer', records.filter((record) => record.stageKind === 'offer')],
  ];
  const columns = groups.map(([label, items]) => `
    <section class="board-column">
      <header><span>${label}</span><em>${items.length}</em></header>
      ${items.map((record) => `
        <button type="button" class="board-card">
          <header><span class="company-avatar ${record.color}">${record.company[0]}</span><span><strong>${record.company}</strong><small>${record.role}</small></span></header>
          <span>${record.note}</span>
          <footer><span>${record.workMode}</span><strong>${record.fit}</strong></footer>
        </button>
      `).join('')}
    </section>
  `).join('');
  stage.innerHTML = `${phaseBanner()}<section class="board-grid">${columns}</section>`;
}

function renderGallery() {
  const cards = records.slice(0, 6).map((record) => `
    <article class="gallery-card">
      <div class="gallery-cover">${record.company[0]}</div>
      <div class="gallery-card-body">
        <header><span><strong>${record.company}</strong><small>${record.role}</small></span><span class="score-pill">${record.fit}</span></header>
        <p>${record.note}</p>
        <footer><span>${record.location} · ${record.workMode}</span><span class="stage-pill ${record.stageKind}">${record.stage}</span></footer>
      </div>
    </article>
  `).join('');
  stage.innerHTML = `${phaseBanner()}<section class="gallery-grid">${cards}</section>`;
}

function renderCalendar() {
  const days = [
    ['27', ''], ['28', ''], ['29', ''], ['30', ''], ['31', ''], ['1', 'outside'], ['2', 'outside'],
    ['3', ''], ['4', ''], ['5', ''], ['6', ''], ['7', ''], ['8', ''], ['9', ''],
    ['10', ''], ['11', ''], ['12', ''], ['13', ''], ['14', ''], ['15', ''], ['16', ''],
    ['17', ''], ['18', ''], ['19', ''], ['20', ''], ['21', ''], ['22', ''], ['23', ''],
    ['24', ''], ['25', ''], ['26', ''], ['27', ''], ['28', ''], ['29', ''], ['30', ''],
  ];
  const eventMap = {
    4: '<span class="calendar-event">Follow up · Koru</span>',
    11: '<span class="calendar-event green">Interview · Tide</span>',
    12: '<span class="calendar-event green">Interview · Halcyon</span>',
    16: '<span class="calendar-event">Offer review · Aster</span>',
    24: '<span class="calendar-event">Follow up · Northstar</span>',
  };
  const cells = days.map(([day, outside], index) => `<div class="calendar-day ${outside ? 'is-outside' : ''}">${day}${eventMap[index] ?? ''}</div>`).join('');
  stage.innerHTML = `
    ${phaseBanner()}
    <section class="calendar-shell">
      <header class="calendar-head"><strong>2026 年 7 月</strong><span><button class="icon-button compact" type="button" aria-label="上个月">${icon('i-chevron')}</button><button class="icon-button compact" type="button" aria-label="下个月">${icon('i-chevron')}</button></span></header>
      <div class="calendar-grid">
        ${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<div class="calendar-weekday">周${day}</div>`).join('')}
        ${cells}
      </div>
    </section>
  `;
}

function renderMap() {
  stage.innerHTML = `
    ${phaseBanner()}
    <section class="map-shell">
      <div class="map-canvas">
        <div class="map-land"></div>
        <span class="map-pin auckland">Auckland <strong>12</strong></span>
        <span class="map-pin wellington">Wellington <strong>7</strong></span>
        <span class="map-pin christchurch">Christchurch <strong>5</strong></span>
      </div>
      <aside class="map-list">
        <header><strong>岗位位置</strong><small>基于 Location 字段聚合</small></header>
        <div class="location-row"><span>Auckland</span><small>12</small></div>
        <div class="location-row"><span>Wellington</span><small>7</small></div>
        <div class="location-row"><span>Christchurch</span><small>5</small></div>
      </aside>
    </section>
  `;
}

function renderGlobe() {
  stage.innerHTML = `
    <section class="globe-concept">
      <div class="globe-orbit">${icon('i-globe')}</div>
      <em>Spatial adapter 实验</em>
      <strong>3D globe 不进入 Peak Sheet 核心视图</strong>
      <p>如果旅行、资产或全球研究工作流证明需要，它可以作为独立 adapter 读取地理字段；Dataset、权限和刷新合同仍由 Peak Sheet 核心拥有。</p>
    </section>
  `;
}

function renderCurrentView() {
  const meta = viewMeta[state.view];
  document.querySelector('#current-view-title').textContent = meta.title;
  document.querySelector('#current-view-description').textContent = meta.description;
  document.querySelector('#current-view-icon use').setAttribute('href', `#${meta.icon}`);
  const phase = document.querySelector('#current-view-phase');
  phase.textContent = meta.phase;
  phase.classList.toggle('is-later', state.view !== 'table' && state.view !== 'chart');
  document.querySelector('#footer-note').textContent = meta.footer;

  document.querySelectorAll('.view-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.view);
  });

  const renderers = {
    table: renderTable,
    chart: renderChart,
    board: renderBoard,
    gallery: renderGallery,
    calendar: renderCalendar,
    map: renderMap,
    globe: renderGlobe,
  };
  renderers[state.view]();
}

function setView(view) {
  state.view = view;
  renderCurrentView();
  closeViewMenu();
}

function setRemoteFilter(enabled) {
  state.remoteOnly = enabled;
  remoteFilterButton.setAttribute('aria-pressed', String(enabled));
  activeFilterRow.hidden = !enabled;
  const count = records.filter((record) => record.workMode === 'Remote').length;
  document.querySelector('#filter-result-count').textContent = `${count} / 24 records`;
  if (state.view === 'table') renderTable();
}

function openViewMenu() {
  document.querySelector('#view-menu').hidden = false;
  document.querySelector('#add-view').setAttribute('aria-expanded', 'true');
}

function closeViewMenu() {
  document.querySelector('#view-menu').hidden = true;
  document.querySelector('#add-view').setAttribute('aria-expanded', 'false');
}

function showToast() {
  toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function setPanelTab(tab) {
  document.querySelectorAll('[data-panel-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.panelTab === tab);
  });
  document.querySelector('#ask-panel').hidden = tab !== 'ask';
  document.querySelector('#run-panel').hidden = tab !== 'run';
}

document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.querySelector('#add-view').addEventListener('click', () => {
  if (document.querySelector('#view-menu').hidden) openViewMenu();
  else closeViewMenu();
});

document.querySelector('#close-view-menu').addEventListener('click', closeViewMenu);
document.querySelectorAll('[data-menu-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.menuView));
});

document.querySelectorAll('[data-filter-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const preset = button.dataset.filterPreset;
    if (preset === 'remote') {
      setView('table');
      setRemoteFilter(true);
      return;
    }
    if (preset === 'interview') {
      state.query = 'Interview';
      recordSearch.value = 'Interview';
      setView('table');
      renderTable();
      return;
    }
    state.query = 'Follow up';
    recordSearch.value = 'Follow up';
    setView('table');
    renderTable();
  });
});

remoteFilterButton.addEventListener('click', () => setRemoteFilter(!state.remoteOnly));
document.querySelector('#remote-filter-chip').addEventListener('click', () => setRemoteFilter(false));

recordSearch.addEventListener('input', () => {
  state.query = recordSearch.value;
  if (state.view === 'table') renderTable();
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('#peak-prompt').value = button.dataset.prompt;
    document.querySelector('#peak-prompt').focus();
  });
});

document.querySelector('#focus-ask').addEventListener('click', () => {
  setPanelTab('ask');
  document.querySelector('#peak-prompt').focus();
});

document.querySelector('#generate-plan').addEventListener('click', () => {
  planCard.hidden = false;
  planCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.querySelector('#cancel-plan').addEventListener('click', () => {
  planCard.hidden = true;
});

document.querySelector('#accept-plan').addEventListener('click', () => {
  state.receiptCreated = true;
  planCard.hidden = true;
  runCount.textContent = '1';
  document.querySelector('#run-empty').hidden = true;
  document.querySelector('#run-receipt').hidden = false;
  document.querySelector('#footer-state').textContent = 'Dataset revision 12 · recipe saved';
  setView('table');
  setRemoteFilter(true);
  showToast();
});

document.querySelectorAll('[data-panel-tab]').forEach((button) => {
  button.addEventListener('click', () => setPanelTab(button.dataset.panelTab));
});

document.querySelector('#refresh-dataset').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.querySelector('svg').style.animation = 'spin .7s linear infinite';
  window.setTimeout(() => {
    button.disabled = false;
    button.querySelector('svg').style.animation = '';
    document.querySelector('#refresh-time').textContent = '刚刚刷新';
    document.querySelector('#footer-state').textContent = state.receiptCreated
      ? 'Dataset revision 13 · recipe replayed'
      : 'Dataset revision 13';
    showToast();
  }, 650);
});

document.querySelector('#show-data-info').addEventListener('click', () => {
  document.querySelector('#data-boundary').hidden = false;
});

document.querySelector('#close-data-info').addEventListener('click', () => {
  document.querySelector('#data-boundary').hidden = true;
});

function setMobileOpen(open) {
  document.querySelector('#mobile-overlay').hidden = !open;
}

document.querySelector('#open-mobile').addEventListener('click', () => setMobileOpen(true));
document.querySelector('#close-mobile').addEventListener('click', () => setMobileOpen(false));
document.querySelector('#close-mobile-backdrop').addEventListener('click', () => setMobileOpen(false));

document.querySelectorAll('[data-mobile-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-mobile-view]').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelector('#mobile-summary').hidden = button.dataset.mobileView !== 'summary';
    document.querySelector('#mobile-records').hidden = button.dataset.mobileView !== 'records';
  });
});

document.querySelector('.approve-mobile').addEventListener('click', (event) => {
  event.currentTarget.textContent = '已接受';
  event.currentTarget.disabled = true;
  showToast();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeViewMenu();
  document.querySelector('#data-boundary').hidden = true;
  setMobileOpen(false);
});

const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.append(style);

renderCurrentView();
