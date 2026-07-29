(() => {
  const state = {
    screen: 'landing',
    sourceMode: 'list',
    density: 'detailed',
    graphKind: 'vault',
    graphScope: 'evidence',
    graphPreset: 'constellation',
    semantic: false,
    aiMapGenerated: false,
    instructionApplied: false,
    generationTimer: null,
  };

  const query =
    '这份《Peak Composer Visual Parity QA》要表达什么？它对 Composer 设计提出了哪些可验收要求？';

  const sourceRows = [
    {
      code: 'MD',
      title: 'Peak Composer Visual Parity QA.md',
      path: '/Peak Composer Visual Parity QA.md',
      reason: 'Primary evidence · 当前分析对象',
      snippet: '定义内容覆盖、写回合同、block-adjacent AI patch 与真实 Obsidian 验收边界。',
      sections: ['S1', 'S2', 'S3'],
    },
    {
      code: 'QA',
      title: 'obsidian-real-ui-qa.md',
      path: '/docs/conventions/obsidian-real-ui-qa.md',
      reason: 'Acceptance contract · 真实 UI 证据',
      snippet: '明确 CDP、Computer Use、harness 的职责和不可替代关系。',
      sections: ['S4'],
    },
    {
      code: 'UI',
      title: 'ui-design.md',
      path: '/docs/conventions/ui-design.md',
      reason: 'UI convention · 交互与几何约束',
      snippet: '固定命中区必须防御 Obsidian button reset，并用真实 computed geometry 验证。',
      sections: ['S4'],
    },
    {
      code: 'AI',
      title: 'shared-ai-instruction-composer.md',
      path: '/docs/superpowers/specs/2026-07-28-shared-ai-instruction-composer.md',
      reason: 'Related design · 指令输入与提交边界',
      snippet: '统一多行输入、显式提交、上下文可见性和 IME 安全行为。',
      sections: ['S3'],
    },
    {
      code: 'IMG',
      title: 'ai-knowledge-workflow-illustration.png',
      path: '/docs/gstack/peak-composer-editing-view-2026-07-09/assets/ai-knowledge-workflow-illustration.png',
      reason: 'Embedded asset · 富内容验证',
      snippet: '用于验证真实图片、资源 URI 与自然尺寸在 Composer 中的渲染。',
      sections: ['S1', 'S3'],
    },
    {
      code: 'SPEC',
      title: 'machine-record-storage-jsonl-design.md',
      path: '/docs/superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md',
      reason: 'Architecture context · source-of-truth boundary',
      snippet: '区分 machine run records、可重建 read models 与用户文档。',
      sections: ['S2'],
    },
  ];

  const planSections = [
    {
      title: 'Composer 的目标不是“富文本外观”，而是块级知识工作',
      question: '这份 QA fixture 为什么同时放入图、公式、代码、任务和链接？',
      format: 'Evidence brief + content chart',
      coverage: '3 direct sources',
    },
    {
      title: '内容类型与写回行为必须形成一张可验收矩阵',
      question: '不同 block 应该如何编辑、引用、转换与安全写回？',
      format: 'Comparison table',
      coverage: '4 direct sources',
    },
    {
      title: 'AI 建议应靠近 block，并经过 preview → apply → undo',
      question: '怎样让 AI 修改可见、可控、可撤销，而不是一次性覆盖？',
      format: 'Flow + annotated image',
      coverage: '3 direct sources',
    },
    {
      title: '视觉相似不是验收；证据必须覆盖四个层次',
      question: '什么证据才足以证明真实 Obsidian 中的行为成立？',
      format: 'Acceptance ladder',
      coverage: '2 direct sources',
    },
  ];

  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const runBar = document.getElementById('mock-run-bar');
  const toast = document.getElementById('toast');

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function clearGenerationTimer() {
    if (!state.generationTimer) {
      return;
    }
    window.clearTimeout(state.generationTimer);
    state.generationTimer = null;
  }

  function setScreen(screen, options = {}) {
    clearGenerationTimer();
    state.screen = screen;
    document.querySelectorAll('.checkpoint').forEach((button) => {
      button.classList.toggle('active', button.dataset.screen === screen);
    });
    render();

    if (screen !== 'generating' || options.hold) {
      return;
    }

    state.generationTimer = window.setTimeout(() => {
      state.screen = 'report';
      document.querySelectorAll('.checkpoint').forEach((button) => {
        button.classList.toggle('active', button.dataset.screen === 'report');
      });
      render();
      showToast('4 个章节已完成 · Report 保持 active');
    }, 3200);
  }

  function renderRunBar() {
    const visible = state.screen !== 'landing';
    runBar.hidden = !visible;
    if (!visible) {
      runBar.innerHTML = '';
      return;
    }

    runBar.innerHTML = `
      <div class="run-query">
        <strong>${query}</strong>
        <span>Current note + Vault · 6 cited sources · illustrative review fixture</span>
      </div>
      <div class="run-actions">
        <button type="button" data-action="back-to-landing">New analysis</button>
        <button type="button" data-action="show-activity">Activity</button>
      </div>
    `;
  }

  function renderLanding() {
    modalBody.innerHTML = `
      <div class="landing-shell">
        <div class="landing-composer">
          <div class="composer-shell">
            <input id="analysis-query" value="${query}" aria-label="Ask AI Search">
            <button class="web-toggle" type="button" aria-pressed="false" data-action="toggle-web">Web off</button>
            <button class="composer-action" type="button" data-action="start-analysis">Analyze</button>
          </div>
          <div class="context-shelf" aria-label="Search context">
            <span class="context-chip primary">Current note · Peak Composer Visual Parity QA.md</span>
            <span class="context-chip">Vault</span>
            <span class="context-chip">Web off</span>
          </div>
        </div>

        <section class="landing-section">
          <div class="landing-section-title">
            <h3>Start from current context</h3>
            <span>具体上下文，不声称“为你推荐”</span>
          </div>
          <div class="quick-start-grid">
            <button class="quick-start" type="button" data-action="start-analysis">
              <em>CURRENT NOTE</em>
              <strong>解释这份 QA 文档的设计意图</strong>
              <span>识别内容覆盖、写回边界与验收要求</span>
            </button>
            <button class="quick-start" type="button" data-action="start-analysis">
              <em>COMPARE</em>
              <strong>比较 Composer 与 Markdown 编辑路径</strong>
              <span>按任务、摩擦点与证据类型组织答案</span>
            </button>
            <button class="quick-start" type="button" data-action="start-analysis">
              <em>EVIDENCE</em>
              <strong>找出尚未被真实 UI 验证的行为</strong>
              <span>只输出 evidence gaps，不强行生成行动计划</span>
            </button>
          </div>
        </section>

        <section class="landing-section">
          <div class="landing-section-title">
            <h3>Continue your analysis</h3>
            <span>一个 history surface</span>
          </div>
          <div class="analysis-history">
            <button class="analysis-row" type="button" data-action="resume-analysis">
              <span class="analysis-icon">AI</span>
              <span class="analysis-main">
                <strong>Composer visual parity：可验收要求</strong>
                <span>Report ready · 6 sources · 4 sections</span>
              </span>
              <time>12 min</time>
            </button>
            <button class="analysis-row" type="button" data-action="resume-analysis">
              <span class="analysis-icon">AI</span>
              <span class="analysis-main">
                <strong>Command Palette governance 边界</strong>
                <span>Evidence collected · plan not reviewed</span>
              </span>
              <time>Yesterday</time>
            </button>
          </div>
        </section>
      </div>
    `;

    modalFooter.innerHTML = `
      <div class="footer-hints">
        <span><kbd>↵</kbd> Analyze</span>
        <span>Current context is visible before the run</span>
      </div>
      <span class="footer-count">No synthetic “1,141 analyses” metric</span>
    `;
  }

  function renderActivitySummary() {
    return `
      <div class="activity-summary" aria-label="Research activity summary">
        <div class="activity-primary">
          <strong>Evidence ready · 9.4s</strong>
          <span>Review-realistic simulator fixture · expandable tool trace</span>
        </div>
        <div class="activity-metric"><strong>4</strong><span>folders scanned</span></div>
        <div class="activity-metric"><strong>9</strong><span>files considered</span></div>
        <div class="activity-metric"><strong>6</strong><span>files read</span></div>
        <div class="activity-metric"><strong>42,780</strong><span>characters read</span></div>
        <div class="activity-metric"><strong>6</strong><span>sources cited</span></div>
      </div>
    `;
  }

  function renderPlanRows() {
    return planSections
      .map(
        (section, index) => `
          <div class="plan-section-row">
            <span class="section-order">${index + 1}</span>
            <div class="plan-section-main">
              <strong>${section.title}</strong>
              <p>${section.question}</p>
              <div class="plan-section-meta">
                <span class="coverage-chip good">${section.coverage}</span>
                <span class="format-chip">${section.format}</span>
                ${index === 0 ? '<span class="status-chip">Independent</span>' : ''}
                ${index === 3 ? '<span class="status-chip">Depends on S1–S3 evidence</span>' : ''}
              </div>
            </div>
            <button class="row-menu" type="button" aria-label="Edit section">•••</button>
          </div>
        `,
      )
      .join('');
  }

  function renderPlan() {
    modalBody.innerHTML = `
      <div class="plan-shell">
        ${renderActivitySummary()}
        <section class="plan-card">
          <div class="plan-card-head">
            <div>
              <h3>Answer plan · 4 evidence-backed sections</h3>
              <p>结构来自这次问题，不按 Synthesis / Decomposition / Action Plan 固定分组。</p>
            </div>
            <span class="coverage-chip good">No blocking gaps</span>
          </div>
          ${renderPlanRows()}
          <div class="refine-plan">
            <label for="plan-instruction">Refine the answer plan</label>
            <div class="refine-grid">
              <textarea id="plan-instruction" placeholder="例如：把写回行为单独做成表格；不要给泛化行动建议。">${state.instructionApplied ? '把写回行为单独做成表格；不要给泛化行动建议。' : ''}</textarea>
              <button class="apply-plan" type="button" data-action="apply-plan">Apply to plan</button>
            </div>
            <p class="plan-hint">Enter 换行 · Cmd/Ctrl+Enter 应用 · 中文输入法选词不会提交</p>
          </div>
        </section>
        <div class="plan-actions">
          <button class="secondary-button" type="button" data-action="show-activity">View activity details</button>
          <button class="generate-report" type="button" data-action="generate-report">Generate report</button>
        </div>
      </div>
    `;

    renderWorkspaceFooter('activity');
    bindPlanComposer();
  }

  function bindPlanComposer() {
    const instruction = document.getElementById('plan-instruction');
    if (!instruction) {
      return;
    }

    let isComposing = false;
    instruction.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    instruction.addEventListener('compositionend', () => {
      isComposing = false;
    });
    instruction.addEventListener('keydown', (event) => {
      if (isComposing || event.isComposing || event.keyCode === 229) {
        return;
      }
      if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      applyPlanInstruction();
    });
  }

  function applyPlanInstruction() {
    const instruction = document.getElementById('plan-instruction');
    if (!instruction || !instruction.value.trim()) {
      showToast('先写一条要应用到计划的指令');
      return;
    }
    state.instructionApplied = true;
    showToast('计划已更新：S2 保留表格；不添加泛化行动建议');
  }

  function renderReportOutline(generating) {
    return `
      <aside class="report-outline" aria-label="Report outline">
        <h3>REPORT OUTLINE</h3>
        ${planSections
          .map((section, index) => {
            let status = '✓';
            if (generating && index === 1) {
              status = '◌';
            }
            if (generating && index > 1) {
              status = '·';
            }
            return `
              <button class="outline-link ${index === 0 ? 'active' : ''}" type="button" data-action="scroll-section" data-index="${index + 1}">
                <span class="outline-status">${status}</span>
                <span>${section.title}</span>
              </button>
            `;
          })
          .join('')}
      </aside>
    `;
  }

  function renderContentChart() {
    const rows = [
      ['Sections', 36, 5],
      ['Embeds', 36, 5],
      ['Math blocks', 50, 7],
      ['Code blocks', 16, 2],
      ['Tasks', 57, 8],
      ['Wikilinks', 72, 10],
    ];
    return `
      <div class="content-chart" aria-label="Content footprint chart">
        <h4>Fixture content footprint</h4>
        ${rows
          .map(
            ([label, value, count]) => `
              <div class="chart-row">
                <span>${label}</span>
                <span class="chart-track"><span style="--value:${value}%"></span></span>
                <b>${count}</b>
              </div>
            `,
          )
          .join('')}
      </div>
    `;
  }

  function renderGeneratingReport() {
    return `
      <div class="report-shell">
        ${renderReportOutline(true)}
        <article class="report-article">
          <div class="report-progress-banner">
            <div>
              <strong>Report is active · 1 of 4 sections complete</strong>
              <span>S2 正在生成；S3–S4 将在各自位置出现。Activity 仍可查看。</span>
            </div>
            <span class="progress-track"><span style="width: 31%"></span></span>
          </div>
          <div class="report-top-actions">
            <button type="button" data-action="copy-report">Copy</button>
            <button type="button" data-action="save-report">Save to Vault</button>
          </div>
          ${renderSectionOne()}
          <section class="report-block" id="mock-section-2">
            <div class="report-block-head">
              <div>
                <h3>2. 内容类型与写回行为必须形成一张可验收矩阵</h3>
                <small>Streaming · 2 of 4 source excerpts resolved</small>
              </div>
              <span class="status-chip">Generating</span>
            </div>
            <p>同一份文档中的 prose、table、task、math、code 与 image 并不共享同一种编辑和写回风险，因此……</p>
            <div class="streaming-line"></div>
            <div class="streaming-line"></div>
            <div class="streaming-line"></div>
          </section>
          ${renderPendingSection(3, planSections[2].title)}
          ${renderPendingSection(4, planSections[3].title)}
        </article>
      </div>
    `;
  }

  function renderPendingSection(index, title) {
    return `
      <section class="report-block" id="mock-section-${index}">
        <div class="report-block-head">
          <div>
            <h3>${index}. ${title}</h3>
            <small>Waiting for evidence-backed section dependency</small>
          </div>
          <span class="status-chip">Pending</span>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </section>
    `;
  }

  function renderSectionOne() {
    return `
      <section class="report-block" id="mock-section-1">
        <div class="report-block-head">
          <div>
            <h3>1. Composer 的目标不是“富文本外观”，而是块级知识工作</h3>
            <small>Complete · 3 source paths · evidence coverage strong</small>
          </div>
          <span class="status-chip good">Complete</span>
        </div>
        <p>
          这份 QA fixture 把图片、数学公式、代码、任务、wikilink 与外部链接放进同一篇笔记，不是在追求一张“看起来丰富”的截图。
          它在验证 Composer 能否把不同 block 当成不同的工作对象，同时保持源文件字节、资源解析和阅读结构可追踪。
          <a class="citation-chip" href="#boundary">Peak Composer Visual Parity QA.md · L1</a>
          <a class="citation-chip" href="#boundary">workflow illustration · asset</a>
        </p>
        <div class="rich-grid">
          ${renderContentChart()}
          <figure class="report-image">
            <img src="../peak-composer-editing-view-2026-07-09/assets/ai-knowledge-workflow-illustration.png" alt="AI knowledge workflow illustration">
          </figure>
        </div>
      </section>
    `;
  }

  function renderFullReport() {
    modalBody.innerHTML = `
      <div class="report-shell">
        ${renderReportOutline(false)}
        <article class="report-article">
          <div class="report-progress-banner">
            <div>
              <strong>Report complete · 4 sections · 6 cited sources</strong>
              <span>Illustrative simulator fixture grounded in the real QA document.</span>
            </div>
            <span class="progress-track"><span style="width: 100%"></span></span>
          </div>
          <div class="report-top-actions">
            <button type="button" data-action="copy-report">Copy</button>
            <button type="button" data-action="save-report">Save to Vault</button>
          </div>
          <section class="report-summary">
            <h3>Answer in brief</h3>
            <p>
              这份文档把 Composer 定义成一个 block-level knowledge workspace：内容渲染只是第一层，
              真正的合同是精确选择、邻近式 AI 建议、安全写回和真实 Obsidian 证据。它因此要求按内容类型和交互类型验收，
              而不是用一张静态截图或绿色 harness 代替产品行为。
            </p>
          </section>
          ${renderSectionOne()}
          <section class="report-block" id="mock-section-2">
            <div class="report-block-head">
              <div>
                <h3>2. 内容类型与写回行为必须形成一张可验收矩阵</h3>
                <small>Complete · comparison table · 4 direct sources</small>
              </div>
              <span class="status-chip good">Complete</span>
            </div>
            <p>
              富内容不是一个 renderer 开关。每种 block 都有自己的选择单位、允许操作、写回风险和验收证据；
              所以实现与 QA 都应围绕这张合同表组织。<a class="citation-chip" href="#boundary">ui-design.md</a>
              <a class="citation-chip" href="#boundary">Peak Composer Visual Parity QA.md</a>
            </p>
            <table class="report-table">
              <thead>
                <tr><th>Block</th><th>Primary operation</th><th>Writeback contract</th><th>Evidence</th></tr>
              </thead>
              <tbody>
                <tr><td>Prose / list</td><td>range selection, rewrite, split</td><td>preserve neighbouring Markdown</td><td>source bytes + forward/reverse selection clip</td></tr>
                <tr><td>Table</td><td>cell, row, column operations</td><td>retain alignment and escaped pipes</td><td>DOM geometry + hover corridor video</td></tr>
                <tr><td>Math / code</td><td>block edit and explain</td><td>preserve delimiters and language fence</td><td>source snapshot + syntax render</td></tr>
                <tr><td>Image</td><td>inspect, replace, caption</td><td>real resource URI and attachment path</td><td>natural size + source SHA</td></tr>
                <tr><td>Task</td><td>toggle, reorder, enrich</td><td>minimal line patch, undoable</td><td>before/after source + history sequence</td></tr>
              </tbody>
            </table>
          </section>
          <section class="report-block" id="mock-section-3">
            <div class="report-block-head">
              <div>
                <h3>3. AI 建议应靠近 block，并经过 preview → apply → undo</h3>
                <small>Complete · interaction flow · 3 direct sources</small>
              </div>
              <span class="status-chip good">Complete</span>
            </div>
            <p>
              “让 AI 修改文档”不是一次性覆盖整篇文件。建议应携带目标 block、证据范围和拟议 patch，
              用户先看 diff，再选择应用或放弃；应用后焦点和撤销链必须可证明。
              <a class="citation-chip" href="#boundary">shared-ai-instruction-composer.md</a>
            </p>
            <div class="process-diagram" aria-label="Block-adjacent AI patch flow">
              <span>Select block</span><i>→</i><span>Ask in context</span><i>→</i><span>Preview patch</span><i>→</i><span>Apply + Undo</span>
            </div>
          </section>
          <section class="report-block" id="mock-section-4">
            <div class="report-block-head">
              <div>
                <h3>4. 视觉相似不是验收；证据必须覆盖四个层次</h3>
                <small>Complete · acceptance ladder · 2 direct sources</small>
              </div>
              <span class="status-chip good">Complete</span>
            </div>
            <p>
              静态 mock 只证明方向，harness 只适合快速 characterization。对真实交互的完成声明必须同时回答：
              源文件有没有保持、运行时 DOM 是否正确、交互序列是否成立、最终视觉是否可比较。
              <a class="citation-chip" href="#boundary">obsidian-real-ui-qa.md</a>
            </p>
            <div class="acceptance-chart">
              <article><strong>1 · Source</strong><span>byte snapshot, SHA, exact patch</span></article>
              <article><strong>2 · Runtime</strong><span>real Obsidian DOM and computed geometry</span></article>
              <article><strong>3 · Interaction</strong><span>focus, keyboard, hover, drag or history sequence</span></article>
              <article><strong>4 · Visual</strong><span>reference, normalized current, overlay and manifest</span></article>
            </div>
          </section>
        </article>
      </div>
    `;

    renderWorkspaceFooter('report');
  }

  function renderSourceRows() {
    return sourceRows
      .map(
        (source) => `
          <div class="source-row">
            <span class="source-file-icon">${source.code}</span>
            <div class="source-main">
              <strong>${source.title}</strong>
              ${state.density === 'detailed' ? `<p>${source.snippet}</p>` : ''}
              <span class="source-path">${source.path}</span>
            </div>
            <div class="source-use">
              <span class="source-chip">${source.reason}</span>
              ${source.sections.map((section) => `<span class="citation-chip">${section}</span>`).join('')}
            </div>
          </div>
        `,
      )
      .join('');
  }

  function renderTree() {
    return `
      <div class="tree-view">
        <div class="tree-group">
          <div class="tree-folder">▾ / · 1 cited file</div>
          <div class="tree-file"><span>MD</span><strong>Peak Composer Visual Parity QA.md</strong><span>S1 · S2 · S3</span></div>
        </div>
        <div class="tree-group">
          <div class="tree-folder">▾ docs/conventions · 2 cited files</div>
          <div class="tree-file"><span>QA</span><strong>obsidian-real-ui-qa.md</strong><span>S4</span></div>
          <div class="tree-file"><span>UI</span><strong>ui-design.md</strong><span>S4</span></div>
        </div>
        <div class="tree-group">
          <div class="tree-folder">▾ docs/superpowers/specs · 2 cited files</div>
          <div class="tree-file"><span>AI</span><strong>shared-ai-instruction-composer.md</strong><span>S3</span></div>
          <div class="tree-file"><span>SPEC</span><strong>machine-record-storage-jsonl-design.md</strong><span>S2</span></div>
        </div>
        <div class="tree-group">
          <div class="tree-folder">▾ docs/gstack/.../assets · 1 cited file</div>
          <div class="tree-file"><span>IMG</span><strong>ai-knowledge-workflow-illustration.png</strong><span>S1 · S3</span></div>
        </div>
      </div>
    `;
  }

  function graphControls() {
    const vaultScopes = [
      ['evidence', 'Evidence set'],
      ['one-hop', '1-hop'],
      ['two-hop', '2-hop'],
    ];
    const layouts = [
      ['constellation', 'Constellation'],
      ['flow-down', 'Flow ↓'],
      ['flow-right', 'Flow →'],
      ['folder', 'Folder tree'],
      ['orbit', 'Orbit'],
    ];
    return `
      <div class="graph-toolbar">
        <div class="graph-toolbar-row">
          <div class="segmented" aria-label="Graph data kind">
            <button class="${state.graphKind === 'vault' ? 'active' : ''}" type="button" data-graph-kind="vault">Vault graph</button>
            <button class="${state.graphKind === 'ai' ? 'active' : ''}" type="button" data-graph-kind="ai">AI relationship map</button>
          </div>
          <span class="source-count">${state.graphKind === 'vault' ? 'Deterministic file relations' : 'Extracted / inferred relations · reviewable'}</span>
        </div>
        <div class="graph-toolbar-row">
          <div class="filter-strip">
            <span>SCOPE</span>
            ${vaultScopes
              .map(
                ([value, label]) =>
                  `<button class="${state.graphScope === value ? 'active' : ''}" type="button" data-graph-scope="${value}">${label}</button>`,
              )
              .join('')}
          </div>
          <div class="filter-strip">
            <span>LAYOUT</span>
            ${layouts
              .map(
                ([value, label]) =>
                  `<button class="${state.graphPreset === value ? 'active' : ''}" type="button" data-graph-preset="${value}">${label}</button>`,
              )
              .join('')}
          </div>
          <label class="semantic-toggle">
            <input id="semantic-toggle" type="checkbox" ${state.semantic ? 'checked' : ''}>
            Semantic edges
          </label>
        </div>
      </div>
    `;
  }

  function renderVaultGraph() {
    return `
      <div class="graph-canvas" aria-label="Vault graph evidence projection">
        <span class="graph-edge" style="left:27%;top:42%;width:25%;transform:rotate(-13deg)"></span>
        <span class="graph-edge" style="left:27%;top:45%;width:26%;transform:rotate(19deg)"></span>
        <span class="graph-edge" style="left:51%;top:31%;width:20%;transform:rotate(-17deg)"></span>
        <span class="graph-edge" style="left:51%;top:31%;width:20%;transform:rotate(31deg)"></span>
        <span class="graph-edge ${state.semantic ? 'semantic' : ''}" style="left:49%;top:62%;width:21%;transform:rotate(2deg)"></span>
        <span class="graph-node hub" style="left:16%;top:37%">QA fixture</span>
        <span class="graph-node" style="left:45%;top:21%">Real UI QA</span>
        <span class="graph-node" style="left:45%;top:55%">Shared AI composer</span>
        <span class="graph-node" style="left:70%;top:14%">UI design</span>
        <span class="graph-node" style="left:70%;top:48%">Workflow image</span>
        <span class="graph-node" style="left:68%;top:71%">Storage boundary</span>
        <div class="graph-legend">
          <span>━━ Vault relation</span>
          <span>${state.semantic ? '┄┄ Indexed semantic edge' : 'Semantic edges off'}</span>
        </div>
      </div>
    `;
  }

  function renderAiGraph() {
    if (!state.aiMapGenerated) {
      return `
        <div class="ai-map-empty">
          <div>
            <strong>Generate an AI relationship map from these 6 sources</strong>
            <p>AI 会提取概念、主张、支持与冲突关系。每条边保留 evidence path 和 extracted / inferred provenance；不会写入 Vault links。</p>
            <button class="ai-map-generate" type="button" data-action="generate-ai-map">Generate relationship map</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="graph-canvas" aria-label="AI generated relationship map">
        <span class="graph-edge semantic" style="left:25%;top:38%;width:26%;transform:rotate(-14deg)"></span>
        <span class="graph-edge semantic" style="left:25%;top:42%;width:26%;transform:rotate(19deg)"></span>
        <span class="graph-edge" style="left:50%;top:27%;width:22%;transform:rotate(3deg)"></span>
        <span class="graph-edge semantic" style="left:50%;top:61%;width:22%;transform:rotate(-8deg)"></span>
        <span class="graph-edge semantic" style="left:74%;top:30%;width:1.5px;height:122px"></span>
        <span class="graph-node hub" style="left:14%;top:35%">Block-level knowledge work</span>
        <span class="graph-node ai" style="left:44%;top:18%">Rich content is a test surface</span>
        <span class="graph-node ai" style="left:44%;top:55%">AI edits require patch contracts</span>
        <span class="graph-node ai" style="left:72%;top:20%">Source + runtime evidence</span>
        <span class="graph-node ai" style="left:71%;top:64%">Interaction + visual evidence</span>
        <div class="graph-legend">
          <span>━━ Extracted</span>
          <span>┄┄ Inferred · needs review</span>
        </div>
      </div>
    `;
  }

  function renderGraph() {
    return `${graphControls()}${state.graphKind === 'vault' ? renderVaultGraph() : renderAiGraph()}`;
  }

  function renderSources() {
    modalBody.innerHTML = `
      <div class="sources-shell">
        <div class="sources-head">
          <div>
            <h3>Sources · 6 cited files</h3>
            <p>同一 evidence set 的 List / Tree / Graph 投影；不再维护 AI Search 专属浏览器。</p>
          </div>
          <span class="coverage-chip good">6 cited · 0 unsupported sections</span>
        </div>
        <div class="source-toolbar">
          <div class="segmented" aria-label="Source view">
            <button class="${state.sourceMode === 'list' ? 'active' : ''}" type="button" data-source-mode="list">List</button>
            <button class="${state.sourceMode === 'tree' ? 'active' : ''}" type="button" data-source-mode="tree">Tree</button>
            <button class="${state.sourceMode === 'graph' ? 'active' : ''}" type="button" data-source-mode="graph">Graph</button>
          </div>
          <div class="segmented" aria-label="Source density">
            <button class="${state.density === 'compact' ? 'active' : ''}" type="button" data-density="compact">Compact</button>
            <button class="${state.density === 'detailed' ? 'active' : ''}" type="button" data-density="detailed">Detailed</button>
          </div>
          <span class="source-count">6 sources · 4 folders · sorted by citation coverage</span>
        </div>
        <div class="source-content">
          ${state.sourceMode === 'list' ? renderSourceRows() : ''}
          ${state.sourceMode === 'tree' ? renderTree() : ''}
          ${state.sourceMode === 'graph' ? renderGraph() : ''}
        </div>
      </div>
    `;

    renderWorkspaceFooter('sources');
  }

  function renderWorkspaceFooter(active) {
    modalFooter.innerHTML = `
      <div class="workspace-nav" aria-label="Report workspace navigation">
        <button class="${active === 'report' ? 'active' : ''}" type="button" data-action="open-report">Report</button>
        <button class="${active === 'sources' ? 'active' : ''}" type="button" data-action="open-sources">Sources</button>
        <button class="${active === 'activity' ? 'active' : ''}" type="button" data-action="show-activity">Activity</button>
      </div>
      <div class="workspace-actions">
        <button type="button" data-action="save-report">Save to Vault</button>
        <button class="primary" type="button" data-action="open-chat">Open in Chat</button>
      </div>
    `;
  }

  function render() {
    renderRunBar();
    if (state.screen === 'landing') {
      renderLanding();
      return;
    }
    if (state.screen === 'plan') {
      renderPlan();
      return;
    }
    if (state.screen === 'generating') {
      modalBody.innerHTML = renderGeneratingReport();
      renderWorkspaceFooter('report');
      return;
    }
    if (state.screen === 'report') {
      renderFullReport();
      return;
    }
    renderSources();
  }

  function handleAction(action, element) {
    if (action === 'start-analysis') {
      setScreen('plan');
      showToast('Evidence collected · dynamic answer plan ready');
      return;
    }
    if (action === 'resume-analysis' || action === 'open-report') {
      setScreen('report');
      return;
    }
    if (action === 'back-to-landing') {
      setScreen('landing');
      return;
    }
    if (action === 'apply-plan') {
      applyPlanInstruction();
      return;
    }
    if (action === 'generate-report') {
      setScreen('generating');
      showToast('Report 已立即打开；章节在原位生成');
      return;
    }
    if (action === 'open-sources') {
      setScreen('sources');
      return;
    }
    if (action === 'show-activity') {
      setScreen('plan');
      showToast('Activity 是次级证据面，不替代 Report');
      return;
    }
    if (action === 'generate-ai-map') {
      state.aiMapGenerated = true;
      renderSources();
      showToast('AI relationship map generated · inferred edges remain reviewable');
      return;
    }
    if (action === 'toggle-web') {
      const pressed = element.getAttribute('aria-pressed') === 'true';
      element.setAttribute('aria-pressed', String(!pressed));
      element.textContent = pressed ? 'Web off' : 'Web on';
      showToast(pressed ? 'Web context disabled' : 'Web context enabled');
      return;
    }
    if (action === 'scroll-section') {
      const section = document.getElementById(`mock-section-${element.dataset.index}`);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'copy-report') {
      showToast('Mock: report copied');
      return;
    }
    if (action === 'save-report') {
      showToast('Mock: Save to Vault handoff');
      return;
    }
    if (action === 'open-chat') {
      showToast('Mock: report context handed to Chat');
      return;
    }
    if (action === 'toggle-mode') {
      showToast('AI Graph / Vault Intelligence 仍位于统一 AI workspace selector');
    }
  }

  document.addEventListener('click', (event) => {
    const checkpoint = event.target.closest('[data-screen]');
    if (checkpoint) {
      setScreen(checkpoint.dataset.screen, { hold: checkpoint.dataset.screen === 'generating' });
      return;
    }

    const sourceMode = event.target.closest('[data-source-mode]');
    if (sourceMode) {
      state.sourceMode = sourceMode.dataset.sourceMode;
      renderSources();
      return;
    }

    const density = event.target.closest('[data-density]');
    if (density) {
      state.density = density.dataset.density;
      renderSources();
      return;
    }

    const graphKind = event.target.closest('[data-graph-kind]');
    if (graphKind) {
      state.graphKind = graphKind.dataset.graphKind;
      renderSources();
      return;
    }

    const graphScope = event.target.closest('[data-graph-scope]');
    if (graphScope) {
      state.graphScope = graphScope.dataset.graphScope;
      renderSources();
      return;
    }

    const graphPreset = event.target.closest('[data-graph-preset]');
    if (graphPreset) {
      state.graphPreset = graphPreset.dataset.graphPreset;
      renderSources();
      return;
    }

    const action = event.target.closest('[data-action]');
    if (action) {
      handleAction(action.dataset.action, action);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id !== 'semantic-toggle') {
      return;
    }
    state.semantic = event.target.checked;
    renderSources();
  });

  document.getElementById('reset-demo').addEventListener('click', () => {
    clearGenerationTimer();
    Object.assign(state, {
      screen: 'landing',
      sourceMode: 'list',
      density: 'detailed',
      graphKind: 'vault',
      graphScope: 'evidence',
      graphPreset: 'constellation',
      semantic: false,
      aiMapGenerated: false,
      instructionApplied: false,
    });
    render();
    document.getElementById('prototype').scrollIntoView({ behavior: 'smooth' });
    showToast('Mock reset');
  });

  document.getElementById('vault-search-tab').addEventListener('click', () => {
    showToast('Mock focus: AI Search only · Vault Search production surface unchanged');
  });

  document.getElementById('ai-mode-trigger').addEventListener('click', () => {
    handleAction('toggle-mode');
  });

  if (new URLSearchParams(window.location.search).get('embed') === '1') {
    document.body.classList.add('is-embedded');
  }

  render();
})();
