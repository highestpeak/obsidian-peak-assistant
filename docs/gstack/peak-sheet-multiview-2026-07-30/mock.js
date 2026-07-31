const records = [
  {
    id: 'aster',
    company: 'Aster Labs',
    role: 'Senior Product Engineer',
    stage: 'Offer',
    stageKey: 'offer',
    workMode: 'Hybrid',
    location: 'Auckland',
    applied: '2026-07-03',
    salary: '145–165k',
    fit: 94,
    wait: 2,
    next: '薪资与成长路径比较',
    urgency: true,
    source: 'Referral',
    note: '周五前回复，重点确认 equity、年度调薪与远程政策；如果远程只适用于奥克兰，需要继续核对每季度到岗频率、差旅承担方式，以及试用期结束后的调整空间。',
    color: 'green',
  },
  {
    id: 'tide',
    company: 'Tide Systems',
    role: 'Staff Frontend Engineer',
    stage: '面试中',
    stageKey: 'interview',
    workMode: 'Remote',
    location: 'New Zealand',
    applied: '2026-07-08',
    salary: '150–175k',
    fit: 91,
    wait: 1,
    next: '明天 10:30 系统设计',
    urgency: true,
    source: 'Company site',
    note: '准备 performance 与 design system 案例。',
    color: 'teal',
  },
  {
    id: 'fern',
    company: 'Fern Studio',
    role: 'Product Engineer',
    stage: '面试中',
    stageKey: 'interview',
    workMode: 'Hybrid',
    location: 'Wellington',
    applied: '2026-07-11',
    salary: '135–155k',
    fit: 88,
    wait: 3,
    next: '周四文化面试',
    urgency: true,
    source: 'Referral',
    note: '复盘产品判断与跨职能协作故事。',
    color: 'purple',
  },
  {
    id: 'halcyon',
    company: 'Halcyon Health',
    role: 'Senior Software Engineer',
    stage: '面试中',
    stageKey: 'interview',
    workMode: 'Remote',
    location: 'APAC',
    applied: '2026-06-28',
    salary: '140–160k',
    fit: 84,
    wait: 5,
    next: '等待终面反馈',
    urgency: false,
    source: 'LinkedIn',
    note: '上周完成终面，招聘经理预计五个工作日内反馈。',
    color: 'blue',
  },
  {
    id: 'koru',
    company: 'Koru Digital',
    role: 'Platform Engineer',
    stage: '待跟进',
    stageKey: 'followup',
    workMode: 'Remote',
    location: 'New Zealand',
    applied: '2026-07-01',
    salary: '135–155k',
    fit: 86,
    wait: 11,
    next: '发送二次跟进',
    urgency: true,
    source: 'Company site',
    note: '职位仍开放；准备一封包含平台迁移案例的短跟进。',
    color: 'orange',
  },
  {
    id: 'northstar',
    company: 'Northstar Energy',
    role: 'Full-stack Engineer',
    stage: '待跟进',
    stageKey: 'followup',
    workMode: 'Hybrid',
    location: 'Auckland',
    applied: '2026-07-06',
    salary: '125–145k',
    fit: 82,
    wait: 8,
    next: '联系内部推荐人',
    urgency: true,
    source: 'Referral',
    note: '确认岗位是否仍在当前团队，并补充领域背景。',
    color: 'red',
  },
  {
    id: 'harbour',
    company: 'Harbour Cloud',
    role: 'Frontend Engineer',
    stage: '待跟进',
    stageKey: 'followup',
    workMode: 'On-site',
    location: 'Auckland',
    applied: '2026-07-09',
    salary: '120–140k',
    fit: 76,
    wait: 7,
    next: '观察到周五',
    urgency: false,
    source: 'LinkedIn',
    note: '匹配度一般，暂不投入额外准备时间。',
    color: 'blue',
  },
  {
    id: 'alpine',
    company: 'Alpine Data',
    role: 'Senior UI Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Remote',
    location: 'Australia / NZ',
    applied: '2026-07-16',
    salary: '145–170k',
    fit: 90,
    wait: 4,
    next: '等待首轮筛选',
    urgency: false,
    source: 'Company site',
    note: 'JD 对数据可视化与复杂前端状态管理要求很高。',
    color: 'purple',
  },
  {
    id: 'rimu',
    company: 'Rimu Finance',
    role: 'Product-focused Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Hybrid',
    location: 'Auckland',
    applied: '2026-07-18',
    salary: '130–150k',
    fit: 85,
    wait: 2,
    next: '等待招聘方回复',
    urgency: false,
    source: 'Recruiter',
    note: '金融产品经验较弱，但产品工程能力高度匹配。',
    color: 'green',
  },
  {
    id: 'lattice',
    company: 'Lattice Works',
    role: 'Design Systems Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Remote',
    location: 'APAC',
    applied: '2026-07-19',
    salary: '140–165k',
    fit: 89,
    wait: 1,
    next: '整理组件系统案例',
    urgency: false,
    source: 'Company site',
    note: '作品集需要突出组件 API、可访问性与跨团队采用。',
    color: 'teal',
  },
  {
    id: 'orbit',
    company: 'Orbit Commerce',
    role: 'Senior Web Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Remote',
    location: 'Australia / NZ',
    applied: '2026-07-17',
    salary: '130–155k',
    fit: 80,
    wait: 3,
    next: '等待筛选',
    urgency: false,
    source: 'LinkedIn',
    note: '技术栈匹配，业务方向吸引力一般。',
    color: 'orange',
  },
  {
    id: 'moss',
    company: 'Moss Robotics',
    role: 'Software Engineer',
    stage: '已结束',
    stageKey: 'ended',
    workMode: 'On-site',
    location: 'Christchurch',
    applied: '2026-06-22',
    salary: '115–135k',
    fit: 72,
    wait: 16,
    next: '归档复盘',
    urgency: false,
    source: 'Company site',
    note: '地点和岗位方向不匹配，保留面试反馈用于复盘。',
    color: 'red',
  },
  {
    id: 'cascade',
    company: 'Cascade AI',
    role: 'Senior Product Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Remote',
    location: 'Australia / NZ',
    applied: '2026-07-20',
    salary: '150–180k',
    fit: 92,
    wait: 1,
    next: '补充 AI workflow 案例',
    urgency: false,
    source: 'Company site',
    note: '产品方向匹配，申请材料需要突出 agent workflow 设计。',
    color: 'teal',
  },
  {
    id: 'southern',
    company: 'Southern Grid',
    role: 'Platform Product Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Hybrid',
    location: 'Wellington',
    applied: '2026-07-20',
    salary: '135–160k',
    fit: 83,
    wait: 1,
    next: '等待技术筛选',
    urgency: false,
    source: 'Referral',
    note: '基础设施领域陌生，但平台产品经验匹配。',
    color: 'blue',
  },
  {
    id: 'pohutukawa',
    company: 'Pōhutukawa Tech',
    role: 'Frontend Platform Engineer',
    stage: '待跟进',
    stageKey: 'followup',
    workMode: 'Remote',
    location: 'New Zealand',
    applied: '2026-07-10',
    salary: '140–160k',
    fit: 81,
    wait: 9,
    next: '周五后再跟进',
    urgency: false,
    source: 'LinkedIn',
    note: '职位描述偏平台，先观察招聘团队是否更新状态。',
    color: 'green',
  },
  {
    id: 'meridian',
    company: 'Meridian Health',
    role: 'Senior Full-stack Engineer',
    stage: '面试中',
    stageKey: 'interview',
    workMode: 'Hybrid',
    location: 'Auckland',
    applied: '2026-07-02',
    salary: '130–155k',
    fit: 79,
    wait: 6,
    next: '准备领域系统设计',
    urgency: false,
    source: 'Recruiter',
    note: '需要补足 healthcare 数据边界和审计要求。',
    color: 'purple',
  },
  {
    id: 'signal',
    company: 'Signal Works',
    role: 'Design Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Remote',
    location: 'APAC',
    applied: '2026-07-21',
    salary: '125–150k',
    fit: 87,
    wait: 0,
    next: '发送作品集补充',
    urgency: false,
    source: 'Company site',
    note: '岗位强调视觉系统与工程交付的结合。',
    color: 'orange',
  },
  {
    id: 'atlas',
    company: 'Atlas Research',
    role: 'Research Tools Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'On-site',
    location: 'Auckland',
    applied: '2026-07-14',
    salary: '120–145k',
    fit: 78,
    wait: 5,
    next: '等待首轮回复',
    urgency: false,
    source: 'Referral',
    note: '研究工具方向有吸引力，但现场办公比例较高。',
    color: 'blue',
  },
  {
    id: 'ember',
    company: 'Ember Systems',
    role: 'Senior UI Engineer',
    stage: '已结束',
    stageKey: 'ended',
    workMode: 'Remote',
    location: 'Australia',
    applied: '2026-06-18',
    salary: '135–155k',
    fit: 74,
    wait: 18,
    next: '记录拒信反馈',
    urgency: false,
    source: 'LinkedIn',
    note: '团队需要更强的 B2B analytics 经验。',
    color: 'red',
  },
  {
    id: 'quartz',
    company: 'Quartz Labs',
    role: 'Product-minded Engineer',
    stage: '已申请',
    stageKey: 'applied',
    workMode: 'Hybrid',
    location: 'Christchurch',
    applied: '2026-07-15',
    salary: '118–142k',
    fit: 77,
    wait: 5,
    next: '评估搬迁成本',
    urgency: false,
    source: 'Company site',
    note: '产品文化不错，需要权衡地点与薪资。',
    color: 'green',
  },
];

const skillSets = [
  ['Product Strategy', 'AI Agents', 'B2B SaaS'],
  ['React', 'System Design'],
  ['Product Engineering'],
  [],
  ['Platform', 'Cloud Migration', 'Observability'],
  ['Energy Domain', 'Full-stack'],
  ['React', 'Cloud'],
  ['Data Visualization', 'Design'],
  [],
  ['Design Systems', 'Accessibility', 'React'],
  ['Commerce'],
  ['Robotics', 'C++'],
  ['AI Agents', 'Product'],
  ['Platform', 'Infrastructure'],
  ['React', 'Tooling', 'TypeScript'],
  ['Healthcare', 'Backend'],
  ['Design Engineering'],
  [],
  ['Analytics', 'B2B'],
  ['Product', 'Web'],
];

const interviewSlots = {
  aster: '07/31 · 15:00',
  tide: '08/01 · 10:30',
  fern: '08/02 · 14:00',
  halcyon: '待确认',
  meridian: '08/04 · 11:00',
};

const attachmentSets = [
  ['offer-comparison.md'],
  ['job-description.pdf', 'system-design.md'],
  [],
  ['final-interview-feedback.md'],
  ['follow-up-draft.md', 'migration-case-study.pdf', 'cover-letter.pdf'],
  [],
  ['job-description.pdf'],
  ['portfolio-notes.md', 'job-description.pdf'],
  [],
  ['design-system-case-study.pdf'],
  ['job-description.pdf', 'company-notes.md'],
  ['rejection-feedback.md'],
  ['agent-workflow-case-study.pdf', 'cover-letter.pdf'],
  [],
  ['platform-notes.md'],
  ['healthcare-boundaries.md', 'system-design.md'],
  ['portfolio.pdf'],
  [],
  ['rejection-email.pdf'],
  ['relocation-notes.md'],
];

const progressByStage = {
  offer: 92,
  interview: 72,
  followup: 54,
  applied: 28,
  ended: 100,
};

function extendedFields(record) {
  const index = records.indexOf(record);
  return {
    skills: skillSets[index] ?? ['Product'],
    starred: record.fit >= 88 || record.stageKey === 'offer',
    attachments: attachmentSets[index] ?? [],
    interviewAt: interviewSlots[record.id] ?? null,
    progress: progressByStage[record.stageKey] ?? 0,
    jobLink: index % 6 === 3
      ? null
      : `careers.${record.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jobs/open-roles`,
    displayNote: index % 7 === 3 ? '' : record.note,
  };
}

function emptyCell(label = '空值') {
  return `<span class="cell-empty" title="${label}" aria-label="${label}">—</span>`;
}

function renderSkillTags(skills) {
  if (skills.length === 0) return emptyCell('未填写技能标签');
  const canShowTwo = skills.length > 1
    && skills[0].length + skills[1].length <= 20;
  const visible = skills.slice(0, canShowTwo ? 2 : 1);
  const remaining = skills.length - visible.length;
  const tags = visible
    .map((skill) => `<span class="skill-tag" title="${skill}"><span>${skill}</span></span>`)
    .join('');
  const overflow = remaining > 0
    ? `<span class="tag-overflow" title="另外 ${remaining} 个标签">+${remaining}</span>`
    : '';
  return `<span class="skill-tags" title="${skills.join(' · ')}">${tags}${overflow}</span>`;
}

function renderLink(value) {
  if (!value) return emptyCell('未填写链接');
  return `<span class="link-cell" title="${value}">${icon('i-link')}<span>${value}</span></span>`;
}

function renderAttachments(attachments) {
  if (attachments.length === 0) return emptyCell('没有附件');
  if (attachments.length === 1) {
    const [fileName] = attachments;
    return `<span class="attachment-cell" title="${fileName}">${icon('i-paperclip')}<span>${fileName}</span></span>`;
  }
  return `
    <span class="attachment-cell is-multiple" title="${attachments.join(' · ')}">
      <span class="attachment-stack" aria-hidden="true"><i></i><i></i></span>
      <span>${attachments.length} 个文件</span>
    </span>
  `;
}

function renderDateTime(value) {
  if (!value) return emptyCell('未安排面试时间');
  if (value === '待确认') return `<span class="datetime-state">${value}</span>`;
  return `<span class="datetime-value">${value}</span>`;
}

function renderNote(value, recordId) {
  if (!value) {
    return `<span class="cell-empty long-text-trigger" data-long-cell="${recordId}" role="button" tabindex="0" title="打开空备注单元格">—</span>`;
  }
  return `<span class="note-cell long-text-trigger" data-long-cell="${recordId}" role="button" tabindex="0" title="${value}">${value}</span>`;
}

const groupMeta = {
  offer: { label: 'Offer', order: 0, color: 'var(--green)' },
  interview: { label: '面试中', order: 1, color: 'var(--purple)' },
  followup: { label: '待跟进', order: 2, color: 'var(--amber)' },
  applied: { label: '已申请', order: 3, color: 'var(--blue)' },
  ended: { label: '已结束', order: 4, color: 'var(--red)' },
};

const state = {
  view: 'table',
  grouped: false,
  filtersVisible: true,
  statsVisible: true,
  query: '',
  priorityOnly: false,
  selectedId: null,
  activeLongTextId: null,
  longTextMode: 'truncate',
};

const stage = document.querySelector('#view-stage');
const workspace = document.querySelector('.workspace');
const filterLine = document.querySelector('#filter-line');
const searchInput = document.querySelector('#record-search');
const toast = document.querySelector('#toast');
const aiDrawer = document.querySelector('#ai-drawer');
const themeToggle = document.querySelector('#theme-toggle');
const formulaPanel = document.querySelector('#formula-panel');
const formulaBar = document.querySelector('#formula-bar');
const formatMenu = document.querySelector('#format-menu');
const conditionalPanel = document.querySelector('#conditional-panel');
const cellReader = document.querySelector('#cell-reader');
const activeCellName = document.querySelector('#active-cell-name');
const formulaInput = document.querySelector('#formula-input');
const formulaState = document.querySelector('.formula-state');
const formulaScope = document.querySelector('.formula-scope');
const defaultFormulaValue = formulaInput.value;
const defaultFormulaState = formulaState.innerHTML;
const defaultFormulaScope = formulaScope.textContent;

function icon(id) {
  return `<svg><use href="#${id}"/></svg>`;
}

function visibleRecords() {
  const query = state.query.trim().toLowerCase();
  return records.filter((record) => {
    if (state.priorityOnly && !(record.urgency && record.fit >= 80)) return false;
    if (!query) return true;
    const extra = extendedFields(record);
    return [
      record.company,
      record.role,
      record.stage,
      record.workMode,
      record.location,
      record.next,
      record.source,
      record.note,
      extra.jobLink,
      ...extra.skills,
    ]
      .filter((value) => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(query));
  });
}

function formatDate(value) {
  const [, month, day] = value.split('-');
  return `${month}/${day}`;
}

function renderFilterLine() {
  filterLine.hidden = !state.filtersVisible;
  if (!state.filtersVisible) return;
  const priorityChip = state.priorityOnly
    ? `<button type="button" id="remove-priority-filter">高价值待跟进 <svg><use href="#i-x"/></svg></button>`
    : '';
  const visible = visibleRecords().length;
  filterLine.innerHTML = `
    <span>当前条件</span>
    <button type="button">状态 ≠ 已归档 ${icon('i-x')}</button>
    <button type="button">申请日期 · 最近 90 天 ${icon('i-x')}</button>
    ${priorityChip}
    <span class="filter-result">显示 ${visible} 条记录</span>
  `;
  document.querySelector('#remove-priority-filter')?.addEventListener('click', () => {
    state.priorityOnly = false;
    renderFilterLine();
    renderCurrentView();
  });
}

function groupRows(groupKey, groupRecords) {
  const average = Math.round(groupRecords.reduce((sum, record) => sum + record.fit, 0) / groupRecords.length);
  const urgent = groupRecords.filter((record) => record.urgency).length;
  const rows = groupRecords.map(recordRow).join('');
  return `
    <tr class="group-row">
      <td colspan="18">
        <div class="group-summary">
          <span class="group-name">
            ${icon('i-chevron')}
            <strong>${groupMeta[groupKey].label}</strong>
            <em>${groupRecords.length} 条</em>
          </span>
          <span class="group-metrics">
            <span>平均匹配 <b>${average}</b></span>
            <span>需行动 <b>${urgent}</b></span>
          </span>
        </div>
      </td>
    </tr>
    ${rows}
  `;
}

function recordRow(record) {
  const waitWidth = Math.min(100, Math.round((record.wait / 14) * 100));
  const rowNumber = records.indexOf(record) + 2;
  const extra = extendedFields(record);
  const inSelectedRange = rowNumber >= 2 && rowNumber <= 6;
  const isActiveCell = record.id === 'koru';
  const priority = record.fit >= 85 && record.wait >= 7 ? '优先跟进' : '保持观察';
  return `
    <tr data-record-id="${record.id}" class="${state.selectedId === record.id ? 'is-selected' : ''}">
      <td class="row-number">${rowNumber}</td>
      <td class="frozen-record-cell">
        <span class="company-cell">
          <span class="company-logo ${record.color}">${record.company.slice(0, 2).toUpperCase()}</span>
          <span class="company-line"><strong>${record.company}</strong><small>${record.role}</small></span>
        </span>
      </td>
      <td class="stage-cell"><span class="tag stage-${record.stageKey}">${record.stage}</span></td>
      <td><span class="work-mode"><i></i>${record.workMode}</span></td>
      <td class="location-cell">${record.location}</td>
      <td class="date-cell"><time datetime="${record.applied}">${formatDate(record.applied)}</time></td>
      <td class="salary-cell"><span class="salary"><strong>${record.salary}</strong><small>NZD</small></span></td>
      <td class="numeric-cell score-metric ${inSelectedRange ? 'selected-range' : ''} ${record.id === 'aster' ? 'range-start' : ''} ${record.id === 'koru' ? 'range-end' : ''}">
        <span class="score-cell">
          <i class="score-ring" style="--score:${record.fit}" aria-hidden="true"></i>
          <strong>${record.fit}</strong>
        </span>
      </td>
      <td class="numeric-cell wait-metric ${record.wait > 7 ? 'conditional-alert' : ''}">
        <span class="wait-cell ${record.wait > 7 ? 'is-alert' : ''}">
          <span class="wait-bar"><i style="--wait:${waitWidth}%"></i></span>
          <strong>${record.wait}<small>天</small></strong>
        </span>
      </td>
      <td class="next-action-cell"><span class="next-action ${record.urgency ? 'is-soon' : ''}"><i></i><span>${record.next}</span></span></td>
      <td class="formula-value ${isActiveCell ? 'active-cell' : ''}"><span class="priority-token ${priority === '优先跟进' ? 'priority-high' : ''}">${priority}</span>${isActiveCell ? '<i class="fill-handle"></i>' : ''}</td>
      <td class="skills-column">${renderSkillTags(extra.skills)}</td>
      <td class="boolean-column"><span class="boolean-cell ${extra.starred ? 'is-checked' : ''}" role="checkbox" aria-checked="${extra.starred}">${extra.starred ? icon('i-check') : ''}</span></td>
      <td class="link-column">${renderLink(extra.jobLink)}</td>
      <td class="attachment-column">${renderAttachments(extra.attachments)}</td>
      <td class="datetime-cell">${renderDateTime(extra.interviewAt)}</td>
      <td class="progress-column"><span class="progress-cell"><i><b style="--progress:${extra.progress}%"></b></i><strong>${extra.progress}%</strong></span></td>
      <td class="note-column">${renderNote(extra.displayNote, record.id)}</td>
    </tr>
  `;
}

function renderTable() {
  const visible = visibleRecords();
  if (visible.length === 0) {
    stage.innerHTML = `<section class="empty-state">${icon('i-search')}<strong>没有符合条件的记录</strong><span>清除搜索或筛选后再试。</span></section>`;
    return;
  }

  let body = '';
  if (state.grouped) {
    const groups = Object.keys(groupMeta)
      .map((groupKey) => [groupKey, visible.filter((record) => record.stageKey === groupKey)])
      .filter(([, items]) => items.length > 0)
      .sort(([first], [second]) => groupMeta[first].order - groupMeta[second].order);
    body = groups.map(([groupKey, items]) => groupRows(groupKey, items)).join('');
  } else {
    body = visible.map(recordRow).join('');
  }

  stage.innerHTML = `
    <section class="table-view">
      <div class="table-viewport">
        <table class="record-table">
          <colgroup><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col></colgroup>
          <thead>
            <tr class="column-letters">
              <th class="sheet-corner"></th>
              ${['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].map((letter) => `<th>${letter}</th>`).join('')}
            </tr>
            <tr>
              <th class="row-number-header">#</th>
              <th><span class="field-heading">${icon('i-text')}<span>公司 / 职位</span></span></th>
              <th><span class="field-heading">${icon('i-select')}<span>阶段</span></span></th>
              <th><span class="field-heading">${icon('i-select')}<span>工作模式</span></span></th>
              <th><span class="field-heading">${icon('i-location')}<span>地点</span></span></th>
              <th><span class="field-heading">${icon('i-calendar')}<span>申请日期</span><em class="sort-mark">↓</em></span></th>
              <th><span class="field-heading">${icon('i-money')}<span>薪资范围</span></span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>匹配度</span></span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>等待天数</span></span></th>
              <th><span class="field-heading">${icon('i-check')}<span>下一步</span></span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>行动优先级</span></span></th>
              <th><span class="field-heading">${icon('i-group')}<span>技能标签</span></span></th>
              <th><span class="field-heading">${icon('i-check')}<span>已收藏</span></span></th>
              <th><span class="field-heading">${icon('i-link')}<span>JD 链接</span></span></th>
              <th><span class="field-heading">${icon('i-paperclip')}<span>附件</span></span></th>
              <th><span class="field-heading">${icon('i-clock')}<span>面试时间</span></span></th>
              <th><span class="field-heading">${icon('i-number')}<span>进度</span><em class="format-badge">%</em></span></th>
              <th><span class="field-heading">${icon('i-note')}<span>备注</span></span></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;

  stage.querySelectorAll('tr[data-record-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const longTextTarget = event.target instanceof Element
        ? event.target.closest('[data-long-cell]')
        : null;
      if (longTextTarget) {
        openLongTextCell(row.dataset.recordId);
        return;
      }
      closeLongTextCell();
      state.selectedId = row.dataset.recordId;
      renderTable();
    });
  });

  stage.querySelectorAll('[data-long-cell]').forEach((trigger) => {
    trigger.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openLongTextCell(trigger.dataset.longCell);
    });
  });
}

function renderBoard() {
  const visible = visibleRecords();
  const groups = ['offer', 'interview', 'followup', 'applied'];
  const columns = groups.map((groupKey) => {
    const items = visible.filter((record) => record.stageKey === groupKey);
    return `
      <section class="board-column" style="--column-color:${groupMeta[groupKey].color}">
        <header><span>${groupMeta[groupKey].label}</span><em>${items.length}</em></header>
        <div class="board-stack">
          ${items.map((record) => `
            <button type="button" class="board-card" data-record-id="${record.id}">
              <header>
                <span class="company-logo ${record.color}">${record.company.slice(0, 2).toUpperCase()}</span>
                <span><strong>${record.company}</strong><small>${record.role}</small></span>
              </header>
              <p>${record.note}</p>
              <footer><span>${record.workMode} · ${record.location}</span><b class="mini-score">${record.fit}</b></footer>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');
  stage.innerHTML = `<section class="board-view">${columns}</section>`;
}

function renderGallery() {
  const cards = visibleRecords().map((record) => {
    const priority = record.urgency && record.fit >= 80 ? '优先行动' : '保持观察';
    return `
      <button type="button" class="gallery-card" data-record-id="${record.id}">
        <header>
          <span class="gallery-logo ${record.color}">${record.company.slice(0, 2).toUpperCase()}</span>
          <span class="tag stage-${record.stageKey}">${record.stage}</span>
        </header>
        <span class="gallery-title"><strong>${record.company}</strong><small>${record.role}</small></span>
        <div class="gallery-fields">
          <span><small>工作模式</small><b>${record.workMode}</b></span>
          <span><small>地点</small><b>${record.location}</b></span>
          <span><small>薪资</small><b>${record.salary} NZD</b></span>
          <span><small><i class="formula-mark">ƒx</i> 匹配度</small><b>${record.fit}</b></span>
        </div>
        <footer><span><i></i>${record.next}</span><em class="${priority === '优先行动' ? 'is-high' : ''}">${priority}</em></footer>
      </button>
    `;
  }).join('');
  stage.innerHTML = `
    <section class="gallery-view">
      <header><span><strong>岗位画册</strong><small>同一批 records · 卡片字段由当前视图配置决定</small></span><button type="button">${icon('i-fields')}卡片字段</button></header>
      <div class="gallery-grid">${cards}</div>
    </section>
  `;
}

function renderCalendar() {
  const days = [
    ['29', true], ['30', true], ['1'], ['2'], ['3'], ['4'], ['5'],
    ['6'], ['7'], ['8'], ['9'], ['10'], ['11'], ['12'],
    ['13'], ['14'], ['15'], ['16'], ['17'], ['18'], ['19'],
    ['20'], ['21'], ['22'], ['23'], ['24'], ['25'], ['26'],
    ['27'], ['28'], ['29'], ['30'], ['31'], ['1', true], ['2', true],
  ];
  const events = {
    8: [{ title: 'Aster · Offer 比较', type: 'green', time: '09:00' }],
    11: [{ title: 'Fern · 文化面试', type: 'purple', time: '14:00' }],
    15: [{ title: 'Tide · 系统设计', type: 'purple', time: '10:30' }],
    17: [{ title: 'Koru · 二次跟进', type: 'amber', time: '16:00' }],
    19: [{ title: 'Halcyon · 反馈窗口', type: 'blue', time: '全天' }],
    25: [{ title: 'Northstar · 推荐人', type: 'amber', time: '11:00' }],
  };
  const colorMap = {
    green: 'var(--green)',
    purple: 'var(--purple)',
    amber: 'var(--amber)',
    blue: 'var(--blue)',
  };
  const cells = days.map(([day, outside], index) => {
    const dayEvents = (events[index] ?? []).map((event) => `
      <span class="calendar-event" style="--event-color:${colorMap[event.type]}">
        <span>${event.title}<br><em>${event.time}</em></span>
      </span>
    `).join('');
    const today = index === 15;
    return `<div class="calendar-day ${outside ? 'is-outside' : ''} ${today ? 'is-today' : ''}"><b>${day}</b>${dayEvents}</div>`;
  }).join('');

  stage.innerHTML = `
    <section class="calendar-view">
      <header class="calendar-heading">
        <span><strong>2026 年 7 月</strong><small>面试日期与跟进计划 · 6 个事件</small></span>
        <span class="calendar-actions"><button type="button">今天</button><button type="button">‹</button><button type="button">›</button><button type="button">月</button></span>
      </header>
      <div class="calendar-weekdays">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="calendar-scroll"><div class="calendar-grid">${cells}</div></div>
    </section>
  `;
}

function metricGlyph(values) {
  return `<span class="metric-glyph">${values.map((value) => `<i style="--h:${value}px"></i>`).join('')}</span>`;
}

function renderDashboard() {
  stage.innerHTML = `
    <section class="dashboard-scroll">
      <section class="dashboard">
        <header class="dashboard-heading">
          <span><strong>求职驾驶舱</strong><small>从 24 条申请记录聚合 · revision 12 · 只读分析视图</small></span>
          <span class="dashboard-filters"><button type="button">最近 90 天⌄</button><button type="button">全部岗位⌄</button></span>
        </header>
        <section class="metric-strip">
          <article class="metric"><span>有效申请</span><strong>24</strong><small><b>+9</b> 较上月</small>${metricGlyph([8, 13, 10, 18, 16, 23, 19, 27])}</article>
          <article class="metric"><span>回复率</span><strong>33%</strong><small><b>+8%</b> 较上月</small>${metricGlyph([9, 11, 15, 12, 18, 20, 24, 26])}</article>
          <article class="metric"><span>进入面试</span><strong>4</strong><small>转化率 <b>16.7%</b></small>${metricGlyph([5, 6, 8, 11, 10, 14, 18, 22])}</article>
          <article class="metric"><span>平均匹配</span><strong>84</strong><small><b>+5</b> 分</small>${metricGlyph([13, 15, 17, 16, 20, 22, 24, 25])}</article>
          <article class="metric"><span>行动窗口</span><strong>3</strong><small>未来 7 天</small>${metricGlyph([6, 7, 8, 10, 14, 16, 21, 26])}</article>
        </section>
        <section class="priority-banner">
          ${icon('i-sparkles')}
          <span><strong>本周先处理 3 个高价值机会</strong><small>Aster Labs 的 Offer 决策、Tide Systems 与 Fern Studio 的面试准备。</small></span>
          <button type="button" id="dashboard-open-ai">生成行动计划 ${icon('i-arrow')}</button>
        </section>
        <section class="dashboard-grid">
          <article class="analysis-panel wide">
            <header>
              <span><strong>申请与回复趋势</strong><small>最近 6 周 · 申请量增长未牺牲平均匹配度</small></span>
              <span class="chart-legend"><span><i style="--legend:var(--accent)"></i>申请</span><span><i style="--legend:var(--teal)"></i>回复</span></span>
            </header>
            <svg class="trend-chart" viewBox="0 0 700 285" role="img" aria-label="申请与回复趋势图">
              <path class="chart-gridline" d="M54 32H676M54 82H676M54 132H676M54 182H676M54 232H676"/>
              <text class="chart-axis" x="24" y="35">12</text><text class="chart-axis" x="29" y="85">9</text><text class="chart-axis" x="29" y="135">6</text><text class="chart-axis" x="29" y="185">3</text><text class="chart-axis" x="29" y="235">0</text>
              <text class="chart-axis" x="52" y="260">W1</text><text class="chart-axis" x="170" y="260">W2</text><text class="chart-axis" x="288" y="260">W3</text><text class="chart-axis" x="406" y="260">W4</text><text class="chart-axis" x="524" y="260">W5</text><text class="chart-axis" x="642" y="260">W6</text>
              <path class="chart-area" d="M58 198 L176 165 L294 148 L412 98 L530 48 L648 115 L648 232 L58 232 Z"/>
              <path class="chart-line primary" d="M58 198 L176 165 L294 148 L412 98 L530 48 L648 115"/>
              <path class="chart-line secondary" d="M58 232 L176 215 L294 198 L412 182 L530 148 L648 198"/>
              ${[[58, 198], [176, 165], [294, 148], [412, 98], [530, 48], [648, 115]].map(([x, y]) => `<circle class="chart-dot primary" cx="${x}" cy="${y}" r="4"/>`).join('')}
              ${[[58, 232], [176, 215], [294, 198], [412, 182], [530, 148], [648, 198]].map(([x, y]) => `<circle class="chart-dot secondary" cx="${x}" cy="${y}" r="4"/>`).join('')}
            </svg>
          </article>
          <article class="analysis-panel">
            <header><span><strong>申请漏斗</strong><small>从申请到 Offer</small></span><span class="chart-legend">转化 4.2%</span></header>
            <div class="funnel">
              <div class="funnel-row"><span>申请</span><span><i style="--w:100%;--bar:var(--blue)"></i></span><b>24</b></div>
              <div class="funnel-row"><span>回复</span><span><i style="--w:58%;--bar:var(--teal)"></i></span><b>8</b></div>
              <div class="funnel-row"><span>面试</span><span><i style="--w:36%;--bar:var(--purple)"></i></span><b>4</b></div>
              <div class="funnel-row"><span>终面</span><span><i style="--w:22%;--bar:var(--amber)"></i></span><b>2</b></div>
              <div class="funnel-row"><span>Offer</span><span><i style="--w:12%;--bar:var(--green)"></i></span><b>1</b></div>
            </div>
          </article>
          <article class="analysis-panel">
            <header><span><strong>渠道回复率</strong><small>Referral 质量最高</small></span></header>
            <table class="channel-table">
              <thead><tr><th>渠道</th><th>申请</th><th>回复率</th></tr></thead>
              <tbody><tr><td>Referral</td><td>7</td><td>58%</td></tr><tr><td>Recruiter</td><td>2</td><td>50%</td></tr><tr><td>Company site</td><td>9</td><td>35%</td></tr><tr><td>LinkedIn</td><td>6</td><td>25%</td></tr></tbody>
            </table>
          </article>
        </section>
        <section class="dashboard-bottom">
          <article class="analysis-panel">
            <header><span><strong>机会优先级</strong><small>按阶段、匹配度与时间窗口排序</small></span><span class="chart-legend">Top 4</span></header>
            <div class="opportunity-list">
              <div><i style="--dot:var(--green)"></i><span><strong>Aster Labs · Offer</strong><small>匹配 94 · 周五前回复</small></span><em>立即</em></div>
              <div><i style="--dot:var(--purple)"></i><span><strong>Tide Systems · 面试</strong><small>匹配 91 · 明天 10:30</small></span><em>准备</em></div>
              <div><i style="--dot:var(--purple)"></i><span><strong>Fern Studio · 面试</strong><small>匹配 88 · 周四</small></span><em>准备</em></div>
              <div><i style="--dot:var(--amber)"></i><span><strong>Koru Digital · 跟进</strong><small>匹配 86 · 已等待 11 天</small></span><em>跟进</em></div>
            </div>
          </article>
          <article class="analysis-panel">
            <header><span><strong>阶段分布</strong><small>活跃 Pipeline · 11 条</small></span></header>
            <div class="stage-distribution">
              <div class="stage-row"><span>已申请</span><span><i style="--w:100%;--bar:var(--blue)"></i></span><b>4</b></div>
              <div class="stage-row"><span>待跟进</span><span><i style="--w:75%;--bar:var(--amber)"></i></span><b>3</b></div>
              <div class="stage-row"><span>面试中</span><span><i style="--w:75%;--bar:var(--purple)"></i></span><b>3</b></div>
              <div class="stage-row"><span>Offer</span><span><i style="--w:25%;--bar:var(--green)"></i></span><b>1</b></div>
            </div>
          </article>
        </section>
      </section>
    </section>
  `;
  document.querySelector('#dashboard-open-ai')?.addEventListener('click', openAi);
}

function updateStatus() {
  const visible = visibleRecords().length;
  const primary = document.querySelector('#status-primary');
  const secondary = document.querySelector('#status-secondary');
  const selectionStatistics = document.querySelector('#selection-statistics');
  selectionStatistics.hidden = state.view !== 'table' || !state.statsVisible;
  if (state.view === 'table') {
    primary.textContent = 'G2:G6';
    secondary.textContent = `5 个单元格 · ${state.grouped ? '按阶段分组' : `${visible} 条记录`}`;
    return;
  }
  primary.textContent = state.view === 'dashboard' ? 'Dashboard · 24 records' : `${visible} records`;
  if (state.view === 'board') {
    secondary.textContent = '按阶段推进 · 与 Table 同步';
    return;
  }
  if (state.view === 'calendar') {
    secondary.textContent = '按事件日期投影 · 6 个日程';
    return;
  }
  if (state.view === 'gallery') {
    secondary.textContent = '卡片字段配置 · 与 Table 同步';
    return;
  }
  secondary.textContent = '只读聚合 · 统一筛选刷新全部图表';
}

function renderCurrentView() {
  const renderers = {
    table: renderTable,
    board: renderBoard,
    calendar: renderCalendar,
    gallery: renderGallery,
    dashboard: renderDashboard,
  };
  renderers[state.view]();
  workspace.classList.toggle('is-table-view', state.view === 'table');
  formulaBar.hidden = state.view !== 'table';
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.view);
  });
  renderFilterLine();
  updateStatus();
}

function setView(view) {
  if (!view || !(view in { table: 1, board: 1, calendar: 1, gallery: 1, dashboard: 1 })) return;
  closeLongTextCell();
  state.view = view;
  closeViewMenu();
  renderCurrentView();
}

function restoreFormulaBar() {
  activeCellName.textContent = 'J6';
  formulaInput.value = defaultFormulaValue;
  formulaState.innerHTML = defaultFormulaState;
  formulaScope.textContent = defaultFormulaScope;
}

function closeLongTextCell() {
  if (!cellReader) return;
  cellReader.hidden = true;
  document.querySelectorAll('.active-long-cell').forEach((cell) => {
    cell.classList.remove('active-long-cell');
  });
  document.querySelectorAll('.has-wrapped-cell').forEach((row) => {
    row.classList.remove('has-wrapped-cell');
  });
  document.querySelectorAll('.is-suspended-range').forEach((cell) => {
    cell.classList.remove('is-suspended-range');
  });
  document.querySelectorAll('.is-suspended-active').forEach((cell) => {
    cell.classList.remove('is-suspended-active');
  });
  state.activeLongTextId = null;
  state.longTextMode = 'truncate';
  restoreFormulaBar();
}

function setLongTextMode(mode) {
  if (!['truncate', 'wrap'].includes(mode)) return;
  const record = records.find((candidate) => candidate.id === state.activeLongTextId);
  if (!record) return;
  const value = extendedFields(record).displayNote;
  state.longTextMode = mode;
  document
    .querySelector(`tr[data-record-id="${state.activeLongTextId}"]`)
    ?.classList.toggle('has-wrapped-cell', mode === 'wrap');
  document.querySelectorAll('[data-cell-display]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.cellDisplay === mode);
  });
  document.querySelector('#cell-reader-meta').textContent = mode === 'wrap'
    ? '多行文本 · 当前行最多显示三行'
    : '多行文本 · 默认单行截断';
  formulaScope.textContent = `多行文本 · ${value.length} 字 · ${mode === 'wrap' ? '自动换行' : '单行截断'}`;
}

function openLongTextCell(recordId) {
  const record = records.find((candidate) => candidate.id === recordId);
  if (!record) return;
  closeLongTextCell();
  const value = extendedFields(record).displayNote;
  const rowNumber = records.indexOf(record) + 2;
  const trigger = document.querySelector(`[data-long-cell="${recordId}"]`);
  document.querySelectorAll('.selected-range').forEach((cell) => {
    cell.classList.add('is-suspended-range');
  });
  document.querySelectorAll('.active-cell').forEach((cell) => {
    cell.classList.add('is-suspended-active');
  });
  trigger?.closest('td')?.classList.add('active-long-cell');
  state.activeLongTextId = recordId;
  cellReader.hidden = false;
  document.querySelector('#cell-reader-title').textContent = `Q${rowNumber} · 备注`;
  document.querySelector('#cell-reader-copy').textContent = value || '当前单元格为空。';
  document.querySelector('#cell-reader-count').textContent = `${value.length} 字`;
  activeCellName.textContent = `Q${rowNumber}`;
  formulaInput.value = value;
  formulaState.innerHTML = `${icon('i-text')}文本值`;
  setLongTextMode('truncate');
}

function showToast(title, copy) {
  document.querySelector('#toast-title').textContent = title;
  document.querySelector('#toast-copy').textContent = copy;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function openViewMenu() {
  document.querySelector('#view-menu').hidden = false;
  document.querySelector('#add-view').setAttribute('aria-expanded', 'true');
}

function closeViewMenu() {
  document.querySelector('#view-menu').hidden = true;
  document.querySelector('#add-view').setAttribute('aria-expanded', 'false');
}

function openFields() {
  document.querySelector('#field-panel').hidden = false;
  closeLongTextCell();
  closeFormula();
  closeFormatMenu();
  closeConditionalFormat();
  closeViewMenu();
}

function closeFields() {
  document.querySelector('#field-panel').hidden = true;
  document.querySelector('#field-type-menu').hidden = true;
}

function openFormula() {
  formulaPanel.hidden = false;
  closeLongTextCell();
  closeFields();
  closeFormatMenu();
  closeConditionalFormat();
  closeViewMenu();
  closeAi();
}

function closeFormula() {
  formulaPanel.hidden = true;
}

function openFormatMenu() {
  formatMenu.hidden = false;
  closeLongTextCell();
  document.querySelector('#open-format-menu').setAttribute('aria-expanded', 'true');
  closeFields();
  closeFormula();
  closeConditionalFormat();
  closeViewMenu();
  closeAi();
}

function closeFormatMenu() {
  formatMenu.hidden = true;
  document.querySelector('#open-format-menu').setAttribute('aria-expanded', 'false');
}

function openConditionalFormat() {
  conditionalPanel.hidden = false;
  closeLongTextCell();
  closeFormatMenu();
  closeFields();
  closeFormula();
  closeViewMenu();
  closeAi();
}

function closeConditionalFormat() {
  conditionalPanel.hidden = true;
}

function openAi() {
  aiDrawer.classList.add('is-open');
  aiDrawer.setAttribute('aria-hidden', 'false');
  closeLongTextCell();
  closeFields();
  closeFormula();
  closeFormatMenu();
  closeConditionalFormat();
  closeViewMenu();
}

function closeAi() {
  aiDrawer.classList.remove('is-open');
  aiDrawer.setAttribute('aria-hidden', 'true');
}

function showDialog(selector) {
  toast.hidden = true;
  document.querySelector(selector).hidden = false;
}

function closeDialog(selector) {
  document.querySelector(selector).hidden = true;
}

document.querySelectorAll('.view-tab').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.querySelectorAll('[data-open-dashboard]').forEach((button) => {
  button.addEventListener('click', () => {
    closeAi();
    setView('dashboard');
  });
});

document.querySelector('#add-view').addEventListener('click', () => {
  const menu = document.querySelector('#view-menu');
  if (menu.hidden) {
    openViewMenu();
    return;
  }
  closeViewMenu();
});

document.querySelector('[data-close-view-menu]').addEventListener('click', closeViewMenu);

document.querySelectorAll('[data-menu-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.menuView));
});

document.querySelector('#open-fields').addEventListener('click', openFields);
document.querySelector('#close-fields').addEventListener('click', closeFields);
document.querySelector('#cancel-fields').addEventListener('click', closeFields);
document.querySelector('#save-fields').addEventListener('click', () => {
  closeFields();
  showToast('字段已保存', '“阶段”选项已更新到当前 schema 草稿');
});

document.querySelector('#field-type-select').addEventListener('click', () => {
  const menu = document.querySelector('#field-type-menu');
  menu.hidden = !menu.hidden;
});

document.querySelectorAll('[data-field-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const fieldType = button.dataset.fieldType;
    if (!fieldType) return;
    document.querySelector('#selected-field-type').textContent = fieldType;
    document.querySelectorAll('[data-field-type]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
    });
    document.querySelector('#field-type-menu').hidden = true;
    if (fieldType !== '公式') return;
    closeFields();
    openFormula();
  });
});

document.querySelector('#open-formula').addEventListener('click', openFormula);
document.querySelector('#formula-function-button').addEventListener('click', openFormula);
document.querySelector('#close-formula').addEventListener('click', closeFormula);
document.querySelector('#cancel-formula').addEventListener('click', closeFormula);
document.querySelector('#save-formula').addEventListener('click', () => {
  closeFormula();
  showToast('公式字段已保存', '“行动优先级”将按 revision 12 重新计算');
});

document.querySelector('#open-format-menu').addEventListener('click', () => {
  if (formatMenu.hidden) {
    openFormatMenu();
    return;
  }
  closeFormatMenu();
});
document.querySelector('#close-format-menu').addEventListener('click', closeFormatMenu);
document.querySelectorAll('[data-number-format]').forEach((button) => {
  button.addEventListener('click', () => {
    const selectedFormat = button.dataset.numberFormat;
    document.querySelectorAll('[data-number-format]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
      candidate.querySelector('svg')?.remove();
    });
    button.insertAdjacentHTML('beforeend', icon('i-check'));
    document.querySelector('#open-format-menu span').textContent = `${selectedFormat}格式`;
  });
});
document.querySelector('#open-conditional-format').addEventListener('click', openConditionalFormat);
document.querySelector('#open-conditional-from-menu').addEventListener('click', openConditionalFormat);
document.querySelector('#close-conditional-format').addEventListener('click', closeConditionalFormat);
document.querySelector('#save-conditional-format').addEventListener('click', () => {
  closeConditionalFormat();
  showToast('条件格式已保存', '2 条显示规则已应用到 G2:H13');
});

document.querySelectorAll('[data-function]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-function]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
    });
  });
});

document.querySelector('#toggle-filter').addEventListener('click', () => {
  state.filtersVisible = !state.filtersVisible;
  renderFilterLine();
});

document.querySelector('#toggle-group').addEventListener('click', () => {
  state.grouped = !state.grouped;
  document.querySelector('#toggle-group').classList.toggle('is-applied', state.grouped);
  if (state.view !== 'table') setView('table');
  renderTable();
  updateStatus();
});

document.querySelector('#toggle-stats').addEventListener('click', () => {
  state.statsVisible = !state.statsVisible;
  document.querySelector('#toggle-stats').classList.toggle('is-applied', state.statsVisible);
  if (state.view !== 'table') {
    setView('table');
    return;
  }
  updateStatus();
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  renderFilterLine();
  if (state.view === 'dashboard') return;
  renderCurrentView();
});

document.querySelector('#open-ai').addEventListener('click', openAi);
document.querySelector('#close-ai').addEventListener('click', closeAi);
document.querySelector('#close-cell-reader').addEventListener('click', closeLongTextCell);
document.querySelectorAll('[data-cell-display]').forEach((button) => {
  button.addEventListener('click', () => setLongTextMode(button.dataset.cellDisplay));
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('#ai-prompt').value = button.dataset.prompt;
  });
});

document.querySelector('#generate-plan').addEventListener('click', () => {
  document.querySelector('#plan-preview').hidden = false;
  document.querySelector('#plan-preview').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

document.querySelector('#accept-plan').addEventListener('click', () => {
  state.priorityOnly = true;
  state.filtersVisible = true;
  closeAi();
  setView('table');
  showToast('“高价值待跟进”已应用', '5 条记录进入临时视图；源 Markdown 尚未改写');
});

document.querySelector('#show-source').addEventListener('click', () => showDialog('#source-dialog'));
document.querySelector('#close-source').addEventListener('click', () => closeDialog('#source-dialog'));
document.querySelector('#confirm-source').addEventListener('click', () => closeDialog('#source-dialog'));

document.querySelector('#open-mobile').addEventListener('click', () => showDialog('#mobile-overlay'));
document.querySelector('#close-mobile').addEventListener('click', () => closeDialog('#mobile-overlay'));

document.querySelector('#refresh-data').addEventListener('click', () => {
  showToast('Dataset 已刷新', 'Job Applications.md → revision 12 · 无冲突');
});

themeToggle.addEventListener('click', () => {
  const isDark = document.body.dataset.theme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  document.body.dataset.theme = nextTheme;
  document.querySelector('#theme-icon use').setAttribute('href', nextTheme === 'dark' ? '#i-sun' : '#i-moon');
  themeToggle.setAttribute('aria-label', nextTheme === 'dark' ? '切换浅色主题' : '切换深色主题');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeAi();
  closeFields();
  closeFormula();
  closeFormatMenu();
  closeConditionalFormat();
  closeViewMenu();
  closeLongTextCell();
  closeDialog('#source-dialog');
  closeDialog('#mobile-overlay');
});

renderCurrentView();
