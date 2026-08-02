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

const cellOverrides = Object.create(null);

function extendedFields(record) {
  const index = records.indexOf(record);
  const overrides = cellOverrides[record.id] ?? {};
  return {
    skills: overrides.skills ?? skillSets[index] ?? ['Product'],
    starred: overrides.starred ?? (record.fit >= 88 || record.stageKey === 'offer'),
    attachments: overrides.attachments ?? attachmentSets[index] ?? [],
    interviewAt: overrides.interviewAt ?? interviewSlots[record.id] ?? null,
    progress: overrides.progress ?? progressByStage[record.stageKey] ?? 0,
    jobLink: overrides.jobLink ?? (index % 6 === 3
      ? null
      : `careers.${record.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jobs/open-roles`),
    displayNote: overrides.displayNote ?? (index % 7 === 3 ? '' : record.note),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emptyCell(label = '空值') {
  const safeLabel = escapeHtml(label);
  return `<span class="cell-empty" title="${safeLabel}" aria-label="${safeLabel}">—</span>`;
}

function renderSkillTags(skills) {
  if (skills.length === 0) return emptyCell('未填写技能标签');
  const canShowTwo = skills.length > 1
    && skills[0].length + skills[1].length <= 20;
  const visible = skills.slice(0, canShowTwo ? 2 : 1);
  const remaining = skills.length - visible.length;
  const tags = visible
    .map((skill) => {
      const safeSkill = escapeHtml(skill);
      return `<span class="skill-tag" title="${safeSkill}"><span>${safeSkill}</span></span>`;
    })
    .join('');
  const overflow = remaining > 0
    ? `<span class="tag-overflow" title="另外 ${remaining} 个标签">+${remaining}</span>`
    : '';
  return `<span class="skill-tags" title="${escapeHtml(skills.join(' · '))}">${tags}${overflow}</span>`;
}

function renderLink(value) {
  if (!value) return emptyCell('未填写链接');
  const safeValue = escapeHtml(value);
  return `<span class="link-cell" title="${safeValue}">${icon('i-link')}<span>${safeValue}</span></span>`;
}

function renderAttachments(attachments) {
  if (attachments.length === 0) return emptyCell('没有附件');
  if (attachments.length === 1) {
    const [fileName] = attachments;
    const safeFileName = escapeHtml(fileName);
    return `<span class="attachment-cell" title="${safeFileName}">${icon('i-paperclip')}<span>${safeFileName}</span></span>`;
  }
  return `
    <span class="attachment-cell is-multiple" title="${escapeHtml(attachments.join(' · '))}">
      <span class="attachment-stack" aria-hidden="true"><i></i><i></i></span>
      <span>${attachments.length} 个文件</span>
    </span>
  `;
}

function renderDateTime(value) {
  if (!value) return emptyCell('未安排面试时间');
  if (value === '待确认') return `<span class="datetime-state">${escapeHtml(value)}</span>`;
  return `<span class="datetime-value">${escapeHtml(value)}</span>`;
}

function renderNote(value, recordId) {
  if (!value) {
    return `<span class="cell-empty long-text-trigger" data-long-cell="${recordId}" role="button" tabindex="0" title="打开空备注单元格">—</span>`;
  }
  const safeValue = escapeHtml(value);
  return `<span class="note-cell long-text-trigger" data-long-cell="${recordId}" role="button" tabindex="0" title="${safeValue}">${safeValue}</span>`;
}

const groupMeta = {
  offer: { label: 'Offer', order: 0, color: 'var(--green)' },
  interview: { label: '面试中', order: 1, color: 'var(--purple)' },
  followup: { label: '待跟进', order: 2, color: 'var(--amber)' },
  applied: { label: '已申请', order: 3, color: 'var(--blue)' },
  ended: { label: '已结束', order: 4, color: 'var(--red)' },
};

const cellFields = {
  company: {
    column: 'A',
    label: '公司',
    type: 'text',
    get: (record) => record.company,
    set: (record, value) => { record.company = value.trim() || record.company; },
  },
  role: {
    column: 'B',
    label: '职位',
    type: 'text',
    get: (record) => record.role,
    set: (record, value) => { record.role = value.trim() || record.role; },
  },
  stage: {
    column: 'C',
    label: '阶段',
    type: 'select',
    options: Object.entries(groupMeta).map(([value, meta]) => ({ value, label: meta.label })),
    get: (record) => record.stageKey,
    display: (record) => record.stage,
    set: (record, value) => {
      if (!groupMeta[value]) return;
      record.stageKey = value;
      record.stage = groupMeta[value].label;
    },
  },
  workMode: {
    column: 'D',
    label: '工作模式',
    type: 'select',
    options: ['Remote', 'Hybrid', 'On-site'].map((value) => ({ value, label: value })),
    get: (record) => record.workMode,
    set: (record, value) => { record.workMode = value; },
  },
  location: {
    column: 'E',
    label: '地点',
    type: 'text',
    get: (record) => record.location,
    set: (record, value) => { record.location = value.trim(); },
  },
  applied: {
    column: 'F',
    label: '申请日期',
    type: 'date',
    get: (record) => record.applied,
    set: (record, value) => { if (value) record.applied = value; },
  },
  salary: {
    column: 'G',
    label: '薪资范围',
    type: 'text',
    get: (record) => record.salary,
    set: (record, value) => { record.salary = value.trim(); },
  },
  fit: {
    column: 'H',
    label: '匹配度',
    type: 'number',
    min: 0,
    max: 100,
    get: (record) => record.fit,
    set: (record, value) => { record.fit = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); },
  },
  wait: {
    column: 'I',
    label: '等待天数',
    type: 'number',
    min: 0,
    max: 365,
    get: (record) => record.wait,
    set: (record, value) => { record.wait = Math.max(0, Math.min(365, Math.round(Number(value) || 0))); },
  },
  next: {
    column: 'J',
    label: '下一步',
    type: 'text',
    get: (record) => record.next,
    set: (record, value) => { record.next = value.trim(); },
  },
  priority: {
    column: 'K',
    label: '行动优先级',
    readOnly: true,
    display: (record) => (record.fit >= 85 && record.wait >= 7 ? '优先跟进' : '保持观察'),
    formula: (rowNumber) => `=IF(AND(H${rowNumber}>=85,I${rowNumber}>=7),"优先跟进","保持观察")`,
  },
  skills: {
    column: 'L',
    label: '技能标签',
    type: 'text',
    get: (record) => extendedFields(record).skills.join(', '),
    set: (record, value) => {
      const skills = value.split(',').map((skill) => skill.trim()).filter(Boolean);
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), skills };
    },
  },
  starred: {
    column: 'M',
    label: '已收藏',
    type: 'checkbox',
    get: (record) => extendedFields(record).starred,
    display: (record) => (extendedFields(record).starred ? '已收藏' : '未收藏'),
    set: (record, value) => {
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), starred: Boolean(value) };
    },
  },
  jobLink: {
    column: 'N',
    label: 'JD 链接',
    type: 'url',
    get: (record) => extendedFields(record).jobLink ?? '',
    set: (record, value) => {
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), jobLink: value.trim() };
    },
  },
  attachments: {
    column: 'O',
    label: '附件',
    readOnly: true,
    display: (record) => extendedFields(record).attachments.join(', ') || '没有附件',
  },
  interviewAt: {
    column: 'P',
    label: '面试时间',
    type: 'text',
    get: (record) => extendedFields(record).interviewAt ?? '',
    set: (record, value) => {
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), interviewAt: value.trim() };
    },
  },
  progress: {
    column: 'Q',
    label: '进度',
    type: 'number',
    min: 0,
    max: 100,
    get: (record) => extendedFields(record).progress,
    set: (record, value) => {
      const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), progress };
    },
  },
  note: {
    column: 'R',
    label: '备注',
    type: 'text',
    get: (record) => extendedFields(record).displayNote,
    set: (record, value) => {
      record.note = value;
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), displayNote: value };
    },
  },
};

const fieldTypeLabels = {
  text: '单行文本',
  select: '单选',
  date: '日期与时间',
  number: '数字',
  checkbox: '复选框',
  url: '链接',
};

const fieldSchemas = Object.entries(cellFields).map(([key, definition]) => ({
  key,
  name: definition.label,
  column: definition.column,
  type: definition.readOnly && definition.formula ? '公式' : fieldTypeLabels[definition.type] ?? '附件',
  options: key === 'stage'
    ? Object.values(groupMeta).map((meta) => meta.label)
    : [],
  saved: true,
}));
const customFields = [];
let selectedFieldKey = 'stage';
let ruleId = 0;

function createRuleId(prefix) {
  ruleId += 1;
  return `${prefix}-${ruleId}`;
}

const state = {
  view: 'table',
  filters: [],
  filterLogic: 'all',
  sortRules: [],
  groupRules: [],
  filterDrafts: [
    { id: createRuleId('filter'), field: 'stageKey', operator: 'notEquals', value: '已结束' },
    { id: createRuleId('filter'), field: 'fit', operator: 'gte', value: '80' },
  ],
  sortDrafts: [
    { id: createRuleId('sort'), field: 'fit', direction: 'desc' },
    { id: createRuleId('sort'), field: 'wait', direction: 'desc' },
  ],
  groupDrafts: [
    { id: createRuleId('group'), field: 'stageKey', direction: 'asc' },
    { id: createRuleId('group'), field: 'workMode', direction: 'asc' },
  ],
  statsVisible: true,
  query: '',
  selectedId: null,
  activeLongTextId: null,
  longTextMode: 'truncate',
  cellSelection: null,
  editingCell: null,
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
const formulaDirect = document.querySelector('#formula-direct');
const inlineFormulaComposer = document.querySelector('#inline-formula-composer');
const inlineFormulaPrompt = document.querySelector('#inline-formula-prompt');
const formatMenu = document.querySelector('#format-menu');
const filterPanel = document.querySelector('#filter-panel');
const sortPanel = document.querySelector('#sort-panel');
const groupPanel = document.querySelector('#group-panel');
const dedupePanel = document.querySelector('#dedupe-panel');
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

function isSelectedCell(recordId, field) {
  return state.cellSelection?.recordId === recordId
    && state.cellSelection?.field === field;
}

function isInitialFormulaCell(recordId, field) {
  return !state.cellSelection && recordId === 'koru' && field === 'priority';
}

function cellClass(record, field, ...classes) {
  return [
    ...classes,
    isSelectedCell(record.id, field) ? 'is-current-cell' : '',
    isInitialFormulaCell(record.id, field) ? 'active-cell' : '',
  ].filter(Boolean).join(' ');
}

function cellAttributes(record, field) {
  const definition = cellFields[field];
  const readOnly = definition?.readOnly === true;
  const tabIndex = isSelectedCell(record.id, field) || isInitialFormulaCell(record.id, field)
    ? 0
    : -1;
  return [
    `data-record-id="${escapeHtml(record.id)}"`,
    `data-field="${field}"`,
    `data-editable="${readOnly ? 'false' : 'true'}"`,
    readOnly ? 'data-readonly="true"' : '',
    `tabindex="${tabIndex}"`,
  ].filter(Boolean).join(' ');
}

function getCellValue(record, field, forDisplay = false) {
  const definition = cellFields[field];
  if (!definition) return '';
  if (forDisplay && definition.display) return definition.display(record);
  if (definition.get) return definition.get(record);
  if (definition.display) return definition.display(record);
  return '';
}

const fieldLabels = {
  stageKey: '阶段',
  workMode: '工作模式',
  location: '地点',
  fit: '匹配度',
  company: '公司',
  role: '职位',
  applied: '申请日期',
  wait: '等待天数',
  salary: '薪资范围',
  progress: '进度',
};

const operatorLabels = {
  equals: '等于',
  notEquals: '不等于',
  contains: '包含',
  gte: '大于等于',
  lte: '小于等于',
};

const groupLabels = {
  stageKey: '阶段',
  workMode: '工作模式',
  location: '地点',
};

function filterValue(record, field) {
  if (field === 'stageKey') return record.stage;
  if (cellFields[field]) return getCellValue(record, field, true);
  return record[field];
}

function matchesRule(record, rule) {
  const actual = filterValue(record, rule.field);
  const expected = rule.value;
  if (rule.operator === 'gte') return Number(actual) >= Number(expected);
  if (rule.operator === 'lte') return Number(actual) <= Number(expected);
  const actualText = String(actual ?? '').trim().toLowerCase();
  const expectedText = String(expected ?? '').trim().toLowerCase();
  if (rule.operator === 'notEquals') return actualText !== expectedText;
  if (rule.operator === 'contains') return actualText.includes(expectedText);
  return actualText === expectedText;
}

function matchesRuleSet(record, rules, logic = 'all') {
  if (rules.length === 0) return true;
  if (logic === 'any') return rules.some((rule) => matchesRule(record, rule));
  return rules.every((rule) => matchesRule(record, rule));
}

function compareRecords(first, second) {
  for (const rule of state.sortRules) {
    const firstValue = filterValue(first, rule.field);
    const secondValue = filterValue(second, rule.field);
    const numeric = ['fit', 'wait', 'progress'].includes(rule.field);
    const comparison = numeric
      ? Number(firstValue) - Number(secondValue)
      : String(firstValue ?? '').localeCompare(String(secondValue ?? ''), 'zh-CN', { numeric: true });
    if (comparison === 0) continue;
    return rule.direction === 'asc' ? comparison : -comparison;
  }
  return records.indexOf(first) - records.indexOf(second);
}

function visibleRecords() {
  const query = state.query.trim().toLowerCase();
  return records
    .filter((record) => {
      if (!matchesRuleSet(record, state.filters, state.filterLogic)) return false;
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
    })
    .sort(compareRecords);
}

function formatDate(value) {
  const [, month, day] = value.split('-');
  return `${month}/${day}`;
}

function renderFilterLine() {
  const hasFilters = state.filters.length > 0;
  workspace.classList.toggle('has-active-filter', hasFilters);
  filterLine.hidden = !hasFilters;
  if (!hasFilters) return;
  const visible = visibleRecords().length;
  const joiner = state.filterLogic === 'all' ? '且' : '或';
  filterLine.innerHTML = `
    <span>已应用筛选</span>
    ${state.filters.map((rule, index) => `${index > 0 ? `<em>${joiner}</em>` : ''}<button type="button" data-remove-filter="${index}">${escapeHtml(fieldLabels[rule.field] ?? cellFields[rule.field]?.label ?? rule.field)} ${escapeHtml(operatorLabels[rule.operator])} ${escapeHtml(rule.value)} ${icon('i-x')}</button>`).join('')}
    <span class="filter-result">显示 ${visible} 条记录</span>
  `;
  document.querySelectorAll('[data-remove-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.splice(Number(button.dataset.removeFilter), 1);
      renderAfterRuleChange();
    });
  });
}

function groupRows(groupKey, groupRecords) {
  const average = Math.round(groupRecords.reduce((sum, record) => sum + record.fit, 0) / groupRecords.length);
  const urgent = groupRecords.filter((record) => record.urgency).length;
  const rows = groupRecords.map(recordRow).join('');
  return `
    <tr class="group-row">
      <td colspan="${19 + customFields.filter((field) => field.saved).length}">
        <div class="group-summary">
          <span class="group-name">
            ${icon('i-chevron')}
            <strong>${escapeHtml(groupKey)}</strong>
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

function sortIndicator(field) {
  const index = state.sortRules.findIndex((rule) => rule.field === field);
  if (index < 0) return '';
  return `<em class="sort-mark">${state.sortRules[index].direction === 'desc' ? '↓' : '↑'}${state.sortRules.length > 1 ? index + 1 : ''}</em>`;
}

function recordRow(record) {
  const waitWidth = Math.min(100, Math.round((record.wait / 14) * 100));
  const rowNumber = records.indexOf(record) + 2;
  const extra = extendedFields(record);
  const inSelectedRange = !state.cellSelection && rowNumber >= 2 && rowNumber <= 6;
  const priority = record.fit >= 85 && record.wait >= 7 ? '优先跟进' : '保持观察';
  const priorityIsActive = isSelectedCell(record.id, 'priority')
    || isInitialFormulaCell(record.id, 'priority');
  return `
    <tr data-record-id="${record.id}" class="${state.selectedId === record.id ? 'is-selected' : ''}">
      <td class="row-number">${rowNumber}</td>
      <td class="${cellClass(record, 'company', 'frozen-record-cell')}" ${cellAttributes(record, 'company')}>
        <span class="company-cell">
          <span class="company-logo ${record.color}">${escapeHtml(record.company.slice(0, 2).toUpperCase())}</span>
          <span class="company-line"><strong>${escapeHtml(record.company)}</strong></span>
        </span>
      </td>
      <td class="${cellClass(record, 'role', 'role-cell')}" ${cellAttributes(record, 'role')}><span title="${escapeHtml(record.role)}">${escapeHtml(record.role)}</span></td>
      <td class="${cellClass(record, 'stage', 'stage-cell')}" ${cellAttributes(record, 'stage')}><span class="tag stage-${record.stageKey}">${escapeHtml(record.stage)}</span></td>
      <td class="${cellClass(record, 'workMode')}" ${cellAttributes(record, 'workMode')}><span class="work-mode"><i></i>${escapeHtml(record.workMode)}</span></td>
      <td class="${cellClass(record, 'location', 'location-cell')}" ${cellAttributes(record, 'location')}>${escapeHtml(record.location)}</td>
      <td class="${cellClass(record, 'applied', 'date-cell')}" ${cellAttributes(record, 'applied')}><time datetime="${escapeHtml(record.applied)}">${formatDate(record.applied)}</time></td>
      <td class="${cellClass(record, 'salary', 'salary-cell')}" ${cellAttributes(record, 'salary')}><span class="salary"><strong>${escapeHtml(record.salary)}</strong><small>NZD</small></span></td>
      <td class="${cellClass(
        record,
        'fit',
        'numeric-cell',
        'score-metric',
        inSelectedRange ? 'selected-range' : '',
        inSelectedRange && record.id === 'aster' ? 'range-start' : '',
        inSelectedRange && record.id === 'koru' ? 'range-end' : '',
      )}" ${cellAttributes(record, 'fit')}>
        <span class="score-cell">
          <i class="score-ring" style="--score:${record.fit}" aria-hidden="true"></i>
          <strong>${record.fit}</strong>
        </span>
      </td>
      <td class="${cellClass(record, 'wait', 'numeric-cell', 'wait-metric')}" ${cellAttributes(record, 'wait')}>
        <span class="wait-cell">
          <span class="wait-bar"><i style="--wait:${waitWidth}%"></i></span>
          <strong>${record.wait}<small>天</small></strong>
        </span>
      </td>
      <td class="${cellClass(record, 'next', 'next-action-cell')}" ${cellAttributes(record, 'next')}><span class="next-action ${record.urgency ? 'is-soon' : ''}"><i></i><span>${escapeHtml(record.next)}</span></span></td>
      <td class="${cellClass(record, 'priority', 'formula-value')}" ${cellAttributes(record, 'priority')}><span class="priority-token ${priority === '优先跟进' ? 'priority-high' : ''}">${priority}</span>${priorityIsActive ? '<i class="fill-handle"></i>' : ''}</td>
      <td class="${cellClass(record, 'skills', 'skills-column')}" ${cellAttributes(record, 'skills')}>${renderSkillTags(extra.skills)}</td>
      <td class="${cellClass(record, 'starred', 'boolean-column')}" ${cellAttributes(record, 'starred')}><span class="boolean-cell ${extra.starred ? 'is-checked' : ''}" role="checkbox" aria-checked="${extra.starred}">${extra.starred ? icon('i-check') : ''}</span></td>
      <td class="${cellClass(record, 'jobLink', 'link-column')}" ${cellAttributes(record, 'jobLink')}>${renderLink(extra.jobLink)}</td>
      <td class="${cellClass(record, 'attachments', 'attachment-column')}" ${cellAttributes(record, 'attachments')}>${renderAttachments(extra.attachments)}</td>
      <td class="${cellClass(record, 'interviewAt', 'datetime-cell')}" ${cellAttributes(record, 'interviewAt')}>${renderDateTime(extra.interviewAt)}</td>
      <td class="${cellClass(record, 'progress', 'progress-column')}" ${cellAttributes(record, 'progress')}><span class="progress-cell"><i><b style="--progress:${extra.progress}%"></b></i><strong>${extra.progress}%</strong></span></td>
      <td class="${cellClass(record, 'note', 'note-column')}" ${cellAttributes(record, 'note')}>${renderNote(extra.displayNote, record.id)}</td>
      ${customFields.filter((field) => field.saved).map((field) => {
        const value = getCellValue(record, field.key, true);
        return `<td class="${cellClass(record, field.key, 'custom-field-column')}" ${cellAttributes(record, field.key)}><span title="${escapeHtml(value)}">${value ? escapeHtml(value) : emptyCell(`未填写${field.name}`)}</span></td>`;
      }).join('')}
    </tr>
  `;
}

function columnLetters() {
  return Object.values(cellFields)
    .filter((definition) => !definition.custom || definition.saved)
    .map((definition) => definition.column);
}

function fieldIcon(definition) {
  if (definition.formula) return '<b class="formula-mark">ƒx</b>';
  const iconByType = {
    select: 'i-select',
    date: 'i-calendar',
    number: 'i-number',
    checkbox: 'i-check',
    url: 'i-link',
  };
  return icon(iconByType[definition.type] ?? 'i-text');
}

function customFieldHeaders() {
  return customFields
    .filter((field) => field.saved)
    .map((field) => {
      const definition = cellFields[field.key];
      return `<th><span class="field-heading">${fieldIcon(definition)}<span>${escapeHtml(definition.label)}</span>${sortIndicator(field.key)}</span></th>`;
    })
    .join('');
}

function renderTable() {
  const visible = visibleRecords();
  if (visible.length === 0) {
    stage.innerHTML = `<section class="empty-state">${icon('i-search')}<strong>没有符合条件的记录</strong><span>清除搜索或筛选后再试。</span></section>`;
    return;
  }

  let body = '';
  if (state.groupRules.length > 0) {
    const groupedRecords = new Map();
    visible.forEach((record) => {
      const groupKey = state.groupRules
        .map((rule) => String(filterValue(record, rule.field) || '未填写'))
        .join(' · ');
      groupedRecords.set(groupKey, [...(groupedRecords.get(groupKey) ?? []), record]);
    });
    const groups = [...groupedRecords.entries()].sort(([first], [second]) => {
      const comparison = first.localeCompare(second, 'zh-CN', { numeric: true });
      return state.groupRules[0].direction === 'desc' ? -comparison : comparison;
    });
    body = groups.map(([groupKey, items]) => groupRows(groupKey, items)).join('');
  } else {
    body = visible.map(recordRow).join('');
  }

  stage.innerHTML = `
    <section class="table-view">
      <div class="table-viewport">
        <table class="record-table" style="min-width:${3002 + (customFields.filter((field) => field.saved).length * 160)}px">
          <colgroup>${columnLetters().map(() => '<col>').join('')}<col></colgroup>
          <thead>
            <tr class="column-letters">
              <th class="sheet-corner"></th>
              ${columnLetters().map((letter) => `<th>${letter}</th>`).join('')}
            </tr>
            <tr>
              <th class="row-number-header">#</th>
              <th><span class="field-heading">${icon('i-text')}<span>公司</span>${sortIndicator('company')}</span></th>
              <th><span class="field-heading">${icon('i-text')}<span>职位</span></span></th>
              <th><span class="field-heading">${icon('i-select')}<span>阶段</span></span></th>
              <th><span class="field-heading">${icon('i-select')}<span>工作模式</span></span></th>
              <th><span class="field-heading">${icon('i-location')}<span>地点</span></span></th>
              <th><span class="field-heading">${icon('i-calendar')}<span>申请日期</span>${sortIndicator('applied')}</span></th>
              <th><span class="field-heading">${icon('i-money')}<span>薪资范围</span></span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>匹配度</span>${sortIndicator('fit')}</span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>等待天数</span>${sortIndicator('wait')}</span></th>
              <th><span class="field-heading">${icon('i-check')}<span>下一步</span></span></th>
              <th><span class="field-heading"><b class="formula-mark">ƒx</b><span>行动优先级</span></span></th>
              <th><span class="field-heading">${icon('i-group')}<span>技能标签</span></span></th>
              <th><span class="field-heading">${icon('i-check')}<span>已收藏</span></span></th>
              <th><span class="field-heading">${icon('i-link')}<span>JD 链接</span></span></th>
              <th><span class="field-heading">${icon('i-paperclip')}<span>附件</span></span></th>
              <th><span class="field-heading">${icon('i-clock')}<span>面试时间</span></span></th>
              <th><span class="field-heading">${icon('i-number')}<span>进度</span><em class="format-badge">%</em></span></th>
              <th><span class="field-heading">${icon('i-note')}<span>备注</span></span></th>
              ${customFieldHeaders()}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;

  const table = stage.querySelector('.record-table');
  table?.addEventListener('click', handleTableClick);
  table?.addEventListener('dblclick', handleTableDoubleClick);
  table?.addEventListener('keydown', handleTableKeyDown);
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
  selectionStatistics.hidden = state.view !== 'table'
    || !state.statsVisible
    || Boolean(state.cellSelection);
  if (state.view === 'table') {
    if (state.cellSelection) {
      const definition = cellFields[state.cellSelection.field];
      primary.textContent = cellReference(state.cellSelection.recordId, state.cellSelection.field);
      secondary.textContent = definition?.readOnly
        ? `${definition.label} · 只读`
        : `${definition?.label ?? '单元格'} · 双击或 Enter 编辑`;
      return;
    }
    primary.textContent = 'H2:H6';
    const grouping = state.groupRules
      .map((rule) => fieldLabels[rule.field] ?? cellFields[rule.field]?.label ?? rule.field)
      .join(' → ');
    secondary.textContent = `5 个单元格 · ${grouping ? `按 ${grouping} 分组` : `${visible} 条记录`}`;
    const selectedValues = records.slice(0, 5).map((record) => record.fit);
    const sum = selectedValues.reduce((total, value) => total + value, 0);
    const values = [
      selectedValues.length,
      sum,
      (sum / selectedValues.length).toFixed(1),
      Math.min(...selectedValues),
      Math.max(...selectedValues),
    ];
    selectionStatistics.querySelectorAll('b').forEach((value, index) => {
      value.textContent = String(values[index]);
    });
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

function animateViewStage() {
  stage.classList.remove('is-view-entering');
  void stage.offsetWidth;
  stage.classList.add('is-view-entering');
  window.clearTimeout(animateViewStage.timer);
  animateViewStage.timer = window.setTimeout(() => {
    stage.classList.remove('is-view-entering');
  }, 300);
}

function renderCurrentView(options = {}) {
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
  const queryResult = document.querySelector('#query-result');
  if (queryResult) {
    const count = visibleRecords().length;
    queryResult.textContent = String(count);
    queryResult.title = `${count} 条记录`;
  }
  updateStatus();
  if (options.animate) animateViewStage();
}

function setView(view) {
  if (!view || !(view in { table: 1, board: 1, calendar: 1, gallery: 1, dashboard: 1 })) return;
  closeLongTextCell();
  state.cellSelection = null;
  state.editingCell = null;
  state.view = view;
  closeViewMenu();
  renderCurrentView({ animate: true });
}

function cellReference(recordId, field) {
  const record = records.find((candidate) => candidate.id === recordId);
  const definition = cellFields[field];
  if (!record || !definition) return '';
  return `${definition.column}${records.indexOf(record) + 2}`;
}

function cellSelector(recordId, field) {
  return `tr[data-record-id="${recordId}"] td[data-field="${field}"]`;
}

const dependentCellFields = Object.freeze({
  company: ['jobLink'],
  stage: ['starred', 'progress'],
  fit: ['priority', 'starred'],
  wait: ['priority'],
});

function renderDetachedRecordRow(record) {
  const table = document.createElement('table');
  const body = table.createTBody();
  body.innerHTML = recordRow(record);
  return body.querySelector(`tr[data-record-id="${record.id}"]`);
}

function refreshRecordCells(recordId, changedField) {
  const record = records.find((candidate) => candidate.id === recordId);
  if (!record) return null;
  const renderedRow = renderDetachedRecordRow(record);
  if (!renderedRow) return null;
  const fields = [changedField, ...(dependentCellFields[changedField] ?? [])];
  fields.forEach((field) => {
    const currentCell = document.querySelector(cellSelector(recordId, field));
    const nextCell = renderedRow.querySelector(`td[data-field="${field}"]`);
    if (!currentCell || !nextCell) return;
    currentCell.replaceWith(nextCell);
  });
  return document.querySelector(cellSelector(recordId, changedField));
}

function renderTablePreservingViewport() {
  const currentViewport = document.querySelector('.table-viewport');
  const scrollLeft = currentViewport?.scrollLeft ?? 0;
  const scrollTop = currentViewport?.scrollTop ?? 0;
  renderTable();
  const nextViewport = document.querySelector('.table-viewport');
  if (!nextViewport) return;
  nextViewport.scrollLeft = Math.min(
    scrollLeft,
    Math.max(0, nextViewport.scrollWidth - nextViewport.clientWidth),
  );
  nextViewport.scrollTop = Math.min(
    scrollTop,
    Math.max(0, nextViewport.scrollHeight - nextViewport.clientHeight),
  );
}

function editRequiresStructuralRender(field) {
  if (state.query.trim()) return true;
  const touchesField = (rule) => rule.field === field
    || (rule.field === 'stageKey' && field === 'stage');
  return state.filters.some(touchesField)
    || state.sortRules.some(touchesField)
    || state.groupRules.some(touchesField);
}

function refreshCommittedCell(recordId, field) {
  if (editRequiresStructuralRender(field)) {
    renderTablePreservingViewport();
    return document.querySelector(cellSelector(recordId, field));
  }
  return refreshRecordCells(recordId, field);
}

function updateFormulaBarForSelection() {
  const selection = state.cellSelection;
  if (!selection) return;
  const record = records.find((candidate) => candidate.id === selection.recordId);
  const definition = cellFields[selection.field];
  if (!record || !definition) return;
  const rowNumber = records.indexOf(record) + 2;
  activeCellName.textContent = cellReference(record.id, selection.field);
  formulaInput.value = definition.formula
    ? definition.formula(rowNumber)
    : String(getCellValue(record, selection.field, true) ?? '');
  formulaState.innerHTML = definition.readOnly
    ? `${icon('i-lock')}只读字段`
    : `${icon('i-text')}可编辑`;
  formulaScope.textContent = definition.readOnly
    ? `${definition.label} · 由 schema 或公式维护`
    : `${definition.label} · 双击或 Enter / F2 编辑`;
}

function selectCell(recordId, field, options = {}) {
  const record = records.find((candidate) => candidate.id === recordId);
  if (!record || !cellFields[field]) return;
  state.cellSelection = { recordId, field };
  state.selectedId = null;
  document.querySelectorAll('.record-table td[data-field]').forEach((cell) => {
    cell.classList.remove(
      'active-cell',
      'active-long-cell',
      'is-current-cell',
      'selected-range',
      'range-start',
      'range-end',
    );
    cell.setAttribute('tabindex', '-1');
  });
  document.querySelectorAll('.fill-handle').forEach((handle) => handle.remove());
  const cell = document.querySelector(cellSelector(recordId, field));
  cell?.classList.add('is-current-cell');
  cell?.setAttribute('tabindex', '0');
  updateFormulaBarForSelection();
  updateStatus();
  if (options.focus === false) return;
  cell?.focus({ preventScroll: true });
}

function flashCell(cell, className) {
  if (!cell) return;
  if (cell.classList.contains(className)) {
    cell.classList.remove(className);
    void cell.offsetWidth;
  }
  cell.classList.add(className);
  window.setTimeout(() => cell.classList.remove(className), 240);
}

function pulseReadOnlyCell(cell) {
  flashCell(cell, 'is-readonly-pulse');
  const field = cell?.dataset.field;
  const definition = field ? cellFields[field] : null;
  showToast('这是只读字段', `${definition?.label ?? '当前列'}由公式、schema 或附件管理器维护`);
}

function toggleBooleanCell(recordId, field = 'starred') {
  const record = records.find((candidate) => candidate.id === recordId);
  const definition = cellFields[field];
  if (!record || definition?.type !== 'checkbox') return;
  selectCell(recordId, field, { focus: false });
  definition.set(record, !Boolean(definition.get(record)));
  const cell = refreshCommittedCell(recordId, field);
  updateFormulaBarForSelection();
  updateStatus();
  cell?.focus({ preventScroll: true });
}

function createCellEditor(definition, record) {
  if (definition.type === 'select') {
    const select = document.createElement('select');
    definition.options.forEach((option) => {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      select.append(element);
    });
    select.value = String(definition.get(record) ?? '');
    return select;
  }
  const input = document.createElement('input');
  input.type = definition.type ?? 'text';
  input.value = String(definition.get(record) ?? '');
  if (definition.min !== undefined) input.min = String(definition.min);
  if (definition.max !== undefined) input.max = String(definition.max);
  if (definition.type === 'number') input.step = '1';
  return input;
}

function startCellEdit(cell) {
  if (!(cell instanceof HTMLElement)) return;
  const { recordId, field } = cell.dataset;
  const record = records.find((candidate) => candidate.id === recordId);
  const definition = field ? cellFields[field] : null;
  if (!record || !definition || !recordId || !field) return;
  selectCell(recordId, field, { focus: false });
  if (definition.readOnly) {
    pulseReadOnlyCell(cell);
    return;
  }
  if (definition.type === 'checkbox') {
    toggleBooleanCell(recordId, field);
    return;
  }
  closeLongTextCell();
  state.editingCell = { recordId, field };
  cell.classList.add('is-editing');
  const editor = createCellEditor(definition, record);
  editor.className = 'cell-editor';
  editor.setAttribute('aria-label', `编辑 ${definition.label}`);
  cell.replaceChildren(editor);

  const commit = (moveKey = null) => {
    commitCellEdit(editor.value, moveKey);
  };
  editor.addEventListener('click', (event) => event.stopPropagation());
  editor.addEventListener('dblclick', (event) => event.stopPropagation());
  editor.addEventListener('input', () => {
    formulaInput.value = editor.value;
  });
  editor.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCellEdit();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commit(event.shiftKey ? 'Shift+Tab' : 'Tab');
    }
  });
  if (definition.type === 'select') {
    editor.addEventListener('change', () => commit());
  }
  editor.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (state.editingCell?.recordId !== recordId || state.editingCell?.field !== field) return;
      commit();
    }, 0);
  });
  window.requestAnimationFrame(() => {
    editor.focus({ preventScroll: true });
    if (editor instanceof HTMLInputElement) editor.select();
  });
}

function commitCellEdit(value, moveKey = null) {
  const editing = state.editingCell;
  if (!editing) return;
  const record = records.find((candidate) => candidate.id === editing.recordId);
  const definition = cellFields[editing.field];
  if (!record || !definition?.set) return;
  definition.set(record, value);
  state.editingCell = null;
  const cell = refreshCommittedCell(editing.recordId, editing.field);
  updateFormulaBarForSelection();
  updateStatus();
  if (moveKey) {
    moveCellSelection(cell, moveKey, true);
  } else {
    cell?.focus({ preventScroll: true });
  }
}

function cancelCellEdit() {
  const editing = state.editingCell;
  if (!editing) return false;
  state.editingCell = null;
  const cell = refreshRecordCells(editing.recordId, editing.field);
  updateFormulaBarForSelection();
  updateStatus();
  cell?.focus({ preventScroll: true });
  return true;
}

function moveCellSelection(cell, key, editableOnly = false) {
  if (!(cell instanceof HTMLElement)) return;
  const rows = [...document.querySelectorAll('.record-table tbody tr[data-record-id]')];
  const row = cell.closest('tr[data-record-id]');
  const rowIndex = rows.indexOf(row);
  const rowCells = [...row.querySelectorAll('td[data-field]')];
  const columnIndex = rowCells.indexOf(cell);
  let target = null;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const offset = key === 'ArrowLeft' ? -1 : 1;
    target = rowCells[columnIndex + offset] ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const offset = key === 'ArrowUp' ? -1 : 1;
    target = rows[rowIndex + offset]?.querySelectorAll('td[data-field]')[columnIndex] ?? null;
  }
  if (key === 'Tab' || key === 'Shift+Tab') {
    const selector = editableOnly
      ? 'td[data-field][data-editable="true"]'
      : 'td[data-field]';
    const cells = [...document.querySelectorAll(`.record-table tbody ${selector}`)];
    const currentIndex = cells.findIndex((candidate) => (
      candidate.dataset.recordId === cell.dataset.recordId
      && candidate.dataset.field === cell.dataset.field
    ));
    const offset = key === 'Shift+Tab' ? -1 : 1;
    target = cells[currentIndex + offset] ?? cells[key === 'Shift+Tab' ? cells.length - 1 : 0] ?? null;
  }
  if (!(target instanceof HTMLElement)) return;
  selectCell(target.dataset.recordId, target.dataset.field);
}

function handleTableClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.cell-editor')) return;
  const cell = event.target.closest('td[data-field]');
  const row = event.target.closest('tr[data-record-id]');
  if (!(cell instanceof HTMLElement) || !(row instanceof HTMLElement)) {
    if (!row) return;
    state.selectedId = row.dataset.recordId;
    renderTable();
    return;
  }
  const { recordId, field } = cell.dataset;
  if (!recordId || !field) return;
  if (event.target.closest('[data-long-cell]')) {
    openLongTextCell(recordId);
    return;
  }
  closeLongTextCell();
  selectCell(recordId, field, { focus: false });
  if (field === 'starred' && event.target.closest('.boolean-cell')) {
    toggleBooleanCell(recordId, field);
    return;
  }
}

function handleTableDoubleClick(event) {
  if (!(event.target instanceof Element)) return;
  const cell = event.target.closest('td[data-field]');
  if (!(cell instanceof HTMLElement)) return;
  event.preventDefault();
  closeLongTextCell();
  startCellEdit(cell);
}

function handleTableKeyDown(event) {
  if (!(event.target instanceof Element) || event.target.closest('.cell-editor')) return;
  const cell = event.target.closest('td[data-field]');
  if (!(cell instanceof HTMLElement)) return;
  if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault();
    startCellEdit(cell);
    return;
  }
  if (event.key === ' ' && cell.dataset.field === 'starred') {
    event.preventDefault();
    toggleBooleanCell(cell.dataset.recordId, cell.dataset.field);
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
    event.preventDefault();
    moveCellSelection(cell, event.shiftKey && event.key === 'Tab' ? 'Shift+Tab' : event.key);
  }
}

function restoreFormulaBar() {
  if (state.cellSelection) {
    updateFormulaBarForSelection();
    return;
  }
  activeCellName.textContent = 'K6';
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
  document.querySelector('#cell-reader-title').textContent = `${cellFields.note.column}${rowNumber} · 备注`;
  document.querySelector('#cell-reader-copy').textContent = value || '当前单元格为空。';
  document.querySelector('#cell-reader-count').textContent = `${value.length} 字`;
  activeCellName.textContent = `${cellFields.note.column}${rowNumber}`;
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

function positionAnchoredSurface(trigger, panel, align = 'start') {
  if (!trigger || !panel) return;
  const workspaceRect = workspace.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const desiredLeft = align === 'end'
    ? triggerRect.right - workspaceRect.left - panelRect.width
    : triggerRect.left - workspaceRect.left;
  const maxLeft = Math.max(8, workspaceRect.width - panelRect.width - 8);
  panel.style.left = `${Math.max(8, Math.min(desiredLeft, maxLeft))}px`;
  panel.style.right = 'auto';
  panel.style.top = `${triggerRect.bottom - workspaceRect.top + 5}px`;
  panel.style.transform = 'none';
}

function closeRulePanels(except = null) {
  [
    ['open-filter', filterPanel],
    ['open-sort', sortPanel],
    ['open-group', groupPanel],
  ].forEach(([triggerId, panel]) => {
    if (panel === except) return;
    panel.hidden = true;
    document.querySelector(`#${triggerId}`).setAttribute('aria-expanded', 'false');
  });
}

let fieldDraft = null;

function fieldSchema(key = selectedFieldKey) {
  return fieldSchemas.find((candidate) => candidate.key === key) ?? null;
}

function fieldListButtons() {
  return [...document.querySelectorAll('.field-list > button[data-field-key]')];
}

function renderFieldOptions(options = []) {
  const optionsContainer = document.querySelector('#field-options');
  const heading = document.querySelector('#field-option-heading');
  const hasOptions = ['单选', '多选'].includes(fieldDraft?.type);
  heading.hidden = !hasOptions;
  optionsContainer.hidden = !hasOptions;
  if (!hasOptions) return;
  const colors = ['gray', 'blue', 'amber', 'purple', 'green', 'red'];
  optionsContainer.innerHTML = `
    ${options.map((option, index) => `<button type="button"><i class="option-dot ${colors[index % colors.length]}"></i><span>${escapeHtml(option)}</span>${icon('i-more')}</button>`).join('')}
    <button type="button" class="option-add">${icon('i-plus')}添加选项</button>
  `;
}

function selectFieldConfig(key) {
  const schema = fieldSchema(key);
  if (!schema) return;
  selectedFieldKey = key;
  fieldDraft = {
    name: schema.name,
    type: schema.type,
    options: [...(schema.options ?? [])],
  };
  fieldListButtons().forEach((button) => {
    button.classList.toggle('is-active', button.dataset.fieldKey === key);
  });
  document.querySelector('#field-editor-column').textContent = `${schema.column} 列`;
  document.querySelector('#field-editor-state').textContent = schema.saved ? '已保存' : '新增草稿';
  document.querySelector('#field-name-input').value = fieldDraft.name;
  document.querySelector('#selected-field-type').textContent = fieldDraft.type;
  document.querySelector('#field-save-status').textContent = schema.saved
    ? '可继续切换左侧字段，面板不会关闭'
    : '填写名称和类型后保存；仍可继续新增字段';
  document.querySelectorAll('[data-field-type]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.fieldType === fieldDraft.type);
  });
  renderFieldOptions(fieldDraft.options);
}

function addFieldListButton(schema) {
  const addButton = document.querySelector('#add-field');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.fieldKey = schema.key;
  button.innerHTML = `${icon('i-text')}<span>${escapeHtml(schema.name)}</span><svg class="field-eye"><use href="#i-eye"/></svg>`;
  button.addEventListener('click', () => selectFieldConfig(schema.key));
  addButton.before(button);
  return button;
}

function nextColumnLetter() {
  const index = Object.keys(cellFields).length;
  let value = index;
  let result = '';
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

function createCustomField() {
  const key = `custom${customFields.length + 1}`;
  const schema = {
    key,
    name: `新字段 ${customFields.length + 1}`,
    column: nextColumnLetter(),
    type: '单行文本',
    options: [],
    saved: false,
  };
  cellFields[key] = {
    column: schema.column,
    label: schema.name,
    type: 'text',
    custom: true,
    saved: false,
    get: (record) => cellOverrides[record.id]?.[key] ?? '',
    set: (record, value) => {
      cellOverrides[record.id] = { ...(cellOverrides[record.id] ?? {}), [key]: String(value).trim() };
    },
  };
  fieldSchemas.push(schema);
  customFields.push(schema);
  addFieldListButton(schema);
  selectFieldConfig(key);
  document.querySelector('#field-name-input').focus();
  document.querySelector('#field-name-input').select();
}

function saveCurrentField() {
  const schema = fieldSchema();
  const definition = cellFields[selectedFieldKey];
  if (!schema || !definition || !fieldDraft) return;
  const name = document.querySelector('#field-name-input').value.trim();
  if (!name) {
    showToast('字段名称不能为空', '先填写一个清楚、可辨认的字段名称');
    return;
  }
  schema.name = name;
  schema.type = fieldDraft.type;
  schema.options = [...fieldDraft.options];
  schema.saved = true;
  definition.label = name;
  definition.saved = true;
  const typeMap = {
    '单行文本': 'text',
    '多行文本': 'text',
    '数字': 'number',
    '复选框': 'checkbox',
    '日期与时间': 'date',
    '链接': 'url',
  };
  if (!definition.readOnly) definition.type = typeMap[fieldDraft.type] ?? definition.type;
  const listButton = document.querySelector(`[data-field-key="${selectedFieldKey}"]`);
  listButton?.querySelector('span:not(.formula-mark)')?.replaceChildren(name);
  document.querySelector('#field-editor-state').textContent = '刚刚保存';
  document.querySelector('#field-save-status').textContent = `“${name}”已保存，可继续选择其他字段`;
  document.querySelector('#field-count').textContent = `${fieldSchemas.filter((field) => field.saved).length} 个字段 · 3 个计算字段`;
  renderCurrentView();
  positionAnchoredSurface(document.querySelector('#open-fields'), document.querySelector('#field-panel'));
}

function configureFieldList() {
  const staticButtons = [...document.querySelectorAll('.field-list > button:not(.field-add)')];
  staticButtons.forEach((button, index) => {
    const schema = fieldSchemas[index];
    if (!schema) return;
    button.dataset.fieldKey = schema.key;
    button.addEventListener('click', () => selectFieldConfig(schema.key));
  });
  selectFieldConfig(selectedFieldKey);
}

function openFields() {
  const panel = document.querySelector('#field-panel');
  toast.hidden = true;
  closeLongTextCell();
  closeFormula();
  closeInlineFormula();
  closeFormatMenu();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
  closeAi();
  panel.hidden = false;
  document.querySelector('#open-fields').setAttribute('aria-expanded', 'true');
  selectFieldConfig(selectedFieldKey);
  positionAnchoredSurface(document.querySelector('#open-fields'), panel);
}

function closeFields() {
  document.querySelector('#field-panel').hidden = true;
  document.querySelector('#field-type-menu').hidden = true;
  document.querySelector('#open-fields').setAttribute('aria-expanded', 'false');
}

function closeInlineFormula() {
  inlineFormulaComposer.hidden = true;
  formulaDirect.hidden = false;
  document.querySelector('#open-formula').setAttribute('aria-pressed', 'false');
}

function openInlineFormula() {
  toast.hidden = true;
  closeLongTextCell();
  closeFields();
  closeFormula();
  closeFormatMenu();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
  closeAi();
  formulaDirect.hidden = true;
  inlineFormulaComposer.hidden = false;
  document.querySelector('#open-formula').setAttribute('aria-pressed', 'true');
  window.requestAnimationFrame(() => inlineFormulaPrompt.focus());
}

function openFormulaCandidates(prompt = '') {
  toast.hidden = true;
  closeLongTextCell();
  closeFields();
  closeFormatMenu();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
  closeAi();
  if (prompt) document.querySelector('#ai-formula-prompt').value = prompt;
  document.querySelector('#formula-generation-state').textContent = `已根据当前 ${fieldSchemas.filter((field) => field.saved).length} 个字段生成 3 个候选`;
  formulaPanel.hidden = false;
}

function closeFormula() {
  formulaPanel.hidden = true;
}

function openFormatMenu() {
  closeLongTextCell();
  closeFields();
  closeFormula();
  closeInlineFormula();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
  closeAi();
  formatMenu.hidden = false;
  document.querySelector('#open-format-menu').setAttribute('aria-expanded', 'true');
  positionAnchoredSurface(document.querySelector('#open-format-menu'), formatMenu);
}

function closeFormatMenu() {
  formatMenu.hidden = true;
  document.querySelector('#open-format-menu').setAttribute('aria-expanded', 'false');
}

function openRulePanel(trigger, panel) {
  toast.hidden = true;
  closeLongTextCell();
  closeFormatMenu();
  closeFields();
  closeFormula();
  closeInlineFormula();
  closeRulePanels(panel);
  closeDedupe();
  closeViewMenu();
  closeAi();
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  positionAnchoredSurface(trigger, panel);
}

function closeFilterPanel() {
  filterPanel.hidden = true;
  document.querySelector('#open-filter').setAttribute('aria-expanded', 'false');
}

function closeSortPanel() {
  sortPanel.hidden = true;
  document.querySelector('#open-sort').setAttribute('aria-expanded', 'false');
}

function closeGroupPanel() {
  groupPanel.hidden = true;
  document.querySelector('#open-group').setAttribute('aria-expanded', 'false');
}

function openDedupe() {
  toast.hidden = true;
  closeLongTextCell();
  closeFields();
  closeFormula();
  closeInlineFormula();
  closeFormatMenu();
  closeRulePanels();
  closeViewMenu();
  closeAi();
  dedupePanel.hidden = false;
  document.querySelector('#open-dedupe').setAttribute('aria-expanded', 'true');
  positionAnchoredSurface(document.querySelector('#open-dedupe'), dedupePanel, 'end');
}

function closeDedupe() {
  dedupePanel.hidden = true;
  document.querySelector('#open-dedupe').setAttribute('aria-expanded', 'false');
}

function updateDedupeSummary() {
  const selected = [...document.querySelectorAll('[data-dedupe-field].is-selected')]
    .map((button) => button.dataset.dedupeField);
  const mode = document.querySelector('#dedupe-match-mode').value === 'exact'
    ? '完全相同'
    : '忽略大小写与标点';
  document.querySelector('#dedupe-rule-summary').textContent = `${selected.join(' + ')}${mode}`;
}

function openAi() {
  toast.hidden = true;
  const contextItems = document.querySelectorAll('.ai-context span');
  const visibleCount = visibleRecords().length;
  document.querySelector('.ai-title small').textContent = `${visibleCount} 条记录 · revision 12`;
  if (contextItems[0]) contextItems[0].innerHTML = `${icon('i-database')}${state.view === 'table' ? '当前表格' : '当前视图'}`;
  if (contextItems[1]) contextItems[1].textContent = state.filters.length ? `${state.filters.length} 个筛选条件` : '无筛选';
  if (contextItems[2]) contextItems[2].textContent = `字段 ${fieldSchemas.filter((field) => field.saved).length}`;
  aiDrawer.classList.add('is-open');
  aiDrawer.setAttribute('aria-hidden', 'false');
  closeLongTextCell();
  closeFields();
  closeFormula();
  closeInlineFormula();
  closeFormatMenu();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
}

function closeAi() {
  aiDrawer.classList.remove('is-open');
  aiDrawer.setAttribute('aria-hidden', 'true');
}

function updateRuleToolbar() {
  const filterButton = document.querySelector('#open-filter');
  const filterCount = document.querySelector('#filter-count');
  filterCount.hidden = state.filters.length === 0;
  filterCount.textContent = String(state.filters.length);
  filterButton.classList.toggle('is-applied', state.filters.length > 0);

  const sortButton = document.querySelector('#open-sort');
  const sortCount = document.querySelector('#sort-count');
  sortCount.hidden = state.sortRules.length === 0;
  sortCount.textContent = String(state.sortRules.length);
  sortButton.classList.toggle('is-applied', state.sortRules.length > 0);

  const groupButton = document.querySelector('#open-group');
  const groupCount = document.querySelector('#group-count');
  groupCount.hidden = state.groupRules.length === 0;
  groupCount.textContent = String(state.groupRules.length);
  groupButton.classList.toggle('is-applied', state.groupRules.length > 0);
}

function renderAfterRuleChange() {
  updateRuleToolbar();
  renderCurrentView();
}

function clearFilter() {
  state.filters = [];
  state.filterDrafts = [];
  renderFilterRules();
  renderAfterRuleChange();
}

function clearSort() {
  state.sortRules = [];
  state.sortDrafts = [];
  renderSortRules();
  renderAfterRuleChange();
}

function clearGroup() {
  state.groupRules = [];
  state.groupDrafts = [];
  renderGroupRules();
  renderAfterRuleChange();
}

const ruleFields = [
  ['stageKey', '阶段'],
  ['workMode', '工作模式'],
  ['location', '地点'],
  ['fit', '匹配度'],
  ['wait', '等待天数'],
  ['applied', '申请日期'],
  ['company', '公司'],
  ['role', '职位'],
  ['salary', '薪资范围'],
  ['progress', '进度'],
];

function optionList(options, selected) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function renderFilterRules() {
  const container = document.querySelector('#filter-rules');
  const operators = Object.entries(operatorLabels);
  container.innerHTML = state.filterDrafts.map((rule, index) => `
    <div class="combination-rule" data-rule-id="${rule.id}">
      <span class="rule-order">${index + 1}</span>
      <select data-rule-part="field" aria-label="筛选字段">${optionList(ruleFields, rule.field)}</select>
      <select data-rule-part="operator" aria-label="筛选运算符">${optionList(operators, rule.operator)}</select>
      <input data-rule-part="value" value="${escapeHtml(rule.value)}" aria-label="筛选值" placeholder="输入值">
      <button type="button" class="rule-remove" data-rule-action="remove" aria-label="删除条件">${icon('i-x')}</button>
    </div>
  `).join('');
  updateFilterPreviewText();
  document.querySelector('#filter-rule-count').textContent = `${state.filterDrafts.length} 个条件`;
}

function updateFilterPreviewText() {
  const tentative = records.filter((record) => matchesRuleSet(record, state.filterDrafts, state.filterLogic)).length;
  document.querySelector('#filter-preview').textContent = state.filterDrafts.length === 0
    ? '无条件'
    : `预计显示 ${tentative} 条记录`;
}

function orderedRuleActions(index, length) {
  return `
    <button type="button" data-rule-action="up" ${index === 0 ? 'disabled' : ''} aria-label="上移">↑</button>
    <button type="button" data-rule-action="down" ${index === length - 1 ? 'disabled' : ''} aria-label="下移">↓</button>
    <button type="button" data-rule-action="remove" aria-label="删除">${icon('i-x')}</button>
  `;
}

function renderSortRules() {
  const container = document.querySelector('#sort-rules');
  const directions = [['desc', '降序 · 高到低'], ['asc', '升序 · 低到高']];
  container.innerHTML = state.sortDrafts.map((rule, index) => `
    <div class="combination-rule ordered-rule" data-rule-id="${rule.id}">
      <span class="rule-order">${index + 1}</span>
      <select data-rule-part="field" aria-label="排序字段">${optionList(ruleFields, rule.field)}</select>
      <select data-rule-part="direction" aria-label="排序方向">${optionList(directions, rule.direction)}</select>
      <span class="rule-row-actions">${orderedRuleActions(index, state.sortDrafts.length)}</span>
    </div>
  `).join('');
  document.querySelector('#sort-preview').textContent = state.sortDrafts.length
    ? state.sortDrafts.map((rule) => `${fieldLabels[rule.field] ?? rule.field} ${rule.direction === 'desc' ? '↓' : '↑'}`).join(' → ')
    : '不改变原始顺序';
  document.querySelector('#sort-rule-count').textContent = `${state.sortDrafts.length} 个排序条件`;
}

function renderGroupRules() {
  const container = document.querySelector('#group-rules');
  const groupFields = ruleFields.filter(([key]) => ['stageKey', 'workMode', 'location', 'company', 'role'].includes(key));
  const directions = [['asc', '升序'], ['desc', '降序']];
  container.innerHTML = state.groupDrafts.map((rule, index) => `
    <div class="combination-rule ordered-rule" data-rule-id="${rule.id}">
      <span class="rule-order">${index + 1}</span>
      <select data-rule-part="field" aria-label="分组字段">${optionList(groupFields, rule.field)}</select>
      <select data-rule-part="direction" aria-label="分组方向">${optionList(directions, rule.direction)}</select>
      <span class="rule-row-actions">${orderedRuleActions(index, state.groupDrafts.length)}</span>
    </div>
  `).join('');
  document.querySelector('#group-preview').textContent = state.groupDrafts.length
    ? state.groupDrafts.map((rule) => fieldLabels[rule.field] ?? rule.field).join(' → ')
    : '不分组';
  document.querySelector('#group-rule-count').textContent = `${state.groupDrafts.length} 个分组层级`;
}

function updateRuleDraft(event, rules, render) {
  const row = event.target.closest('[data-rule-id]');
  const part = event.target.dataset.rulePart;
  if (!row || !part) return;
  const rule = rules.find((candidate) => candidate.id === row.dataset.ruleId);
  if (!rule) return;
  rule[part] = event.target.value;
  render();
}

function handleRuleAction(event, rules, render) {
  const button = event.target.closest('[data-rule-action]');
  const row = event.target.closest('[data-rule-id]');
  if (!button || !row) return;
  const index = rules.findIndex((candidate) => candidate.id === row.dataset.ruleId);
  if (index < 0) return;
  const action = button.dataset.ruleAction;
  if (action === 'remove') rules.splice(index, 1);
  if (action === 'up' && index > 0) [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
  if (action === 'down' && index < rules.length - 1) [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
  render();
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
document.querySelector('#cancel-fields').addEventListener('click', () => selectFieldConfig(selectedFieldKey));
document.querySelector('#save-fields').addEventListener('click', saveCurrentField);
document.querySelector('#add-field').addEventListener('click', createCustomField);
document.querySelector('#field-name-input').addEventListener('input', (event) => {
  if (!fieldDraft) return;
  fieldDraft.name = event.target.value;
  document.querySelector('#field-editor-state').textContent = '未保存';
  document.querySelector('#field-save-status').textContent = '当前字段有未保存更改';
});
document.querySelector('#field-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  fieldListButtons().forEach((button) => {
    button.hidden = !button.textContent.toLowerCase().includes(query);
  });
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
    if (fieldDraft) fieldDraft.type = fieldType;
    document.querySelectorAll('[data-field-type]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
    });
    document.querySelector('#field-type-menu').hidden = true;
    document.querySelector('#field-editor-state').textContent = '未保存';
    document.querySelector('#field-save-status').textContent = `字段类型已改为“${fieldType}”，等待保存`;
    renderFieldOptions(fieldDraft?.options ?? []);
  });
});

document.querySelector('#open-formula').addEventListener('click', () => {
  if (inlineFormulaComposer.hidden) {
    openInlineFormula();
    return;
  }
  closeInlineFormula();
});
document.querySelector('#formula-function-button').addEventListener('click', () => {
  closeInlineFormula();
  formulaInput.focus();
});
document.querySelector('#cancel-inline-formula').addEventListener('click', closeInlineFormula);
document.querySelector('#generate-inline-formula').addEventListener('click', () => {
  const prompt = inlineFormulaPrompt.value.trim();
  if (!prompt) {
    showToast('先描述业务规则', '在公式栏直接写一句话，再生成可验证的候选');
    inlineFormulaPrompt.focus();
    return;
  }
  closeInlineFormula();
  openFormulaCandidates(prompt);
});
document.querySelector('#close-formula').addEventListener('click', closeFormula);
document.querySelector('#cancel-formula').addEventListener('click', closeFormula);
document.querySelector('#save-formula').addEventListener('click', () => {
  const selected = document.querySelector('.formula-candidate.is-selected .candidate-choice strong')?.textContent ?? '公式建议';
  closeFormula();
  closeInlineFormula();
  showToast('AI 公式已确认', `已选择“${selected}”；“行动优先级”将按 revision 12 重新计算`);
});

document.querySelector('#generate-formula-candidates').addEventListener('click', () => {
  const prompt = document.querySelector('#ai-formula-prompt').value.trim();
  if (!prompt) {
    showToast('先描述计算规则', '写一句业务语言，AI 才能生成候选公式');
    return;
  }
  document.querySelector('#formula-candidates').classList.remove('is-generated');
  void document.querySelector('#formula-candidates').offsetWidth;
  document.querySelector('#formula-candidates').classList.add('is-generated');
  document.querySelector('#formula-generation-state').textContent = '刚刚生成 · 3 个候选 · 已完成类型检查';
});

document.querySelectorAll('[data-formula-candidate]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-formula-candidate]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
    });
  });
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
    document.querySelector('#open-format-menu span').textContent = selectedFormat === '常规' ? '显示格式' : selectedFormat;
  });
});

document.querySelectorAll('[data-function]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-function]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === button);
    });
  });
});

document.querySelector('#open-filter').addEventListener('click', () => {
  if (!filterPanel.hidden) {
    closeFilterPanel();
    return;
  }
  openRulePanel(document.querySelector('#open-filter'), filterPanel);
});
document.querySelector('#close-filter').addEventListener('click', closeFilterPanel);
document.querySelector('#clear-filter').addEventListener('click', clearFilter);
document.querySelector('#apply-filter').addEventListener('click', () => {
  if (state.filterDrafts.some((rule) => !String(rule.value).trim())) {
    showToast('筛选值不能为空', '补全每个组合条件后再应用');
    return;
  }
  state.filters = state.filterDrafts.map((rule) => ({ ...rule }));
  state.filterLogic = document.querySelector('#filter-logic').value;
  closeFilterPanel();
  renderAfterRuleChange();
});
document.querySelector('#filter-logic').addEventListener('change', (event) => {
  state.filterLogic = event.target.value;
  renderFilterRules();
});
document.querySelector('#filter-rules').addEventListener('input', (event) => updateRuleDraft(event, state.filterDrafts, updateFilterPreviewText));
document.querySelector('#filter-rules').addEventListener('change', (event) => updateRuleDraft(event, state.filterDrafts, renderFilterRules));
document.querySelector('#filter-rules').addEventListener('click', (event) => handleRuleAction(event, state.filterDrafts, renderFilterRules));
document.querySelector('#add-filter-rule').addEventListener('click', () => {
  state.filterDrafts.push({ id: createRuleId('filter'), field: 'stageKey', operator: 'equals', value: '' });
  renderFilterRules();
});
document.querySelector('#generate-filter-rules').addEventListener('click', () => {
  const prompt = document.querySelector('#filter-ai-prompt').value.trim();
  if (!prompt) {
    showToast('先描述筛选目标', '例如：高匹配、等待超过一周、且尚未结束');
    return;
  }
  state.filterLogic = 'all';
  document.querySelector('#filter-logic').value = 'all';
  state.filterDrafts = [
    { id: createRuleId('filter'), field: 'fit', operator: 'gte', value: '85' },
    { id: createRuleId('filter'), field: 'wait', operator: 'gte', value: '7' },
    { id: createRuleId('filter'), field: 'stageKey', operator: 'notEquals', value: '已结束' },
  ];
  renderFilterRules();
});

document.querySelector('#open-sort').addEventListener('click', () => {
  if (!sortPanel.hidden) {
    closeSortPanel();
    return;
  }
  openRulePanel(document.querySelector('#open-sort'), sortPanel);
});
document.querySelector('#close-sort').addEventListener('click', closeSortPanel);
document.querySelector('#clear-sort').addEventListener('click', clearSort);
document.querySelector('#apply-sort').addEventListener('click', () => {
  state.sortRules = state.sortDrafts.map((rule) => ({ ...rule }));
  closeSortPanel();
  renderAfterRuleChange();
});
document.querySelector('#sort-rules').addEventListener('change', (event) => updateRuleDraft(event, state.sortDrafts, renderSortRules));
document.querySelector('#sort-rules').addEventListener('click', (event) => handleRuleAction(event, state.sortDrafts, renderSortRules));
document.querySelector('#add-sort-rule').addEventListener('click', () => {
  state.sortDrafts.push({ id: createRuleId('sort'), field: 'applied', direction: 'desc' });
  renderSortRules();
});
document.querySelector('#generate-sort-rules').addEventListener('click', () => {
  const prompt = document.querySelector('#sort-ai-prompt').value.trim();
  if (!prompt) {
    showToast('先描述排序目标', '例如：匹配度优先，其次等待时间，再按申请日期');
    return;
  }
  state.sortDrafts = [
    { id: createRuleId('sort'), field: 'fit', direction: 'desc' },
    { id: createRuleId('sort'), field: 'wait', direction: 'desc' },
    { id: createRuleId('sort'), field: 'applied', direction: 'desc' },
  ];
  renderSortRules();
});

document.querySelector('#open-group').addEventListener('click', () => {
  if (!groupPanel.hidden) {
    closeGroupPanel();
    return;
  }
  openRulePanel(document.querySelector('#open-group'), groupPanel);
});
document.querySelector('#close-group').addEventListener('click', closeGroupPanel);
document.querySelector('#clear-group').addEventListener('click', clearGroup);
document.querySelector('#apply-group').addEventListener('click', () => {
  state.groupRules = state.groupDrafts.map((rule) => ({ ...rule }));
  closeGroupPanel();
  updateRuleToolbar();
  if (state.view !== 'table') {
    setView('table');
  } else {
    renderAfterRuleChange();
  }
});
document.querySelector('#group-rules').addEventListener('change', (event) => updateRuleDraft(event, state.groupDrafts, renderGroupRules));
document.querySelector('#group-rules').addEventListener('click', (event) => handleRuleAction(event, state.groupDrafts, renderGroupRules));
document.querySelector('#add-group-rule').addEventListener('click', () => {
  if (state.groupDrafts.length >= 3) {
    showToast('最多三层分组', '先调整或删除现有层级');
    return;
  }
  state.groupDrafts.push({ id: createRuleId('group'), field: 'location', direction: 'asc' });
  renderGroupRules();
});
document.querySelector('#generate-group-rules').addEventListener('click', () => {
  const prompt = document.querySelector('#group-ai-prompt').value.trim();
  if (!prompt) {
    showToast('先描述分组方式', '例如：先按阶段，再按工作模式');
    return;
  }
  state.groupDrafts = [
    { id: createRuleId('group'), field: 'stageKey', direction: 'asc' },
    { id: createRuleId('group'), field: 'workMode', direction: 'asc' },
  ];
  renderGroupRules();
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

document.querySelector('#open-dedupe').addEventListener('click', () => {
  if (dedupePanel.hidden) {
    openDedupe();
    return;
  }
  closeDedupe();
});
document.querySelector('#close-dedupe').addEventListener('click', closeDedupe);
document.querySelector('#cancel-dedupe').addEventListener('click', closeDedupe);
document.querySelectorAll('[data-dedupe-field]').forEach((button) => {
  button.addEventListener('click', () => {
    const selectedCount = document.querySelectorAll('[data-dedupe-field].is-selected').length;
    if (button.classList.contains('is-selected') && selectedCount === 1) {
      showToast('至少保留一个比较字段', '重复项检查需要一个稳定的判断依据');
      return;
    }
    button.classList.toggle('is-selected');
    const selected = button.classList.contains('is-selected');
    button.setAttribute('aria-pressed', String(selected));
    updateDedupeSummary();
  });
});
document.querySelector('#dedupe-match-mode').addEventListener('change', updateDedupeSummary);
document.querySelector('#preview-dedupe').addEventListener('click', () => {
  const selected = [...document.querySelectorAll('[data-dedupe-field].is-selected')]
    .map((button) => button.dataset.dedupeField)
    .join(' + ');
  closeDedupe();
  showToast('发现 2 组可能重复项', `已按“${selected}”生成预览；尚未删除任何记录`);
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
  state.filters = [{ id: createRuleId('filter'), field: 'fit', operator: 'gte', value: '80' }];
  state.filterDrafts = state.filters.map((rule) => ({ ...rule }));
  state.filterLogic = 'all';
  closeAi();
  setView('table');
  updateRuleToolbar();
  showToast('“高匹配岗位”筛选已应用', '匹配度不低于 80；源 Markdown 尚未改写');
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
  if (cancelCellEdit()) {
    event.preventDefault();
    return;
  }
  closeAi();
  closeFields();
  closeFormula();
  closeInlineFormula();
  closeFormatMenu();
  closeRulePanels();
  closeDedupe();
  closeViewMenu();
  closeLongTextCell();
  closeDialog('#source-dialog');
  closeDialog('#mobile-overlay');
});

configureFieldList();
renderFilterRules();
renderSortRules();
renderGroupRules();
updateRuleToolbar();
renderCurrentView({ animate: true });
