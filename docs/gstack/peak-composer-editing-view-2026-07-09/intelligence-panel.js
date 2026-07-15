(function () {
  "use strict";

  const ICONS = `
    <svg aria-hidden="true" class="icon-sprite" data-intelligence-icons>
      <symbol id="i-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5"></path></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"></path></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path></symbol>
      <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"></path></symbol>
      <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"></circle><circle cx="15" cy="6" r="1.4"></circle><circle cx="9" cy="12" r="1.4"></circle><circle cx="15" cy="12" r="1.4"></circle><circle cx="9" cy="18" r="1.4"></circle><circle cx="15" cy="18" r="1.4"></circle></symbol>
      <symbol id="i-comment" viewBox="0 0 24 24"><path d="M5 5h14v11H8l-3 3z"></path><path d="M8.5 9h7"></path><path d="M8.5 12.5h4.5"></path></symbol>
      <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12"></path><path d="m18 6-12 12"></path></symbol>
      <symbol id="i-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path><path d="M12 7v5l3 2"></path></symbol>
      <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path></symbol>
      <symbol id="i-arrow-up" viewBox="0 0 24 24"><path d="m12 19V5"></path><path d="m5 12 7-7 7 7"></path></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 8.2A7 7 0 0 1 18.6 7"></path><path d="M17.9 15.8A7 7 0 0 1 5.4 17"></path></symbol>
      <symbol id="i-locate" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><circle cx="12" cy="12" r="8"></circle></symbol>
      <symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 14l-4-4 4-4"></path><path d="M5 10h11a4 4 0 0 1 0 8h-1"></path></symbol>
      <symbol id="i-chevron-up" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"></path></symbol>
      <symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path><path d="M9 12h10"></path></symbol>
      <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></symbol>
      <symbol id="i-tag" viewBox="0 0 24 24"><path d="M20 13 13 20 4 11V4h7z"></path><circle cx="8.5" cy="8.5" r="1.2"></circle></symbol>
      <symbol id="i-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.5 6.8-4"></path><path d="m8.6 13.5 6.8 4"></path></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path><path d="m9 12 2 2 4-4"></path></symbol>
      <symbol id="i-language" viewBox="0 0 24 24"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m16 22 4-9 4 9"></path><path d="M17.5 19h5"></path></symbol>
      <symbol id="i-file-text" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path></symbol>
      <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></symbol>
      <symbol id="i-lightbulb" viewBox="0 0 24 24"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.2 14.7A7 7 0 1 1 15.8 14.7c-.6.5-.8 1-.8 1.8H9c0-.8-.2-1.3-.8-1.8z"></path></symbol>
      <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></symbol>
      <symbol id="i-pen" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"></path></symbol>
      <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></symbol>
      <symbol id="i-check-list" viewBox="0 0 24 24"><path d="m3 6 2 2 4-4"></path><path d="M11 6h10"></path><path d="m3 12 2 2 4-4"></path><path d="M11 12h10"></path><path d="m3 18 2 2 4-4"></path><path d="M11 18h10"></path></symbol>
    </svg>`;

  const PANEL = `
    <header class="ai-sidecar-top">
      <div class="ai-presence">
        <span class="ai-presence-mark"><svg><use href="#i-spark"></use></svg></span>
        <div><strong>Intelligence</strong><span>跟随这篇笔记</span></div>
      </div>
      <button class="ai-sidecar-close" type="button" data-intelligence-close title="关闭 Intelligence"><svg><use href="#i-x"></use></svg></button>
    </header>

    <nav class="ai-mode-switch" role="tablist" aria-label="Intelligence 工作模式">
      <button type="button" role="tab" aria-selected="true" class="is-active" data-intelligence-mode="copilot"><svg><use href="#i-comment"></use></svg><span>Copilot</span></button>
      <button type="button" role="tab" aria-selected="false" data-intelligence-mode="ambient"><svg><use href="#i-spark"></use></svg><span>Ambient</span></button>
      <button type="button" role="tab" aria-selected="false" data-intelligence-mode="history"><svg><use href="#i-history"></use></svg><span>History</span><b id="history-count">3</b></button>
    </nav>

    <section class="ai-focus-line" id="ambient-action-card">
      <span class="ai-focus-pulse"></span><span>在看</span><strong id="ambient-title">知识库结构笔记</strong><code id="ambient-kind">markdown</code>
      <code id="ambient-source" hidden>## 知识库结构</code>
    </section>

    <div class="ai-live" id="ambient-live" aria-live="polite"><svg><use href="#i-check"></use></svg><span>已同步当前块</span></div>

    <section class="ai-mode-view" data-ambient-panel="copilot">
      <div class="ai-copilot">
        <div class="ai-copilot-stage">
          <div class="ai-conversation" id="copilot-thread">
            <div class="ai-copilot-hero">
              <span class="ai-copilot-cursor"><svg><use href="#i-spark"></use></svg></span>
              <div><strong>我已读到当前内容</strong><p>直接描述目标，结果会回到正文原位供你检查。</p></div>
            </div>
          </div>
          <section class="ai-capability-browser" id="copilot-capability-browser" hidden aria-label="Copilot 全部能力">
            <header class="ai-subview-head"><button type="button" data-copilot-view="thread" title="返回对话"><svg><use href="#i-arrow-left"></use></svg></button><div><strong>全部能力</strong><span>按当前文档状态排序，不再打开独立弹窗</span></div></header>
            <label class="ai-capability-search"><svg><use href="#i-search"></use></svg><input id="copilot-capability-search" type="search" placeholder="搜索能力、结果或来源" autocomplete="off" /></label>
            <div class="ai-capability-list" id="copilot-capability-list"></div>
          </section>
          <section class="ai-capability-runner" id="copilot-capability-runner" hidden aria-live="polite"></section>
        </div>
        <div class="ai-composer-dock">
          <div class="ai-quick-thoughts" aria-label="建议指令">
            <button type="button" data-copilot-suggestion="rewrite">理清这段</button>
            <button type="button" data-copilot-suggestion="evidence">补上依据</button>
            <button type="button" data-copilot-suggestion="visual">把它画出来</button>
          </div>
          <div class="ai-composer">
            <div class="ai-composer-context"><svg><use href="#i-link"></use></svg><span id="copilot-context">当前块 + 邻近内容</span><span class="ai-active-capability" id="copilot-active-capability" hidden></span></div>
            <textarea id="copilot-input" rows="2" placeholder="描述要改什么，或从能力库开始…"></textarea>
            <div class="ai-composer-foot">
              <div><button type="button" data-copilot-context title="添加上下文"><svg><use href="#i-plus"></use></svg></button><button type="button" class="ai-capability-trigger" data-copilot-capabilities aria-expanded="false"><svg><use href="#i-grid"></use></svg><span>能力</span></button></div>
              <div><button type="button" class="ai-run-mode" title="运行设置">自动</button><button type="button" data-copilot-send aria-label="发送"><svg><use href="#i-arrow-up"></use></svg></button></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="ai-mode-view" data-ambient-panel="ambient" hidden>
      <div class="ai-ambient-flow">
        <div class="ai-work-intent" id="ambient-theme">
          <div><span><i></i>Current Work State</span><button type="button" data-ambient-action="theme-lock" title="锁定工作主题"><svg><use href="#i-lock"></use></svg></button></div>
          <strong>把分散的知识管理判断整理成可验证的编辑工作流</strong>
          <p>从当前标题、最近编辑与打开文件中推断 · 置信度 82%</p>
        </div>
        <section class="ai-recent-trace">
          <header><span>Recent Work Trace</span><small>最近 18 分钟</small></header>
          <ol><li><time>14:24</time><span><strong>打开 Base 使用判断</strong><small>寻找结构化输出的依据</small></span></li><li><time>14:29</time><span><strong>把列表转成表格</strong><small>从分类判断转向可执行流程</small></span></li><li><time>14:32</time><span><strong>聚焦 Excalidraw 预览</strong><small>需要把判断画成关系图</small></span></li></ol>
        </section>
        <div class="ai-now-line"><span><i></i>Related Push · 此刻值得看</span><button type="button" data-ambient-action="refresh" title="重新感知"><svg><use href="#i-refresh"></use></svg></button></div>
        <div class="ai-push-stream" id="ambient-push-list" aria-live="polite"></div>
        <details class="ai-disclosure">
          <summary><span>为什么是现在</span><small>3 个信号</small></summary>
          <div class="ai-signal-trace">
            <p><span>主题</span><b>可验证输出</b><b>块级编辑</b></p>
            <ol><li><time>14:24</time>打开 Base 使用判断</li><li><time>14:29</time>把列表转成表格</li><li><time>14:32</time>聚焦 Excalidraw 预览</li></ol>
          </div>
        </details>
        <details class="ai-disclosure ai-thought-trace" open>
          <summary><span>Session Thought Trace</span><small>2 个未落位</small></summary>
          <div class="ai-loose-thought"><span>原生文件的 AI 编辑也应该保留增量过程。</span><button type="button" data-copilot-suggestion="organize">带到 Copilot</button></div>
          <div class="ai-loose-thought"><span>表格与公式的 review 统一使用上下对比。</span><button type="button" data-copilot-suggestion="organize">带到 Copilot</button></div>
        </details>
      </div>
    </section>

    <section class="ai-mode-view" data-ambient-panel="history" hidden>
      <div class="ai-history-flow">
        <div class="ai-history-intro"><span>本次协作</span><strong>每次写入都有范围，也都能回退</strong><p>时间轴同时显示改动对象、行数与增删量。</p></div>
        <div class="ai-timeline" id="ambient-rollback"></div>
        <div class="ai-history-detail" id="history-diff-detail" aria-live="polite"><strong>选择一次写入</strong><p>前后版本会在这里展开。</p></div>
        <small class="ai-history-foot"><svg><use href="#i-check"></use></svg>Vault 会话已保存 · 可选写入 Git</small>
      </div>
    </section>`;

  function ensureIcons() {
    if (document.getElementById("i-spark")) return;
    document.body.insertAdjacentHTML("afterbegin", ICONS);
  }

  function mount(target) {
    const root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root || root.dataset.intelligenceMounted === "true") return root;
    ensureIcons();
    root.classList.add("ambient-panel", "intelligence-panel", "ai-sidecar");
    root.id ||= "ambient-panel";
    root.setAttribute("aria-label", "Intelligence");
    root.innerHTML = PANEL;
    root.dataset.intelligenceMounted = "true";
    return root;
  }

  function mountAll() {
    document.querySelectorAll("[data-intelligence-root]").forEach(mount);
  }

  window.PeakIntelligencePanel = Object.freeze({ mount, mountAll });
  mountAll();
})();
